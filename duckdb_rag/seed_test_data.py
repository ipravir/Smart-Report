import random
import uuid
from datetime import datetime, timedelta
import json
import requests

API_URL = "http://localhost:8123/api/v1/report"

# 1. Define Column Schema covering 10 distinct data types
columns_schema = [
    {"name": "order_id", "data_type": "VARCHAR", "description": "Unique UUID identifier"},
    {"name": "customer_id", "data_type": "BIGINT", "description": "Numeric customer sequence ID"},
    {"name": "customer_name", "data_type": "VARCHAR", "description": "Full name of the customer"},
    {"name": "is_vip", "data_type": "BOOLEAN", "description": "VIP membership status"},
    {"name": "transaction_date", "data_type": "TIMESTAMP", "description": "ISO timestamp of order"},
    {"name": "revenue", "data_type": "DOUBLE", "description": "Total revenue generated"},
    {"name": "tax_rate", "data_type": "FLOAT", "description": "Decimal tax percentage"},
    {"name": "items_purchased", "data_type": "INTEGER", "description": "Quantity of items"},
    {"name": "tags", "data_type": "VARCHAR[]", "description": "Array of string categories"},
    {"name": "metadata", "data_type": "JSON", "description": "Nested JSON metadata"}
]

# 2. Generate 60 diverse dataset records
categories_pool = [["express", "online"], ["in-store"], ["wholesale", "priority"], ["online"]]
cities = ["New York", "London", "Tokyo", "Berlin", "Paris", "Sydney"]

dataset = []
base_time = datetime(2026, 1, 1, 10, 0, 0)

for i in range(1, 61):
    record = {
        "order_id": str(uuid.uuid4()),
        "customer_id": 1000 + i,
        "customer_name": f"Customer_{i}",
        "is_vip": i % 3 == 0,
        "transaction_date": (base_time + timedelta(days=i, hours=random.randint(1, 12))).isoformat(),
        "revenue": round(random.uniform(50.0, 2500.75), 2),
        "tax_rate": round(random.choice([0.05, 0.08, 0.12, 0.18]), 2),
        "items_purchased": random.randint(1, 15),
        "tags": random.choice(categories_pool),
        # Null handling test for specific rows
        "metadata": json.dumps({"city": random.choice(cities), "device": "mobile" if i % 2 == 0 else "desktop"}) if i % 5 != 0 else None
    }
    dataset.append(record)


def run_e2e_test():
    print(f"--- Step 1: Uploading {len(dataset)} records across 10 fields ---")
    session_payload = {
        "report_id": "rep_comprehensive_test_2026",
        "columns": columns_schema,
        "data": dataset
    }

    try:
        # Step A: Create Data Session
        res = requests.post(f"{API_URL}/session", json=session_payload, timeout=30)
        print(f"Session Status Code: {res.status_code}")
        
        if res.status_code != 201:
            print(f"Error creating session: {res.text}")
            return

        session_id = res.json()["session_id"]
        print(f"Created Session ID: {session_id}\n")

        # Step B: Run QA Query over the session
        test_query = "What is the total revenue and average items purchased for VIP customers?"
        print(f"--- Step 2: Querying Session with Prompt: '{test_query}' ---")
        
        qa_payload = {
            "session_id": session_id,
            "query": test_query
        }

        qa_res = requests.post(f"{API_URL}/qa", json=qa_payload, timeout=60)
        print(f"QA Status Code: {qa_res.status_code}")

        if qa_res.status_code == 200:
            output = qa_res.json()
            print("\n=== RESPONSE OUTPUT ===")
            print(f"Answer: {output['answer']}\n")
            print(f"Generated SQL: {output['generated_sql']}\n")
            print(f"Execution Output: {json.dumps(output['execution_data'], indent=2)}")
        else:
            print(f"QA Error: {qa_res.text}")

    except requests.exceptions.RequestException as e:
        print(f"Failed to communicate with service: {e}")

if __name__ == "__main__":
    run_e2e_test()