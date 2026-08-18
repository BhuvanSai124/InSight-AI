from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base
from app.api.v1.datasets import router as datasets_router
from app.api.v1.models import router as models_router
from app.api.v1.documents import router as documents_router
from app.models.dataset import Dataset
from app.models.profile import Profile
from app.models.ml_model import MlModel
from app.models.document import Document

# Initialize Database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set CORS middleware
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Include routers
app.include_router(datasets_router, prefix=f"{settings.API_V1_STR}/datasets", tags=["datasets"])
app.include_router(models_router, prefix=f"{settings.API_V1_STR}/models", tags=["models"])
app.include_router(documents_router, prefix=f"{settings.API_V1_STR}/documents", tags=["documents"])

import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

current_dir = os.path.dirname(os.path.realpath(__file__))
frontend_dist_dir = os.path.abspath(os.path.join(current_dir, "../../frontend/dist"))

if os.path.exists(frontend_dist_dir):
    assets_dir = os.path.join(frontend_dist_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    def serve_root():
        index_file = os.path.join(frontend_dist_dir, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "Welcome to InsightAI API", "status": "healthy"}

    @app.get("/{fallback_path:path}")
    def serve_fallback(fallback_path: str):
        if fallback_path.startswith("api/") or fallback_path.startswith("docs") or fallback_path.startswith("openapi.json"):
            return {"detail": "Not Found"}
        index_file = os.path.join(frontend_dist_dir, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"detail": "Not Found"}
else:
    @app.get("/")
    def root():
        return {"message": "Welcome to InsightAI API", "status": "healthy"}
