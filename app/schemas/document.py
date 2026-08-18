from pydantic import BaseModel, Json
from datetime import datetime
from typing import List, Any

class DocumentResponse(BaseModel):
    id: str
    name: str
    file_size: int
    chunks: Json[Any]
    created_at: datetime

    class Config:
        from_attributes = True

class QueryRequest(BaseModel):
    query: str

class SourceExcerpt(BaseModel):
    chunk_index: int
    text: str
    score: float

class QueryResponse(BaseModel):
    answer: str
    sources: List[SourceExcerpt]
