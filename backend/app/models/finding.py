"""
models/finding.py — Coleção 'findings'

Um Finding é uma vulnerabilidade encontrada durante os testes.
Pode ser criado manualmente pelo pesquisador ou automaticamente por um Job.

Severidades seguem o padrão de bug bounty:
  critical → RCE, account takeover completo
  high     → IDOR com dados sensíveis, SQLi autenticado
  medium   → XSS stored, CSRF em ação sensível
  low      → Open redirect, informação pouco sensível
  info     → Exposição de versão, header de segurança ausente
"""
import hashlib
from datetime import datetime
from typing import Optional, Dict, Any
from beanie import Document
from beanie.odm.actions import before_event, EventTypes
from pymongo import IndexModel, ASCENDING, DESCENDING


class Finding(Document):
    user_id: str
    program_id: Optional[str] = None
    target_id: Optional[str] = None
    job_id: Optional[str] = None          # Preenchido quando criado automaticamente por um Job

    # Identificação
    title: str                            # "IDOR em /api/v1/invoices/{id}"
    type: str                             # "idor" | "xss" | "sqli" | "ssrf" | "lfi" | "open_redirect" | "other"
    severity: str = "medium"             # "critical" | "high" | "medium" | "low" | "informational"
    cvss_score: Optional[float] = None   # 0.0 a 10.0

    # Estado no processo de bug bounty
    status: str = "new"
    # "new" → você encontrou
    # "triaging" → reportou, aguardando triagem
    # "accepted" → programa aceitou
    # "resolved" → corrigido
    # "duplicate" → já tinha sido reportado
    # "not_applicable" → fora de escopo ou não é bug

    # Detalhes técnicos (markdown aceito)
    description: str = ""
    steps_to_reproduce: str = ""
    impact: str = ""

    # Evidências técnicas
    affected_url: str = ""
    parameter: Optional[str] = None      # Parâmetro vulnerável
    payload: Optional[str] = None        # Payload que ativou a vuln
    evidence: list[str] = []             # URLs de screenshots / arquivos

    # Recompensa
    bounty_amount: Optional[float] = None  # Preenchido após pagamento
    reported_at: Optional[datetime] = None

    # Hash para deduplicação automática (title + affected_url + user_id)
    content_hash: Optional[str] = None

    created_at: datetime = datetime.utcnow()
    updated_at: datetime = datetime.utcnow()

    @staticmethod
    def build_hash(user_id: str, title: str, affected_url: str) -> str:
        """Gera hash determinístico para deduplicação de findings automáticos."""
        raw = f"{user_id}|{title.lower().strip()}|{affected_url.lower().strip()}"
        return hashlib.sha256(raw.encode()).hexdigest()

    @property
    def severity_order(self) -> int:
        """Map severity to numeric order for sorting"""
        order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "informational": 4}
        return order.get(self.severity, 99)

    async def to_dict(self, include_ordering: bool = False) -> Dict[str, Any]:
        """Convert to dict with optional ordering fields"""
        data = {
            "id": str(self.id),
            "user_id": self.user_id,
            "program_id": self.program_id,
            "title": self.title,
            "type": self.type,
            "severity": self.severity,
            "status": self.status,
            "affected_url": self.affected_url,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

        if include_ordering:
            data["severity_order"] = self.severity_order

        return data

    @before_event(EventTypes.SAVE, EventTypes.REPLACE, EventTypes.SAVE_CHANGES)
    def refresh_updated_at(self):
        """Update timestamp before save"""
        self.updated_at = datetime.utcnow()

    class Settings:
        name = "findings"
        indexes = [
            # Queries simples
            "user_id",
            "severity",
            "status",
            "type",
            "created_at",
            # Compound: listagem filtrada por usuário
            IndexModel([("user_id", ASCENDING), ("program_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("user_id", ASCENDING), ("severity", ASCENDING), ("status", ASCENDING)]),
            # Deduplicação: único por hash dentro do user
            IndexModel([("content_hash", ASCENDING)], sparse=True),
        ]
