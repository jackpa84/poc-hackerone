'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Bug, DollarSign, Zap, RefreshCw,
  AlertCircle, ExternalLink, ChevronRight, ChevronDown, Clock, CheckCircle2, XCircle,
  Info, Shield, Crosshair, Activity,
  BrainCircuit, Radio, Terminal, X, Send, FileText, Loader2,
  Globe2, Network, Key, Search, Link2, Layers, TrendingUp, Briefcase, ArrowRight,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { SkeletonCard, SkeletonKPI, Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { useRealtimeContext } from '@/contexts/RealtimeContext'
import { DashLearningSection } from '@/components/dashboard/LearningSection'

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

interface H1Report {
  id: string
  type: string
  attributes: {
    title: string
    state: string
    severity_rating: string
    created_at: string
    team_handle?: string
    bounty_amount?: string
  }
}

interface H1LogEntry {
  id: string
  action: string
  status: string
  detail: string
  error: string | null
  duration_ms: number | null
  created_at: string
}

interface AnalysisCheck {
  key: string
  label: string
  ok: boolean
  points: number
  tip: string
}

interface AnalysisResult {
  finding_id: string
  finding_title: string
  finding_severity: string
  score: number
  verdict: string
  verdict_level: 'green' | 'yellow' | 'orange' | 'red'
  checks: AnalysisCheck[]
  missing: AnalysisCheck[]
  missing_count: number
  report_id: string | null
  report_preview: string | null
  ai_error: string | null
  ready_to_submit: boolean
  team_handle: string | null
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

  // Rolagem automática desativada ao carregar a página — usuário mantém posição
  // useEffect(() => { if (loaded) bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines, loaded])

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

// ── Main Component ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData]               = useState<DashboardData | null>(null)
  const [allFindings, setAllFindings] = useState<FindingItem[]>([])
  const [h1Reports, setH1Reports]     = useState<H1Report[]>([])
  const [loading, setLoading]         = useState(true)
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null)
  const rt = useRealtimeContext()

  const load = async () => {
    setLoading(true)
    try {
      const [dashRes, findingsRes] = await Promise.all([
        api.get('/dashboard'),
        api.get('/findings'),
      ])
      setData(dashRes.data)
      setAllFindings(findingsRes.data)
      try {
        const h1Res = await api.get('/hackerone/inbox?size=8')
        setH1Reports(h1Res.data?.data ?? [])
      } catch { /* sem credenciais H1 */ }
    } catch { setData(null) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!rt.heartbeat) return
    setData(prev => prev ? {
      ...prev,
      total_findings: rt.heartbeat!.total_findings,
      active_jobs:    rt.heartbeat!.active_jobs,
      by_severity:    rt.heartbeat!.by_severity,
      by_status:      rt.heartbeat!.by_status,
      recent_jobs:    rt.heartbeat!.recent_jobs as unknown as JobItem[],
    } : prev)
  }, [rt.heartbeat])

  useEffect(() => {
    if (rt.findingEvents.length === 0) return
    api.get('/findings').then(r => setAllFindings(r.data)).catch(() => {})
  }, [rt.findingEvents.length])

  // Derived
  const bySev      = data?.by_severity ?? {}
  const sevKeys    = ['critical', 'high', 'medium', 'low', 'informational']
  const totalBySev = sevKeys.reduce((s, k) => s + (bySev[k] ?? 0), 0)
  const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 }

  const priorityFindings = [...allFindings]
    .filter(f => f.status === 'new' || f.status === 'triaging')
    .sort((a, b) => (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4))
    .slice(0, 8)

  const readyToReport = allFindings.filter(f => f.status === 'accepted')
  const recentJobs    = data?.recent_jobs ?? []
  const activeJobs    = recentJobs.filter(j => j.status === 'running' || j.status === 'pending')
  const doneJobs      = recentJobs.filter(j => j.status === 'completed' || j.status === 'failed').slice(0, 4)

  const critHigh   = (bySev.critical ?? 0) + (bySev.high ?? 0)
  const inScope    = data?.targets_in_scope ?? 0
  const readyCount = readyToReport.length
  const submittedCount = data?.by_status?.resolved ?? 0
  const reportsReadyCount = rt.heartbeat?.total_reports_ready ?? rt.heartbeat?.total_reports ?? 0

  if (loading) return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonKPI key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        <div className="lg:col-span-2 space-y-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <button onClick={load} className="p-2 border border-border rounded-lg hover:bg-accent transition-colors">
          <RefreshCw size={14} className="text-muted-foreground" />
        </button>
      </div>

      {/* ── KPI Strip ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <DashKpi icon={<Bug size={18} />}          bg="bg-red-500/10"    color="text-red-400"    label="Total Bugs"       value={data?.total_findings ?? 0}                         href="/findings" />
        <DashKpi icon={<DollarSign size={18} />}   bg="bg-emerald-500/10" color="text-emerald-400" label="Bounty Ganho"    value={`$${(data?.bounty_earned ?? 0).toLocaleString()}`} />
        <DashKpi icon={<Crosshair size={18} />}    bg="bg-blue-500/10"   color="text-blue-400"   label="In-Scope"         value={data?.targets_in_scope ?? 0} />
        <DashKpi icon={<Zap size={18} />}          bg="bg-yellow-500/10" color="text-yellow-400" label="Jobs Ativos"      value={data?.active_jobs ?? 0}                            href="/jobs"     pulse={!!(data?.active_jobs)} />
        <DashKpi icon={<BrainCircuit size={18} />} bg="bg-violet-500/10" color="text-violet-400" label="Relatórios IA"    value={rt.heartbeat?.total_reports_ready ?? rt.heartbeat?.total_reports ?? 0} href="/pipeline" accent={((rt.heartbeat?.total_reports_ready ?? rt.heartbeat?.total_reports ?? 0) > 0)} />
        <DashKpi icon={<CheckCircle2 size={18} />} bg="bg-violet-500/10" color="text-violet-400" label="Prontos p/ Report" value={readyCount}                                     href="/pipeline" accent={readyCount > 0} />
      </div>

      {/* ── Barra de progresso (contagem regressiva para envio) ────────────── */}
      <DashReportProgressBar
        totalFindings={data?.total_findings ?? 0}
        acceptedCount={readyCount}
        reportsReadyCount={reportsReadyCount}
        submittedCount={submittedCount}
      />

      {/* ── Severity + Status (gráficos) ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
            <Shield size={16} /> Findings por severidade
          </h2>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={SEV_BAR_CFG.map(({ key, label }) => ({ name: label, count: bySev[key] ?? 0 }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 13 }} stroke="#71717a" />
                <YAxis tick={{ fontSize: 13 }} stroke="#71717a" allowDecimals={false} />
                <RechartsTooltip contentStyle={{ fontSize: 13, background: '#18181b', border: '1px solid #27272a' }} formatter={(v: number) => [v, 'Findings']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {SEV_BAR_CFG.map((_, i) => (
                    <Cell key={i} fill={['#ef4444', '#f97316', '#eab308', '#3b82f6', '#71717a'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-border p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
            <Activity size={16} /> Findings por status
          </h2>
          <div className="h-[220px]">
            {Object.keys(data?.by_status ?? {}).length === 0 ? (
              <div className="flex items-center justify-center h-full text-zinc-500 text-sm">Nenhum finding ainda</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={Object.entries(data?.by_status ?? {}).map(([name, count]) => ({ name: name === 'new' ? 'Novo' : name === 'triaging' ? 'Triagem' : name === 'accepted' ? 'Aceito' : name === 'resolved' ? 'Resolvido' : name, count }))}
                    cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                    paddingAngle={2} dataKey="count" nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {Object.entries(data?.by_status ?? {}).map((_, i) => (
                      <Cell key={i} fill={['#3b82f6', '#eab308', '#22c55e', '#a855f7', '#71717a'][i % 5]} />
                    ))}
                  </Pie>
<RechartsTooltip contentStyle={{ fontSize: 13, background: '#18181b', border: '1px solid #27272a' }} formatter={(v: number) => [v, 'Findings']} />
                <Legend fontSize={13} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Severity Breakdown (barra compacta) ────────────────────────────── */}
      <DashSeverityBar bySev={bySev} total={totalBySev} />

      {/* ── Main 2-col Grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3">
          <DashPriorityQueue findings={priorityFindings} onSelect={setSelectedFinding} />
        </div>
        <div className="lg:col-span-2 space-y-4">
          <DashReadyToReport findings={readyToReport.slice(0, 5)} />
          <DashJobsFeed jobs={[...activeJobs, ...doneJobs].slice(0, 6)} />
        </div>
      </div>

      {/* ── Painel de Monitoramento em Tempo Real ─────────────────────────── */}
      <DashMonitor rt={rt} />

      {/* ── Saúde dos Pods / Containers ──────────────────────────────────── */}
      <DashPodHealth rt={rt} />

      {/* ── Bottom Row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashH1Inbox reports={h1Reports} />
        <SystemActivityLog rt={rt} recentJobs={recentJobs} />
      </div>

      {/* ── Seção educativa ──────────────────────────────────────────────── */}
      <DashLearningSection bySev={bySev} byStatus={data?.by_status ?? {}} totalFindings={data?.total_findings ?? 0} />

      {selectedFinding && (
        <ReportDrawer finding={selectedFinding} onClose={() => setSelectedFinding(null)} />
      )}
    </div>
  )
}

// ── KPI Tooltip definitions (legacy, unused) ───────────────────────────────

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

// ── Old DashboardPage removed — new version above ──────────────────────────

function _OldDashboardPage_Removed() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [allFindings, setAllFindings] = useState<FindingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sevFilter, setSevFilter] = useState<string | null>(null)
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null)
  const [aiReports, setAiReports] = useState<AiReport[]>([])
  const [h1Reports, setH1Reports] = useState<H1Report[]>([])
  const [h1Logs, setH1Logs] = useState<H1LogEntry[]>([])

  // AI Analysis panel
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [analysisFindingId, setAnalysisFindingId] = useState<string>('')

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

      // HackerOne inbox + logs (silently ignore if no credentials)
      try {
        const [h1Res, h1LogsRes] = await Promise.all([
          api.get('/hackerone/reports?size=10'),
          api.get('/hackerone/logs?size=15'),
        ])
        setH1Reports(h1Res.data?.data ?? [])
        setH1Logs(h1LogsRes.data?.data ?? [])
      } catch { /* credenciais não configuradas — silencioso */ }
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
      <div className="space-y-7">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-72" />
          </div>
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonKPI key={i} />)}
        </div>
        {/* Severity boxes */}
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl border border-border animate-pulse bg-muted/40" />
          ))}
        </div>
        {/* Two columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28 mb-3" />
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24 mb-3" />
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-7">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Visão geral do seu programa de bug bounty — recon, findings, pipeline e submissões ao HackerOne.
          </p>
        </div>
        <button onClick={load} className="p-2 border border-border rounded-lg hover:bg-accent transition-colors" title="Atualizar dados">
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
            hovColor: 'hov-red',
            description: 'Vulnerabilidades encontradas pelo recon automático e inseridas manualmente.',
          },
          {
            type: 'bounty' as const,
            icon: <DollarSign size={15} className="text-emerald-400" />,
            bg: 'bg-emerald-500/10',
            label: 'Bounty Ganho',
            value: `$${(data?.bounty_earned ?? 0).toLocaleString()}`,
            hovColor: 'hov-emerald',
            description: 'Soma dos bounties pagos pelos programas. Atualizado via campo bounty_amount.',
          },
          {
            type: 'targets' as const,
            icon: <Crosshair size={15} className="text-blue-400" />,
            bg: 'bg-blue-500/10',
            label: 'Targets In-Scope',
            value: data?.targets_in_scope ?? 0,
            hovColor: 'hov-cyan',
            description: 'Domínios e wildcards habilitados no auto-scanner (recon a cada 15 min).',
          },
          {
            type: 'jobs' as const,
            icon: <Zap size={15} className="text-yellow-400" />,
            bg: 'bg-yellow-500/10',
            label: 'Jobs Ativos',
            value: data?.active_jobs ?? 0,
            href: '/jobs',
            pulse: !!(data?.active_jobs),
            hovColor: 'hov-yellow',
            description: 'Tarefas de recon rodando agora: subfinder, httpx, naabu, ffuf, dnsx.',
          },
          {
            type: 'ready' as const,
            icon: <CheckCircle2 size={15} className="text-violet-400" />,
            bg: 'bg-violet-500/10',
            label: 'Prontos p/ Report',
            value: data?.ready_to_report?.length ?? 0,
            href: '/pipeline',
            hovColor: 'hov-violet',
            description: 'Findings aceitos com score ≥ 70% — prontos para gerar relatório com IA.',
          },
        ].map(card => (
          <Tooltip key={card.type} content={getKpiTooltip(card.type, data)}>
            <KpiCard {...card} accent={undefined} />
          </Tooltip>
        ))}
      </div>

      {/* ── Próxima Ação ─────────────────────────────────────────────────── */}
      {data && (() => {
        const critHigh = (data.by_severity?.critical ?? 0) + (data.by_severity?.high ?? 0)
        const ready = data.ready_to_report?.length ?? 0
        const inScope = data.targets_in_scope ?? 0
        if (inScope === 0) return (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-blue-500/25 bg-blue-500/5 text-[12px]">
            <Crosshair size={14} className="text-blue-400 shrink-0" />
            <span className="text-muted-foreground"><strong className="text-blue-400">Nenhum target in-scope.</strong> Adicione domínios ou wildcards na página <Link href="/programs" className="underline text-blue-400">Programs</Link> para o auto-scanner começar o recon.</span>
          </div>
        )
        if (ready > 0) return (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-violet-500/25 bg-violet-500/5 text-[12px]">
            <CheckCircle2 size={14} className="text-violet-400 shrink-0" />
            <span className="text-muted-foreground"><strong className="text-violet-400">{ready} finding{ready !== 1 ? 's' : ''} prontos para relatório.</strong> Acesse o <Link href="/pipeline" className="underline text-violet-400">Pipeline</Link> para gerar o draft com IA e submeter ao HackerOne.</span>
          </div>
        )
        if (critHigh > 0) return (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-orange-500/25 bg-orange-500/5 text-[12px]">
            <AlertCircle size={14} className="text-orange-400 shrink-0" />
            <span className="text-muted-foreground"><strong className="text-orange-400">{critHigh} finding{critHigh !== 1 ? 's' : ''} Critical/High</strong> aguardando triagem. Valide e mova para &quot;accepted&quot; na página <Link href="/findings" className="underline text-orange-400">Findings</Link>.</span>
          </div>
        )
        return null
      })()}

      {/* ── Linha 1: Tipos de Vulnerabilidade ────────────────────────────── */}
      <VulnTypeRow findings={allFindings} />

      {/* ── Linha 2: Status de Envio ao HackerOne ────────────────────────── */}
      <H1SubmissionRow findings={allFindings} aiReports={aiReports} />

      {/* Severity Boxes with Tooltips */}
      <div>
        <div className="mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Shield size={13} className="text-muted-foreground" />
            Bugs por Severidade
            <span className="text-[10px] text-muted-foreground font-normal">(clique para filtrar)</span>
          </h2>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            Distribuição das vulnerabilidades por nível CVSS 3.1. Passe o mouse para ver bounty estimado e exemplos de cada tipo.
          </p>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {SEVERITIES.map(sev => {
            const s = SEV[sev]
            const count = data?.by_severity?.[sev] ?? 0
            return (
              <Tooltip key={sev} content={getSeverityTooltip(sev, count, data)}>
                <button
                  onClick={() => setSevFilter(sevFilter === sev ? null : sev)}
                  className={cn(
                    'w-full p-2.5 rounded-xl border text-center transition-all group',
                    sevFilter === sev
                      ? `${s.bg} ${s.border}`
                      : 'bg-card border-border hover:border-border/60',
                    count === 0 && 'opacity-40'
                  )}
                >
                  <div className={cn('w-2 h-2 rounded-full mx-auto mb-1.5', s.dot)} />
                  <p className={cn('text-lg font-bold leading-none tabular-nums', s.text)}>{count}</p>
                  <p className={cn('text-[9px] font-semibold uppercase mt-1', s.text)}>{sev.slice(0,4)}</p>
                  <p className="text-[8px] text-muted-foreground/40 mt-0.5 tabular-nums">
                    {sev === 'critical' ? 'CVSS 9–10' : sev === 'high' ? 'CVSS 7–9' : sev === 'medium' ? 'CVSS 4–7' : sev === 'low' ? 'CVSS 0–4' : 'Info'}
                  </p>
                </button>
              </Tooltip>
            )
          })}
        </div>
      </div>


      {/* ── Análise da IA ───────────────────────────────────────────────── */}
      <AiAnalysisPanel
        findings={allFindings}
        analyzing={analyzing}
        result={analysisResult}
        findingId={analysisFindingId}
        onFindingChange={setAnalysisFindingId}
        onAnalyze={async () => {
          if (!analysisFindingId) return
          setAnalyzing(true)
          setAnalysisResult(null)
          try {
            const { data: res } = await api.post('/pipeline/analyze', { finding_id: analysisFindingId })
            setAnalysisResult(res)
          } catch (e: unknown) {
            const msg = (e as {response?: {data?: {detail?: string}}})?.response?.data?.detail ?? 'Erro na análise'
            setAnalysisResult(null)
            alert(msg)
          } finally {
            setAnalyzing(false)
          }
        }}
        onSubmit={async () => {
          if (!analysisResult?.finding_id) return
          setAnalyzing(true)
          try {
            await api.post('/pipeline/run', { finding_id: analysisResult.finding_id, team_handle: analysisResult.team_handle })
            alert('Pipeline enfileirado! Acompanhe na página Pipeline.')
          } catch {}
          setAnalyzing(false)
        }}
        onTestSubmit={async () => {
          if (!analysisResult?.finding_id) return
          setAnalyzing(true)
          try {
            const { data: res } = await api.post('/pipeline/test-submit', { finding_id: analysisResult.finding_id })
            alert(`${res.message}\n\nURL: ${res.h1_url}\n\n⚠ Enviado ao sandbox @security-test-sandbox — sem efeito em bounty ou reputação.`)
          } catch (e: unknown) {
            const msg = (e as {response?: {data?: {detail?: string}}})?.response?.data?.detail ?? 'Erro no teste'
            alert(`Erro: ${msg}`)
          }
          setAnalyzing(false)
        }}
      />

      {/* ── Caixa de Entrada H1 + Log H1 ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Caixa de Entrada HackerOne */}
        <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col" style={{ background: '#0a0a0f', borderColor: 'rgba(249,115,22,0.18)' }}>
          <div className="px-4 py-3 border-b shrink-0 flex items-center justify-between" style={{ borderColor: 'rgba(249,115,22,0.12)', background: 'rgba(249,115,22,0.04)' }}>
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-orange-400" />
              <span className="text-sm font-semibold">Caixa de Entrada</span>
              <span className="text-[10px] text-zinc-600">HackerOne</span>
            </div>
            <Link href="/pipeline" className="text-[10px] text-orange-400/60 hover:text-orange-400 transition-colors flex items-center gap-1">
              Pipeline <ChevronRight size={10} />
            </Link>
          </div>
          {h1Reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2 py-8 text-muted-foreground">
              <Shield size={22} className="opacity-15" />
              <p className="text-xs text-center">Sem reports ou credenciais H1 não configuradas.</p>
            </div>
          ) : (
            <div className="divide-y overflow-y-auto flex-1" style={{ borderColor: 'rgba(255,255,255,0.04)', maxHeight: '280px' }}>
              {h1Reports.map(r => {
                const state = r.attributes.state
                const stateColor = state === 'resolved' ? 'text-emerald-400' : state === 'triaged' ? 'text-blue-400' : state === 'new' ? 'text-yellow-400' : 'text-zinc-400'
                const sevColor: Record<string, string> = { critical: 'text-red-400', high: 'text-orange-400', medium: 'text-yellow-400', low: 'text-blue-400' }
                return (
                  <div key={r.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-orange-500/[0.03] transition-colors">
                    <div className={cn('w-1.5 h-1.5 rounded-full mt-2 shrink-0', state === 'resolved' ? 'bg-emerald-400' : state === 'triaged' ? 'bg-blue-400' : 'bg-yellow-400')} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate">{r.attributes.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={cn('text-[10px] font-semibold capitalize', stateColor)}>{state}</span>
                        {r.attributes.severity_rating && r.attributes.severity_rating !== 'none' && (
                          <span className={cn('text-[10px] font-bold uppercase', sevColor[r.attributes.severity_rating] ?? 'text-zinc-400')}>{r.attributes.severity_rating}</span>
                        )}
                        <span className="text-[10px] text-zinc-600">
                          {new Date(r.attributes.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>
                    <a href={`https://hackerone.com/reports/${r.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0 mt-1">
                      <ExternalLink size={10} className="text-zinc-600 hover:text-orange-400 transition-colors" />
                    </a>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Log da HackerOne */}
        <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col" style={{ background: '#0a0a0f', borderColor: 'rgba(249,115,22,0.18)' }}>
          <div className="px-4 py-3 border-b shrink-0 flex items-center justify-between" style={{ borderColor: 'rgba(249,115,22,0.12)', background: 'rgba(249,115,22,0.04)' }}>
            <div className="flex items-center gap-2">
              <Radio size={14} className="text-orange-400" />
              <span className="text-sm font-semibold">Log HackerOne</span>
              <span className="text-[10px] text-zinc-600">ações da API</span>
            </div>
            <span className="text-[10px] text-zinc-600">{h1Logs.length} entradas</span>
          </div>
          {h1Logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2 py-8 text-muted-foreground">
              <Radio size={22} className="opacity-15" />
              <p className="text-xs text-center">Sem logs. A API HackerOne registra<br />ações de sync e submissão aqui.</p>
            </div>
          ) : (
            <div className="divide-y overflow-y-auto flex-1" style={{ borderColor: 'rgba(255,255,255,0.04)', maxHeight: '280px' }}>
              {h1Logs.map(l => {
                const isErr = l.status === 'error'
                const ACTION_LABEL: Record<string, string> = {
                  sync: 'Sync', submit_report: 'Submissão', list_programs: 'Programas',
                  list_reports: 'Reports', get_earnings: 'Earnings', hacktivity: 'Hacktivity',
                }
                return (
                  <div key={l.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-orange-500/[0.03] transition-colors">
                    <div className={cn('w-1.5 h-1.5 rounded-full mt-2 shrink-0', isErr ? 'bg-red-400' : 'bg-emerald-400')} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', isErr ? 'bg-red-500/10 text-red-400' : 'bg-orange-500/10 text-orange-400')}>
                          {ACTION_LABEL[l.action] ?? l.action}
                        </span>
                        {l.duration_ms != null && (
                          <span className="text-[10px] text-zinc-600">{l.duration_ms}ms</span>
                        )}
                      </div>
                      <p className={cn('text-[11px] mt-0.5 truncate', isErr ? 'text-red-400/80' : 'text-zinc-400')}>
                        {isErr ? (l.error ?? l.detail) : l.detail}
                      </p>
                    </div>
                    <span className="text-[9px] text-zinc-700 shrink-0 mt-1">
                      {new Date(l.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {/* ── AI Report Log + Log do Sistema lado a lado ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* AI Report Log */}
        <Tooltip content={{
          title: 'Log de Geração de Relatórios — IA',
          priority: 'info',
          description: 'Histórico de relatórios gerados pelo modelo Ollama (xploiter/the-xploiter) ou Claude como fallback.',
          details: [
            { label: 'Modelo primário', value: 'xploiter/the-xploiter (Ollama local)' },
            { label: 'Fallback', value: 'Claude Sonnet (Anthropic)' },
            { label: 'Total gerados', value: String(aiReports.length) },
          ],
          actions: [
            'Relatórios são gerados automaticamente pelo Pipeline.',
            'Acesse Pipeline → Executar Todos para gerar para todos os findings aceitos.',
          ],
        }}>
          <div className="bg-card border border-border rounded-xl overflow-hidden geo-shadow h-full flex flex-col">
            <div className="px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrainCircuit size={14} className="text-violet-400" />
                  <span className="text-sm font-semibold">Log da IA</span>
                  <span className="text-[10px] text-muted-foreground">({aiReports.length} relatórios)</span>
                </div>
                <Link href="/pipeline" className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                  Ver Pipeline <ChevronRight size={10} />
                </Link>
              </div>
              <p className="text-[11px] text-muted-foreground/50 mt-1">
                Ollama (primário) ou Claude (fallback). Ponto verde = pronto para H1.
              </p>
            </div>
            {aiReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground p-4">
                <BrainCircuit size={24} className="opacity-20" />
                <p className="text-xs text-center">Nenhum relatório gerado ainda.<br />Execute o Pipeline para gerar com IA.</p>
              </div>
            ) : (
              <div className="divide-y divide-border overflow-y-auto flex-1" style={{ maxHeight: '320px' }}>
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
                            isOllama ? 'bg-violet-500/15 text-violet-400' : 'bg-orange-500/15 text-orange-400'
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
                      <span className={cn('text-[10px] font-semibold shrink-0 mt-1', r.is_ready ? 'text-emerald-400' : 'text-yellow-400')}>
                        {r.is_ready ? 'Pronto' : 'Gerando…'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Tooltip>

        {/* Log do Sistema */}
        <SystemActivityLog rt={rt} recentJobs={data?.recent_jobs ?? []} />

      </div>

      {selectedFinding && (
        <ReportDrawer finding={selectedFinding} onClose={() => setSelectedFinding(null)} />
      )}
    </div>
  )
}

// ── AI Analysis Panel ──────────────────────────────────────────────────────

const VERDICT_STYLE: Record<string, { border: string; bg: string; text: string; bar: string }> = {
  green:  { border: 'border-emerald-500/30', bg: 'bg-emerald-500/8',  text: 'text-emerald-400', bar: 'bg-emerald-500' },
  yellow: { border: 'border-yellow-500/30',  bg: 'bg-yellow-500/8',   text: 'text-yellow-400',  bar: 'bg-yellow-500' },
  orange: { border: 'border-orange-500/30',  bg: 'bg-orange-500/8',   text: 'text-orange-400',  bar: 'bg-orange-500' },
  red:    { border: 'border-red-500/30',      bg: 'bg-red-500/8',      text: 'text-red-400',     bar: 'bg-red-500' },
}

function AiAnalysisPanel({
  findings, analyzing, result, findingId,
  onFindingChange, onAnalyze, onSubmit, onTestSubmit,
}: {
  findings: FindingItem[]
  analyzing: boolean
  result: AnalysisResult | null
  findingId: string
  onFindingChange: (id: string) => void
  onAnalyze: () => void
  onSubmit: () => void
  onTestSubmit: () => void
}) {
  const vs = result ? (VERDICT_STYLE[result.verdict_level] ?? VERDICT_STYLE.red) : null
  const accepted = findings.filter(f => f.status === 'accepted')

  return (
    <div className="rounded-xl border border-violet-500/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-violet-500/8 border-b border-violet-500/20">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-violet-500/15">
            <BrainCircuit size={15} className="text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold">Análise da IA — Averiguação antes do H1</p>
            <p className="text-[11px] text-muted-foreground">
              A IA verifica o finding, gera o relatório e avalia se está pronto para submissão
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Seletor de finding */}
          <select
            value={findingId}
            onChange={e => onFindingChange(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-violet-500/60 min-w-[220px]"
          >
            <option value="">Selecione um finding...</option>
            {findings.map(f => (
              <option key={f.id} value={f.id}>
                [{f.severity.toUpperCase()}] {f.title.slice(0, 50)}{f.title.length > 50 ? '...' : ''}
              </option>
            ))}
          </select>

          <button
            onClick={onAnalyze}
            disabled={analyzing || !findingId}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500/20 border border-violet-500/30 rounded-lg text-sm text-violet-300 font-medium hover:bg-violet-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {analyzing
              ? <><Loader2 size={13} className="animate-spin" /> Analisando...</>
              : <><BrainCircuit size={13} /> Analisar com IA</>
            }
          </button>
        </div>
      </div>

      {/* Resultado */}
      {result && vs && (
        <div className="p-4 space-y-4">

          {/* Score + Veredicto */}
          <div className={cn('flex items-center gap-4 p-3.5 rounded-xl border', vs.border, vs.bg)}>
            <div className="relative w-14 h-14 shrink-0">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="22" fill="none" stroke="currentColor" strokeWidth="4" className="text-white/10" />
                <circle cx="28" cy="28" r="22" fill="none" strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 22}`}
                  strokeDashoffset={`${2 * Math.PI * 22 * (1 - result.score / 100)}`}
                  strokeLinecap="round"
                  className={cn('transition-all duration-700', vs.text)}
                  stroke="currentColor"
                />
              </svg>
              <span className={cn('absolute inset-0 flex items-center justify-center text-sm font-bold', vs.text)}>
                {result.score}%
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-bold', vs.text)}>{result.verdict}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {result.finding_title} — <span className="capitalize">{result.finding_severity}</span>
              </p>
              {result.missing_count > 0 && (
                <p className="text-[11px] text-orange-400 mt-1">
                  {result.missing_count} critério{result.missing_count !== 1 ? 's' : ''} faltando
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {/* Botão de teste — sempre disponível */}
              <button
                onClick={onTestSubmit}
                disabled={analyzing}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-500/15 border border-zinc-500/30 rounded-lg text-xs text-zinc-300 font-medium hover:bg-zinc-500/25 transition-all disabled:opacity-40"
                title="Envia para @security-test-sandbox do HackerOne. Seguro — sem efeito em reputação."
              >
                <Terminal size={12} />
                Testar Sandbox
              </button>

              {/* Botão real — só quando score ≥ 70% */}
              {result.ready_to_submit && (
                <button
                  onClick={onSubmit}
                  disabled={analyzing}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 font-medium hover:bg-emerald-500/30 transition-all disabled:opacity-40"
                >
                  <Send size={12} />
                  Enviar ao H1
                </button>
              )}
            </div>
          </div>

          {/* Checklist + Preview em 2 colunas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Checklist */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Checklist de Prontidão</p>
              {result.checks.map(c => (
                <div key={c.key} className="flex items-start gap-2.5">
                  <span className={cn('shrink-0 mt-0.5', c.ok ? 'text-emerald-400' : 'text-red-400')}>
                    {c.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-[11px] font-medium', c.ok ? 'text-foreground' : 'text-muted-foreground line-through')}>{c.label}</p>
                    {!c.ok && <p className="text-[10px] text-orange-400/80 mt-0.5">{c.tip}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{c.points}pts</span>
                </div>
              ))}
            </div>

            {/* Preview do relatório */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {result.report_preview ? 'Preview do Relatório (IA)' : result.ai_error ? 'Erro na Geração' : 'Relatório não gerado'}
              </p>
              {result.report_preview ? (
                <div className="bg-zinc-900 rounded-xl border border-border p-3 h-48 overflow-y-auto">
                  <pre className="text-[10px] text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                    {result.report_preview}
                    {result.report_preview.length >= 800 && '\n\n[... ver relatório completo na página Pipeline]'}
                  </pre>
                </div>
              ) : result.ai_error ? (
                <div className="bg-red-950/30 rounded-xl border border-red-500/20 p-3 text-[11px] text-red-400">
                  {result.ai_error}
                </div>
              ) : (
                <div className="bg-card rounded-xl border border-border p-3 text-[11px] text-muted-foreground italic">
                  Nenhum relatório gerado. Execute a análise novamente.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!result && !analyzing && (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground/50">
          <BrainCircuit size={28} />
          <p className="text-xs">
            {accepted.length > 0
              ? `${accepted.length} finding${accepted.length !== 1 ? 's' : ''} aceito${accepted.length !== 1 ? 's' : ''} — selecione um e clique em "Analisar com IA"`
              : 'Nenhum finding aceito. Triage os findings e mova para "accepted".'}
          </p>
        </div>
      )}
    </div>
  )
}

// ── System Activity Log ────────────────────────────────────────────────────

interface SystemLogEntry {
  id: string
  ts: number
  level: 'info' | 'success' | 'warning' | 'error' | 'debug'
  category: string
  message: string
}

function buildSystemLog(
  rt: ReturnType<typeof import('@/hooks/useRealtime').useRealtime>,
  recentJobs: JobItem[]
): SystemLogEntry[] {
  const entries: SystemLogEntry[] = []
  const seenIds = new Set<string>()

  const push = (entry: SystemLogEntry) => {
    if (seenIds.has(entry.id)) return
    seenIds.add(entry.id)
    entries.push(entry)
  }

  // SSE: recon done (sempre relevante — mostra resultado)
  rt.reconEvents.forEach(e => {
    push({
      id: `recon-${e.target}-${e.timestamp}`,
      ts: e.timestamp,
      level: 'success',
      category: 'RECON',
      message: `${e.target} → ${e.subdomains} subs, ${e.hosts} hosts ativos, ${e.urls} URLs`,
    })
  })

  // SSE: new findings (sempre relevante)
  rt.findingEvents.forEach(e => {
    const lvl = e.severity === 'critical' || e.severity === 'high' ? 'error'
      : e.severity === 'medium' ? 'warning' : 'info'
    push({
      id: `finding-${e.finding_id}`,
      ts: e.timestamp,
      level: lvl,
      category: 'FINDING',
      message: `[${e.severity.toUpperCase()}] ${e.title}${e.affected_url ? ` — ${e.affected_url}` : ''}`,
    })
  })

  // SSE: pipeline steps
  rt.pipelineEvents.forEach(e => {
    const lvl = e.submitted ? 'success' : e.step === 'readiness' ? 'info' : 'debug'
    push({
      id: `pipeline-${e.job_id}-${e.step}`,
      ts: e.timestamp,
      level: lvl,
      category: 'PIPELINE',
      message: e.submitted
        ? `✅ Submetido ao HackerOne — Report #${e.h1_report_id}`
        : e.message,
    })
  })

  // SSE: job updates (mudanças de status via pub/sub)
  rt.jobEvents.forEach(e => {
    const lvl = e.status === 'completed' ? 'success' : e.status === 'failed' ? 'error' : 'info'
    const summary = e.result_summary
      ? ' → ' + Object.entries(e.result_summary).map(([k, v]) => `${k}:${v}`).join(' ')
      : ''
    push({
      id: `job-sse-${e.job_id}-${e.status}`,
      ts: Date.now(),
      level: lvl,
      category: 'JOB',
      message: `${e.job_type} ${e.status}${summary}${e.error ? ` — ${e.error}` : ''}`,
    })
  })

  // Jobs do heartbeat — só mostra running/completed/failed (ignora pending duplicados)
  // Agrupa pending em uma única linha de resumo
  const pendingJobs = recentJobs.filter(j => j.status === 'pending')
  const activeJobs  = recentJobs.filter(j => j.status !== 'pending')

  if (pendingJobs.length > 0) {
    const types = [...new Set(pendingJobs.map(j => j.type))]
    push({
      id: `pending-summary`,
      ts: Date.now() - 5000,
      level: 'debug',
      category: 'QUEUE',
      message: `${pendingJobs.length} job${pendingJobs.length !== 1 ? 's' : ''} na fila aguardando worker (${types.join(', ')})`,
    })
  }

  activeJobs.forEach(j => {
    const lvl = j.status === 'completed' ? 'success' : j.status === 'failed' ? 'error' : 'info'
    const summary = j.result_summary
      ? ' → ' + Object.entries(j.result_summary).map(([k, v]) => `${k}:${v}`).join(' ')
      : ''
    push({
      id: `bg-job-${j.id}`,
      ts: new Date(j.created_at).getTime(),
      level: lvl,
      category: 'JOB',
      message: `${j.type} ${j.status}${summary}`,
    })
  })

  // Conexão SSE — mostra só uma vez
  if (rt.connected) {
    push({
      id: 'conn',
      ts: 0,
      level: 'success',
      category: 'SYSTEM',
      message: 'Stream SSE conectado — recebendo eventos em tempo real',
    })
  }

  return entries
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 100)
}

const LEVEL_CONFIG: Record<string, { color: string; prefix: string }> = {
  error:   { color: 'text-red-400',     prefix: '[ERRO]  ' },
  warning: { color: 'text-yellow-400',  prefix: '[AVISO] ' },
  success: { color: 'text-emerald-400', prefix: '[OK]    ' },
  info:    { color: 'text-blue-400',    prefix: '[INFO]  ' },
  debug:   { color: 'text-zinc-500',    prefix: '[DEBUG] ' },
}

const CAT_COLOR: Record<string, string> = {
  RECON:    'text-yellow-500',
  FINDING:  'text-red-500',
  PIPELINE: 'text-violet-500',
  JOB:      'text-blue-500',
  SYSTEM:   'text-emerald-500',
  QUEUE:    'text-zinc-500',
}

const SVC_CFG: Record<string, { label: string; color: string; lvlColor: Record<string, string> }> = {
  backend:  { label: 'API',    color: 'text-blue-400',   lvlColor: { error: 'text-red-400', warn: 'text-yellow-400', info: 'text-blue-300',   debug: 'text-zinc-500', stdout: 'text-zinc-300' } },
  worker:   { label: 'WORKER', color: 'text-violet-400', lvlColor: { error: 'text-red-400', warn: 'text-yellow-400', info: 'text-violet-300', debug: 'text-zinc-500', stdout: 'text-zinc-300' } },
  frontend: { label: 'NEXT',   color: 'text-cyan-400',   lvlColor: { error: 'text-red-400', warn: 'text-yellow-400', info: 'text-cyan-300',   debug: 'text-zinc-500', stdout: 'text-zinc-300' } },
  mongodb:  { label: 'MONGO',  color: 'text-green-400',  lvlColor: { error: 'text-red-400', warn: 'text-yellow-400', info: 'text-green-300',  debug: 'text-zinc-500', stdout: 'text-zinc-300' } },
  redis:    { label: 'REDIS',  color: 'text-orange-400', lvlColor: { error: 'text-red-400', warn: 'text-yellow-400', info: 'text-orange-300', debug: 'text-zinc-500', stdout: 'text-zinc-300' } },
}

interface ContainerLine {
  key: string
  tsMs: number
  tsLabel: string
  service: string
  level: string
  message: string
}

function SystemActivityLog({
  rt,
  recentJobs,
}: {
  rt: ReturnType<typeof import('@/hooks/useRealtime').useRealtime>
  recentJobs: JobItem[]
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(false)
  const [svcFilter, setSvcFilter] = useState<string | null>(null)
  const [containerLines, setContainerLines] = useState<ContainerLine[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  const loadAllLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const services = ['backend', 'worker', 'frontend', 'mongodb', 'redis']
      const results = await Promise.allSettled(
        services.map(svc => api.get(`/logs/services/${svc}`, { params: { tail: 80 } }))
      )
      const merged: ContainerLine[] = []
      results.forEach((res, idx) => {
        if (res.status !== 'fulfilled') return
        const svc = services[idx]
        ;(res.value.data.lines ?? []).forEach((l: LogLine, i: number) => {
          const tsMs = l.timestamp ? new Date(l.timestamp).getTime() : 0
          merged.push({
            key: `${svc}-${i}-${tsMs}`,
            tsMs,
            tsLabel: l.timestamp
              ? new Date(l.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '',
            service: svc,
            level: l.level,
            message: l.message,
          })
        })
      })
      merged.sort((a, b) => a.tsMs - b.tsMs)
      setContainerLines(merged)
    } catch {}
    finally { setLoadingLogs(false) }
  }, [])

  useEffect(() => { loadAllLogs() }, [loadAllLogs])
  useEffect(() => {
    const t = setInterval(loadAllLogs, 8000)
    return () => clearInterval(t)
  }, [loadAllLogs])

  const sseEntries = buildSystemLog(rt, recentJobs)

  const visibleLines = svcFilter
    ? containerLines.filter(l => l.service === svcFilter)
    : containerLines

  const totalLines = visibleLines.length + (svcFilter ? 0 : sseEntries.length)

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [totalLines, autoScroll])

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground font-mono">system.log</span>
            <div className={cn(
              'flex items-center gap-1 text-[10px] font-mono',
              rt.connected ? 'text-emerald-400' : 'text-red-400'
            )}>
              <Radio size={9} className={rt.connected ? 'animate-pulse' : ''} />
              {rt.connected ? 'live' : 'offline'}
            </div>
            {loadingLogs && <RefreshCw size={9} className="animate-spin text-zinc-600" />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono">{totalLines} linhas</span>
            <button
              onClick={() => setAutoScroll(v => !v)}
              className={cn(
                'flex items-center gap-1 text-[10px] px-2 py-1 rounded border font-mono transition-all',
                autoScroll
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'border-border text-muted-foreground hover:bg-accent'
              )}
            >
              <ChevronDown size={9} className={autoScroll ? 'animate-bounce' : ''} />
              scroll {autoScroll ? 'on' : 'off'}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1.5 font-mono">
          Logs unificados dos containers (API, Worker, MongoDB, Redis, Frontend) + eventos SSE em tempo real. Filtre por serviço nas abas abaixo.
        </p>
      </div>

      {/* Service filter pills */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-zinc-950/80 overflow-x-auto">
        <button
          onClick={() => setSvcFilter(null)}
          className={cn(
            'px-2.5 py-1 rounded text-[10px] font-mono font-semibold transition-colors shrink-0',
            svcFilter === null
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          ALL
        </button>
        {Object.entries(SVC_CFG).map(([key, cfg]) => {
          const count = containerLines.filter(l => l.service === key).length
          return (
            <button
              key={key}
              onClick={() => setSvcFilter(svcFilter === key ? null : key)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-mono font-semibold transition-colors shrink-0',
                svcFilter === key
                  ? cn('bg-zinc-800', cfg.color)
                  : 'text-zinc-600 hover:text-zinc-400'
              )}
            >
              <span>{cfg.label}</span>
              <span className="text-zinc-700">{count}</span>
            </button>
          )
        })}
        <div className="ml-auto shrink-0">
          <button
            onClick={loadAllLogs}
            className="p-1 rounded hover:bg-zinc-800 transition-colors"
            title="Atualizar logs"
          >
            <RefreshCw size={10} className="text-zinc-600 hover:text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Terminal body */}
      <div className="h-[520px] overflow-y-auto bg-zinc-950 px-4 py-3 font-mono text-[11px] space-y-0.5">

        {/* Container logs (sorted by time) */}
        {visibleLines.map(line => {
          const cfg = SVC_CFG[line.service]
          const msgColor = cfg?.lvlColor[line.level] ?? 'text-zinc-400'
          return (
            <div key={line.key} className="flex gap-2 leading-relaxed min-w-0">
              <span className="text-zinc-700 shrink-0 select-none tabular-nums w-[60px]">
                {line.tsLabel}
              </span>
              <span className={cn('shrink-0 w-[52px] font-semibold', cfg?.color ?? 'text-zinc-500')}>
                [{cfg?.label ?? line.service}]
              </span>
              <span className={cn('break-all flex-1 min-w-0', msgColor)}>
                {line.message}
              </span>
            </div>
          )
        })}

        {/* SSE events (only when not filtered by service) */}
        {!svcFilter && sseEntries.map(entry => {
          const lvl = LEVEL_CONFIG[entry.level] ?? LEVEL_CONFIG.debug
          const catColor = CAT_COLOR[entry.category] ?? 'text-zinc-500'
          return (
            <div key={entry.id} className="flex gap-2 leading-relaxed border-l-2 border-emerald-500/20 pl-2 ml-1">
              <span className="text-zinc-600 shrink-0 select-none tabular-nums w-[60px]">
                {new Date(entry.ts).toLocaleTimeString('pt-BR')}
              </span>
              <span className={cn('shrink-0 w-[52px] font-semibold', catColor)}>
                [{entry.category}]
              </span>
              <span className={cn('break-all flex-1', lvl.color === 'text-zinc-500' ? 'text-zinc-400' : lvl.color)}>
                {entry.message}
              </span>
            </div>
          )
        })}

        {totalLines === 0 && (
          <p className="text-zinc-700 italic">Aguardando logs...</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Footer status bar */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-t border-border bg-zinc-900/60 text-[10px] font-mono text-zinc-600">
        <span className="text-emerald-500/70">
          ● {rt.heartbeat?.active_jobs ?? 0} job{(rt.heartbeat?.active_jobs ?? 0) !== 1 ? 's' : ''} ativos
        </span>
        <span className="text-red-500/70">
          ● {rt.findingEvents.length} finding{rt.findingEvents.length !== 1 ? 's' : ''} nesta sessão
        </span>
        <span className="text-violet-500/70">
          ● {rt.heartbeat?.total_reports_ready ?? rt.heartbeat?.total_reports ?? 0} relatório{(rt.heartbeat?.total_reports_ready ?? rt.heartbeat?.total_reports ?? 0) !== 1 ? 's' : ''} IA
        </span>
        <span className="text-violet-500/70">
          ● {rt.pipelineEvents.filter(e => e.submitted).length} submetido{rt.pipelineEvents.filter(e => e.submitted).length !== 1 ? 's' : ''} ao H1
        </span>
        <span className="ml-auto text-zinc-500">
          {rt.connected && rt.lastUpdate ? `Última atualização: ${new Date(rt.lastUpdate).toLocaleTimeString('pt-BR')}` : rt.connected ? 'Conectado' : 'Offline'}
        </span>
      </div>
    </div>
  )
}

// ── Vulnerability Type Row ─────────────────────────────────────────────────

const VULN_TYPES: {
  key: string
  label: string
  icon: React.ReactNode
  color: string
  bg: string
  border: string
  desc: string
  bounty: string
  href: string
}[] = [
  { key: 'idor',            label: 'IDOR',           icon: <Key size={13} />,        color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/25',     desc: 'Insecure Direct Object Reference — acesso a recursos de outros usuários via ID manipulado.',        bounty: '$500–$10k', href: '/findings' },
  { key: 'xss',             label: 'XSS',            icon: <Globe2 size={13} />,     color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/25',  desc: 'Cross-Site Scripting — injeção de scripts maliciosos em páginas visualizadas por outros usuários.', bounty: '$200–$5k',  href: '/findings' },
  { key: 'sqli',            label: 'SQLi',           icon: <Layers size={13} />,     color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/25',  desc: 'SQL Injection — injeção de queries SQL para exfiltrar ou manipular dados do banco.',              bounty: '$1k–$20k',  href: '/findings' },
  { key: 'ssrf',            label: 'SSRF',           icon: <Network size={13} />,    color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/25',  desc: 'Server-Side Request Forgery — forçar o servidor a fazer requisições para recursos internos.',        bounty: '$500–$15k', href: '/findings' },
  { key: 'lfi',             label: 'LFI/RFI',        icon: <Search size={13} />,     color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/25',    desc: 'Local/Remote File Inclusion — leitura de arquivos arbitrários do servidor.',                       bounty: '$300–$8k',  href: '/findings' },
  { key: 'open_redirect',   label: 'Open Redirect',  icon: <Link2 size={13} />,      color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/25',    desc: 'Redirecionamento aberto — URL pode redirecionar usuários para sites maliciosos (phishing).',       bounty: '$50–$500',  href: '/findings' },
  { key: 'info_disclosure', label: 'Info Disclosure', icon: <FileText size={13} />, color: 'text-zinc-400',    bg: 'bg-zinc-500/10',    border: 'border-zinc-500/25',    desc: 'Exposição de dados sensíveis — chaves, tokens, paths internos, versões de software.',            bounty: '$0–$500',   href: '/findings' },
  { key: 'other',           label: 'Outros',          icon: <Bug size={13} />,       color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', desc: 'Outros tipos de vulnerabilidade não classificados nas categorias acima.',                        bounty: 'Variável',  href: '/findings' },
]

function VulnTypeRow({ findings }: { findings: FindingItem[] }) {
  const countByType = VULN_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t.key] = findings.filter(f => f.type === t.key).length
    return acc
  }, {})

  const total = findings.length

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Bug size={13} className="text-muted-foreground" />
          Tipos de Vulnerabilidade
        </h2>
        <p className="text-[11px] text-muted-foreground/60 mt-0.5">
          Classificação dos findings por categoria de vuln. Passe o mouse para ver bounty típico e descrição. Clique para filtrar na página Findings.
        </p>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {VULN_TYPES.map(t => {
          const count = countByType[t.key] ?? 0
          const pct = total > 0 ? Math.round(count / total * 100) : 0
          const inner = (
            <div className={cn(
              'p-2.5 rounded-xl border text-center transition-all group relative',
              count > 0
                ? `${t.bg} ${t.border} hover:brightness-110 cursor-pointer`
                : 'bg-card border-border opacity-50 cursor-default'
            )}>
              {/* Link badge no canto */}
              {count > 0 && (
                <ExternalLink size={8} className={cn(
                  'absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-60 transition-opacity',
                  t.color
                )} />
              )}
              <div className={cn('flex justify-center mb-1.5', count > 0 ? t.color : 'text-muted-foreground/50')}>
                {t.icon}
              </div>
              <p className={cn('text-lg font-bold leading-none', count > 0 ? t.color : 'text-muted-foreground/50')}>
                {count}
              </p>
              <p className="text-[9px] text-muted-foreground mt-1 truncate">{t.label}</p>
              {count > 0 && pct > 0 && (
                <p className={cn('text-[8px] font-medium mt-0.5', t.color)}>{pct}%</p>
              )}
            </div>
          )
          return (
            <Tooltip key={t.key} content={{
              title: t.label,
              priority: count > 0
                ? (t.key === 'idor' || t.key === 'sqli' || t.key === 'ssrf') ? 'high'
                : (t.key === 'xss' || t.key === 'lfi') ? 'medium' : 'low'
                : 'info',
              description: t.desc,
              details: [
                { label: 'Encontrados', value: String(count) },
                { label: '% do total', value: `${pct}%` },
                { label: 'Bounty típico', value: t.bounty },
              ],
              actions: [
                count > 0
                  ? `${count} finding${count !== 1 ? 's' : ''} deste tipo — clique para ver na página Findings.`
                  : 'Nenhum encontrado ainda. O recon automático detecta alguns tipos.',
                'Triage os findings deste tipo e mova para "accepted" para disparar o pipeline.',
              ],
            }}>
              {count > 0 ? <Link href={t.href}>{inner}</Link> : inner}
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

// ── H1 Submission Row ──────────────────────────────────────────────────────

function H1SubmissionRow({ findings, aiReports }: { findings: FindingItem[]; aiReports: AiReport[] }) {
  const newCount     = findings.filter(f => f.status === 'new').length
  const triaging     = findings.filter(f => f.status === 'triaging').length
  const accepted     = findings.filter(f => f.status === 'accepted').length
  const reportsReady = aiReports.filter(r => r.is_ready).length
  const submitted    = findings.filter(f => f.status === 'resolved').length
  const dropped      = findings.filter(f => f.status === 'duplicate' || f.status === 'not_applicable').length
  const total        = findings.length

  // Jornada principal (linear)
  const JOURNEY = [
    {
      step: 1,
      label: 'Detectado',
      sublabel: 'Recon automático',
      value: total,
      color: 'text-zinc-300',
      bg: 'bg-zinc-500/10',
      border: 'border-zinc-500/20',
      dot: 'bg-zinc-400',
      icon: <Zap size={14} />,
      href: '/findings',
      desc: 'Total de findings detectados pelo recon automático e criados manualmente.',
      action: 'Ponto de entrada do funil — todos os bugs capturados.',
    },
    {
      step: 2,
      label: 'Em Triagem',
      sublabel: 'Validação manual',
      value: newCount + triaging,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/25',
      dot: 'bg-yellow-400',
      icon: <Search size={14} />,
      href: '/findings',
      desc: 'Findings novos + em triagem. Ainda aguardando confirmação de validade.',
      action: 'Confirme reprodutibilidade e mova para "Aceito" ou "N/A".',
    },
    {
      step: 3,
      label: 'Aceito',
      sublabel: 'Pronto para pipeline',
      value: accepted,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      dot: 'bg-blue-400',
      icon: <CheckCircle2 size={14} />,
      href: '/pipeline',
      desc: 'Confirmados como válidos. Pipeline automático gerará relatório e submeterá ao H1.',
      action: 'Clique para executar o pipeline agora sem esperar os 30min.',
    },
    {
      step: 4,
      label: 'Relatório IA',
      sublabel: 'Ollama / Claude',
      value: reportsReady,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
      border: 'border-violet-500/30',
      dot: 'bg-violet-400',
      icon: <BrainCircuit size={14} />,
      href: '/pipeline',
      desc: 'Relatório profissional gerado pela IA com score de prontidão para H1.',
      action: 'Revise o draft e ajuste campos para aumentar o score acima de 70%.',
    },
    {
      step: 5,
      label: 'Enviado H1',
      sublabel: 'Submetido',
      value: submitted,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      dot: 'bg-emerald-500',
      icon: <Send size={14} />,
      href: '/hackerone',
      desc: 'Reports submetidos ao HackerOne com sucesso. Aguardando triagem da plataforma.',
      action: 'Acompanhe o status no HackerOne → Meus Reports.',
    },
  ]

  // Conversão entre etapas
  const conversionRate = (from: number, to: number) =>
    from > 0 ? Math.round(to / from * 100) : 0

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Send size={13} className="text-emerald-400" />
            Jornada de Envio — HackerOne
          </h2>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            Funil completo desde a detecção até o bounty. Cada etapa mostra a taxa de conversão — passe o mouse para ações específicas.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {dropped > 0 && (
            <span className="flex items-center gap-1 text-orange-400/70">
              <XCircle size={9} />
              {dropped} descartados (dup/N/A)
            </span>
          )}
          <span>
            Taxa final: <span className="text-emerald-400 font-semibold">{conversionRate(total, submitted)}%</span>
          </span>
        </div>
      </div>

      {/* Jornada linear com setas */}
      <div className="relative">
        {/* Linha de progresso de fundo */}
        <div className="absolute top-[28px] left-8 right-8 h-px bg-border z-0" />
        {total > 0 && (
          <div
            className="absolute top-[28px] left-8 h-px bg-gradient-to-r from-zinc-500 via-blue-500 to-emerald-500 z-0 transition-all duration-700"
            style={{ width: `${Math.max(10, conversionRate(total, submitted))}%` }}
          />
        )}

        <div className="relative z-10 grid grid-cols-5 gap-2">
          {JOURNEY.map((s, i) => {
            const convRate = i > 0 ? conversionRate(JOURNEY[i - 1].value, s.value) : 100
            const isActive = s.value > 0
            const inner = (
              <div className="flex flex-col items-center gap-2">
                {/* Círculo da etapa */}
                <div className={cn(
                  'w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all relative',
                  isActive
                    ? `${s.bg} ${s.border} shadow-lg`
                    : 'bg-card border-border/40 opacity-40'
                )}>
                  <span className={isActive ? s.color : 'text-muted-foreground/30'}>{s.icon}</span>
                  {/* Número da etapa */}
                  <span className={cn(
                    'absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center',
                    isActive ? s.dot + ' text-white' : 'bg-border text-muted-foreground/50'
                  )}>
                    {s.step}
                  </span>
                </div>

                {/* Contagem */}
                <p className={cn('text-xl font-bold leading-none tabular-nums', isActive ? s.color : 'text-muted-foreground/30')}>
                  {s.value}
                </p>

                {/* Labels */}
                <div className="text-center">
                  <p className={cn('text-[11px] font-semibold leading-tight', isActive ? 'text-foreground' : 'text-muted-foreground/40')}>
                    {s.label}
                  </p>
                  <p className="text-[9px] text-muted-foreground/60 mt-0.5">{s.sublabel}</p>
                </div>

                {/* Taxa de conversão da etapa anterior */}
                {i > 0 && (
                  <span className={cn(
                    'text-[9px] font-medium px-1.5 py-0.5 rounded-full',
                    convRate >= 50 ? 'bg-emerald-500/15 text-emerald-400'
                    : convRate >= 20 ? 'bg-yellow-500/15 text-yellow-400'
                    : 'bg-red-500/15 text-red-400'
                  )}>
                    {convRate}%
                  </span>
                )}
              </div>
            )

            return (
              <Tooltip key={s.step} content={{
                title: `Etapa ${s.step}: ${s.label}`,
                priority: isActive
                  ? s.step === 5 ? 'high' : s.step === 3 ? 'high' : 'medium'
                  : 'info',
                description: s.desc,
                details: [
                  { label: 'Nesta etapa', value: String(s.value) },
                  { label: 'Conversão', value: i > 0 ? `${convRate}% da etapa anterior` : 'Entrada do funil' },
                  { label: 'Próxima ação', value: s.sublabel },
                ],
                actions: [s.action],
              }}>
                {isActive
                  ? <Link href={s.href} className="flex flex-col items-center group">{inner}</Link>
                  : <div className="flex flex-col items-center">{inner}</div>
                }
              </Tooltip>
            )
          })}
        </div>

        {/* Setas entre etapas */}
        <div className="absolute top-[22px] left-0 right-0 z-0 pointer-events-none">
          <div className="grid grid-cols-5">
            {JOURNEY.map((_, i) => i < JOURNEY.length - 1 && (
              <div key={i} className="flex justify-end items-center pr-1">
                <ChevronRight size={12} className="text-border" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Barra de descartados */}
      {dropped > 0 && (
        <div className="mt-4 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-orange-500/15 bg-orange-500/5">
          <XCircle size={13} className="text-orange-400 shrink-0" />
          <div className="flex-1 text-[11px] text-muted-foreground">
            <span className="text-orange-400 font-semibold">{dropped} finding{dropped !== 1 ? 's' : ''}</span> saíram do funil como{' '}
            <span className="text-muted-foreground">duplicados ({findings.filter(f => f.status === 'duplicate').length})</span> ou{' '}
            <span className="text-muted-foreground">N/A ({findings.filter(f => f.status === 'not_applicable').length})</span>.
            Isso é normal no recon automático.
          </div>
          <Link href="/findings" className="text-[10px] text-orange-400 hover:underline shrink-0">Ver →</Link>
        </div>
      )}
    </div>
  )
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  icon, bg, label, value, href, pulse, accent, hovColor, description
}: {
  icon: React.ReactNode
  bg: string
  label: string
  value: string | number
  href?: string
  pulse?: boolean
  accent?: string
  hovColor?: string
  description?: string
}) {
  const inner = (
    <div className={cn(
      'p-4 rounded-xl bg-card border border-border transition-all duration-300 h-full cursor-default geo-shadow',
      hovColor ?? ''
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', bg)}>
          <span className={pulse ? 'animate-pulse' : ''}>{icon}</span>
        </div>
        <Info size={11} className="text-muted-foreground/30 mt-0.5" />
      </div>
      <p className="text-xl font-bold leading-none tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1 font-medium">{label}</p>
      {description && (
        <p className="text-[10px] text-muted-foreground/50 mt-2 leading-relaxed border-t border-border/40 pt-2">{description}</p>
      )}
    </div>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return inner
}

// ── Bug Card ───────────────────────────────────────────────────────────────

function BugCard({ finding: f, onSelect }: { finding: FindingItem; onSelect: () => void }) {
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
      <div onClick={onSelect} className={cn('rounded-xl border p-4 space-y-3 transition-all hover:shadow-md cursor-pointer', sev.border)}>
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

// ── Dashboard sub-components ───────────────────────────────────────────────

const DASH_BANNER_STYLES = {
  blue:    { bg: 'rgba(59,130,246,0.06)',  border: 'rgba(59,130,246,0.2)',  color: '#60a5fa' },
  violet:  { bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.2)',  color: '#a78bfa' },
  orange:  { bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.2)',  color: '#fb923c' },
  emerald: { bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.2)',  color: '#34d399' },
}

// ── Pod / Container Health ─────────────────────────────────────────────────

const SVC_META: Record<string, { label: string; desc: string; color: string }> = {
  backend:       { label: 'Backend API',  desc: 'FastAPI — uvicorn',         color: 'text-blue-400' },
  worker:        { label: 'Worker',       desc: 'ARQ — recon jobs',          color: 'text-violet-400' },
  frontend:      { label: 'Frontend',     desc: 'Next.js — interface',       color: 'text-cyan-400' },
  mongodb:       { label: 'MongoDB',      desc: 'Banco de dados principal',  color: 'text-green-400' },
  redis:         { label: 'Redis',        desc: 'Fila de jobs + cache',      color: 'text-orange-400' },
  'mongo-express': { label: 'Mongo UI',  desc: 'Admin interface',           color: 'text-zinc-400' },
}

function PodStatusDot({ state }: { state: string }) {
  if (state === 'running') return <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
  if (state === 'exited')  return <span className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
  return <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />
}

function MiniBar({ value, max = 100, color }: { value: number | null; max?: number; color: string }) {
  if (value === null) return <span className="text-zinc-600 text-[10px]">—</span>
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground w-10 text-right">{value.toFixed(1)}%</span>
    </div>
  )
}

function DashPodHealth({ rt }: { rt: ReturnType<typeof import('@/hooks/useRealtime').useRealtime> }) {
  const containers = rt.heartbeat?.containers ?? []
  const running    = containers.filter(c => c.state === 'running').length
  const total      = containers.length

  return (
    <div className="rounded-xl border border-border overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)' }}>
      {/* Header tipo terminal */}
      <div className="px-4 py-3 border-b border-border bg-zinc-900/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Botões macOS */}
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
          </div>
          <span className="text-xs font-semibold font-mono text-muted-foreground">pods.health</span>
          <div className={cn('flex items-center gap-1.5 text-[10px] font-mono', rt.connected ? 'text-emerald-400' : 'text-zinc-500')}>
            <Radio size={9} className={rt.connected ? 'animate-pulse' : ''} />
            {rt.connected ? 'live' : 'offline'}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className={cn(running === total && total > 0 ? 'text-emerald-400' : 'text-yellow-400')}>
            {running}/{total} running
          </span>
          {rt.heartbeat?.queue_depth != null && (
            <span className="text-zinc-500">
              queue: <span className="text-yellow-400">{rt.heartbeat.queue_depth}</span>
            </span>
          )}
          {rt.heartbeat?.workers_active != null && (
            <span className="text-zinc-500">
              workers: <span className="text-violet-400">{rt.heartbeat.workers_active}</span>
            </span>
          )}
        </div>
      </div>

      {/* Tabela de containers */}
      {containers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
          <Activity size={22} className="opacity-20" />
          <p className="text-xs font-mono">
            {rt.connected ? 'Aguardando dados dos containers…' : 'SSE desconectado — sem dados de saúde'}
          </p>
          <p className="text-[10px] text-zinc-600">O Docker socket precisa estar montado no backend</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-zinc-900/40">
                <th className="px-4 py-2.5 text-left text-[10px] font-mono font-semibold text-zinc-500 uppercase tracking-wider w-4">●</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-mono font-semibold text-zinc-500 uppercase tracking-wider">Serviço</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-mono font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-mono font-semibold text-zinc-500 uppercase tracking-wider">CPU</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-mono font-semibold text-zinc-500 uppercase tracking-wider">Memória</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-mono font-semibold text-zinc-500 uppercase tracking-wider">Mem MB</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-mono font-semibold text-zinc-500 uppercase tracking-wider">Uptime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {containers.map(c => {
                const meta = SVC_META[c.name] ?? { label: c.name, desc: '', color: 'text-zinc-400' }
                const uptime = c.started_at
                  ? (() => {
                      const secs = Math.floor((Date.now() - new Date(c.started_at).getTime()) / 1000)
                      if (secs < 60) return `${secs}s`
                      if (secs < 3600) return `${Math.floor(secs / 60)}m`
                      return `${Math.floor(secs / 3600)}h${Math.floor((secs % 3600) / 60)}m`
                    })()
                  : '—'
                return (
                  <tr key={c.name} className="hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3">
                      <PodStatusDot state={c.state} />
                    </td>
                    <td className="px-4 py-3">
                      <p className={cn('text-sm font-semibold', meta.color)}>{meta.label}</p>
                      <p className="text-[10px] text-zinc-500 font-mono">{meta.desc}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'text-[11px] font-mono px-2 py-0.5 rounded',
                        c.state === 'running'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : c.state === 'exited'
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-yellow-500/15 text-yellow-400'
                      )}>
                        {c.state}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <MiniBar value={c.cpu_pct} color={
                        (c.cpu_pct ?? 0) > 80 ? 'bg-red-500' :
                        (c.cpu_pct ?? 0) > 50 ? 'bg-yellow-500' : 'bg-emerald-500'
                      } />
                    </td>
                    <td className="px-4 py-3">
                      <MiniBar value={c.mem_pct} color={
                        (c.mem_pct ?? 0) > 85 ? 'bg-red-500' :
                        (c.mem_pct ?? 0) > 60 ? 'bg-yellow-500' : 'bg-blue-500'
                      } />
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-muted-foreground">
                      {c.mem_mb != null ? `${c.mem_mb} MB` : '—'}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-muted-foreground">
                      {uptime}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-zinc-900/40 text-[10px] font-mono text-zinc-600">
        <span>
          <span className="text-emerald-400">{running}</span> running
          {total - running > 0 && <span className="text-red-400 ml-2">{total - running} stopped</span>}
        </span>
        <span>|</span>
        <span>CPU total: <span className="text-yellow-400">
          {containers.filter(c => c.cpu_pct != null).reduce((s, c) => s + (c.cpu_pct ?? 0), 0).toFixed(1)}%
        </span></span>
        <span>Mem total: <span className="text-blue-400">
          {containers.filter(c => c.mem_mb != null).reduce((s, c) => s + (c.mem_mb ?? 0), 0).toFixed(0)} MB
        </span></span>
        <span className="ml-auto">
          atualiza a cada 3s via SSE
        </span>
      </div>
    </div>
  )
}

// ── Monitor em Tempo Real ──────────────────────────────────────────────────

function DashMonitor({ rt }: { rt: ReturnType<typeof import('@/hooks/useRealtime').useRealtime> }) {
  const hb = rt.heartbeat

  const METRICS = [
    // Coluna 1: Findings
    {
      group: 'Findings',
      color: 'text-red-400',
      border: 'border-red-500/20',
      bg: 'rgba(239,68,68,0.04)',
      items: [
        { label: 'Total', value: hb?.total_findings ?? '—', highlight: false },
        { label: 'Última 1h', value: hb?.findings_1h ?? 0, highlight: (hb?.findings_1h ?? 0) > 0 },
        { label: 'Últimas 24h', value: hb?.findings_24h ?? 0, highlight: (hb?.findings_24h ?? 0) > 0 },
        { label: 'Critical', value: hb?.by_severity?.critical ?? 0, highlight: (hb?.by_severity?.critical ?? 0) > 0 },
        { label: 'High', value: hb?.by_severity?.high ?? 0, highlight: (hb?.by_severity?.high ?? 0) > 0 },
        { label: 'Aceitos', value: hb?.by_status?.accepted ?? 0, highlight: (hb?.by_status?.accepted ?? 0) > 0 },
      ],
    },
    // Coluna 2: Jobs / Workers
    {
      group: 'Jobs & Workers',
      color: 'text-yellow-400',
      border: 'border-yellow-500/20',
      bg: 'rgba(234,179,8,0.04)',
      items: [
        { label: 'Jobs ativos', value: hb?.active_jobs ?? '—', highlight: (hb?.active_jobs ?? 0) > 0 },
        { label: 'Fila ARQ', value: hb?.queue_depth ?? 0, highlight: (hb?.queue_depth ?? 0) > 0 },
        { label: 'Workers', value: hb?.workers_active ?? '—', highlight: false },
        { label: 'Concluídos hoje', value: hb?.completed_today ?? 0, highlight: false },
        { label: 'Falhos hoje', value: hb?.failed_today ?? 0, highlight: (hb?.failed_today ?? 0) > 0 },
        { label: 'Conexão SSE', value: rt.connected ? 'Online' : 'Offline', highlight: rt.connected },
      ],
    },
    // Coluna 3: Pipeline / IA
    {
      group: 'Pipeline & IA',
      color: 'text-violet-400',
      border: 'border-violet-500/20',
      bg: 'rgba(139,92,246,0.04)',
      items: [
        { label: 'Relatórios total', value: hb?.total_reports ?? '—', highlight: false },
        { label: 'Prontos', value: hb?.total_reports_ready ?? 0, highlight: (hb?.total_reports_ready ?? 0) > 0 },
        { label: 'Gerados hoje', value: hb?.reports_today ?? 0, highlight: false },
        { label: 'Score médio IA', value: hb?.avg_review_score != null ? `${hb.avg_review_score}%` : '—', highlight: false },
        { label: 'Bounty total', value: hb?.bounty_earned != null ? `$${hb.bounty_earned.toLocaleString()}` : '—', highlight: (hb?.bounty_earned ?? 0) > 0 },
        { label: 'Último evento', value: rt.lastUpdate ? new Date(rt.lastUpdate).toLocaleTimeString('pt-BR') : '—', highlight: false },
      ],
    },
    // Coluna 4: Infra
    {
      group: 'Infraestrutura',
      color: 'text-emerald-400',
      border: 'border-emerald-500/20',
      bg: 'rgba(34,197,94,0.04)',
      items: [
        { label: 'Targets total', value: hb?.total_targets ?? '—', highlight: false },
        { label: 'In-scope', value: hb?.targets_in_scope ?? '—', highlight: false },
        { label: 'Recon 24h', value: hb?.targets_with_recon_24h ?? 0, highlight: false },
        { label: 'Redis mem', value: hb?.redis_memory_mb != null ? `${hb.redis_memory_mb} MB` : '—', highlight: false },
        { label: 'Eventos sessão', value: rt.jobEvents.length + rt.findingEvents.length + rt.pipelineEvents.length, highlight: false },
        { label: 'Recon events', value: rt.reconEvents.length, highlight: rt.reconEvents.length > 0 },
      ],
    },
  ]

  return (
    <div className="rounded-xl border border-border overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)' }}>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className={rt.connected ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'} />
          <span className="text-sm font-semibold">Monitoramento em Tempo Real</span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {hb ? 'SSE ativo — heartbeat a cada 3s' : 'Aguardando conexão SSE…'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'w-2 h-2 rounded-full',
            rt.connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
          )} />
          <span className="text-[10px] font-mono text-muted-foreground">
            {rt.connected ? 'connected' : 'disconnected'}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
        {METRICS.map(group => (
          <div key={group.group} className="p-4 space-y-2.5" style={{ background: group.bg }}>
            <p className={cn('text-[10px] font-bold uppercase tracking-widest mb-3', group.color)}>
              {group.group}
            </p>
            {group.items.map(item => (
              <div key={item.label} className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground truncate">{item.label}</span>
                <span className={cn(
                  'text-[12px] font-bold tabular-nums shrink-0',
                  item.highlight ? group.color : 'text-foreground'
                )}>
                  {String(item.value)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {!hb && (
        <div className="px-4 py-3 text-center text-xs text-zinc-500 border-t border-border">
          Conectando ao stream SSE… As métricas aparecerão assim que a conexão for estabelecida.
        </div>
      )}
    </div>
  )
}

function DashBanner({ v, icon, text }: { v: keyof typeof DASH_BANNER_STYLES; icon: React.ReactNode; text: React.ReactNode }) {
  const s = DASH_BANNER_STYLES[v]
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border"
      style={{ background: s.bg, borderColor: s.border, color: s.color }}>
      {icon}
      <span className="text-[12px] leading-relaxed">{text}</span>
    </div>
  )
}

function DashKpi({ icon, bg, color, label, value, href, pulse, accent }: {
  icon: React.ReactNode; bg: string; color: string; label: string
  value: string | number; href?: string; pulse?: boolean; accent?: boolean
}) {
  const card = (
    <div className={cn(
      'relative p-5 rounded-xl border transition-all cursor-default',
      accent ? 'border-violet-500/25' : 'border-border hover:border-border/60',
    )} style={{ background: accent ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.02)' }}>
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', bg)}>
        <span className={cn(color, pulse && 'animate-pulse')}>{icon}</span>
      </div>
      <p className={cn('text-3xl font-bold tabular-nums leading-none', accent ? 'text-violet-300' : 'text-foreground')}>{value}</p>
      <p className="text-sm text-muted-foreground mt-2 font-medium leading-tight">{label}</p>
    </div>
  )
  return href ? <Link href={href} className="block">{card}</Link> : card
}

// ── Barra de progresso "temperatura" para envio do relatório ─────────────────

const REPORT_STAGES = [
  { key: 'findings', label: 'Findings detectados', sub: 'Recon encontrou vulnerabilidades', pct: 25, color: 'bg-zinc-500', fill: 'bg-zinc-400', href: '/findings', icon: Bug },
  { key: 'accepted', label: 'Triagem → Aceito', sub: 'Pronto para gerar relatório', pct: 50, color: 'bg-yellow-600/50', fill: 'bg-yellow-500', href: '/findings', icon: CheckCircle2 },
  { key: 'report', label: 'Relatório IA gerado', sub: 'Draft pronto para revisão', pct: 75, color: 'bg-violet-600/50', fill: 'bg-violet-500', href: '/pipeline', icon: BrainCircuit },
  { key: 'submitted', label: 'Enviado ao H1', sub: 'Report submetido ao programa', pct: 100, color: 'bg-emerald-600/50', fill: 'bg-emerald-500', href: '/hackerone', icon: Send },
] as const

function DashReportProgressBar({
  totalFindings,
  acceptedCount,
  reportsReadyCount,
  submittedCount,
}: {
  totalFindings: number
  acceptedCount: number
  reportsReadyCount: number
  submittedCount: number
}) {
  const stage1 = totalFindings > 0
  const stage2 = acceptedCount > 0
  const stage3 = reportsReadyCount > 0
  const stage4 = submittedCount > 0

  const currentStage = stage4 ? 4 : stage3 ? 3 : stage2 ? 2 : stage1 ? 1 : 0
  const pct = currentStage === 0 ? 0 : currentStage === 1 ? 25 : currentStage === 2 ? 50 : currentStage === 3 ? 75 : 100

  const counts = [
    { key: 'findings', value: totalFindings, done: stage1 },
    { key: 'accepted', value: acceptedCount, done: stage2 },
    { key: 'report', value: reportsReadyCount, done: stage3 },
    { key: 'submitted', value: submittedCount, done: stage4 },
  ]

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(139,92,246,0.2)' }}>
      <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'rgba(139,92,246,0.12)', background: 'rgba(139,92,246,0.04)' }}>
        <div className="flex items-center gap-2.5">
          <Send size={18} className="text-violet-400" />
          <span className="text-base font-semibold">Progresso até o envio do relatório</span>
        </div>
        <div className="flex items-center gap-3">
          {currentStage < 4 && (
            <span className="text-sm text-muted-foreground">
              Faltam <strong className="text-violet-400">{4 - currentStage}</strong> etapa{4 - currentStage !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-sm font-mono font-bold text-violet-300 tabular-nums">{pct}%</span>
        </div>
      </div>
      <div className="p-5 space-y-5">
        {/* Barra tipo temperatura — 4 segmentos */}
        <div className="flex h-4 rounded-full overflow-hidden bg-zinc-800/80 border border-zinc-700/50">
          {REPORT_STAGES.map((stage, i) => {
            const filled = (i + 1) <= currentStage
            return (
              <div
                key={stage.key}
                className={cn('flex-1 min-w-0 transition-all duration-500', filled ? stage.fill : 'bg-zinc-800')}
                style={{ width: '25%' }}
                title={`${stage.label}: ${counts[i].value}`}
              />
            )
          })}
        </div>
        {/* Legenda com contagens */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {REPORT_STAGES.map((stage, i) => {
            const Icon = stage.icon
            const { value, done } = counts[i]
            return (
              <Link
                key={stage.key}
                href={stage.href}
                className={cn(
                  'flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors',
                  done ? 'border-violet-500/30 bg-violet-500/10' : 'border-border/60 bg-zinc-900/40 opacity-70'
                )}
              >
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', done ? 'bg-violet-500/20 text-violet-400' : 'bg-zinc-700/50 text-zinc-500')}>
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-semibold leading-tight', done ? 'text-foreground' : 'text-muted-foreground')}>
                    {stage.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stage.sub}</p>
                  <p className={cn('text-2xl font-bold tabular-nums mt-1', done ? 'text-violet-300' : 'text-zinc-500')}>
                    {value}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
        <p className="text-sm text-zinc-500 text-center">
          {currentStage === 0 && 'Adicione targets e rode o recon para obter findings.'}
          {currentStage === 1 && 'Valide os findings em Findings e mova para "Aceito" para liberar o Pipeline.'}
          {currentStage === 2 && 'Abra o Pipeline e execute para gerar o relatório com IA.'}
          {currentStage === 3 && 'Revise o relatório no Pipeline e submeta ao programa no HackerOne.'}
          {currentStage === 4 && 'Pelo menos um report já foi enviado. Acompanhe no HackerOne.'}
        </p>
      </div>
    </div>
  )
}

const SEV_BAR_CFG = [
  { key: 'critical',      bar: '#ef4444', text: 'text-red-400',    label: 'Critical' },
  { key: 'high',          bar: '#f97316', text: 'text-orange-400', label: 'High' },
  { key: 'medium',        bar: '#eab308', text: 'text-yellow-400', label: 'Medium' },
  { key: 'low',           bar: '#3b82f6', text: 'text-blue-400',   label: 'Low' },
  { key: 'informational', bar: '#71717a', text: 'text-zinc-400',   label: 'Info' },
]

function DashSeverityBar({ bySev, total }: { bySev: Record<string, number>; total: number }) {
  return (
    <div className="p-5 rounded-xl border border-border" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          <Shield size={16} /> Severidade
        </h2>
        <span className="text-sm text-muted-foreground">{total} findings</span>
      </div>
      {/* Stacked bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden gap-px mb-4">
        {SEV_BAR_CFG.map(({ key, bar }) => {
          const count = bySev[key] ?? 0
          if (!count) return null
          return <div key={key} style={{ width: `${(count / (total || 1)) * 100}%`, background: bar }} />
        })}
        {total === 0 && <div className="flex-1 bg-zinc-800 rounded-full" />}
      </div>
      {/* Numbers */}
      <div className="grid grid-cols-5 gap-1">
        {SEV_BAR_CFG.map(({ key, text, label }) => {
          const count = bySev[key] ?? 0
          return (
            <div key={key} className="text-center">
              <p className={cn('text-2xl font-bold tabular-nums leading-none', text, !count && 'opacity-25')}>{count}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mt-1.5">{label}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DashPriorityQueue({ findings, onSelect }: { findings: FindingItem[]; onSelect: (f: FindingItem) => void }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden h-full" style={{ background: 'rgba(255,255,255,0.015)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <AlertCircle size={13} className="text-orange-400" />
          <span className="text-base font-semibold">Fila de Prioridade</span>
          {findings.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-orange-500/15 border border-orange-500/25 text-orange-400 text-[10px] font-bold">
              {findings.length}
            </span>
          )}
        </div>
        <Link href="/findings" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          Ver todos <ChevronRight size={10} />
        </Link>
      </div>
      {findings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
          <CheckCircle2 size={24} className="opacity-20" />
          <p className="text-xs">Nenhum finding pendente de triagem</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {findings.map(f => {
            const sev = SEV[f.severity] ?? SEV.informational
            const st = STATUS_LABEL[f.status]
            return (
              <button key={f.id} onClick={() => onSelect(f)}
                className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors group">
                <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0', sev.bg, sev.text)}>
                  {f.severity.slice(0, 4)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {f.affected_url && <span className="text-[10px] text-zinc-600 truncate max-w-[160px]">{f.affected_url}</span>}
                    <span className={cn('text-[10px] font-medium shrink-0', st?.color ?? 'text-zinc-500')}>{st?.label ?? f.status}</span>
                  </div>
                </div>
                <ChevronRight size={12} className="text-zinc-700 shrink-0 group-hover:text-zinc-400 transition-colors" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DashReadyToReport({ findings }: { findings: FindingItem[] }) {
  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ background: 'rgba(139,92,246,0.04)', borderColor: 'rgba(139,92,246,0.18)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'rgba(139,92,246,0.12)' }}>
        <div className="flex items-center gap-2">
          <CheckCircle2 size={13} className="text-violet-400" />
          <span className="text-base font-semibold">Prontos para Report</span>
          {findings.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/25 text-violet-400 text-[10px] font-bold">
              {findings.length}
            </span>
          )}
        </div>
        <Link href="/pipeline" className="text-[10px] text-violet-400/60 hover:text-violet-400 flex items-center gap-1 transition-colors">
          Pipeline <ChevronRight size={10} />
        </Link>
      </div>
      {findings.length === 0 ? (
        <div className="flex items-center justify-center py-7">
          <p className="text-xs text-muted-foreground">Nenhum finding aceito ainda</p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: 'rgba(139,92,246,0.08)' }}>
          {findings.map(f => {
            const sev = SEV[f.severity] ?? SEV.informational
            return (
              <div key={f.id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-violet-500/[0.03] transition-colors">
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', sev.dot)} />
                <p className="text-sm font-medium flex-1 truncate">{f.title}</p>
                <span className={cn('text-[9px] font-bold uppercase shrink-0', sev.text)}>{f.severity.slice(0, 4)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const JOB_TYPE_SHORT: Record<string, string> = {
  recon: 'Recon', dns_recon: 'DNS', port_scan: 'Ports', dir_fuzz: 'Fuzz',
  param_discovery: 'Params', js_analyzer: 'JS', xss_scanner: 'XSS',
  sqli_scanner: 'SQLi', idor: 'IDOR', secret_scanner: 'Secrets',
  api_scanner: 'API', pipeline: 'Pipeline',
}

function DashJobsFeed({ jobs }: { jobs: JobItem[] }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-blue-400" />
          <span className="text-base font-semibold">Jobs Recentes</span>
        </div>
        <Link href="/jobs" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          Ver todos <ChevronRight size={10} />
        </Link>
      </div>
      {jobs.length === 0 ? (
        <div className="flex items-center justify-center py-7">
          <p className="text-xs text-muted-foreground">Nenhum job recente</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {jobs.map(j => {
            const isRun = j.status === 'running', isPend = j.status === 'pending', isFail = j.status === 'failed'
            const dot = isRun || isPend ? 'bg-blue-400 animate-pulse' : isFail ? 'bg-red-400' : 'bg-emerald-400'
            const textCls = isRun ? 'text-blue-400' : isPend ? 'text-zinc-500' : isFail ? 'text-red-400' : 'text-emerald-400'
            return (
              <div key={j.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} />
                <span className="text-sm font-medium text-zinc-300 shrink-0 w-16 truncate">
                  {JOB_TYPE_SHORT[j.type] ?? j.type}
                </span>
                <span className={cn('text-[10px] font-semibold capitalize shrink-0', textCls)}>{j.status}</span>
                {j.result_summary && Object.keys(j.result_summary).length > 0 && (
                  <span className="text-[10px] text-zinc-600 truncate flex-1">
                    {Object.entries(j.result_summary).map(([k, v]) => `${k}:${v}`).join(' ')}
                  </span>
                )}
                <span className="text-[9px] text-zinc-700 shrink-0 ml-auto">
                  {new Date(j.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const H1_STATE_DOT: Record<string, { dot: string; color: string; label: string }> = {
  new:              { dot: 'bg-yellow-400',  color: 'text-yellow-400',  label: 'Novo' },
  triaged:          { dot: 'bg-blue-400',    color: 'text-blue-400',    label: 'Triagem' },
  resolved:         { dot: 'bg-emerald-400', color: 'text-emerald-400', label: 'Resolvido' },
  informative:      { dot: 'bg-zinc-500',    color: 'text-zinc-400',    label: 'Informativo' },
  duplicate:        { dot: 'bg-zinc-600',    color: 'text-zinc-500',    label: 'Duplicado' },
  'not-applicable': { dot: 'bg-zinc-700',    color: 'text-zinc-600',    label: 'N/A' },
  'needs-more-info':{ dot: 'bg-orange-400',  color: 'text-orange-400',  label: 'Mais Info' },
}

function DashH1Inbox({ reports }: { reports: H1Report[] }) {
  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ background: 'rgba(249,115,22,0.03)', borderColor: 'rgba(249,115,22,0.13)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'rgba(249,115,22,0.09)' }}>
        <div className="flex items-center gap-2">
          <Shield size={13} className="text-orange-400" />
          <span className="text-sm font-semibold">HackerOne Inbox</span>
          {reports.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-orange-500/15 border border-orange-500/25 text-orange-400 text-[10px] font-bold">
              {reports.length}
            </span>
          )}
        </div>
        <Link href="/hackerone" className="text-[10px] text-orange-400/60 hover:text-orange-400 flex items-center gap-1 transition-colors">
          Abrir inbox <ChevronRight size={10} />
        </Link>
      </div>
      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
          <Shield size={22} className="opacity-15" />
          <p className="text-xs">Sem reports ou credenciais H1 não configuradas</p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: 'rgba(249,115,22,0.07)' }}>
          {reports.slice(0, 6).map(r => {
            const st = H1_STATE_DOT[r.attributes.state] ?? H1_STATE_DOT.new
            return (
              <a key={r.id} href={`https://hackerone.com/reports/${r.id}`} target="_blank" rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-2.5 hover:bg-orange-500/[0.04] transition-colors group">
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-1.5', st.dot)} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium truncate group-hover:text-orange-200 transition-colors">{r.attributes.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn('text-[10px] font-semibold', st.color)}>{st.label}</span>
                    {r.attributes.severity_rating && r.attributes.severity_rating !== 'none' && (
                      <span className="text-[10px] font-bold uppercase text-zinc-600">{r.attributes.severity_rating}</span>
                    )}
                    <span className="text-[10px] text-zinc-700">
                      {new Date(r.attributes.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                </div>
                <ExternalLink size={10} className="text-zinc-700 shrink-0 mt-1 group-hover:text-orange-400/60 transition-colors" />
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
