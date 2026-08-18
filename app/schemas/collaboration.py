from pydantic import BaseModel
from typing import List, Optional, Dict

class CollaborationRequest(BaseModel):
    target_column: str
    feature_columns: List[str]
    algorithm: str
    doc_id: Optional[str] = None

class AgentLog(BaseModel):
    agent: str
    status: str
    message: str
    timestamp: str

class CollaborationResponse(BaseModel):
    logs: List[AgentLog]
    report: str
