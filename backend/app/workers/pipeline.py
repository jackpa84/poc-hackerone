"""
workers/pipeline.py — Pipeline de automação

Orquestra o fluxo de um finding:
  1. Carrega o finding
  2. Gera relatório com IA (Claude/Ollama)
  3. Revisão automática da IA (checa formato HackerOne, qualidade do texto)
  4. Avalia o score de prontidão (checklist de 9 critérios)

Pode ser disparado:
  - Manualmente via POST /api/pipeline/run
  - Em lote via POST /api/pipeline/run-all (para todos os findings "accepted")
"""
import logging
from datetime import datetime
from bson import ObjectId

from app.models.finding import Finding
from app.models.report import Report
from app.models.job import Job
from app.services.ai_reporter import generate_report, review_report
from app.services import events as ev

logger = logging.getLogger(__name__)


async def _update_job(job: Job, log: str, status: str | None = None):
    job.logs.append(f"[{datetime.utcnow().strftime('%H:%M:%S')}] {log}")
    if status:
        job.status = status
    await job.save()


async def task_auto_pipeline(ctx, job_id: str):
    """
    Pipeline: finding → relatório IA → readiness check.
    Recebe o job_id de um Job com type='pipeline' já criado pela API.
    """
    job = await Job.get(ObjectId(job_id))
    if not job:
        return {"error": "Job não encontrado"}

    finding_id = job.config.get("finding_id")

    # ── Passo 0: Marcar como running ──────────────────────────────────────
    job.status = "running"
    job.started_at = datetime.utcnow()
    await _update_job(job, "Pipeline iniciado")
    await ev.pipeline_step(job.user_id, job_id, "started", "Pipeline iniciado")

    # ── Passo 1: Carregar finding ──────────────────────────────────────────
    finding = await Finding.get(ObjectId(finding_id))
    if not finding:
        await _update_job(job, "Finding não encontrado — abortando", "failed")
        job.error = "Finding não encontrado"
        await job.save()
        return

    await _update_job(job, f"Finding carregado: {finding.title} [{finding.severity.upper()}]")

    # ── Passo 2: Gerar relatório com IA ───────────────────────────────────
    await _update_job(job, "Gerando relatório com IA...")

    report = await Report.find_one(Report.finding_id == finding_id)
    if report and report.content_markdown:
        await _update_job(job, "Relatório já existe — reutilizando")
    else:
        try:
            markdown, prompt_tokens, completion_tokens = await generate_report(finding)

            if report:
                report.content_markdown = markdown
                report.prompt_tokens = prompt_tokens
                report.completion_tokens = completion_tokens
                report.is_ready = True
                await report.save()
            else:
                report = Report(
                    user_id=job.user_id,
                    finding_id=finding_id,
                    content_markdown=markdown,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    is_ready=True,
                )
                await report.insert()

            tok = prompt_tokens + completion_tokens
            await _update_job(job, f"Relatório gerado ({tok} tokens usados)")
            await ev.pipeline_step(job.user_id, job_id, "report_done", f"Relatório gerado ({tok} tokens)")
        except Exception as e:
            await _update_job(job, f"Erro na geração do relatório: {e}", "failed")
            job.error = str(e)
            await job.save()
            return

    # ── Passo 3: Revisão de qualidade pela IA ─────────────────────────────
    await _update_job(job, "Revisando qualidade e formato do relatório com IA...")
    review = None
    try:
        review = await review_report(
            report.content_markdown,
            finding.title,
            finding.severity,
        )
        review_dict = review.to_dict()

        # Salva resultado da revisão no report
        await report.set({
            "review_notes": review_dict,
            "review_score": review.quality_score,
            "review_approved": review.approved,
            "is_ready": review.approved,
        })

        review_log = (
            f"Revisão concluída: score={review.quality_score}/100 | "
            f"aprovado={review.approved} | {review.summary}"
        )
        await _update_job(job, review_log)

        if review.missing_sections:
            await _update_job(job, f"Seções faltando: {', '.join(review.missing_sections)}")
        if review.issues:
            for issue in review.issues[:3]:
                await _update_job(job, f"  ⚠ {issue}")

        await ev.pipeline_step(
            job.user_id, job_id, "review_done",
            f"Revisão: {review.quality_score}/100 — {review.summary}",
            score=review.quality_score,
        )
    except Exception as e:
        logger.warning("[pipeline] Revisão falhou para job=%s: %s", job_id, e)
        await _update_job(job, f"Revisão indisponível — continuando sem revisão: {e}")

    # ── Passo 4: Avaliar prontidão ────────────────────────────────────────
    await _update_job(job, "Avaliando prontidão do finding...")

    checks_passed = 0
    checks_total = 9

    if len(finding.title or "") > 20:           checks_passed += 1
    if finding.affected_url:                     checks_passed += 1
    if len(finding.description or "") >= 100:    checks_passed += 1
    if len(finding.steps_to_reproduce or "") >= 50: checks_passed += 1
    if len(finding.impact or "") >= 50:          checks_passed += 1
    if finding.payload or finding.parameter:     checks_passed += 1
    if finding.severity != "medium" or finding.cvss_score: checks_passed += 1
    if finding.cvss_score is not None:           checks_passed += 1
    if report and report.content_markdown:       checks_passed += 1

    score = round(checks_passed / checks_total * 100)
    await _update_job(job, f"Score de prontidão: {score}% ({checks_passed}/{checks_total} critérios)")
    await ev.pipeline_step(job.user_id, job_id, "readiness", f"Score: {score}%", score=score)

    # ── Passo 5: Submeter ao HackerOne (se aprovado e score >= 70) ───────
    h1_report_id = None
    submitted = False
    team_handle = job.config.get("team_handle")

    should_submit = (
        review is not None and review.approved
        and score >= 70
        and bool(team_handle)
    )

    if should_submit:
        await _update_job(job, f"Submetendo ao HackerOne (@{team_handle})...")
        try:
            from app.services import hackerone as h1

            severity_map = {"critical": "critical", "high": "high", "medium": "medium", "low": "low"}
            severity_rating = severity_map.get(finding.severity, "none")

            result = await h1.submit_report(
                team_handle=team_handle,
                title=finding.title,
                vulnerability_information=report.content_markdown,
                impact=finding.impact or "Ver relatório completo.",
                severity_rating=severity_rating,
            )
            h1_report_id = result.get("data", {}).get("id")
            submitted = True
            await _update_job(job, f"✅ Report #{h1_report_id} enviado ao HackerOne com sucesso!")
            await ev.pipeline_step(
                job.user_id, job_id, "submitted",
                f"Report #{h1_report_id} submetido ao HackerOne",
                score=score,
            )
        except Exception as e:
            logger.warning("[pipeline] Submissão H1 falhou para job=%s: %s", job_id, e)
            await _update_job(job, f"⚠ Submissão ao HackerOne falhou: {e}")
    else:
        reasons = []
        if not team_handle:
            reasons.append("team_handle não configurado")
        if review and not review.approved:
            reasons.append(f"revisão reprovada (score {review.quality_score}/100)")
        if score < 70:
            reasons.append(f"score de prontidão insuficiente ({score}%)")
        await _update_job(job, f"Submissão pulada — {'; '.join(reasons) or 'condições não atendidas'}")

    # ── Finalizar ─────────────────────────────────────────────────────────
    job.result_summary = {
        "score": score,
        "review_score": review.quality_score if review else None,
        "review_approved": review.approved if review else None,
        "submitted": submitted,
        "h1_report_id": h1_report_id,
    }
    job.status = "completed"
    job.finished_at = datetime.utcnow()
    await _update_job(job, f"Pipeline concluído — score {score}% | enviado={submitted}", "completed")
    await job.save()
