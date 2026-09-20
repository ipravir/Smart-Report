from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_full_report_qa_workflow():
    # Generate mock report dataset with 5,000 records
    mock_dataset = [
        {
            "transaction_id": f"tx_{i}",
            "region": "North" if i % 2 == 0 else "South",
            "category": "Electronics" if i % 3 == 0 else "Furniture",
            "sales_amount": float(100 + (i % 50)),
            "units": i % 10 + 1
        }
        for i in range(1, 5001)
    ]

    session_payload = {
        "report_id": "rep_test_5k",
        "columns": [
            {"name": "transaction_id", "data_type": "VARCHAR"},
            {"name": "region", "data_type": "VARCHAR"},
            {"name": "category", "data_type": "VARCHAR"},
            {"name": "sales_amount", "data_type": "FLOAT"},
            {"name": "units", "data_type": "INTEGER"}
        ],
        "data": mock_dataset
    }

    # Step 1: Initialize Data Session
    session_response = client.post("/api/v1/report/session", json=session_payload)
    assert session_response.status_code == 201
    session_id = session_response.json()["session_id"]
    assert session_response.json()["row_count"] == 5000

    # Step 2: Query the session using session_id
    qa_payload = {
        "session_id": session_id,
        "query": "What is the total sales amount for the North region?"
    }

    qa_response = client.post("/api/v1/report/qa", json=qa_payload)
    assert qa_response.status_code == 200
    res_data = qa_response.json()
    
    assert "answer" in res_data
    assert "SELECT" in res_data["generated_sql"].upper()
    assert len(res_data["execution_data"]) > 0