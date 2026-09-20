from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field, AliasChoices


class ColumnMetaData(BaseModel):
    name: str = Field(..., example="sales_amount")
    data_type: str = Field(..., example="FLOAT")
    description: Optional[str] = Field(
        None, example="Revenue generated per transaction"
    )


class CreateSessionRequest(BaseModel):
    report_id: str = Field(..., example="rep_sales_2026_q3")
    columns: List[ColumnMetaData]
    data: List[Dict[str, Any]]
    vectorize_target_column: Optional[str] = Field(
        None, description="Column name to generate embeddings for automatically."
    )


class CreateSessionResponse(BaseModel):
    session_id: str
    row_count: int
    vectorized: bool


class SessionInfo(BaseModel):
    session_id: str
    report_id: str
    row_count: int
    column_count: int
    created_at: str


class ListSessionsResponse(BaseModel):
    total_sessions: int
    sessions: List[SessionInfo]


class DeleteSessionResponse(BaseModel):
    session_id: str
    message: str


class QAQueryRequest(BaseModel):
    session_id: str = Field(..., example="d3b07384-d113-46e2-a0e2-8bc8e6473e3e")
    query: str = Field(
        ..., example="What is the total sales amount for Sales Office SO_NORTH?"
    )


class QAQueryResponse(BaseModel):
    answer: str
    generated_sql: str
    execution_data: List[Dict[str, Any]]
    execution_field: Optional[Dict[str, str]] = Field(
        None,
        description="User-friendly descriptions for each field present in execution_data when row_count > 1.",
    )
    row_count: int


class VectorSearchRequest(BaseModel):
    session_id: str
    query: str
    top_k: int = Field(default=5, ge=1, le=100)


class VectorSearchResponse(BaseModel):
    query: str
    target_column: str
    results: List[Dict[str, Any]]
    result_count: int


class ForecastInputItem(BaseModel):
    ds: str = Field(
        ...,
        description="Time string or date representation",
        validation_alias=AliasChoices("ds", "date"),
    )
    y: Union[int, float] = Field(
        ...,
        description="Numeric time-series value",
        validation_alias=AliasChoices("y", "value"),
    )


class ForecastRequest(BaseModel):
    data: List[ForecastInputItem] = Field(
        ..., description="Time series input data array"
    )
    forecast_horizon: Optional[int] = Field(
        default=1, ge=1, le=365, description="Number of future time steps to forecast"
    )
    freq: Optional[str] = Field(
        default=None,
        description="Resampling frequency (e.g., 'D' for daily, 'ME' for monthly end). Inferred automatically if null.",
    )


class ForecastOutputItem(BaseModel):
    ds: str
    final_forecast: float
    auto_arima_forecast: float
    auto_ets_forecast: float


class ForecastResponse(BaseModel):
    justification: str = Field(
        ...,
        description="Explanation of model selection, data preprocessing, and confidence notes.",
    )
    forecasts: List[ForecastOutputItem]
