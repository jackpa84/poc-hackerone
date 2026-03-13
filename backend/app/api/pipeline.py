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


async def _enqueue_pipeline(user_id: str, finding_id: str, team_handle: str | None = None) -> Job:
    """Cria um Job de pipeline e o enfileira no Redis."""
    job = Job(
        user_id=user_id,
        type="pipeline",
        status="pending",
        config={
            "finding_id": finding_id,
            "team_handle": team_handle,
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


# Handle oficial do HackerOne para testes — não afeta reputação nem bounties
H1_SANDBOX_HANDLE = "security-test-sandbox"


class RunRequest(BaseModel):
    finding_id: str
    team_handle: str | None = None
    dry_run: bool = False   # True → envia para @security-test-sandbox (teste seguro)


@router.post("/run")
async def run_pipeline(data: RunRequest, user: User = Depends(get_current_user)):
    """Dispara o pipeline completo para um finding específico."""
    import re
    from bson import ObjectId

    finding = await Finding.get(ObjectId(data.finding_id))
    if not finding or finding.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Finding não encontrado")

    # Valida formato do team_handle antes de enfileirar (evita erro tardio na submissão H1)
    if data.team_handle and not data.dry_run:
        if not re.match(r"^[a-z0-9][a-z0-9\-]{1,}[a-z0-9]$", data.team_handle):
            raise HTTPException(
                status_code=422,
                detail="team_handle inválido: use apenas letras minúsculas, números e hífens (ex: empresa-sec)"
            )

    # Dry run → força o handle para o sandbox oficial do HackerOne
    effective_handle = H1_SANDBOX_HANDLE if data.dry_run else data.team_handle

    job = await _enqueue_pipeline(str(user.id), data.finding_id, effective_handle)

    return {
        "job_id": str(job.id),
        "finding_id": data.finding_id,
        "dry_run": data.dry_run,
        "team_handle": effective_handle,
        "status": "queued",
        "message": (
            f"[TESTE SANDBOX] Pipeline enfileirado para '{finding.title}' → @{H1_SANDBOX_HANDLE}"
            if data.dry_run else
            f"Pipeline enfileirado para '{finding.title}'"
        ),
    }


@router.post("/run-all")
async def run_pipeline_all(user: User = Depends(get_current_user)):
    """
    Executa o pipeline para todos os findings com status 'accepted'.
    Pula findings que já têm um job ativo (running ou pending).
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
        fid = str(finding.id)
        # Usa raw MongoDB filter para query em campo aninhado (config.finding_id)
        existing = await Job.find_one(
            {"user_id": uid, "type": "pipeline", "status": {"$in": ["running", "pending"]}, "config.finding_id": fid}
        )
        if existing:
            continue

        job = await _enqueue_pipeline(uid, fid)
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


@router.post("/test-submit")
async def test_submit_to_sandbox(data: RunRequest, user: User = Depends(get_current_user)):
    """
    Envia o relatório para o programa sandbox oficial do HackerOne (@security-test-sandbox).
    Seguro para testar: não afeta reputação, Signal nem bounties reais.
    O sandbox é mantido pelo próprio HackerOne para validar integrações de API.
    """
    from bson import ObjectId
    from app.models.report import Report
    from app.services import hackerone as h1

    uid = str(user.id)
    finding = await Finding.get(ObjectId(data.finding_id))
    if not finding or finding.user_id != uid:
        raise HTTPException(status_code=404, detail="Finding não encontrado")

    if not h1._has_credentials():
        raise HTTPException(status_code=503, detail="Credenciais HackerOne não configuradas")

    report = await Report.find_one(Report.finding_id == data.finding_id, Report.is_ready == True)

    title   = f"[SANDBOX TEST] {finding.title}"
    vuln    = report.content_markdown if report else (finding.description or "Teste de integração via API.")
    impact  = finding.impact or "Teste de integração — sem impacto real."

    try:
        result = await h1.submit_report(
            team_handle=H1_SANDBOX_HANDLE,
            title=title,
            vulnerability_information=vuln,
            impact=impact,
            severity_rating=finding.severity if finding.severity != "informational" else "none",
        )
        h1_report_id = result.get("data", {}).get("id", "?")
        return {
            "submitted": True,
            "sandbox": True,
            "team_handle": H1_SANDBOX_HANDLE,
            "h1_report_id": h1_report_id,
            "h1_url": f"https://hackerone.com/reports/{h1_report_id}",
            "message": f"✅ Teste enviado para @{H1_SANDBOX_HANDLE} — Report #{h1_report_id}",
            "note": "Este report foi enviado ao sandbox do HackerOne. Não afeta sua reputação.",
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro ao enviar para sandbox: {e}")


@router.post("/analyze")
async def analyze_finding(data: RunRequest, user: User = Depends(get_current_user)):
    """
    Análise imediata com IA antes da submissão ao HackerOne.

    1. Carrega o finding
    2. Avalia os 9 critérios de prontidão
    3. Gera relatório com Ollama (ou Claude como fallback)
    4. Retorna score, checklist detalhado, rascunho do relatório e recomendação
    """
    from bson import ObjectId
    from app.models.report import Report
    from app.services.ai_reporter import generate_report

    uid = str(user.id)
    finding = await Finding.get(ObjectId(data.finding_id))
    if not finding or finding.user_id != uid:
        raise HTTPException(status_code=404, detail="Finding não encontrado")

    # ── Avaliar prontidão ────────────────────────────────────────────────────
    checks = []

    def chk(key: str, label: str, ok: bool, points: int, tip: str):
        checks.append({"key": key, "label": label, "ok": ok, "points": points, "tip": tip})
        return points if ok else 0

    earned = 0
    earned += chk("title",       "Título descritivo (>20 chars)",          len(finding.title or "") > 20, 10, "Ex: [XSS Stored] Injeção de script em perfil público permite roubo de sessão")
    earned += chk("url",         "URL afetada preenchida",                  bool(finding.affected_url and len(finding.affected_url) > 5), 15, "Inclua a URL completa com parâmetros")
    earned += chk("description", "Descrição com ≥100 chars",               len(finding.description or "") >= 100, 15, "Explique o que é, onde está e por que existe")
    earned += chk("steps",       "Passos para reproduzir (≥50 chars)",      len(finding.steps_to_reproduce or "") >= 50, 20, "Numerados e detalhados para que qualquer triager reproduza")
    earned += chk("impact",      "Impacto documentado (≥50 chars)",         len(finding.impact or "") >= 50, 15, "Descreva o dano real: dados expostos, contas comprometidas")
    earned += chk("payload",     "Payload ou parâmetro vulnerável",         bool(finding.payload or finding.parameter), 10, "Inclua o payload exato que comprova a vulnerabilidade")
    earned += chk("severity",    "Severidade justificada",                  not (finding.severity == "medium" and not finding.cvss_score), 5, "Argumente por que essa severidade é correta com CVSS")
    earned += chk("cvss",        "CVSS Score calculado",                    finding.cvss_score is not None, 5, "Use cvssscores.com para calcular o vetor correto")

    report = await Report.find_one(Report.finding_id == data.finding_id, Report.is_ready == True)
    earned += chk("report",      "Relatório de IA gerado",                  report is not None, 5, "Gere o relatório para criar um draft profissional")

    score = round(earned / 100 * 100)

    if score >= 90:
        verdict = "✅ PRONTO — pode submeter ao HackerOne agora"
        verdict_level = "green"
    elif score >= 70:
        verdict = "⚡ QUASE PRONTO — recomendado submeter (score aceitável)"
        verdict_level = "yellow"
    elif score >= 50:
        verdict = "⚠ INCOMPLETO — preencha os campos faltantes antes de submeter"
        verdict_level = "orange"
    else:
        verdict = "❌ NÃO PRONTO — muitos campos críticos ausentes"
        verdict_level = "red"

    # ── Gerar relatório com IA (se ainda não existe) ─────────────────────────
    report_markdown = None
    report_id = None
    ai_error = None

    if report:
        report_markdown = report.content_markdown
        report_id = str(report.id)
    else:
        try:
            markdown, pt, ct, model_used = await generate_report(finding)
            new_report = Report(
                user_id=uid,
                finding_id=data.finding_id,
                content_markdown=markdown,
                prompt_tokens=pt,
                completion_tokens=ct,
                model_used_actual=model_used,
                is_ready=True,
            )
            await new_report.insert()
            report_markdown = markdown
            report_id = str(new_report.id)
            # Atualiza o check de relatório
            checks[-1]["ok"] = True
            earned += 5
            score = min(100, score + 5)
        except Exception as e:
            ai_error = str(e)

    missing = [c for c in checks if not c["ok"]]

    return {
        "finding_id":      data.finding_id,
        "finding_title":   finding.title,
        "finding_severity": finding.severity,
        "score":           score,
        "verdict":         verdict,
        "verdict_level":   verdict_level,
        "checks":          checks,
        "missing":         missing,
        "missing_count":   len(missing),
        "report_id":       report_id,
        "report_preview":  (report_markdown or "")[:800] if report_markdown else None,
        "ai_error":        ai_error,
        "ready_to_submit": score >= 70,
        "team_handle":     data.team_handle,
    }


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
