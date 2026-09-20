import logging
from typing import Any, Dict, List
import duckdb
import numpy as np
import pandas as pd
from app.config import settings
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

class DuckDBQueryRunner:
    @staticmethod
    def execute(data: List[Dict[str, Any]], sql_query: str, table_name: str = "active_report_data") -> List[Dict[str, Any]]:
        """
        Executes raw SQL queries against the session dataset.
        Preserved existing production logic for /api/v1/report/qa.
        """
        df = pd.DataFrame(data)

        for col in df.columns:
            if df[col].dtype == 'object':
                try:
                    sample_val = df[col].dropna().iloc[0] if not df[col].dropna().empty else None
                    if isinstance(sample_val, str) and ("T" in sample_val or "-" in sample_val or "/Date(" in sample_val):
                        df[col] = pd.to_datetime(df[col], errors='ignore')
                except Exception:
                    pass

        con = duckdb.connect(database=":memory:")
        try:
            con.register(table_name, df)
            cursor = con.execute(sql_query)
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            return [dict(zip(columns, row)) for row in rows]
        finally:
            con.close()

    @staticmethod
    def vector_search(
        data: List[Dict[str, Any]],
        vector_column: str,
        query_vector: List[float],
        top_k: int = 5,
        table_name: str = "active_report_data"
    ) -> List[Dict[str, Any]]:
        """
        Performs vector similarity search using HNSW indexing and cosine distance.
        Includes pre-validation safeguards to avoid DuckDB runtime cast errors.
        """
        if not data:
            return []

        df = pd.DataFrame(data)

        # 1. Check if vector_column exists in the DataFrame
        if vector_column not in df.columns:
            # Check for non-suffixed base column fallback
            base_col = vector_column.replace("_embedding", "")
            if base_col in df.columns and f"{base_col}_embedding" in df.columns:
                vector_column = f"{base_col}_embedding"
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Target column '{vector_column}' not found in current dataset session."
                )

        # 2. Ensure vector_column values are valid numerical lists/arrays
        sample_vec = df[vector_column].dropna().iloc[0] if not df[vector_column].dropna().empty else None
        if sample_vec is None or not isinstance(sample_vec, (list, np.ndarray)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Column '{vector_column}' does not contain valid embeddings. Ensure the session was created with vectorize_target_column."
            )

        dim = len(query_vector) if query_vector else settings.EMBEDDING_DIMENSION

        con = duckdb.connect(database=":memory:")
        try:
            # Try loading DuckDB Vector Similarity Search (VSS) extension
            try:
                con.execute("INSTALL vss;")
                con.execute("LOAD vss;")
                has_vss = True
            except Exception as e:
                logger.warning(f"Failed to load DuckDB VSS extension: {e}. Falling back to native cosine distance.")
                has_vss = False

            con.register(f"{table_name}_raw", df)

            # Cast target embedding column explicitly to fixed-size FLOAT array
            con.execute(
                f'CREATE TABLE {table_name} AS '
                f'SELECT * EXCLUDE ("{vector_column}"), '
                f'"{vector_column}"::FLOAT[{dim}] AS "{vector_column}" '
                f'FROM {table_name}_raw;'
            )

            # Build HNSW index if VSS is available
            if has_vss:
                try:
                    con.execute(f'CREATE INDEX hnsw_idx ON {table_name} USING HNSW ("{vector_column}") WITH (metric = \'cosine\');')
                except Exception as e:
                    logger.warning(f"HNSW index creation skipped: {e}")

            sql = f"""
                SELECT *, array_cosine_distance("{vector_column}", ?::FLOAT[{dim}]) AS distance
                FROM {table_name}
                WHERE "{vector_column}" IS NOT NULL
                ORDER BY distance ASC
                LIMIT ?;
            """

            cursor = con.execute(sql, [query_vector, top_k])
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()

            return [dict(zip(columns, row)) for row in rows]

        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"DuckDB vector search execution failed: {str(e)}"
            )
        finally:
            con.close()