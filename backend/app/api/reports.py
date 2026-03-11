from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.models.report import Report
from app.models.user import User
from app.services.job_dispatcher import dispatch_job
from app.dependencies import get_current_user

router = APIRouter(prefix="/reports", tags=["reports"])


class ReportCreate(BaseModel):
    finding_id: str


@router.post("", status_code=201)
async def create_report(data: ReportCreate, user: User = Depends(get_current_user)):
    """
    Cria um Report e enfileira a geração com Claude.
    content_markdown será None até o worker concluir.
    """
    report = Report(user_id=str(user.id), finding_id=data.finding_id)
    await report.insert()

    # Enfileira tarefa de geração de relatório
    from arq import create_pool
    from arq.connections import RedisSettings
    from app.config import settings
    redis = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    await redis.enqueue_job("task_generate_report", str(report.id))
    await redis.aclose()

    return {"id": str(report.id), "status": "generating"}


@router.get("/{report_id}")
async def get_report(report_id: str, user: User = Depends(get_current_user)):
    from bson import ObjectId
    report = await Report.get(ObjectId(report_id))
    if not report or report.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    return {
        "id": str(report.id),
        "finding_id": report.finding_id,
        "content_markdown": report.content_markdown,
        "model_used": report.model_used,
        "version": report.version,
        "created_at": report.created_at.isoformat(),
        "is_ready": report.content_markdown is not None,
    }


@router.get("")
async def list_reports(user: User = Depends(get_current_user)):
    reports = await Report.find(Report.user_id == str(user.id)).sort(-Report.created_at).to_list()
    return [{"id": str(r.id), "finding_id": r.finding_id,
             "is_ready": r.content_markdown is not None,
             "version": r.version, "created_at": r.created_at.isoformat()}
            for r in reports]
