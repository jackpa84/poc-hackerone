"""
workers/api_scanner.py — Descoberta de Endpoints de API com Kiterunner + Nuclei

Kiterunner é especializado em descoberta de rotas REST API contextual,
entendendo estrutura de APIs modernas (versioning, recursos, etc).
Combina com nuclei para detecção de API security issues.

Fluxo:
  1. Usa Kiterunner para descoberta de rotas API (wordlists de API)
  2. Usa nuclei com templates focados em API (auth bypass, BOLA, etc.)
  3. Testa GraphQL introspection se detectado
  4. Cria findings para endpoints e vulnerabilidades de API encontrados
"""
import asyncio
import json
import logging
import tempfile
import os
import httpx
from datetime import datetime
from bson import ObjectId
from urllib.parse import urlparse

from app.models.job import Job
from app.models.finding import Finding
from app.services import events as ev

logger = logging.getLogger(__name__)

# Wordlist de endpoints de API (built-in para kiterunner)
KITERUNNER_WORDLISTS = [
    "/usr/local/share/kiterunner/routes-small.kite",
    "/usr/local/share/kiterunner/routes-large.kite",
]

# Endpoints GraphQL comuns
GRAPHQL_ENDPOINTS = [
    "/graphql", "/graphql/v1", "/api/graphql", "/query",
    "/v1/graphql", "/gql", "/graphiql", "/playground",
]

# Headers de GraphQL introspection
GRAPHQL_INTROSPECTION_QUERY = {
    "query": "{ __schema { types { name } } }"
}


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


async def _test_graphql(base_url: str, job: Job) -> list[dict]:
    """Testa endpoints GraphQL e verifica se introspection está habilitada."""
    findings = []
    async with httpx.AsyncClient(verify=False, timeout=15) as client:
        for endpoint in GRAPHQL_ENDPOINTS:
            url = base_url.rstrip("/") + endpoint
            try:
                # Testa GET (alguns servidores aceitam)
                resp = await client.get(url)
                if resp.status_code in (200, 400):
                    # Testa introspection via POST
                    post_resp = await client.post(
                        url,
                        json=GRAPHQL_INTROSPECTION_QUERY,
                        headers={"Content-Type": "application/json"},
                    )
                    if post_resp.status_code == 200:
                        data = post_resp.json()
                        if "data" in data and "__schema" in str(data):
                            findings.append({
                                "url": url,
                                "endpoint": endpoint,
                                "types_count": len(data.get("data", {}).get("__schema", {}).get("types", [])),
                            })
                            job.logs.append(f"[graphql] Introspection habilitada em: {url}")
            except Exception:
                pass
    return findings


async def task_run_api_scan(ctx, job_id: str):
    """
    Scanner de APIs com Kiterunner + Nuclei API templates.
    config esperado:
      - url:       URL base da API (ex: https://api.example.com)
      - wordlist:  small | large (default: small)
      - cookie:    cookie de autenticação (opcional)
      - auth_header: header de autenticação (ex: "Authorization: Bearer token")
    """
    job = await Job.get(ObjectId(job_id))
    if not job:
        return

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()

        target_url = job.config.get("url", "")
        if not target_url:
            job.status = "failed"
            job.error = "URL não especificada"
            await job.save()
            return

        # Garante protocolo e valida URL
        if not target_url.startswith("http"):
            target_url = f"https://{target_url}"
        parsed = urlparse(target_url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            job.status = "failed"
            job.error = f"URL inválida: {target_url!r}"
            await job.save()
            return

        job.logs = [f"[api_scan] Iniciando descoberta de API em: {target_url}"]
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "running")

        findings_count = 0

        # ── Teste GraphQL ─────────────────────────────────────────────────
        job.logs.append("[graphql] Testando endpoints GraphQL...")
        await job.save()

        graphql_findings = await _test_graphql(target_url, job)
        for gf in graphql_findings:
            finding = Finding(
                user_id=job.user_id,
                program_id=job.program_id,
                target_id=job.target_id,
                job_id=str(job.id),
                title=f"GraphQL Introspection habilitada em {gf['url']}",
                type="info_disclosure",
                severity="medium",
                affected_url=gf["url"],
                description=(
                    f"O endpoint GraphQL `{gf['url']}` tem introspection habilitada.\n\n"
                    f"**Schema exposto:** {gf['types_count']} tipos encontrados.\n\n"
                    f"Introspection em produção expõe toda a estrutura da API, "
                    f"facilitando enumeração de queries, mutations e dados sensíveis."
                ),
                steps_to_reproduce=(
                    f"1. Envie: `POST {gf['url']}`\n"
                    f"2. Body: `{{\"query\": \"{{ __schema {{ types {{ name }} }} }}\"}}`\n"
                    f"3. Use GraphQL Voyager para visualizar o schema completo"
                ),
            )
            await finding.insert()
            findings_count += 1
            await ev.finding_new(
                job.user_id, str(finding.id),
                finding.title, finding.severity, finding.type, finding.affected_url
            )

        # ── Kiterunner para descoberta de rotas ───────────────────────────
        # Verifica se kiterunner está disponível
        kr_bin = "/usr/local/bin/kr"
        if not os.path.exists(kr_bin):
            job.logs.append("[kiterunner] Binário não encontrado, pulando...")
        else:
            wordlist_size = job.config.get("wordlist", "small")
            kite_wordlist = KITERUNNER_WORDLISTS[0] if wordlist_size == "small" else KITERUNNER_WORDLISTS[-1]

            if os.path.exists(kite_wordlist):
                job.logs.append(f"[kiterunner] Descobrindo rotas de API ({wordlist_size})...")
                await job.save()

                kr_cmd = [
                    kr_bin, "scan", target_url,
                    "-w", kite_wordlist,
                    "--parallelism", "20",
                    "--timeout", "5000ms",
                    "--fail-status-codes", "400,401,403,404,429,500,503",
                    "--output", "json",
                ]

                if job.config.get("auth_header"):
                    kr_cmd += ["--header", job.config["auth_header"]]

                kr_output = await _run_subprocess(kr_cmd, job)

                # Processa resultados do kiterunner
                kr_endpoints = []
                for line in kr_output:
                    try:
                        result = json.loads(line)
                        endpoint = result.get("path", result.get("url", ""))
                        status = result.get("status", 0)
                        method = result.get("method", "GET")
                        if endpoint and status not in (0, 404):
                            kr_endpoints.append({
                                "url": f"{target_url.rstrip('/')}{endpoint}",
                                "method": method,
                                "status": status,
                                "endpoint": endpoint,
                            })
                    except json.JSONDecodeError:
                        # Formato texto: "200 GET https://..."
                        if line.startswith(("200", "201", "301", "302", "403")):
                            parts = line.split()
                            if len(parts) >= 3:
                                kr_endpoints.append({
                                    "url": parts[2] if len(parts) > 2 else target_url,
                                    "method": parts[1] if len(parts) > 1 else "GET",
                                    "status": int(parts[0]),
                                    "endpoint": "",
                                })

                job.logs.append(f"[kiterunner] {len(kr_endpoints)} rotas de API descobertas")

                if kr_endpoints:
                    endpoints_list = "\n".join([
                        f"- [{ep['method']}] `{ep['url']}` ({ep['status']})"
                        for ep in kr_endpoints[:30]
                    ])

                    finding = Finding(
                        user_id=job.user_id,
                        program_id=job.program_id,
                        target_id=job.target_id,
                        job_id=str(job.id),
                        title=f"Rotas de API descobertas em {target_url} ({len(kr_endpoints)} endpoints)",
                        type="info_disclosure",
                        severity="low",
                        affected_url=target_url,
                        description=(
                            f"Kiterunner descobriu {len(kr_endpoints)} rotas de API ativas:\n\n"
                            f"{endpoints_list}\n"
                            f"{'...(truncado)' if len(kr_endpoints) > 30 else ''}\n\n"
                            f"Use esses endpoints para testes de autorização (BOLA/IDOR), "
                            f"injeção e controle de acesso."
                        ),
                        steps_to_reproduce=(
                            f"1. Execute: `kr scan {target_url} -w routes-small.kite`\n"
                            f"2. Teste cada endpoint com diferentes tokens de usuário\n"
                            f"3. Verifique se usuários não-admin conseguem acessar rotas admin"
                        ),
                    )
                    await finding.insert()
                    findings_count += 1
                    await ev.finding_new(
                        job.user_id, str(finding.id),
                        finding.title, finding.severity, finding.type, finding.affected_url
                    )
            else:
                job.logs.append(f"[kiterunner] Wordlist não encontrada em {kite_wordlist}")

        # ── Nuclei com templates de API ───────────────────────────────────
        job.logs.append("[nuclei] Rodando templates de segurança de API...")
        await job.save()

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write(target_url)
            tmp_target = f.name

        nuclei_cmd = [
            "/usr/local/bin/nuclei", "-l", tmp_target,
            "-silent", "-jsonl",
            "-tags", "api,graphql,rest,auth,token",
            "-severity", "medium,high,critical",
            "-c", "20", "-rl", "100",
            "-timeout", "10",
        ]

        nuclei_output = await _run_subprocess(nuclei_cmd, job)
        os.unlink(tmp_target)

        for line in nuclei_output:
            try:
                result = json.loads(line)
                sev = result.get("info", {}).get("severity", "medium")
                template_id = result.get("template-id", "unknown")
                matched_url = result.get("matched-at", target_url)
                title = result.get("info", {}).get("name", template_id)

                finding = Finding(
                    user_id=job.user_id,
                    program_id=job.program_id,
                    target_id=job.target_id,
                    job_id=str(job.id),
                    title=f"[API] {title} em {matched_url}",
                    type="other",
                    severity=sev if sev in ("critical", "high", "medium", "low") else "medium",
                    affected_url=matched_url,
                    description=f"Template nuclei de API: `{template_id}`\n\n{result.get('info', {}).get('description', '')}",
                    steps_to_reproduce=f"1. Execute: `nuclei -u {matched_url} -t {template_id}`",
                )
                await finding.insert()
                findings_count += 1
                await ev.finding_new(
                    job.user_id, str(finding.id),
                    finding.title, finding.severity, finding.type, finding.affected_url
                )
            except Exception:
                pass

        job.logs.append(f"[api_scan] {findings_count} findings criados")

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {
            "graphql_endpoints": len(graphql_findings),
            "api_findings": findings_count,
        }
        job.logs.append("[api_scan] Concluído!")
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "completed", job.result_summary)

    except Exception:
        import traceback
        tb = traceback.format_exc()
        logger.error("[api_scan] job=%s error=%s", job_id, tb)
        job.status = "failed"
        job.error = tb
        job.finished_at = datetime.utcnow()
        await job.save()
