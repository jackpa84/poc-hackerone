"""
services/ai_reporter.py — Geração e revisão de relatórios com IA

Provedor primário : Ollama local (xploiter/the-xploiter:latest em http://host.docker.internal:11434)
Fallback          : Claude (Anthropic) se o Ollama não estiver acessível

Fluxo de geração:
  1. Monta prompt estruturado no formato HackerOne
  2. Tenta Ollama via POST /api/generate (stream=false)
  3. Se falhar, cai no Claude via SDK Anthropic (AsyncAnthropic)
  4. Retorna (markdown, prompt_tokens, completion_tokens, model_used)

Fluxo de revisão (pré-submissão):
  1. Recebe o markdown gerado
  2. Valida estaticamente as seções obrigatórias
  3. Valida o CONTEÚDO mínimo de cada seção (não apenas o header)
  4. Pede à IA para avaliar qualidade e formato HackerOne
  5. Retorna ReviewResult com score, notas e relatório corrigido se necessário
"""
import json
import logging
import re
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
[severidade e justificativa com base no CVSS 3.1 — inclua o score numérico e o vetor CVSS]

## Resumo
[resumo executivo em 2-3 parágrafos explicando o que é, onde está e por que é perigoso]

## Passos para Reproduzir
[lista numerada detalhada, assumindo que o leitor tem uma conta básica no sistema]

## Impacto
[impacto técnico e de negócio: o que um atacante pode fazer, quais dados pode acessar, com estimativa de usuários afetados]

## Material de Suporte
[instruções de onde adicionar screenshots/vídeos/requests do Burp]

## Recomendação de Correção
[como o time de desenvolvimento deve corrigir — incluindo referências OWASP ou CVE se aplicável]

Escreva em português. Seja técnico mas acessível. Use formatação Markdown clara.
Cada seção deve ter pelo menos 2 parágrafos ou 3 itens de lista. Não deixe seções vazias."""


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

    prompt_tokens = data.get("prompt_eval_count", len(prompt) // 4)
    completion_tokens = data.get("eval_count", len(content) // 4)

    return content, prompt_tokens, completion_tokens


async def _generate_claude(prompt: str) -> tuple[str, int, int]:
    """Chama o Claude via SDK Anthropic async (fallback)."""
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )

    content = message.content[0].text
    prompt_tokens = message.usage.input_tokens
    completion_tokens = message.usage.output_tokens

    return content, prompt_tokens, completion_tokens


async def generate_report(finding: Finding) -> tuple[str, int, int, str]:
    """
    Gera relatório de bug bounty.
    Tenta Ollama primeiro; se falhar, usa Claude como fallback.
    Retorna: (markdown, prompt_tokens, completion_tokens, model_used)
    """
    prompt = _build_prompt(finding)

    # ── Tenta Ollama (modelo local) ────────────────────────────────────────
    try:
        content, pt, ct = await _generate_ollama(prompt)
        model_label = f"ollama/{settings.OLLAMA_MODEL}"
        logger.info("[ai_reporter] Relatório gerado via Ollama (%s): %d tokens", settings.OLLAMA_MODEL, ct)
        return content, pt, ct, model_label
    except Exception as ollama_err:
        logger.warning("[ai_reporter] Ollama indisponível (%s) — usando Claude como fallback", ollama_err)

    # ── Fallback: Claude ───────────────────────────────────────────────────
    content, pt, ct = await _generate_claude(prompt)
    logger.info("[ai_reporter] Relatório gerado via Claude: %d tokens", ct)
    return content, pt, ct, "claude-sonnet-4-6"


# ── HackerOne format sections required ────────────────────────────────────────
_H1_REQUIRED_SECTIONS = [
    "Severidade",
    "Resumo",
    "Passos para Reproduzir",
    "Impacto",
    "Recomendação de Correção",
]

# Minimum content length per section (chars after the header line)
_SECTION_MIN_CONTENT = 50


def _check_section_content(report_markdown: str) -> list[str]:
    """
    Valida não apenas se o header existe, mas se há conteúdo mínimo na seção.
    Retorna lista de seções ausentes ou com conteúdo insuficiente.
    """
    weak_sections = []
    lines = report_markdown.splitlines()

    for section in _H1_REQUIRED_SECTIONS:
        # Localiza o header da seção (## Título, case-insensitive)
        section_lower = section.lower()
        found_idx = None
        for i, line in enumerate(lines):
            if re.match(r"^#{1,3}\s+" + re.escape(section_lower), line.lower()):
                found_idx = i
                break

        if found_idx is None:
            weak_sections.append(section)
            continue

        # Coleta conteúdo até o próximo header
        content_lines = []
        for line in lines[found_idx + 1:]:
            if re.match(r"^#{1,3}\s+", line):
                break
            content_lines.append(line)

        content = "\n".join(content_lines).strip()
        if len(content) < _SECTION_MIN_CONTENT:
            weak_sections.append(f"{section} (conteúdo insuficiente)")

    return weak_sections


def _build_review_prompt(report_markdown: str, finding_title: str, severity: str) -> str:
    sections = "\n".join(f"- {s}" for s in _H1_REQUIRED_SECTIONS)
    return f"""Você é um revisor experiente de relatórios de bug bounty da HackerOne.
Analise o relatório abaixo e avalie com rigor:

1. Se contém TODAS as seções obrigatórias COM CONTEÚDO REAL (não apenas o header): {sections}
2. Se os passos para reproduzir são claros, numerados e suficientemente detalhados (mín. 3 passos)
3. Se o impacto está bem documentado com cenário real de ataque e dados afetados
4. Se a severidade "{severity}" está justificada com score CVSS 3.1 e vetor no texto
5. Se o português é técnico e profissional (sem erros gramaticais ou termos vagos como "pode causar problemas")
6. Se cada seção tem conteúdo substancial (pelo menos 2 parágrafos ou 3 itens de lista)

RELATÓRIO A REVISAR:
---
{report_markdown}
---

Responda EXATAMENTE neste formato JSON (sem markdown, só o JSON):
{{
  "quality_score": <0-100>,
  "approved": <true/false — true se score >= 70>,
  "missing_sections": [<lista de seções faltando ou com conteúdo insuficiente>],
  "issues": [<lista de problemas encontrados, máx 5>],
  "suggestions": [<lista de melhorias específicas e acionáveis, máx 3>],
  "summary": "<1 frase resumindo a qualidade>"
}}"""


async def _review_via_ollama(prompt: str) -> str:
    url = f"{settings.OLLAMA_URL.rstrip('/')}/api/generate"
    async with httpx.AsyncClient(timeout=settings.OLLAMA_TIMEOUT) as client:
        resp = await client.post(url, json={
            "model": settings.OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.2, "num_predict": 512},
        })
        resp.raise_for_status()
        return resp.json().get("response", "").strip()


async def _review_via_claude(prompt: str) -> str:
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = await client.messages.create(
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
    Verifica estrutura, conteúdo real e aderência ao formato H1.
    """
    # Validação estática com verificação de conteúdo (não apenas headers)
    missing_static = _check_section_content(report_markdown)

    prompt = _build_review_prompt(report_markdown, finding_title, severity)

    raw_json = ""
    try:
        try:
            raw_json = await _review_via_ollama(prompt)
        except Exception as ollama_err:
            logger.warning("[ai_reporter] Ollama review falhou (%s) — tentando Claude", ollama_err)
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

        # Mescla missing_sections da IA com as encontradas estaticamente
        ai_missing = data.get("missing_sections", [])
        merged_missing = list(set(missing_static + ai_missing))

        return ReviewResult(
            quality_score=int(data.get("quality_score", 50)),
            approved=bool(data.get("approved", False)),
            missing_sections=merged_missing,
            issues=data.get("issues", []),
            suggestions=data.get("suggestions", []),
            summary=data.get("summary", "Revisão automática"),
        )

    except Exception as e:
        logger.warning("[ai_reporter] Revisão falhou (%s) — usando validação estática de conteúdo", e)
        score = max(0, 100 - len(missing_static) * 20)
        return ReviewResult(
            quality_score=score,
            approved=len(missing_static) == 0,
            missing_sections=missing_static,
            issues=[f"Revisão automática indisponível: {e}"],
            suggestions=[],
            summary="Revisão estática de conteúdo (IA indisponível)",
        )


def extract_cvss_from_report(report_markdown: str) -> float | None:
    """
    Extrai o score CVSS numérico do markdown do relatório gerado.
    Busca padrões como: CVSS: 7.5, Score: 8.1, 9.1 (CVSS, etc.
    Retorna float ou None se não encontrado.
    """
    patterns = [
        r"cvss[:\s]+(\d+\.?\d*)",
        r"score[:\s]+(\d+\.?\d*)",
        r"(\d+\.\d+)\s*\(cvss",
        r"(\d+\.\d+)\s*/\s*10",
    ]
    for pattern in patterns:
        match = re.search(pattern, report_markdown.lower())
        if match:
            try:
                score = float(match.group(1))
                if 0.0 <= score <= 10.0:
                    return score
            except ValueError:
                continue
    return None
