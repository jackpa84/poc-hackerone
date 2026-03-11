'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Bug, DollarSign, Zap, RefreshCw,
  AlertCircle, ExternalLink, ChevronRight, ChevronDown, Clock, CheckCircle2, XCircle,
  Info, Shield, Crosshair, Activity,
  BrainCircuit, Radio, Terminal, X, Send, FileText, Loader2,
  Globe2, Network, Key, Search, Link2, Layers, TrendingUp, Briefcase,
} from 'lucide-react'
import { SkeletonCard, SkeletonKPI, Skeleton } from '@/components/ui/skeleton'
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
            hovColor: 'hov-red',
          },
          {
            type: 'bounty' as const,
            icon: <DollarSign size={15} className="text-emerald-400" />,
            bg: 'bg-emerald-500/10',
            label: 'Bounty Ganho',
            value: `$${(data?.bounty_earned ?? 0).toLocaleString()}`,
            hovColor: 'hov-emerald',
          },
          {
            type: 'targets' as const,
            icon: <Crosshair size={15} className="text-blue-400" />,
            bg: 'bg-blue-500/10',
            label: 'Targets In-Scope',
            value: data?.targets_in_scope ?? 0,
            hovColor: 'hov-cyan',
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
          },
          {
            type: 'ready' as const,
            icon: <CheckCircle2 size={15} className="text-violet-400" />,
            bg: 'bg-violet-500/10',
            label: 'Prontos p/ Report',
            value: data?.ready_to_report?.length ?? 0,
            href: '/pipeline',
            hovColor: 'hov-violet',
          },
        ].map(card => (
          <Tooltip key={card.type} content={getKpiTooltip(card.type, data)}>
            <KpiCard {...card} accent={undefined} />
          </Tooltip>
        ))}
      </div>

      {/* ── Linha 1: Tipos de Vulnerabilidade ────────────────────────────── */}
      <VulnTypeRow findings={allFindings} />

      {/* ── Linha 2: Status de Envio ao HackerOne ────────────────────────── */}
      <H1SubmissionRow findings={allFindings} aiReports={aiReports} />

      {/* Severity Boxes with Tooltips */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Shield size={13} className="text-muted-foreground" />
          Bugs por Severidade
          <span className="text-[10px] text-muted-foreground font-normal">(clique para filtrar)</span>
        </h2>
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
                  <p className={cn('text-lg font-bold leading-none', s.text)}>{count}</p>
                  <p className={cn('text-[9px] font-semibold uppercase mt-1', s.text)}>{sev.slice(0,4)}</p>
                </button>
              </Tooltip>
            )
          })}
        </div>
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

      {/* ── AI Report Log ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4">

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

      </div>
      {/* ── fim AI Log ───────────────────────────────────────────────────── */}

      {/* ── Análise da IA + Log do Sistema ───────────────────────────────── */}
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

      {/* ── Log do Sistema ────────────────────────────────────────────────── */}
      <SystemActivityLog rt={rt} recentJobs={data?.recent_jobs ?? []} />

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
  const [autoScroll, setAutoScroll] = useState(true)
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80">
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
      <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-zinc-900/60 text-[10px] font-mono text-zinc-600">
        <span className="text-emerald-500/70">
          ● {rt.heartbeat?.active_jobs ?? 0} job{(rt.heartbeat?.active_jobs ?? 0) !== 1 ? 's' : ''} ativos
        </span>
        <span className="text-red-500/70">
          ● {rt.findingEvents.length} finding{rt.findingEvents.length !== 1 ? 's' : ''} detectado{rt.findingEvents.length !== 1 ? 's' : ''} nesta sessão
        </span>
        <span className="text-violet-500/70">
          ● {rt.pipelineEvents.filter(e => e.submitted).length} submetido{rt.pipelineEvents.filter(e => e.submitted).length !== 1 ? 's' : ''} ao H1
        </span>
        <span className="ml-auto">
          {rt.heartbeat ? new Date().toLocaleTimeString('pt-BR') : '—'}
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
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Bug size={13} className="text-muted-foreground" />
        Tipos de Vulnerabilidade
        <span className="text-[10px] text-muted-foreground font-normal">(passe o mouse para detalhes)</span>
      </h2>
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Send size={13} className="text-emerald-400" />
          Jornada de Envio — HackerOne
        </h2>
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
  icon, bg, label, value, href, pulse, accent, hovColor
}: {
  icon: React.ReactNode
  bg: string
  label: string
  value: string | number
  href?: string
  pulse?: boolean
  accent?: string
  hovColor?: string
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
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
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
