"""
api/stream.py — Endpoint SSE (Server-Sent Events) para atualizações em tempo real

Fluxo:
  Browser → GET /api/stream/events?token=<jwt>
         ← data: {"type": "connected"}\n\n
         ← data: {"type": "heartbeat", ...stats}\n\n   (a cada 3s)
         ← data: {"type": "job_update", ...}\n\n        (instantâneo)
         ← data: {"type": "finding_new", ...}\n\n       (instantâneo)
         ← data: {"type": "pipeline_step", ...}\n\n     (instantâneo)
         ← data: {"type": "recon_done", ...}\n\n        (instantâneo)

Métricas no heartbeat (fontes de monitoramento):
  - Findings: total, por severidade, por status, velocidade (última 1h/24h)
  - Jobs: ativos, fila ARQ, workers registrados, completados/falhos hoje
  - Reports: total, prontos, score médio de revisão
  - Targets: total, in-scope, com recon recente
  - Bounty: total earned, último bounty
  - Saúde: latência MongoDB, latência Redis, memória Redis
  - Pipeline: reports gerados hoje, score médio

Auth: token JWT passado como query param (EventSource não suporta headers)
"""
import asyncio
import json
import time
from datetime import datetime, timedelta

import redis.asyncio as aioredis
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse

from app.config import settings
from app.services.auth import decode_token, get_user_by_id
from app.models.job import Job
from app.models.finding import Finding
from app.models.report import Report
from app.models.target import Target
from app import database

router = APIRouter(prefix="/stream", tags=["stream"])

HEARTBEAT_INTERVAL = 3.0   # segundos entre heartbeats com stats
LOOP_SLEEP        = 0.05   # 50ms — polling do pub/sub


async def _container_health() -> list:
    """Lê status de todos os containers Docker para o painel de saúde."""
    try:
        import aiodocker
        PLATFORM_PREFIX = "bugbounty-platform-"
        SERVICE_ORDER = ["backend", "worker", "frontend", "mongodb", "redis"]

        async with aiodocker.Docker() as docker:
            containers = await docker.containers.list(all=True)
            services = []
            for c in containers:
                info = c._container
                names = info.get("Names", [])
                name = None
                for n in names:
                    clean = n.lstrip("/")
                    if clean.startswith(PLATFORM_PREFIX):
                        suffix = clean[len(PLATFORM_PREFIX):]
                        name = suffix.rsplit("-", 1)[0] if suffix and suffix[-1].isdigit() else suffix
                        break
                if not name:
                    continue

                state = info.get("State", "unknown")
                status_txt = info.get("Status", "")

                # Tempo de uptime
                started_at = None
                uptime_s = None
                try:
                    details = await c.show()
                    started_at = details.get("State", {}).get("StartedAt")
                    # Métricas de uso (CPU/mem via stats — non-blocking)
                    if state == "running":
                        stats = await c.stats(stream=False)
                        cpu_delta = stats.get("cpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0) \
                                  - stats.get("precpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0)
                        sys_delta = stats.get("cpu_stats", {}).get("system_cpu_usage", 0) \
                                  - stats.get("precpu_stats", {}).get("system_cpu_usage", 0)
                        ncpus = stats.get("cpu_stats", {}).get("online_cpus", 1) or 1
                        cpu_pct = round((cpu_delta / sys_delta) * ncpus * 100, 1) if sys_delta > 0 else 0.0

                        mem = stats.get("memory_stats", {})
                        mem_used = mem.get("usage", 0) - mem.get("stats", {}).get("cache", 0)
                        mem_limit = mem.get("limit", 1) or 1
                        mem_pct = round(mem_used / mem_limit * 100, 1)
                        mem_mb = round(mem_used / 1024 / 1024, 1)

                        services.append({
                            "name": name,
                            "state": state,
                            "status": status_txt,
                            "started_at": started_at,
                            "cpu_pct": cpu_pct,
                            "mem_pct": mem_pct,
                            "mem_mb": mem_mb,
                        })
                    else:
                        services.append({
                            "name": name,
                            "state": state,
                            "status": status_txt,
                            "started_at": started_at,
                            "cpu_pct": 0.0,
                            "mem_pct": 0.0,
                            "mem_mb": 0.0,
                        })
                except Exception:
                    services.append({
                        "name": name,
                        "state": state,
                        "status": status_txt,
                        "started_at": None,
                        "cpu_pct": None,
                        "mem_pct": None,
                        "mem_mb": None,
                    })

            services.sort(
                key=lambda s: SERVICE_ORDER.index(s["name"]) if s["name"] in SERVICE_ORDER else 99
            )
            return services
    except Exception:
        return []


async def _queue_stats() -> dict:
    """Lê métricas da fila ARQ diretamente do Redis."""
    r = database.redis_client
    if not r:
        return {}
    try:
        arq_keys = await r.keys("arq:*")
        queued = 0
        try:
            if "arq:queue" in arq_keys:
                queued = await r.zcard("arq:queue")
        except Exception:
            pass
        in_progress = len([k for k in arq_keys if ":in-progress" in k])
        workers = len([k for k in arq_keys if "worker" in k])
        info = await r.info("memory")
        return {
            "queue_depth":    queued,
            "in_progress":    in_progress,
            "workers_active": workers,
            "redis_memory_mb": round(info.get("used_memory", 0) / 1024 / 1024, 1),
        }
    except Exception:
        return {}


async def _live_stats(user_id: str) -> dict:
    """
    Agrega métricas completas do usuário para o heartbeat SSE.
    Fontes: MongoDB (findings, jobs, reports, targets), Redis (fila ARQ).
    """
    try:
        now_dt = datetime.utcnow()
        cutoff_1h  = now_dt - timedelta(hours=1)
        cutoff_24h = now_dt - timedelta(hours=24)
        cutoff_today = now_dt.replace(hour=0, minute=0, second=0, microsecond=0)

        # Busca paralela de todas as coleções
        jobs_task      = Job.find(Job.user_id == user_id).sort(-Job.created_at).limit(50).to_list()
        findings_task  = Finding.find(Finding.user_id == user_id).to_list()
        reports_task   = Report.find(Report.user_id == user_id).to_list()
        targets_task   = Target.find(Target.user_id == user_id).to_list()
        queue_task     = _queue_stats()
        health_task    = _container_health()

        jobs, findings, reports, targets, queue, containers = await asyncio.gather(
            jobs_task, findings_task, reports_task, targets_task, queue_task, health_task
        )

        # ── Findings ──────────────────────────────────────────────────────
        by_sev    = {}
        by_status = {}
        bounty_total = 0.0
        last_bounty  = None
        findings_1h  = 0
        findings_24h = 0

        for f in findings:
            by_sev[f.severity]  = by_sev.get(f.severity, 0) + 1
            by_status[f.status] = by_status.get(f.status, 0) + 1
            if f.bounty_amount and f.bounty_amount > 0:
                bounty_total += f.bounty_amount
                if last_bounty is None or (f.reported_at and f.reported_at > (last_bounty or now_dt)):
                    last_bounty = f.bounty_amount
            if f.created_at and f.created_at >= cutoff_1h:
                findings_1h += 1
            if f.created_at and f.created_at >= cutoff_24h:
                findings_24h += 1

        # ── Jobs ──────────────────────────────────────────────────────────
        active_jobs     = sum(1 for j in jobs if j.status in ("running", "pending"))
        completed_today = sum(1 for j in jobs if j.status == "completed" and j.finished_at and j.finished_at >= cutoff_today)
        failed_today    = sum(1 for j in jobs if j.status == "failed" and j.finished_at and j.finished_at >= cutoff_today)
        jobs_by_type    = {}
        for j in jobs:
            jobs_by_type[j.type] = jobs_by_type.get(j.type, 0) + 1

        # Jobs recentes para o feed
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

        # Pipeline jobs recentes
        pipeline_jobs_list = [j for j in jobs if j.type == "pipeline"]
        recent_pipeline = [
            {
                "id":         str(j.id),
                "finding_id": j.config.get("finding_id", ""),
                "status":     j.status,
                "result":     j.result_summary,
                "logs":       j.logs[-3:],
                "created_at": j.created_at.isoformat(),
            }
            for j in pipeline_jobs_list[:5]
        ]

        # ── Reports ───────────────────────────────────────────────────────
        reports_ready  = sum(1 for r in reports if r.content_markdown is not None or r.is_ready)
        reports_today  = sum(1 for r in reports if r.created_at >= cutoff_today)
        scores = [r.review_score for r in reports if r.review_score is not None]
        avg_review_score = round(sum(scores) / len(scores)) if scores else None

        # ── Targets ───────────────────────────────────────────────────────
        targets_in_scope   = sum(1 for t in targets if t.is_in_scope)
        targets_with_recon = sum(1 for t in targets if t.last_recon_at and t.last_recon_at >= cutoff_24h)

        return {
            # Findings
            "total_findings":       len(findings),
            "findings_1h":          findings_1h,
            "findings_24h":         findings_24h,
            "by_severity":          by_sev,
            "by_status":            by_status,

            # Jobs
            "active_jobs":          active_jobs,
            "completed_today":      completed_today,
            "failed_today":         failed_today,
            "jobs_by_type":         jobs_by_type,
            "recent_jobs":          recent_jobs,
            "pipeline_jobs":        recent_pipeline,

            # Fila ARQ (Redis)
            "queue_depth":          queue.get("queue_depth", 0),
            "workers_active":       queue.get("workers_active", 0),
            "redis_memory_mb":      queue.get("redis_memory_mb", 0),

            # Reports / Pipeline IA
            "total_reports":        len(reports),
            "total_reports_ready":  reports_ready,
            "reports_today":        reports_today,
            "avg_review_score":     avg_review_score,

            # Targets
            "total_targets":        len(targets),
            "targets_in_scope":     targets_in_scope,
            "targets_with_recon_24h": targets_with_recon,

            # Bounty
            "bounty_earned":        bounty_total,

            # Saúde dos containers Docker
            "containers":           containers,
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
