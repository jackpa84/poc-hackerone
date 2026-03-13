"""
workers/recon.py — Tarefa de reconhecimento (recon)

Pipeline de 6 etapas para máxima cobertura de superfície de ataque:
  1. subfinder + crt.sh + urlscan.io + AlienVault OTX → subdomínios (paralelo)
  2. httpx → filtra hosts ativos
  3. katana + gau + gospider + waymore + hakrawler → URLs (paralelo)
  4. uro → deduplicação inteligente de URLs
  5. nuclei → scan de vulnerabilidades
  6. auto-findings → paths sensíveis detectados nas URLs

Cada linha de output é salva no campo job.logs em tempo real,
permitindo que o frontend mostre um terminal ao vivo.
"""
import asyncio
import json as _json
import os
import tempfile
from datetime import datetime

import httpx as _httpx
from bson import ObjectId

from app.config import settings
from app.models.finding import Finding
from app.models.job import Job
from app.models.target import Target
from app.services import events as ev


async def _run_subprocess(cmd: list[str], job: Job, timeout: int = 600) -> list[str]:
    """Executa um comando e captura o output linha a linha, salvando no job."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        lines: list[str] = []

        async def _read():
            async for line in proc.stdout:
                text = line.decode().strip()
                if text:
                    lines.append(text)
                    job.logs.append(text)
                    if len(job.logs) % 10 == 0:
                        await job.save()

        try:
            await asyncio.wait_for(_read(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            job.logs.append(f"[warn] {cmd[0].split('/')[-1]} timeout após {timeout}s")

        await proc.wait()
        return lines
    except Exception as e:
        job.logs.append(f"[warn] {cmd[0].split('/')[-1]} erro: {e}")
        return []


async def _run_subprocess_stdin(
    cmd: list[str], stdin_data: str, job: Job, timeout: int = 300
) -> list[str]:
    """Executa um comando passando dados via stdin (ex: hakrawler, uro)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(
            proc.communicate(stdin_data.encode()), timeout=timeout
        )
        return [l.strip() for l in stdout.decode().splitlines() if l.strip()]
    except asyncio.TimeoutError:
        job.logs.append(f"[warn] {cmd[0].split('/')[-1]} timeout após {timeout}s")
        return []
    except Exception as e:
        job.logs.append(f"[warn] {cmd[0].split('/')[-1]} erro: {e}")
        return []


def _write_subfinder_config() -> None:
    """Cria o provider-config.yaml do subfinder com as API keys configuradas."""
    try:
        import yaml
    except ImportError:
        return

    providers: dict[str, list[str]] = {}
    if settings.SHODAN_API_KEY:
        providers["shodan"] = [settings.SHODAN_API_KEY]
    if settings.CENSYS_API_ID and settings.CENSYS_API_SECRET:
        providers["censys"] = [f"{settings.CENSYS_API_ID}:{settings.CENSYS_API_SECRET}"]
    if settings.VIRUSTOTAL_API_KEY:
        providers["virustotal"] = [settings.VIRUSTOTAL_API_KEY]
    if settings.SECURITYTRAILS_TOKEN:
        providers["securitytrails"] = [settings.SECURITYTRAILS_TOKEN]
    if settings.CHAOS_API_KEY:
        providers["chaos"] = [settings.CHAOS_API_KEY]

    if not providers:
        return

    config_dir = os.path.expanduser("~/.config/subfinder")
    os.makedirs(config_dir, exist_ok=True)
    with open(os.path.join(config_dir, "provider-config.yaml"), "w") as f:
        yaml.dump(providers, f, default_flow_style=False)


async def _fetch_with_retry(
    url: str,
    headers: dict,
    timeout: int,
    label: str,
    job: Job,
    max_retries: int = 3,
) -> _httpx.Response | None:
    """
    GET com retry exponencial para 429 (rate limit) e 503 (indisponível).
    Retorna Response em sucesso, None se todos os retries falharem.
    """
    for attempt in range(max_retries):
        try:
            async with _httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(url, headers=headers)
            if r.status_code == 200:
                return r
            if r.status_code == 429:
                wait = 2 ** attempt * 3  # 3s, 6s, 12s
                job.logs.append(f"[warn] {label} rate limit (429) — aguardando {wait}s (tentativa {attempt+1}/{max_retries})")
                await asyncio.sleep(wait)
            elif r.status_code == 503:
                wait = 2 ** attempt * 2  # 2s, 4s, 8s
                job.logs.append(f"[warn] {label} indisponível (503) — aguardando {wait}s (tentativa {attempt+1}/{max_retries})")
                await asyncio.sleep(wait)
            else:
                job.logs.append(f"[warn] {label} retornou HTTP {r.status_code}")
                return None
        except Exception as e:
            job.logs.append(f"[warn] {label} erro: {e}")
            return None
    job.logs.append(f"[warn] {label} ignorado após {max_retries} tentativas")
    return None


async def _fetch_crtsh(domain: str, job: Job) -> list[str]:
    """Coleta subdomínios do crt.sh (Certificate Transparency logs). Sem API key."""
    r = await _fetch_with_retry(
        url=f"https://crt.sh/?q=%.{domain}&output=json",
        headers={"Accept": "application/json"},
        timeout=25,
        label="crt.sh",
        job=job,
    )
    if r is None:
        return []
    try:
        subs: set[str] = set()
        for entry in r.json():
            for sub in entry.get("name_value", "").splitlines():
                sub = sub.strip().lstrip("*.")
                if sub.endswith(f".{domain}") or sub == domain:
                    subs.add(sub)
        job.logs.append(f"[crt.sh] {len(subs)} subdomínios")
        return list(subs)
    except Exception as e:
        job.logs.append(f"[warn] crt.sh parse: {e}")
    return []


async def _fetch_urlscan(domain: str, job: Job) -> list[str]:
    """Coleta subdomínios do urlscan.io."""
    headers: dict[str, str] = {}
    if settings.URLSCAN_API_KEY:
        headers["API-Key"] = settings.URLSCAN_API_KEY
    r = await _fetch_with_retry(
        url=f"https://urlscan.io/api/v1/search/?q=domain:{domain}&size=200",
        headers=headers,
        timeout=25,
        label="urlscan.io",
        job=job,
    )
    if r is None:
        return []
    try:
        subs: set[str] = set()
        for result in r.json().get("results", []):
            dom = result.get("page", {}).get("domain", "")
            if dom.endswith(f".{domain}") or dom == domain:
                subs.add(dom)
        job.logs.append(f"[urlscan.io] {len(subs)} subdomínios")
        return list(subs)
    except Exception as e:
        job.logs.append(f"[warn] urlscan.io parse: {e}")
    return []


async def _fetch_otx(domain: str, job: Job) -> list[str]:
    """Coleta subdomínios do AlienVault OTX (Open Threat Exchange) com retry em 429."""
    headers: dict[str, str] = {}
    if settings.OTX_API_KEY:
        headers["X-OTX-API-KEY"] = settings.OTX_API_KEY
    r = await _fetch_with_retry(
        url=f"https://otx.alienvault.com/api/v1/indicators/domain/{domain}/passive_dns",
        headers=headers,
        timeout=25,
        label="OTX",
        job=job,
    )
    if r is None:
        return []
    try:
        subs: set[str] = set()
        for record in r.json().get("passive_dns", []):
            hostname = record.get("hostname", "")
            if hostname.endswith(f".{domain}") or hostname == domain:
                subs.add(hostname)
        job.logs.append(f"[OTX] {len(subs)} subdomínios")
        return list(subs)
    except Exception as e:
        job.logs.append(f"[warn] OTX parse: {e}")
    return []


async def task_run_recon(ctx, job_id: str):
    """
    Tarefa principal de recon. Chamada pelo ARQ worker.
    ctx é injetado automaticamente pelo ARQ (contém a conexão Redis).
    """
    job = await Job.get(ObjectId(job_id))
    if not job:
        return

    target = None
    if job.target_id:
        target = await Target.get(ObjectId(job.target_id))

    domain = target.value if target else job.config.get("domain", "")
    if not domain:
        job.status = "failed"
        job.error = "Domínio não especificado"
        await job.save()
        return

    # Normaliza o domínio: remove protocolo, wildcard, path e trailing slash
    # Ex: https://coinbase.com/path → coinbase.com
    #     *.shopify.com             → shopify.com
    domain = domain.strip()
    for prefix in ("https://", "http://"):
        if domain.startswith(prefix):
            domain = domain[len(prefix):]
            break
    domain = domain.lstrip("*.")       # remove wildcard
    domain = domain.split("/")[0]      # remove path
    domain = domain.split("?")[0]      # remove query string
    domain = domain.lower().strip()

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()
        job.logs = [f"[recon] Iniciando recon em: {domain}"]
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "running")

        # ── Etapa 1: Descoberta de subdomínios (todas as fontes em paralelo) ──
        job.logs.append(
            "[recon] Etapa 1/5 — Subdomínios: subfinder + crt.sh + urlscan.io + OTX (paralelo)..."
        )
        await job.save()

        _write_subfinder_config()

        subfinder_subs, crtsh_subs, urlscan_subs, otx_subs = await asyncio.gather(
            _run_subprocess(
                ["/usr/local/bin/subfinder", "-d", domain, "-silent", "-all", "-t", "50"],
                job,
            ),
            _fetch_crtsh(domain, job),
            _fetch_urlscan(domain, job),
            _fetch_otx(domain, job),
        )

        all_subs: set[str] = (
            set(subfinder_subs) | set(crtsh_subs) | set(urlscan_subs) | set(otx_subs)
        )
        all_subs.add(domain)
        subdomains = list(all_subs)

        job.logs.append(
            f"[recon] {len(subdomains)} subdomínios únicos "
            f"(subfinder={len(subfinder_subs)}, crt.sh={len(crtsh_subs)}, "
            f"urlscan={len(urlscan_subs)}, OTX={len(otx_subs)})"
        )
        await job.save()

        # ── Etapa 2: httpx — filtrar hosts ativos ────────────────────────────
        job.logs.append("[recon] Etapa 2/5 — Verificando hosts ativos com httpx...")
        await job.save()

        live_hosts: list[str] = []
        if subdomains:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
                f.write("\n".join(subdomains))
                tmp_subs = f.name

            live_hosts = await _run_subprocess(
                [
                    "/usr/local/bin/httpx-go", "-l", tmp_subs, "-silent",
                    "-mc", "200,201,301,302,403",
                    "-threads", "50", "-rl", "150",
                ],
                job,
            )
            os.unlink(tmp_subs)
            job.logs.append(f"[httpx] {len(live_hosts)} hosts ativos")
        await job.save()

        # ── Etapa 3: Coleta de URLs (5 fontes em paralelo) ───────────────────
        job.logs.append(
            "[recon] Etapa 3/5 — URLs: katana + gau + gospider + waymore + hakrawler (paralelo)..."
        )
        await job.save()

        katana_urls: list[str] = []
        gau_urls: list[str] = []
        gospider_urls: list[str] = []
        waymore_urls: list[str] = []

        if live_hosts:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
                f.write("\n".join(live_hosts))
                tmp_hosts = f.name

            waymore_out = tempfile.mktemp(suffix=".txt")

            async def _run_waymore() -> list[str]:
                await _run_subprocess(
                    ["waymore", "-i", domain, "-mode", "U", "-oU", waymore_out, "-q"],
                    job, timeout=300,
                )
                if os.path.exists(waymore_out):
                    with open(waymore_out) as fh:
                        lines = [l.strip() for l in fh if l.strip()]
                    os.unlink(waymore_out)
                    return lines
                return []

            url_results = await asyncio.gather(
                _run_subprocess(
                    ["/usr/local/bin/katana", "-list", tmp_hosts, "-silent",
                     "-d", "3", "-c", "30", "-jc", "-kf", "all"],
                    job, timeout=300,
                ),
                _run_subprocess(
                    ["/usr/local/bin/gau", "--subs", domain],
                    job, timeout=300,
                ),
                _run_subprocess(
                    ["/usr/local/bin/gospider", "-S", tmp_hosts, "-c", "10",
                     "-d", "3", "--robots", "--sitemap", "--other-source",
                     "-a", "-w", "-r", "-q"],
                    job, timeout=300,
                ),
                _run_waymore(),
                return_exceptions=True,
            )
            os.unlink(tmp_hosts)

            katana_urls   = url_results[0] if isinstance(url_results[0], list) else []
            gau_urls      = url_results[1] if isinstance(url_results[1], list) else []
            gospider_urls = url_results[2] if isinstance(url_results[2], list) else []
            waymore_urls  = url_results[3] if isinstance(url_results[3], list) else []

            gospider_urls = [u for u in gospider_urls if domain in u and u.startswith("http")]

            job.logs.append(
                f"[recon] URLs brutas: katana={len(katana_urls)}, gau={len(gau_urls)}, "
                f"gospider={len(gospider_urls)}, waymore={len(waymore_urls)}"
            )
        await job.save()

        # ── Etapa 4: uro — deduplicação inteligente de URLs ──────────────────
        job.logs.append("[recon] Etapa 4/5 — Deduplicando URLs com uro...")
        await job.save()

        raw_urls = list(
            set(katana_urls + gau_urls + gospider_urls + waymore_urls)
        )
        job.logs.append(f"[recon] {len(raw_urls)} URLs brutas antes da deduplicação")

        if raw_urls:
            deduped = await _run_subprocess_stdin(
                ["uro"], "\n".join(raw_urls), job, timeout=60
            )
            all_urls = deduped if deduped else raw_urls
        else:
            all_urls = []

        job.logs.append(f"[recon] {len(all_urls)} URLs únicas após deduplicação")
        await job.save()

        # ── Etapa 5: nuclei — scan de vulnerabilidades ────────────────────────
        nuclei_findings_count = 0
        if live_hosts:
            job.logs.append("[recon] Etapa 5/5 — Scan de vulnerabilidades com nuclei...")
            await job.save()

            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
                f.write("\n".join(live_hosts))
                tmp_nuclei = f.name

            nuclei_output = await _run_subprocess(
                [
                    "/usr/local/bin/nuclei", "-l", tmp_nuclei, "-silent",
                    "-severity", "low,medium,high,critical",
                    "-c", "30", "-bs", "25", "-rl", "150", "-jsonl",
                ],
                job, timeout=600,
            )
            os.unlink(tmp_nuclei)

            for line in nuclei_output:
                try:
                    result = _json.loads(line)
                    sev = result.get("info", {}).get("severity", "low")
                    template_id = result.get("template-id", "unknown")
                    matched_url = result.get("matched-at", result.get("host", ""))
                    title = result.get("info", {}).get("name", template_id)
                    desc = result.get("info", {}).get("description", "")

                    nf = Finding(
                        user_id=job.user_id,
                        program_id=job.program_id,
                        target_id=job.target_id,
                        job_id=str(job.id),
                        title=f"[nuclei] {title} em {matched_url}",
                        type="other",
                        severity=sev if sev in ("critical", "high", "medium", "low") else "low",
                        affected_url=matched_url,
                        description=(
                            f"Template: `{template_id}`\n\n{desc}"
                            if desc else
                            f"Vulnerabilidade detectada pelo template `{template_id}`."
                        ),
                        steps_to_reproduce=(
                            f"1. Execute: `nuclei -u {matched_url} -t {template_id}`\n"
                            f"2. Confirme o resultado"
                        ),
                    )
                    await nf.insert()
                    nuclei_findings_count += 1
                    await ev.finding_new(
                        job.user_id, str(nf.id), nf.title, nf.severity, nf.type, nf.affected_url
                    )
                except Exception:
                    pass

            job.logs.append(f"[nuclei] {nuclei_findings_count} vulnerabilidades encontradas")

        # ── Auto-findings para paths sensíveis ────────────────────────────────
        sensitive_paths = [
            ".git", ".env", "phpinfo.php", "server-status", "actuator/env",
            ".DS_Store", "wp-config.php", ".htpasswd", "web.config",
            "crossdomain.xml", ".svn", "backup", "dump.sql",
            "/.git/config", "/.env.local", "/.env.production",
            "/actuator/health", "/actuator/beans",
            "/.aws/credentials", "/id_rsa", "/.ssh/",
        ]
        auto_findings: list[Finding] = []
        seen_auto: set[str] = set()
        for url in all_urls:
            url_lower = url.lower()
            for path in sensitive_paths:
                if path in url_lower and url not in seen_auto:
                    auto_findings.append(Finding(
                        user_id=job.user_id,
                        program_id=job.program_id,
                        target_id=job.target_id,
                        job_id=str(job.id),
                        title=f"Possível exposição de {path} em {url}",
                        type="info_disclosure",
                        severity="medium",
                        affected_url=url,
                        description=(
                            f"URL sensível encontrada no recon: `{url}`\n\n"
                            f"Verifique manualmente se o recurso está acessível."
                        ),
                        steps_to_reproduce=f"1. Acesse: {url}\n2. Verifique se retorna conteúdo sensível",
                    ))
                    seen_auto.add(url)
                    break

        if auto_findings:
            await Finding.insert_many(auto_findings)
            job.logs.append(f"[auto] {len(auto_findings)} findings automáticos criados")
            for finding in auto_findings:
                await ev.finding_new(
                    job.user_id, str(finding.id), finding.title,
                    finding.severity, finding.type, finding.affected_url,
                )

        if target:
            target.last_recon_at = datetime.utcnow()
            await target.save()

        # ── Resultado final ───────────────────────────────────────────────────
        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {
            "subdomains": len(subdomains),
            "subdomains_subfinder": len(subfinder_subs),
            "subdomains_crtsh": len(crtsh_subs),
            "subdomains_urlscan": len(urlscan_subs),
            "subdomains_otx": len(otx_subs),
            "live_hosts": len(live_hosts),
            "urls_katana": len(katana_urls),
            "urls_gau": len(gau_urls),
            "urls_gospider": len(gospider_urls),
            "urls_waymore": len(waymore_urls),
            "urls_total": len(all_urls),
            "nuclei_findings": nuclei_findings_count,
            "auto_findings": len(auto_findings),
        }
        job.logs.append("[recon] Concluído!")
        await job.save()
        await ev.job_update(
            job.user_id, str(job.id), job.type, "completed", job.result_summary
        )
        await ev.recon_done(job.user_id, domain, len(subdomains), len(live_hosts), len(all_urls))

    except Exception:
        import traceback
        job.status = "failed"
        job.error = traceback.format_exc()
        job.finished_at = datetime.utcnow()
        await job.save()
