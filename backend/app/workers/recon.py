"""
workers/recon.py — Tarefa de reconhecimento (recon)

Esta função é executada pelo worker ARQ em background.
Ela coordena 5 ferramentas de recon:
  1. subfinder → encontra subdomínios (50 threads)
  2. httpx     → verifica quais estão ativos (50 threads, 150 req/s)
  3. katana    → crawl de URLs dinâmicas (depth 3, 30 concorrência)
  4. gau       → coleta URLs históricas (Wayback + Common Crawl)
  5. nuclei    → scan de vulnerabilidades com templates (30 concorrência)

Cada linha de output é salva no campo job.logs em tempo real,
permitindo que o frontend mostre um terminal ao vivo.
"""
import asyncio
from datetime import datetime
from bson import ObjectId

from app.models.job import Job
from app.models.target import Target
from app.models.finding import Finding
from app.services import events as ev


async def _run_subprocess(cmd: list[str], job: Job) -> list[str]:
    """
    Executa um comando e captura o output linha a linha.
    Cada linha é appendada nos logs do job e salva no banco.
    """
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
            # Salva a cada 10 linhas para não sobrecarregar o banco
            if len(job.logs) % 10 == 0:
                await job.save()

    await proc.wait()
    return lines


async def task_run_recon(ctx, job_id: str):
    """
    Tarefa principal de recon. Chamada pelo ARQ worker.
    ctx é injetado automaticamente pelo ARQ (contém a conexão Redis).
    """
    job = await Job.get(ObjectId(job_id))
    if not job:
        return

    # Busca o alvo associado ao job
    target = None
    if job.target_id:
        target = await Target.get(ObjectId(job.target_id))

    domain = target.value if target else job.config.get("domain", "")
    if not domain:
        job.status = "failed"
        job.error = "Domínio não especificado"
        await job.save()
        return

    # Remove wildcard se existir (*.shopify.com → shopify.com)
    domain = domain.lstrip("*.")

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()
        job.logs = [f"[recon] Iniciando recon em: {domain}"]
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "running")

        # ── Etapa 1: Subfinder ────────────────────────────────────────────
        job.logs.append("[subfinder] Enumerando subdomínios...")
        await job.save()

        subdomains = await _run_subprocess(
            ["/usr/local/bin/subfinder", "-d", domain, "-silent", "-all", "-t", "50"],
            job,
        )
        job.logs.append(f"[subfinder] {len(subdomains)} subdomínios encontrados")

        # ── Etapa 2: httpx ────────────────────────────────────────────────
        if subdomains:
            job.logs.append("[httpx] Verificando hosts ativos...")
            await job.save()

            # Salva subdomínios em arquivo temporário para o httpx
            import tempfile, os
            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
                f.write("\n".join(subdomains))
                tmp_file = f.name

            live_hosts = await _run_subprocess(
                ["/usr/local/bin/httpx-go", "-l", tmp_file, "-silent",
                 "-mc", "200,201,301,302,403",
                 "-threads", "50", "-rl", "150"],
                job,
            )
            os.unlink(tmp_file)
            job.logs.append(f"[httpx] {len(live_hosts)} hosts ativos")
        else:
            live_hosts = []

        # ── Etapa 3: katana (web crawler) ────────────────────────────────
        katana_urls = []
        if live_hosts:
            job.logs.append("[katana] Crawling URLs dinâmicas dos hosts ativos...")
            await job.save()

            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
                f.write("\n".join(live_hosts))
                tmp_hosts = f.name

            katana_urls = await _run_subprocess(
                ["/usr/local/bin/katana", "-list", tmp_hosts, "-silent",
                 "-d", "3", "-c", "30", "-jc", "-kf", "all"],
                job,
            )
            os.unlink(tmp_hosts)
            job.logs.append(f"[katana] {len(katana_urls)} URLs dinâmicas encontradas")

        # ── Etapa 4: gau (URLs históricas) ───────────────────────────────
        job.logs.append("[gau] Coletando URLs históricas...")
        await job.save()

        urls = await _run_subprocess(["/usr/local/bin/gau", "--subs", domain], job)
        job.logs.append(f"[gau] {len(urls)} URLs coletadas")

        # Combina URLs de katana + gau (deduplicadas)
        all_urls = list(set(urls + katana_urls))
        job.logs.append(f"[recon] {len(all_urls)} URLs totais (gau + katana, deduplicadas)")

        # ── Etapa 5: nuclei (scanner de vulnerabilidades) ────────────────
        nuclei_findings_count = 0
        if live_hosts:
            job.logs.append("[nuclei] Executando scan de vulnerabilidades nos hosts ativos...")
            await job.save()

            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
                f.write("\n".join(live_hosts))
                tmp_nuclei = f.name

            nuclei_output = await _run_subprocess(
                ["/usr/local/bin/nuclei", "-l", tmp_nuclei, "-silent",
                 "-severity", "low,medium,high,critical",
                 "-c", "30", "-bs", "25", "-rl", "150",
                 "-jsonl"],
                job,
            )
            os.unlink(tmp_nuclei)

            import json as _json
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
                        description=f"Template: `{template_id}`\n\n{desc}" if desc else f"Vulnerabilidade detectada pelo template `{template_id}`.",
                        steps_to_reproduce=f"1. Execute: `nuclei -u {matched_url} -t {template_id}`\n2. Confirme o resultado",
                    )
                    await nf.insert()
                    nuclei_findings_count += 1
                    await ev.finding_new(job.user_id, str(nf.id), nf.title, nf.severity, nf.type, nf.affected_url)
                except Exception:
                    pass

            job.logs.append(f"[nuclei] {nuclei_findings_count} vulnerabilidades encontradas")

        # ── Auto-criação de findings para URLs sensíveis ──────────────────
        sensitive_paths = [".git", ".env", "phpinfo.php", "server-status", "actuator/env",
                          ".DS_Store", "wp-config.php", ".htpasswd", "web.config",
                          "crossdomain.xml", ".svn", "backup", "dump.sql"]
        auto_findings = []
        for url in all_urls:
            for path in sensitive_paths:
                if path in url.lower():
                    finding = Finding(
                        user_id=job.user_id,
                        program_id=job.program_id,
                        target_id=job.target_id,
                        job_id=str(job.id),
                        title=f"Possível exposição de {path} em {url}",
                        type="info_disclosure",
                        severity="medium",
                        affected_url=url,
                        description=f"URL sensível encontrada no recon: `{url}`\n\nVerifique manualmente se o recurso está acessível.",
                        steps_to_reproduce=f"1. Acesse: {url}\n2. Verifique se retorna conteúdo sensível",
                    )
                    auto_findings.append(finding)
                    break

        if auto_findings:
            await Finding.insert_many(auto_findings)
            job.logs.append(f"[auto] {len(auto_findings)} findings automáticos criados")
            for f in auto_findings:
                await ev.finding_new(job.user_id, str(f.id), f.title, f.severity, f.type, f.affected_url)

        # Atualiza target com data do último recon
        if target:
            target.last_recon_at = datetime.utcnow()
            await target.save()

        # Finaliza
        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {
            "subdomains": len(subdomains),
            "live_hosts": len(live_hosts),
            "urls_gau": len(urls),
            "urls_katana": len(katana_urls),
            "urls_total": len(all_urls),
            "nuclei_findings": nuclei_findings_count,
            "auto_findings": len(auto_findings),
        }
        job.logs.append("[recon] Concluído!")
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "completed", job.result_summary)
        await ev.recon_done(job.user_id, domain, len(subdomains), len(live_hosts), len(urls))

    except Exception as e:
        import traceback
        job.status = "failed"
        job.error = traceback.format_exc()
        job.finished_at = datetime.utcnow()
        await job.save()
