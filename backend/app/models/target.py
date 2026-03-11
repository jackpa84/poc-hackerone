"""
models/target.py — Coleção 'targets'

Um Target é um domínio, IP ou range que pertence ao escopo de um programa.
Exemplos: "shopify.com", "*.shopify.com", "1.2.3.4/24"
"""
from datetime import datetime
from typing import Optional
from beanie import Document


class Target(Document):
    program_id: Optional[str] = None
    user_id: str

    value: str                             # "shopify.com" ou "*.shopify.com"
    type: str = "domain"                  # "domain" | "wildcard" | "ip_range" | "mobile_app"
    is_in_scope: bool = True              # False = fora do escopo (não atacar)
    notes: Optional[str] = None

    last_recon_at: Optional[datetime] = None  # Quando foi feito o último recon
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "targets"
        indexes = ["program_id", "user_id"]
