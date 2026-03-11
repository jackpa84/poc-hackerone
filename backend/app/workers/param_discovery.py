"""
workers/param_discovery.py — Descoberta de Parâmetros com Arjun

Arjun descobre parâmetros HTTP ocultos em GET, POST, JSON e XML.
É essencial para encontrar funcionalidades escondidas que não aparecem na UI.

Fluxo:
  1. Recebe URL alvo
  2. Executa Arjun em múltiplos métodos (GET, POST, JSON)
  3. Para cada parâmetro descoberto, testa comportamento básico
  4. Cria findings para parâmetros interessantes (debug, admin, redirect, etc.)
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

# Parâmetros de alto risco que merecem atenção especial
HIGH_RISK_PARAMS = {
    "redirect", "return", "returnUrl", "return_to", "next", "goto", "dest",
    "destination", "redir", "redirect_uri", "out", "url", "link", "target",
    "debug", "test", "admin", "superuser", "role", "is_admin", "isAdmin",
    "is_staff", "internal", "dev", "preview",
    "file", "path", "include", "require", "template", "page", "load",
    "cmd", "exec", "command", "run", "shell", "system",
    "sql", "query", "search", "filter", "where",
    "token", "key", "secret", "password", "pass", "pwd", "api_key",
    "access_token", "auth", "session", "sid",
    "callback", "jsonp", "cb",
    "id", "user_id", "uid", "account", "profile",
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


async def task_run_param_discovery(ctx, job_id: str):
    """
    Descoberta de parâmetros com Arjun.
    config esperado:
      - url:    URL alvo (ex: https://site.com/api/user)
      - method: GET | POST | JSON | XML (default: GET)
      - cookie: cookie de sessão (opcional)
      - headers: headers adicionais (dict, opcional)
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
        parsed = urlparse(target_url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            job.status = "failed"
            job.error = f"URL inválida: {target_url!r}"
            await job.save()
            return

        job.logs = [f"[param_discovery] Iniciando Arjun em: {target_url}"]
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "running")

        findings_count = 0
        all_params = []

        # ── Executa Arjun para cada método ───────────────────────────────
        methods = job.config.get("methods", ["GET", "POST", "JSON"])
        if isinstance(methods, str):
            methods = [methods]

        for method in methods:
            job.logs.append(f"[arjun] Testando método {method}...")
            await job.save()

            # Arquivo de saída temporário
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".json", delete=False
            ) as f:
                tmp_out = f.name

            arjun_cmd = [
                "python3", "-m", "arjun",
                "-u", target_url,
                "-m", method,
                "--output-file", tmp_out,
                "-t", "20",          # threads
                "--passive",         # não envia payloads destrutivos
                "-q",                # modo quieto
            ]

            if job.config.get("cookie"):
                arjun_cmd += ["--headers", f"Cookie: {job.config['cookie']}"]

            if job.config.get("headers"):
                for k, v in job.config["headers"].items():
                    arjun_cmd += ["--headers", f"{k}: {v}"]

            await _run_subprocess(arjun_cmd, job)

            # Lê resultado JSON do Arjun
            try:
                if os.path.exists(tmp_out):
                    with open(tmp_out) as f:
                        result = json.load(f)
                    params = result if isinstance(result, list) else result.get("params", [])
                    all_params.extend([(p, method) for p in params])
                    job.logs.append(f"[arjun] {len(params)} parâmetros encontrados via {method}")
            except Exception:
                pass
            finally:
                if os.path.exists(tmp_out):
                    os.unlink(tmp_out)

        # ── Analisa parâmetros encontrados ────────────────────────────────
        job.logs.append(f"[param_discovery] Total: {len(all_params)} parâmetros únicos")
        await job.save()

        # Deduplicar parâmetros
        seen = set()
        unique_params = []
        for param, method in all_params:
            if param not in seen:
                seen.add(param)
                unique_params.append((param, method))

        # Categoriza por risco
        high_risk = [(p, m) for p, m in unique_params if p.lower() in HIGH_RISK_PARAMS]
        low_risk = [(p, m) for p, m in unique_params if p.lower() not in HIGH_RISK_PARAMS]

        # Cria finding para conjunto de parâmetros de alto risco
        if high_risk:
            params_list = "\n".join([f"- `{p}` (via {m})" for p, m in high_risk])
            finding = Finding(
                user_id=job.user_id,
                program_id=job.program_id,
                target_id=job.target_id,
                job_id=str(job.id),
                title=f"Parâmetros sensíveis descobertos em {target_url} ({len(high_risk)} params)",
                type="info_disclosure",
                severity="medium",
                affected_url=target_url,
                description=(
                    f"Arjun descobriu {len(high_risk)} parâmetros HTTP ocultos de alto interesse:\n\n"
                    f"{params_list}\n\n"
                    f"Parâmetros de redirecionamento podem ser explorados para Open Redirect. "
                    f"Parâmetros de debug/admin podem revelar funcionalidades privilegiadas. "
                    f"Parâmetros de arquivo/path podem ser vulneráveis a Path Traversal ou LFI."
                ),
                steps_to_reproduce=(
                    f"1. Acesse: `{target_url}`\n"
                    f"2. Adicione um dos parâmetros descobertos: `?debug=true`, `?admin=1`, etc.\n"
                    f"3. Observe mudanças no comportamento da aplicação"
                ),
            )
            await finding.insert()
            findings_count += 1
            await ev.finding_new(
                job.user_id, str(finding.id),
                finding.title, finding.severity, finding.type, finding.affected_url
            )

        # Cria finding informativo para todos os parâmetros
        if unique_params:
            all_params_list = "\n".join([f"- `{p}` (via {m})" for p, m in unique_params[:50]])
            finding_info = Finding(
                user_id=job.user_id,
                program_id=job.program_id,
                target_id=job.target_id,
                job_id=str(job.id),
                title=f"Parâmetros HTTP ocultos mapeados — {target_url} ({len(unique_params)} total)",
                type="info_disclosure",
                severity="informational",
                affected_url=target_url,
                description=(
                    f"Arjun mapeou {len(unique_params)} parâmetros HTTP ocultos:\n\n"
                    f"{all_params_list}\n"
                    f"{'... (truncado)' if len(unique_params) > 50 else ''}\n\n"
                    f"Use estes parâmetros para testes de XSS, SQLi, SSRF e Open Redirect."
                ),
                steps_to_reproduce=(
                    f"1. Execute: `arjun -u {target_url}`\n"
                    f"2. Teste cada parâmetro com payloads específicos"
                ),
            )
            await finding_info.insert()
            findings_count += 1

        job.logs.append(f"[param_discovery] {len(unique_params)} parâmetros mapeados ({len(high_risk)} alto risco)")

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {
            "params_found": len(unique_params),
            "high_risk_params": len(high_risk),
            "findings": findings_count,
        }
        job.logs.append("[param_discovery] Concluído!")
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "completed", job.result_summary)

    except Exception:
        import traceback
        tb = traceback.format_exc()
        logger.error("[param_discovery] job=%s error=%s", job_id, tb)
        job.status = "failed"
        job.error = tb
        job.finished_at = datetime.utcnow()
        await job.save()
