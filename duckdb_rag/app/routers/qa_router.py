from fastapi import APIRouter, HTTPException, status
from app.engine.cache_manager import cache_manager
from app.engine.duckdb_executor import DuckDBQueryRunner
from app.engine.ollama_client import ollama_engine
from app.engine.forecasting_service import forecast_service
from typing import List
import asyncio
from app.schemas.report_schema import (
    CreateSessionRequest,
    CreateSessionResponse,
    DeleteSessionResponse,
    ListSessionsResponse,
    QAQueryRequest,
    QAQueryResponse,
    VectorSearchRequest,
    VectorSearchResponse,
    ForecastInputItem, 
    ForecastOutputItem,
    ForecastRequest,
    ForecastResponse,
)


router = APIRouter(prefix="/api/v1/report", tags=["Report Analytics"])

@router.post("/session", response_model=CreateSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_data_session(payload: CreateSessionRequest):
    if not payload.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Dataset payload cannot be empty."
        )

    # Fast path: Save payload directly to cache without compute overhead
    session_id = cache_manager.create_session(
        report_id=payload.report_id,
        columns=payload.columns,
        data=payload.data
    )
    
    return CreateSessionResponse(
        session_id=session_id,
        row_count=len(payload.data),
        vectorized=False  # Embeddings deferred to on-demand vector search
    )

# @router.post("/vector-search", response_model=VectorSearchResponse, status_code=status.HTTP_200_OK)
# async def vector_search_session(payload: VectorSearchRequest):
#     session_data = cache_manager.get_session(payload.session_id)
#     if not session_data:
#         raise HTTPException(
#             status_code=status.HTTP_404_NOT_FOUND,
#             detail=f"Invalid session_id '{payload.session_id}'."
#         )

#     try:
#         # 1. LLM identifies target base column (e.g., 'Vkgrp')
#         base_target_col = ollama_engine.detect_vector_target_column(
#             query=payload.query,
#             columns=session_data.columns,
#             sample_data=session_data.data[:5] if session_data.data else None
#         )

#         embed_col_name = f"{base_target_col}_embedding"
#         first_row = session_data.data[0]

#         # 2. Lazy Compute: Vectorize ONLY the targeted column if not previously computed
#         if embed_col_name not in first_row or first_row[embed_col_name] is None:
#             # Extract unique string values for the selected target column
#             unique_values = {
#                 str(row[base_target_col]) 
#                 for row in session_data.data 
#                 if base_target_col in row and row[base_target_col] is not None and str(row[base_target_col]).strip()
#             }
            
#             unique_val_list = list(unique_values)
            
#             # Concurrently generate embeddings for unique values of this column only
#             embeddings = await ollama_engine.batch_embed_texts(unique_val_list, max_concurrent=20)
#             val_to_embed_map = dict(zip(unique_val_list, embeddings))

#             # Populate target column embeddings into session data in-memory
#             for row in session_data.data:
#                 raw_val = str(row.get(base_target_col, ""))
#                 row[embed_col_name] = val_to_embed_map.get(raw_val, None)

#             # Update cache with enriched dataset for fast future hits
#             cache_manager.update_session_data(payload.session_id, session_data.data)

#         # 3. Generate query vector and execute search via DuckDB
#         query_vector = await ollama_engine.get_embedding_async(payload.query, is_query=True)

#         search_results = DuckDBQueryRunner.vector_search(
#             data=session_data.data,
#             vector_column=embed_col_name,
#             query_vector=query_vector,
#             top_k=payload.top_k
#         )

#         return VectorSearchResponse(
#             query=payload.query,
#             target_column=base_target_col,
#             results=search_results,
#             result_count=len(search_results)
#         )
#     except Exception as e:
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail=f"Vector search failure: {str(e)}"
#         )

@router.get("/session/all", response_model=ListSessionsResponse, status_code=status.HTTP_200_OK)
async def list_active_sessions():
    active_sessions = cache_manager.list_all_sessions()
    return ListSessionsResponse(
        total_sessions=len(active_sessions),
        sessions=active_sessions
    )

@router.delete("/session/{session_id}", response_model=DeleteSessionResponse, status_code=status.HTTP_200_OK)
async def delete_data_session(session_id: str):
    success = cache_manager.delete_session(session_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session ID '{session_id}' not found or already deleted."
        )
    
    return DeleteSessionResponse(
        session_id=session_id,
        message="Session dataset permanently removed from memory."
    )

@router.post("/qa", response_model=QAQueryResponse, status_code=status.HTTP_200_OK)
async def query_report_session(payload: QAQueryRequest):
    session_data = cache_manager.get_session(payload.session_id)
    if not session_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invalid session_id '{payload.session_id}'."
        )

    table_name = "active_report_data"
    
    try:
        sample_rows = session_data.data[:10] if session_data.data else None

        sql_query = ollama_engine.generate_sql(
            user_query=payload.query,
            table_name=table_name,
            columns=session_data.columns,
            sample_data=sample_rows
        )

        if not sql_query.lower().strip().startswith("select"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Generated SQL violates execution policy (Only SELECT allowed)."
            )

        exec_results = DuckDBQueryRunner.execute(
            data=session_data.data,
            sql_query=sql_query,
            table_name=table_name
        )

        synthesized_answer = ollama_engine.synthesize_answer(
            query=payload.query,
            sql=sql_query,
            results=exec_results
        )

        execution_field = None
        if len(exec_results) > 1:
            execution_field = ollama_engine.generate_field_descriptions(
                execution_data=exec_results,
                columns_meta=session_data.columns
            )

        return QAQueryResponse(
            answer=synthesized_answer,
            generated_sql=sql_query,
            execution_data=exec_results,
            execution_field=execution_field,
            row_count=len(exec_results)
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Execution pipeline failure: {str(e)}"
        )

@router.post(
    "/getForecast", 
    response_model=ForecastResponse, 
    status_code=status.HTTP_200_OK,
    summary="Generate Time-Series Forecast with Justification"
)
async def get_forecast(payload: ForecastRequest):
    if len(payload.data) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Time series input array requires at least 2 data points."
        )

    raw_data = [item.model_dump() for item in payload.data]
    forecast_results, justification = forecast_service.run_ensemble_forecast(
        data=raw_data, 
        forecast_horizon=payload.forecast_horizon,
        freq=payload.freq
    )
    
    return ForecastResponse(
        justification=justification,
        forecasts=forecast_results
    )