"""api/health.py — Health check detalhado com métricas de todos os serviços"""
import asyncio
import time
from typing import Any

from fastapi import APIRouter
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings
from app import database

router = APIRouter(prefix="/health", tags=["health"])


async def _check_mongodb() -> dict[str, Any]:
    start = time.monotonic()
    client = AsyncIOMotorClient(
        settings.MONGO_URI,
        serverSelectionTimeoutMS=3000,
        connectTimeoutMS=3000,
    )
    try:
        await client.admin.command("ping")
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        try:
            status = await client.admin.command("serverStatus")
            conns = status.get("connections", {})
            mem = status.get("mem", {})
            return {
                "status": "up",
                "latency_ms": latency_ms,
                "connections_current": conns.get("current", 0),
                "connections_available": conns.get("available", 0),
                "memory_mb": mem.get("resident", 0),
            }
        except Exception:
            return {"status": "up", "latency_ms": latency_ms}
    except Exception as e:
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        return {"status": "down", "latency_ms": latency_ms, "error": str(e)[:120]}
    finally:
        client.close()


async def _check_redis() -> dict[str, Any]:
    start = time.monotonic()
    r = database.redis_client
    try:
        await r.ping()
        latency_ms = round((time.monotonic() - start) * 1000, 1)

        info = await r.info()
        arq_keys = await r.keys("arq:*")

        # ARQ usa sorted sets — zcard conta os elementos
        jobs_queued = 0
        try:
            jobs_queued = await r.zcard("arq:queue") if "arq:queue" in arq_keys else 0
        except Exception:
            pass

        jobs_in_progress = len([k for k in arq_keys if ":in-progress" in k])
        worker_keys = [k for k in arq_keys if "worker" in k]

        return {
            "status": "up",
            "latency_ms": latency_ms,
            "memory_mb": round(info.get("used_memory", 0) / 1024 / 1024, 1),
            "connected_clients": info.get("connected_clients", 0),
            "jobs_queued": jobs_queued,
            "jobs_in_progress": jobs_in_progress,
            "workers_registered": len(worker_keys),
        }
    except Exception as e:
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        return {"status": "down", "latency_ms": latency_ms, "error": str(e)[:120]}


@router.get("")
async def health_detailed():
    """Health check detalhado com métricas de MongoDB, Redis e workers ARQ."""
    t0 = time.monotonic()

    mongodb, redis = await asyncio.gather(
        _check_mongodb(),
        _check_redis(),
    )

    all_up = mongodb["status"] == "up" and redis["status"] == "up"

    return {
        "status": "healthy" if all_up else "degraded",
        "response_ms": round((time.monotonic() - t0) * 1000, 1),
        "services": {
            "api": {"status": "up", "version": "1.0.0"},
            "mongodb": mongodb,
            "redis": redis,
        },
    }
