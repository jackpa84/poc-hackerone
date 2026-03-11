'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Bug, DollarSign, Zap, RefreshCw,
  AlertCircle, ExternalLink, ChevronRight, Clock, CheckCircle2, XCircle,
  Info, Shield, Crosshair, Activity,
  BrainCircuit, Radio, Terminal, X, Send, FileText, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { useRealtimeContext } from '@/contexts/RealtimeContext'

// ── Types ──────────────────────────────────────────────────────────────────

interface DashboardData {
  total_findings: number
  total_targets: number
  targets_in_scope: number
  active_jobs: number
  bounty_earned: number
  by_severity: Record<string, number>
  by_status: Record<string, number>
  priority_queue: FindingItem[]
  ready_to_report: FindingItem[]
  recent_jobs: JobItem[]
}

interface FindingItem {
  id: string
  title: string
  severity: string
  status: string
  type?: string
  affected_url?: string
  program_id?: string
  description?: string
  impact?: string
  steps_to_reproduce?: string
  cvss_score?: number
  bounty_amount?: number
}

interface JobItem {
  id: string
  type: string
  status: string
  created_at: string
  finished_at: string | null
  result_summary: Record<string, number> | null
}

interface AiReport {
  id: string
  finding_id: string
  is_ready: boolean
  model_used: string
  version: number
  created_at: string
  prompt_tokens?: number
  completion_tokens?: number
}

interface LogLine {
  timestamp: string
  message: string
  level: 'error' | 'warn' | 'info' | 'debug' | 'stdout'
}

interface ReadinessCheck {
  key: string
  label: string
  ok: boolean
  points: number
  tip: string
}

interface Readiness {
  score: number
  label: string
  color: string
  checks: ReadinessCheck[]
  suggestions: string[]
  has_report: boolean
  report_id: string | null
}

// ── Report Drawer ───────────────────────────────────────────────────────────

function ReportDrawer({ finding, onClose }: { finding: FindingItem; onClose: () => void }) {
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [loadingReadiness, setLoadingReadiness] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null)

  const sev = SEV[finding.severity] ?? SEV.informational

  useEffect(() => {
    setReadiness(null)
    setLoadingReadiness(true)
    setPipelineMsg(null)
    api.get(`/findings/${finding.id}/readiness`)
      .then(r => setReadiness(r.data))
      .catch(() => {})
      .finally(() => setLoadingReadiness(false))
  }, [finding.id])

  const runPipeline = async () => {
    setSubmitting(true)
    setPipelineMsg(null)
    try {
      const res = await api.post('/pipeline/run', { finding_id: finding.id })
      setPipelineMsg(res.data.message ?? 'Pipeline enfileirado!')
    } catch (e: any) {
      setPipelineMsg(e?.response?.data?.detail ?? 'Erro ao iniciar pipeline.')
    } finally {
      setSubmitting(false)
    }
  }

  const scoreColor =
    (readiness?.score ?? 0) >= 90 ? 'text-emerald-400' :
    (readiness?.score ?? 0) >= 70 ? 'text-yellow-400' :
    (readiness?.score ?? 0) >= 40 ? 'text-orange-400' : 'text-red-400'

  const scoreBg =
    (readiness?.score ?? 0) >= 90 ? 'bg-emerald-500' :
    (readiness?.score ?? 0) >= 70 ? 'bg-yellow-500' :
    (readiness?.score ?? 0) >= 40 ? 'bg-orange-500' : 'bg-red-500'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-screen w-[480px] max-w-full bg-background border-l border-border z-50 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0', sev.bg, sev.text)}>
              {finding.severity}
            </span>
            <h2 className="text-sm font-semibold truncate">{finding.title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0">
            <X size={15} className="text-muted-foreground" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Status',     value: STATUS_LABEL[finding.status]?.label ?? finding.status },
              { label: 'Tipo',       value: finding.type?.replace('_', ' ').toUpperCase() },
              { label: 'CVSS',       value: finding.cvss_score != null ? finding.cvss_score.toFixed(1) : '—' },
              { label: 'Bounty',     value: finding.bounty_amount ? `$${finding.bounty_amount.toLocaleString()}` : '—' },
            ].map(({ label, value }) => value && (
              <div key={label} className="bg-card border border-border rounded-lg px-3 py-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                <p className="text-xs font-semibold">{value}</p>
              </div>
            ))}
          </div>

          {/* URL */}
          {finding.affected_url && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">URL Afetada</p>
              <a
                href={finding.affected_url.startsWith('http') ? finding.affected_url : `https://${finding.affected_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 break-all"
              >
                <ExternalLink size={10} className="shrink-0" />
                {finding.affected_url}
              </a>
            </div>
          )}

          {/* Description */}
          {finding.description && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Descrição</p>
              <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{finding.description}</p>
            </div>
          )}

          {/* Impact */}
          {finding.impact && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Impacto</p>
              <p className="text-xs text-foreground leading-relaxed">{finding.impact}</p>
            </div>
          )}

          {/* Steps */}
          {finding.steps_to_reproduce && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Passos para Reproduzir</p>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{finding.steps_to_reproduce}</p>
            </div>
          )}

          {/* Readiness */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
              <div className="flex items-center gap-2">
                <FileText size={13} className="text-muted-foreground" />
                <span className="text-xs font-semibold">Score de Prontidão</span>
              </div>
              {loadingReadiness
                ? <Loader2 size={12} className="animate-spin text-muted-foreground" />
                : readiness && (
                  <span className={cn('text-sm font-bold', scoreColor)}>
                    {readiness.score}% — {readiness.label}
                  </span>
                )
              }
            </div>

            {readiness && (
              <>
                {/* Progress bar */}
                <div className="h-1.5 bg-zinc-800">
                  <div
                    className={cn('h-full transition-all', scoreBg)}
                    style={{ width: `${readiness.score}%` }}
                  />
                </div>

                {/* Checklist */}
                <div className="divide-y divide-border">
                  {readiness.checks.map(c => (
                    <div key={c.key} className="flex items-start gap-3 px-4 py-2.5">
                      {c.ok
                        ? <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                        : <XCircle size={13} className="text-zinc-600 shrink-0 mt-0.5" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-[11px] font-medium', c.ok ? 'text-foreground' : 'text-muted-foreground')}>
                          {c.label}
                        </p>
                        {!c.ok && c.tip && (
                          <p className="text-[10px] text-zinc-600 mt-0.5 leading-relaxed">{c.tip}</p>
                        )}
                      </div>
                      <span className={cn('text-[10px] font-bold shrink-0', c.ok ? 'text-emerald-400' : 'text-zinc-600')}>
                        +{c.points}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>

        {/* Footer — action buttons */}
        <div className="px-5 py-4 border-t border-border space-y-3 shrink-0">

          {pipelineMsg && (
            <div className={cn(
              'text-[11px] px-3 py-2 rounded-lg border',
              pipelineMsg.toLowerCase().includes('erro')
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            )}>
              {pipelineMsg}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={runPipeline}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {submitting
                ? <><Loader2 size={13} className="animate-spin" /> Enfileirando…</>
                : <><BrainCircuit size={13} /> Gerar Relatório com IA</>
              }
            </button>
            <Link
              href="/pipeline"
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-border text-xs text-muted-foreground hover:bg-accent transition-colors"
            >
              <Send size={12} /> Pipeline
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}

const LOG_SERVICES = [
  { key: 'backend', label: 'API' },
  { key: 'worker',  label: 'Worker' },
  { key: 'frontend',label: 'Frontend' },
  { key: 'mongodb', label: 'MongoDB' },
  { key: 'redis',   label: 'Redis' },
] as const

type ServiceKey = typeof LOG_SERVICES[number]['key']

const LOG_LEVEL_CLS: Record<LogLine['level'], string> = {
  error:  'text-red-400',
  warn:   'text-yellow-400',
  info:   'text-emerald-400',
  debug:  'text-zinc-500',
  stdout: 'text-zinc-300',
}

function ContainerLogs() {
  const [service, setService] = useState<ServiceKey>('backend')
  const [lines, setLines] = useState<LogLine[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchLogs = useCallback(async (svc: ServiceKey) => {
    setLoading(true)
    try {
      const res = await api.get(`/logs/services/${svc}?tail=50`)
      setLines(res.data.lines ?? [])
      setLoaded(true)
    } catch {
      setLines([{ timestamp: '', message: 'Erro ao carregar logs.', level: 'error' }])
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Só busca quando usuário troca de aba (e já carregou pelo menos uma vez)
  const handleTab = (svc: ServiceKey) => {
    setService(svc)
    if (loaded) fetchLogs(svc)
  }

  useEffect(() => {
    if (loaded) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, loaded])

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden geo-shadow flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-emerald-400" />
          <span className="text-sm font-semibold">Logs dos Containers</span>
        </div>
        <button
          onClick={() => fetchLogs(service)}
          disabled={loading}
          className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-40"
          title="Carregar / Atualizar"
        >
          <RefreshCw size={12} className={cn('text-muted-foreground', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Service tabs */}
      <div className="flex border-b border-border shrink-0">
        {LOG_SERVICES.map(s => (
          <button
            key={s.key}
            onClick={() => handleTab(s.key)}
            className={cn(
              'px-3 py-2 text-[11px] font-medium transition-colors border-b-2',
              service === s.key
                ? 'text-foreground border-emerald-500'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Log lines */}
      <div className="h-72 overflow-y-auto font-mono text-[11px] p-3 space-y-0.5 bg-zinc-950/60">
        {!loaded && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-600">
            <Terminal size={20} className="opacity-30" />
            <p className="text-[11px]">Clique em <RefreshCw size={10} className="inline" /> para carregar os logs</p>
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center h-full gap-2 text-zinc-600">
            <RefreshCw size={13} className="animate-spin" />
            <span>Carregando…</span>
          </div>
        )}
        {loaded && !loading && lines.length === 0 && (
          <p className="text-zinc-600 italic">Sem logs disponíveis.</p>
        )}
        {loaded && !loading && lines.map((l, i) => (
          <div key={i} className="flex gap-2 leading-5">
            {l.timestamp && (
              <span className="text-zinc-600 shrink-0 select-none">
                {l.timestamp.length > 19 ? l.timestamp.slice(11, 19) : l.timestamp}
              </span>
            )}
            <span className={cn('break-all whitespace-pre-wrap', LOG_LEVEL_CLS[l.level])}>
              {l.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}


// ── Tooltip ────────────────────────────────────────────────────────────────

interface TooltipContent {
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low' | 'info'
  actions: string[]
  details?: { label: string; value: string }[]
}

const PRIORITY_COLOR = {
  critical: 'border-red-500/40 bg-red-950/60',
  high:     'border-orange-500/40 bg-orange-950/60',
  medium:   'border-yellow-500/40 bg-yellow-950/60',
  low:      'border-blue-500/40 bg-blue-950/60',
  info:     'border-zinc-500/40 bg-zinc-900/80',
}

const PRIORITY_BADGE = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high:     'bg-orange-500/20 text-orange-300 border-orange-500/30',
  medium:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  low:      'bg-blue-500/20 text-blue-300 border-blue-500/30',
  info:     'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
}

const PRIORITY_LABEL = {
  critical: '🔴 Crítico', high: '🟠 Alto', medium: '🟡 Médio', low: '🔵 Baixo', info: 'ℹ Info',
}

function Tooltip({ content, children }: { content: TooltipContent; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [vPos, setVPos] = useState<'bottom' | 'top'>('bottom')
  const [hPos, setHPos] = useState<'left' | 'right'>('left')
  const ref = useRef<HTMLDivElement>(null)

  const TOOLTIP_W = 320

  const handleEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setVPos(rect.bottom + 320 > window.innerHeight ? 'top' : 'bottom')
      // Se o espaço à direita do elemento for menor que a largura do tooltip, abre para a esquerda
      setHPos(rect.left + TOOLTIP_W > window.innerWidth - 16 ? 'right' : 'left')
    }
    setOpen(true)
  }

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <div className={cn(
          'absolute z-50 w-80 rounded-xl border backdrop-blur-md shadow-2xl',
          'pointer-events-none select-none',
          PRIORITY_COLOR[content.priority],
          vPos === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
          hPos === 'left' ? 'left-0' : 'right-0',
        )}>
          <div className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-white leading-snug">{content.title}</p>
              <span className={cn(
                'px-2 py-0.5 rounded text-[10px] font-bold border shrink-0',
                PRIORITY_BADGE[content.priority]
              )}>
                {PRIORITY_LABEL[content.priority]}
              </span>
            </div>

            {/* Description */}
            <p className="text-[12px] text-zinc-300 leading-relaxed">{content.description}</p>

            {/* Details grid */}
            {content.details && content.details.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-white/10">
                {content.details.map(d => (
                  <div key={d.label}>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{d.label}</p>
                    <p className="text-[11px] text-zinc-200 font-medium">{d.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="pt-1 border-t border-white/10 space-y-1">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold">O que fazer</p>
              {content.actions.map((a, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-[10px] text-zinc-400 mt-0.5 shrink-0">→</span>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Constants ──────────────────────────────────────────────────────────────

const SEV: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  critical:      { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/30',    dot: 'bg-red-500' },
  high:          { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', dot: 'bg-orange-500' },
  medium:        { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', dot: 'bg-yellow-500' },
  low:           { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/30',   dot: 'bg-blue-400' },
  informational: { bg: 'bg-zinc-500/10',   text: 'text-zinc-400',   border: 'border-zinc-500/30',   dot: 'bg-zinc-500' },
}

const STATUS_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  new:            { label: 'Novo',      color: 'text-zinc-400',    icon: <Clock size={10} /> },
  triaging:       { label: 'Triagem',   color: 'text-yellow-400',  icon: <RefreshCw size={10} /> },
  accepted:       { label: 'Aceito',    color: 'text-blue-400',    icon: <CheckCircle2 size={10} /> },
  resolved:       { label: 'Resolvido', color: 'text-emerald-400', icon: <CheckCircle2 size={10} /> },
  duplicate:      { label: 'Duplicado', color: 'text-orange-400',  icon: <XCircle size={10} /> },
  not_applicable: { label: 'N/A',       color: 'text-red-400',     icon: <XCircle size={10} /> },
}

const TYPE_LABEL: Record<string, string> = {
  recon: 'Recon', dir_fuzz: 'Dir Fuzz', param_fuzz: 'Param Fuzz',
  sub_fuzz: 'Sub Fuzz', idor: 'IDOR', port_scan: 'Port Scan', dns_recon: 'DNS',
}

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'informational']

// ── KPI Tooltip definitions ────────────────────────────────────────────────

function getKpiTooltip(
  type: 'bugs' | 'bounty' | 'targets' | 'jobs' | 'ready',
  data: DashboardData | null
): TooltipContent {
  const bySev = data?.by_severity ?? {}
  const byStatus = data?.by_status ?? {}

  switch (type) {
    case 'bugs':
      return {
        title: 'Total de Bugs Capturados',
        priority: (bySev.critical ?? 0) > 0 ? 'critical' : (bySev.high ?? 0) > 0 ? 'high' : 'info',
        description:
          'Total de vulnerabilidades encontradas pelo sistema de recon automático e adicionadas manualmente. Inclui todos os status (novos, em triagem, aceitos e resolvidos).',
        details: [
          { label: 'Critical', value: String(bySev.critical ?? 0) },
          { label: 'High', value: String(bySev.high ?? 0) },
          { label: 'Medium', value: String(bySev.medium ?? 0) },
          { label: 'Low', value: String(bySev.low ?? 0) },
          { label: 'Novos', value: String(byStatus.new ?? 0) },
          { label: 'Em triagem', value: String(byStatus.triaging ?? 0) },
          { label: 'Aceitos', value: String(byStatus.accepted ?? 0) },
          { label: 'Resolvidos', value: String(byStatus.resolved ?? 0) },
        ],
        actions: [
          'Priorize findings Critical e High — são os mais rentáveis e urgentes.',
          'Findings "new" precisam de triagem: verifique se são reproduzíveis.',
          'Clique neste card para ir à lista completa de findings.',
        ],
      }
    case 'bounty':
      return {
        title: 'Bounty Total Ganho',
        priority: (data?.bounty_earned ?? 0) > 0 ? 'low' : 'info',
        description:
          'Soma total de bounties recebidos por vulnerabilidades reportadas e pagas. Atualizado quando o campo "bounty_amount" é preenchido em um finding.',
        details: [
          { label: 'Total', value: `$${(data?.bounty_earned ?? 0).toLocaleString()}` },
          { label: 'Findings pagos', value: String(Object.values(byStatus).reduce((a, b) => a + b, 0)) },
        ],
        actions: [
          'Preencha o campo "bounty_amount" nos findings quando receber o pagamento.',
          'Vulnerabilidades Critical costumam valer entre $5.000–$50.000 nas grandes plataformas.',
          'Acompanhe seus ganhos conforme os bounties são pagos.',
        ],
      }
    case 'targets':
      return {
        title: 'Targets In-Scope',
        priority: (data?.targets_in_scope ?? 0) === 0 ? 'high' : 'low',
        description:
          'Domínios, wildcards e IPs marcados como "in-scope" (elegíveis para bounty). São exatamente esses targets que o auto-scanner recona a cada 15 minutos com subfinder, httpx e gau.',
        details: [
          { label: 'In-scope', value: String(data?.targets_in_scope ?? 0) },
          { label: 'Total targets', value: String(data?.total_targets ?? 0) },
          { label: 'Out-of-scope', value: String((data?.total_targets ?? 0) - (data?.targets_in_scope ?? 0)) },
        ],
        actions: [
          'Wildcards (*.domain.com) cobrem automaticamente todos os subdomínios.',
          'Zero targets in-scope = nenhum recon será executado. Adicione targets.',
          'Verifique o escopo oficial do programa antes de marcar como in-scope.',
          'Targets out-of-scope são ignorados pelo auto-scheduler.',
        ],
      }
    case 'jobs':
      return {
        title: 'Jobs em Execução',
        priority: (data?.active_jobs ?? 0) > 5 ? 'medium' : 'info',
        description:
          'Tarefas de reconhecimento rodando agora no worker ARQ. Cada job executa uma combinação de ferramentas: subfinder (subdomínios), httpx (hosts ativos), gau (URLs históricas), nmap/naabu (portas), ffuf (diretórios), dnsx (DNS).',
        details: [
          { label: 'Rodando/Pendente', value: String(data?.active_jobs ?? 0) },
          { label: 'Workers paralelos', value: '10 máx' },
          { label: 'Timeout por job', value: '1 hora' },
          { label: 'Cron', value: 'a cada 15min' },
        ],
        actions: [
          'Jobs ativos indicam que o sistema está varrendo seus targets.',
          'Se um job travar, cancele-o na página Jobs e reinicie.',
          'Muitos jobs simultâneos podem ser lentos — o limite é 10 paralelos.',
          'Clique para ver todos os jobs e seus logs em tempo real.',
        ],
      }
    case 'ready':
      return {
        title: 'Prontos para Reportar',
        priority: (data?.ready_to_report?.length ?? 0) > 0 ? 'high' : 'info',
        description:
          'Findings com status "accepted" que passaram pela triagem e estão prontos para gerar relatório com IA. Esta é a fila prioritária — cada finding aqui representa um potencial bounty.',
        details: [
          { label: 'Prontos', value: String(data?.ready_to_report?.length ?? 0) },
          { label: 'Score mín. pipeline', value: '70%' },
          { label: 'Tempo geração IA', value: '~30s' },
        ],
        actions: [
          'Acesse Pipeline → Executar Todos para gerar relatórios e submeter automaticamente.',
          'O pipeline usa xploiter/the-xploiter para gerar o draft do relatório.',
          'Findings com score ≥ 70% estão prontos para reporte.',
          'Score < 70%: preencha descrição, passos de reprodução e impacto.',
        ],
      }
  }
}

function getSeverityTooltip(sev: string, count: number, data: DashboardData | null): TooltipContent {
  const byStatus = data?.by_status ?? {}
  const priority = sev === 'critical' ? 'critical' : sev === 'high' ? 'high' : sev === 'medium' ? 'medium' : sev === 'low' ? 'low' : 'info'

  const sevInfo: Record<string, { cvss: string; examples: string; bounty: string; urgency: string }> = {
    critical: {
      cvss: '9.0 – 10.0',
      examples: 'RCE sem auth, SQLi com dump total, Account Takeover completo, SSRF interno',
      bounty: '$10.000 – $50.000+',
      urgency: '🚨 IMEDIATO — reporte nas próximas 24h',
    },
    high: {
      cvss: '7.0 – 8.9',
      examples: 'IDOR com dados sensíveis, SQLi autenticado, Privilege Escalation, CSRF crítico',
      bounty: '$2.000 – $10.000',
      urgency: '⚡ URGENTE — reporte em 48h',
    },
    medium: {
      cvss: '4.0 – 6.9',
      examples: 'Stored XSS, Open Redirect + phishing, Auth bypass parcial, Info disclosure',
      bounty: '$200 – $2.000',
      urgency: '📋 NORMAL — reporte em 1 semana',
    },
    low: {
      cvss: '0.1 – 3.9',
      examples: 'Reflected XSS (baixo impacto), Missing headers, Rate limit ausente',
      bounty: '$50 – $500',
      urgency: '📝 BAIXO — reporte quando possível',
    },
    informational: {
      cvss: 'N/A',
      examples: 'Versão de software exposta, best practices, configurações subótimas',
      bounty: '$0 – $50',
      urgency: '💡 OPCIONAL — pode não receber bounty',
    },
  }

  const info = sevInfo[sev] ?? sevInfo.informational

  return {
    title: `Findings — ${sev.charAt(0).toUpperCase() + sev.slice(1)}`,
    priority,
    description: `Você tem ${count} finding${count !== 1 ? 's' : ''} com severidade ${sev.toUpperCase()}. ${count === 0 ? 'Nenhum encontrado ainda.' : 'Clique para filtrar e ver apenas esses findings.'}`,
    details: [
      { label: 'CVSS 3.1', value: info.cvss },
      { label: 'Bounty estimado', value: info.bounty },
      { label: 'Exemplos', value: info.examples },
      { label: 'Urgência', value: info.urgency },
      { label: 'Novos (não triados)', value: String(byStatus.new ?? 0) },
      { label: 'Aceitos', value: String(byStatus.accepted ?? 0) },
    ],
    actions: [
      count === 0
        ? 'Execute o recon nos seus targets para descobrir vulnerabilidades automaticamente.'
        : `Priorize estes ${count} finding${count !== 1 ? 's' : ''} — são os de maior impacto.`,
      'Clique neste box para filtrar a lista de bugs abaixo.',
      'Acesse Pipeline → Executar Todos para gerar relatório e submeter ao HackerOne.',
      info.urgency,
    ],
  }
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [allFindings, setAllFindings] = useState<FindingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sevFilter, setSevFilter] = useState<string | null>(null)
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null)

  // AI Reports log
  const [aiReports, setAiReports] = useState<AiReport[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const [dashRes, findingsRes, reportsRes] = await Promise.all([
        api.get('/dashboard'),
        api.get('/findings'),
        api.get('/reports'),
      ])
      setData(dashRes.data)
      setAllFindings(findingsRes.data)
      setAiReports(reportsRes.data ?? [])
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  // Realtime via SSE
  const rt = useRealtimeContext()

  useEffect(() => { load() }, [])

  // Sincroniza dados do heartbeat com o estado local
  useEffect(() => {
    if (!rt.heartbeat) return
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        total_findings: rt.heartbeat!.total_findings,
        active_jobs:    rt.heartbeat!.active_jobs,
        by_severity:    rt.heartbeat!.by_severity,
        by_status:      rt.heartbeat!.by_status,
        recent_jobs:    rt.heartbeat!.recent_jobs as unknown as JobItem[],
      }
    })
  }, [rt.heartbeat])

  // Adiciona novos findings ao topo
  useEffect(() => {
    if (rt.findingEvents.length === 0) return
    // Re-fetch findings quando há novos
    api.get('/findings').then(r => setAllFindings(r.data)).catch(() => {})
  }, [rt.findingEvents.length])

  const filtered = sevFilter
    ? allFindings.filter(f => f.severity === sevFilter)
    : allFindings

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-7">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Passe o mouse sobre qualquer card para ver informações de prioridade
          </p>
        </div>
        <button onClick={load} className="p-2 border border-border rounded-lg hover:bg-accent transition-colors">
          <RefreshCw size={14} className="text-muted-foreground" />
        </button>
      </div>

      {/* KPI Cards with Tooltips */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            type: 'bugs' as const,
            icon: <Bug size={15} className="text-red-400" />,
            bg: 'bg-red-500/10',
            label: 'Total Bugs',
            value: data?.total_findings ?? 0,
            href: '/findings',
            accent: 'hover:border-red-500/30',
          },
          {
            type: 'bounty' as const,
            icon: <DollarSign size={15} className="text-emerald-400" />,
            bg: 'bg-emerald-500/10',
            label: 'Bounty Ganho',
            value: `$${(data?.bounty_earned ?? 0).toLocaleString()}`,
            accent: 'hover:border-emerald-500/30',
          },
          {
            type: 'targets' as const,
            icon: <Crosshair size={15} className="text-blue-400" />,
            bg: 'bg-blue-500/10',
            label: 'Targets In-Scope',
            value: data?.targets_in_scope ?? 0,
            accent: 'hover:border-blue-500/30',
          },
          {
            type: 'jobs' as const,
            icon: <Zap size={15} className="text-yellow-400" />,
            bg: 'bg-yellow-500/10',
            label: 'Jobs Ativos',
            value: data?.active_jobs ?? 0,
            href: '/jobs',
            pulse: !!(data?.active_jobs),
            accent: 'hover:border-yellow-500/30',
          },
          {
            type: 'ready' as const,
            icon: <CheckCircle2 size={15} className="text-violet-400" />,
            bg: 'bg-violet-500/10',
            label: 'Prontos p/ Report',
            value: data?.ready_to_report?.length ?? 0,
            href: '/pipeline',
            accent: 'hover:border-violet-500/30',
          },
        ].map(card => (
          <Tooltip key={card.type} content={getKpiTooltip(card.type, data)}>
            <KpiCard {...card} />
          </Tooltip>
        ))}
      </div>

      {/* Severity Boxes with Tooltips */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Shield size={13} className="text-muted-foreground" />
            Bugs por Severidade
            <span className="text-[10px] text-muted-foreground font-normal">(passe o mouse para ver prioridade)</span>
          </h2>
          {sevFilter && (
            <button onClick={() => setSevFilter(null)} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              Limpar filtro ✕
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {SEVERITIES.map(sev => {
            const s = SEV[sev]
            const count = data?.by_severity?.[sev] ?? 0
            return (
              <Tooltip key={sev} content={getSeverityTooltip(sev, count, data)}>
                <button
                  onClick={() => setSevFilter(sevFilter === sev ? null : sev)}
                  className={cn(
                    'w-full p-3.5 rounded-xl border text-left transition-all group',
                    sevFilter === sev
                      ? `${s.bg} ${s.border}`
                      : 'bg-card border-border hover:border-border/60',
                    count === 0 && 'opacity-40'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={cn('w-2 h-2 rounded-full', s.dot)} />
                      <span className={cn('text-[10px] font-semibold uppercase tracking-wide', s.text)}>
                        {sev}
                      </span>
                    </div>
                    <Info size={10} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                  </div>
                  <p className={cn('text-2xl font-bold', s.text)}>{count}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {count === 1 ? 'finding' : 'findings'}
                  </p>
                </button>
              </Tooltip>
            )
          })}
        </div>
      </div>

      {/* Bug Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Activity size={13} className="text-muted-foreground" />
            {sevFilter
              ? `Bugs — ${sevFilter} (${filtered.length})`
              : `Todos os Bugs Capturados (${allFindings.length})`
            }
          </h2>
          <Link href="/findings" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Ver todos <ChevronRight size={12} />
          </Link>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground border border-dashed border-border rounded-xl">
            <Bug size={24} className="opacity-20" />
            <p className="text-sm">Nenhum bug encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filtered.slice(0, 12).map(f => (
              <BugCard key={f.id} finding={f} />
            ))}
          </div>
        )}

        {filtered.length > 12 && (
          <div className="text-center mt-3">
            <Link
              href="/findings"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:bg-accent transition-all"
            >
              Ver mais {filtered.length - 12} bugs <ChevronRight size={11} />
            </Link>
          </div>
        )}
      </div>

      {/* Bottom row: Priority Queue + Recent Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Priority Queue */}
        <Tooltip content={{
          title: 'Fila de Prioridade',
          priority: 'high',
          description: 'Findings com status "new" ou "triaging" ordenados por data de criação. São os bugs que ainda não foram avaliados ou estão em análise — precisam de atenção imediata para não perder janela de submissão.',
          details: [
            { label: 'Status incluídos', value: 'new, triaging' },
            { label: 'Limite exibido', value: '10 findings' },
            { label: 'Ordenação', value: 'mais recentes primeiro' },
          ],
          actions: [
            'Triage cada finding: mova para "accepted" se for válido e reproduzível.',
            'Mova para "duplicate" se já foi reportado por você ou outro pesquisador.',
            'Use o Pipeline para gerar relatórios e submeter os "accepted" ao H1.',
            'Findings parados em "new" por muito tempo podem ser perdidos para duplicatas.',
          ],
        }}>
          <div>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <AlertCircle size={13} className="text-red-400" />
              Fila de Prioridade
              <Info size={10} className="text-muted-foreground/40" />
            </h2>
            {(data?.priority_queue?.length ?? 0) === 0 ? (
              <div className="flex items-center justify-center h-20 rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                Sem bugs pendentes — ótimo trabalho!
              </div>
            ) : (
              <div className="space-y-1.5">
                {data?.priority_queue?.slice(0, 5).map(f => {
                  const s = SEV[f.severity] ?? SEV.informational
                  const st = STATUS_LABEL[f.status]
                  return (
                    <div key={f.id} className={cn('flex items-center gap-2.5 p-3 rounded-xl border', s.border, s.bg)}>
                      <div className={cn('w-2 h-2 rounded-full shrink-0', s.dot)} />
                      <p className="text-xs font-medium flex-1 truncate">{f.title}</p>
                      {st && (
                        <span className={cn('flex items-center gap-1 text-[10px] shrink-0', st.color)}>
                          {st.icon} {st.label}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Tooltip>

        {/* Recent Jobs */}
        <Tooltip content={{
          title: 'Jobs Recentes de Recon',
          priority: 'info',
          description: 'Últimas tarefas executadas pelo worker ARQ. Cada job roda uma ferramenta de reconhecimento em um target específico e pode criar findings automaticamente quando encontra vulnerabilidades.',
          details: [
            { label: 'Ferramentas', value: 'subfinder, httpx, gau, naabu, ffuf, dnsx' },
            { label: 'Auto-findings', value: 'recon, port_scan, dir_fuzz, idor, dns' },
            { label: 'Cron automático', value: 'a cada 15 minutos' },
            { label: 'Paralelo máx', value: '10 jobs' },
          ],
          actions: [
            'Jobs "running" estão ativamente varrendo seus targets agora.',
            'Jobs "failed" indicam erro — cheque os logs na página Jobs.',
            '"result_summary" mostra quantos hosts/subdomínios foram encontrados.',
            'Acesse Jobs para ver logs detalhados e cancelar jobs presos.',
          ],
        }}>
          <div>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Zap size={13} className="text-yellow-400" />
              Jobs Recentes
              <Info size={10} className="text-muted-foreground/40" />
            </h2>
            {(data?.recent_jobs?.length ?? 0) === 0 ? (
              <div className="flex items-center justify-center h-20 rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                Sem jobs recentes
              </div>
            ) : (
              <div className="space-y-1.5">
                {data?.recent_jobs?.slice(0, 5).map(j => (
                  <div key={j.id} className="flex items-center gap-2.5 p-3 rounded-xl bg-card border border-border">
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] font-medium',
                      j.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' :
                      j.status === 'running'   ? 'bg-blue-500/15 text-blue-400' :
                      j.status === 'failed'    ? 'bg-red-500/15 text-red-400' :
                                                 'bg-zinc-500/15 text-zinc-400'
                    )}>
                      {j.status}
                    </span>
                    <span className="text-xs font-medium flex-1">{TYPE_LABEL[j.type] ?? j.type}</span>
                    {j.result_summary && (
                      <span className="text-[10px] text-emerald-400">
                        {Object.entries(j.result_summary).map(([k, v]) => `${k}:${v}`).join(' ')}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(j.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Tooltip>
      </div>

      {/* ── AI Report Log + Service Console ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* AI Report Log */}
        <Tooltip content={{
          title: 'Log de Geração de Relatórios — IA',
          priority: 'info',
          description: 'Histórico de relatórios gerados pelo modelo Ollama (xploiter/the-xploiter) ou Claude como fallback. Cada entrada mostra qual finding foi processado, quantos tokens foram consumidos e o modelo usado.',
          details: [
            { label: 'Modelo primário', value: 'xploiter/the-xploiter (Ollama local)' },
            { label: 'Fallback', value: 'Claude Sonnet (Anthropic)' },
            { label: 'Geração via', value: 'Pipeline → Executar' },
            { label: 'Total gerados', value: String(aiReports.length) },
          ],
          actions: [
            'Relatórios são gerados automaticamente pelo Pipeline.',
            'Acesse Pipeline → Executar Todos para gerar para todos os findings aceitos.',
            'Relatórios pendentes (is_ready=false) ainda estão sendo processados.',
            'Clique em "Ver todos" para acessar a lista completa na página de relatórios.',
          ],
        }}>
          <div className="bg-card border border-border rounded-xl overflow-hidden geo-shadow">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <BrainCircuit size={14} className="text-violet-400" />
                <span className="text-sm font-semibold">Log da IA</span>
                <span className="text-[10px] text-muted-foreground">({aiReports.length} relatórios)</span>
                <Info size={10} className="text-muted-foreground/30" />
              </div>
              <Link href="/pipeline" className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                Ver Pipeline <ChevronRight size={10} />
              </Link>
            </div>

            {aiReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground p-4">
                <BrainCircuit size={24} className="opacity-20" />
                <p className="text-xs text-center">Nenhum relatório gerado ainda.<br />Execute o Pipeline para gerar com IA.</p>
              </div>
            ) : (
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {aiReports.slice(0, 10).map(r => {
                  const finding = allFindings.find(f => f.id === r.finding_id)
                  const totalTokens = (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0)
                  const isOllama = r.model_used?.includes('xploiter') || r.model_used?.includes('ollama') || (!r.model_used?.includes('claude'))
                  return (
                    <div key={r.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className={cn(
                        'w-2 h-2 rounded-full mt-1.5 shrink-0',
                        r.is_ready ? 'bg-emerald-400' : 'bg-yellow-400 animate-pulse'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate">
                          {finding?.title ?? `Finding ${r.finding_id.slice(-6)}`}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded font-medium',
                            isOllama
                              ? 'bg-violet-500/15 text-violet-400'
                              : 'bg-orange-500/15 text-orange-400'
                          )}>
                            {isOllama ? '🤖 Ollama' : '☁ Claude'}
                          </span>
                          {totalTokens > 0 && (
                            <span className="text-[10px] text-muted-foreground">{totalTokens.toLocaleString()} tokens</span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                      <span className={cn(
                        'text-[10px] font-semibold shrink-0 mt-1',
                        r.is_ready ? 'text-emerald-400' : 'text-yellow-400'
                      )}>
                        {r.is_ready ? 'Pronto' : 'Gerando…'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Tooltip>

        {/* Container Logs */}
        <ContainerLogs />

      </div>
      {/* ── fim AI + Console ─────────────────────────────────────────────── */}

      {/* ── Feed de Eventos em Tempo Real ────────────────────────────────── */}
      {(rt.findingEvents.length > 0 || rt.reconEvents.length > 0 || rt.pipelineEvents.length > 0) && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Radio size={13} className={cn('text-emerald-400', rt.connected && 'animate-pulse')} />
            Feed de Eventos
            <span className="text-[10px] text-muted-foreground font-normal">(tempo real — SSE)</span>
          </h2>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {[
              ...rt.findingEvents.map(e => ({
                key: `f-${e.finding_id}`,
                ts: e.timestamp,
                icon: <Bug size={10} className="text-red-400 shrink-0" />,
                bg: 'bg-red-500/5 border-red-500/20',
                label: `[Finding] ${e.title}`,
                badge: e.severity,
                badgeCls: 'bg-red-500/15 text-red-400',
              })),
              ...rt.pipelineEvents.map(e => ({
                key: `p-${e.job_id}-${e.step}`,
                ts: e.timestamp,
                icon: <BrainCircuit size={10} className="text-violet-400 shrink-0" />,
                bg: 'bg-violet-500/5 border-violet-500/20',
                label: `[Pipeline] ${e.message}`,
                badge: e.step,
                badgeCls: 'bg-violet-500/15 text-violet-400',
              })),
              ...rt.reconEvents.map(e => ({
                key: `r-${e.target}-${e.timestamp}`,
                ts: e.timestamp,
                icon: <Zap size={10} className="text-yellow-400 shrink-0" />,
                bg: 'bg-yellow-500/5 border-yellow-500/20',
                label: `[Recon] ${e.target} — ${e.subdomains} subs, ${e.hosts} hosts, ${e.urls} URLs`,
                badge: 'done',
                badgeCls: 'bg-yellow-500/15 text-yellow-400',
              })),
            ]
              .sort((a, b) => b.ts - a.ts)
              .slice(0, 20)
              .map(ev => (
                <div key={ev.key} className={cn('flex items-center gap-2.5 px-3 py-2 rounded-xl border text-[11px]', ev.bg)}>
                  {ev.icon}
                  <span className="flex-1 truncate text-muted-foreground">{ev.label}</span>
                  <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0', ev.badgeCls)}>
                    {ev.badge}
                  </span>
                  <span className="text-[9px] text-muted-foreground/50 shrink-0">
                    {new Date(ev.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              ))
            }
          </div>
        </div>
      )}

    </div>
  )
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  icon, bg, label, value, href, pulse, accent
}: {
  icon: React.ReactNode
  bg: string
  label: string
  value: string | number
  href?: string
  pulse?: boolean
  accent?: string
}) {
  const inner = (
    <div className={cn(
      'p-4 rounded-xl bg-card border border-border transition-all h-full cursor-default',
      accent ?? 'hover:border-border/60'
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', bg)}>
          <span className={pulse ? 'animate-pulse' : ''}>{icon}</span>
        </div>
        <Info size={11} className="text-muted-foreground/30 mt-0.5" />
      </div>
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
    </div>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return inner
}

// ── Bug Card ───────────────────────────────────────────────────────────────

function BugCard({ finding: f }: { finding: FindingItem }) {
  const sev = SEV[f.severity] ?? SEV.informational
  const st = STATUS_LABEL[f.status]

  const tooltipContent: TooltipContent = {
    title: f.title,
    priority: f.severity as TooltipContent['priority'],
    description: f.description
      ? f.description.slice(0, 200) + (f.description.length > 200 ? '...' : '')
      : 'Sem descrição preenchida.',
    details: [
      { label: 'Severidade', value: f.severity.toUpperCase() },
      { label: 'Status', value: STATUS_LABEL[f.status]?.label ?? f.status },
      { label: 'Tipo', value: f.type?.replace('_', ' ').toUpperCase() ?? '—' },
      { label: 'CVSS', value: f.cvss_score != null ? f.cvss_score.toFixed(1) : 'Não calculado' },
      { label: 'URL', value: f.affected_url ? f.affected_url.slice(0, 40) + (f.affected_url.length > 40 ? '...' : '') : '—' },
      { label: 'Bounty', value: f.bounty_amount ? `$${f.bounty_amount.toLocaleString()}` : 'Não recebido' },
    ],
    actions: f.impact
      ? [
          `Impacto: ${f.impact.slice(0, 120)}${f.impact.length > 120 ? '...' : ''}`,
          f.status === 'accepted' ? 'Este finding está aceito — execute o Pipeline para gerar o relatório e submeter ao H1.' : `Status atual: ${STATUS_LABEL[f.status]?.label ?? f.status}. Mova para "accepted" quando confirmar a vulnerabilidade.`,
          f.steps_to_reproduce ? `Reprodução: ${f.steps_to_reproduce.slice(0, 100)}...` : 'Preencha os passos para reprodução para aumentar o score de prontidão.',
        ]
      : [
          'Preencha o campo "Impacto" para aumentar o score de prontidão.',
          f.status === 'accepted' ? 'Pronto para o Pipeline — execute para gerar relatório com IA.' : `Mova para "accepted" após confirmar a vulnerabilidade.`,
        ],
  }

  return (
    <Tooltip content={tooltipContent}>
      <div className={cn('rounded-xl border p-4 space-y-3 transition-all hover:shadow-sm cursor-default', sev.border)}>
        {/* Row 1: severity + status + title */}
        <div className="flex items-start gap-2.5">
          <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 mt-0.5', sev.bg, sev.text)}>
            {f.severity}
          </span>
          <p className="text-sm font-semibold leading-snug flex-1">{f.title}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            {st && (
              <span className={cn('flex items-center gap-1 text-[10px] font-medium', st.color)}>
                {st.icon} {st.label}
              </span>
            )}
            <Info size={10} className="text-muted-foreground/30" />
          </div>
        </div>

        {/* Report fields */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <ReportField label="Tipo" value={f.type?.replace('_', ' ').toUpperCase()} />
          <ReportField
            label="CVSS"
            value={f.cvss_score != null ? f.cvss_score.toFixed(1) : '—'}
            valueClass={
              f.cvss_score == null ? '' :
              f.cvss_score >= 9 ? 'text-red-400 font-bold' :
              f.cvss_score >= 7 ? 'text-orange-400 font-bold' :
              f.cvss_score >= 4 ? 'text-yellow-400' : 'text-blue-400'
            }
          />
          {f.affected_url && (
            <div className="col-span-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">URL Afetada</p>
              <a
                href={f.affected_url.startsWith('http') ? f.affected_url : `https://${f.affected_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors truncate"
              >
                <ExternalLink size={9} className="shrink-0" />
                <span className="truncate">{f.affected_url}</span>
              </a>
            </div>
          )}
          {f.impact && (
            <div className="col-span-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Impacto</p>
              <p className="text-[11px] text-foreground leading-relaxed line-clamp-2">{f.impact}</p>
            </div>
          )}
          {f.steps_to_reproduce && (
            <div className="col-span-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Passos</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{f.steps_to_reproduce}</p>
            </div>
          )}
          {f.bounty_amount != null && f.bounty_amount > 0 && (
            <ReportField label="Bounty" value={`$${f.bounty_amount.toLocaleString()}`} valueClass="text-emerald-400 font-bold" />
          )}
        </div>
      </div>
    </Tooltip>
  )
}

function ReportField({ label, value, valueClass }: { label: string; value?: string | null; valueClass?: string }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className={cn('text-[11px] font-medium capitalize', valueClass ?? 'text-foreground')}>{value}</p>
    </div>
  )
}
