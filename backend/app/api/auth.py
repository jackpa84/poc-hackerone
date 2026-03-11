"""
api/auth.py — Rotas de autenticação

POST /auth/register → cria conta
POST /auth/login    → retorna JWT
GET  /auth/me       → retorna usuário logado
"""
from fastapi import APIRouter, HTTPException, status, Depends

from app.models.user import User
from app.schemas.user import UserRegister, UserLogin, UserResponse, TokenResponse
from app.services.auth import hash_password, verify_password, create_token, get_user_by_email
from app.dependencies import get_current_user
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(data: UserRegister):
    # Verifica se email já existe
    if await get_user_by_email(data.email):
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    # Cria usuário com senha hasheada
    user = User(
        email=data.email,
        username=data.username,
        hashed_password=hash_password(data.password),
    )
    await user.insert()

    # Popula automaticamente a conta com programas públicos de bug bounty
    try:
        from arq import create_pool
        from arq.connections import RedisSettings
        redis = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
        await redis.enqueue_job("task_seed_programs", str(user.id))
        await redis.aclose()
    except Exception as e:
        print(f"[auth] Não foi possível enfileirar seed para {user.id}: {e}")

    token = create_token(str(user.id))
    return TokenResponse(
        access_token=token,
        user=UserResponse(id=str(user.id), email=user.email,
                          username=user.username, is_active=user.is_active),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin):
    user = await get_user_by_email(data.email)
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    token = create_token(str(user.id))
    return TokenResponse(
        access_token=token,
        user=UserResponse(id=str(user.id), email=user.email,
                          username=user.username, is_active=user.is_active),
    )


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return UserResponse(id=str(user.id), email=user.email,
                        username=user.username, is_active=user.is_active)
