from pydantic import BaseModel, Json
from datetime import datetime
from typing import List, Dict, Any

class TrainRequest(BaseModel):
    dataset_id: str
    target_column: str
    feature_columns: List[str]
    algorithm: str  # 'linear_regression', 'random_forest', 'decision_tree', 'logistic_regression'

class MlModelResponse(BaseModel):
    id: str
    dataset_id: str
    name: str
    task_type: str
    target_column: str
    features: Json[Any]
    algorithm: str
    metrics: Json[Any]
    feature_importances: Json[Any]
    test_predictions: Json[Any]
    created_at: datetime

    class Config:
        from_attributes = True
