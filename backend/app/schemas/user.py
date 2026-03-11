"""
schemas/user.py — Validação de entrada/saída para usuários

Schemas são modelos Pydantic usados nas rotas da API:
  - Input schemas: validam o que o cliente envia
  - Response schemas: definem o que a API retorna (nunca retorna senha!)
"""
from pydantic import BaseModel, EmailStr


class UserRegister(BaseModel):
    """Dados necessários para criar uma conta."""
    email: EmailStr
    username: str
    password: str


class UserLogin(BaseModel):
    """Dados necessários para fazer login."""
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """O que a API retorna sobre um usuário (sem senha)."""
    id: str
    email: str
    username: str
    is_active: bool


class TokenResponse(BaseModel):
    """Resposta do login: JWT token para usar nas próximas requisições."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
