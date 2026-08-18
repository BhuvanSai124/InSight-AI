from pydantic import BaseModel, Json
from datetime import datetime
from typing import Dict, Any

class ProfileBase(BaseModel):
    row_count: int
    column_count: int
    duplicate_rows: int
    missing_cells: int
    memory_usage_bytes: int

class ProfileCreate(ProfileBase):
    dataset_id: str
    columns_metadata: str

class ProfileResponse(ProfileBase):
    id: str
    dataset_id: str
    columns_metadata: Json[Any]  # Automatically parses the JSON string into python objects
    created_at: datetime

    class Config:
        from_attributes = True
