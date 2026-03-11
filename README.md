# BugBounty AI Platform

Plataforma self-hosted completa para bug bounty hunters, centralizando reconhecimento automatizado, rastreamento de vulnerabilidades, geração de relatórios com IA e submissão direta ao HackerOne — tudo em um único ambiente.

---

## Sumário

- [Visão Geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Funcionalidades](#funcionalidades)
- [Tech Stack](#tech-stack)
- [Infraestrutura e Docker](#infraestrutura-e-docker)
- [Configuração](#configuração)
- [API Reference](#api-reference)
- [Autenticação e Autorização](#autenticação-e-autorização)
- [Banco de Dados](#banco-de-dados)
- [Worker e Tarefas em Background](#worker-e-tarefas-em-background)
- [Interface Web (Frontend)](#interface-web-frontend)
- [Ferramentas de Segurança](#ferramentas-de-segurança)
- [Comandos Úteis (Makefile)](#comandos-úteis-makefile)

---

## Visão Geral

O **BugBounty AI Platform** é uma aplicação web multi-serviço projetada para pesquisadores de segurança que participam de programas de bug bounty. Ele oferece um fluxo de trabalho completo:

1. **Gerenciar programas e alvos** (importando diretamente da HackerOne)
2. **Executar reconhecimento automatizado** com ferramentas de segurança líderes do mercado
3. **Rastrear vulnerabilidades encontradas** com campos detalhados e pontuação CVSS
4. **Gerar relatórios profissionais com IA** (Claude da Anthropic)
5. **Avaliar a prontidão** do relatório com um checklist de 9 critérios
6. **Submeter relatórios diretamente ao HackerOne** via API
7. **Monitorar logs em tempo real** de todos os containers Docker

---

## Arquitetura

O sistema segue uma arquitetura de 4 camadas:

```
┌──────────────┐    ┌──────────────┐    ┌────────────┐    ┌──────────────┐
│  Frontend    │    │  Backend API │    │  MongoDB   │    │  Redis       │
│  (Next.js)   │───▶│  (FastAPI)   │───▶│  (banco    │    │  (fila de   │
│  :3000       │    │  :8000       │    │   primário)│    │   tarefas)   │
└──────────────┘    └──────────────┘    └────────────┘    └──────────────┘
                            │                                      ▲
                            ▼                                      │
                    ┌──────────────┐                               │
                    │  ARQ Worker  │───────────────────────────────┘
                    │  (background │
                    │   tasks)     │
                    └──────────────┘
```

### Serviços Docker

| Serviço         | Imagem/Fonte          | Porta | Função                          |
|-----------------|-----------------------|-------|---------------------------------|
| `mongodb`       | `mongo:7`             | 27017 | Banco de dados principal        |
| `redis`         | `redis:7-alpine`      | 6379  | Fila de tarefas e cache         |
| `backend`       | `./backend`           | 8000  | API REST (FastAPI)              |
| `worker`        | `./backend`           | —     | Worker ARQ (tarefas em BG)      |
| `frontend`      | `./frontend`          | 3000  | Interface web (Next.js)         |
| `mongo-express` | `mongo-express:latest`| 8081  | Painel admin do MongoDB         |

---

## Funcionalidades

### Gerenciamento de Programas

- Criar, editar e excluir programas de bug bounty
- **Importar programas via URL do HackerOne** — extrai automaticamente nome, escopo, plataforma e bounty máximo
- Controle de status: `active`, `paused`, `closed`
- Tags e notas de escopo por programa

### Gerenciamento de Alvos

- Cadastro de domínios, wildcards (`*.exemplo.com`) e ranges de IP
- Indicação de quais alvos estão dentro do escopo
- Registro do timestamp da última execução de reconhecimento

### Rastreamento de Vulnerabilidades (Findings)

- CRUD completo de vulnerabilidades com campos ricos:
  - Severidade: `critical`, `high`, `medium`, `low`, `informational`
  - Tipos: IDOR, XSS, SQLi, SSRF, LFI, Open Redirect, Info Disclosure, Outros
  - Status: `new` → `triaging` → `accepted` → `resolved` / `duplicate` / `not_applicable`
  - Pontuação CVSS (0.0–10.0)
  - URL afetada, parâmetro vulnerável, payload, passos para reprodução, impacto
  - Valor de bounty recebido

### Pipeline de Submissão

- Visualização estilo **kanban** organizando findings por estágio
- **Readiness Score** (0–100): avalia 9 critérios automaticamente antes da submissão:
  - Título suficientemente descritivo
  - URL afetada preenchida
  - Qualidade da descrição
  - Passos para reprodução detalhados
  - Campo de impacto preenchido
  - Payload presente
  - Justificativa de severidade
  - Pontuação CVSS
  - Relatório AI gerado
- Dicas acionáveis de melhoria para cada critério pendente

### IA — Geração de Relatórios com Claude

- Gera relatórios profissionais em **Markdown** para qualquer finding
- Utiliza o modelo `claude-sonnet-4-6` (Anthropic)
- Relatório inclui: resumo executivo, justificativa de severidade, passos de reprodução numerados, análise de impacto e recomendações de correção
- Geração **assíncrona** pelo worker; frontend faz polling até o relatório estar pronto
- Rastreia uso de tokens (prompt + completion) por relatório
- Suporta **regeneração** de relatórios (versionado)

### Reconhecimento Automatizado

Sete tipos de job executados pelo ARQ worker com logs em tempo real:

| Job              | Ferramentas            | O que faz                                                                 |
|------------------|------------------------|---------------------------------------------------------------------------|
| `recon`          | subfinder, httpx, gau  | Enumeração de subdomínios → probing de hosts ativos → URLs históricas     |
| `dir_fuzz`       | httpx                  | Fuzzing de diretórios com wordlist                                        |
| `param_fuzz`     | httpx                  | Fuzzing de parâmetros com template FUZZ                                   |
| `sub_fuzz`       | httpx                  | Fuzzing de subdomínios; cria novos Targets para resultados ativos         |
| `idor`           | httpx                  | Teste de IDOR por enumeração de IDs com comparação de baseline            |
| `port_scan`      | naabu                  | Scan de portas; cria findings para portas sensíveis abertas               |
| `dns_recon`      | dnsx                   | Enumeração DNS + detecção de misconfigurações SPF/DMARC + brute-force     |

Todos os jobs criam **Findings automaticamente** para resultados relevantes (caminhos sensíveis, erros 500, candidatos a IDOR, portas abertas, misconfigurações DNS).

### Auto-Scheduler

- Um cron job ARQ executa a cada **15 minutos**, enfileirando jobs `recon` para todos os alvos de programas ativos que não foram escaneados nos últimos 15 minutos
- Também ativado automaticamente na inicialização do backend

### Onboarding Automático

- Ao registrar um novo usuário, **13 programas públicos do HackerOne** são adicionados automaticamente à conta:
  - Shopify, HackerOne, Coinbase, GitHub, Cloudflare, Uber, Spotify, Dropbox, GitLab, Yahoo, Twitter/X, Mozilla, Brave
- Cada programa já vem com alvos e jobs de recon enfileirados

### Integração com HackerOne API

Integração completa com a [HackerOne Hacker API v1](https://api.hackerone.com/):

- Listar e pesquisar programas disponíveis (paginado)
- Ver escopos estruturados de programas
- **Sincronizar** programas do H1 para o banco local (importa programa + targets)
- Navegar pelo **Hacktivity** (relatórios públicos divulgados)
- Ver seus próprios relatórios submetidos com status
- Ver histórico de ganhos
- **Submeter relatórios diretamente ao HackerOne** via API (título, descrição, impacto, severidade, weakness, escopo)
- **Audit log** completo de cada chamada à API do H1 (ação, status, tempo de resposta, erros)

### Visualizador de Logs Docker

- Streaming em tempo real de logs de todos os 6 containers via Docker socket API
- Detecção de nível de log (error / warn / info / debug)
- Exibido na página `/logs` da UI

---

## Tech Stack

### Backend

| Tecnologia       | Versão   | Finalidade                        |
|------------------|----------|-----------------------------------|
| Python           | 3.12     | Linguagem                         |
| FastAPI          | 0.115.0  | Framework REST API                |
| Uvicorn          | 0.30.6   | Servidor ASGI                     |
| Beanie           | 1.26.0   | ODM MongoDB (async, Pydantic)     |
| Motor            | 3.3.2    | Driver MongoDB async              |
| Pydantic-settings| 2.4.0    | Config via `.env`                 |
| python-jose      | 3.3.0    | Criação/verificação de JWT        |
| passlib + bcrypt | 1.7.4    | Hash de senhas                    |
| arq              | 0.26.1   | Fila de tarefas Redis async       |
| httpx            | 0.27.2   | Cliente HTTP async                |
| anthropic        | 0.34.2   | SDK Claude AI                     |
| aiodocker        | 0.23.0   | Client Docker socket async        |

### Frontend

| Tecnologia       | Versão   | Finalidade                        |
|------------------|----------|-----------------------------------|
| Next.js          | 14.2.5   | Framework React (App Router)      |
| React            | 18       | Biblioteca UI                     |
| TypeScript       | 5        | Tipagem estática                  |
| Tailwind CSS     | 3.4.1    | Estilização utilitária            |
| Axios            | 1.7.3    | Cliente HTTP                      |
| SWR              | 2.2.5    | Fetching/cache de dados           |
| Recharts         | 2.12.7   | Gráficos (pie, bar)               |
| react-markdown   | 9.0.1    | Renderização de Markdown          |
| Radix UI         | Vários   | Primitivos UI headless            |
| lucide-react     | 0.427.0  | Ícones                            |
| next-themes      | 0.3.0    | Suporte a modo escuro             |

---

## Infraestrutura e Docker

### Volumes

| Volume                   | Finalidade                          |
|--------------------------|-------------------------------------|
| `mongo_data`             | Persistência do MongoDB             |
| `redis_data`             | Persistência AOF do Redis           |
| `nuclei_templates`       | Cache de templates do Nuclei        |
| `frontend_next_cache`    | Cache de build do Next.js           |
| `frontend_node_modules`  | node_modules (desempenho no macOS)  |

### Limites de Recursos

| Serviço       | RAM Máx. |
|---------------|----------|
| backend       | 256 MB   |
| worker        | 512 MB   |
| frontend      | 768 MB   |
| mongodb       | 512 MB   |
| redis         | 96 MB    |
| mongo-express | 128 MB   |

O backend monta `/var/run/docker.sock` (read-only) para que o visualizador de logs acesse o Docker diretamente.

---

## Configuração

Copie o arquivo `.env` e preencha as variáveis:

```bash
cp .env.example .env
```

| Variável               | Padrão (dev)                        | Obrigatório       | Finalidade                     |
|------------------------|-------------------------------------|-------------------|--------------------------------|
| `MONGO_PASSWORD`       | `changeme`                          | Sim               | Senha root do MongoDB          |
| `REDIS_URL`            | `redis://redis:6379`                | Sim               | Conexão com Redis              |
| `JWT_SECRET`           | `dev-secret-change-in-production`   | **Sim** (32+ chars)| Chave de assinatura JWT        |
| `JWT_ALGORITHM`        | `HS256`                             | Não               | Algoritmo JWT                  |
| `JWT_EXPIRY_HOURS`     | `24`                                | Não               | Expiração do token (horas)     |
| `ANTHROPIC_API_KEY`    | —                                   | Sim (para IA)     | Chave da API Claude            |
| `HACKERONE_API_USERNAME`| —                                  | Sim (para H1)     | Identificador API HackerOne    |
| `HACKERONE_API_TOKEN`  | —                                   | Sim (para H1)     | Token API HackerOne            |
| `NEXT_PUBLIC_API_URL`  | `http://localhost:8000/api`         | Sim               | URL base da API para o frontend|
| `NEXT_TELEMETRY_DISABLED`| `1`                               | Não               | Desativa telemetria do Next.js |

---

## API Reference

Todas as rotas são prefixadas com `/api`. Documentação Swagger disponível em `http://localhost:8000/docs`.

### Auth (`/api/auth`)

| Método | Rota             | Descrição                                     |
|--------|------------------|-----------------------------------------------|
| `POST` | `/auth/register` | Registrar usuário, semeia programas, retorna JWT |
| `POST` | `/auth/login`    | Login, retorna JWT                            |
| `GET`  | `/auth/me`       | Dados do usuário autenticado                  |

### Dashboard (`/api/dashboard`)

| Método | Rota          | Descrição                                               |
|--------|---------------|---------------------------------------------------------|
| `GET`  | `/dashboard`  | Estatísticas agregadas: findings, programas, jobs, bounty, gráficos |

### Programas (`/api/programs`)

| Método   | Rota                      | Descrição                              |
|----------|---------------------------|----------------------------------------|
| `GET`    | `/programs`               | Listar programas do usuário            |
| `POST`   | `/programs`               | Criar programa                         |
| `POST`   | `/programs/import-url`    | Importar programa via URL do H1        |
| `GET`    | `/programs/{id}`          | Obter programa                         |
| `PATCH`  | `/programs/{id}`          | Atualizar programa                     |
| `DELETE` | `/programs/{id}`          | Excluir programa                       |

### Alvos (`/api/targets`)

| Método   | Rota             | Descrição              |
|----------|------------------|------------------------|
| `GET`    | `/targets`       | Listar targets         |
| `POST`   | `/targets`       | Criar target           |
| `GET`    | `/targets/{id}`  | Obter target           |
| `PATCH`  | `/targets/{id}`  | Atualizar target       |
| `DELETE` | `/targets/{id}`  | Excluir target         |

### Jobs (`/api/jobs`)

| Método | Rota                       | Descrição                            |
|--------|----------------------------|--------------------------------------|
| `GET`  | `/jobs`                    | Listar jobs (filtros: program, status)|
| `POST` | `/jobs`                    | Criar e enfileirar job               |
| `POST` | `/jobs/scanner/trigger`    | Acionar auto-scheduler manualmente   |
| `GET`  | `/jobs/{id}`               | Obter job com logs                   |
| `POST` | `/jobs/{id}/cancel`        | Cancelar job pendente/em execução    |

### Findings (`/api/findings`)

| Método   | Rota                       | Descrição                                        |
|----------|----------------------------|--------------------------------------------------|
| `GET`    | `/findings`                | Listar findings (filtros: program, severity, status, type) |
| `GET`    | `/findings/stats`          | Contagens por severidade e status                |
| `POST`   | `/findings`                | Criar finding                                    |
| `GET`    | `/findings/{id}`           | Obter finding                                    |
| `PATCH`  | `/findings/{id}`           | Atualizar finding                                |
| `DELETE` | `/findings/{id}`           | Excluir finding                                  |
| `GET`    | `/findings/{id}/readiness` | Readiness Score (0–100) + checklist              |

### Relatórios IA (`/api/reports`)

| Método | Rota           | Descrição                                   |
|--------|----------------|---------------------------------------------|
| `GET`  | `/reports`     | Listar relatórios gerados                   |
| `POST` | `/reports`     | Disparar geração de relatório AI para finding |
| `GET`  | `/reports/{id}`| Obter relatório (`content_markdown`, `is_ready`) |

### Logs Docker (`/api/logs`)

| Método | Rota                      | Descrição                               |
|--------|---------------------------|-----------------------------------------|
| `GET`  | `/logs/services`          | Listar containers com status            |
| `GET`  | `/logs/services/{key}`    | Obter últimas N linhas de logs de um container |

### HackerOne (`/api/hackerone`)

| Método | Rota                              | Descrição                                    |
|--------|-----------------------------------|----------------------------------------------|
| `GET`  | `/hackerone/status`               | Verificar se credenciais H1 estão configuradas |
| `GET`  | `/hackerone/programs`             | Listar programas H1 (paginado)               |
| `GET`  | `/hackerone/programs/{handle}`    | Detalhes de um programa H1                   |
| `GET`  | `/hackerone/programs/{handle}/scopes` | Escopos estruturados                     |
| `POST` | `/hackerone/programs/{handle}/sync` | Sincronizar programa H1 para banco local   |
| `GET`  | `/hackerone/hacktivity`           | Relatórios públicos divulgados               |
| `GET`  | `/hackerone/reports`              | Seus relatórios no H1                        |
| `GET`  | `/hackerone/reports/{id}`         | Relatório específico no H1                   |
| `POST` | `/hackerone/reports/submit`       | Submeter relatório ao H1 via API             |
| `GET`  | `/hackerone/earnings`             | Histórico de ganhos                          |
| `GET`  | `/hackerone/logs`                 | Audit log de chamadas à API H1               |
| `GET`  | `/hackerone/logs/stats`           | Estatísticas das chamadas H1                 |

### Health

| Método | Rota      | Descrição              |
|--------|-----------|------------------------|
| `GET`  | `/health` | Health check do Docker |

---

## Autenticação e Autorização

- **Método:** JWT (JSON Web Tokens), algoritmo HS256
- **Fluxo:** Login/registro → recebe Bearer token → armazenado no `localStorage` → anexado a toda requisição via interceptor Axios
- **Expiração:** 24 horas (configurável via `JWT_EXPIRY_HOURS`)
- **Backend:** Esquema `HTTPBearer` + dependência `get_current_user` injetada em todas as rotas protegidas
- **Hash de senha:** bcrypt via passlib
- **Autorização:** Todos os dados são **escopados por usuário** — cada modelo (`Program`, `Target`, `Finding`, `Job`, `Report`, `HackerOneLog`) armazena um `user_id` e toda query filtra pelo ID do usuário autenticado. Não há compartilhamento de dados entre usuários.
- **Tratamento de 401:** O interceptor do frontend limpa o `localStorage` e redireciona para `/login` automaticamente em qualquer resposta 401

---

## Banco de Dados

MongoDB com Beanie (ODM async baseado em Pydantic). Coleções principais:

### `users`
Usuários da plataforma com email, username e senha hasheada.

### `programs`
Programas de bug bounty com nome, plataforma, URL, status, escopo, bounty máximo e tags.

### `targets`
Alvos por programa: domínios, wildcards, IPs. Inclui timestamp do último reconhecimento.

### `findings`
Vulnerabilidades com severidade, tipo, CVSS, status do fluxo, URL afetada, payload, evidências e bounty recebido. Pode ser criado manualmente ou automaticamente por jobs.

### `jobs`
Jobs de reconhecimento com tipo, status, configuração, logs em tempo real (lista de strings atualizada pelo worker) e resumo de resultados.

### `reports`
Relatórios gerados por IA com conteúdo Markdown, modelo usado, tokens consumidos e versão.

### `hackerone_logs`
Audit log de todas as chamadas à API do HackerOne: ação, status, tempo de resposta, metadados e erros.

---

## Worker e Tarefas em Background

O ARQ worker é um **processo separado** da API, ambos usando a mesma imagem Docker. Fluxo de comunicação:

1. API recebe requisição (ex: criar job, registrar usuário)
2. API cria documento no MongoDB com status `pending`
3. API enfileira a tarefa no Redis via ARQ
4. Worker pega a tarefa da fila
5. Worker executa ferramentas de segurança via `asyncio.create_subprocess_exec`
6. Worker faz streaming de output para `job.logs` no MongoDB (salvo a cada 10 linhas)
7. Frontend faz polling em `GET /jobs/{id}` para exibir logs ao vivo
8. Worker define status final (`completed` / `failed`) e `result_summary`

**Concorrência:** 10 jobs paralelos, timeout máximo de 1 hora por job.

**Cron:** `task_auto_scheduler` executa a cada 15 minutos.

---

## Interface Web (Frontend)

Sidebar persistente com navegação para todas as seções:

| Rota             | Página              | Descrição                                                           |
|------------------|---------------------|---------------------------------------------------------------------|
| `/login`         | Login               | Formulário de autenticação JWT                                      |
| `/register`      | Registro            | Criação de conta                                                    |
| `/`              | Dashboard           | Métricas, gráficos, fila de prioridade, top programas, jobs recentes|
| `/programs`      | Programas           | Listagem de todos os programas                                      |
| `/programs/[id]` | Detalhe do Programa | Alvos, findings e jobs do programa                                  |
| `/jobs`          | Jobs                | Fila de jobs com status                                             |
| `/jobs/[id]`     | Detalhe do Job      | Terminal de logs ao vivo                                            |
| `/findings`      | Findings            | Todas as vulnerabilidades com filtros                               |
| `/findings/new`  | Novo Finding        | Formulário de criação manual                                        |
| `/findings/[id]` | Detalhe do Finding  | Detalhes completos + geração de relatório AI                        |
| `/pipeline`      | Pipeline            | Visualização kanban do fluxo de submissão com readiness scores      |
| `/hackerone`     | HackerOne           | Integração completa H1 (Programas, Hacktivity, Relatórios, Ganhos, Submissão, Logs) |
| `/logs`          | Logs                | Status dos containers + visualizador de logs em tempo real          |
| `/report-guide`  | Guia de Relatório   | Documentação interna sobre como escrever bons relatórios            |

---

## Ferramentas de Segurança

Instaladas no container Docker do backend/worker:

| Ferramenta    | Fonte            | Finalidade                                    |
|---------------|------------------|-----------------------------------------------|
| subfinder     | ProjectDiscovery | Enumeração de subdomínios                     |
| httpx         | ProjectDiscovery | Probing HTTP                                  |
| gau           | lc               | Coleta de URLs históricas (Wayback + CommonCrawl) |
| nuclei        | ProjectDiscovery | Scanner de vulnerabilidades (templates)       |
| naabu         | ProjectDiscovery | Scanner de portas                             |
| dnsx          | ProjectDiscovery | Ferramenta DNS multi-propósito                |
| katana        | ProjectDiscovery | Web crawler                                   |
| nmap          | apt              | Scanner de rede                               |

---

## Comandos Úteis (Makefile)

```bash
make setup        # Cria o arquivo .env
make build        # Builda as imagens Docker
make up           # Inicia todos os serviços
make down         # Para todos os serviços
make clean        # Para e remove volumes (apaga dados)
make scan-now     # Aciona o auto-scheduler manualmente
make logs-api     # Logs do backend em tempo real
make logs-worker  # Logs do worker em tempo real
make logs-frontend# Logs do frontend em tempo real
make shell-backend# Abre shell no container do backend
make shell-worker # Abre shell no container do worker
make redeploy     # Rebuild e restart completo
make tools-check  # Verifica instalação das ferramentas de segurança
```

---

## Acesso após iniciar

| Serviço          | URL                        |
|------------------|----------------------------|
| Frontend         | http://localhost:3000      |
| API (Swagger)    | http://localhost:8000/docs |
| MongoDB Admin    | http://localhost:8081      |
