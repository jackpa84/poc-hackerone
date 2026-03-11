"""api/logs.py — Logs em tempo real dos containers Docker via socket"""
from __future__ import annotations
import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
import aiodocker

from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/logs", tags=["logs"])

PLATFORM_PREFIX = "bugbounty-platform-"

SERVICE_META = {
    "backend":       {"label": "API Backend",   "description": "FastAPI — API principal"},
    "worker":        {"label": "Worker",         "description": "ARQ — tarefas em background"},
    "frontend":      {"label": "Frontend",       "description": "Next.js — interface web"},
    "mongodb":       {"label": "MongoDB",        "description": "Banco de dados principal"},
    "redis":         {"label": "Redis",          "description": "Fila de tarefas e cache"},
    "mongo-express": {"label": "Mongo Express",  "description": "UI de administração do banco"},
}


def _parse_container_name(names: list[str]) -> str | None:
    for name in names:
        clean = name.lstrip("/")
        if clean.startswith(PLATFORM_PREFIX):
            suffix = clean[len(PLATFORM_PREFIX):]
            return suffix.rsplit("-", 1)[0] if suffix and suffix[-1].isdigit() else suffix
    return None


def _parse_status(status: str, state: str) -> str:
    if state == "running": return "healthy"
    if state == "exited":  return "stopped"
    return "unhealthy"


def _detect_level(msg: str) -> str:
    upper = msg.upper()
    if any(k in upper for k in ("ERROR", "ERR", "FATAL", "⨯")): return "error"
    if any(k in upper for k in ("WARN", "WARNING")):             return "warn"
    if any(k in upper for k in ("INFO", "✓", "READY")):          return "info"
    if "DEBUG" in upper:                                          return "debug"
    return "stdout"


@router.get("/services")
async def list_services(_: User = Depends(get_current_user)):
    try:
        async with aiodocker.Docker() as docker:
            containers = await docker.containers.list(all=True)
            services = []
            for c in containers:
                info = c._container
                service_key = _parse_container_name(info.get("Names", []))
                if not service_key:
                    continue
                meta = SERVICE_META.get(service_key, {"label": service_key, "description": ""})
                state = info.get("State", "unknown")
                status_str = info.get("Status", "")
                started_at = None
                try:
                    details = await c.show()
                    started_at = details.get("State", {}).get("StartedAt")
                except Exception:
                    pass
                services.append({
                    "key": service_key, "container_id": info["Id"][:12],
                    "label": meta["label"], "description": meta["description"],
                    "state": state, "status": _parse_status(status_str, state),
                    "status_text": status_str, "started_at": started_at,
                })
        order = list(SERVICE_META.keys())
        services.sort(key=lambda s: order.index(s["key"]) if s["key"] in order else 99)
        return services
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Não foi possível conectar ao Docker: {exc}")


@router.get("/services/{service_key}")
async def get_service_logs(
    service_key: str,
    tail: int = Query(200, ge=1, le=5000),
    since: Optional[int] = Query(None),
    _: User = Depends(get_current_user),
):
    try:
        async with aiodocker.Docker() as docker:
            containers = await docker.containers.list(all=True)
            target = None
            for c in containers:
                key = _parse_container_name(c._container.get("Names", []))
                if key == service_key:
                    target = c
                    break
            if not target:
                raise HTTPException(status_code=404, detail=f"Serviço '{service_key}' não encontrado")
            params: dict = {"stdout": True, "stderr": True, "tail": str(tail), "timestamps": True}
            if since:
                params["since"] = str(since)
            raw = await target.log(**params)
            lines = []
            for line in raw:
                clean = line.rstrip("\n")
                if not clean:
                    continue
                ts, _, message = clean.partition(" ")
                lines.append({"timestamp": ts, "message": message, "level": _detect_level(message)})
        return {"service": service_key, "lines": lines}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao ler logs: {exc}")
