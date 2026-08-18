import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.api.deps import get_db
from app.core.database import Base
from app.models.dataset import Dataset
from app.models.profile import Profile
import json

# Setup test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_insight_ai_cleaner.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    if get_db in app.dependency_overrides:
        del app.dependency_overrides[get_db]
    import os
    if os.path.exists("./test_insight_ai_cleaner.db"):
        os.remove("./test_insight_ai_cleaner.db")

client = TestClient(app)

def test_clean_flow():
    # 1. Seed mock CSV
    # age: has missing value in 3rd row, outlier (500) in 5th row.
    # income: values 100, 200, 300, 100.
    # gender: 'M', 'F', 'M', 'M'
    file_content = (
        b"age,income,gender\n"
        b"20,100,M\n"
        b"30,200,F\n"
        b",300,M\n" # age missing
        b"20,100,M\n" # Duplicate row
        b"500,150,F\n" # age outlier
    )
    
    upload_resp = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("clean_mock.csv", file_content, "text/csv")}
    )
    assert upload_resp.status_code == 201
    dataset_id = upload_resp.json()["id"]

    # 2. Apply cleaning pipeline
    payload = {
        "remove_duplicates": True,
        "impute_missing": [
            {"column": "age", "strategy": "median"}
        ],
        "handle_outliers": [
            {"column": "age", "method": "iqr"}
        ],
        "scaling": [
            {"column": "income", "method": "minmax"}
        ],
        "encoding": [
            {"column": "gender", "method": "label"}
        ]
    }
    
    clean_resp = client.post(
        f"/api/v1/datasets/{dataset_id}/clean",
        json=payload
    )
    assert clean_resp.status_code == 201
    cleaned_data = clean_resp.json()
    
    # Verify outputs
    assert cleaned_data["name"] == "clean_mock_cleaned.csv"
    assert cleaned_data["status"] == "uploaded"
    
    # Operations trace verification:
    # Starting rows: 5
    # 1. Drop duplicates: drops 4th row -> 4 rows remaining
    # 2. Impute age with median (25.0): fills 3rd row -> 4 rows (age is filled)
    # 3. Handle outliers on age: 500 is way above 1.5x IQR (IQR is 30-20=10, upper=30+15=45). 
    #    Drops 5th row (500) -> 3 rows remaining!
    # Expected output size: 3 rows, 3 columns
    assert cleaned_data["row_count"] == 3
    assert cleaned_data["column_count"] == 3

    # Cleanup original and cleaned datasets
    client.delete(f"/api/v1/datasets/{dataset_id}")
    client.delete(f"/api/v1/datasets/{cleaned_data['id']}")
