"""
main.py — Ponto de entrada da aplicação FastAPI

Responsabilidades:
  1. Cria a instância do FastAPI
  2. Configura CORS (permite o frontend chamar a API)
  3. Inicializa o MongoDB no startup via lifespan
  4. Registra todas as rotas
  5. Fornece endpoint de healthcheck
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.api.router import router
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Executado uma vez quando a API inicia."""
    await init_db()
    yield


app = FastAPI(
    title="Bug Bounty Platform",
    description="Plataforma de gerenciamento de bug bounty com IA",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — permite que o frontend (localhost:3000) acesse a API (localhost:8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://0.0.0.0:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    """Endpoint usado pelo Docker para verificar se a API está respondendo."""
    return {"status": "ok", "service": "bugbounty-api"}
