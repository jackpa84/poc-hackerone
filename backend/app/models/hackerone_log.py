from datetime import datetime
from typing import Optional
from beanie import Document


class HackerOneLog(Document):
    user_id: str
    action: str
    status: str = "success"         # success | error
    detail: str = ""
    meta: dict = {}
    error: Optional[str] = None
    duration_ms: Optional[int] = None
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "hackerone_logs"
        indexes = ["user_id", "action", "status", "created_at"]
