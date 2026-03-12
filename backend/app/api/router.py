"""api/router.py — Agrega todos os routers da API com prefixo /api"""
from fastapi import APIRouter
from app.api import auth, programs, targets, jobs, findings, reports, logs, dashboard, hackerone, pipeline, stream, health, ai, comments

router = APIRouter(prefix="/api")
router.include_router(auth.router)
router.include_router(health.router)
router.include_router(ai.router)
router.include_router(dashboard.router)
router.include_router(programs.router)
router.include_router(targets.router)
router.include_router(jobs.router)
router.include_router(findings.router)
router.include_router(comments.router)
router.include_router(reports.router)
router.include_router(logs.router)
router.include_router(hackerone.router)
router.include_router(pipeline.router)
router.include_router(stream.router)
