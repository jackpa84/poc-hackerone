"""
services/hackerone.py — Cliente assíncrono para a HackerOne Hacker API v1
"""
import httpx
from typing import Any

from app.config import settings

_BASE    = "https://api.hackerone.com/v1/hackers"
_BASE_V1 = "https://api.hackerone.com/v1"
_TIMEOUT = 20


def _auth() -> tuple[str, str]:
    return (settings.h1_username, settings.HACKERONE_API_TOKEN)


def _has_credentials() -> bool:
    return bool(settings.h1_username and settings.HACKERONE_API_TOKEN)


async def _get(path: str, params: dict | None = None) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            f"{_BASE}{path}",
            auth=_auth(),
            params=params or {},
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        return resp.json()


async def _post(path: str, payload: dict) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            f"{_BASE}{path}",
            auth=_auth(),
            json=payload,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        return resp.json()


async def _post_v1(path: str, payload: dict) -> dict[str, Any]:
    """POST para endpoints fora do prefixo /hackers (ex: /v1/reports/{id}/add_comment)."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            f"{_BASE_V1}{path}",
            auth=_auth(),
            json=payload,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        return resp.json()


async def list_programs(page: int = 1, size: int = 25) -> dict:
    return await _get("/programs", {"page[number]": page, "page[size]": size})


async def get_program(handle: str) -> dict:
    return await _get(f"/programs/{handle}")


async def get_structured_scopes(handle: str, page: int = 1, size: int = 100) -> dict:
    return await _get(f"/programs/{handle}/structured_scopes",
                      {"page[number]": page, "page[size]": size})


async def get_hacktivity(query: str = "", page: int = 1, size: int = 25) -> dict:
    params: dict[str, Any] = {"page[number]": page, "page[size]": size}
    if query:
        params["queryString"] = query
    return await _get("/hacktivity", params)


async def list_my_reports(page: int = 1, size: int = 25) -> dict:
    return await _get("/me/reports", {"page[number]": page, "page[size]": size})


async def get_report(report_id: int) -> dict:
    return await _get(f"/reports/{report_id}")


async def submit_report(
    team_handle: str,
    title: str,
    vulnerability_information: str,
    impact: str,
    severity_rating: str = "none",
    weakness_id: int | None = None,
    structured_scope_id: int | None = None,
) -> dict:
    attrs: dict[str, Any] = {
        "team_handle": team_handle,
        "title": title,
        "vulnerability_information": vulnerability_information,
        "impact": impact,
        "severity_rating": severity_rating,
    }
    if weakness_id:
        attrs["weakness_id"] = weakness_id
    if structured_scope_id:
        attrs["structured_scope_id"] = structured_scope_id
    return await _post("/reports", {"data": {"type": "report", "attributes": attrs}})


async def get_earnings(page: int = 1, size: int = 25) -> dict:
    return await _get("/me/earnings", {"page[number]": page, "page[size]": size})


async def get_inbox(page: int = 1, size: int = 25, state: str = "") -> dict:
    """Lista relatórios do hacker com filtro opcional por estado (inbox)."""
    params: dict[str, Any] = {"page[number]": page, "page[size]": size}
    if state:
        params["filter[state][]"] = state
    return await _get("/me/reports", params)


async def get_report_full(report_id: int) -> dict:
    """Retorna o relatório completo incluindo activities (thread de conversa)."""
    return await _get(f"/reports/{report_id}")


async def reply_to_report(report_id: int, message: str) -> dict:
    """Adiciona um comentário (reply) a um relatório no HackerOne."""
    payload = {
        "data": {
            "type": "activity-comment",
            "attributes": {"message": message},
        }
    }
    return await _post_v1(f"/reports/{report_id}/add_comment", payload)
