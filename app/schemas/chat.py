from pydantic import BaseModel
from typing import List

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str
    suggested_prompts: List[str]
