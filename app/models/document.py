from sqlalchemy import Column, String, DateTime, Integer
from sqlalchemy.sql import func
import uuid
from app.core.database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    file_path = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    chunks = Column(String, nullable=False)  # JSON string list of document paragraph chunks
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
