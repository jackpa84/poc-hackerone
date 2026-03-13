"""
models/report.py — Coleção 'reports'

Um Report é um relatório gerado pela IA (Claude/Ollama) pronto para submissão
na HackerOne.

O modelo de IA recebe os dados do Finding e gera um relatório no formato
esperado pela plataforma: título, severidade, descrição, passos para
reproduzir, impacto e evidências.

Após a geração, uma segunda chamada de IA revisa o relatório e avalia
qualidade, seções faltando e aderência ao formato HackerOne.
"""
from datetime import datetime
from typing import Optional, Any, Dict
from beanie import Document
from beanie.odm.actions import before_event, EventTypes
from pymongo import IndexModel, ASCENDING


class Report(Document):
    user_id: str
    finding_id: str                       # O finding que gerou este relatório

    # Conteúdo gerado pela IA
    content_markdown: Optional[str] = None  # None enquanto está gerando
    model_used: str = "claude-sonnet-4-6"   # Mantido por compatibilidade
    model_used_actual: Optional[str] = None # Qual IA realmente gerou (ex: "ollama/xploiter", "claude-sonnet-4-6")

    # Métricas de uso da API (para controle de custo)
    prompt_tokens: int = 0
    completion_tokens: int = 0

    # Versão (cada regeneração incrementa)
    version: int = 1

    # Revisão automática de qualidade (preenchido após review_report())
    review_score: Optional[int] = None           # 0-100
    review_approved: Optional[bool] = None       # True se score >= 70
    review_notes: Optional[Dict[str, Any]] = None  # {quality_score, issues, suggestions, missing_sections, summary}

    is_ready: bool = False                       # True após revisão aprovada ou override manual

    created_at: datetime = datetime.utcnow()
    updated_at: datetime = datetime.utcnow()

    @before_event(EventTypes.SAVE, EventTypes.REPLACE, EventTypes.SAVE_CHANGES)
    def refresh_updated_at(self):
        self.updated_at = datetime.utcnow()

    class Settings:
        name = "reports"
        indexes = [
            "user_id",
            "finding_id",
            # Compound: lookup eficiente por finding
            IndexModel([("user_id", ASCENDING), ("finding_id", ASCENDING)]),
            # Filtrar por is_ready
            IndexModel([("user_id", ASCENDING), ("is_ready", ASCENDING)]),
        ]
