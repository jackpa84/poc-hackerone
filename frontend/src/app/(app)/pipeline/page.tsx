'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  SendHorizonal, RefreshCw, Play, Zap, ChevronRight,
  CheckCircle2, Clock, Loader2, XCircle, Globe, Bug,
  FileText, Shield, AlertCircle, ExternalLink,
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

const PIPELINE_STAGES = [
  { key: 'sync',    label: 'H1 Sync',    icon: Globe,       color: 'text-blue-400',    desc: 'Programas e targets sincronizados' },
  { key: 'recon',   label: 'Recon',      icon: Zap,         color: 'text-yellow-400',  desc: 'Subfinder + httpx + gau' },
  { key: 'finding', label: 'Finding',    icon: Bug,         color: 'text-red-400',     desc: 'Vulnerabilidade capturada' },
  { key: 'report',  label: 'Relatório',  icon: FileText,    color: 'text-violet-400',  desc: 'IA gera o draft com Claude' },
  { key: 'submit',  label: 'Submissão',  icon: Shield,      color: 'text-emerald-400', desc: 'Enviado ao HackerOne' },
]

// ── Main ───────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [findings, setFindings] = useState<Finding[]>([])
  const [jobs, setJobs] = useState<PipelineJob[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
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

  // Polling quando há jobs ativos
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'pending' || j.status === 'running')
    if (!hasActive) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [jobs, load])

  // Map finding_id → latest pipeline job
  const jobByFinding = jobs.reduce<Record<string, PipelineJob>>((acc, j) => {
    if (!acc[j.finding_id] || new Date(j.created_at) > new Date(acc[j.finding_id].created_at)) {
      acc[j.finding_id] = j
    }
    return acc
  }, {})

  const runOne = async (finding: Finding) => {
    setRunningId(finding.id)
    try {
      await api.post('/pipeline/run', { finding_id: finding.id })
      await load()
    } catch {}
    setRunningId(null)
  }

  const runAll = async () => {
    setRunning(true)
    try {
      await api.post('/pipeline/run-all')
      await load()
    } catch {}
    setRunning(false)
  }

  // Statistics
  const accepted = findings.filter(f => f.status === 'accepted')
  const submitted = jobs.filter(j => j.result_summary?.submitted).length
  const failed = jobs.filter(j => j.status === 'failed').length
  const inProgress = jobs.filter(j => j.status === 'pending' || j.status === 'running').length

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
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/10">
            <SendHorizonal size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Pipeline Automático</h1>
            <p className="text-sm text-muted-foreground">H1 Sync → Recon → Finding → Relatório IA → Submissão</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border border-border rounded-lg hover:bg-accent transition-colors">
            <RefreshCw size={14} className="text-muted-foreground" />
          </button>
          <button
            onClick={runAll}
            disabled={running || accepted.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500/15 border border-violet-500/30 rounded-lg text-sm text-violet-400 font-medium hover:bg-violet-500/25 transition-all disabled:opacity-40"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Executar Todos ({accepted.length} aceitos)
          </button>
        </div>
      </div>

      {/* Pipeline Flow Diagram */}
      <div className="flex items-center gap-1 p-4 rounded-xl bg-card border border-border overflow-x-auto">
        {PIPELINE_STAGES.map((stage, i) => {
          const Icon = stage.icon
          return (
            <div key={stage.key} className="flex items-center gap-1 shrink-0">
              <div className="flex flex-col items-center gap-1.5 px-3">
                <div className={cn('p-2 rounded-xl', stage.color.replace('text-', 'bg-').replace('400', '500/15'))}>
                  <Icon size={15} className={stage.color} />
                </div>
                <span className="text-[11px] font-semibold text-foreground">{stage.label}</span>
                <span className="text-[9px] text-muted-foreground text-center max-w-[80px]">{stage.desc}</span>
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <ChevronRight size={16} className="text-muted-foreground/40 shrink-0" />
              )}
            </div>
          )
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Findings aceitos" value={accepted.length} color="text-blue-400" bg="bg-blue-500/10" />
        <StatCard label="Em execução" value={inProgress} color="text-yellow-400" bg="bg-yellow-500/10" pulse={inProgress > 0} />
        <StatCard label="Submetidos H1" value={submitted} color="text-emerald-400" bg="bg-emerald-500/10" />
        <StatCard label="Com erro" value={failed} color="text-red-400" bg="bg-red-500/10" />
      </div>

      {/* Findings table */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Findings — Status no Pipeline</h2>

        {findings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground border border-dashed border-border rounded-xl">
            <AlertCircle size={24} className="opacity-20" />
            <p className="text-sm">Nenhum finding. Execute o recon primeiro.</p>
          </div>
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
      </div>

      {/* Recent pipeline activity */}
      {jobs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3">Atividade Recente</h2>
          <div className="space-y-1.5">
            {jobs.slice(0, 8).map(j => (
              <div key={j.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border text-xs">
                <JobStatusIcon status={j.status} />
                <span className="flex-1 text-muted-foreground truncate">
                  {j.logs[j.logs.length - 1] ?? 'Aguardando...'}
                </span>
                {j.result_summary?.score != null && (
                  <span className={cn(
                    'shrink-0 font-semibold',
                    j.result_summary.score >= 70 ? 'text-emerald-400' : 'text-yellow-400'
                  )}>
                    {j.result_summary.score}%
                  </span>
                )}
                {j.result_summary?.submitted && (
                  <span className="shrink-0 text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 size={11} /> H1 #{j.result_summary.h1_report_id}
                  </span>
                )}
                <span className="shrink-0 text-muted-foreground/60">
                  {new Date(j.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

// ── Finding Row ────────────────────────────────────────────────────────────

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
  const stage = getPipelineStage(finding, job)

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-3 p-3.5 bg-card">

        {/* Severity dot */}
        <div className={cn('w-2 h-2 rounded-full shrink-0', SEV_DOT[finding.severity] ?? 'bg-zinc-500')} />

        {/* Finding info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{finding.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn('text-[10px] font-semibold uppercase', SEV_TEXT[finding.severity])}>
              {finding.severity}
            </span>
            <span className="text-[10px] text-muted-foreground capitalize">
              {finding.status}
            </span>
          </div>
        </div>

        {/* Pipeline stage indicator */}
        <div className="flex items-center gap-1 shrink-0">
          {PIPELINE_STAGES.map((s, i) => {
            const reached = i <= stage.index
            const current = i === stage.index
            const Icon = s.icon
            return (
              <div key={s.key} className="flex items-center gap-0.5">
                <div className={cn(
                  'w-5 h-5 rounded flex items-center justify-center transition-all',
                  reached ? s.color.replace('text-', 'bg-').replace('400', '500/20') : 'bg-muted/40',
                  current && 'ring-1 ring-current ring-offset-1 ring-offset-background',
                )}>
                  <Icon size={9} className={reached ? s.color : 'text-muted-foreground/30'} />
                </div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <div className={cn('w-3 h-px', reached ? 'bg-muted-foreground/40' : 'bg-muted/20')} />
                )}
              </div>
            )
          })}
        </div>

        {/* Status badge */}
        {job && (
          <div className="shrink-0">
            <JobStatusIcon status={job.status} withLabel />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-1.5 shrink-0">
          {job && (
            <button
              onClick={onToggle}
              className="px-2 py-1 text-[10px] border border-border rounded-lg text-muted-foreground hover:bg-accent transition-all"
            >
              {expanded ? 'Fechar' : 'Logs'}
            </button>
          )}
          <button
            onClick={onRun}
            disabled={isRunning || job?.status === 'running' || job?.status === 'pending'}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium border rounded-lg transition-all',
              finding.status === 'accepted'
                ? 'bg-violet-500/15 border-violet-500/30 text-violet-400 hover:bg-violet-500/25'
                : 'border-border text-muted-foreground hover:bg-accent',
              'disabled:opacity-40 disabled:cursor-not-allowed'
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

      {/* Expanded logs */}
      {expanded && job && (
        <div className="border-t border-border bg-zinc-950 p-3 font-mono text-[11px] space-y-0.5 max-h-48 overflow-y-auto">
          {job.logs.length === 0 ? (
            <p className="text-zinc-600">Sem logs ainda...</p>
          ) : (
            job.logs.map((line, i) => (
              <div key={i} className={cn(
                'leading-relaxed',
                line.includes('✅') ? 'text-emerald-400' :
                line.includes('Erro') || line.includes('erro') ? 'text-red-400' :
                line.includes('⚠') ? 'text-yellow-400' :
                'text-zinc-400'
              )}>
                {line}
              </div>
            ))
          )}
          {job.result_summary?.submitted && (
            <a
              href={`https://hackerone.com/reports/${job.result_summary.h1_report_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-emerald-400 hover:underline mt-1"
            >
              <ExternalLink size={9} />
              Ver report #{ job.result_summary.h1_report_id} no HackerOne
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getPipelineStage(f: Finding, job: PipelineJob | undefined) {
  if (job?.result_summary?.submitted) return { index: 4, label: 'Submetido' }
  if (job?.status === 'completed' && job?.result_summary?.score != null) return { index: 3, label: 'Relatório gerado' }
  if (job?.status === 'running' || job?.status === 'pending') return { index: 3, label: 'Gerando relatório...' }
  if (f.status === 'accepted') return { index: 2, label: 'Aceito — pronto para pipeline' }
  if (f.status === 'triaging') return { index: 2, label: 'Em triagem' }
  if (f.status === 'new') return { index: 2, label: 'Novo finding' }
  if (f.status === 'resolved') return { index: 4, label: 'Resolvido' }
  return { index: 1, label: 'Recon' }
}

function JobStatusIcon({ status, withLabel }: { status: string; withLabel?: boolean }) {
  const config = {
    pending:   { icon: <Clock size={11} />,   color: 'text-zinc-400',    label: 'Pendente' },
    running:   { icon: <Loader2 size={11} className="animate-spin" />, color: 'text-blue-400', label: 'Rodando' },
    completed: { icon: <CheckCircle2 size={11} />, color: 'text-emerald-400', label: 'Concluído' },
    failed:    { icon: <XCircle size={11} />,  color: 'text-red-400',    label: 'Falhou' },
  }[status] ?? { icon: <Clock size={11} />, color: 'text-zinc-400', label: status }

  return (
    <span className={cn('flex items-center gap-1 text-[10px] font-medium', config.color)}>
      {config.icon}
      {withLabel && config.label}
    </span>
  )
}

function StatCard({ label, value, color, bg, pulse }: {
  label: string; value: number; color: string; bg: string; pulse?: boolean
}) {
  return (
    <div className="p-3.5 rounded-xl bg-card border border-border">
      <p className={cn('text-2xl font-bold', color, pulse && value > 0 && 'animate-pulse')}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
    </div>
  )
}
