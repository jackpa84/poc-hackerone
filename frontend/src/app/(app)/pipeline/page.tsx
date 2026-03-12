'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  SendHorizonal, RefreshCw, Play, Zap, ChevronRight,
  CheckCircle2, Clock, Loader2, XCircle, Globe, Bug,
  FileText, Shield, AlertCircle, ExternalLink, ChevronDown,
  Bot, Sparkles, TrendingUp, Ban,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { Finding } from '@/types/api'

// ── Types ──────────────────────────────────────────────────────────────────

interface PipelineJob {
  id: string
  finding_id: string
  team_handle: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  result_summary: {
    score?: number
    review_score?: number
    review_approved?: boolean
    submitted?: boolean
    h1_report_id?: string
    reason?: string
    error?: string
  } | null
  error: string | null
  logs: string[]
  started_at: string | null
  finished_at: string | null
  created_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const SEV_DOT: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-orange-500',
  medium: 'bg-yellow-500', low: 'bg-blue-400', informational: 'bg-zinc-500',
}
const SEV_TEXT: Record<string, string> = {
  critical: 'text-red-400', high: 'text-orange-400',
  medium: 'text-yellow-400', low: 'text-blue-400', informational: 'text-zinc-400',
}
const SEV_BADGE: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/25',
  high:     'bg-orange-500/15 text-orange-400 border-orange-500/25',
  medium:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  low:      'bg-blue-500/15 text-blue-400 border-blue-500/25',
  informational: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25',
}

const PIPELINE_STAGES = [
  { key: 'sync',   label: 'H1 Sync',   icon: Globe,     color: 'text-blue-400',    bg: 'bg-blue-500/10',    desc: 'Programas sincronizados' },
  { key: 'recon',  label: 'Recon',     icon: Zap,       color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  desc: 'Subfinder + httpx + nuclei' },
  { key: 'find',   label: 'Finding',   icon: Bug,       color: 'text-red-400',     bg: 'bg-red-500/10',     desc: 'Vuln capturada' },
  { key: 'ai',     label: 'Relatório', icon: Bot,       color: 'text-violet-400',  bg: 'bg-violet-500/10',  desc: 'IA gera o draft' },
  { key: 'review', label: 'Revisão IA',icon: Sparkles,  color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', desc: 'Score 0–100' },
  { key: 'submit', label: 'Enviado H1',icon: Shield,    color: 'text-emerald-400', bg: 'bg-emerald-500/10', desc: 'Auto-submetido' },
]

// ── Main ───────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [findings, setFindings]     = useState<Finding[]>([])
  const [jobs, setJobs]             = useState<PipelineJob[]>([])
  const [loading, setLoading]       = useState(true)
  const [running, setRunning]       = useState(false)
  const [runningId, setRunningId]   = useState<string | null>(null)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [fRes, jRes] = await Promise.all([
        api.get('/findings'),
        api.get('/pipeline/jobs'),
      ])
      setFindings(fRes.data)
      setJobs(jRes.data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'pending' || j.status === 'running')
    if (!hasActive) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [jobs, load])

  const jobByFinding = jobs.reduce<Record<string, PipelineJob>>((acc, j) => {
    if (!acc[j.finding_id] || new Date(j.created_at) > new Date(acc[j.finding_id].created_at))
      acc[j.finding_id] = j
    return acc
  }, {})

  const runOne = async (finding: Finding) => {
    setRunningId(finding.id)
    try { await api.post('/pipeline/run', { finding_id: finding.id }); await load() } catch {}
    setRunningId(null)
  }

  const runAll = async () => {
    setRunning(true)
    try { await api.post('/pipeline/run-all'); await load() } catch {}
    setRunning(false)
  }

  const accepted   = findings.filter(f => f.status === 'accepted')
  const submitted  = jobs.filter(j => j.result_summary?.submitted)
  const failed     = jobs.filter(j => j.status === 'failed')
  const inProgress = jobs.filter(j => j.status === 'pending' || j.status === 'running')

  if (loading) return <PipelineSkeleton />

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <SendHorizonal size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Pipeline Automático</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              H1 Sync → Recon → Finding → Relatório IA → Revisão IA →{' '}
              <span className="text-emerald-400 font-medium">Auto-envio H1</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="p-2 rounded-lg border border-border hover:bg-accent transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={13} className="text-muted-foreground" />
          </button>
          <button
            onClick={runAll}
            disabled={running || accepted.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
            style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa' }}
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Executar todos ({accepted.length})
          </button>
        </div>
      </div>

      {/* ── Pipeline Flow ── */}
      <div
        className="rounded-2xl p-5 overflow-x-auto"
        style={{ background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-4">Fluxo end-to-end</p>
        <div className="flex items-start gap-1 min-w-max">
          {PIPELINE_STAGES.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={s.key} className="flex items-start gap-1">
                <div className={cn('flex flex-col items-center gap-2 w-[100px] px-2 py-3 rounded-xl border', s.bg,
                  s.key === 'submit'
                    ? 'border-emerald-500/30'
                    : s.key === 'review'
                    ? 'border-fuchsia-500/25'
                    : 'border-white/5'
                )}>
                  <div className={cn('p-2 rounded-lg', s.bg)}>
                    <Icon size={14} className={s.color} />
                  </div>
                  <p className="text-[11px] font-semibold text-zinc-100 text-center leading-tight">{s.label}</p>
                  <p className="text-[9px] text-zinc-600 text-center leading-tight">{s.desc}</p>
                </div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <div className="flex items-center mt-7">
                    <ChevronRight size={16} className="text-zinc-700" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard value={accepted.length}   label="Aceitos"    color="text-blue-400"    bg="bg-blue-500/10"    border="border-blue-500/15" />
        <KpiCard value={inProgress.length} label="Em execução" color="text-yellow-400" bg="bg-yellow-500/10"  border="border-yellow-500/15" pulse={inProgress.length > 0} />
        <KpiCard value={submitted.length}  label="Enviados H1" color="text-emerald-400" bg="bg-emerald-500/10" border="border-emerald-500/20" />
        <KpiCard value={failed.length}     label="Com erro"   color="text-red-400"     bg="bg-red-500/10"     border="border-red-500/15" />
      </div>

      {/* ── Findings Queue ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Bug size={13} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">Fila de Findings</h2>
          <span className="text-xs text-muted-foreground">({findings.length})</span>
        </div>

        {findings.length === 0 ? (
          <EmptyState icon={<AlertCircle size={22} className="opacity-20" />} text="Nenhum finding. Execute o recon primeiro." />
        ) : (
          <div className="space-y-2">
            {findings.map(f => {
              const pJob = jobByFinding[f.id]
              return (
                <FindingRow
                  key={f.id}
                  finding={f}
                  job={pJob}
                  isRunning={runningId === f.id}
                  expanded={expandedJob === (pJob?.id ?? '')}
                  onRun={() => runOne(f)}
                  onToggle={() => setExpandedJob(
                    expandedJob === (pJob?.id ?? '') ? null : (pJob?.id ?? null)
                  )}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* ── Submitted Box ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Shield size={13} className="text-emerald-400" />
          <h2 className="text-sm font-semibold">Enviados ao HackerOne</h2>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
            {submitted.length}
          </span>
        </div>

        {submitted.length === 0 ? (
          <EmptyState
            icon={<Shield size={22} className="opacity-20" />}
            text="Nenhum report enviado ainda. O pipeline envia automaticamente quando review_approved + score ≥ 70."
          />
        ) : (
          <div
            className="rounded-2xl border overflow-hidden"
            style={{ background: '#04080f', borderColor: 'rgba(16,185,129,0.15)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'rgba(16,185,129,0.1)', background: 'rgba(16,185,129,0.04)' }}>
              <CheckCircle2 size={14} className="text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-300">Reports submetidos com sucesso</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'rgba(16,185,129,0.08)' }}>
              {submitted.map(job => {
                const finding = findings.find(f => f.id === job.finding_id)
                return (
                  <SubmittedRow key={job.id} job={job} finding={finding} />
                )
              })}
            </div>
          </div>
        )}
      </section>

    </div>
  )
}

// ── Finding Row ─────────────────────────────────────────────────────────────

function FindingRow({
  finding, job, isRunning, expanded, onRun, onToggle,
}: {
  finding: Finding
  job: PipelineJob | undefined
  isRunning: boolean
  expanded: boolean
  onRun: () => void
  onToggle: () => void
}) {
  const stageIdx = getPipelineStageIndex(finding, job)
  const isSubmitted = job?.result_summary?.submitted

  return (
    <div
      className="rounded-xl border overflow-hidden transition-all"
      style={{
        borderColor: isSubmitted
          ? 'rgba(16,185,129,0.2)'
          : job?.status === 'failed'
          ? 'rgba(239,68,68,0.15)'
          : 'rgba(255,255,255,0.06)',
        background: '#0a0a0f',
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">

        {/* Severity dot */}
        <div className={cn('w-2 h-2 rounded-full shrink-0', SEV_DOT[finding.severity] ?? 'bg-zinc-500')} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{finding.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={cn('text-[10px] font-bold uppercase', SEV_TEXT[finding.severity])}>
              {finding.severity}
            </span>
            <span className="text-[10px] text-muted-foreground capitalize">{finding.status}</span>
            {isSubmitted && job?.result_summary?.h1_report_id && (
              <a
                href={`https://hackerone.com/reports/${job.result_summary.h1_report_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-emerald-400 hover:underline"
              >
                <ExternalLink size={8} />
                H1 #{job.result_summary.h1_report_id}
              </a>
            )}
          </div>
        </div>

        {/* Stage progress */}
        <div className="hidden sm:flex items-center gap-0.5 shrink-0">
          {PIPELINE_STAGES.map((s, i) => {
            const Icon = s.icon
            const reached = i <= stageIdx
            return (
              <div key={s.key} className="flex items-center gap-0.5">
                <div className={cn(
                  'w-5 h-5 rounded flex items-center justify-center transition-all',
                  reached ? s.bg : 'bg-zinc-900',
                )}>
                  <Icon size={9} className={reached ? s.color : 'text-zinc-700'} />
                </div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <div className={cn('w-2.5 h-px', reached ? 'bg-zinc-600' : 'bg-zinc-800')} />
                )}
              </div>
            )
          })}
        </div>

        {/* Review score */}
        {job?.result_summary?.review_score != null && (
          <span className={cn(
            'shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-lg border',
            job.result_summary.review_approved
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
          )}>
            Rev {job.result_summary.review_score}/100
          </span>
        )}

        {/* Status */}
        {job && <StatusBadge status={job.status} />}

        {/* Actions */}
        <div className="flex gap-1.5 shrink-0">
          {job && job.logs.length > 0 && (
            <button
              onClick={onToggle}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] rounded-lg border border-border text-muted-foreground hover:bg-accent transition-all"
            >
              <ChevronDown size={10} className={cn('transition-transform', expanded && 'rotate-180')} />
              Logs
            </button>
          )}
          <button
            onClick={onRun}
            disabled={isRunning || job?.status === 'running' || job?.status === 'pending'}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed',
              finding.status === 'accepted'
                ? 'bg-violet-500/10 border-violet-500/25 text-violet-400 hover:bg-violet-500/20'
                : 'border-border text-muted-foreground hover:bg-accent'
            )}
          >
            {isRunning || job?.status === 'running' || job?.status === 'pending'
              ? <Loader2 size={10} className="animate-spin" />
              : <Play size={10} />
            }
            {finding.status === 'accepted' ? 'Executar' : 'Forçar'}
          </button>
        </div>
      </div>

      {/* Logs panel */}
      {expanded && job && (
        <div
          className="border-t font-mono text-[11px] max-h-52 overflow-y-auto p-3 space-y-0.5"
          style={{ borderColor: 'rgba(255,255,255,0.05)', background: '#060608' }}
        >
          {job.logs.length === 0 ? (
            <p className="text-zinc-700">Sem logs ainda...</p>
          ) : (
            job.logs.map((line, i) => (
              <div key={i} className={cn(
                'leading-relaxed',
                line.includes('✅') ? 'text-emerald-400' :
                line.includes('⚠') ? 'text-yellow-400' :
                line.includes('Erro') || line.includes('erro') ? 'text-red-400' :
                'text-zinc-500'
              )}>
                {line}
              </div>
            ))
          )}
          {job.result_summary?.submitted && job.result_summary.h1_report_id && (
            <a
              href={`https://hackerone.com/reports/${job.result_summary.h1_report_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-emerald-400 hover:underline mt-2 font-sans"
            >
              <ExternalLink size={10} />
              Ver report #{job.result_summary.h1_report_id} no HackerOne
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── Submitted Row ────────────────────────────────────────────────────────────

function SubmittedRow({ job, finding }: { job: PipelineJob; finding: Finding | undefined }) {
  const score     = job.result_summary?.score ?? 0
  const revScore  = job.result_summary?.review_score
  const h1Id      = job.result_summary?.h1_report_id
  const sev       = finding?.severity ?? 'informational'

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-emerald-500/[0.03] transition-colors group">

      {/* Icon */}
      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
        <CheckCircle2 size={14} className="text-emerald-400" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-100 truncate">
          {finding?.title ?? `Finding ${job.finding_id.slice(-8)}`}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={cn('text-[10px] font-bold uppercase border rounded px-1.5 py-px', SEV_BADGE[sev])}>
            {sev}
          </span>
          <span className="text-[10px] text-zinc-600">
            {new Date(job.finished_at ?? job.created_at).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', year: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>
      </div>

      {/* Scores */}
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        {revScore != null && (
          <div className="text-center">
            <p className="text-[10px] text-zinc-600">Revisão</p>
            <p className="text-sm font-bold text-fuchsia-400">{revScore}/100</p>
          </div>
        )}
        <div className="text-center">
          <p className="text-[10px] text-zinc-600">Prontidão</p>
          <p className={cn('text-sm font-bold', score >= 90 ? 'text-emerald-400' : score >= 70 ? 'text-yellow-400' : 'text-orange-400')}>
            {score}%
          </p>
        </div>
      </div>

      {/* H1 link */}
      {h1Id ? (
        <a
          href={`https://hackerone.com/reports/${h1Id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-emerald-400 border border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all"
        >
          <ExternalLink size={11} />
          #{h1Id}
        </a>
      ) : (
        <span className="shrink-0 text-[10px] text-zinc-600">ID pendente</span>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPipelineStageIndex(f: Finding, job: PipelineJob | undefined): number {
  if (job?.result_summary?.submitted) return 5
  if (job?.status === 'completed') return 4
  if (job?.status === 'running' || job?.status === 'pending') return 3
  if (f.status === 'accepted' || f.status === 'triaging') return 2
  return 1
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    pending:   { icon: <Clock size={10} />,                            label: 'Pendente',  cls: 'text-zinc-400' },
    running:   { icon: <Loader2 size={10} className="animate-spin" />, label: 'Rodando',   cls: 'text-blue-400' },
    completed: { icon: <CheckCircle2 size={10} />,                     label: 'Concluído', cls: 'text-emerald-400' },
    failed:    { icon: <XCircle size={10} />,                          label: 'Falhou',    cls: 'text-red-400' },
  }
  const c = cfg[status] ?? cfg.pending
  return (
    <span className={cn('shrink-0 flex items-center gap-1 text-[10px] font-medium', c.cls)}>
      {c.icon} {c.label}
    </span>
  )
}

function KpiCard({ value, label, color, bg, border, pulse }: {
  value: number; label: string; color: string; bg: string; border: string; pulse?: boolean
}) {
  return (
    <div className={cn('rounded-xl border p-4', bg, border)} style={{ background: '#0a0a0f' }}>
      <p className={cn('text-2xl font-bold tabular-nums', color, pulse && value > 0 && 'animate-pulse')}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
    </div>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 py-10 rounded-xl border border-dashed"
      style={{ borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <div className="text-zinc-700">{icon}</div>
      <p className="text-xs text-muted-foreground text-center max-w-xs">{text}</p>
    </div>
  )
}

function PipelineSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-muted/30" />
        <div className="space-y-2">
          <div className="h-5 w-40 rounded bg-muted/40" />
          <div className="h-3 w-64 rounded bg-muted/20" />
        </div>
      </div>
      <div className="h-28 rounded-2xl bg-muted/10" />
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted/10" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-muted/10" />
        ))}
      </div>
    </div>
  )
}
