import asyncio
import json
import re
from typing import Any, Dict, List, Optional, Set
import httpx
import ollama
from fastapi import HTTPException, status

from app.config import settings
from app.schemas.report_schema import ColumnMetaData


class SchemaPruner:
    """
    Filters the schema before sending it to Ollama to prevent 'token-attractor'
    hallucination loops across visually similar column names (e.g., 'Sales Org' vs 'Sales Office').
    """
    @staticmethod
    def prune_columns(user_query: str, columns: List[ColumnMetaData]) -> List[ColumnMetaData]:
        query_lower = user_query.lower()
        matched_column_names: Set[str] = set()
        
        # Sort columns by phrase length descending to match full phrases first
        sorted_cols = sorted(columns, key=lambda c: len(c.name), reverse=True)

        for col in sorted_cols:
            col_clean = col.name.lower().replace("_", " ")
            if col_clean in query_lower:
                matched_column_names.add(col.name)

        pruned: List[ColumnMetaData] = []
        for col in columns:
            col_clean = col.name.lower().replace("_", " ")
            has_conflict = False
            
            for matched_name in matched_column_names:
                matched_clean = matched_name.lower().replace("_", " ")
                # Check for overlapping prefix conflict
                if (col_clean != matched_clean and 
                    col_clean.split()[0] == matched_clean.split()[0] and 
                    col_clean not in query_lower):
                    has_conflict = True
                    break

            if not has_conflict:
                pruned.append(col)

        return pruned if pruned else columns


class OllamaEngine:
    def __init__(self) -> None:
        self.client = ollama.Client(host=settings.OLLAMA_HOST)
        self.async_client = httpx.AsyncClient(base_url=settings.OLLAMA_HOST, timeout=60.0)

    async def get_embedding_async(
        self, 
        text: str, 
        is_query: bool = False, 
        semaphore: Optional[asyncio.Semaphore] = None
    ) -> List[float]:
        """
        Asynchronously fetches vector embedding for a given text from Ollama.
        """
        prefix = "search_query: " if is_query else "search_document: "
        formatted_text = f"{prefix}{text}"
        
        payload = {
            "model": settings.OLLAMA_EMBEDDING_MODEL,
            "prompt": formatted_text
        }

        async def _make_request():
            response = await self.async_client.post("/api/embeddings", json=payload)
            response.raise_for_status()
            return response.json()["embedding"]

        if semaphore:
            async with semaphore:
                return await _make_request()
        return await _make_request()

    async def batch_embed_texts(self, texts: List[str], max_concurrent: int = 20) -> List[List[float]]:
        """
        Embeds a list of texts concurrently using an asyncio semaphore limit.
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        tasks = [
            self.get_embedding_async(text, is_query=False, semaphore=semaphore) 
            for text in texts
        ]
        return await asyncio.gather(*tasks)

    def detect_vector_target_column(
        self, 
        query: str, 
        columns: List[ColumnMetaData], 
        sample_data: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """
        Scans available columns in session metadata/sample data and selects 
        the best base column name for on-demand vector embedding.
        """
        if not sample_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session dataset contains no active data records."
            )

        first_row = sample_data[0]
        base_columns = [
            c.name for c in columns 
            if c.name in first_row and not c.name.endswith("_embedding")
        ]

        if not base_columns:
            base_columns = [k for k in first_row.keys() if not k.endswith("_embedding")]

        if not base_columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid search columns found in dataset session."
            )

        # 1. Deterministic direct substring match
        query_lower = query.lower()
        for col_name in base_columns:
            clean_col = col_name.lower().replace("_", " ")
            if clean_col in query_lower:
                return col_name

        # 2. LLM Match across all available base columns
        base_cols_meta = [
            f"- {c.name}" + (f" ({c.description})" if c.description else "")
            for c in columns if c.name in base_columns
        ]

        prompt = f"""
You are an expert database schema analyzer.
User Query: "{query}"

Available Target Columns:
{chr(10).join(base_cols_meta)}

Select the SINGLE most relevant column name from the list above to search for semantic similarity.
Output valid JSON with key 'target_column'.
"""

        json_schema = {
            "type": "object",
            "properties": {
                "target_column": {"type": "string"}
            },
            "required": ["target_column"]
        }

        try:
            response = self.client.chat(
                model=settings.OLLAMA_SQL_MODEL,
                messages=[{"role": "user", "content": prompt}],
                format=json_schema,
                options={"temperature": 0.0}
            )
            parsed = json.loads(response['message']['content'])
            selected = parsed.get("target_column", "").strip()

            if selected in base_columns:
                return selected
        except Exception:
            pass

        return base_columns[0]

    def _build_schema_def(self, columns: List[ColumnMetaData]) -> str:
        return ",\n".join([f"  \"{col.name}\" {col.data_type}" for col in columns])

    def generate_sql(
        self, 
        user_query: str, 
        table_name: str, 
        columns: List[ColumnMetaData],
        sample_data: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """
        Generates DuckDB SQL using schema pruning and programmatic regex auto-fixing.
        """
        effective_columns = SchemaPruner.prune_columns(user_query, columns)
        schema_def = self._build_schema_def(effective_columns)

        system_prompt = f"""
You are a deterministic SQL generator. Generate a DuckDB SQL query.

TABLE NAME: {table_name}
STRICT COLUMNS ALLOWED:
(
{schema_def}
)

RULES:
1. ONLY use column names explicitly listed in the schema above.
2. Surround all column names in double quotes.
3. Output ONLY JSON with key 'sql_query'.
"""

        json_schema = {
            "type": "object",
            "properties": {
                "sql_query": {"type": "string"}
            },
            "required": ["sql_query"]
        }

        response = self.client.chat(
            model=settings.OLLAMA_SQL_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"User Query: {user_query}"}
            ],
            format=json_schema,
            options={"temperature": 0.0}
        )

        parsed_content = json.loads(response['message']['content'])
        sql = parsed_content.get("sql_query", "").strip()

        # Post-Generation Auto-Fixer: Replace pruned/hallucinated column names
        for orig_col in columns:
            if orig_col not in effective_columns:
                for target_col in effective_columns:
                    if target_col.name.lower().split()[0] == orig_col.name.lower().split()[0]:
                        pattern = re.compile(re.escape(f'"{orig_col.name}"'), re.IGNORECASE)
                        sql = pattern.sub(f'"{target_col.name}"', sql)
                        pattern_no_quote = re.compile(r'\b' + re.escape(orig_col.name) + r'\b', re.IGNORECASE)
                        sql = pattern_no_quote.sub(f'"{target_col.name}"', sql)

        return sql

    def generate_field_descriptions(
        self, 
        execution_data: List[Dict[str, Any]], 
        columns_meta: List[ColumnMetaData]
    ) -> Dict[str, str]:
        """
        Generates user-friendly explanations for attributes present in execution_data when row_count > 1.
        """
        if not execution_data:
            return {}

        sample_row = execution_data[0]
        result_fields = list(sample_row.keys())

        meta_lookup = {col.name: col.description for col in columns_meta if col.description}
        field_descriptions = {}
        unexplained_fields = []

        for field in result_fields:
            if field in meta_lookup:
                field_descriptions[field] = meta_lookup[field]
            else:
                unexplained_fields.append(field)

        if unexplained_fields:
            prompt = f"""
Given the output fields from a database query: {unexplained_fields}
Provide a simple, user-friendly description for each field name.

Respond strictly in valid JSON format mapping field_name to description string.
Example:
{{
  "total_sales": "The combined monetary amount of all sales transactions."
}}
"""

            json_schema = {
                "type": "object",
                "additionalProperties": {"type": "string"}
            }

            try:
                response = self.client.chat(
                    model=settings.OLLAMA_SYNTHESIS_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    format=json_schema,
                    options={"temperature": 0.0}
                )
                llm_descriptions = json.loads(response['message']['content'])
                field_descriptions.update(llm_descriptions)
            except Exception:
                for field in unexplained_fields:
                    field_descriptions[field] = f"Calculated or result attribute for {field}."

        return field_descriptions

    def synthesize_answer(self, query: str, sql: str, results: List[dict]) -> str:
        """
        Synthesizes a final human-readable answer from user question and SQL output.
        """
        prompt = f"""
User Question: {query}
SQL Executed: {sql}
Calculated Output: {results}

Formulate a clear, direct, and professional answer based solely on the provided output.
"""

        response = self.client.chat(
            model=settings.OLLAMA_SYNTHESIS_MODEL,
            messages=[{"role": "user", "content": prompt}],
            options={"temperature": 0.1}
        )

        return response['message']['content'].strip()


ollama_engine = OllamaEngine()