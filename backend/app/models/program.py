from datetime import datetime
from typing import Optional
from beanie import Document


class Program(Document):
    user_id: str
    name: str
    platform: str = "hackerone"
    url: Optional[str] = None
    status: str = "active"          # active | paused | closed
    scope_notes: Optional[str] = None
    max_bounty: Optional[float] = None
    tags: list[str] = []
    created_at: datetime = datetime.utcnow()
    updated_at: datetime = datetime.utcnow()

    class Settings:
        name = "programs"
        indexes = ["user_id", "status", "platform"]
