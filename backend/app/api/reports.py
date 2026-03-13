from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.models.report import Report
from app.models.user import User
from app.dependencies import get_current_user

router = APIRouter(prefix="/reports", tags=["reports"])


class ReportCreate(BaseModel):
    finding_id: str


class ReportPatch(BaseModel):
    content_markdown: Optional[str] = None
    is_ready: Optional[bool] = None


async def _enqueue_report_generation(report_id: str):
    from arq import create_pool
    from arq.connections import RedisSettings
    from app.config import settings
    redis = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    await redis.enqueue_job("task_generate_report", report_id)
    await redis.aclose()


@router.post("", status_code=201)
async def create_report(data: ReportCreate, user: User = Depends(get_current_user)):
    """
    Cria um Report e enfileira a geração com IA.
    content_markdown será None até o worker concluir.
    """
    report = Report(user_id=str(user.id), finding_id=data.finding_id)
    await report.insert()
    await _enqueue_report_generation(str(report.id))
    return {"id": str(report.id), "status": "generating"}


@router.get("/{report_id}")
async def get_report(report_id: str, user: User = Depends(get_current_user)):
    """Retorna o relatório completo incluindo campos de revisão de qualidade."""
    from bson import ObjectId
    report = await Report.get(ObjectId(report_id))
    if not report or report.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    return {
        "id": str(report.id),
        "finding_id": report.finding_id,
        "content_markdown": report.content_markdown,
        "model_used": report.model_used,
        "model_used_actual": report.model_used_actual,
        "prompt_tokens": report.prompt_tokens,
        "completion_tokens": report.completion_tokens,
        "version": report.version,
        "is_ready": report.is_ready,
        "review_score": report.review_score,
        "review_approved": report.review_approved,
        "review_notes": report.review_notes,
        "created_at": report.created_at.isoformat(),
        "updated_at": report.updated_at.isoformat(),
    }


@router.patch("/{report_id}")
async def patch_report(report_id: str, data: ReportPatch, user: User = Depends(get_current_user)):
    """
    Edição manual do relatório ou override do is_ready.
    Atualiza apenas os campos fornecidos.
    """
    from bson import ObjectId
    report = await Report.get(ObjectId(report_id))
    if not report or report.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Relatório não encontrado")

    if data.content_markdown is not None:
        report.content_markdown = data.content_markdown
        # Limpa revisão anterior quando conteúdo é editado manualmente
        report.review_score = None
        report.review_approved = None
        report.review_notes = None

    if data.is_ready is not None:
        report.is_ready = data.is_ready

    await report.save()
    return {"id": str(report.id), "updated": True, "is_ready": report.is_ready}


@router.post("/{report_id}/regenerate")
async def regenerate_report(report_id: str, user: User = Depends(get_current_user)):
    """
    Solicita nova geração do relatório.
    Incrementa a versão, limpa o conteúdo anterior e os campos de revisão,
    e re-enfileira a geração.
    """
    from bson import ObjectId
    report = await Report.get(ObjectId(report_id))
    if not report or report.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Relatório não encontrado")

    report.content_markdown = None
    report.version += 1
    report.is_ready = False
    report.review_score = None
    report.review_approved = None
    report.review_notes = None
    await report.save()

    await _enqueue_report_generation(str(report.id))

    return {
        "id": str(report.id),
        "version": report.version,
        "status": "regenerating",
        "message": f"Relatório v{report.version} sendo gerado em background",
    }


@router.get("")
async def list_reports(user: User = Depends(get_current_user)):
    """Lista todos os relatórios do usuário com campos de revisão."""
    reports = await Report.find(Report.user_id == str(user.id)).sort(-Report.created_at).to_list()
    return [
        {
            "id": str(r.id),
            "finding_id": r.finding_id,
            "is_ready": r.is_ready,
            "version": r.version,
            "review_score": r.review_score,
            "review_approved": r.review_approved,
            "model_used_actual": r.model_used_actual,
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat(),
        }
        for r in reports
    ]
