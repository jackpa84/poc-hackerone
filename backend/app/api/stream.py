"""
api/stream.py — Endpoint SSE (Server-Sent Events) para atualizações em tempo real

Fluxo:
  Browser → GET /api/stream/events?token=<jwt>
         ← data: {"type": "connected"}\n\n
         ← data: {"type": "heartbeat", ...stats}\n\n   (a cada 3s)
         ← data: {"type": "job_update", ...}\n\n        (instantâneo)
         ← data: {"type": "finding_new", ...}\n\n       (instantâneo)
         ← data: {"type": "pipeline_step", ...}\n\n     (instantâneo)

Auth: token JWT passado como query param (EventSource não suporta headers)
"""
import asyncio
import json
import time

import redis.asyncio as aioredis
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse

from app.config import settings
from app.services.auth import decode_token, get_user_by_id
from app.models.job import Job
from app.models.finding import Finding
from app.models.report import Report

router = APIRouter(prefix="/stream", tags=["stream"])

HEARTBEAT_INTERVAL = 3.0   # segundos entre heartbeats com stats
LOOP_SLEEP        = 0.05   # 50ms — polling do pub/sub


async def _live_stats(user_id: str) -> dict:
    """Agrega métricas atuais do usuário para o heartbeat."""
    try:
        jobs = await Job.find(Job.user_id == user_id).sort(-Job.created_at).limit(20).to_list()
        findings = await Finding.find(Finding.user_id == user_id).to_list()
        reports = await Report.find(Report.user_id == user_id).to_list()

        by_sev = {}
        for f in findings:
            by_sev[f.severity] = by_sev.get(f.severity, 0) + 1

        by_status = {}
        for f in findings:
            by_status[f.status] = by_status.get(f.status, 0) + 1

        recent_jobs = [
            {
                "id":             str(j.id),
                "type":           j.type,
                "status":         j.status,
                "result_summary": j.result_summary,
                "created_at":     j.created_at.isoformat(),
            }
            for j in jobs[:8]
        ]

        pipeline_jobs = [j for j in jobs if j.type == "pipeline"]
        recent_pipeline = [
            {
                "id":          str(j.id),
                "finding_id":  j.config.get("finding_id", ""),
                "status":      j.status,
                "result":      j.result_summary,
                "logs":        j.logs[-3:],
                "created_at":  j.created_at.isoformat(),
            }
            for j in pipeline_jobs[:5]
        ]

        return {
            "total_findings":  len(findings),
            "active_jobs":     sum(1 for j in jobs if j.status in ("running", "pending")),
            "total_reports":   len(reports),
            "by_severity":     by_sev,
            "by_status":       by_status,
            "recent_jobs":     recent_jobs,
            "pipeline_jobs":   recent_pipeline,
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/events")
async def sse_events(token: str = Query(..., description="JWT token")):
    """
    SSE endpoint — requer token JWT como query param.
    Mantém conexão aberta e envia eventos em tempo real.
    """
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido")

    user = await get_user_by_id(user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    async def generator():
        r = None
        pubsub = None
        try:
            # Conexão Redis dedicada para pub/sub
            r = aioredis.Redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
            pubsub = r.pubsub()
            await pubsub.subscribe(f"events:{user_id}")

            # Evento inicial de conexão
            yield f"data: {json.dumps({'type': 'connected', 'user_id': user_id})}\n\n"

            last_heartbeat = 0.0

            while True:
                now = time.monotonic()

                # ── Verifica mensagens pub/sub ──────────────────────────────
                try:
                    msg = await pubsub.get_message(
                        ignore_subscribe_messages=True,
                        timeout=LOOP_SLEEP,
                    )
                    if msg and isinstance(msg.get("data"), str):
                        yield f"data: {msg['data']}\n\n"
                except Exception:
                    pass

                # ── Heartbeat com stats a cada HEARTBEAT_INTERVAL ───────────
                if now - last_heartbeat >= HEARTBEAT_INTERVAL:
                    stats = await _live_stats(user_id)
                    yield f"data: {json.dumps({'type': 'heartbeat', **stats})}\n\n"
                    last_heartbeat = now

                await asyncio.sleep(LOOP_SLEEP)

        except asyncio.CancelledError:
            pass
        except GeneratorExit:
            pass
        finally:
            if pubsub:
                try:
                    await pubsub.unsubscribe(f"events:{user_id}")
                    await pubsub.aclose()
                except Exception:
                    pass
            if r:
                try:
                    await r.aclose()
                except Exception:
                    pass

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "Connection":       "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
