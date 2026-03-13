"""
workers/reports.py — Geração de relatórios com Claude em background

Fluxo:
  1. API cria Report com content_markdown=None e enfileira esta tarefa
  2. Worker carrega o Finding correspondente
  3. Worker chama o Claude via ai_reporter.py
  4. Worker salva o markdown gerado no Report
  5. Frontend detecta que content_markdown não é mais None e renderiza
"""
from bson import ObjectId
from app.models.report import Report
from app.models.finding import Finding
from app.services.ai_reporter import generate_report


async def task_generate_report(ctx, report_id: str):
    report = await Report.get(ObjectId(report_id))
    if not report:
        return

    finding = await Finding.get(ObjectId(report.finding_id))
    if not finding:
        report.content_markdown = "# Erro\n\nFinding não encontrado."
        await report.save()
        return

    try:
        markdown, prompt_tokens, completion_tokens, model_used = await generate_report(finding)

        report.content_markdown  = markdown
        report.prompt_tokens     = prompt_tokens
        report.completion_tokens = completion_tokens
        report.model_used_actual = model_used
        report.version          += 1
        report.is_ready          = True
        await report.save()

    except Exception as e:
        import traceback
        report.content_markdown = f"# Erro na geração\n\n```\n{traceback.format_exc()}\n```"
        await report.save()
