"""
workers/sqli_scanner.py — Scanner de SQL Injection com SQLMap

SQLMap é a ferramenta padrão para detecção e exploração de SQL Injection.
Suporte a todos os tipos: boolean-based, time-based, union, error-based, stacked.

Fluxo:
  1. Recebe URL com parâmetro (ex: https://site.com/item?id=1)
  2. Executa sqlmap com detecção (sem exploração destrutiva)
  3. Cria findings automáticos para cada injeção detectada
"""
import asyncio
import logging
import re
from datetime import datetime
from bson import ObjectId
from urllib.parse import urlparse

from app.models.job import Job
from app.models.finding import Finding
from app.services import events as ev

logger = logging.getLogger(__name__)


def _safe_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError(f"URL inválida: {url!r}")
    return url


async def _run_subprocess(cmd: list[str], job: Job) -> list[str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
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


async def task_run_sqli_scan(ctx, job_id: str):
    """
    Scanner SQL Injection com SQLMap.
    config esperado:
      - url:    URL alvo com parâmetro (ex: https://site.com/page?id=1)
      - data:   corpo POST (ex: username=test&password=test)
      - cookie: cookie de sessão (opcional)
      - level:  nível de teste 1-5 (default: 2)
      - risk:   risco de teste 1-3 (default: 1, nunca use 3 em prod)
      - dbms:   banco de dados alvo (mysql, postgres, mssql, oracle)
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
        try:
            target_url = _safe_url(target_url)
        except ValueError as e:
            job.status = "failed"
            job.error = str(e)
            await job.save()
            return

        job.logs = [f"[sqli_scan] Iniciando SQLMap em: {target_url}"]
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "running")

        # ── Monta comando SQLMap ──────────────────────────────────────────
        level = min(int(job.config.get("level", 2)), 3)  # Máximo 3 para segurança
        risk  = min(int(job.config.get("risk",  1)), 1)  # Máximo 1 (não destrutivo)

        sqlmap_cmd = [
            "python3", "/usr/local/bin/sqlmap/sqlmap.py",
            "-u", target_url,
            "--batch",                    # Sem prompts interativos
            "--level", str(level),
            "--risk", str(risk),
            "--timeout", "30",
            "--retries", "2",
            "--random-agent",             # User-agent aleatório (bypass WAF básico)
            "--output-dir", "/tmp/sqlmap_output",
            "--forms",                    # Testa formulários automaticamente
            "--crawl=2",                  # Crawl depth para encontrar mais parâmetros
        ]

        # POST data
        if job.config.get("data"):
            sqlmap_cmd += ["--data", str(job.config["data"])[:2048]]

        # Cookie
        if job.config.get("cookie"):
            sqlmap_cmd += ["--cookie", str(job.config["cookie"])[:512]]

        # DBMS específico (mais rápido)
        if job.config.get("dbms"):
            sqlmap_cmd += ["--dbms", job.config["dbms"]]

        # WAF bypass (técnicas extras de evasão)
        if job.config.get("waf_bypass"):
            sqlmap_cmd += ["--tamper", "space2comment,between,randomcase"]

        job.logs.append(f"[sqlmap] Executando com level={level}, risk={risk}...")
        await job.save()

        output = await _run_subprocess(sqlmap_cmd, job)

        # ── Analisa output do SQLMap ──────────────────────────────────────
        findings_count = 0
        current_param = None
        vuln_techniques = []
        is_vulnerable = False

        for line in output:
            # Detecta parâmetro sendo testado
            param_match = re.search(r"Parameter: (\S+) \(", line)
            if param_match:
                current_param = param_match.group(1)
                vuln_techniques = []
                is_vulnerable = False

            # Detecta técnicas de injeção confirmadas
            if "Type:" in line and current_param:
                tech = line.replace("Type:", "").strip()
                vuln_techniques.append(tech)
                is_vulnerable = True

            # Detecta confirmação de vulnerabilidade
            if "sqlmap identified the following injection point" in line:
                is_vulnerable = True

            # Quando encontra DBMS, cria o finding
            if is_vulnerable and current_param and ("back-end DBMS:" in line or "database management system is" in line):
                dbms_info = line.strip()
                severity = "critical" if "union" in " ".join(vuln_techniques).lower() else "high"

                finding = Finding(
                    user_id=job.user_id,
                    program_id=job.program_id,
                    target_id=job.target_id,
                    job_id=str(job.id),
                    title=f"SQL Injection no parâmetro `{current_param}` em {target_url}",
                    type="sqli",
                    severity=severity,
                    affected_url=target_url,
                    parameter=current_param,
                    payload=f"Técnicas: {', '.join(vuln_techniques)}",
                    description=(
                        f"Injeção SQL detectada pelo SQLMap no parâmetro `{current_param}`.\n\n"
                        f"**DBMS:** {dbms_info}\n"
                        f"**Técnicas:** {', '.join(vuln_techniques)}\n\n"
                        f"Esta vulnerabilidade permite acesso não autorizado ao banco de dados."
                    ),
                    steps_to_reproduce=(
                        f"1. Execute: `sqlmap -u \"{target_url}\" -p {current_param} --dbs`\n"
                        f"2. Ou: acesse {target_url} e manipule o parâmetro `{current_param}`\n"
                        f"3. Injete: `' OR '1'='1` para verificar comportamento"
                    ),
                )
                await finding.insert()
                findings_count += 1
                await ev.finding_new(
                    job.user_id, str(finding.id),
                    finding.title, finding.severity, finding.type, finding.affected_url
                )
                # Reset para próximo parâmetro
                current_param = None
                is_vulnerable = False
                vuln_techniques = []

        # Fallback: detecta pela string de resumo do sqlmap
        if findings_count == 0:
            full_output = "\n".join(output)
            if "is vulnerable" in full_output or "sqlmap identified" in full_output:
                # Extrai URL do parâmetro vulnerável
                vuln_match = re.search(r"Parameter: (\S+)", full_output)
                param = vuln_match.group(1) if vuln_match else "unknown"

                finding = Finding(
                    user_id=job.user_id,
                    program_id=job.program_id,
                    target_id=job.target_id,
                    job_id=str(job.id),
                    title=f"SQL Injection detectado em {target_url}",
                    type="sqli",
                    severity="high",
                    affected_url=target_url,
                    parameter=param,
                    description=(
                        f"SQLMap detectou injeção SQL em `{target_url}`.\n\n"
                        f"Verifique os logs completos para detalhes da exploração."
                    ),
                    steps_to_reproduce=f"1. Execute: `sqlmap -u \"{target_url}\" --dbs`",
                )
                await finding.insert()
                findings_count += 1
                await ev.finding_new(
                    job.user_id, str(finding.id),
                    finding.title, finding.severity, finding.type, finding.affected_url
                )

        not_vuln = any("does not appear to be injectable" in l for l in output)
        if not_vuln and findings_count == 0:
            job.logs.append("[sqlmap] Nenhuma injeção SQL encontrada nesta URL")

        job.logs.append(f"[sqli_scan] {findings_count} vulnerabilidades SQLi encontradas")

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {
            "url_tested": target_url,
            "sqli_findings": findings_count,
        }
        job.logs.append("[sqli_scan] Concluído!")
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "completed", job.result_summary)

    except Exception:
        import traceback
        tb = traceback.format_exc()
        logger.error("[sqli_scan] job=%s error=%s", job_id, tb)
        job.status = "failed"
        job.error = tb
        job.finished_at = datetime.utcnow()
        await job.save()
