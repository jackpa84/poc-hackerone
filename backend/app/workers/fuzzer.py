"""
workers/fuzzer.py — Tarefas de fuzzing HTTP

Três variações:
  - dir_fuzz:   testa caminhos em /FUZZ (enumeração de diretórios)
  - param_fuzz: testa valores em parâmetros GET (ex: ?q=FUZZ)
  - sub_fuzz:   testa subdomínios (FUZZ.target.com)

Cada resultado interessante (status 200, 500) pode virar um Finding automático.
"""
import asyncio
import httpx
from datetime import datetime
from pathlib import Path
from bson import ObjectId

from app.models.job import Job
from app.models.finding import Finding

# Wordlists embutidas (fallback se não especificada no config)
WORDLISTS_DIR = Path("/app/tools/wordlists")

BUILTIN = {
    "dirs":       ["admin", "login", "api", "v1", "v2", "v3", "uploads", "files", ".git",
                   ".env", ".htaccess", ".htpasswd", "backup", "swagger", "swagger-ui",
                   "swagger.json", "openapi.json", "api-docs", "graphql", "actuator",
                   "actuator/health", "actuator/env", "actuator/mappings", "debug",
                   "console", "phpinfo.php", "info.php", "robots.txt", "sitemap.xml",
                   "server-status", "server-info", "wp-admin", "wp-login.php",
                   "config", "settings", "dashboard", "panel", "manage", "internal",
                   "private", "portal", "staff", "users", "account", "profile",
                   "secrets", "credentials", "password", "export", "import",
                   "health", "metrics", "logs", "test", "staging", "old", "bak",
                   "tmp", "cache", ".DS_Store", ".svn", "web.config", "crossdomain.xml",
                   "dump.sql", "database", "db", "sql", "phpmyadmin", "adminer",
                   "wp-config.php", "wp-content", "wp-includes", "cgi-bin",
                   "jenkins", "gitlab", "jira", "confluence", "grafana", "kibana",
                   "prometheus", "sonarqube", "portainer", "traefik"],
    "params":     ["id", "user", "file", "path", "url", "redirect", "token", "cmd",
                   "debug", "page", "search", "query", "q", "s", "lang", "type",
                   "action", "callback", "next", "return", "returnUrl", "return_to",
                   "goto", "dest", "destination", "redir", "redirect_uri", "out",
                   "view", "dir", "cat", "category", "name", "key", "email",
                   "username", "password", "admin", "sort", "order", "limit",
                   "offset", "format", "template", "include", "require", "src"],
    "subdomains": ["www", "api", "dev", "staging", "admin", "mail", "portal", "app",
                   "beta", "test", "demo", "sandbox", "qa", "uat", "pre", "prod",
                   "cdn", "static", "assets", "media", "img", "images", "files",
                   "upload", "download", "docs", "wiki", "help", "support", "faq",
                   "blog", "news", "shop", "store", "payment", "billing", "checkout",
                   "mobile", "m", "vpn", "remote", "gateway", "proxy", "lb",
                   "internal", "intranet", "corp", "secure", "auth", "login", "sso",
                   "oauth", "id", "accounts", "dashboard", "panel", "manage",
                   "monitor", "status", "health", "grafana", "kibana", "prometheus",
                   "jenkins", "gitlab", "jira", "confluence", "bitbucket", "sonar",
                   "vault", "consul", "rabbitmq", "kafka", "redis", "elastic",
                   "db", "database", "mysql", "postgres", "mongo", "cache",
                   "ns1", "ns2", "ns3", "mx", "smtp", "imap", "pop", "ftp", "sftp",
                   "git", "svn", "ci", "cd", "deploy", "release", "build",
                   "stage", "stg", "prd", "dev1", "dev2", "api2", "api-v2"],
}


def load_wordlist(name: str) -> list[str]:
    """Tenta carregar wordlist do disco; usa embutida como fallback."""
    path = WORDLISTS_DIR / f"{name}.txt"
    if path.exists():
        return [l.strip() for l in path.read_text().splitlines() if l.strip()]
    return BUILTIN.get(name, BUILTIN["dirs"])


async def fuzz_urls(urls: list[str], job: Job, threads: int = 80) -> list[dict]:
    """
    Faz requisições HTTP em paralelo e retorna os hits interessantes.
    Usa httpx (async) ao invés de requests (síncrono) para máxima performance.
    """
    semaphore = asyncio.Semaphore(threads)  # Limita requisições simultâneas
    hits = []

    async def fetch(url: str):
        async with semaphore:
            try:
                async with httpx.AsyncClient(
                    verify=False, follow_redirects=False, timeout=10
                ) as client:
                    headers = job.config.get("headers", {})
                    if job.config.get("cookie"):
                        headers["Cookie"] = job.config["cookie"]

                    resp = await client.get(url, headers=headers)

                    # Filtra status codes desinteressantes
                    if resp.status_code == 404:
                        return

                    log_line = f"[{resp.status_code}] {len(resp.content)}b  {url}"
                    job.logs.append(log_line)

                    if resp.status_code in [200, 201, 403, 500, 503]:
                        hits.append({
                            "url": url,
                            "status": resp.status_code,
                            "size": len(resp.content),
                        })

            except Exception:
                pass

    # Salva logs periodicamente durante a execução
    batch_size = 50
    for i in range(0, len(urls), batch_size):
        batch = urls[i:i + batch_size]
        await asyncio.gather(*[fetch(u) for u in batch])
        if len(job.logs) % batch_size == 0:
            await job.save()

    return hits


async def task_run_dir_fuzz(ctx, job_id: str):
    """Fuzzing de diretórios: testa /palavra para cada palavra da wordlist."""
    job = await Job.get(ObjectId(job_id))
    if not job:
        return

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()

        base_url = job.config.get("url", "").rstrip("/")
        wordlist_name = job.config.get("wordlist", "dirs")
        threads = job.config.get("threads", 80)

        words = load_wordlist(wordlist_name)
        urls  = [f"{base_url}/{w}" for w in words]

        job.logs = [f"[dir_fuzz] Iniciando em {base_url} | {len(urls)} palavras | {threads} threads"]
        await job.save()

        hits = await fuzz_urls(urls, job, threads)

        # Auto-cria findings para resultados suspeitos (500 = erro do servidor)
        auto_findings = []
        for hit in hits:
            if hit["status"] == 500:
                f = Finding(
                    user_id=job.user_id,
                    program_id=job.program_id,
                    job_id=str(job.id),
                    title=f"Erro 500 em {hit['url']}",
                    type="info_disclosure",
                    severity="low",
                    affected_url=hit["url"],
                    description=f"O servidor retornou HTTP 500 para: `{hit['url']}`\n\nIsso pode indicar uma exceção não tratada, que pode conter informações sensíveis.",
                    steps_to_reproduce=f"1. Acesse: {hit['url']}\n2. Observe o erro 500",
                )
                auto_findings.append(f)

        if auto_findings:
            await Finding.insert_many(auto_findings)

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {"urls_tested": len(urls), "hits": len(hits), "auto_findings": len(auto_findings)}
        job.logs.append(f"[dir_fuzz] Concluído: {len(hits)} hits encontrados")
        await job.save()

    except Exception as e:
        import traceback
        job.status = "failed"
        job.error = traceback.format_exc()
        job.finished_at = datetime.utcnow()
        await job.save()


async def task_run_param_fuzz(ctx, job_id: str):
    """Fuzzing de parâmetros: substitui FUZZ em cada posição da URL."""
    job = await Job.get(ObjectId(job_id))
    if not job:
        return

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()

        url_template = job.config.get("url", "")
        wordlist_name = job.config.get("wordlist", "params")
        threads = job.config.get("threads", 80)

        if "FUZZ" not in url_template:
            job.status = "failed"
            job.error = "URL não contém FUZZ"
            await job.save()
            return

        words = load_wordlist(wordlist_name)
        urls  = [url_template.replace("FUZZ", w) for w in words]

        job.logs = [f"[param_fuzz] Iniciando | template: {url_template}"]
        await job.save()

        hits = await fuzz_urls(urls, job, threads)

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {"urls_tested": len(urls), "hits": len(hits)}
        job.logs.append(f"[param_fuzz] Concluído: {len(hits)} hits")
        await job.save()

    except Exception as e:
        import traceback
        job.status = "failed"
        job.error = traceback.format_exc()
        job.finished_at = datetime.utcnow()
        await job.save()


async def task_run_sub_fuzz(ctx, job_id: str):
    """Fuzzing de subdomínios: testa FUZZ.dominio.com."""
    job = await Job.get(ObjectId(job_id))
    if not job:
        return

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()

        url_template = job.config.get("url", "")
        wordlist_name = job.config.get("wordlist", "subdomains")
        threads = job.config.get("threads", 80)

        words = load_wordlist(wordlist_name)
        urls  = [url_template.replace("FUZZ", w) for w in words]

        job.logs = [f"[sub_fuzz] Iniciando | template: {url_template}"]
        await job.save()

        hits = await fuzz_urls(urls, job, threads)

        # Subdomínios ativos viram novos Targets automaticamente
        from app.models.target import Target
        new_targets = []
        for hit in hits:
            if hit["status"] in [200, 301, 302]:
                from urllib.parse import urlparse
                parsed = urlparse(hit["url"])
                t = Target(
                    program_id=job.program_id,
                    user_id=job.user_id,
                    value=parsed.netloc,
                    type="domain",
                    notes=f"Encontrado pelo sub_fuzz job {job.id}",
                )
                new_targets.append(t)

        if new_targets:
            await Target.insert_many(new_targets)

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {"urls_tested": len(urls), "hits": len(hits), "new_targets": len(new_targets)}
        job.logs.append(f"[sub_fuzz] Concluído: {len(hits)} subdomínios ativos")
        await job.save()

    except Exception as e:
        import traceback
        job.status = "failed"
        job.error = traceback.format_exc()
        job.finished_at = datetime.utcnow()
        await job.save()
