import re
from datetime import datetime
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.models.program import Program
from app.models.user import User
from app.schemas.program import ProgramCreate, ProgramUpdate, ProgramResponse
from app.dependencies import get_current_user

router = APIRouter(prefix="/programs", tags=["programs"])


class ImportUrlRequest(BaseModel):
    url: str


class ImportUrlResponse(BaseModel):
    name: str
    platform: str
    url: str
    scope_notes: str
    tags: list[str]
    max_bounty: float | None


def _slug_to_name(slug: str) -> str:
    return slug.replace("-", " ").replace("_", " ").title()


def _slug_from_url(path: str) -> str:
    parts = [p for p in path.strip("/").split("/") if p]
    return parts[-1] if parts else ""


def _extract_title(html: str) -> str:
    m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _clean_name(title: str) -> str:
    title = re.sub(r"\s+", " ", title).strip()
    for sep in [" | ", " - ", " – ", " · "]:
        if sep in title:
            title = title.split(sep)[0].strip()
    return title


def _is_bad_name(name: str) -> bool:
    bad = {"just a moment", "attention required", "loading", "403", "404", "undefined"}
    return any(b in name.lower() for b in bad) or len(name) < 3


@router.post("/import-url", response_model=ImportUrlResponse)
async def import_program_url(data: ImportUrlRequest, _: User = Depends(get_current_user)):
    url = data.url.strip()
    if not url.startswith("http"):
        url = "https://" + url

    parsed = urlparse(url)
    slug = _slug_from_url(parsed.path)
    name = ""
    scope_lines: list[str] = []
    tags: list[str] = []

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        try:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            html = resp.text
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Não foi possível acessar a URL: {exc}")

        raw = _extract_title(html)
        candidate = _clean_name(raw)
        if not _is_bad_name(candidate):
            name = candidate

        scopes = re.findall(r'"identifier"\s*:\s*"([^"]{3,})"', html)
        seen: set[str] = set()
        for s in scopes:
            if s in seen or s.startswith("http://schemas"):
                continue
            seen.add(s)
            if re.match(r"[\w*.-]+\.[a-z]{2,}", s):
                scope_lines.append(s)
            elif len(s) < 40:
                tags.append(s)

    if not name or _is_bad_name(name):
        name = _slug_to_name(slug) if slug else "Programa importado"

    return ImportUrlResponse(
        name=name, platform="hackerone", url=url,
        scope_notes="\n".join(scope_lines[:20]),
        tags=tags[:5], max_bounty=None,
    )


def to_response(p: Program) -> ProgramResponse:
    return ProgramResponse(
        id=str(p.id), name=p.name, platform=p.platform, url=p.url,
        status=p.status, scope_notes=p.scope_notes, max_bounty=p.max_bounty,
        tags=p.tags, created_at=p.created_at.isoformat(),
    )


@router.get("", response_model=list[ProgramResponse])
async def list_programs(user: User = Depends(get_current_user)):
    programs = await Program.find(Program.user_id == str(user.id)).to_list()
    return [to_response(p) for p in programs]


@router.post("", response_model=ProgramResponse, status_code=201)
async def create_program(data: ProgramCreate, user: User = Depends(get_current_user)):
    program = Program(user_id=str(user.id), **data.model_dump())
    await program.insert()
    return to_response(program)


@router.get("/{program_id}", response_model=ProgramResponse)
async def get_program(program_id: str, user: User = Depends(get_current_user)):
    from bson import ObjectId
    program = await Program.get(ObjectId(program_id))
    if not program or program.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Programa não encontrado")
    return to_response(program)


@router.patch("/{program_id}", response_model=ProgramResponse)
async def update_program(program_id: str, data: ProgramUpdate, user: User = Depends(get_current_user)):
    from bson import ObjectId
    program = await Program.get(ObjectId(program_id))
    if not program or program.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Programa não encontrado")
    update_data = data.model_dump(exclude_none=True)
    update_data["updated_at"] = datetime.utcnow()
    await program.set(update_data)
    return to_response(program)


@router.delete("/{program_id}", status_code=204)
async def delete_program(program_id: str, user: User = Depends(get_current_user)):
    from bson import ObjectId
    program = await Program.get(ObjectId(program_id))
    if not program or program.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Programa não encontrado")
    await program.delete()
