"""
workers/seeder.py — Popula novos usuários com programas públicos de bug bounty
"""
from datetime import datetime

from app.models.program import Program
from app.models.target import Target
from app.models.job import Job

CURATED_PROGRAMS = [
    {"name": "Shopify Bug Bounty",  "platform": "hackerone", "url": "https://hackerone.com/shopify",    "max_bounty": 50000, "tags": ["e-commerce", "api", "web"], "targets": [("*.shopify.com", "wildcard"), ("*.myshopify.com", "wildcard"), ("shopify.com", "domain")]},
    {"name": "HackerOne",           "platform": "hackerone", "url": "https://hackerone.com/hackerone",  "max_bounty": 20000, "tags": ["web", "api", "saas"],        "targets": [("*.hackerone.com", "wildcard"), ("hackerone.com", "domain")]},
    {"name": "Coinbase",            "platform": "hackerone", "url": "https://hackerone.com/coinbase",   "max_bounty": 50000, "tags": ["crypto", "web", "api"],       "targets": [("*.coinbase.com", "wildcard"), ("coinbase.com", "domain")]},
    {"name": "GitHub Bug Bounty",   "platform": "hackerone", "url": "https://hackerone.com/github",    "max_bounty": 30000, "tags": ["devtools", "web", "api"],     "targets": [("*.github.com", "wildcard"), ("github.com", "domain")]},
    {"name": "Cloudflare",          "platform": "hackerone", "url": "https://hackerone.com/cloudflare","max_bounty": 3000,  "tags": ["cdn", "dns", "web"],           "targets": [("*.cloudflare.com", "wildcard"), ("cloudflare.com", "domain")]},
    {"name": "Uber",                "platform": "hackerone", "url": "https://hackerone.com/uber",      "max_bounty": 10000, "tags": ["transport", "mobile"],        "targets": [("*.uber.com", "wildcard"), ("uber.com", "domain")]},
    {"name": "Spotify",             "platform": "hackerone", "url": "https://hackerone.com/spotify",   "max_bounty": 2500,  "tags": ["streaming", "web", "api"],    "targets": [("*.spotify.com", "wildcard"), ("spotify.com", "domain")]},
    {"name": "Dropbox",             "platform": "hackerone", "url": "https://hackerone.com/dropbox",   "max_bounty": 32768, "tags": ["storage", "web", "api"],      "targets": [("*.dropbox.com", "wildcard"), ("dropbox.com", "domain")]},
    {"name": "GitLab",              "platform": "hackerone", "url": "https://hackerone.com/gitlab",    "max_bounty": 20000, "tags": ["devtools", "web", "api"],     "targets": [("*.gitlab.com", "wildcard"), ("gitlab.com", "domain")]},
    {"name": "Yahoo",               "platform": "hackerone", "url": "https://hackerone.com/yahoo",     "max_bounty": 15000, "tags": ["web", "email", "api"],        "targets": [("*.yahoo.com", "wildcard"), ("yahoo.com", "domain")]},
    {"name": "Twitter / X",         "platform": "hackerone", "url": "https://hackerone.com/twitter",   "max_bounty": 20160, "tags": ["social", "web", "api"],       "targets": [("*.twitter.com", "wildcard"), ("*.x.com", "wildcard"), ("twitter.com", "domain")]},
    {"name": "Mozilla",             "platform": "hackerone", "url": "https://hackerone.com/mozilla",   "max_bounty": 10000, "tags": ["browser", "web", "api"],      "targets": [("*.mozilla.org", "wildcard"), ("*.mozilla.com", "wildcard")]},
    {"name": "Brave Software",      "platform": "hackerone", "url": "https://hackerone.com/brave",     "max_bounty": 5000,  "tags": ["browser", "crypto"],          "targets": [("*.brave.com", "wildcard"), ("brave.com", "domain")]},
]


async def task_seed_programs(ctx, user_id: str):
    """Popula conta do usuário com programas públicos e enfileira recon."""
    existing = await Program.find(Program.user_id == user_id).count()
    if existing > 0:
        print(f"[seeder] Usuário {user_id} já tem {existing} programas. Pulando.")
        return {"seeded": False, "reason": "already_has_programs"}

    redis = ctx.get("redis")
    seeded_programs = 0
    seeded_targets = 0
    queued_jobs = 0

    for prog_data in CURATED_PROGRAMS:
        program = Program(
            user_id=user_id,
            status="active",
            name=prog_data["name"],
            platform=prog_data["platform"],
            url=prog_data.get("url"),
            max_bounty=prog_data.get("max_bounty"),
            tags=prog_data.get("tags", []),
        )
        await program.insert()
        seeded_programs += 1

        for target_value, target_type in prog_data["targets"]:
            target = Target(
                user_id=user_id,
                program_id=str(program.id),
                value=target_value,
                type=target_type,
                is_in_scope=True,
            )
            await target.insert()
            seeded_targets += 1

            if target_type in ("domain", "wildcard") and redis:
                job = Job(
                    user_id=user_id,
                    program_id=str(program.id),
                    target_id=str(target.id),
                    type="recon",
                    config={"seeded": True},
                )
                await job.insert()
                arq_job = await redis.enqueue_job("task_run_recon", str(job.id))
                if arq_job:
                    job.arq_job_id = arq_job.job_id
                    await job.save()
                queued_jobs += 1

    print(f"[seeder] {seeded_programs} programas, {seeded_targets} targets, {queued_jobs} jobs enfileirados.")
    return {"seeded": True, "programs": seeded_programs, "targets": seeded_targets, "jobs_queued": queued_jobs}
