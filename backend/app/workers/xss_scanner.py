"""
workers/xss_scanner.py — Scanner de XSS com Dalfox

Dalfox é o scanner XSS mais popular da comunidade bug bounty (2024-2026).
Detecta reflected, DOM, e stored XSS com análise de parâmetros inteligente.

Fluxo:
  1. Recebe lista de URLs (do job config ou usa gau para coletar)
  2. Filtra URLs com parâmetros (? na URL)
  3. Executa dalfox em cada URL com detecção de WAF
  4. Cria findings automáticos para cada XSS confirmado
"""
import asyncio
import json
import logging
import tempfile
import os
from datetime import datetime
from bson import ObjectId
from urllib.parse import urlparse

from app.models.job import Job
from app.models.finding import Finding
from app.services import events as ev

logger = logging.getLogger(__name__)


def _safe_url(url: str) -> str:
    """Valida que a string é uma URL HTTP/HTTPS válida."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"URL inválida ou esquema não permitido: {url!r}")
    return url


async def _run_subprocess(cmd: list[str], job: Job) -> list[str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    lines = []
    async for line in proc.stdout:
        text = line.decode().strip()
        if text:
            lines.append(text)
            job.logs.append(text)
            if len(job.logs) % 10 == 0:
                await job.save()
    await proc.wait()
    return lines


async def task_run_xss_scan(ctx, job_id: str):
    """
    Scanner XSS com Dalfox.
    config esperado:
      - url:  URL alvo única (ex: https://example.com/search?q=test)
      - urls: lista de URLs (alternativa)
      - cookie: cookie de sessão autenticada (opcional)
      - blind_xss: URL do servidor blind XSS (ex: https://yourxsshunter.com/payload)
    """
    job = await Job.get(ObjectId(job_id))
    if not job:
        return

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()
        job.logs = ["[xss_scan] Iniciando scanner XSS com Dalfox..."]
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "running")

        # ── Coleta URLs com parâmetros ────────────────────────────────────
        target_url = job.config.get("url", "")
        target_urls = job.config.get("urls", [])

        if target_url and not target_urls:
            target_urls = [target_url]

        # Se não tiver URLs, usa gau para coletar do domínio
        if not target_urls:
            domain = job.config.get("domain", "")
            if domain:
                job.logs.append(f"[gau] Coletando URLs com parâmetros de {domain}...")
                await job.save()
                gau_output = await _run_subprocess(
                    ["/usr/local/bin/gau", "--subs", domain, "--blacklist", "png,jpg,gif,css,woff"],
                    job
                )
                # Filtra apenas URLs com parâmetros (contém ?)
                target_urls = [u for u in gau_output if "?" in u]
                job.logs.append(f"[gau] {len(target_urls)} URLs com parâmetros encontradas")
            else:
                job.status = "failed"
                job.error = "Nenhuma URL ou domínio especificado"
                await job.save()
                return

        # Filtra URLs com parâmetros
        param_urls = [u for u in target_urls if "?" in u]
        if not param_urls:
            job.logs.append("[xss_scan] Nenhuma URL com parâmetros encontrada — usando todas as URLs")
            param_urls = target_urls[:100]  # Limita para não demorar demais

        job.logs.append(f"[dalfox] Testando {len(param_urls)} URLs para XSS...")
        await job.save()

        # ── Executa Dalfox ────────────────────────────────────────────────
        findings_count = 0

        # Escreve URLs em arquivo temporário
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("\n".join(param_urls[:200]))  # Limita 200 URLs
            tmp_urls = f.name

        # Monta comando dalfox
        dalfox_cmd = [
            "/usr/local/bin/dalfox", "file", tmp_urls,
            "--silence",
            "--no-color",
            "--format", "json",
            "--timeout", "10",
            "--delay", "100",
            "--worker", "20",
        ]

        # Cookie de sessão (para XSS autenticado)
        if job.config.get("cookie"):
            cookie_val = str(job.config["cookie"])[:512]  # limita tamanho
            dalfox_cmd += ["--cookie", cookie_val]

        # Blind XSS callback URL
        if job.config.get("blind_xss"):
            try:
                blind_url = _safe_url(str(job.config["blind_xss"]))
                dalfox_cmd += ["--blind", blind_url]
            except ValueError as e:
                job.logs.append(f"[xss_scan] blind_xss inválido ignorado: {e}")

        dalfox_output = await _run_subprocess(dalfox_cmd, job)
        os.unlink(tmp_urls)

        # ── Processa resultados JSON ──────────────────────────────────────
        for line in dalfox_output:
            try:
                result = json.loads(line)
                vuln_type = result.get("type", "XSS")
                affected_url = result.get("data", {}).get("url", "")
                param = result.get("data", {}).get("param", "")
                payload = result.get("data", {}).get("payload", "")
                evidence = result.get("data", {}).get("evidence", "")

                if not affected_url:
                    continue

                severity = "high"
                if vuln_type == "G" or "stored" in vuln_type.lower():
                    severity = "critical"
                elif "blind" in vuln_type.lower():
                    severity = "high"

                finding = Finding(
                    user_id=job.user_id,
                    program_id=job.program_id,
                    target_id=job.target_id,
                    job_id=str(job.id),
                    title=f"XSS ({vuln_type}) em {affected_url}",
                    type="xss",
                    severity=severity,
                    affected_url=affected_url,
                    parameter=param,
                    payload=payload,
                    description=(
                        f"Cross-Site Scripting detectado pelo Dalfox no parâmetro `{param}`.\n\n"
                        f"**Tipo:** {vuln_type}\n"
                        f"**Evidência:** `{evidence}`"
                    ),
                    steps_to_reproduce=(
                        f"1. Acesse: `{affected_url}`\n"
                        f"2. No parâmetro `{param}`, insira: `{payload}`\n"
                        f"3. Observe a execução do JavaScript"
                    ),
                )
                await finding.insert()
                findings_count += 1
                await ev.finding_new(
                    job.user_id, str(finding.id),
                    finding.title, finding.severity, finding.type, finding.affected_url
                )

            except (json.JSONDecodeError, KeyError):
                # Linha não é JSON — pode ser output de texto do dalfox
                if "[POC]" in line or "VULN" in line.upper():
                    # Fallback: extrai info do texto
                    finding = Finding(
                        user_id=job.user_id,
                        program_id=job.program_id,
                        target_id=job.target_id,
                        job_id=str(job.id),
                        title=f"[XSS] Possível XSS detectado — verificar manualmente",
                        type="xss",
                        severity="medium",
                        description=f"Dalfox reportou possível XSS:\n\n```\n{line}\n```",
                        steps_to_reproduce="Reproduza o payload manualmente no Burp Suite para confirmar.",
                    )
                    await finding.insert()
                    findings_count += 1

        job.logs.append(f"[dalfox] {findings_count} vulnerabilidades XSS confirmadas")

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {
            "urls_tested": len(param_urls),
            "xss_findings": findings_count,
        }
        job.logs.append("[xss_scan] Concluído!")
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "completed", job.result_summary)

    except Exception:
        import traceback
        tb = traceback.format_exc()
        logger.error("[xss_scan] job=%s error=%s", job_id, tb)
        job.status = "failed"
        job.error = tb
        job.finished_at = datetime.utcnow()
        await job.save()
