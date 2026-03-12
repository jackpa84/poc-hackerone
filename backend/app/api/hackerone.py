"""api/hackerone.py — Endpoints da integração com HackerOne"""
import time
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from app.config import settings
from app.models.program import Program
from app.models.target import Target
from app.models.user import User
from app.models.hackerone_log import HackerOneLog
from app.dependencies import get_current_user
from app.services import hackerone as h1

router = APIRouter(prefix="/hackerone", tags=["hackerone"])


def _require_h1():
    if not h1._has_credentials():
        raise HTTPException(status_code=503, detail="Credenciais HackerOne não configuradas.")


async def _log(user_id: str, action: str, detail: str = "", meta: dict | None = None,
               error: str | None = None, duration_ms: int | None = None):
    await HackerOneLog(
        user_id=user_id, action=action,
        status="error" if error else "success",
        detail=detail, meta=meta or {},
        error=error, duration_ms=duration_ms,
        created_at=datetime.utcnow(),
    ).insert()


# ── Programs ──────────────────────────────────────────────────────────────

@router.get("/programs")
async def list_programs(page: int = Query(1, ge=1), size: int = Query(25, ge=1, le=100),
                        user: User = Depends(get_current_user)):
    _require_h1()
    t0 = time.monotonic()
    try:
        result = await h1.list_programs(page, size)
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "list_programs", f"{len(result.get('data', []))} programas (pág {page})",
                   {"page": page}, duration_ms=ms)
        return result
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "list_programs", "Erro", error=str(exc), duration_ms=ms)
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/programs/{handle}")
async def get_program(handle: str, user: User = Depends(get_current_user)):
    _require_h1()
    t0 = time.monotonic()
    try:
        result = await h1.get_program(handle)
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "get_program", f"@{handle}", {"handle": handle}, duration_ms=ms)
        return result
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "get_program", f"Erro @{handle}", {"handle": handle}, error=str(exc), duration_ms=ms)
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/programs/{handle}/sync")
async def sync_program(handle: str, user: User = Depends(get_current_user)):
    """Importa programa e scopes do HackerOne para o DB local."""
    _require_h1()
    uid = str(user.id)
    t0 = time.monotonic()
    try:
        prog_resp = await h1.get_program(handle)
        scopes_resp = await h1.get_structured_scopes(handle)
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await _log(uid, "sync", f"Erro ao buscar @{handle}", {"handle": handle}, error=str(exc), duration_ms=ms)
        raise HTTPException(status_code=502, detail=str(exc))

    prog_data = prog_resp.get("data", {})
    attrs = prog_data.get("attributes", {})
    name = attrs.get("name") or handle
    url = f"https://hackerone.com/{handle}"

    existing = await Program.find_one(Program.user_id == uid, Program.url == url)
    if existing:
        program = existing
        await program.set({"name": name, "scope_notes": attrs.get("policy", ""), "updated_at": datetime.utcnow()})
    else:
        program = Program(user_id=uid, name=name, platform="hackerone", url=url,
                          status="active", scope_notes=attrs.get("policy", ""), tags=["synced-h1"])
        await program.insert()

    scopes_data = scopes_resp.get("data", [])
    synced_targets = 0
    for scope in scopes_data:
        s_attrs = scope.get("attributes", {})
        asset_id = s_attrs.get("asset_identifier", "")
        if not asset_id:
            continue
        target_type = "wildcard" if "*" in asset_id else "ip_range" if s_attrs.get("asset_type") in ("CIDR", "IP_ADDRESS") else "domain"
        eligible = s_attrs.get("eligible_for_bounty", False)
        is_in_scope = s_attrs.get("eligible_for_submission", True) and eligible
        existing_target = await Target.find_one(Target.program_id == str(program.id), Target.value == asset_id)
        if existing_target:
            await existing_target.set({"is_in_scope": is_in_scope, "type": target_type})
        else:
            await Target(user_id=uid, program_id=str(program.id), value=asset_id,
                         type=target_type, is_in_scope=is_in_scope,
                         notes=f"bounty:{eligible}").insert()
            synced_targets += 1

    ms = int((time.monotonic() - t0) * 1000)
    await _log(uid, "sync", f"@{handle}: {synced_targets} novos targets",
               {"handle": handle, "program_id": str(program.id), "new_targets": synced_targets}, duration_ms=ms)
    return {"synced": True, "program_id": str(program.id), "program_name": name,
            "new_targets": synced_targets, "total_scopes": len(scopes_data)}


# ── Hacktivity ────────────────────────────────────────────────────────────

@router.get("/hacktivity")
async def get_hacktivity(q: str = Query(""), page: int = Query(1, ge=1),
                         size: int = Query(25, ge=1, le=100), user: User = Depends(get_current_user)):
    _require_h1()
    t0 = time.monotonic()
    try:
        result = await h1.get_hacktivity(q, page, size)
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "hacktivity", f"{len(result.get('data', []))} resultados",
                   {"query": q, "page": page}, duration_ms=ms)
        return result
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "hacktivity", "Erro", error=str(exc), duration_ms=ms)
        raise HTTPException(status_code=502, detail=str(exc))


# ── Reports ───────────────────────────────────────────────────────────────

@router.get("/reports")
async def list_my_reports(page: int = Query(1, ge=1), size: int = Query(25, ge=1, le=100),
                           user: User = Depends(get_current_user)):
    _require_h1()
    t0 = time.monotonic()
    try:
        result = await h1.list_my_reports(page, size)
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "list_reports", f"{len(result.get('data', []))} reports",
                   {"page": page}, duration_ms=ms)
        return result
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "list_reports", "Erro", error=str(exc), duration_ms=ms)
        raise HTTPException(status_code=502, detail=str(exc))


class SubmitReportRequest(BaseModel):
    team_handle: str
    title: str
    vulnerability_information: str
    impact: str
    severity_rating: str = "none"
    weakness_id: int | None = None
    structured_scope_id: int | None = None


@router.post("/reports/submit")
async def submit_report(data: SubmitReportRequest, user: User = Depends(get_current_user)):
    _require_h1()
    t0 = time.monotonic()
    try:
        result = await h1.submit_report(
            team_handle=data.team_handle, title=data.title,
            vulnerability_information=data.vulnerability_information,
            impact=data.impact, severity_rating=data.severity_rating,
            weakness_id=data.weakness_id, structured_scope_id=data.structured_scope_id,
        )
        ms = int((time.monotonic() - t0) * 1000)
        report_id = result.get("data", {}).get("id", "?")
        await _log(str(user.id), "submit_report", f"@{data.team_handle}: #{report_id}",
                   {"team_handle": data.team_handle, "h1_report_id": report_id}, duration_ms=ms)
        return result
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "submit_report", f"Erro @{data.team_handle}",
                   {"team_handle": data.team_handle}, error=str(exc), duration_ms=ms)
        raise HTTPException(status_code=502, detail=str(exc))


# ── Earnings ──────────────────────────────────────────────────────────────

@router.get("/earnings")
async def get_earnings(page: int = Query(1, ge=1), size: int = Query(25, ge=1, le=100),
                       user: User = Depends(get_current_user)):
    _require_h1()
    t0 = time.monotonic()
    try:
        result = await h1.get_earnings(page, size)
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "get_earnings", f"{len(result.get('data', []))} earnings",
                   {"page": page}, duration_ms=ms)
        return result
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "get_earnings", "Erro", error=str(exc), duration_ms=ms)
        raise HTTPException(status_code=502, detail=str(exc))


# ── Inbox ─────────────────────────────────────────────────────────────────

@router.get("/inbox")
async def get_inbox(
    page: int = Query(1, ge=1),
    size: int = Query(25, ge=1, le=100),
    state: str = Query(""),
    user: User = Depends(get_current_user),
):
    """Lista caixa postal do hacker — relatórios com filtro por estado."""
    _require_h1()
    t0 = time.monotonic()
    try:
        result = await h1.get_inbox(page, size, state)
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "inbox", f"{len(result.get('data', []))} reports (state={state or 'all'})",
                   {"page": page, "state": state}, duration_ms=ms)
        return result
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "inbox", "Erro", error=str(exc), duration_ms=ms)
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/inbox/{report_id}")
async def get_inbox_report(report_id: int, user: User = Depends(get_current_user)):
    """Retorna relatório completo com thread de atividades (conversa)."""
    _require_h1()
    t0 = time.monotonic()
    try:
        result = await h1.get_report_full(report_id)
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "inbox_view", f"#{report_id}", {"report_id": report_id}, duration_ms=ms)
        return result
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "inbox_view", f"Erro #{report_id}", {"report_id": report_id}, error=str(exc), duration_ms=ms)
        raise HTTPException(status_code=502, detail=str(exc))


class ReplyRequest(BaseModel):
    message: str


@router.post("/inbox/{report_id}/reply")
async def reply_to_report(report_id: int, data: ReplyRequest, user: User = Depends(get_current_user)):
    """Envia uma resposta/comentário a um relatório no HackerOne."""
    _require_h1()
    t0 = time.monotonic()
    try:
        result = await h1.reply_to_report(report_id, data.message)
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "inbox_reply", f"#{report_id}", {"report_id": report_id}, duration_ms=ms)
        return result
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        await _log(str(user.id), "inbox_reply", f"Erro #{report_id}", {"report_id": report_id}, error=str(exc), duration_ms=ms)
        raise HTTPException(status_code=502, detail=str(exc))


# ── Status ────────────────────────────────────────────────────────────────

@router.get("/status")
async def h1_status(_: User = Depends(get_current_user)):
    return {"configured": h1._has_credentials(), "username": settings.h1_username}


# ── Logs ──────────────────────────────────────────────────────────────────

@router.get("/logs")
async def get_logs(page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=200),
                   action: str = Query(""), status: str = Query("", alias="status"),
                   user: User = Depends(get_current_user)):
    uid = str(user.id)
    query = HackerOneLog.find(HackerOneLog.user_id == uid)
    if action:
        query = query.find(HackerOneLog.action == action)
    if status:
        query = query.find(HackerOneLog.status == status)
    total = await query.count()
    logs = await query.sort(-HackerOneLog.created_at).skip((page - 1) * size).limit(size).to_list()
    return {
        "total": total, "page": page, "size": size,
        "data": [{"id": str(l.id), "action": l.action, "status": l.status,
                  "detail": l.detail, "meta": l.meta, "error": l.error,
                  "duration_ms": l.duration_ms, "created_at": l.created_at.isoformat()}
                 for l in logs],
    }


@router.get("/logs/stats")
async def get_logs_stats(user: User = Depends(get_current_user)):
    uid = str(user.id)
    total = await HackerOneLog.find(HackerOneLog.user_id == uid).count()
    errors = await HackerOneLog.find(HackerOneLog.user_id == uid, HackerOneLog.status == "error").count()
    syncs = await HackerOneLog.find(HackerOneLog.user_id == uid, HackerOneLog.action == "sync").count()
    submissions = await HackerOneLog.find(HackerOneLog.user_id == uid, HackerOneLog.action == "submit_report").count()
    return {"total": total, "errors": errors, "syncs": syncs, "submissions": submissions,
            "success_rate": round((total - errors) / total * 100, 1) if total > 0 else 100}
