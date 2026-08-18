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
import os

# Setup test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_insight_ai_trainer.db"
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
    if os.path.exists("./test_insight_ai_trainer.db"):
        os.remove("./test_insight_ai_trainer.db")

client = TestClient(app)

def test_trainer_flow():
    # 1. Seed mock CSV
    file_content = (
        b"x1,x2,y_reg,y_cls\n"
        b"10,1,100,yes\n"
        b"20,2,200,no\n"
        b"30,3,300,yes\n"
        b"40,4,400,no\n"
        b"50,5,500,yes\n"
        b"60,6,600,no\n"
        b"70,7,700,yes\n"
        b"80,8,800,no\n"
        b"90,9,900,yes\n"
        b"100,10,1000,no\n"
        b"110,11,1100,yes\n"
        b"120,12,1200,no\n"
    )
    
    upload_resp = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("trainer_mock.csv", file_content, "text/csv")}
    )
    assert upload_resp.status_code == 201
    dataset_id = upload_resp.json()["id"]

    # 2. Test Regression Model Training
    payload_reg = {
        "dataset_id": dataset_id,
        "target_column": "y_reg",
        "feature_columns": ["x1", "x2"],
        "algorithm": "linear_regression"
    }
    reg_resp = client.post("/api/v1/models/train", json=payload_reg)
    assert reg_resp.status_code == 201
    reg_model = reg_resp.json()
    assert reg_model["name"] == "Linear Regression"
    assert reg_model["task_type"] == "regression"
    assert "r2" in reg_model["metrics"]
    assert "rmse" in reg_model["metrics"]
    assert "x1" in reg_model["feature_importances"]

    # 3. Test Classification Model Training
    payload_cls = {
        "dataset_id": dataset_id,
        "target_column": "y_cls",
        "feature_columns": ["x1", "x2"],
        "algorithm": "random_forest"
    }
    cls_resp = client.post("/api/v1/models/train", json=payload_cls)
    assert cls_resp.status_code == 201
    cls_model = cls_resp.json()
    assert cls_model["name"] == "Random Forest Classifier"
    assert cls_model["task_type"] == "classification"
    assert "accuracy" in cls_model["metrics"]
    assert "f1_score" in cls_model["metrics"]

    # 4. List Models for Dataset
    list_resp = client.get(f"/api/v1/models/dataset/{dataset_id}")
    assert list_resp.status_code == 200
    models_list = list_resp.json()
    assert len(models_list) == 2

    # 5. Get Model Details
    get_resp = client.get(f"/api/v1/models/{reg_model['id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Linear Regression"

    # 6. Delete Model
    del_resp = client.delete(f"/api/v1/models/{reg_model['id']}")
    assert del_resp.status_code == 200
    assert del_resp.json()["message"] == "Model deleted successfully"

    # Cleanup dataset and remaining model
    client.delete(f"/api/v1/datasets/{dataset_id}")
    client.delete(f"/api/v1/models/{cls_model['id']}")
