"""
services/dedup.py — Deduplicação de findings automáticos

Evita que múltiplos jobs criem findings duplicados para a mesma
vulnerabilidade (mesmo título + URL + usuário).

Uso em workers:
    from app.services.dedup import finding_exists_or_create

    finding = await finding_exists_or_create(
        user_id=..., program_id=..., target_id=..., job_id=...,
        title=..., type=..., severity=..., affected_url=...,
        description=..., payload=...,
    )
    if finding is None:
        # duplicata detectada, ignorar
        return
"""
import logging
from typing import Optional
from app.models.finding import Finding

logger = logging.getLogger(__name__)


async def finding_exists_or_create(
    *,
    user_id: str,
    title: str,
    affected_url: str,
    type: str,
    severity: str,
    program_id: Optional[str] = None,
    target_id: Optional[str] = None,
    job_id: Optional[str] = None,
    description: str = "",
    steps_to_reproduce: str = "",
    impact: str = "",
    parameter: Optional[str] = None,
    payload: Optional[str] = None,
) -> Optional[Finding]:
    """
    Cria um finding somente se não existir outro com o mesmo
    content_hash (title + affected_url + user_id).

    Retorna o Finding criado, ou None se for duplicata.
    """
    content_hash = Finding.build_hash(user_id, title, affected_url)

    existing = await Finding.find_one(Finding.content_hash == content_hash)
    if existing:
        logger.info(
            "[dedup] Finding duplicado ignorado: '%s' @ %s (id=%s)",
            title[:60], affected_url[:80], existing.id,
        )
        return None

    finding = Finding(
        user_id=user_id,
        program_id=program_id,
        target_id=target_id,
        job_id=job_id,
        title=title,
        type=type,
        severity=severity,
        affected_url=affected_url,
        description=description,
        steps_to_reproduce=steps_to_reproduce,
        impact=impact,
        parameter=parameter,
        payload=payload,
        content_hash=content_hash,
    )
    await finding.insert()
    logger.info("[dedup] Finding criado: '%s' @ %s", title[:60], affected_url[:80])
    return finding
