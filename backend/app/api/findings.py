import logging
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.models.finding import Finding
from app.models.user import User
from app.schemas.finding import FindingCreate, FindingUpdate, FindingResponse
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/findings", tags=["findings"])


def to_response(f: Finding) -> FindingResponse:
    return FindingResponse(
        id=str(f.id), program_id=f.program_id, target_id=f.target_id,
        job_id=f.job_id, title=f.title, type=f.type, severity=f.severity,
        status=f.status, cvss_score=f.cvss_score, description=f.description,
        steps_to_reproduce=f.steps_to_reproduce, impact=f.impact,
        affected_url=f.affected_url, parameter=f.parameter, payload=f.payload,
        bounty_amount=f.bounty_amount,
        created_at=f.created_at.isoformat(), updated_at=f.updated_at.isoformat(),
    )


@router.get("", response_model=list[FindingResponse])
async def list_findings(
    program_id: str | None = None,
    severity: str | None = None,
    status: str | None = None,
    type: str | None = None,
    user: User = Depends(get_current_user),
):
    query = Finding.find(Finding.user_id == str(user.id))
    if program_id: query = query.find(Finding.program_id == program_id)
    if severity:   query = query.find(Finding.severity == severity)
    if status:     query = query.find(Finding.status == status)
    if type:       query = query.find(Finding.type == type)
    findings = await query.sort(-Finding.created_at).to_list()
    return [to_response(f) for f in findings]


@router.get("/stats")
async def findings_stats(user: User = Depends(get_current_user)):
    """Retorna contagens por severidade e status usando aggregation pipeline."""
    uid = str(user.id)
    result = await Finding.aggregate([
        {"$match": {"user_id": uid}},
        {"$facet": {
            "by_severity": [{"$group": {"_id": "$severity", "count": {"$sum": 1}}}],
            "by_status":   [{"$group": {"_id": "$status",   "count": {"$sum": 1}}}],
            "total":       [{"$count": "n"}],
        }},
    ]).to_list()

    facet = result[0] if result else {}
    return {
        "by_severity": {item["_id"]: item["count"] for item in facet.get("by_severity", [])},
        "by_status":   {item["_id"]: item["count"] for item in facet.get("by_status", [])},
        "total":       (facet.get("total") or [{"n": 0}])[0].get("n", 0),
    }


@router.post("", response_model=FindingResponse, status_code=201)
async def create_finding(data: FindingCreate, user: User = Depends(get_current_user)):
    payload = data.model_dump()
    if payload.get("cvss_score") is not None:
        if not (0.0 <= payload["cvss_score"] <= 10.0):
            raise HTTPException(status_code=422, detail="cvss_score deve estar entre 0.0 e 10.0")
    valid_severities = ("critical", "high", "medium", "low", "informational")
    if payload.get("severity") and payload["severity"] not in valid_severities:
        raise HTTPException(status_code=422, detail=f"severity deve ser um de: {valid_severities}")
    finding = Finding(user_id=str(user.id), **payload)
    await finding.insert()
    return to_response(finding)


# ── Bulk update ────────────────────────────────────────────────────────────────

class BulkUpdateRequest(BaseModel):
    ids: list[str]
    status: Optional[str] = None
    severity: Optional[str] = None

class BulkUpdateResponse(BaseModel):
    updated: int
    skipped: int


@router.patch("/bulk", response_model=BulkUpdateResponse)
async def bulk_update_findings(data: BulkUpdateRequest, user: User = Depends(get_current_user)):
    """Atualiza status e/ou severity de múltiplos findings de uma vez."""
    if not data.ids:
        raise HTTPException(status_code=422, detail="Forneça ao menos um ID")
    if not data.status and not data.severity:
        raise HTTPException(status_code=422, detail="Forneça status e/ou severity para atualizar")

    valid_statuses = ("new", "triaging", "accepted", "resolved", "duplicate", "not_applicable")
    valid_severities = ("critical", "high", "medium", "low", "informational")
    if data.status and data.status not in valid_statuses:
        raise HTTPException(status_code=422, detail=f"status inválido: {valid_statuses}")
    if data.severity and data.severity not in valid_severities:
        raise HTTPException(status_code=422, detail=f"severity inválida: {valid_severities}")

    uid = str(user.id)
    updated = 0
    skipped = 0

    for fid in data.ids:
        try:
            f = await Finding.get(ObjectId(fid))
            if not f or f.user_id != uid:
                skipped += 1
                continue
            patch: dict = {"updated_at": datetime.utcnow()}
            if data.status:
                patch["status"] = data.status
            if data.severity:
                patch["severity"] = data.severity
            await f.set(patch)
            updated += 1
        except Exception:
            skipped += 1

    return BulkUpdateResponse(updated=updated, skipped=skipped)


# ── CRUD individual ────────────────────────────────────────────────────────────

@router.get("/{finding_id}", response_model=FindingResponse)
async def get_finding(finding_id: str, user: User = Depends(get_current_user)):
    f = await Finding.get(ObjectId(finding_id))
    if not f or f.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Finding não encontrado")
    return to_response(f)


@router.patch("/{finding_id}", response_model=FindingResponse)
async def update_finding(finding_id: str, data: FindingUpdate, user: User = Depends(get_current_user)):
    from app.models.job import Job

    f = await Finding.get(ObjectId(finding_id))
    if not f or f.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Finding não encontrado")

    prev_status = f.status
    update = data.model_dump(exclude_none=True)
    if "cvss_score" in update and update["cvss_score"] is not None:
        if not (0.0 <= update["cvss_score"] <= 10.0):
            raise HTTPException(status_code=422, detail="cvss_score deve estar entre 0.0 e 10.0")
    update["updated_at"] = datetime.utcnow()
    await f.set(update)

    # Disparo event-driven: finding aceito → enfileira pipeline imediatamente
    new_status = update.get("status")
    if new_status == "accepted" and prev_status != "accepted":
        has_active = await Job.find_one(
            {"config.finding_id": finding_id},
            Job.type == "pipeline",
            Job.status.in_(["pending", "running", "completed"]),  # type: ignore[attr-defined]
        )
        if not has_active:
            try:
                from arq import create_pool
                from arq.connections import RedisSettings
                from app.config import settings as app_settings
                job = Job(
                    user_id=str(user.id),
                    program_id=f.program_id or "",
                    type="pipeline",
                    status="pending",
                    config={"finding_id": finding_id, "auto": True, "trigger": "status_accepted"},
                    logs=[f"[{datetime.utcnow().strftime('%H:%M:%S')}] Pipeline disparado ao aceitar finding"],
                )
                await job.insert()
                redis = await create_pool(RedisSettings.from_dsn(app_settings.REDIS_URL))
                arq_job = await redis.enqueue_job("task_auto_pipeline", str(job.id))
                if arq_job:
                    job.arq_job_id = arq_job.job_id
                    await job.save()
                await redis.aclose()
            except Exception as e:
                logger.error("[findings] Erro ao enfileirar pipeline para %s: %s", finding_id, e)

    return to_response(f)


@router.delete("/{finding_id}", status_code=204)
async def delete_finding(finding_id: str, user: User = Depends(get_current_user)):
    f = await Finding.get(ObjectId(finding_id))
    if not f or f.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Finding não encontrado")
    await f.delete()


@router.get("/{finding_id}/readiness")
async def finding_readiness(finding_id: str, user: User = Depends(get_current_user)):
    """
    Avalia o grau de prontidão de um finding para submissão.
    Retorna score (0-100), checklist de itens, pontos faltantes e sugestões.
    """
    from app.models.report import Report

    f = await Finding.get(ObjectId(finding_id))
    if not f or f.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Finding não encontrado")

    report = await Report.find_one(
        Report.finding_id == finding_id,
        Report.is_ready == True,
    )

    checks = []

    def chk(key: str, label: str, ok: bool, points: int, tip: str = ""):
        checks.append({"key": key, "label": label, "ok": ok, "points": points, "tip": tip})
        return points if ok else 0

    earned = 0
    total_points = 0

    def add(key, label, ok, points, tip=""):
        nonlocal earned, total_points
        total_points += points
        earned += chk(key, label, ok, points, tip)

    add("title",       "Título descritivo (>20 chars)",
        len(f.title or "") > 20, 10,
        "Seja específico: inclua o tipo de vuln e o endpoint afetado.")

    add("url",         "URL afetada preenchida",
        bool(f.affected_url and len(f.affected_url) > 5), 15,
        "Inclua a URL completa com parâmetros, ex: https://api.exemplo.com/v1/users/123")

    add("description", "Descrição com pelo menos 100 caracteres",
        len(f.description or "") >= 100, 15,
        "Explique o que é a vulnerabilidade, onde está e por que existe.")

    add("steps",       "Passos para reproduzir preenchidos",
        len(f.steps_to_reproduce or "") >= 50, 20,
        "Numerados e detalhados: passo 1, passo 2... para que qualquer triager reproduza.")

    add("impact",      "Impacto documentado",
        len(f.impact or "") >= 50, 15,
        "Descreva o impacto real: dados expostos, contas comprometidas, acesso indevido.")

    add("payload",     "Payload ou parâmetro vulnerável documentado",
        bool(f.payload or f.parameter), 10,
        "Inclua o payload exato que comprova a vulnerabilidade.")

    add("severity",    "Severidade justificada (não padrão 'medium' sem evidência)",
        not (f.severity == "medium" and not f.cvss_score and len(f.description or "") < 50), 5,
        "Argumente por que a severidade escolhida é a correta.")

    add("cvss",        "CVSS Score calculado",
        f.cvss_score is not None, 5,
        "Calcule em cvssscores.com e documente o vetor: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")

    add("report",      "Relatório de IA gerado",
        report is not None, 5,
        "Use o botão 'Gerar Relatório' para criar um draft profissional com Claude.")

    score = round(earned / total_points * 100) if total_points else 0

    if score >= 90:
        readiness_label = "Pronto para enviar"
        readiness_color = "green"
    elif score >= 70:
        readiness_label = "Quase pronto"
        readiness_color = "yellow"
    elif score >= 40:
        readiness_label = "Precisa de detalhes"
        readiness_color = "orange"
    else:
        readiness_label = "Incompleto"
        readiness_color = "red"

    missing = [c for c in checks if not c["ok"]]
    suggestions = [c["tip"] for c in missing if c["tip"]]

    return {
        "score":           score,
        "earned":          earned,
        "total":           total_points,
        "label":           readiness_label,
        "color":           readiness_color,
        "checks":          checks,
        "missing_count":   len(missing),
        "suggestions":     suggestions,
        "has_report":      report is not None,
        "report_id":       str(report.id) if report else None,
    }
