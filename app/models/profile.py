from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func
import uuid
from app.core.database import Base

class Profile(Base):
    __tablename__ = "profiles"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id = Column(String(36), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    row_count = Column(Integer, nullable=False)
    column_count = Column(Integer, nullable=False)
    duplicate_rows = Column(Integer, nullable=False)
    missing_cells = Column(Integer, nullable=False)
    memory_usage_bytes = Column(Integer, nullable=False)
    columns_metadata = Column(String, nullable=False)  # Stored as JSON string
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
