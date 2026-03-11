"""
services/events.py — Sistema de eventos em tempo real via Redis Pub/Sub

Publica eventos no canal Redis do usuário.
O endpoint SSE /api/stream/events assina esse canal e encaminha ao browser.

Eventos disponíveis:
  job_update      — Job mudou de status (pending→running, running→completed/failed)
  finding_new     — Novo finding criado automaticamente por um worker
  pipeline_step   — Passo do pipeline executado (geração IA, submissão H1, etc.)
  recon_done      — Reconhecimento de um target concluído com resumo
"""
import json
from app.database import redis_client


async def publish(user_id: str, event_type: str, payload: dict) -> None:
    """Publica um evento no canal Redis do usuário."""
    if not redis_client:
        return
    try:
        message = json.dumps({"type": event_type, **payload})
        await redis_client.publish(f"events:{user_id}", message)
    except Exception as e:
        print(f"[events] Falha ao publicar evento {event_type}: {e}")


# ── Helpers tipados ────────────────────────────────────────────────────────

async def job_update(user_id: str, job_id: str, job_type: str, status: str,
                     result_summary: dict | None = None, error: str | None = None):
    await publish(user_id, "job_update", {
        "job_id": job_id,
        "job_type": job_type,
        "status": status,
        "result_summary": result_summary,
        "error": error,
    })


async def finding_new(user_id: str, finding_id: str, title: str, severity: str,
                      finding_type: str, affected_url: str = ""):
    await publish(user_id, "finding_new", {
        "finding_id": finding_id,
        "title": title,
        "severity": severity,
        "finding_type": finding_type,
        "affected_url": affected_url,
    })


async def pipeline_step(user_id: str, job_id: str, step: str, message: str,
                        score: int | None = None, submitted: bool = False,
                        h1_report_id: str | None = None):
    await publish(user_id, "pipeline_step", {
        "job_id": job_id,
        "step": step,
        "message": message,
        "score": score,
        "submitted": submitted,
        "h1_report_id": h1_report_id,
    })


async def recon_done(user_id: str, target: str, subdomains: int = 0,
                     hosts: int = 0, urls: int = 0):
    await publish(user_id, "recon_done", {
        "target": target,
        "subdomains": subdomains,
        "hosts": hosts,
        "urls": urls,
    })
