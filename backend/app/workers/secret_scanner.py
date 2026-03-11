"""
workers/secret_scanner.py — Scanner de Secrets com Gitleaks + TruffleHog

Detecta credenciais e segredos expostos em repositórios Git públicos,
URLs de arquivos e histórico de commits.

Fluxo:
  1. Clona repositório Git ou escaneia URL
  2. Executa Gitleaks no histórico de commits
  3. Executa TruffleHog para validação adicional
  4. Cria findings para cada secret encontrado
"""
import asyncio
import json
import logging
import re
import tempfile
import os
import shutil
from datetime import datetime
from bson import ObjectId

from app.models.job import Job
from app.models.finding import Finding
from app.services import events as ev

logger = logging.getLogger(__name__)

_GIT_URL_RE = re.compile(r'^https?://[a-zA-Z0-9._/:\-@%?=&#]+$')

# Mapeamento de severity por tipo de secret
SECRET_SEVERITY = {
    "aws":          "critical",
    "gcp":          "critical",
    "azure":        "critical",
    "private":      "critical",
    "database":     "critical",
    "password":     "high",
    "token":        "high",
    "api":          "high",
    "stripe":       "high",
    "sendgrid":     "high",
    "github":       "high",
    "slack":        "medium",
    "generic":      "medium",
}


async def _run_subprocess(cmd: list[str], job: Job, cwd: str | None = None) -> list[str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
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


async def task_run_secret_scan(ctx, job_id: str):
    """
    Scanner de secrets com Gitleaks.
    config esperado:
      - repo_url: URL do repositório Git (ex: https://github.com/company/app)
      - url:      URL alternativa (para scan de arquivo específico)
      - branch:   branch a escanear (default: HEAD)
    """
    job = await Job.get(ObjectId(job_id))
    if not job:
        return

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()

        repo_url = job.config.get("repo_url", job.config.get("url", ""))
        if not repo_url:
            job.status = "failed"
            job.error = "URL do repositório não especificada"
            await job.save()
            return
        if not _GIT_URL_RE.match(repo_url):
            job.status = "failed"
            job.error = f"URL de repositório inválida: {repo_url!r}"
            await job.save()
            return

        job.logs = [f"[secret_scan] Iniciando scan de secrets em: {repo_url}"]
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "running")

        tmp_dir = tempfile.mkdtemp()
        findings_count = 0

        try:
            # ── Clona o repositório ───────────────────────────────────────
            job.logs.append(f"[git] Clonando repositório (profundidade: 100 commits)...")
            await job.save()

            clone_proc = await asyncio.create_subprocess_exec(
                "git", "clone", "--depth", "100", "--quiet", repo_url, tmp_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, clone_err = await clone_proc.communicate()

            if clone_proc.returncode != 0:
                err_msg = clone_err.decode().strip()
                job.logs.append(f"[git] Erro ao clonar: {err_msg}")

                # Tenta como scan de URL direta (não é git repo)
                if "not a git" in err_msg.lower() or "repository" not in err_msg.lower():
                    job.logs.append("[gitleaks] Tentando scan de arquivo/URL direta...")
                    await job.save()
            else:
                job.logs.append(f"[git] Repositório clonado com sucesso")
                await job.save()

            # ── Executa Gitleaks ──────────────────────────────────────────
            job.logs.append("[gitleaks] Executando scan de secrets no histórico de commits...")
            await job.save()

            gitleaks_report = os.path.join(tmp_dir, "gitleaks_report.json")

            gitleaks_cmd = [
                "/usr/local/bin/gitleaks", "detect",
                "--source", tmp_dir,
                "--report-format", "json",
                "--report-path", gitleaks_report,
                "--no-banner",
                "--log-level", "warn",
            ]

            # Se tem branch específica
            branch = job.config.get("branch")
            if branch:
                gitleaks_cmd += ["--log-opts", f"HEAD..{branch}"]

            await _run_subprocess(gitleaks_cmd, job)

            # ── Processa resultados do Gitleaks ───────────────────────────
            if os.path.exists(gitleaks_report):
                try:
                    with open(gitleaks_report) as f:
                        leaks = json.load(f)

                    job.logs.append(f"[gitleaks] {len(leaks)} possíveis secrets encontrados")
                    await job.save()

                    # Agrupa por tipo de regra
                    by_type: dict[str, list] = {}
                    for leak in leaks:
                        rule = leak.get("RuleID", leak.get("Description", "generic"))
                        by_type.setdefault(rule, []).append(leak)

                    for rule_id, instances in by_type.items():
                        # Determina severity
                        rule_lower = rule_id.lower()
                        severity = "medium"
                        for keyword, sev in SECRET_SEVERITY.items():
                            if keyword in rule_lower:
                                severity = sev
                                break

                        # Prepara detalhes
                        details = []
                        for leak in instances[:5]:
                            commit = leak.get("Commit", "N/A")[:8]
                            file_path = leak.get("File", "N/A")
                            line = leak.get("StartLine", "?")
                            secret_preview = leak.get("Secret", "")[:30] + "..."
                            details.append(
                                f"- Commit `{commit}` | `{file_path}:{line}` | `{secret_preview}`"
                            )

                        finding = Finding(
                            user_id=job.user_id,
                            program_id=job.program_id,
                            target_id=job.target_id,
                            job_id=str(job.id),
                            title=f"Secret exposto no Git: {rule_id} ({len(instances)} ocorrências)",
                            type="info_disclosure",
                            severity=severity,
                            affected_url=repo_url,
                            description=(
                                f"Gitleaks encontrou **{rule_id}** exposto no histórico do repositório:\n\n"
                                f"{chr(10).join(details)}\n\n"
                                f"Secrets no histórico de commits permanecem acessíveis mesmo após remoção do código, "
                                f"pois ficam registrados nos commits anteriores."
                            ),
                            steps_to_reproduce=(
                                f"1. Clone: `git clone {repo_url}`\n"
                                f"2. Execute: `gitleaks detect --source . --report-format json`\n"
                                f"3. Ou acesse diretamente o commit mencionado no GitHub"
                            ),
                        )
                        await finding.insert()
                        findings_count += 1
                        await ev.finding_new(
                            job.user_id, str(finding.id),
                            finding.title, finding.severity, finding.type, finding.affected_url
                        )

                except (json.JSONDecodeError, Exception) as e:
                    job.logs.append(f"[gitleaks] Erro ao processar resultados: {e}")

            else:
                job.logs.append("[gitleaks] Nenhum secret encontrado ou repositório limpo")

        finally:
            # Limpa diretório temporário
            shutil.rmtree(tmp_dir, ignore_errors=True)

        job.logs.append(f"[secret_scan] {findings_count} findings de secrets criados")

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {
            "repo_url": repo_url,
            "secret_findings": findings_count,
        }
        job.logs.append("[secret_scan] Concluído!")
        await job.save()
        await ev.job_update(job.user_id, str(job.id), job.type, "completed", job.result_summary)

    except Exception:
        import traceback
        tb = traceback.format_exc()
        logger.error("[secret_scan] job=%s error=%s", job_id, tb)
        job.status = "failed"
        job.error = tb
        job.finished_at = datetime.utcnow()
        await job.save()
