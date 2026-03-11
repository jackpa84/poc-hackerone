from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends

from app.models.finding import Finding
from app.models.user import User
from app.schemas.finding import FindingCreate, FindingUpdate, FindingResponse
from app.dependencies import get_current_user

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
    """Retorna contagens por severidade e status (para o dashboard)."""
    findings = await Finding.find(Finding.user_id == str(user.id)).to_list()
    severity_counts = {}
    status_counts = {}
    for f in findings:
        severity_counts[f.severity] = severity_counts.get(f.severity, 0) + 1
        status_counts[f.status]     = status_counts.get(f.status, 0) + 1
    return {"by_severity": severity_counts, "by_status": status_counts, "total": len(findings)}


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


@router.get("/{finding_id}", response_model=FindingResponse)
async def get_finding(finding_id: str, user: User = Depends(get_current_user)):
    from bson import ObjectId
    f = await Finding.get(ObjectId(finding_id))
    if not f or f.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Finding não encontrado")
    return to_response(f)


@router.patch("/{finding_id}", response_model=FindingResponse)
async def update_finding(finding_id: str, data: FindingUpdate, user: User = Depends(get_current_user)):
    from bson import ObjectId
    f = await Finding.get(ObjectId(finding_id))
    if not f or f.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Finding não encontrado")
    update = data.model_dump(exclude_none=True)
    if "cvss_score" in update and update["cvss_score"] is not None:
        if not (0.0 <= update["cvss_score"] <= 10.0):
            raise HTTPException(status_code=422, detail="cvss_score deve estar entre 0.0 e 10.0")
    update["updated_at"] = datetime.utcnow()
    await f.set(update)
    return to_response(f)


@router.delete("/{finding_id}", status_code=204)
async def delete_finding(finding_id: str, user: User = Depends(get_current_user)):
    from bson import ObjectId
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
    from bson import ObjectId
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
