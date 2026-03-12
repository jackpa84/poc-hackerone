"""
models/comment.py — Coleção 'comments'

Comentários/notas internas em um Finding.
Permitem que o pesquisador registre observações durante a investigação.
"""
from datetime import datetime
from beanie import Document
from pymongo import IndexModel, ASCENDING, DESCENDING


class Comment(Document):
    finding_id: str
    user_id: str
    text: str
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "comments"
        indexes = [
            IndexModel([("finding_id", ASCENDING), ("created_at", DESCENDING)]),
        ]
