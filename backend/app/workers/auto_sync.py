"""
workers/auto_sync.py — Sincronização automática com HackerOne

task_auto_h1_sync:
  Roda a cada 6 horas como cron job (e imediatamente ao subir o worker).
  Busca todos os programas e scopes da HackerOne API.
  Se encontrar novos targets, dispara o recon IMEDIATAMENTE —
  sem esperar o cron de 15 minutos do scheduler.

task_auto_pipeline_sweep:
  Roda a cada 30 minutos como cron job.
  Varre todos os findings com status 'accepted' que ainda não têm um
  pipeline ativo e os enfileira automaticamente para geração de relatório
  com IA e submissão ao HackerOne (se score >= 70%).

Fluxo completo automático:
  H1 Sync (6h/startup) → novos targets → Recon IMEDIATO
  → Findings detectados → Pipeline Sweep (30min)
  → Relatório IA → Submissão H1
"""
from datetime import datetime

from app.models.job import Job
from app.models.program import Program
from app.models.target import Target
from app.models.user import User
from app.models.finding import Finding
from app.services import events as ev


async def _enqueue_recon_for_target(redis, target: Target, program: Program) -> bool:
    """Cria e enfileira um job de recon para um target novo."""
    if target.type not in ("domain", "wildcard"):
        return False

    domain = target.value.lstrip("*.")
    if not domain or "." not in domain:
        return False

    job = Job(
        user_id=target.user_id,
        program_id=str(program.id),
        target_id=str(target.id),
        type="recon",
        status="pending",
        config={"domain": domain, "auto": True, "source": "h1_sync"},
        logs=[f"[h1_sync] Recon automático após sync de @{domain}"],
    )
    await job.insert()

    arq_job = await redis.enqueue_job("task_run_recon", str(job.id))
    if arq_job:
        job.arq_job_id = arq_job.job_id
        await job.save()

    return True


# ── task_auto_h1_sync ──────────────────────────────────────────────────────

async def task_auto_h1_sync(ctx):
    """
    Cron job (6h + startup): Sincroniza programas e targets do HackerOne.
    Novos targets são reconhecidos IMEDIATAMENTE após o sync.
    """
    from app.services import hackerone as h1

    if not h1._has_credentials():
        print("[auto_sync] Credenciais HackerOne não configuradas — pulando sync")
        return {"synced": False, "reason": "no_credentials"}

    print("[auto_sync] Iniciando sincronização com HackerOne...")
    redis = ctx.get("redis")

    users = await User.find().to_list()
    total_new_programs = 0
    total_new_targets = 0
    total_recon_queued = 0

    for user in users:
        uid = str(user.id)
        try:
            page = 1
            while True:
                result = await h1.list_programs(page=page, size=25)
                programs_data = result.get("data", [])
                if not programs_data:
                    break

                for prog in programs_data:
                    attrs = prog.get("attributes", {})
                    handle = attrs.get("handle", "")
                    if not handle:
                        continue

                    url  = f"https://hackerone.com/{handle}"
                    name = attrs.get("name") or handle

                    existing = await Program.find_one(Program.user_id == uid, Program.url == url)
                    if existing:
                        if existing.name != name:
                            await existing.set({"name": name, "updated_at": datetime.utcnow()})
                        program = existing
                    else:
                        program = Program(
                            user_id=uid, name=name, platform="hackerone",
                            url=url, status="active", tags=["auto-synced"],
                        )
                        await program.insert()
                        total_new_programs += 1
                        print(f"[auto_sync] Novo programa: {name} (@{handle})")

                    # ── Sincroniza scopes e recon imediato ────────────────
                    try:
                        scopes_resp = await h1.get_structured_scopes(handle)
                        scopes = scopes_resp.get("data", [])

                        for scope in scopes:
                            s_attrs = scope.get("attributes", {})
                            asset_id  = s_attrs.get("asset_identifier", "")
                            asset_type = s_attrs.get("asset_type", "")
                            eligible  = s_attrs.get("eligible_for_bounty", False)
                            eligible_sub = s_attrs.get("eligible_for_submission", True)

                            if not asset_id:
                                continue

                            target_type = "domain"
                            if "*" in asset_id:
                                target_type = "wildcard"
                            elif asset_type in ("CIDR", "IP_ADDRESS"):
                                target_type = "ip_range"

                            is_in_scope = eligible_sub and eligible
                            existing_target = await Target.find_one(
                                Target.program_id == str(program.id),
                                Target.value == asset_id,
                            )

                            if not existing_target:
                                # Target novo → cria e recon imediato
                                target = Target(
                                    user_id=uid,
                                    program_id=str(program.id),
                                    value=asset_id,
                                    type=target_type,
                                    is_in_scope=is_in_scope,
                                    notes=f"auto-synced | bounty:{eligible}",
                                )
                                await target.insert()
                                total_new_targets += 1

                                # Dispara recon imediatamente se for domínio/wildcard in-scope
                                if is_in_scope and redis:
                                    queued = await _enqueue_recon_for_target(redis, target, program)
                                    if queued:
                                        total_recon_queued += 1
                                        print(f"[auto_sync] Recon enfileirado: {asset_id}")
                            else:
                                await existing_target.set({"is_in_scope": is_in_scope})

                    except Exception as scope_err:
                        print(f"[auto_sync] Erro nos scopes de @{handle}: {scope_err}")

                links = result.get("links", {})
                if not links.get("next"):
                    break
                page += 1

            await ev.publish(uid, "h1_sync_done", {
                "new_programs": total_new_programs,
                "new_targets": total_new_targets,
                "recon_queued": total_recon_queued,
            })

        except Exception as e:
            print(f"[auto_sync] Erro ao sincronizar H1 para user {uid}: {e}")

    msg = (
        f"[auto_sync] Sync concluído: {total_new_programs} novos programas, "
        f"{total_new_targets} novos targets, {total_recon_queued} recons enfileirados"
    )
    print(msg)
    return {
        "synced": True,
        "new_programs": total_new_programs,
        "new_targets": total_new_targets,
        "recon_queued": total_recon_queued,
    }


# ── task_auto_pipeline_sweep ───────────────────────────────────────────────

async def task_auto_pipeline_sweep(ctx):
    """
    Cron job (30min): Roda pipeline para todos os findings com status 'accepted'
    que ainda não têm um pipeline ativo ou concluído.
    """
    redis = ctx.get("redis")
    if not redis:
        return {"queued": 0, "reason": "no_redis"}

    accepted_findings = await Finding.find(Finding.status == "accepted").to_list()
    if not accepted_findings:
        print("[pipeline_sweep] Nenhum finding 'accepted' encontrado")
        return {"queued": 0}

    queued = 0
    for finding in accepted_findings:
        fid = str(finding.id)

        # Verifica se já tem pipeline rodando ou concluído para este finding
        existing = await Job.find_one(
            Job.user_id == finding.user_id,
            Job.type == "pipeline",
        )

        # Filtra pelo finding_id no config
        has_active = False
        if existing:
            all_pipeline = await Job.find(
                Job.user_id == finding.user_id,
                Job.type == "pipeline",
            ).to_list()

            for pj in all_pipeline:
                if pj.config.get("finding_id") == fid:
                    if pj.status in ("pending", "running", "completed"):
                        has_active = True
                        break

        if has_active:
            continue

        # Resolve team_handle a partir do programa
        team_handle = None
        if finding.program_id:
            try:
                from bson import ObjectId
                prog = await Program.get(ObjectId(finding.program_id))
                if prog and prog.url:
                    parts = prog.url.rstrip("/").split("/")
                    h = parts[-1] if parts else None
                    if h and "hackerone.com" not in h:
                        team_handle = h
            except Exception:
                pass

        # Cria e enfileira o pipeline job
        job = Job(
            user_id=finding.user_id,
            program_id=finding.program_id or "",
            target_id=None,
            type="pipeline",
            status="pending",
            config={
                "finding_id": fid,
                "team_handle": team_handle or "",
                "auto": True,
            },
            logs=[f"[{datetime.utcnow().strftime('%H:%M:%S')}] Pipeline automático enfileirado"],
        )
        await job.insert()

        arq_job = await redis.enqueue_job("task_auto_pipeline", str(job.id))
        if arq_job:
            job.arq_job_id = arq_job.job_id
            await job.save()

        queued += 1
        print(f"[pipeline_sweep] Pipeline enfileirado para finding: {finding.title[:50]}")

    print(f"[pipeline_sweep] {queued} pipelines enfileirados de {len(accepted_findings)} findings accepted")
    return {"queued": queued, "total_accepted": len(accepted_findings)}
