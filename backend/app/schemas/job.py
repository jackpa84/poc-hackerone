from typing import Optional, Any
from pydantic import BaseModel


class JobCreate(BaseModel):
    program_id: Optional[str] = None
    target_id: Optional[str] = None
    type: str
    config: dict[str, Any] = {}


class JobResponse(BaseModel):
    id: str
    program_id: Optional[str]
    target_id: Optional[str]
    type: str
    status: str
    config: dict[str, Any]
    result_summary: Optional[dict[str, Any]]
    logs: list[str]
    error: Optional[str]
    started_at: Optional[str]
    finished_at: Optional[str]
    created_at: str
