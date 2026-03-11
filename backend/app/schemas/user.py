"""
schemas/user.py — Validação de entrada/saída para usuários

Schemas são modelos Pydantic usados nas rotas da API:
  - Input schemas: validam o que o cliente envia
  - Response schemas: definem o que a API retorna (nunca retorna senha!)
"""
from pydantic import BaseModel, EmailStr, field_validator


class UserRegister(BaseModel):
    """Dados necessários para criar uma conta."""
    email: EmailStr
    username: str
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("A senha deve ter pelo menos 8 caracteres")
        if not any(c.isdigit() for c in v):
            raise ValueError("A senha deve conter pelo menos um número")
        return v

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("O username deve ter pelo menos 3 caracteres")
        return v


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
