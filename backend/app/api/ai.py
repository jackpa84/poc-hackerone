"""api/ai.py — Endpoints para interação direta com a IA (chat livre + status dos provedores)"""
import httpx
import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Literal

from app.config import settings
from app.dependencies import get_current_user
from app.models.user import User
from app.models.finding import Finding

router = APIRouter(prefix="/ai", tags=["ai"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    provider: Literal["auto", "ollama", "claude"] = "auto"
    temperature: float = 0.7
    max_tokens: int = 2048
    system_prompt: str = ""


class ChatResponse(BaseModel):
    content: str
    provider_used: str
    prompt_tokens: int
    completion_tokens: int


class AnalyzeRequest(BaseModel):
    finding_id: str
    provider: Literal["auto", "ollama", "claude"] = "auto"
    temperature: float = 0.5


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _call_ollama(prompt: str, temperature: float, max_tokens: int) -> tuple[str, int, int]:
    url = f"{settings.OLLAMA_URL.rstrip('/')}/api/generate"
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, json={
            "model": settings.OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        })
        resp.raise_for_status()
        data = resp.json()
    content = data.get("response", "").strip()
    if not content:
        raise ValueError("Ollama retornou resposta vazia")
    return content, data.get("prompt_eval_count", len(prompt) // 4), data.get("eval_count", len(content) // 4)


def _call_claude(system: str, message: str, temperature: float, max_tokens: int) -> tuple[str, int, int]:
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY não configurada")
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=max_tokens,
        temperature=temperature,
        system=system,
        messages=[{"role": "user", "content": message}],
    )
    return msg.content[0].text, msg.usage.input_tokens, msg.usage.output_tokens


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def ai_status(_: User = Depends(get_current_user)):
    """Verifica disponibilidade dos provedores de IA e lista modelos Ollama instalados."""
    ollama_ok = False
    ollama_models: list[str] = []

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.OLLAMA_URL.rstrip('/')}/api/tags")
            if resp.status_code == 200:
                ollama_ok = True
                ollama_models = [m["name"] for m in resp.json().get("models", [])]
    except Exception:
        pass

    claude_ok = bool(settings.ANTHROPIC_API_KEY)
    active = "ollama" if ollama_ok else ("claude" if claude_ok else "none")

    return {
        "ollama": {
            "available": ollama_ok,
            "url": settings.OLLAMA_URL,
            "current_model": settings.OLLAMA_MODEL,
            "installed_models": ollama_models,
        },
        "claude": {
            "available": claude_ok,
            "model": "claude-sonnet-4-6",
        },
        "active_provider": active,
    }


@router.post("/chat", response_model=ChatResponse)
async def ai_chat(req: ChatRequest, _: User = Depends(get_current_user)):
    """Chat livre com a IA (Ollama ou Claude)."""
    system = req.system_prompt or (
        "Você é um assistente especialista em bug bounty, segurança ofensiva e pentest. "
        "Responda de forma técnica e direta, em português."
    )

    # Tenta Ollama
    if req.provider in ("auto", "ollama"):
        try:
            prompt = f"Sistema: {system}\n\nUsuário: {req.message}\n\nAssistente:"
            content, pt, ct = await _call_ollama(prompt, req.temperature, req.max_tokens)
            return ChatResponse(content=content, provider_used=f"ollama ({settings.OLLAMA_MODEL})", prompt_tokens=pt, completion_tokens=ct)
        except Exception:
            if req.provider == "ollama":
                raise HTTPException(status_code=503, detail="Ollama indisponível")

    # Claude
    content, pt, ct = _call_claude(system, req.message, req.temperature, req.max_tokens)
    return ChatResponse(content=content, provider_used="claude-sonnet-4-6", prompt_tokens=pt, completion_tokens=ct)


@router.post("/analyze/{finding_id}", response_model=ChatResponse)
async def analyze_finding(
    finding_id: str,
    req: AnalyzeRequest,
    user: User = Depends(get_current_user),
):
    """Analisa um finding existente com a IA (gera insights, CVE, recomendações)."""
    finding = await Finding.find_one(Finding.id == finding_id, Finding.user_id == str(user.id))  # type: ignore[arg-type]
    if not finding:
        raise HTTPException(status_code=404, detail="Finding não encontrado")

    prompt = f"""Analise esta vulnerabilidade de bug bounty e forneça:

1. **Análise técnica detalhada** do vetor de ataque
2. **CVEs relacionadas** (se houver)
3. **Score CVSS 3.1** estimado com justificativa
4. **Impacto de negócio** (dados expostos, ações possíveis)
5. **Recomendações de correção** (código ou configuração)
6. **Referências** (OWASP, CWE, artigos técnicos relevantes)

**Vulnerabilidade:**
- Título: {finding.title}
- Tipo: {finding.type}
- Severidade declarada: {finding.severity}
- URL: {finding.affected_url}
- Parâmetro: {finding.parameter or 'N/A'}
- Payload: {finding.payload or 'N/A'}
- Descrição: {finding.description or 'N/A'}
- Impacto: {finding.impact or 'N/A'}

Responda em português, seja técnico e específico."""

    system = "Você é um especialista sênior em segurança ofensiva com 15 anos de experiência em bug bounty e pentest."

    if req.provider in ("auto", "ollama"):
        try:
            full_prompt = f"Sistema: {system}\n\n{prompt}\n\nAssistente:"
            content, pt, ct = await _call_ollama(full_prompt, req.temperature, 3000)
            return ChatResponse(content=content, provider_used=f"ollama ({settings.OLLAMA_MODEL})", prompt_tokens=pt, completion_tokens=ct)
        except Exception:
            if req.provider == "ollama":
                raise HTTPException(status_code=503, detail="Ollama indisponível")

    content, pt, ct = _call_claude(system, prompt, req.temperature, 3000)
    return ChatResponse(content=content, provider_used="claude-sonnet-4-6", prompt_tokens=pt, completion_tokens=ct)
