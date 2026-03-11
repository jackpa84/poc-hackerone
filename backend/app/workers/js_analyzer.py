"""
workers/js_analyzer.py — Análise de Arquivos JavaScript

Combina LinkFinder (endpoints) + SecretFinder (credenciais expostas).
Arquivos JS são uma goldmine de bug bounty: APIs internas, tokens, endpoints ocultos.

Fluxo:
  1. Coleta arquivos JS via katana/gau (ou URL direta)
  2. Extrai endpoints com LinkFinder
  3. Extrai secrets com padrões regex (API keys, tokens, credentials)
  4. Cria findings para endpoints sensíveis e secrets expostos
"""
import asyncio
import logging
import re
import httpx
import tempfile
import os
from datetime import datetime
from bson import ObjectId
from urllib.parse import urljoin, urlparse

from app.models.job import Job
from app.models.finding import Finding
from app.services import events as ev

logger = logging.getLogger(__name__)

# Padrões de secrets em arquivos JS
SECRET_PATTERNS = {
    "AWS Access Key":       r"AKIA[0-9A-Z]{16}",
    "AWS Secret Key":       r"(?i)aws.{0,20}secret.{0,20}['\"]([A-Za-z0-9/+=]{40})['\"]",
    "Google API Key":       r"AIza[0-9A-Za-z\-_]{35}",
    "Google OAuth":         r"[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com",
    "GitHub Token":         r"ghp_[0-9a-zA-Z]{36}|github_pat_[0-9a-zA-Z_]{82}",
    "Slack Token":          r"xox[baprs]-[0-9A-Za-z\-]{10,72}",
    "Stripe API Key":       r"(?:r|s)k_(?:live|test)_[0-9a-zA-Z]{24,}",
    "Twilio":               r"SK[0-9a-fA-F]{32}",
    "SendGrid":             r"SG\.[a-zA-Z0-9\-_]{22}\.[a-zA-Z0-9\-_]{43}",
    "Mailgun":              r"key-[0-9a-zA-Z]{32}",
    "JWT Token":            r"eyJ[a-zA-Z0-9\-_=]+\.[a-zA-Z0-9\-_=]+\.?[a-zA-Z0-9\-_.+/=]*",
    "Private Key":          r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    "Bearer Token":         r"(?i)bearer\s+[a-zA-Z0-9\-._~+/]{20,}",
    "Basic Auth":           r"(?i)basic\s+[a-zA-Z0-9+/=]{20,}",
    "Password in Code":     r"(?i)(?:password|passwd|pwd)\s*=\s*['\"](?!.*\{)[^'\"]{8,}['\"]",
    "API Key in Code":      r"(?i)(?:api[_-]?key|apikey|access[_-]?key)\s*[=:]\s*['\"][a-zA-Z0-9\-_]{16,}['\"]",
    "Secret in Code":       r"(?i)(?:secret|client_secret)\s*[=:]\s*['\"][a-zA-Z0-9\-_]{16,}['\"]",
    "Internal URL":         r"https?://(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)[^\s'\"]*",
    "S3 Bucket":            r"[a-z0-9\-\.]{3,63}\.s3(?:\.[a-z0-9\-]+)?\.amazonaws\.com",
}

# Endpoints de alto risco
SENSITIVE_ENDPOINT_PATTERNS = [
    r"/api/(?:admin|internal|private|debug|dev)",
    r"/(?:admin|administrator|manage|management)",
    r"/(?:config|settings|setup|install)",
    r"/(?:debug|test|staging|dev)",
    r"/graphql",
    r"/v[0-9]+/(?:admin|internal)",
    r"/__webpack",
    r"/swagger|/api-docs|/openapi",
]


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


async def _fetch_js_content(url: str) -> str:
    """Faz download do conteúdo de um arquivo JS."""
    try:
        async with httpx.AsyncClient(verify=False, timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200:
                return resp.text
    except Exception:
        pass
    return ""


async def task_run_js_analysis(ctx, job_id: str):
    """
    Análise de JavaScript para endpoints e secrets.
    config esperado:
      - url:    URL do site (coleta JS automaticamente) ou URL direta de .js
      - domain: domínio para coletar JSs via gau/katana
    """
    job = await Job.get(ObjectId(job_id))
    if not job:
        return

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()

        target_url = job.config.get("url", "")
        domain = job.config.get("domain", "")

        if not target_url and not domain:
            job.status = "failed"
            job.error = "URL ou domínio não especificado"
            await job.save()
            return

        job.logs = [f"[js_analyzer] Iniciando análise de JavaScript..."]
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "running")

        # ── Coleta arquivos JS ────────────────────────────────────────────
        js_urls = []

        # Se é uma URL direta de .js
        if target_url and target_url.endswith(".js"):
            js_urls = [target_url]
        else:
            # Usa gau + katana para encontrar JS files
            search_domain = domain or urlparse(target_url).netloc
            if search_domain:
                job.logs.append(f"[gau] Coletando arquivos JS de {search_domain}...")
                await job.save()

                gau_output = await _run_subprocess(
                    ["/usr/local/bin/gau", search_domain, "--blacklist", "png,jpg,gif,css,woff,svg"],
                    job
                )
                js_from_gau = [u for u in gau_output if u.endswith(".js") or ".js?" in u]

                # Katana para JS dinâmicos
                if target_url:
                    katana_output = await _run_subprocess(
                        ["/usr/local/bin/katana", "-u", target_url, "-silent", "-d", "3", "-jc"],
                        job
                    )
                    js_from_katana = [u for u in katana_output if ".js" in u]
                    js_urls = list(set(js_from_gau + js_from_katana))
                else:
                    js_urls = js_from_gau

                job.logs.append(f"[js_analyzer] {len(js_urls)} arquivos JS encontrados")

        if not js_urls:
            job.logs.append("[js_analyzer] Nenhum arquivo JS encontrado")
            job.status = "completed"
            job.finished_at = datetime.utcnow()
            job.result_summary = {"js_files": 0, "endpoints": 0, "secrets": 0, "findings": 0}
            await job.save()
            return

        # ── Analisa cada JS ───────────────────────────────────────────────
        job.logs.append(f"[js_analyzer] Analisando {min(len(js_urls), 50)} arquivos JS...")
        await job.save()

        all_endpoints = []
        all_secrets = []

        # Limita a 50 arquivos JS para não sobrecarregar
        semaphore = asyncio.Semaphore(10)

        async def analyze_js(js_url: str):
            async with semaphore:
                content = await _fetch_js_content(js_url)
                if not content:
                    return

                # Extrai endpoints com regex (LinkFinder-style)
                endpoint_patterns = [
                    r"""['"]((?:https?://[^'"]*|/[a-zA-Z0-9/_\-\.]+(?:\?[^'"]*)?))['"]""",
                    r"""url\s*[:=]\s*['"](/[a-zA-Z0-9/_\-\.]+)['"]""",
                    r"""(?:fetch|axios|get|post)\s*\(\s*['"](/[a-zA-Z0-9/_\-\.?=&]+)['"]""",
                ]
                for pattern in endpoint_patterns:
                    for match in re.findall(pattern, content):
                        if len(match) > 2 and "/" in match:
                            all_endpoints.append((js_url, match))

                # Detecta secrets
                for secret_type, pattern in SECRET_PATTERNS.items():
                    matches = re.findall(pattern, content)
                    for match in matches:
                        value = match if isinstance(match, str) else match[0] if match else ""
                        if len(value) > 8:  # Ignora matches muito curtos
                            all_secrets.append({
                                "type": secret_type,
                                "value": value[:50] + "..." if len(value) > 50 else value,
                                "js_url": js_url,
                            })

        tasks = [analyze_js(url) for url in js_urls[:50]]
        await asyncio.gather(*tasks)

        job.logs.append(f"[js_analyzer] {len(all_endpoints)} endpoints, {len(all_secrets)} possíveis secrets")
        await job.save()

        findings_count = 0

        # ── Cria findings para secrets expostos ───────────────────────────
        if all_secrets:
            # Deduplica por tipo + valor parcial
            seen_secrets = set()
            unique_secrets = []
            for s in all_secrets:
                key = (s["type"], s["value"][:20])
                if key not in seen_secrets:
                    seen_secrets.add(key)
                    unique_secrets.append(s)

            secrets_by_type: dict[str, list] = {}
            for s in unique_secrets:
                secrets_by_type.setdefault(s["type"], []).append(s)

            for secret_type, instances in secrets_by_type.items():
                severity = "critical" if any(k in secret_type for k in ["Private Key", "AWS", "Stripe", "Password"]) else "high"
                details = "\n".join([f"- `{s['value']}` em [{s['js_url']}]({s['js_url']})" for s in instances[:5]])

                finding = Finding(
                    user_id=job.user_id,
                    program_id=job.program_id,
                    target_id=job.target_id,
                    job_id=str(job.id),
                    title=f"Secret exposto em JavaScript: {secret_type} ({len(instances)} ocorrências)",
                    type="info_disclosure",
                    severity=severity,
                    affected_url=instances[0]["js_url"],
                    description=(
                        f"Credencial do tipo **{secret_type}** encontrada em arquivo(s) JavaScript público(s):\n\n"
                        f"{details}\n\n"
                        f"Secrets expostos em JS client-side são acessíveis por qualquer visitante do site."
                    ),
                    steps_to_reproduce=(
                        f"1. Acesse: {instances[0]['js_url']}\n"
                        f"2. Busque por: `{secret_type.lower()}`\n"
                        f"3. Verifique se o token/chave é válido tentando uma chamada de API"
                    ),
                )
                await finding.insert()
                findings_count += 1
                await ev.finding_new(
                    job.user_id, str(finding.id),
                    finding.title, finding.severity, finding.type, finding.affected_url
                )

        # ── Cria findings para endpoints sensíveis ────────────────────────
        sensitive_endpoints = []
        for js_url, endpoint in all_endpoints:
            for pattern in SENSITIVE_ENDPOINT_PATTERNS:
                if re.search(pattern, endpoint, re.IGNORECASE):
                    sensitive_endpoints.append((js_url, endpoint))
                    break

        if sensitive_endpoints:
            base = target_url or f"https://{domain}"
            endpoints_list = "\n".join([
                f"- `{ep}` (de {js_url.split('/')[-1]})"
                for js_url, ep in sensitive_endpoints[:30]
            ])

            finding = Finding(
                user_id=job.user_id,
                program_id=job.program_id,
                target_id=job.target_id,
                job_id=str(job.id),
                title=f"Endpoints sensíveis encontrados em JavaScript ({len(sensitive_endpoints)} endpoints)",
                type="info_disclosure",
                severity="medium",
                affected_url=base,
                description=(
                    f"Endpoints internos/administrativos encontrados em arquivos JS:\n\n"
                    f"{endpoints_list}\n\n"
                    f"Endpoints admin e internos podem ter controles de acesso mais fracos."
                ),
                steps_to_reproduce=(
                    "1. Acesse cada endpoint encontrado\n"
                    "2. Tente acessar sem autenticação\n"
                    "3. Tente com tokens de usuário comum para verificar autorização"
                ),
            )
            await finding.insert()
            findings_count += 1
            await ev.finding_new(
                job.user_id, str(finding.id),
                finding.title, finding.severity, finding.type, finding.affected_url
            )

        job.logs.append(f"[js_analyzer] {findings_count} findings criados")

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {
            "js_files": len(js_urls),
            "endpoints_found": len(all_endpoints),
            "secrets_found": len(all_secrets),
            "sensitive_endpoints": len(sensitive_endpoints),
            "findings": findings_count,
        }
        job.logs.append("[js_analyzer] Concluído!")
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "completed", job.result_summary)

    except Exception:
        import traceback
        tb = traceback.format_exc()
        logger.error("[js_analyzer] job=%s error=%s", job_id, tb)
        job.status = "failed"
        job.error = tb
        job.finished_at = datetime.utcnow()
        await job.save()
