from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import os

from app.api.deps import get_db
from app.models.dataset import Dataset
from app.models.ml_model import MlModel
from app.schemas.ml_model import TrainRequest, MlModelResponse
from app.services.trainer import trainer_service

router = APIRouter()

@router.post("/train", response_model=MlModelResponse, status_code=status.HTTP_201_CREATED)
def train_model(
    payload: TrainRequest,
    db: Session = Depends(get_db)
):
    # Fetch dataset
    dataset = db.query(Dataset).filter(Dataset.id == payload.dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    try:
        # Run trainer service
        res = trainer_service.train_model(
            dataset.file_path,
            dataset.file_type,
            payload.target_column,
            payload.feature_columns,
            payload.algorithm
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

    # Save to DB
    db_model = MlModel(
        dataset_id=payload.dataset_id,
        name=res["name"],
        task_type=res["task_type"],
        target_column=payload.target_column,
        features=res["features"],
        algorithm=payload.algorithm,
        metrics=res["metrics"],
        feature_importances=res["feature_importances"],
        file_path=res["file_path"],
        test_predictions=res["test_predictions"]
    )
    db.add(db_model)
    db.commit()
    db.refresh(db_model)

    return db_model

@router.get("/dataset/{dataset_id}", response_model=List[MlModelResponse])
def list_dataset_models(
    dataset_id: str,
    db: Session = Depends(get_db)
):
    models = db.query(MlModel).filter(MlModel.dataset_id == dataset_id).order_by(MlModel.created_at.desc()).all()
    return models

@router.get("/{model_id}", response_model=MlModelResponse)
def get_model(
    model_id: str,
    db: Session = Depends(get_db)
):
    model = db.query(MlModel).filter(MlModel.id == model_id).first()
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found"
        )
    return model

@router.delete("/{model_id}")
def delete_model(
    model_id: str,
    db: Session = Depends(get_db)
):
    model = db.query(MlModel).filter(MlModel.id == model_id).first()
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found"
        )

    # Delete pickle file if exists
    try:
        if os.path.exists(model.file_path):
            os.remove(model.file_path)
    except Exception:
        pass # Non-blocking file deletion failure

    db.delete(model)
    db.commit()
    return {"message": "Model deleted successfully", "id": model_id}
