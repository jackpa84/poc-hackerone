"""
workers/scheduler.py — Agendador automático de scans

Cron job a cada 15 minutos: percorre todos os programas ativos,
encontra targets que não foram reconhecidos recentemente e cria jobs
de recon automaticamente.
"""
from datetime import datetime, timedelta

from app.models.job import Job
from app.models.program import Program
from app.models.target import Target


async def task_auto_scheduler(ctx):
    redis = ctx["redis"]
    now = datetime.utcnow()
    recon_threshold = now - timedelta(hours=24)

    programs = await Program.find(Program.status == "active").to_list()

    enqueued = 0
    skipped = 0

    for program in programs:
        targets = await Target.find(
            Target.program_id == str(program.id),
            Target.is_in_scope == True,
        ).to_list()

        for target in targets:
            if target.last_recon_at and target.last_recon_at > recon_threshold:
                skipped += 1
                continue

            if target.type not in ("domain", "wildcard"):
                skipped += 1
                continue

            domain = target.value.lstrip("*.")
            if not domain or "." not in domain:
                skipped += 1
                continue

            # Evita duplicatas: pula se já existe job pending/running para este target
            existing_job = await Job.find_one(
                Job.target_id == str(target.id),
                Job.type == "recon",
                Job.status.in_(["pending", "running"]),
            )
            if existing_job:
                skipped += 1
                continue

            job = Job(
                user_id=program.user_id,
                program_id=str(program.id),
                target_id=str(target.id),
                type="recon",
                status="pending",
                config={"domain": domain, "auto": True},
                logs=[f"[scheduler] Job automático criado em {now.strftime('%Y-%m-%d %H:%M')} UTC"],
            )
            await job.insert()
            await redis.enqueue_job("task_run_recon", str(job.id))
            enqueued += 1

    print(f"[scheduler] Auto-scan: {enqueued} jobs enfileirados, {skipped} targets ignorados")
    return {"ran_at": now.isoformat(), "jobs_enqueued": enqueued, "targets_skipped": skipped}
