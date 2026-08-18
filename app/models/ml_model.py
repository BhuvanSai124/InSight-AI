from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.sql import func
import uuid
from app.core.database import Base

class MlModel(Base):
    __tablename__ = "ml_models"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id = Column(String(36), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    task_type = Column(String(50), nullable=False)  # 'regression' or 'classification'
    target_column = Column(String(100), nullable=False)
    features = Column(String, nullable=False)  # Stored as JSON string list of columns
    algorithm = Column(String(50), nullable=False)  # 'linear_regression', 'random_forest', etc.
    metrics = Column(String, nullable=False)  # Stored as JSON string dict of stats
    feature_importances = Column(String, nullable=False)  # Stored as JSON string dict of feature weights
    file_path = Column(String, nullable=False)  # Path to serialized pickle model
    test_predictions = Column(String, nullable=False)  # Stored as JSON string validation scatter coordinates
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
