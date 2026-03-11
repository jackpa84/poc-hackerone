"""
services/ai_reporter.py — Geração de relatórios com IA

Provedor primário : Ollama local (xploiter/the-xploiter:latest em http://host.docker.internal:11434)
Fallback          : Claude (Anthropic) se o Ollama não estiver acessível

Fluxo:
  1. Monta prompt estruturado no formato HackerOne
  2. Tenta Ollama via POST /api/generate (stream=false)
  3. Se falhar, cai no Claude via SDK Anthropic
  4. Retorna (markdown, prompt_tokens, completion_tokens)
"""
import httpx
import anthropic

from app.config import settings
from app.models.finding import Finding


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

    async with httpx.AsyncClient(timeout=120) as client:
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
        print(f"[ai_reporter] Relatório gerado via Ollama ({settings.OLLAMA_MODEL}): {ct} tokens")
        return content, pt, ct
    except Exception as ollama_err:
        print(f"[ai_reporter] Ollama indisponível ({ollama_err}) — usando Claude como fallback")

    # ── Fallback: Claude ───────────────────────────────────────────────────
    content, pt, ct = await _generate_claude(prompt)
    print(f"[ai_reporter] Relatório gerado via Claude: {ct} tokens")
    return content, pt, ct
