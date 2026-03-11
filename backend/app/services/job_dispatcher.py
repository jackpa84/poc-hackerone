"""
services/job_dispatcher.py — Enfileira jobs no Redis para execução pelo worker

Como funciona:
  1. API recebe POST /jobs com tipo e configuração
  2. job_dispatcher cria o documento Job no MongoDB (status: pending)
  3. job_dispatcher enfileira a tarefa no Redis via ARQ
  4. Worker pega a tarefa da fila e executa
  5. Frontend faz polling em GET /jobs/:id para ver o progresso

Separar a criação do job (API) da execução (worker) é fundamental:
  - A API responde imediatamente (< 100ms)
  - O worker pode demorar minutos sem bloquear a API
  - Múltiplos workers podem processar jobs em paralelo
"""
from arq import create_pool
from arq.connections import RedisSettings

from app.config import settings
from app.models.job import Job

# Mapeamento tipo → nome da função no worker
JOB_TASK_MAP = {
    "recon":      "task_run_recon",
    "dir_fuzz":   "task_run_dir_fuzz",
    "param_fuzz": "task_run_param_fuzz",
    "sub_fuzz":   "task_run_sub_fuzz",
    "idor":       "task_run_idor_test",
    "port_scan":  "task_run_port_scan",
    "dns_recon":  "task_run_dns_recon",
}


async def dispatch_job(job: Job) -> None:
    """
    Enfileira o job no Redis e salva o arq_job_id no documento.
    """
    task_name = JOB_TASK_MAP.get(job.type)
    if not task_name:
        raise ValueError(f"Tipo de job desconhecido: {job.type}")

    redis = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))

    # Enfileira a tarefa. O worker vai receber o job_id e buscar os detalhes no MongoDB.
    arq_job = await redis.enqueue_job(task_name, str(job.id))

    job.arq_job_id = arq_job.job_id
    await job.save()

    await redis.aclose()
