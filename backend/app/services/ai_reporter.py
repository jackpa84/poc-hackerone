"""
services/ai_reporter.py — Geração e revisão de relatórios com IA

Provedor primário : Ollama local (xploiter/the-xploiter:latest em http://host.docker.internal:11434)
Fallback          : Claude (Anthropic) se o Ollama não estiver acessível

Fluxo de geração:
  1. Monta prompt estruturado no formato HackerOne
  2. Tenta Ollama via POST /api/generate (stream=false)
  3. Se falhar, cai no Claude via SDK Anthropic
  4. Retorna (markdown, prompt_tokens, completion_tokens)

Fluxo de revisão (pré-submissão):
  1. Recebe o markdown gerado
  2. Pede à IA para avaliar qualidade e formato HackerOne
  3. Retorna ReviewResult com score, notas e relatório corrigido se necessário
"""
import logging
import httpx
import anthropic

from app.config import settings
from app.models.finding import Finding

logger = logging.getLogger(__name__)


def _build_prompt(finding: Finding) -> str:
    return f"""Você é um especialista em bug bounty com experiência em reportar vulnerabilidades na HackerOne.

Gere um relatório profissional e completo para a seguinte vulnerabilidade, no formato Markdown.
O relatório deve ser claro, técnico e persuasivo para o time de triagem da HackerOne.

## Dados da vulnerabilidade:

**Título:** {finding.title}
**Tipo:** {finding.type}
**Severidade:** {finding.severity}
**CVSS:** {finding.cvss_score or "Não calculado"}
**URL afetada:** {finding.affected_url}
**Parâmetro vulnerável:** {finding.parameter or "N/A"}
**Payload:** {finding.payload or "N/A"}

**Descrição:**
{finding.description or "Não informada"}

**Passos para reproduzir:**
{finding.steps_to_reproduce or "Não informados"}

**Impacto:**
{finding.impact or "Não informado"}

---

Gere o relatório no seguinte formato:

# [título da vulnerabilidade]

## Severidade
[severidade e justificativa com base no CVSS 3.1]

## Resumo
[resumo executivo em 2-3 parágrafos explicando o que é, onde está e por que é perigoso]

## Passos para Reproduzir
[lista numerada detalhada, assumindo que o leitor tem uma conta básica no sistema]

## Impacto
[impacto técnico e de negócio: o que um atacante pode fazer, quais dados pode acessar]

## Material de Suporte
[instruções de onde adicionar screenshots/vídeos/requests do Burp]

## Recomendação de Correção
[como o time de desenvolvimento deve corrigir]

Escreva em português. Seja técnico mas acessível. Use formatação Markdown clara."""


async def _generate_ollama(prompt: str) -> tuple[str, int, int]:
    """Chama o Ollama local via REST API."""
    url = f"{settings.OLLAMA_URL.rstrip('/')}/api/generate"

    async with httpx.AsyncClient(timeout=settings.OLLAMA_TIMEOUT) as client:
        resp = await client.post(url, json={
            "model": settings.OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.7,
                "num_predict": 2048,
            },
        })
        resp.raise_for_status()
        data = resp.json()

    content = data.get("response", "").strip()
    if not content:
        raise ValueError("Ollama retornou resposta vazia")

    # Ollama não retorna contagem de tokens no mesmo formato — estimamos
    prompt_tokens = data.get("prompt_eval_count", len(prompt) // 4)
    completion_tokens = data.get("eval_count", len(content) // 4)

    return content, prompt_tokens, completion_tokens


async def _generate_claude(prompt: str) -> tuple[str, int, int]:
    """Chama o Claude via SDK Anthropic (fallback)."""
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )

    content = message.content[0].text
    prompt_tokens = message.usage.input_tokens
    completion_tokens = message.usage.output_tokens

    return content, prompt_tokens, completion_tokens


async def generate_report(finding: Finding) -> tuple[str, int, int]:
    """
    Gera relatório de bug bounty.
    Tenta Ollama primeiro; se falhar, usa Claude como fallback.
    Retorna: (markdown, prompt_tokens, completion_tokens)
    """
    prompt = _build_prompt(finding)

    # ── Tenta Ollama (modelo local) ────────────────────────────────────────
    try:
        content, pt, ct = await _generate_ollama(prompt)
        logger.info("[ai_reporter] Relatório gerado via Ollama (%s): %d tokens", settings.OLLAMA_MODEL, ct)
        return content, pt, ct
    except Exception as ollama_err:
        logger.warning("[ai_reporter] Ollama indisponível (%s) — usando Claude como fallback", ollama_err)

    # ── Fallback: Claude ───────────────────────────────────────────────────
    content, pt, ct = await _generate_claude(prompt)
    logger.info("[ai_reporter] Relatório gerado via Claude: %d tokens", ct)
    return content, pt, ct


# ── HackerOne format sections required ────────────────────────────────────────
_H1_REQUIRED_SECTIONS = [
    "Severidade",
    "Resumo",
    "Passos para Reproduzir",
    "Impacto",
    "Recomendação de Correção",
]


def _build_review_prompt(report_markdown: str, finding_title: str, severity: str) -> str:
    sections = "\n".join(f"- {s}" for s in _H1_REQUIRED_SECTIONS)
    return f"""Você é um revisor experiente de relatórios de bug bounty da HackerOne.
Analise o relatório abaixo e avalie:

1. Se contém TODAS as seções obrigatórias: {sections}
2. Se os passos para reproduzir são claros e numerados
3. Se o impacto está bem documentado
4. Se a severidade "{severity}" está justificada no texto
5. Se o português é técnico e profissional

RELATÓRIO A REVISAR:
---
{report_markdown}
---

Responda EXATAMENTE neste formato JSON (sem markdown, só o JSON):
{{
  "quality_score": <0-100>,
  "approved": <true/false — true se score >= 70>,
  "missing_sections": [<lista de seções faltando ou vazias>],
  "issues": [<lista de problemas encontrados, máx 5>],
  "suggestions": [<lista de melhorias específicas, máx 3>],
  "summary": "<1 frase resumindo a qualidade>"
}}"""


async def _review_via_ollama(prompt: str) -> str:
    url = f"{settings.OLLAMA_URL.rstrip('/')}/api/generate"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json={
            "model": settings.OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.2, "num_predict": 512},
        })
        resp.raise_for_status()
        return resp.json().get("response", "").strip()


async def _review_via_claude(prompt: str) -> str:
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()


class ReviewResult:
    def __init__(
        self,
        quality_score: int,
        approved: bool,
        missing_sections: list[str],
        issues: list[str],
        suggestions: list[str],
        summary: str,
    ):
        self.quality_score = quality_score
        self.approved = approved
        self.missing_sections = missing_sections
        self.issues = issues
        self.suggestions = suggestions
        self.summary = summary

    def to_dict(self) -> dict:
        return {
            "quality_score": self.quality_score,
            "approved": self.approved,
            "missing_sections": self.missing_sections,
            "issues": self.issues,
            "suggestions": self.suggestions,
            "summary": self.summary,
        }


async def review_report(report_markdown: str, finding_title: str, severity: str) -> ReviewResult:
    """
    Envia o relatório gerado para revisão da IA antes de submeter ao HackerOne.
    Verifica estrutura, qualidade e aderência ao formato H1.
    """
    import json

    # Validação estática rápida (sem IA)
    missing_static = [s for s in _H1_REQUIRED_SECTIONS if s.lower() not in report_markdown.lower()]

    prompt = _build_review_prompt(report_markdown, finding_title, severity)

    raw_json = ""
    try:
        try:
            raw_json = await _review_via_ollama(prompt)
        except Exception:
            if settings.ANTHROPIC_API_KEY:
                raw_json = await _review_via_claude(prompt)
            else:
                raise

        # Extrai JSON da resposta (pode ter texto ao redor)
        start = raw_json.find("{")
        end = raw_json.rfind("}") + 1
        if start >= 0 and end > start:
            raw_json = raw_json[start:end]

        data = json.loads(raw_json)
        return ReviewResult(
            quality_score=int(data.get("quality_score", 50)),
            approved=bool(data.get("approved", False)),
            missing_sections=data.get("missing_sections", missing_static),
            issues=data.get("issues", []),
            suggestions=data.get("suggestions", []),
            summary=data.get("summary", "Revisão automática"),
        )

    except Exception as e:
        logger.warning("[ai_reporter] Revisão falhou (%s) — usando validação estática", e)
        score = max(0, 100 - len(missing_static) * 20)
        return ReviewResult(
            quality_score=score,
            approved=len(missing_static) == 0,
            missing_sections=missing_static,
            issues=[f"Revisão automática indisponível: {e}"],
            suggestions=[],
            summary="Revisão estática (IA indisponível)",
        )
