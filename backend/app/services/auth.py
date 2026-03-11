"""
services/auth.py — Lógica de autenticação

Responsabilidades:
  1. Hash de senhas com bcrypt (nunca salvar senha em texto puro)
  2. Verificação de senha no login
  3. Criação de JWT (token de acesso)
  4. Decodificação de JWT (para autenticar requests)

JWT (JSON Web Token) funciona assim:
  - No login, geramos um token assinado com JWT_SECRET
  - O cliente envia esse token em cada request no header: Authorization: Bearer <token>
  - A API valida a assinatura e extrai o user_id sem precisar consultar o banco
"""
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import jwt, JWTError

from app.config import settings
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Converte senha em texto para hash bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Compara senha digitada com hash salvo no banco."""
    return pwd_context.verify(plain, hashed)


def create_token(user_id: str) -> str:
    """
    Cria um JWT com o user_id como payload.
    O token expira após JWT_EXPIRY_HOURS horas.
    """
    expire = datetime.utcnow() + timedelta(hours=settings.JWT_EXPIRY_HOURS)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> str | None:
    """
    Decodifica um JWT e retorna o user_id.
    Retorna None se o token for inválido ou expirado.
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


async def get_user_by_email(email: str) -> User | None:
    return await User.find_one(User.email == email)


async def get_user_by_id(user_id: str) -> User | None:
    from bson import ObjectId
    return await User.get(ObjectId(user_id))
