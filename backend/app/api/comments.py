"""
api/comments.py — Notas/comentários internos em findings
"""
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.models.comment import Comment
from app.models.finding import Finding
from app.models.user import User
from app.dependencies import get_current_user

router = APIRouter(prefix="/findings/{finding_id}/comments", tags=["comments"])


class CommentCreate(BaseModel):
    text: str


class CommentResponse(BaseModel):
    id: str
    finding_id: str
    user_id: str
    text: str
    created_at: str


def _to_response(c: Comment) -> CommentResponse:
    return CommentResponse(
        id=str(c.id),
        finding_id=c.finding_id,
        user_id=c.user_id,
        text=c.text,
        created_at=c.created_at.isoformat(),
    )


async def _get_finding_or_404(finding_id: str, user: User) -> Finding:
    f = await Finding.get(ObjectId(finding_id))
    if not f or f.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Finding não encontrado")
    return f


@router.get("", response_model=list[CommentResponse])
async def list_comments(finding_id: str, user: User = Depends(get_current_user)):
    await _get_finding_or_404(finding_id, user)
    comments = await Comment.find(
        Comment.finding_id == finding_id
    ).sort(+Comment.created_at).to_list()
    return [_to_response(c) for c in comments]


@router.post("", response_model=CommentResponse, status_code=201)
async def add_comment(
    finding_id: str,
    data: CommentCreate,
    user: User = Depends(get_current_user),
):
    await _get_finding_or_404(finding_id, user)
    if not data.text.strip():
        raise HTTPException(status_code=422, detail="Comentário não pode ser vazio")
    comment = Comment(
        finding_id=finding_id,
        user_id=str(user.id),
        text=data.text.strip(),
    )
    await comment.insert()
    return _to_response(comment)


@router.delete("/{comment_id}", status_code=204)
async def delete_comment(
    finding_id: str,
    comment_id: str,
    user: User = Depends(get_current_user),
):
    await _get_finding_or_404(finding_id, user)
    comment = await Comment.get(ObjectId(comment_id))
    if not comment or comment.finding_id != finding_id or comment.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Comentário não encontrado")
    await comment.delete()
