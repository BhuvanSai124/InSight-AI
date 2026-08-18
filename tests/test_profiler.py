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
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_insight_ai_profiler.db"
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
    if os.path.exists("./test_insight_ai_profiler.db"):
        os.remove("./test_insight_ai_profiler.db")

client = TestClient(app)

def test_profile_flow():
    # 1. Upload mock CSV containing duplicates and empty entries
    # Columns:
    # age: numeric with one missing
    # city: categorical
    # active: boolean / categorical
    file_content = (
        b"age,city,active\n"
        b"25,New York,True\n"
        b"30,Paris,False\n"
        b",London,True\n"
        b"25,New York,True\n" # Duplicate row
    )
    
    upload_resp = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("profile_mock.csv", file_content, "text/csv")}
    )
    assert upload_resp.status_code == 201
    dataset_id = upload_resp.json()["id"]

    # 2. Get profile before creating (should return 404)
    get_profile_resp = client.get(f"/api/v1/datasets/{dataset_id}/profile")
    assert get_profile_resp.status_code == 404

    # 3. Trigger profile generation
    post_profile_resp = client.post(f"/api/v1/datasets/{dataset_id}/profile")
    assert post_profile_resp.status_code == 201
    
    profile_data = post_profile_resp.json()
    assert profile_data["dataset_id"] == dataset_id
    assert profile_data["row_count"] == 4
    assert profile_data["column_count"] == 3
    assert profile_data["duplicate_rows"] == 1
    assert profile_data["missing_cells"] == 1 # age is missing in 3rd row

    # Check columns metadata
    cols_meta = profile_data["columns_metadata"]
    assert len(cols_meta) == 3
    
    # Check age (numeric column)
    age_meta = next(c for c in cols_meta if c["name"] == "age")
    assert age_meta["type"] == "numeric"
    assert age_meta["missing_count"] == 1
    assert age_meta["cardinality"] == 2 # 25, 30
    assert age_meta["stats"]["min"] == 25.0
    assert age_meta["stats"]["max"] == 30.0

    # Check city (categorical column)
    city_meta = next(c for c in cols_meta if c["name"] == "city")
    assert city_meta["type"] == "categorical"
    assert city_meta["missing_count"] == 0
    # verify frequencies list
    assert len(city_meta["stats"]["top_values"]) > 0

    # 4. Get profile now that it is created
    get_profile_resp = client.get(f"/api/v1/datasets/{dataset_id}/profile")
    assert get_profile_resp.status_code == 200
    assert get_profile_resp.json()["id"] == profile_data["id"]

    # Cleanup dataset
    client.delete(f"/api/v1/datasets/{dataset_id}")
