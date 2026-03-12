'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Inbox, Shield, TrendingUp, Zap, CheckCircle2,
  Clock, ExternalLink, RefreshCw, AlertTriangle, ChevronRight,
  Bug, DollarSign, Lightbulb, Crosshair,
  BarChart3, BookOpen, Rocket, Eye, GitBranch, Timer,
  FileText, Users, Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────

interface H1Report {
  id: string
  attributes: {
    title: string
    state: string
    severity_rating: string
    created_at: string
    team_handle?: string
    bounty_amount?: string
  }
}

interface H1Stats {
  total: number
  syncs: number
  submissions: number
  success_rate: number
}

// ── Config ────────────────────────────────────────────────────────────────

const STATE_CFG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  new:            { label: 'Novo',        color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/25',  dot: 'bg-yellow-400' },
  triaged:        { label: 'Triaged',     color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/25',    dot: 'bg-blue-400' },
  resolved:       { label: 'Resolvido',   color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', dot: 'bg-emerald-400' },
  duplicate:      { label: 'Duplicata',   color: 'text-zinc-400',    bg: 'bg-zinc-800',        border: 'border-zinc-700',       dot: 'bg-zinc-500' },
  informative:    { label: 'Informativo', color: 'text-zinc-400',    bg: 'bg-zinc-800',        border: 'border-zinc-700',       dot: 'bg-zinc-500' },
  not_applicable: { label: 'N/A',         color: 'text-zinc-500',    bg: 'bg-zinc-900',        border: 'border-zinc-800',       dot: 'bg-zinc-600' },
}
const SEV_COLOR: Record<string, string> = {
  critical: 'text-red-400', high: 'text-orange-400', medium: 'text-yellow-400', low: 'text-blue-400',
}

const STRATEGIES = [
  {
    icon: <Crosshair size={15} />, color: '#f97316',
    title: 'Escolha de programas',
    tips: [
      'Programas novos têm menos hunters e mais baixo-hanging fruit — monitore novos lançamentos',
      'Prefira wildcards (*.empresa.com) — superfície de ataque muito maior',
      'Programas privados pagam mais e têm menos concorrência — construa reputação para acessá-los',
      'Verifique histórico de bounty: empresas que pagam bem continuam pagando',
    ],
  },
  {
    icon: <Zap size={15} />, color: '#eab308',
    title: 'Automação como vantagem',
    tips: [
      'Esta plataforma faz recon automático — você recebe os findings sem rodar ferramentas manualmente',
      'Configure o sync H1 para pegar novos targets imediatamente após lançamento de programa',
      'IDOR e lógica de negócio NÃO são detectáveis por automação — reserve tempo para análise manual',
      'Monitore mudanças no JS do frontend — novas features = novos endpoints = novas vulns',
    ],
  },
  {
    icon: <Eye size={15} />, color: '#3b82f6',
    title: 'Recon além do básico',
    tips: [
      'Analise JS em busca de endpoints hardcoded, API keys e lógica do frontend',
      'GitHub dorking: site:github.com "empresa.com" para repositórios internos expostos',
      'Google dorks: site:target.com filetype:env OR inurl:admin OR inurl:backup',
      'Monitore mudanças no scope do programa — novos ativos adicionados são alvos frescos',
    ],
  },
  {
    icon: <Bug size={15} />, color: '#ef4444',
    title: 'Foco em alto impacto',
    tips: [
      'IDOR em dados sensíveis (PII, financeiro, médico) vale critical quase sempre',
      'SSRF com acesso a metadata AWS = critical garantido se IMDSv1 ativo',
      'Subdomain takeover: alto impacto, baixo esforço relativo',
      'Auth bypass em admin ou reset de senha são altamente recompensados',
    ],
  },
  {
    icon: <FileText size={15} />, color: '#8b5cf6',
    title: 'Relatórios que pagam mais',
    tips: [
      'A IA desta plataforma gera e revisa seu relatório com score — use como guia de qualidade',
      'Impacto é o campo mais importante: quantifique quem é afetado e como',
      'Steps devem ser claros o suficiente para um júnior reproduzir em 5 min',
      'Inclua request/response do Burp, vídeo ou screenshots, e conta de teste',
    ],
  },
  {
    icon: <Timer size={15} />, color: '#10b981',
    title: 'Timing e consistência',
    tips: [
      'Reporte assim que confirmar — outros hunters podem estar no mesmo target',
      'Novos programas públicos: os primeiros 48h são os mais rentáveis',
      'Deploy days: monitore changelogs e releases — código novo = vulns novas',
      '2h por dia supera 14h no final de semana a longo prazo',
    ],
  },
  {
    icon: <Users size={15} />, color: '#06b6d4',
    title: 'Reputação no H1',
    tips: [
      'Reputação alta desbloqueia programas privados — qualidade antes de velocidade',
      'Responda rápido às perguntas do triager — demora pode reduzir o bounty',
      'Quando pedir duplicata indevida: cite seu diferencial técnico vs. o report similar',
      'Participe de Live Hacking Events (LHE) — bounties maiores e networking',
    ],
  },
  {
    icon: <GitBranch size={15} />, color: '#a855f7',
    title: 'Metodologia por alvo',
    tips: [
      'APIs REST: foque em IDOR, mass assignment, BOLA (Broken Object Level Auth)',
      'SPAs: analise o bundle JS para descobrir endpoints não documentados',
      'Cloud-heavy: SSRF para metadata é prioridade; busque S3 buckets públicos',
      'E-commerce: IDOR em orders/coupons, price manipulation, payment bypass',
    ],
  },
]

const METRICS = [
  { metric: 'Taxa de resolução', ideal: '> 60%', tip: 'Relatórios válidos e bem documentados' },
  { metric: 'Taxa de triagem', ideal: '> 80%', tip: 'Vulns válidas e consistentes' },
  { metric: 'Severity média', ideal: 'High/Critical', tip: 'Foque em alto impacto — low tem ROI baixo' },
  { metric: 'Taxa de duplicatas', ideal: '< 10%', tip: 'Muitas duplicatas = programa saturado' },
  { metric: 'Tempo até triagem', ideal: '< 7 dias', tip: 'Programas ágeis valem mais seu tempo' },
]

const WORKFLOW = [
  { n: '1', label: 'Sync H1',       sub: 'automático (6h)',  icon: <Shield size={14} />,   color: '#3b82f6', detail: 'Programas e targets' },
  { n: '2', label: 'Recon auto',    sub: 'automático (1h)',  icon: <Zap size={14} />,      color: '#eab308', detail: 'subfinder+nuclei+httpx' },
  { n: '3', label: 'Analise',       sub: 'você faz isso',    icon: <Eye size={14} />,      color: '#f97316', detail: 'Revise findings no dash' },
  { n: '4', label: 'IDOR manual',   sub: 'você faz isso',    icon: <Bug size={14} />,      color: '#ef4444', detail: 'Lógica que auto não pega' },
  { n: '5', label: 'IA drafta',     sub: 'automático',       icon: <FileText size={14} />, color: '#8b5cf6', detail: 'Ollama/Claude gera report' },
  { n: '6', label: 'Envio auto',    sub: 'score ≥ 70',       icon: <CheckCircle2 size={14} />, color: '#10b981', detail: 'Pipeline envia ao H1' },
]

const RESOURCES = [
  { title: 'H1 Hacktivity',        desc: 'Reports públicos resolvidos para aprender técnicas reais', url: 'https://hackerone.com/hacktivity',                          color: '#f97316' },
  { title: 'PortSwigger Academy',  desc: 'Labs práticos de todas as categorias de web vulns',        url: 'https://portswigger.net/web-security',                     color: '#3b82f6' },
  { title: 'PentesterLab',         desc: 'Exercícios progressivos com certificados',                 url: 'https://pentesterlab.com',                                 color: '#8b5cf6' },
  { title: 'Bug Bounty Hunter',    desc: 'Metodologias documentadas pela comunidade',                url: 'https://www.bugbountyhunter.com',                          color: '#eab308' },
  { title: 'Nahamsec YouTube',     desc: 'Recon avançado e metodologias de top hunters',             url: 'https://www.youtube.com/@nahamsec',                        color: '#ef4444' },
  { title: 'OWASP Testing Guide',  desc: 'Referência completa de técnicas de pentest',              url: 'https://owasp.org/www-project-web-security-testing-guide', color: '#10b981' },
]

// ── Page ──────────────────────────────────────────────────────────────────

export default function HackerOnePage() {
  const [reports, setReports]     = useState<H1Report[]>([])
  const [stats, setStats]         = useState<H1Stats | null>(null)
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<'inbox' | 'strategy'>('inbox')
  const [stateFilter, setStateFilter] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rRes, sRes] = await Promise.all([
        api.get('/hackerone/reports?size=25'),
        api.get('/hackerone/logs/stats'),
      ])
      setReports(rRes.data?.data ?? [])
      setStats(sRes.data)
    } catch { /* sem credenciais */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = stateFilter ? reports.filter(r => r.attributes.state === stateFilter) : reports

  const stateCounts = reports.reduce<Record<string, number>>((acc, r) => {
    acc[r.attributes.state] = (acc[r.attributes.state] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6 pb-12">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl" style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)' }}>
            <Inbox size={18} className="text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">HackerOne</h1>
            <p className="text-xs text-zinc-500 mt-0.5">Inbox de reports + estratégias para maximizar seus bounties</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg border border-zinc-800 hover:bg-zinc-800 transition-colors">
            <RefreshCw size={13} className="text-zinc-500" />
          </button>
          <a href="https://hackerone.com/reports" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-orange-500/25 bg-orange-500/10 text-xs font-medium text-orange-400 hover:bg-orange-500/20 transition-all">
            <ExternalLink size={12} /> Abrir H1
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl border border-zinc-800 bg-zinc-900/50 w-fit">
        {([['inbox', 'Inbox', <Inbox size={13} key="i" />], ['strategy', 'Como Melhorar', <TrendingUp size={13} key="t" />]] as const).map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === id ? 'bg-orange-500/15 text-orange-400 border border-orange-500/25' : 'text-zinc-500 hover:text-zinc-300'
            )}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── INBOX ── */}
      {tab === 'inbox' && (
        <div className="space-y-5">

          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total ações',  value: stats.total,         color: 'text-zinc-300',    bg: '#0a0a0f', border: 'rgba(255,255,255,0.06)' },
                { label: 'Submissões',   value: stats.submissions,   color: 'text-orange-400',  bg: '#0a0a0f', border: 'rgba(249,115,22,0.2)' },
                { label: 'Syncs H1',     value: stats.syncs,         color: 'text-blue-400',    bg: '#0a0a0f', border: 'rgba(59,130,246,0.2)' },
                { label: 'Sucesso API',  value: `${stats.success_rate}%`, color: 'text-emerald-400', bg: '#0a0a0f', border: 'rgba(16,185,129,0.2)' },
              ].map(s => (
                <div key={s.label} className="rounded-xl border p-4" style={{ background: s.bg, borderColor: s.border }}>
                  <p className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</p>
                  <p className="text-[11px] text-zinc-600 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {reports.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setStateFilter(null)}
                className={cn('px-3 py-1 rounded-lg border text-[10px] font-semibold transition-all',
                  stateFilter === null ? 'bg-zinc-700 text-zinc-200 border-zinc-600' : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700'
                )}>
                Todos ({reports.length})
              </button>
              {Object.entries(stateCounts).map(([state, count]) => {
                const cfg = STATE_CFG[state] ?? STATE_CFG.new
                return (
                  <button key={state} onClick={() => setStateFilter(stateFilter === state ? null : state)}
                    className={cn('px-3 py-1 rounded-lg border text-[10px] font-semibold transition-all', cfg.bg, cfg.border, cfg.color,
                      stateFilter === state ? 'opacity-100' : 'opacity-50 hover:opacity-100'
                    )}>
                    {cfg.label} ({count})
                  </button>
                )
              })}
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-zinc-900/40 animate-pulse border border-zinc-800" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-dashed border-zinc-800">
              <Shield size={28} className="text-zinc-700" />
              <div className="text-center space-y-1">
                <p className="text-sm text-zinc-500">Sem reports no inbox</p>
                <p className="text-xs text-zinc-700">
                  Configure <code className="text-zinc-600">HACKERONE_API_USERNAME</code> e{' '}
                  <code className="text-zinc-600">HACKERONE_API_TOKEN</code> no .env
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(r => {
                const cfg = STATE_CFG[r.attributes.state] ?? STATE_CFG.new
                const sev = r.attributes.severity_rating
                return (
                  <div key={r.id} className="rounded-xl border overflow-hidden hover:border-orange-500/20 transition-all"
                    style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#0a0a0f' }}>
                    <div className="flex items-center gap-4 px-4 py-3.5">
                      <div className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate">{r.attributes.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={cn('text-[10px] font-semibold px-1.5 py-px rounded border', cfg.bg, cfg.border, cfg.color)}>
                            {cfg.label}
                          </span>
                          {sev && sev !== 'none' && (
                            <span className={cn('text-[10px] font-bold uppercase', SEV_COLOR[sev] ?? 'text-zinc-400')}>{sev}</span>
                          )}
                          {r.attributes.team_handle && (
                            <span className="text-[10px] text-zinc-600">@{r.attributes.team_handle}</span>
                          )}
                          <span className="text-[10px] text-zinc-700">
                            {new Date(r.attributes.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>
                      {r.attributes.bounty_amount && (
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-emerald-400">${r.attributes.bounty_amount}</p>
                          <p className="text-[9px] text-zinc-600">bounty</p>
                        </div>
                      )}
                      <a href={`https://hackerone.com/reports/${r.id}`} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 p-1.5 rounded-lg border border-zinc-800 text-zinc-600 hover:text-orange-400 hover:border-orange-500/25 transition-all">
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── STRATEGY ── */}
      {tab === 'strategy' && (
        <div className="space-y-8">

          {/* Intro */}
          <div className="rounded-2xl border p-5 space-y-2" style={{ borderColor: 'rgba(249,115,22,0.15)', background: 'rgba(249,115,22,0.04)' }}>
            <div className="flex items-center gap-2">
              <Rocket size={14} className="text-orange-400" />
              <p className="text-sm font-semibold text-zinc-100">Como usar esta plataforma para maximizar seus bounties</p>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">
              A plataforma automatiza recon, scanning e geração de relatório. Seu foco deve ser o que automação não faz:
              <span className="text-zinc-200 font-medium"> análise de lógica de negócio, IDOR manual e vulnerabilidades em features novas</span>.
              Use a automação como amplificador, não substituto do julgamento humano.
            </p>
          </div>

          {/* Metrics */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={13} className="text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-200">Métricas que indicam progresso</h2>
            </div>
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#09090f' }}>
              {METRICS.map((m, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3 border-b last:border-0 hover:bg-white/[0.02] transition-colors"
                  style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  <p className="text-[11px] font-semibold text-zinc-300 w-36 shrink-0">{m.metric}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                    {m.ideal}
                  </span>
                  <p className="text-[11px] text-zinc-500 flex-1">{m.tip}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Strategies */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={13} className="text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-200">Estratégias por área</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {STRATEGIES.map((s, i) => (
                <div key={i} className="rounded-2xl border overflow-hidden" style={{ borderColor: s.color + '20', background: '#09090f' }}>
                  <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: s.color + '15', background: s.color + '08' }}>
                    <div className="p-1.5 rounded-lg shrink-0" style={{ background: s.color + '20', color: s.color }}>{s.icon}</div>
                    <p className="text-sm font-semibold text-zinc-100">{s.title}</p>
                  </div>
                  <div className="p-4 space-y-2.5">
                    {s.tips.map((tip, j) => (
                      <div key={j} className="flex items-start gap-2.5">
                        <div className="w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold"
                          style={{ background: s.color + '15', color: s.color }}>{j + 1}</div>
                        <p className="text-[12px] text-zinc-400 leading-relaxed">{tip}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Workflow */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target size={13} className="text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-200">Workflow ideal com esta plataforma</h2>
            </div>
            <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#09090f' }}>
              <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
                {WORKFLOW.map((step, i) => (
                  <div key={step.n} className="flex items-center gap-1.5 shrink-0">
                    <div className="flex flex-col items-center gap-1 w-24">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: step.color + '15', border: `1px solid ${step.color}25`, color: step.color }}>
                        {step.icon}
                      </div>
                      <p className="text-[10px] font-semibold text-zinc-200 text-center leading-tight">{step.label}</p>
                      <span className="text-[8px] font-medium px-1.5 py-px rounded-full border text-center leading-tight"
                        style={{ background: step.color + '10', borderColor: step.color + '25', color: step.color + 'cc' }}>
                        {step.sub}
                      </span>
                      <p className="text-[8px] text-zinc-600 text-center leading-tight">{step.detail}</p>
                    </div>
                    {i < WORKFLOW.length - 1 && <ChevronRight size={12} className="text-zinc-700 self-start mt-2.5" />}
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 flex items-start gap-3">
                <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  <span className="text-yellow-300 font-semibold">Onde você agrega mais valor: </span>
                  A automação cobre recon e vulns conhecidas. Seu foco deve ser{' '}
                  <span className="text-zinc-200">lógica de negócio, IDOR manual, race conditions e features novas</span>{' '}
                  — o que paga os maiores bounties e não é detectável por ferramentas.
                </p>
              </div>
            </div>
          </div>

          {/* Resources */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={13} className="text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-200">Recursos recomendados</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {RESOURCES.map(r => (
                <a key={r.title} href={r.url} target="_blank" rel="noopener noreferrer"
                  className="rounded-xl border p-4 hover:border-zinc-600 transition-all group block"
                  style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#0a0a0f' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                    <ExternalLink size={10} className="text-zinc-700 group-hover:text-zinc-400 transition-colors" />
                  </div>
                  <p className="text-[12px] font-semibold text-zinc-200 mb-1">{r.title}</p>
                  <p className="text-[10px] text-zinc-600 leading-relaxed">{r.desc}</p>
                </a>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
