'use client'

import {
  Globe, Bug, FileText, Shield, Zap, Database, Server, Cpu,
  ChevronRight, ArrowDown, Bot, Radio, Boxes, Clock,
  CheckCircle2, XCircle, AlertTriangle, Play, RefreshCw,
  Network, Key, Terminal, Layers, GitBranch, Workflow,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── tiny helpers ──────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: '#3f3f46' }}>
      {children}
    </p>
  )
}

function Pill({ text, color = 'zinc' }: { text: string; color?: string }) {
  const c: Record<string, string> = {
    zinc:    'bg-zinc-800 text-zinc-400 border-zinc-700',
    blue:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    orange:  'bg-orange-500/10 text-orange-400 border-orange-500/20',
    violet:  'bg-violet-500/10 text-violet-400 border-violet-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    yellow:  'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    red:     'bg-red-500/10 text-red-400 border-red-500/20',
    cyan:    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  }
  return (
    <span className={cn('px-2 py-0.5 rounded-md border text-[10px] font-mono font-medium', c[color] ?? c.zinc)}>
      {text}
    </span>
  )
}

function ArrowV() {
  return (
    <div className="flex justify-center my-3">
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-px h-5 bg-zinc-700" />
        <ArrowDown size={12} className="text-zinc-700 -mt-1" />
      </div>
    </div>
  )
}

function ArrowH() {
  return (
    <div className="flex items-center self-center shrink-0 px-1">
      <div className="w-6 h-px bg-zinc-700" />
      <ChevronRight size={12} className="text-zinc-700 -ml-1" />
    </div>
  )
}

function Connector({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center my-2 gap-1">
      <div className="w-px h-4 bg-gradient-to-b from-zinc-700 to-zinc-600" />
      {label && (
        <span className="text-[9px] font-mono text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
          {label}
        </span>
      )}
      <div className="w-px h-4 bg-gradient-to-b from-zinc-600 to-zinc-700" />
      <ArrowDown size={10} className="text-zinc-700 -mt-1" />
    </div>
  )
}

// ── Step card for pipeline ────────────────────────────────────────────────────

interface StepProps {
  num: number
  title: string
  trigger?: string
  icon: React.ReactNode
  accentColor: string
  borderColor: string
  bgColor: string
  description: string
  details: string[]
  output: string
  tools?: string[]
}

function Step({ num, title, trigger, icon, accentColor, borderColor, bgColor, description, details, output, tools }: StepProps) {
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor, background: '#09090f' }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: bgColor }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
          style={{ background: accentColor + '22', border: `1px solid ${accentColor}44`, color: accentColor }}>
          {num}
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: accentColor }}>{icon}</span>
          <span className="font-bold text-zinc-100">{title}</span>
        </div>
        {trigger && (
          <span className="ml-auto text-[10px] font-mono px-2 py-1 rounded-lg border"
            style={{ background: accentColor + '11', borderColor: accentColor + '33', color: accentColor }}>
            {trigger}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        <p className="text-sm text-zinc-300 leading-relaxed">{description}</p>

        <div className="space-y-1.5">
          {details.map((d, i) => (
            <div key={i} className="flex items-start gap-2">
              <CheckCircle2 size={11} className="mt-0.5 shrink-0" style={{ color: accentColor }} />
              <p className="text-[12px] text-zinc-500 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>

        {tools && tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tools.map(t => (
              <span key={t} className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-500">
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">Saída</span>
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-[11px] font-medium" style={{ color: accentColor }}>→ {output}</span>
        </div>
      </div>
    </div>
  )
}

// ── Layer box ─────────────────────────────────────────────────────────────────

function LayerBox({
  icon, title, subtitle, color, items, wide,
}: {
  icon: React.ReactNode; title: string; subtitle: string
  color: string; items: { label: string; detail?: string }[]; wide?: boolean
}) {
  return (
    <div className={cn('rounded-xl border p-4 space-y-3', wide && 'col-span-2')}
      style={{ borderColor: color + '30', background: color + '08' }}>
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg" style={{ background: color + '20' }}>
          <span style={{ color }}>{icon}</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100">{title}</p>
          <p className="text-[10px]" style={{ color: color + 'aa' }}>{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((item, i) => (
          <div key={i} className="rounded-lg px-2.5 py-1.5 border"
            style={{ borderColor: color + '20', background: color + '06' }}>
            <p className="text-[11px] font-medium text-zinc-300">{item.label}</p>
            {item.detail && <p className="text-[9px] mt-0.5" style={{ color: color + '99' }}>{item.detail}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Decision node ─────────────────────────────────────────────────────────────

function DecisionNode({ question }: { question: string }) {
  return (
    <div className="flex justify-center my-2">
      <div className="px-4 py-2 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-center">
        <AlertTriangle size={11} className="text-yellow-500 mx-auto mb-1" />
        <p className="text-[10px] font-semibold text-yellow-400">{question}</p>
      </div>
    </div>
  )
}

// ── main ─────────────────────────────────────────────────────────────────────

export default function ArchitecturePage() {
  return (
    <div className="space-y-12 pb-16">

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl" style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)' }}>
            <Workflow size={20} className="text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Arquitetura & Fluxo</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Como a plataforma funciona — do sync H1 até a submissão automática
            </p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex gap-3 flex-wrap">
          {[
            { n: '6',  label: 'estágios',     color: '#f97316' },
            { n: '14', label: 'workers',       color: '#10b981' },
            { n: '2',  label: 'modelos IA',    color: '#8b5cf6' },
            { n: '8',  label: 'modelos DB',    color: '#06b6d4' },
            { n: '4',  label: 'réplicas',      color: '#eab308' },
          ].map(s => (
            <div key={s.label} className="text-center px-4 py-2.5 rounded-xl border"
              style={{ borderColor: s.color + '25', background: s.color + '08' }}>
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.n}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 1: PIPELINE COMPLETO ────────────────────────────────────── */}
      <section>
        <Label>Pipeline Automatizado — Fluxo Completo</Label>
        <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
          O ciclo completo é totalmente automático: desde a descoberta de novos alvos no HackerOne
          até a submissão do relatório de vulnerabilidade. Nenhuma ação manual é necessária se as
          credenciais estiverem configuradas.
        </p>

        <div className="space-y-3">

          <Step
            num={1}
            title="H1 Sync — Sincronização com HackerOne"
            trigger="cron: 0, 6, 12, 18h + startup"
            icon={<Globe size={16} />}
            accentColor="#3b82f6"
            borderColor="#3b82f620"
            bgColor="#3b82f608"
            description="O cron job task_auto_h1_sync é disparado 4 vezes por dia e imediatamente ao subir o worker. Ele se autentica na API REST do HackerOne (Basic Auth com username+token) e faz uma varredura paginada de todos os programas e seus scopes."
            details={[
              'Busca todos os programas via GET /v1/hackers/programs com paginação (25/página)',
              'Para cada programa, busca os structured_scopes (domínios, wildcards, IPs)',
              'Cria Program e Target no MongoDB para cada escopo novo encontrado',
              'Targets novos in-scope (eligible_for_bounty=true) disparam recon IMEDIATAMENTE — sem esperar o cron',
              'Targets existentes têm apenas o campo is_in_scope atualizado',
              'Publica evento SSE h1_sync_done para o frontend em tempo real',
            ]}
            output="Programs + Targets no MongoDB → recon enfileirado no Redis"
            tools={['httpx (HackerOne API)', 'MongoDB (upsert)', 'Redis (enqueue)']}
          />

          <Connector label="novos targets → Redis queue" />

          <Step
            num={2}
            title="Recon — Descoberta de Superfície de Ataque"
            trigger="cron: cada 1h (min=0) + imediato pós-sync"
            icon={<Zap size={16} />}
            accentColor="#eab308"
            borderColor="#eab30820"
            bgColor="#eab30808"
            description="O task_auto_scheduler verifica targets sem scan recente (threshold 24h) e enfileira jobs de recon. O task_run_recon executa uma pipeline de ferramentas em sequência para mapear toda a superfície de ataque do domínio."
            details={[
              'subfinder: enumera subdomínios via múltiplas fontes passivas (certsh, dnsdumpster, etc)',
              'httpx: proba subdomínios descobertos, filtra os ativos, detecta tecnologias e títulos',
              'katana: crawla as URLs ativas coletando endpoints e parâmetros',
              'gau: busca URLs históricas no Wayback Machine e Common Crawl',
              'nuclei: roda templates de detecção de CVEs, misconfigs e exposições',
              'Resultados salvos em Job.result_summary; findings criados automaticamente com deduplicação',
            ]}
            output="Findings no MongoDB (deduplicados por sha256)"
            tools={['subfinder', 'httpx', 'katana', 'gau', 'nuclei', 'naabu', 'dnsx', 'dalfox', 'sqlmap', 'ffuf']}
          />

          <Connector label="findings criados → status: new" />

          <Step
            num={3}
            title="Finding — Captura e Deduplicação"
            trigger="automático após cada scanner"
            icon={<Bug size={16} />}
            accentColor="#ef4444"
            borderColor="#ef444420"
            bgColor="#ef444408"
            description="Cada scanner (port_scan, dns_recon, xss_scan, etc.) cria findings no banco de forma segura usando o serviço de deduplicação. O sistema evita duplicatas calculando um hash do conteúdo antes de inserir."
            details={[
              'content_hash = sha256(user_id + title + affected_url) — hash único por vulnerabilidade',
              'finding_exists_or_create() checa o hash antes de inserir — sem duplicatas mesmo com paralelismo',
              'Campos: title, type, severity, status (new), cvss_score, description, steps_to_reproduce, impact',
              'O Pipeline Sweep (cron 30min) verifica findings com status accepted prontos para IA',
              'Status flow: new → triaging → accepted → pipeline → submitted / resolved',
              'Índice composto em content_hash garante unicidade no banco',
            ]}
            output="Finding persistido → aguardando triage → accepted"
            tools={['services/dedup.py', 'MongoDB index: content_hash']}
          />

          <Connector label="status=accepted → pipeline sweep" />

          <Step
            num={4}
            title="Relatório IA — Geração Automática"
            trigger="task_auto_pipeline_sweep (cron: min=10,40)"
            icon={<Bot size={16} />}
            accentColor="#8b5cf6"
            borderColor="#8b5cf620"
            bgColor="#8b5cf608"
            description="O sweep verifica findings accepted sem pipeline ativo e enfileira task_auto_pipeline. O worker tenta gerar o relatório primeiro via Ollama (modelo local), com fallback automático para Claude se o Ollama não responder."
            details={[
              'Prompt estruturado no formato HackerOne: título, severidade, CVSS, URL, payload, steps, impacto',
              'Ollama: POST /api/generate com model=xploiter/the-xploiter, temp=0.7, stream=false, timeout=OLLAMA_TIMEOUT',
              'Se Ollama falhar (timeout/conexão): fallback automático para Claude Sonnet via Anthropic SDK',
              'Relatório gerado em Markdown com seções: Severidade, Resumo, Passos, Impacto, Material, Correção',
              'Salvo em Report com prompt_tokens + completion_tokens para auditoria de custo',
              'Eventos SSE publicados em tempo real para o frontend',
            ]}
            output="Report.content_markdown salvo no MongoDB"
            tools={['Ollama (xploiter/the-xploiter)', 'Claude (claude-sonnet-4-6)', 'services/ai_reporter.py']}
          />

          <Connector label="markdown gerado → revisão" />

          <Step
            num={5}
            title="Revisão IA — Checklist de Qualidade"
            trigger="automático após geração do relatório"
            icon={<FileText size={16} />}
            accentColor="#a855f7"
            borderColor="#a855f720"
            bgColor="#a855f708"
            description="O mesmo worker chama review_report() passando o markdown gerado. A IA avalia a qualidade do relatório em 5 critérios e retorna um score de 0 a 100 em JSON estruturado."
            details={[
              'Verifica presença de seções obrigatórias H1: Severidade, Resumo, Passos, Impacto, Correção',
              'Avalia clareza dos passos de reprodução (devem ser numerados e detalhados)',
              'Verifica se a severidade declarada está justificada no texto',
              'Checa qualidade técnica da linguagem (português profissional)',
              'Retorna: quality_score (0-100), approved (score≥70), missing_sections[], issues[], suggestions[]',
              'Validação estática como fallback se a IA de revisão falhar (conta seções faltantes)',
            ]}
            output="Review score salvo no Report → approved: true/false"
            tools={['Ollama (review)', 'Claude (review fallback)', 'validação estática']}
          />

          <Connector label="review.approved + score≥70 → submit" />

          <Step
            num={6}
            title="Submissão H1 — Envio Automático"
            trigger="automático se review.approved=true AND score≥70 AND team_handle"
            icon={<Shield size={16} />}
            accentColor="#10b981"
            borderColor="#10b98120"
            bgColor="#10b98108"
            description="Se todas as condições forem atendidas, o worker chama hackerone.submit_report() diretamente via API REST. O report_id retornado é salvo no job para rastreabilidade. Caso contrário, o motivo é logado e o pipeline é marcado como completo sem submissão."
            details={[
              'Condição: review.approved=true AND readiness_score≥70 AND team_handle configurado',
              'POST https://api.hackerone.com/v1/hackers/reports com Basic Auth',
              'Payload: title, vulnerability_information (markdown), impact, severity_rating, team_handle',
              'h1_report_id salvo no result_summary do Job para link direto ao report no H1',
              'Se team_handle ausente ou score baixo: loga o motivo e finaliza sem submeter',
              'Finding pode ser re-executado manualmente após corrigir os campos faltantes',
            ]}
            output="Report publicado no HackerOne → h1_report_id salvo"
            tools={['HackerOne API v1', 'services/hackerone.py', 'Basic Auth']}
          />

        </div>
      </section>

      {/* ── SECTION 2: ARQUITETURA EM CAMADAS ───────────────────────────────── */}
      <section>
        <Label>Arquitetura em Camadas</Label>

        <div className="space-y-3">

          {/* Layer: User */}
          <div className="rounded-2xl border border-zinc-800 p-4 bg-zinc-900/30">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-zinc-800"><Network size={13} className="text-zinc-400" /></div>
              <p className="text-sm font-semibold text-zinc-300">Usuário / Browser</p>
              <span className="text-[10px] text-zinc-600">ponto de entrada</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {['Dashboard', 'Findings', 'Pipeline', 'Jobs', 'Programs', 'AI Assistant', 'Logs', 'Architecture'].map(p => (
                <span key={p} className="px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-400">{p}</span>
              ))}
            </div>
          </div>

          <Connector label="HTTP REST + SSE (EventSource)" />

          {/* Layer: Frontend */}
          <div className="rounded-2xl border p-4" style={{ borderColor: '#3b82f625', background: '#3b82f608' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-blue-500/10"><Layers size={13} className="text-blue-400" /></div>
              <p className="text-sm font-semibold text-zinc-100">Frontend</p>
              <span className="text-[10px] text-blue-600">Next.js 14 · Tailwind · Radix UI · SWR · :3000</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: 'App Router', detail: 'server + client components' },
                { label: 'RealtimeContext', detail: 'SSE stream + heartbeat' },
                { label: 'axios (api.ts)', detail: 'Bearer token interceptor' },
                { label: 'useAuth', detail: 'JWT localStorage' },
                { label: 'Skeleton Loading', detail: 'UX progressiva' },
                { label: 'RichTooltip', detail: 'contexto nos KPIs' },
                { label: 'Sidebar + StatusBar', detail: 'layout global' },
                { label: 'Pipeline page', detail: 'auto-submit + logs' },
              ].map((item, i) => (
                <div key={i} className="rounded-lg border border-blue-500/15 bg-blue-500/5 px-3 py-2">
                  <p className="text-[11px] font-medium text-blue-300">{item.label}</p>
                  <p className="text-[9px] text-zinc-600 mt-0.5">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <Connector label="axios → Authorization: Bearer JWT" />

          {/* Layer: API */}
          <div className="rounded-2xl border p-4" style={{ borderColor: '#f9731625', background: '#f9731608' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-orange-500/10"><Server size={13} className="text-orange-400" /></div>
              <p className="text-sm font-semibold text-zinc-100">Backend API</p>
              <span className="text-[10px] text-orange-600">FastAPI · Beanie ODM · slowapi · JWT · :8000</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: '/auth', detail: 'login · register · me' },
                { label: '/findings', detail: 'CRUD + bulk PATCH' },
                { label: '/jobs', detail: 'create + queue/stats' },
                { label: '/pipeline', detail: 'run · run-all · analyze' },
                { label: '/programs', detail: 'CRUD local' },
                { label: '/targets', detail: 'CRUD + scope' },
                { label: '/hackerone', detail: 'proxy API + logs' },
                { label: '/events', detail: 'SSE stream real-time' },
                { label: '/reports', detail: 'IA report list' },
                { label: '/dashboard', detail: 'KPIs agregados' },
                { label: 'CORS middleware', detail: 'localhost:3000' },
                { label: 'slowapi', detail: '120 req/min por IP' },
              ].map((item, i) => (
                <div key={i} className="rounded-lg border border-orange-500/15 bg-orange-500/5 px-3 py-2">
                  <p className="text-[11px] font-medium text-orange-300">{item.label}</p>
                  <p className="text-[9px] text-zinc-600 mt-0.5">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Connector label="Beanie ODM → queries" />
            <Connector label="arq.enqueue_job()" />
          </div>

          {/* Layer: Data */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

            {/* MongoDB */}
            <div className="rounded-2xl border p-4" style={{ borderColor: '#10b98125', background: '#10b98108' }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-emerald-500/10"><Database size={13} className="text-emerald-400" /></div>
                <p className="text-sm font-semibold text-zinc-100">MongoDB</p>
                <span className="text-[10px] text-emerald-600">Beanie · :27017</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { name: 'User', rel: 'owns → Program, Finding' },
                  { name: 'Program', rel: 'has → Target[]' },
                  { name: 'Target', rel: 'spawns → Job[]' },
                  { name: 'Job', rel: 'creates → Finding[]' },
                  { name: 'Finding', rel: 'has → Report, Comment[]' },
                  { name: 'Report', rel: 'content_markdown + score' },
                  { name: 'HackerOneLog', rel: 'action + status + ms' },
                  { name: 'Comment', rel: 'finding_id + content' },
                ].map(m => (
                  <div key={m.name} className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-2.5 py-1.5">
                    <p className="text-[11px] font-semibold text-emerald-300">{m.name}</p>
                    <p className="text-[9px] text-zinc-600 leading-tight mt-0.5">{m.rel}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Redis */}
            <div className="rounded-2xl border p-4" style={{ borderColor: '#ef444425', background: '#ef444408' }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-red-500/10"><Radio size={13} className="text-red-400" /></div>
                <p className="text-sm font-semibold text-zinc-100">Redis + ARQ</p>
                <span className="text-[10px] text-red-600">task queue · :6379</span>
              </div>
              <div className="space-y-2">
                <div className="rounded-lg border border-red-500/15 bg-red-500/5 p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Queue Keys</p>
                  {['arq:queue — jobs pendentes', 'arq:in-progress — em execução', 'arq:results — resultados (TTL 7d)', 'arq:health — heartbeat workers'].map(k => (
                    <p key={k} className="text-[10px] font-mono text-zinc-500">{k}</p>
                  ))}
                </div>
                <div className="rounded-lg border border-red-500/15 bg-red-500/5 p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Cron Schedule</p>
                  {[
                    { time: 'startup', task: 'task_auto_h1_sync (imediato)' },
                    { time: '0,6,12,18h', task: 'task_auto_h1_sync' },
                    { time: 'cada 1h', task: 'task_auto_scheduler' },
                    { time: 'min=10,40', task: 'task_auto_pipeline_sweep' },
                  ].map(c => (
                    <div key={c.task} className="flex items-center gap-2">
                      <Clock size={9} className="text-red-500 shrink-0" />
                      <span className="text-[9px] font-mono text-red-400 w-20 shrink-0">{c.time}</span>
                      <span className="text-[10px] text-zinc-500">{c.task}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <Connector label="ARQ dispatch → worker pool" />

          {/* Layer: Workers */}
          <div className="rounded-2xl border p-4" style={{ borderColor: '#10b98125', background: '#10b98108' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-emerald-500/10"><Cpu size={13} className="text-emerald-400" /></div>
              <p className="text-sm font-semibold text-zinc-100">Workers ARQ</p>
              <span className="text-[10px] text-emerald-600">4 réplicas · max_jobs=10 · timeout=5400s</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[
                { group: 'Recon & Discovery', color: '#10b981', tasks: ['task_run_recon', 'task_run_port_scan', 'task_run_dir_fuzz', 'task_run_dns_recon'] },
                { group: 'Vuln Scanners', color: '#eab308', tasks: ['task_run_xss_scan', 'task_run_sqli_scan', 'task_run_idor_test', 'task_run_param_discovery', 'task_run_js_analysis', 'task_run_secret_scan', 'task_run_api_scan'] },
                { group: 'Pipeline & IA', color: '#8b5cf6', tasks: ['task_generate_report', 'task_auto_pipeline', 'task_auto_scheduler', 'task_auto_h1_sync', 'task_auto_pipeline_sweep', 'task_seed_programs'] },
              ].map(g => (
                <div key={g.group} className="rounded-xl border p-3 space-y-2"
                  style={{ borderColor: g.color + '20', background: g.color + '06' }}>
                  <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: g.color }}>{g.group}</p>
                  {g.tasks.map(t => (
                    <p key={t} className="text-[10px] font-mono text-zinc-500">{t}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Connector label="shell subprocess" />
            <Connector label="HTTP API call" />
          </div>

          {/* Layer: External */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            <div className="rounded-2xl border p-4" style={{ borderColor: '#8b5cf625', background: '#8b5cf608' }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-violet-500/10"><Bot size={13} className="text-violet-400" /></div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">Ollama</p>
                  <p className="text-[10px] text-violet-600">primário · local · :11434</p>
                </div>
              </div>
              <div className="space-y-1.5 text-[11px] text-zinc-500">
                <p>model: xploiter/the-xploiter</p>
                <p>POST /api/generate</p>
                <p>temperature: 0.7</p>
                <p>stream: false</p>
                <p className="text-violet-400/70">Geração + Revisão de relatórios</p>
              </div>
            </div>

            <div className="rounded-2xl border p-4" style={{ borderColor: '#ec489925', background: '#ec489908' }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-pink-500/10"><Bot size={13} className="text-pink-400" /></div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">Claude</p>
                  <p className="text-[10px] text-pink-600">fallback · Anthropic API</p>
                </div>
              </div>
              <div className="space-y-1.5 text-[11px] text-zinc-500">
                <p>model: claude-sonnet-4-6</p>
                <p>messages.create()</p>
                <p>max_tokens: 2048 / 512</p>
                <p>env: ANTHROPIC_API_KEY</p>
                <p className="text-pink-400/70">Ativado se Ollama falhar</p>
              </div>
            </div>

            <div className="rounded-2xl border p-4" style={{ borderColor: '#f9731625', background: '#f9731608' }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-orange-500/10"><Shield size={13} className="text-orange-400" /></div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">HackerOne</p>
                  <p className="text-[10px] text-orange-600">REST API v1 · Basic Auth</p>
                </div>
              </div>
              <div className="space-y-1.5 text-[11px] text-zinc-500">
                <p>GET /programs (sync)</p>
                <p>GET /structured_scopes</p>
                <p>POST /reports (submit)</p>
                <p>GET /me/reports (inbox)</p>
                <p className="text-orange-400/70">Sync 6h + submit automático</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: AI DECISION FLOW ──────────────────────────────────────── */}
      <section>
        <Label>Fluxo de Decisão da IA</Label>

        <div className="rounded-2xl border p-6" style={{ borderColor: '#8b5cf620', background: '#09090f' }}>
          <div className="max-w-lg mx-auto space-y-0">

            {/* Start */}
            <div className="flex justify-center">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-700 bg-zinc-800">
                <Play size={11} className="text-zinc-400" />
                <span className="text-[11px] font-semibold text-zinc-300">task_auto_pipeline iniciado</span>
              </div>
            </div>

            <ArrowV />

            {/* Try Ollama */}
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3 text-center">
              <Bot size={14} className="text-violet-400 mx-auto mb-1" />
              <p className="text-[11px] font-semibold text-violet-300">Tenta Ollama</p>
              <p className="text-[9px] text-zinc-600">POST /api/generate · timeout={'{'}OLLAMA_TIMEOUT{'}'}</p>
            </div>

            <ArrowV />
            <DecisionNode question="Ollama respondeu?" />

            {/* Branch */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1 justify-center">
                  <CheckCircle2 size={10} className="text-emerald-400" />
                  <span className="text-[10px] text-emerald-400 font-semibold">Sim</span>
                </div>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-center">
                  <p className="text-[10px] text-emerald-300">Relatório via Ollama</p>
                  <p className="text-[9px] text-zinc-600">xploiter/the-xploiter</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1 justify-center">
                  <XCircle size={10} className="text-red-400" />
                  <span className="text-[10px] text-red-400 font-semibold">Não (timeout/erro)</span>
                </div>
                <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-2.5 text-center">
                  <p className="text-[10px] text-pink-300">Fallback → Claude</p>
                  <p className="text-[9px] text-zinc-600">claude-sonnet-4-6</p>
                </div>
              </div>
            </div>

            <ArrowV />

            {/* Review */}
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3 text-center">
              <FileText size={14} className="text-violet-400 mx-auto mb-1" />
              <p className="text-[11px] font-semibold text-violet-300">Revisão de qualidade</p>
              <p className="text-[9px] text-zinc-600">Ollama (ou Claude fallback) avalia o relatório · retorna JSON</p>
            </div>

            <ArrowV />
            <DecisionNode question="review.approved = true?" />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1 justify-center">
                  <CheckCircle2 size={10} className="text-emerald-400" />
                  <span className="text-[10px] text-emerald-400 font-semibold">score ≥ 70 + team_handle</span>
                </div>
                <ArrowV />
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-2.5 text-center">
                  <Shield size={12} className="text-emerald-400 mx-auto mb-1" />
                  <p className="text-[10px] text-emerald-300 font-semibold">Submete ao HackerOne</p>
                  <p className="text-[9px] text-zinc-600">POST /v1/hackers/reports</p>
                </div>
                <ArrowV />
                <div className="rounded-xl border border-emerald-500/15 p-2.5 text-center">
                  <p className="text-[10px] text-emerald-400">h1_report_id salvo · job=completed</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1 justify-center">
                  <XCircle size={10} className="text-yellow-400" />
                  <span className="text-[10px] text-yellow-400 font-semibold">score {'<'} 70 ou sem handle</span>
                </div>
                <ArrowV />
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-2.5 text-center">
                  <p className="text-[10px] text-yellow-300">Log motivo + pula submissão</p>
                  <p className="text-[9px] text-zinc-600">job=completed (sem H1)</p>
                </div>
                <ArrowV />
                <div className="rounded-xl border border-zinc-700 p-2.5 text-center">
                  <p className="text-[10px] text-zinc-500">Pode re-executar manualmente</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── SECTION 4: DOCKER COMPOSE ─────────────────────────────────────────── */}
      <section>
        <Label>Infraestrutura Docker Compose</Label>

        <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: '#ffffff08', background: '#09090f' }}>

          {/* Network map */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { name: 'frontend', port: ':3000', tech: 'Next.js 14', color: '#3b82f6', deps: ['→ api:8000'] },
              { name: 'api', port: ':8000', tech: 'FastAPI + Uvicorn', color: '#f97316', deps: ['→ mongo:27017', '→ redis:6379'] },
              { name: 'worker ×4', port: 'interno', tech: 'ARQ + Python', color: '#10b981', deps: ['→ mongo:27017', '→ redis:6379', '→ ollama:11434'] },
              { name: 'mongodb', port: ':27017', tech: 'MongoDB 7', color: '#06b6d4', deps: ['persistência em volume'] },
              { name: 'redis', port: ':6379', tech: 'Redis 7', color: '#ef4444', deps: ['in-memory + append-only'] },
              { name: 'ollama', port: ':11434', tech: 'host.docker.internal', color: '#8b5cf6', deps: ['modelo local no host'] },
            ].map(s => (
              <div key={s.name} className="rounded-xl border p-3 space-y-2"
                style={{ borderColor: s.color + '25', background: s.color + '06' }}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold" style={{ color: s.color }}>{s.name}</p>
                  <span className="text-[9px] font-mono text-zinc-600">{s.port}</span>
                </div>
                <p className="text-[10px] text-zinc-500">{s.tech}</p>
                <div className="space-y-0.5">
                  {s.deps.map(d => (
                    <p key={d} className="text-[9px] font-mono" style={{ color: s.color + '88' }}>{d}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Shared network note */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-900/50">
            <GitBranch size={13} className="text-zinc-500 shrink-0" />
            <p className="text-[11px] text-zinc-500">
              Todos os serviços compartilham a rede interna <span className="font-mono text-zinc-400">bugbounty-network</span>.
              O Ollama roda no host Mac e é acessado pelo alias <span className="font-mono text-zinc-400">host.docker.internal:11434</span>.
              Workers têm <span className="font-mono text-zinc-400">network_mode: host</span> para acessar ferramentas de rede (naabu, nuclei) sem restrições.
            </p>
          </div>
        </div>
      </section>

      {/* ── SECTION 5: ENV VARS ──────────────────────────────────────────────── */}
      <section>
        <Label>Variáveis de Ambiente Necessárias</Label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            {
              group: 'Banco de Dados', color: '#10b981', icon: <Database size={12} />,
              vars: [
                { key: 'MONGO_URI', example: 'mongodb://mongo:27017/bugbounty', required: true },
                { key: 'REDIS_URL', example: 'redis://redis:6379', required: true },
              ],
            },
            {
              group: 'Autenticação', color: '#f97316', icon: <Key size={12} />,
              vars: [
                { key: 'JWT_SECRET', example: 'seu-segredo-aqui', required: true },
                { key: 'JWT_EXPIRY_HOURS', example: '24', required: false },
              ],
            },
            {
              group: 'IA — Ollama', color: '#8b5cf6', icon: <Bot size={12} />,
              vars: [
                { key: 'OLLAMA_URL', example: 'http://host.docker.internal:11434', required: false },
                { key: 'OLLAMA_MODEL', example: 'xploiter/the-xploiter:latest', required: false },
                { key: 'OLLAMA_TIMEOUT', example: '30', required: false },
              ],
            },
            {
              group: 'IA — Claude (fallback)', color: '#ec4899', icon: <Bot size={12} />,
              vars: [
                { key: 'ANTHROPIC_API_KEY', example: 'sk-ant-...', required: false },
              ],
            },
            {
              group: 'HackerOne', color: '#f97316', icon: <Shield size={12} />,
              vars: [
                { key: 'HACKERONE_API_USERNAME', example: 'seu-username', required: false },
                { key: 'HACKERONE_API_TOKEN', example: 'seu-token', required: false },
              ],
            },
            {
              group: 'Performance', color: '#eab308', icon: <Terminal size={12} />,
              vars: [
                { key: 'MAX_JOBS', example: '10', required: false },
                { key: 'RATE_LIMIT_PER_MINUTE', example: '120', required: false },
                { key: 'ENABLE_CACHING', example: 'true', required: false },
              ],
            },
          ].map(g => (
            <div key={g.group} className="rounded-xl border p-4 space-y-2"
              style={{ borderColor: g.color + '20', background: g.color + '06' }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="p-1 rounded" style={{ background: g.color + '20', color: g.color }}>{g.icon}</div>
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: g.color + 'cc' }}>{g.group}</p>
              </div>
              {g.vars.map(v => (
                <div key={v.key} className="flex items-start gap-2 py-1.5 border-t border-white/[0.04]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-mono font-semibold text-zinc-300">{v.key}</p>
                      {v.required
                        ? <span className="text-[9px] px-1 py-px rounded bg-red-500/10 text-red-400 border border-red-500/20">obrigatório</span>
                        : <span className="text-[9px] px-1 py-px rounded bg-zinc-800 text-zinc-600 border border-zinc-700">opcional</span>
                      }
                    </div>
                    <p className="text-[9px] font-mono text-zinc-600 mt-0.5">{v.example}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}
