import logging
from datetime import datetime

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, HTTPException, Depends

from app.config import settings
from app.models.job import Job
from app.models.user import User
from app.schemas.job import JobCreate, JobResponse
from app.services.job_dispatcher import dispatch_job
from app.dependencies import get_current_user
from app import database

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["jobs"])


def to_response(j: Job) -> JobResponse:
    return JobResponse(
        id=str(j.id), program_id=j.program_id, target_id=j.target_id,
        type=j.type, status=j.status, config=j.config,
        result_summary=j.result_summary, logs=j.logs, error=j.error,
        started_at=j.started_at.isoformat() if j.started_at else None,
        finished_at=j.finished_at.isoformat() if j.finished_at else None,
        created_at=j.created_at.isoformat(),
    )


@router.get("", response_model=list[JobResponse])
async def list_jobs(
    program_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
):
    query = Job.find(Job.user_id == str(user.id))
    if program_id:
        query = query.find(Job.program_id == program_id)
    if status:
        query = query.find(Job.status == status)
    jobs = await query.sort(-Job.created_at).skip(offset).limit(min(limit, 200)).to_list()
    return [to_response(j) for j in jobs]


@router.get("/queue/stats")
async def queue_stats(user: User = Depends(get_current_user)):
    """Retorna métricas da fila ARQ: jobs pendentes, em execução e workers ativos."""
    r = database.redis_client
    if not r:
        raise HTTPException(status_code=503, detail="Redis indisponível")

    try:
        arq_keys = await r.keys("arq:*")
        queued = 0
        try:
            queued = await r.zcard("arq:queue") if "arq:queue" in arq_keys else 0
        except Exception:
            pass

        in_progress = len([k for k in arq_keys if ":in-progress" in k])
        workers = len([k for k in arq_keys if "worker" in k])

        # Stats do banco para o usuário atual
        uid = str(user.id)
        db_stats = await Job.aggregate([
            {"$match": {"user_id": uid}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]).to_list()

        by_status = {item["_id"]: item["count"] for item in db_stats}

        return {
            "queue": {
                "pending_arq": queued,
                "in_progress_arq": in_progress,
                "workers_active": workers,
            },
            "by_status": by_status,
            "total": sum(by_status.values()),
        }
    except Exception as e:
        logger.error("[jobs] Erro ao buscar queue stats: %s", e)
        raise HTTPException(status_code=500, detail="Erro ao consultar fila")


@router.post("", response_model=JobResponse, status_code=201)
async def create_job(data: JobCreate, user: User = Depends(get_current_user)):
    """
    Cria o job no banco e o enfileira no Redis.
    Retorna imediatamente — a execução acontece em background.
    """
    VALID_TYPES = [
        "recon", "dir_fuzz", "param_fuzz", "sub_fuzz", "idor",
        "port_scan", "dns_recon", "xss_scan", "sqli_scan",
        "param_discovery", "js_analysis", "secret_scan", "api_scan",
    ]
    if data.type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Tipo inválido. Use: {VALID_TYPES}")

    job = Job(
        user_id=str(user.id),
        program_id=data.program_id,
        target_id=data.target_id,
        type=data.type,
        config=data.config,
    )
    await job.insert()
    await dispatch_job(job)   # Enfileira no Redis

    return to_response(job)


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str, user: User = Depends(get_current_user)):
    """
    Cancela um job em execução ou pendente.
    - Se pending: muda status para 'cancelled' sem executar
    - Se running:  tenta abortar via ARQ e muda status para 'cancelled'
    """
    from bson import ObjectId
    job = await Job.get(ObjectId(job_id))
    if not job or job.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Job não encontrado")

    if job.status in ("completed", "failed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Job já está {job.status}, não pode ser cancelado")

    # Tenta abortar no ARQ se tiver o arq_job_id
    if job.arq_job_id:
        try:
            redis = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
            await redis.abort_job(job.arq_job_id)
            await redis.aclose()
        except Exception as e:
            logger.warning("[jobs] Não foi possível abortar job ARQ %s: %s", job.arq_job_id, e)

    job.status = "cancelled"
    job.error = "Cancelado pelo usuário"
    job.finished_at = datetime.utcnow()
    job.logs.append("[cancelado] Job cancelado pelo usuário")
    await job.save()

    return to_response(job)


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, user: User = Depends(get_current_user)):
    from bson import ObjectId
    job = await Job.get(ObjectId(job_id))
    if not job or job.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return to_response(job)
