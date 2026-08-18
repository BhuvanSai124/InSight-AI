import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.api.deps import get_db
from app.core.database import Base
from app.models.dataset import Dataset
from app.models.profile import Profile
from app.models.ml_model import MlModel
from app.models.document import Document
import json

# Setup test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_insight_ai_coordinator.db"
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
    if os.path.exists("./test_insight_ai_coordinator.db"):
        os.remove("./test_insight_ai_coordinator.db")

client = TestClient(app)

def test_collaboration_flow():
    # 1. Seed mock CSV
    file_content = (
        b"x1,x2,y_reg\n"
        b"10,1,100\n"
        b"20,2,200\n"
        b"30,3,300\n"
        b"40,4,400\n"
        b"50,5,500\n"
        b"60,6,600\n"
        b"70,7,700\n"
        b"80,8,800\n"
        b"90,9,900\n"
        b"100,10,1000\n"
        b"110,11,1100\n"
        b"120,12,1200\n"
    )
    
    upload_resp = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("collab_mock.csv", file_content, "text/csv")}
    )
    assert upload_resp.status_code == 201
    dataset_id = upload_resp.json()["id"]

    # 2. Seed mock Document for RAG
    doc_content = b"Linear Regression is a standard supervised learning model that fits OLS coefficients."
    doc_upload = client.post(
        "/api/v1/documents/upload",
        files={"file": ("collab_doc.txt", doc_content, "text/plain")}
    )
    assert doc_upload.status_code == 201
    doc_id = doc_upload.json()["id"]

    # 3. Trigger Collaboration Workflow
    payload = {
        "target_column": "y_reg",
        "feature_columns": ["x1", "x2"],
        "algorithm": "linear_regression",
        "doc_id": doc_id
    }
    
    collab_resp = client.post(f"/api/v1/datasets/{dataset_id}/collaborate", json=payload)
    assert collab_resp.status_code == 200
    res = collab_resp.json()

    assert "logs" in res
    assert "report" in res

    # Ensure logs from all 5 agents exist
    agents_in_logs = {log["agent"] for log in res["logs"]}
    assert "Data Auditor Agent" in agents_in_logs
    assert "Transformation Agent" in agents_in_logs
    assert "AutoML Engineer Agent" in agents_in_logs
    assert "Knowledge Retrieval Agent" in agents_in_logs
    assert "Executive Summarizer" in agents_in_logs

    # Verify report sections
    report_text = res["report"].lower()
    assert "collaborative analyst report" in report_text
    assert "structural data audit" in report_text
    assert "recommended cleaning recipes" in report_text
    assert "automl model diagnostics" in report_text
    assert "collab_doc.txt" in report_text

    # Cleanup
    client.delete(f"/api/v1/datasets/{dataset_id}")
    client.delete(f"/api/v1/documents/{doc_id}")
