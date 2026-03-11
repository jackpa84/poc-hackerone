from typing import Optional
from pydantic import BaseModel


class FindingCreate(BaseModel):
    program_id: Optional[str] = None
    target_id: Optional[str] = None
    title: str
    type: str
    severity: str = "medium"
    description: str = ""
    steps_to_reproduce: str = ""
    impact: str = ""
    affected_url: str = ""
    parameter: Optional[str] = None
    payload: Optional[str] = None
    cvss_score: Optional[float] = None


class FindingUpdate(BaseModel):
    title: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    steps_to_reproduce: Optional[str] = None
    impact: Optional[str] = None
    affected_url: Optional[str] = None
    parameter: Optional[str] = None
    payload: Optional[str] = None
    cvss_score: Optional[float] = None
    bounty_amount: Optional[float] = None


class FindingResponse(BaseModel):
    id: str
    program_id: Optional[str]
    target_id: Optional[str]
    job_id: Optional[str]
    title: str
    type: str
    severity: str
    status: str
    cvss_score: Optional[float]
    description: str
    steps_to_reproduce: str
    impact: str
    affected_url: str
    parameter: Optional[str]
    payload: Optional[str]
    bounty_amount: Optional[float]
    created_at: str
    updated_at: str
