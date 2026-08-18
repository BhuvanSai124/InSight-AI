import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.api.deps import get_db
from app.core.database import Base
from app.models.document import Document
import json
import os

# Setup test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_insight_ai_rag.db"
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
    if os.path.exists("./test_insight_ai_rag.db"):
        os.remove("./test_insight_ai_rag.db")

client = TestClient(app)

def test_rag_flow():
    # 1. Upload mock text file
    file_content = (
        b"Deep Learning is a subset of machine learning using multi-layer neural networks.\n\n"
        b"FastAPI is a modern, high-performance web framework for building APIs with Python 3.8+."
    )
    
    upload_resp = client.post(
        "/api/v1/documents/upload",
        files={"file": ("rag_mock.txt", file_content, "text/plain")}
    )
    assert upload_resp.status_code == 201
    doc_data = upload_resp.json()
    doc_id = doc_data["id"]
    assert doc_data["name"] == "rag_mock.txt"
    assert len(doc_data["chunks"]) == 2

    # 2. Test semantic query
    query_resp = client.post(f"/api/v1/documents/{doc_id}/query", json={"query": "what is FastAPI"})
    assert query_resp.status_code == 200
    res_data = query_resp.json()
    assert "fastapi" in res_data["answer"].lower()
    assert len(res_data["sources"]) > 0
    assert res_data["sources"][0]["score"] > 0.0

    # 3. List documents
    list_resp = client.get("/api/v1/documents/")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    # 4. Delete document
    del_resp = client.delete(f"/api/v1/documents/{doc_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["message"] == "Document deleted successfully"
