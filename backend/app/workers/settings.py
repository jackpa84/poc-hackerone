"""
workers/settings.py — Configuração do ARQ Worker

ARQ é uma fila de tarefas assíncrona que usa Redis como broker.
Esta classe diz ao ARQ:
  - Quais tarefas ele pode executar (functions)
  - Onde está o Redis (redis_settings)
  - Quantas tarefas em paralelo (max_jobs)
  - Quanto tempo máximo por tarefa (job_timeout)
  - O que fazer ao iniciar (on_startup) — precisa conectar no MongoDB
  - Cron jobs — tarefas agendadas que rodam automaticamente

Para rodar o worker:
  arq app.workers.settings.WorkerSettings
"""
from arq.connections import RedisSettings

from app.config import settings
from app.database import init_db

# Tarefas disparadas manualmente via API
from app.workers.recon import task_run_recon
from app.workers.fuzzer import task_run_dir_fuzz, task_run_param_fuzz, task_run_sub_fuzz
from app.workers.idor import task_run_idor_test
from app.workers.reports import task_generate_report
from app.workers.port_scan import task_run_port_scan
from app.workers.dns_recon import task_run_dns_recon

# Pipeline — automação end-to-end finding → relatório
from app.workers.pipeline import task_auto_pipeline


async def startup(ctx):
    """
    Inicializa o MongoDB para o processo worker.
    Necessário porque o worker é um processo separado da API.
    """
    await init_db()
    print("[worker] MongoDB inicializado.")


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)

    # Tarefas que podem ser chamadas via redis.enqueue_job()
    functions = [
        task_run_recon,
        task_run_dir_fuzz,
        task_run_param_fuzz,
        task_run_sub_fuzz,
        task_run_idor_test,
        task_generate_report,
        task_run_port_scan,
        task_run_dns_recon,
        task_auto_pipeline,
    ]

    cron_jobs = []

    on_startup = startup
    max_jobs   = 20      # tarefas em paralelo por processo worker
    job_timeout = 3600   # máximo 1 hora por tarefa
