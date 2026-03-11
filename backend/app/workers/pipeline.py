"""
workers/pipeline.py — Pipeline de automação

Orquestra o fluxo de um finding:
  1. Carrega o finding
  2. Gera relatório com IA (Claude/Ollama)
  3. Avalia o score de prontidão (checklist de 9 critérios)

Pode ser disparado:
  - Manualmente via POST /api/pipeline/run
  - Em lote via POST /api/pipeline/run-all (para todos os findings "accepted")
"""
from datetime import datetime
from bson import ObjectId

from app.models.finding import Finding
from app.models.report import Report
from app.models.job import Job
from app.services.ai_reporter import generate_report
from app.services import events as ev


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

    # ── Passo 3: Avaliar prontidão ────────────────────────────────────────
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

    # ── Finalizar ─────────────────────────────────────────────────────────
    job.result_summary = {"score": score}
    job.status = "completed"
    job.finished_at = datetime.utcnow()
    await _update_job(job, f"Pipeline concluído com score {score}%", "completed")
    await job.save()
