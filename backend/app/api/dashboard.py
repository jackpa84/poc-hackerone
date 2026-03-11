"""
api/dashboard.py — Endpoint de dashboard com MongoDB aggregations
"""
import asyncio
from fastapi import APIRouter, Depends
from datetime import datetime
from app.models.finding import Finding
from app.models.job import Job
from app.models.target import Target
from app.models.user import User
from app.dependencies import get_current_user
from app.config import settings
from app.database import redis_client
import json

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

_SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "informational": 4}

async def get_cached_dashboard(uid: str):
    if settings.ENABLE_CACHING:
        cached = await redis_client.get(f"dashboard:{uid}")
        if cached:
            return json.loads(cached)
    return None

async def set_cached_dashboard(uid: str, data: dict):
    if settings.ENABLE_CACHING:
        await redis_client.setex(
            f"dashboard:{uid}",
            300,
            json.dumps(data, default=str)
        )

@router.get("")
async def get_dashboard(user: User = Depends(get_current_user)):
    uid = str(user.id)

    cached_data = await get_cached_dashboard(uid)
    if cached_data:
        return cached_data

    findings_data, jobs_data, targets_data = await asyncio.gather(
        Finding.aggregate([
            {"$match": {"user_id": uid}},
            {"$facet": {
                "totals": [
                    {"$count": "total"}
                ],
                "severity_counts": [
                    {"$group": {"_id": "$severity", "count": {"$sum": 1}}},
                ],
                "status_counts": [
                    {"$group": {"_id": "$status", "count": {"$sum": 1}}},
                ],
                "bounty_earned": [
                    {"$match": {"bounty_amount": {"$gt": 0}}},
                    {"$group": {"_id": None, "total": {"$sum": "$bounty_amount"}}},
                ],
                "priority_findings": [
                    {"$match": {"status": {"$in": ["new", "triaging"]}}},
                    {"$sort": {"created_at": -1}},
                    {"$limit": 10},
                    {"$project": {
                        "id": {"$toString": "$_id"},
                        "title": 1,
                        "severity": 1,
                        "status": 1,
                        "type": 1,
                        "affected_url": 1,
                    }}
                ],
                "ready_to_report": [
                    {"$match": {"status": "accepted"}},
                    {"$sort": {"created_at": -1}},
                    {"$limit": 5},
                    {"$project": {
                        "id": {"$toString": "$_id"},
                        "title": 1,
                        "severity": 1,
                        "affected_url": 1,
                    }}
                ],
            }}
        ]).to_list(),

        Job.find(Job.user_id == uid)
            .sort(-Job.created_at)
            .limit(50)
            .to_list(),

        Target.find(Target.user_id == uid).to_list(),
    )

    findings_facet = findings_data[0] if findings_data else {}

    finding_totals = findings_facet.get("totals", [{}])[0].get("total", 0)

    by_severity = {
        item["_id"]: item["count"]
        for item in findings_facet.get("severity_counts", [])
    }

    by_status = {
        item["_id"]: item["count"]
        for item in findings_facet.get("status_counts", [])
    }

    bounty_earned_data = findings_facet.get("bounty_earned", [])
    bounty_earned = bounty_earned_data[0].get("total", 0.0) if bounty_earned_data else 0.0

    priority_queue = findings_facet.get("priority_findings", [])
    ready_to_report = findings_facet.get("ready_to_report", [])

    recent_jobs = [
        {
            "id":             str(j.id),
            "type":           j.type,
            "status":         j.status,
            "result_summary": j.result_summary,
            "created_at":     j.created_at.isoformat(),
            "finished_at":    j.finished_at.isoformat() if j.finished_at else None,
        }
        for j in jobs_data[:10]
    ]

    active_jobs = sum(1 for j in jobs_data if j.status in ("running", "pending"))

    targets_in_scope = sum(1 for t in targets_data if t.is_in_scope)

    result = {
        "total_findings":    finding_totals,
        "total_targets":     len(targets_data),
        "targets_in_scope":  targets_in_scope,
        "active_jobs":       active_jobs,
        "bounty_earned":     bounty_earned,
        "by_severity":       by_severity,
        "by_status":         by_status,
        "priority_queue":    priority_queue,
        "ready_to_report":   ready_to_report,
        "recent_jobs":       recent_jobs,
    }

    await set_cached_dashboard(uid, result)

    return result
