"""
dependencies.py — Dependências reutilizáveis para as rotas (FastAPI Depends)

FastAPI Depends() é um sistema de injeção de dependências.
A função get_current_user é injetada em qualquer rota que precise do usuário logado:

  @router.get("/profile")
  async def profile(user: User = Depends(get_current_user)):
      return user
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.services.auth import decode_token, get_user_by_id
from app.models.user import User

bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> User:
    """
    Extrai e valida o JWT do header Authorization.
    Se inválido ou expirado, retorna 401 Unauthorized.
    """
    token = credentials.credentials
    user_id = decode_token(token)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
        )

    user = await get_user_by_id(user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado",
        )

    return user
