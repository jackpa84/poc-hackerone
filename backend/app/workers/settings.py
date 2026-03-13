"""
workers/settings.py — Configuração do ARQ Worker

Pipeline de automação completo (tudo automático):

  [Cron 6h]  task_auto_h1_sync         → Sincroniza programas + targets do HackerOne
  [Cron 5m]  task_auto_scheduler       → Cria jobs de recon para targets sem scan recente
  [Workers]  task_run_recon            → subfinder + httpx + katana + gau + nuclei
  [Workers]  task_run_port_scan        → naabu → cria findings de portas abertas
  [Workers]  task_run_dir_fuzz         → ffuf → cria findings de diretórios
  [Workers]  task_run_dns_recon        → dnsx → cria findings de DNS
  [Workers]  task_run_idor_test        → testa IDOR → cria findings críticos
  [Workers]  task_run_xss_scan         → dalfox → detecta XSS (reflected, DOM, blind)
  [Workers]  task_run_sqli_scan        → sqlmap → detecta SQL Injection
  [Workers]  task_run_param_discovery  → arjun → descobre parâmetros HTTP ocultos
  [Workers]  task_run_js_analysis      → JS analysis → endpoints + secrets expostos
  [Workers]  task_run_secret_scan      → gitleaks → secrets em repositórios Git
  [Workers]  task_run_api_scan         → kiterunner + nuclei → rotas e vulns de API
  [Cron 30m] task_auto_pipeline_sweep  → encontra findings 'accepted' e roda pipeline
  [Workers]  task_auto_pipeline        → gera relatório IA + submete ao HackerOne
  [Startup]  task_seed_programs        → popula novos usuários com 13 programas curados
"""
import logging
from arq.connections import RedisSettings
from arq.cron import cron

from app.config import settings
from app.database import init_db

logger = logging.getLogger(__name__)

# ── Workers executados manualmente ou pelo scheduler ──────────────────────
from app.workers.recon           import task_run_recon
from app.workers.fuzzer          import task_run_dir_fuzz, task_run_param_fuzz, task_run_sub_fuzz
from app.workers.idor            import task_run_idor_test
from app.workers.reports         import task_generate_report
from app.workers.port_scan       import task_run_port_scan
from app.workers.dns_recon       import task_run_dns_recon
from app.workers.pipeline        import task_auto_pipeline
from app.workers.xss_scanner     import task_run_xss_scan
from app.workers.sqli_scanner    import task_run_sqli_scan
from app.workers.param_discovery import task_run_param_discovery
from app.workers.js_analyzer     import task_run_js_analysis
from app.workers.secret_scanner  import task_run_secret_scan
from app.workers.api_scanner     import task_run_api_scan

# ── Workers automáticos (cron jobs) ───────────────────────────────────────
from app.workers.scheduler       import task_auto_scheduler    # recon de targets
from app.workers.seeder          import task_seed_programs     # seed novos usuários
from app.workers.auto_sync       import (                      # H1 sync + pipeline sweep
    task_auto_h1_sync,
    task_auto_pipeline_sweep,
)
from app.workers.asset_discovery import (                      # descoberta ampliada de ativos
    task_asn_enum,
    task_github_recon,
    task_cloud_enum,
)


async def startup(ctx):
    """Inicializa o MongoDB e dispara sync inicial ao subir o worker."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    await init_db()
    logger.info("[worker] MongoDB inicializado.")

    # Dispara sync do H1 imediatamente ao subir (não espera o cron de 6h)
    redis = ctx.get("redis")
    if redis:
        try:
            await redis.enqueue_job("task_auto_h1_sync")
            logger.info("[worker] Sync H1 inicial enfileirado.")
        except Exception as e:
            logger.warning("[worker] Não foi possível enfileirar sync H1: %s", e)


async def shutdown(ctx):
    """Graceful shutdown: loga o encerramento para rastreabilidade."""
    logger.info("[worker] Worker encerrando — jobs em execução serão retomados na próxima inicialização.")


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)

    functions = [
        # Recon e ferramentas base
        task_run_recon,
        task_run_dir_fuzz,
        task_run_param_fuzz,
        task_run_sub_fuzz,
        task_run_idor_test,
        task_run_port_scan,
        task_run_dns_recon,
        # Scanners especializados
        task_run_xss_scan,
        task_run_sqli_scan,
        task_run_param_discovery,
        task_run_js_analysis,
        task_run_secret_scan,
        task_run_api_scan,
        # Relatórios e pipeline
        task_generate_report,
        task_auto_pipeline,
        # Automação
        task_auto_scheduler,
        task_seed_programs,
        task_auto_h1_sync,
        task_auto_pipeline_sweep,
        # Descoberta ampliada de ativos
        task_asn_enum,
        task_github_recon,
        task_cloud_enum,
    ]

    cron_jobs = [
        # Recon automático: a cada hora (targets têm threshold de 24h)
        cron(task_auto_scheduler, minute=0, timeout=300),

        # Sincronização com HackerOne: a cada 6 horas
        cron(task_auto_h1_sync, hour={0, 6, 12, 18}, minute=5, timeout=600),

        # Pipeline sweep para findings 'accepted': a cada 30 minutos
        cron(task_auto_pipeline_sweep, minute={10, 40}, timeout=300),
    ]

    on_startup  = startup
    on_shutdown = shutdown
    max_jobs    = settings.MAX_JOBS
    job_timeout = 5400   # 1.5h por tarefa (nuclei/sqlmap podem demorar)
