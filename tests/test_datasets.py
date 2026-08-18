import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.api.deps import get_db
from app.core.database import Base
from app.models.dataset import Dataset
from app.models.profile import Profile
import io

uploaded_dataset_id = None

# Setup test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_insight_ai.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override database dependency
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
    # Clean up test db file if exists
    import os
    if os.path.exists("./test_insight_ai.db"):
        os.remove("./test_insight_ai.db")

client = TestClient(app)

def test_upload_invalid_extension():
    file_content = b"header1,header2\nvalue1,value2"
    response = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("test.txt", file_content, "text/plain")}
    )
    assert response.status_code == 400
    assert "Unsupported file format" in response.json()["detail"]

def test_upload_csv():
    file_content = b"col1,col2,col3\n1,2,3\n4,5,6"
    response = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("test.csv", file_content, "text/csv")}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "test.csv"
    assert data["file_type"] == "csv"
    assert data["row_count"] == 2
    assert data["column_count"] == 3
    assert data["status"] == "uploaded"
    assert "id" in data

    # Keep track of uploaded dataset id
    global uploaded_dataset_id
    uploaded_dataset_id = data["id"]

def test_list_datasets():
    response = client.get("/api/v1/datasets/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["name"] == "test.csv"

def test_get_dataset():
    global uploaded_dataset_id
    dataset_id = uploaded_dataset_id
    response = client.get(f"/api/v1/datasets/{dataset_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == dataset_id
    assert data["name"] == "test.csv"

def test_delete_dataset():
    global uploaded_dataset_id
    dataset_id = uploaded_dataset_id
    response = client.delete(f"/api/v1/datasets/{dataset_id}")
    assert response.status_code == 200
    assert response.json()["message"] == "Dataset deleted successfully"

    # Verify not found anymore
    response = client.get(f"/api/v1/datasets/{dataset_id}")
    assert response.status_code == 404
