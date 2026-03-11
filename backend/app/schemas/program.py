from typing import Optional
from pydantic import BaseModel


class ProgramCreate(BaseModel):
    name: str
    platform: str = "hackerone"
    url: Optional[str] = None
    status: str = "active"
    scope_notes: Optional[str] = None
    max_bounty: Optional[float] = None
    tags: list[str] = []


class ProgramUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    scope_notes: Optional[str] = None
    max_bounty: Optional[float] = None
    tags: Optional[list[str]] = None


class ProgramResponse(BaseModel):
    id: str
    name: str
    platform: str
    url: Optional[str]
    status: str
    scope_notes: Optional[str]
    max_bounty: Optional[float]
    tags: list[str]
    created_at: str
