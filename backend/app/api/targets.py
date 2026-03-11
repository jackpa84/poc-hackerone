"""
api/targets.py — CRUD de alvos (domínios/IPs)
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from bson import ObjectId

from app.models.target import Target
from app.models.user import User
from app.dependencies import get_current_user

router = APIRouter(prefix="/targets", tags=["targets"])


class TargetCreate(BaseModel):
    value: str
    type: str = "domain"
    notes: Optional[str] = None


class TargetUpdate(BaseModel):
    is_in_scope: Optional[bool] = None
    notes: Optional[str] = None


def to_dict(t: Target) -> dict:
    return {
        "id": str(t.id),
        "program_id": t.program_id,
        "value": t.value,
        "type": t.type,
        "is_in_scope": t.is_in_scope,
        "notes": t.notes,
        "last_recon_at": t.last_recon_at.isoformat() if t.last_recon_at else None,
        "created_at": t.created_at.isoformat(),
    }


@router.get("")
async def list_targets(user: User = Depends(get_current_user)):
    targets = await Target.find(Target.user_id == str(user.id)).to_list()
    return [to_dict(t) for t in targets]


@router.post("", status_code=201)
async def create_target(data: TargetCreate, user: User = Depends(get_current_user)):
    target = Target(user_id=str(user.id), **data.model_dump())
    await target.insert()
    return to_dict(target)


@router.patch("/{target_id}")
async def update_target(target_id: str, data: TargetUpdate, user: User = Depends(get_current_user)):
    target = await Target.get(ObjectId(target_id))
    if not target or target.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Alvo não encontrado")
    await target.set(data.model_dump(exclude_none=True))
    return to_dict(target)


@router.delete("/{target_id}", status_code=204)
async def delete_target(target_id: str, user: User = Depends(get_current_user)):
    target = await Target.get(ObjectId(target_id))
    if not target or target.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Alvo não encontrado")
    await target.delete()
