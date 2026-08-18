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
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_insight_ai_reports.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    if get_db in app.dependency_overrides:
        del app.dependency_overrides[get_db]
    import os
    if os.path.exists("./test_insight_ai_reports.db"):
        os.remove("./test_insight_ai_reports.db")

client = TestClient(app)

def test_report_flow():
    # 1. Seed mock CSV containing duplicates and missing cells
    file_content = (
        b"age,income\n"
        b"20,100\n"
        b"30,200\n"
        b",300\n" # Missing value
        b"20,100\n" # Duplicate row
    )
    
    upload_resp = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("reports_mock.csv", file_content, "text/csv")}
    )
    assert upload_resp.status_code == 201
    dataset_id = upload_resp.json()["id"]

    # 2. Get report (which triggers profiling automatically if missing!)
    report_resp = client.get(f"/api/v1/datasets/{dataset_id}/report")
    assert report_resp.status_code == 200
    report_data = report_resp.json()

    # Validate schema fields
    assert "dataset" in report_data
    assert "profile" in report_data
    assert "correlations" in report_data
    assert "quality_alerts" in report_data
    assert "recommendations" in report_data

    # Check alert generators
    # 1 duplicate row, 1 missing cell in age column
    assert any("duplicate" in alert.lower() for alert in report_data["quality_alerts"])
    assert any("age" in alert.lower() and "missing" in alert.lower() for alert in report_data["quality_alerts"])

    # Check recommendation generators
    assert any("duplicate" in rec.lower() for rec in report_data["recommendations"])
    assert any("impute" in rec.lower() and "age" in rec.lower() for rec in report_data["recommendations"])

    # Cleanup
    client.delete(f"/api/v1/datasets/{dataset_id}")
