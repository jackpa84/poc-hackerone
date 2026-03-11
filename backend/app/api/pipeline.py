"""
api/pipeline.py — Controle do pipeline de automação

Endpoints para disparar e monitorar o pipeline:
  POST /pipeline/run          — Executa o pipeline para um finding específico
  POST /pipeline/run-all      — Executa para todos os findings "accepted"
  GET  /pipeline/jobs         — Lista todos os jobs de pipeline com status
  GET  /pipeline/jobs/{id}    — Detalhes e logs de um job específico
"""
from datetime import datetime

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.dependencies import get_current_user
from app.models.finding import Finding
from app.models.job import Job
from app.models.user import User

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


async def _enqueue_pipeline(user_id: str, finding_id: str) -> Job:
    """Cria um Job de pipeline e o enfileira no Redis."""
    job = Job(
        user_id=user_id,
        type="pipeline",
        status="pending",
        config={
            "finding_id": finding_id,
        },
        logs=[f"[{datetime.utcnow().strftime('%H:%M:%S')}] Pipeline enfileirado"],
    )
    await job.insert()

    redis = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    arq_job = await redis.enqueue_job("task_auto_pipeline", str(job.id))
    if arq_job:
        job.arq_job_id = arq_job.job_id
        await job.save()
    await redis.aclose()

    return job


class RunRequest(BaseModel):
    finding_id: str


@router.post("/run")
async def run_pipeline(data: RunRequest, user: User = Depends(get_current_user)):
    """Dispara o pipeline completo para um finding específico."""
    from bson import ObjectId

    finding = await Finding.get(ObjectId(data.finding_id))
    if not finding or finding.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Finding não encontrado")

    job = await _enqueue_pipeline(str(user.id), data.finding_id)

    return {
        "job_id": str(job.id),
        "finding_id": data.finding_id,
        "status": "queued",
        "message": f"Pipeline enfileirado para '{finding.title}'",
    }


@router.post("/run-all")
async def run_pipeline_all(user: User = Depends(get_current_user)):
    """
    Executa o pipeline para todos os findings com status 'accepted'.
    Ideal para processar em lote após triagem.
    """
    uid = str(user.id)

    accepted = await Finding.find(
        Finding.user_id == uid,
        Finding.status == "accepted",
    ).to_list()

    if not accepted:
        return {"queued": 0, "message": "Nenhum finding com status 'accepted' encontrado"}

    queued_jobs = []
    for finding in accepted:
        existing = await Job.find_one(
            Job.user_id == uid,
            Job.type == "pipeline",
            Job.status == "running",
            Job.config.get("finding_id") == str(finding.id),  # type: ignore
        )
        if existing:
            continue

        job = await _enqueue_pipeline(uid, str(finding.id))
        queued_jobs.append({"job_id": str(job.id), "finding": finding.title})

    return {
        "queued": len(queued_jobs),
        "jobs": queued_jobs,
        "message": f"{len(queued_jobs)} pipelines enfileirados de {len(accepted)} findings accepted",
    }


@router.get("/jobs")
async def list_pipeline_jobs(user: User = Depends(get_current_user)):
    """Lista todos os jobs de pipeline com status e resultado."""
    jobs = await Job.find(
        Job.user_id == str(user.id),
        Job.type == "pipeline",
    ).sort(-Job.created_at).limit(50).to_list()

    result = []
    for j in jobs:
        result.append({
            "id":             str(j.id),
            "finding_id":     j.config.get("finding_id", ""),
            "status":         j.status,
            "result_summary": j.result_summary,
            "error":          j.error,
            "logs":           j.logs[-5:],
            "started_at":     j.started_at.isoformat() if j.started_at else None,
            "finished_at":    j.finished_at.isoformat() if j.finished_at else None,
            "created_at":     j.created_at.isoformat(),
        })

    return result


@router.get("/jobs/{job_id}")
async def get_pipeline_job(job_id: str, user: User = Depends(get_current_user)):
    """Retorna detalhes completos e todos os logs de um job de pipeline."""
    from bson import ObjectId
    job = await Job.get(ObjectId(job_id))
    if not job or job.user_id != str(user.id) or job.type != "pipeline":
        raise HTTPException(status_code=404, detail="Job não encontrado")

    finding = None
    finding_id = job.config.get("finding_id", "")
    if finding_id:
        try:
            f = await Finding.get(ObjectId(finding_id))
            if f:
                finding = {"id": str(f.id), "title": f.title, "severity": f.severity, "status": f.status}
        except Exception:
            pass

    return {
        "id":             str(job.id),
        "finding_id":     finding_id,
        "finding":        finding,
        "status":         job.status,
        "result_summary": job.result_summary,
        "error":          job.error,
        "logs":           job.logs,
        "started_at":     job.started_at.isoformat() if job.started_at else None,
        "finished_at":    job.finished_at.isoformat() if job.finished_at else None,
        "created_at":     job.created_at.isoformat(),
    }
