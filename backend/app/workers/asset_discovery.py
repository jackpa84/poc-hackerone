"""
workers/asset_discovery.py — Descoberta ampliada de ativos

Três tarefas para encontrar mais superfície de ataque além do scope declarado:

  task_asn_enum    — Busca ASNs da empresa via bgpview.io → IP ranges como targets
  task_github_recon — GitHub dorks → subdomínios e secrets em repos públicos
  task_cloud_enum  — S3/GCS/Azure bucket permutation → findings de buckets públicos
"""
import asyncio
import ipaddress
import re
import traceback
from datetime import datetime

import httpx
from bson import ObjectId

from app.config import settings
from app.models.job import Job
from app.models.target import Target
from app.services.dedup import finding_exists_or_create


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _get_job(job_id: str) -> Job | None:
    return await Job.get(ObjectId(job_id))


async def _log(job: Job, msg: str) -> None:
    job.logs.append(msg)
    if len(job.logs) % 10 == 0:
        await job.save()


def _normalize_domain(domain: str) -> str:
    domain = domain.strip().lower().lstrip("*.")
    for prefix in ("https://", "http://"):
        if domain.startswith(prefix):
            domain = domain[len(prefix):]
    return domain.split("/")[0].split("?")[0]


# ─────────────────────────────────────────────────────────────────────────────
# ASN Enumeration
# ─────────────────────────────────────────────────────────────────────────────

async def _bgpview_search(company: str, job: Job) -> list[int]:
    """Busca ASNs pelo nome da empresa via bgpview.io."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                f"https://api.bgpview.io/search?query_term={company}",
                headers={"Accept": "application/json"},
            )
        if r.status_code != 200:
            await _log(job, f"[asn] bgpview search HTTP {r.status_code}")
            return []
        asns = []
        for item in r.json().get("data", {}).get("asns", []):
            asn_num = item.get("asn")
            if asn_num:
                asns.append(asn_num)
                await _log(job, f"[asn] Encontrado ASN{asn_num} — {item.get('name', '')}")
        return asns
    except Exception as e:
        await _log(job, f"[asn] Erro bgpview search: {e}")
        return []


async def _bgpview_prefixes(asn: int, job: Job) -> list[str]:
    """Retorna prefixos IPv4 de um ASN."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                f"https://api.bgpview.io/asn/{asn}/prefixes",
                headers={"Accept": "application/json"},
            )
        if r.status_code != 200:
            return []
        return [
            p["prefix"]
            for p in r.json().get("data", {}).get("ipv4_prefixes", [])
            if p.get("prefix")
        ]
    except Exception as e:
        await _log(job, f"[asn] Erro prefixos ASN{asn}: {e}")
        return []


async def task_asn_enum(ctx, job_id: str):
    """
    Enumera ASNs da empresa via bgpview.io e cria targets de IP range.

    Config:
      company   — nome da empresa (ex: "Shopify"). Se omitido, extrai do domain.
      domain    — domínio alvo (ex: "shopify.com")
      max_asns  — máximo de ASNs a processar (default: 5)
    """
    job = await _get_job(job_id)
    if not job:
        return

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()
        await job.save()

        cfg = job.config
        domain = _normalize_domain(cfg.get("domain", ""))
        company = cfg.get("company", "") or (domain.split(".")[0] if domain else "")
        max_asns = int(cfg.get("max_asns", 5))

        if not company:
            job.status = "failed"
            job.error = "Campo 'company' ou 'domain' obrigatório"
            await job.save()
            return

        job.logs = [f"[asn] Iniciando enumeração para: {company}"]
        await job.save()

        asns = await _bgpview_search(company, job)
        if not asns:
            job.logs.append("[asn] Nenhum ASN encontrado")
            job.status = "completed"
            job.finished_at = datetime.utcnow()
            job.result_summary = {"asns": 0, "ip_ranges": 0, "targets_created": 0}
            await job.save()
            return

        asns = asns[:max_asns]
        job.logs.append(f"[asn] {len(asns)} ASNs — processando até {max_asns}")
        await job.save()

        all_prefixes: list[str] = []
        targets_created = 0
        targets_skipped = 0

        for asn in asns:
            prefixes = await _bgpview_prefixes(asn, job)
            await _log(job, f"[asn] ASN{asn}: {len(prefixes)} prefixos IPv4")

            for cidr in prefixes:
                all_prefixes.append(cidr)
                try:
                    network = ipaddress.ip_network(cidr, strict=False)
                    if network.prefixlen < 8:
                        await _log(job, f"[asn] Pulando {cidr} (prefixlen < 8, muito amplo)")
                        continue
                except ValueError:
                    continue

                # Evita duplicatas
                query = {"user_id": job.user_id, "value": cidr}
                if job.program_id:
                    query["program_id"] = job.program_id
                existing = await Target.find_one(Target.value == cidr, Target.user_id == job.user_id)
                if existing:
                    targets_skipped += 1
                    continue

                await Target(
                    user_id=job.user_id,
                    program_id=job.program_id,
                    value=cidr,
                    type="ip_range",
                    is_in_scope=True,
                    notes=f"ASN{asn} ({company}) via bgpview.io",
                ).insert()
                targets_created += 1
                await _log(job, f"[asn] Target: {cidr} (ASN{asn})")

            await asyncio.sleep(1)  # respeita rate limit da API

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {
            "asns_found": len(asns),
            "ip_ranges_found": len(all_prefixes),
            "targets_created": targets_created,
            "targets_skipped": targets_skipped,
        }
        job.logs.append(
            f"[asn] Concluído: {targets_created} targets criados, {targets_skipped} já existiam"
        )
        await job.save()

    except Exception:
        job.status = "failed"
        job.error = traceback.format_exc()
        job.finished_at = datetime.utcnow()
        await job.save()


# ─────────────────────────────────────────────────────────────────────────────
# GitHub Recon
# ─────────────────────────────────────────────────────────────────────────────

_SECRET_PATTERNS: list[tuple[str, str]] = [
    (r"AKIA[0-9A-Z]{16}", "AWS Access Key ID"),
    (r"(?i)aws[_-]?secret[_-]?access[_-]?key\s*[=:]\s*[\"']?([A-Za-z0-9+/]{40})[\"']?", "AWS Secret Key"),
    (r"ghp_[A-Za-z0-9]{36}", "GitHub Token"),
    (r"ghs_[A-Za-z0-9]{36}", "GitHub App Token"),
    (r"(?i)(api[_-]?key|apikey)\s*[=:]\s*[\"']?([A-Za-z0-9_\-]{20,})[\"']?", "API Key"),
    (r"(?i)(secret[_-]?key|client[_-]?secret)\s*[=:]\s*[\"']?([A-Za-z0-9_\-]{16,})[\"']?", "Secret Key"),
    (r"(?i)(access[_-]?token|auth[_-]?token|bearer)\s*[=:]\s*[\"']?([A-Za-z0-9_\-\.]{20,})[\"']?", "Auth Token"),
    (r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----", "Private Key"),
    (r"(?i)(password|passwd|pwd)\s*[=:]\s*[\"']([^\s\"']{8,})[\"']", "Hardcoded Password"),
]


def _detect_secrets(text: str) -> list[str]:
    found: list[str] = []
    for pattern, label in _SECRET_PATTERNS:
        if re.search(pattern, text):
            found.append(label)
    return found


def _extract_subdomains(text: str, domain: str) -> set[str]:
    pattern = rf"(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{{0,61}}[a-zA-Z0-9])?\.)+{re.escape(domain)}"
    return {m.lower() for m in re.findall(pattern, text, re.IGNORECASE) if m.lower() != domain}


async def _github_search(query: str, token: str, job: Job) -> list[dict]:
    headers = {"Accept": "application/vnd.github.v3+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(
                "https://api.github.com/search/code",
                params={"q": query, "per_page": 30},
                headers=headers,
            )
        if r.status_code == 403:
            await _log(job, "[github] Rate limit — aguardando 60s")
            await asyncio.sleep(60)
            return []
        if r.status_code not in (200, 422):
            await _log(job, f"[github] HTTP {r.status_code}")
        return r.json().get("items", []) if r.status_code == 200 else []
    except Exception as e:
        await _log(job, f"[github] Erro search: {e}")
        return []


async def _fetch_file_content(url: str, token: str) -> str:
    headers = {"Accept": "application/vnd.github.v3.raw"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, headers=headers)
        return r.text[:8000] if r.status_code == 200 else ""
    except Exception:
        return ""


async def task_github_recon(ctx, job_id: str):
    """
    Busca repositórios GitHub públicos que referenciam o domínio.
    Detecta subdomínios expostos e possíveis secrets/credenciais.

    Config:
      domain      — domínio alvo (ex: "shopify.com")
      max_results — máximo de itens processados por dork (default: 50)
    """
    job = await _get_job(job_id)
    if not job:
        return

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()
        await job.save()

        cfg = job.config
        domain = _normalize_domain(cfg.get("domain", ""))
        max_results = int(cfg.get("max_results", 50))

        if not domain:
            job.status = "failed"
            job.error = "Campo 'domain' obrigatório"
            await job.save()
            return

        token = settings.GITHUB_TOKEN
        job.logs = [
            f"[github] Recon em: {domain}",
            f"[github] Token: {'configurado ✓' if token else 'não configurado (rate limit baixo)'}",
        ]
        await job.save()

        dorks = [
            f'"{domain}" filename:.env',
            f'"{domain}" extension:yaml',
            f'"{domain}" extension:json "api_key"',
            f'"*.{domain}"',
            f'"{domain}" "password" OR "secret" OR "token"',
            f'"{domain}" extension:conf OR extension:config',
            f'"{domain}" filename:docker-compose',
        ]

        all_subdomains: set[str] = set()
        processed_repos: set[str] = set()
        findings_created = 0

        for dork in dorks:
            await _log(job, f"[github] Dork: {dork}")
            items = await _github_search(dork, token, job)
            await _log(job, f"[github] {len(items)} resultados")

            count = 0
            for item in items:
                if count >= max_results:
                    break

                repo = item.get("repository", {}).get("full_name", "")
                file_url = item.get("html_url", "")
                file_name = item.get("name", "")
                api_url = item.get("url", "")

                if repo in processed_repos:
                    continue
                processed_repos.add(repo)
                count += 1

                content = await _fetch_file_content(api_url, token)
                if not content:
                    continue

                # Subdomínios
                subs = _extract_subdomains(content, domain)
                if subs:
                    all_subdomains.update(subs)
                    await _log(job, f"[github] {repo}: +{len(subs)} subdomínios")

                # Secrets
                secrets = _detect_secrets(content)
                for secret_type in secrets:
                    f = await finding_exists_or_create(
                        user_id=job.user_id,
                        program_id=job.program_id,
                        target_id=job.target_id,
                        job_id=str(job.id),
                        title=f"[GitHub] {secret_type} exposto em {repo}/{file_name}",
                        type="info_disclosure",
                        severity="high",
                        affected_url=file_url,
                        description=(
                            f"Possível **{secret_type}** encontrado em repositório público GitHub.\n\n"
                            f"**Repositório**: [{repo}]({file_url})\n"
                            f"**Arquivo**: `{file_name}`\n\n"
                            f"> ⚠️ Valide manualmente se o secret ainda é válido antes de reportar."
                        ),
                        steps_to_reproduce=(
                            f"1. Acesse: {file_url}\n"
                            f"2. Localize o padrão de {secret_type} no arquivo\n"
                            f"3. Valide se a credencial ainda está ativa"
                        ),
                        impact=(
                            f"Exposição de {secret_type} em repositório público pode permitir "
                            f"acesso não autorizado a serviços da empresa."
                        ),
                    )
                    if f:
                        findings_created += 1
                        await _log(job, f"[github] Finding: {secret_type} em {repo}")

            # Respeita rate limit: 10 req/min sem token, 30/min com token
            await asyncio.sleep(3 if token else 12)

        # Cria targets para novos subdomínios
        targets_created = 0
        for sub in all_subdomains:
            existing = await Target.find_one(Target.user_id == job.user_id, Target.value == sub)
            if not existing:
                await Target(
                    user_id=job.user_id,
                    program_id=job.program_id,
                    value=sub,
                    type="domain",
                    is_in_scope=True,
                    notes="Descoberto via GitHub recon",
                ).insert()
                targets_created += 1

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {
            "dorks_executed": len(dorks),
            "repos_analyzed": len(processed_repos),
            "subdomains_found": len(all_subdomains),
            "targets_created": targets_created,
            "findings_created": findings_created,
        }
        job.logs.append(
            f"[github] Concluído: {len(processed_repos)} repos, "
            f"{len(all_subdomains)} subdomínios, {findings_created} findings"
        )
        await job.save()

    except Exception:
        job.status = "failed"
        job.error = traceback.format_exc()
        job.finished_at = datetime.utcnow()
        await job.save()


# ─────────────────────────────────────────────────────────────────────────────
# Cloud Bucket Enumeration
# ─────────────────────────────────────────────────────────────────────────────

def _bucket_permutations(company: str) -> list[str]:
    """Gera permutações de nome de bucket para uma empresa."""
    c = company.lower().replace(".", "-").replace("_", "-")
    buckets: set[str] = set()

    suffixes = [
        "", "-prod", "-dev", "-staging", "-test", "-qa", "-uat",
        "-backup", "-backups", "-data", "-assets", "-static",
        "-media", "-files", "-logs", "-uploads", "-images",
        "-internal", "-private", "-public", "-archive",
        "-api", "-web", "-app", "-cdn", "-s3", "-store",
        ".prod", ".dev", ".backup", ".data",
    ]
    prefixes = ["", "www-", "api-", "cdn-", "static-", "assets-", "media-", "backup-", "dev-"]

    for suffix in suffixes:
        buckets.add(f"{c}{suffix}")
    for prefix in prefixes:
        buckets.add(f"{prefix}{c}")

    # Variações sem hífen
    c_nohyphen = c.replace("-", "")
    buckets.update([c_nohyphen, f"{c_nohyphen}-prod", f"{c_nohyphen}-backup"])

    # Variações comuns de naming
    buckets.update([f"get{c}", f"{c}app", f"{c}cdn", f"{c}inc", f"{c}hq"])

    return sorted(buckets)


async def _check_bucket(url: str, client: httpx.AsyncClient) -> str:
    """
    Verifica acessibilidade de uma URL de bucket.
    Retorna: "public" | "exists" | "not_found"
    """
    try:
        r = await client.head(url, timeout=8)
        if r.status_code == 200:
            return "public"
        if r.status_code in (403, 400, 401, 409):
            return "exists"
        return "not_found"
    except Exception:
        return "not_found"


async def task_cloud_enum(ctx, job_id: str):
    """
    Enumera buckets S3/GCS/Azure por permutação do nome da empresa.
    Cria findings críticos para buckets públicos e low para buckets privados existentes.

    Config:
      domain      — domínio alvo (ex: "shopify.com")
      company     — nome da empresa (opcional, extraído do domain)
      check_s3    — checar AWS S3 (default: true)
      check_gcs   — checar Google Cloud Storage (default: true)
      check_azure — checar Azure Blob Storage (default: true)
      concurrency — requisições paralelas (default: 20, max: 50)
    """
    job = await _get_job(job_id)
    if not job:
        return

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()
        await job.save()

        cfg = job.config
        domain = _normalize_domain(cfg.get("domain", ""))
        company = cfg.get("company", "") or (domain.split(".")[0] if domain else "")
        check_s3 = cfg.get("check_s3", True)
        check_gcs = cfg.get("check_gcs", True)
        check_azure = cfg.get("check_azure", True)
        concurrency = min(int(cfg.get("concurrency", 20)), 50)

        if not company:
            job.status = "failed"
            job.error = "Campo 'company' ou 'domain' obrigatório"
            await job.save()
            return

        buckets = _bucket_permutations(company)
        job.logs = [
            f"[cloud] Iniciando para: {company}",
            f"[cloud] {len(buckets)} permutações | S3={check_s3} GCS={check_gcs} Azure={check_azure}",
        ]
        await job.save()

        findings_created = 0
        buckets_found: list[dict] = []
        semaphore = asyncio.Semaphore(concurrency)

        # Monta lista de (bucket, provider, url) para checar
        checks: list[tuple[str, str, str]] = []
        for b in buckets:
            if check_s3:
                checks.append((b, "s3", f"https://{b}.s3.amazonaws.com"))
            if check_gcs:
                checks.append((b, "gcs", f"https://storage.googleapis.com/{b}"))
            if check_azure:
                checks.append((b, "azure", f"https://{b}.blob.core.windows.net"))

        job.logs.append(f"[cloud] Total de verificações: {len(checks)}")
        await job.save()

        async def check_one(bucket_name: str, provider: str, url: str) -> None:
            async with semaphore:
                async with httpx.AsyncClient(follow_redirects=True) as client:
                    status = await _check_bucket(url, client)

                if status == "not_found":
                    return

                is_public = status == "public"
                severity = "critical" if is_public else "low"
                label = "🔴 PÚBLICO" if is_public else "🟡 Existe (privado)"

                f = await finding_exists_or_create(
                    user_id=job.user_id,
                    program_id=job.program_id,
                    target_id=job.target_id,
                    job_id=str(job.id),
                    title=f"[Cloud/{provider.upper()}] {label}: {bucket_name}",
                    type="info_disclosure",
                    severity=severity,
                    affected_url=url,
                    description=(
                        f"Bucket `{bucket_name}` encontrado no **{provider.upper()}**.\n\n"
                        + (
                            f"⚠️ **Acesso público habilitado** — conteúdo pode estar exposto.\n\n"
                            if is_public else
                            f"Bucket existe mas está privado (403). Confirma infraestrutura cloud.\n\n"
                        )
                        + f"**URL**: {url}"
                    ),
                    steps_to_reproduce=(
                        f"1. Acesse: {url}\n"
                        f"2. {'Verifique o listing e procure arquivos sensíveis' if is_public else 'Confirme a existência com: curl -I ' + url}\n"
                        f"3. Procure por: .env, backups, configs, dumps de banco"
                    ),
                    impact=(
                        "Bucket público pode expor dados sensíveis, backups ou código-fonte."
                        if is_public else
                        "Confirma uso de cloud storage — investigue outros buckets relacionados."
                    ),
                )
                if f:
                    findings_created + 1  # nonlocal workaround via list
                    buckets_found.append({"bucket": bucket_name, "provider": provider, "status": status, "url": url})
                    await _log(job, f"[cloud] {label} {provider.upper()}: {bucket_name}")

        # Processa em lotes para logs periódicos
        batch_size = 100
        _findings_ref = [0]  # workaround para counter em async

        async def check_one_counted(bucket_name: str, provider: str, url: str) -> None:
            async with semaphore:
                async with httpx.AsyncClient(follow_redirects=True) as client:
                    status = await _check_bucket(url, client)

                if status == "not_found":
                    return

                is_public = status == "public"
                severity = "critical" if is_public else "low"
                label = "🔴 PÚBLICO" if is_public else "🟡 Existe (privado)"

                f = await finding_exists_or_create(
                    user_id=job.user_id,
                    program_id=job.program_id,
                    target_id=job.target_id,
                    job_id=str(job.id),
                    title=f"[Cloud/{provider.upper()}] {label}: {bucket_name}",
                    type="info_disclosure",
                    severity=severity,
                    affected_url=url,
                    description=(
                        f"Bucket `{bucket_name}` encontrado no **{provider.upper()}**.\n\n"
                        + (
                            "⚠️ **Acesso público habilitado** — conteúdo pode estar exposto.\n\n"
                            if is_public else
                            "Bucket existe mas está privado (403). Confirma infraestrutura cloud.\n\n"
                        )
                        + f"**URL**: {url}"
                    ),
                    steps_to_reproduce=(
                        f"1. Acesse: {url}\n"
                        f"2. {'Verifique o listing e procure arquivos sensíveis' if is_public else 'curl -I ' + url}\n"
                        f"3. Procure por: .env, backups, configs, dumps de banco"
                    ),
                    impact=(
                        "Bucket público pode expor dados sensíveis, backups ou código-fonte."
                        if is_public else
                        "Confirma uso de cloud storage — investigue outros buckets relacionados."
                    ),
                )
                if f:
                    _findings_ref[0] += 1
                    buckets_found.append({
                        "bucket": bucket_name,
                        "provider": provider,
                        "status": status,
                        "url": url,
                    })
                    await _log(job, f"[cloud] {label} {provider.upper()}: {bucket_name}")

        for i in range(0, len(checks), batch_size):
            batch = checks[i:i + batch_size]
            await asyncio.gather(
                *[check_one_counted(b, p, u) for b, p, u in batch],
                return_exceptions=True,
            )
            done = min(i + batch_size, len(checks))
            job.logs.append(f"[cloud] Progresso: {done}/{len(checks)}")
            await job.save()

        public_count = sum(1 for b in buckets_found if b["status"] == "public")
        exists_count = sum(1 for b in buckets_found if b["status"] == "exists")

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {
            "buckets_tested": len(buckets),
            "checks_total": len(checks),
            "buckets_found": len(buckets_found),
            "public_buckets": public_count,
            "private_buckets": exists_count,
            "findings_created": _findings_ref[0],
            "providers_checked": {
                "s3": check_s3,
                "gcs": check_gcs,
                "azure": check_azure,
            },
            "found_list": buckets_found[:30],
        }
        job.logs.append(
            f"[cloud] Concluído: {len(buckets_found)} buckets "
            f"({public_count} públicos, {exists_count} privados)"
        )
        await job.save()

    except Exception:
        job.status = "failed"
        job.error = traceback.format_exc()
        job.finished_at = datetime.utcnow()
        await job.save()
