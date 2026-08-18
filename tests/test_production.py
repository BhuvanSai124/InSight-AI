import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.api.deps import get_db
from app.core.database import Base
import os

# Setup test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_insight_ai_production.db"
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
    if os.path.exists("./test_insight_ai_production.db"):
        os.remove("./test_insight_ai_production.db")

client = TestClient(app)

def test_production_routes():
    # 1. Test API root endpoint
    root_resp = client.get("/")
    assert root_resp.status_code == 200
    
    # 2. Test nonexistent API subroute - should return 404 JSON, NOT index.html
    api_resp = client.get("/api/v1/datasets/nonexistent-dataset-id-xyz")
    assert api_resp.status_code == 404
    assert "detail" in api_resp.json()

    # 3. Test docs page
    docs_resp = client.get("/docs")
    assert docs_resp.status_code == 200
