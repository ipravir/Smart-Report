FROM python:3.11-slim

WORKDIR /app

# Install system dependencies needed for C compilation (used by DuckDB / Pandas)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY ./app ./app

EXPOSE 8000

# Run Uvicorn with single worker to guarantee in-memory manual session retention
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]