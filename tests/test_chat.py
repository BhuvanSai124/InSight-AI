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
import json

# Setup test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_insight_ai_chat.db"
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
    if os.path.exists("./test_insight_ai_chat.db"):
        os.remove("./test_insight_ai_chat.db")

client = TestClient(app)

def test_chat_analyst_flow():
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
        files={"file": ("chat_mock.csv", file_content, "text/csv")}
    )
    assert upload_resp.status_code == 201
    dataset_id = upload_resp.json()["id"]

    # 2. Test dimensions query
    resp1 = client.post(f"/api/v1/datasets/{dataset_id}/chat", json={"message": "What is the dataset shape?"})
    assert resp1.status_code == 200
    assert "dimensions" in resp1.json()["response"].lower()
    assert "12" in resp1.json()["response"]

    # 3. Test stats query
    resp2 = client.post(f"/api/v1/datasets/{dataset_id}/chat", json={"message": "What is the average of x1?"})
    assert resp2.status_code == 200
    # Mean of 10..120 is 65.0
    assert "average" in resp2.json()["response"].lower()
    assert "65" in resp2.json()["response"]

    # 4. Test missing values query
    resp3 = client.post(f"/api/v1/datasets/{dataset_id}/chat", json={"message": "Show missing values"})
    assert resp3.status_code == 200
    assert "no missing values" in resp3.json()["response"].lower()

    # 5. Test predict query before model is trained
    resp4 = client.post(f"/api/v1/datasets/{dataset_id}/chat", json={"message": "predict y_reg for x1=15, x2=2.5"})
    assert resp4.status_code == 200
    assert "no trained models found" in resp4.json()["response"].lower()

    # 6. Train Linear Regression model
    payload_reg = {
        "dataset_id": dataset_id,
        "target_column": "y_reg",
        "feature_columns": ["x1", "x2"],
        "algorithm": "linear_regression"
    }
    train_resp = client.post("/api/v1/models/train", json=payload_reg)
    assert train_resp.status_code == 201
    model_id = train_resp.json()["id"]

    # 7. Test predict query after model is trained
    resp5 = client.post(f"/api/v1/datasets/{dataset_id}/chat", json={"message": "predict y_reg for x1=15, x2=2.5"})
    assert resp5.status_code == 200
    assert "predicted value" in resp5.json()["response"].lower()

    # Cleanup dataset and trained model
    client.delete(f"/api/v1/datasets/{dataset_id}")
    client.delete(f"/api/v1/models/{model_id}")
