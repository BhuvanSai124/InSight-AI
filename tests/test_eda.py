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
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_insight_ai_eda.db"
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
    if os.path.exists("./test_insight_ai_eda.db"):
        os.remove("./test_insight_ai_eda.db")

client = TestClient(app)

def test_eda_flow():
    # 1. Seed mock CSV
    file_content = (
        b"age,income,gender\n"
        b"20,100,M\n"
        b"30,200,F\n"
        b"40,300,M\n"
        b"50,400,M\n"
    )
    
    upload_resp = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("eda_mock.csv", file_content, "text/csv")}
    )
    assert upload_resp.status_code == 201
    dataset_id = upload_resp.json()["id"]

    # 2. Test Correlation Matrix endpoint
    corr_resp = client.get(f"/api/v1/datasets/{dataset_id}/eda/correlation")
    assert corr_resp.status_code == 200
    corr_data = corr_resp.json()
    assert "columns" in corr_data
    assert "matrix" in corr_data
    assert "age" in corr_data["columns"]
    assert "income" in corr_data["columns"]
    assert "gender" not in corr_data["columns"] # Non-numeric dropped
    # Diagonal correlation is 1.0
    age_idx = corr_data["columns"].index("age")
    assert abs(corr_data["matrix"][age_idx][age_idx] - 1.0) < 1e-5

    # 3. Test Describe Column for Numeric
    desc_num_resp = client.get(f"/api/v1/datasets/{dataset_id}/eda/describe/age")
    assert desc_num_resp.status_code == 200
    desc_num = desc_num_resp.json()
    assert desc_num["column"] == "age"
    assert desc_num["type"] == "numeric"
    assert "skew" in desc_num
    assert "kurtosis" in desc_num
    assert len(desc_num["bins"]) > 0

    # 4. Test Describe Column for Categorical
    desc_cat_resp = client.get(f"/api/v1/datasets/{dataset_id}/eda/describe/gender")
    assert desc_cat_resp.status_code == 200
    desc_cat = desc_cat_resp.json()
    assert desc_cat["column"] == "gender"
    assert desc_cat["type"] == "categorical"
    assert len(desc_cat["frequencies"]) > 0
    assert desc_cat["frequencies"][0]["category"] == "M"
    assert desc_cat["frequencies"][0]["count"] == 3

    # 5. Test Columns Raw Data endpoint
    raw_resp = client.get(f"/api/v1/datasets/{dataset_id}/eda/columns-data?cols=age,income")
    assert raw_resp.status_code == 200
    raw_data = raw_resp.json()
    assert len(raw_data) == 4 # 4 rows
    assert raw_data[0]["age"] == 20.0
    assert raw_data[0]["income"] == 100.0

    # Cleanup
    client.delete(f"/api/v1/datasets/{dataset_id}")
