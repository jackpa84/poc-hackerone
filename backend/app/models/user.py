"""
models/user.py — Coleção 'users' no MongoDB

Document = uma coleção no MongoDB (equivalente a uma tabela no SQL).
Cada instância de User = um documento (linha) nessa coleção.
"""
from datetime import datetime
from beanie import Document
from pydantic import EmailStr


class User(Document):
    email: EmailStr
    username: str
    hashed_password: str
    is_active: bool = True
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "users"  # nome da coleção no MongoDB
        indexes = ["email", "username"]  # índices para busca rápida
