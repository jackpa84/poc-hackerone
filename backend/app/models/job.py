"""
models/job.py — Coleção 'jobs'

Um Job representa a execução de uma ferramenta de segurança em background.
Tipos de job:
  - recon:      executa subfinder + httpx + gau
  - dir_fuzz:   fuzzing de diretórios
  - param_fuzz: fuzzing de parâmetros
  - sub_fuzz:   fuzzing de subdomínios
  - idor:       teste de IDOR em sequência de IDs

Fluxo:
  1. API cria Job com status "pending"
  2. API enfileira a tarefa no Redis (via ARQ)
  3. Worker pega a tarefa e muda status para "running"
  4. Worker executa, vai appendando logs
  5. Worker finaliza: status "completed" ou "failed"
  6. Frontend faz polling e mostra logs em tempo real
"""
from datetime import datetime
from typing import Optional, Any
from beanie import Document
from pymongo import IndexModel, ASCENDING, DESCENDING


class Job(Document):
    user_id: str
    program_id: Optional[str] = None
    target_id: Optional[str] = None

    # Tipo e estado
    type: str                             # "recon" | "dir_fuzz" | "param_fuzz" | "sub_fuzz" | "idor" | "port_scan" | "dns_recon"
    status: str = "pending"              # "pending" | "running" | "completed" | "failed" | "cancelled"

    # Configuração específica do job (flexível por tipo)
    config: dict[str, Any] = {}
    # Exemplos:
    # recon:      {"run_nuclei": False}
    # dir_fuzz:   {"url": "https://...", "threads": 20, "wordlist": "dirs"}
    # idor:       {"url_template": "https://.../FUZZ", "id_range": [1, 200], "your_id": "42"}

    # Resultado e logs
    result_summary: Optional[dict[str, Any]] = None
    logs: list[str] = []                  # Linhas de output do worker em tempo real
    error: Optional[str] = None           # Traceback se falhou

    # Referência interna do ARQ para rastrear a tarefa
    arq_job_id: Optional[str] = None

    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "jobs"
        indexes = [
            # Queries simples
            "user_id",
            "status",
            "created_at",
            # Compound: listagem por usuário + programa
            IndexModel([("user_id", ASCENDING), ("program_id", ASCENDING), ("created_at", DESCENDING)]),
            # Compound: dedup de jobs pendentes/rodando por target
            IndexModel([("target_id", ASCENDING), ("type", ASCENDING), ("status", ASCENDING)]),
            # Compound: pipeline sweep — busca por finding_id dentro do config
            IndexModel([("config.finding_id", ASCENDING), ("type", ASCENDING), ("status", ASCENDING)]),
        ]
