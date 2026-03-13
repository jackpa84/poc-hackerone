'use client'
/**
 * hooks/useRealtime.ts — Conexão SSE (Server-Sent Events) para dados em tempo real
 *
 * Usa fetch + ReadableStream ao invés de EventSource porque
 * EventSource não suporta headers de autenticação (precisamos do JWT).
 *
 * Eventos recebidos:
 *   connected      → conexão estabelecida
 *   heartbeat      → stats completas a cada 3s
 *   job_update     → job mudou de status (instantâneo)
 *   finding_new    → novo finding detectado (instantâneo)
 *   pipeline_step  → passo do pipeline executado (instantâneo)
 *   recon_done     → reconhecimento concluído com resumo
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

// ── Types ──────────────────────────────────────────────────────────────────

export interface JobEvent {
  job_id: string
  job_type: string
  status: string
  result_summary: Record<string, number> | null
  error: string | null
}

export interface FindingEvent {
  finding_id: string
  title: string
  severity: string
  finding_type: string
  affected_url: string
  timestamp: number
}

export interface PipelineEvent {
  job_id: string
  step: string
  message: string
  score: number | null
  submitted: boolean
  h1_report_id: string | null
  timestamp: number
}

export interface ReconDoneEvent {
  target: string
  subdomains: number
  hosts: number
  urls: number
  timestamp: number
}

export interface Heartbeat {
  // Findings
  total_findings: number
  findings_1h?: number
  findings_24h?: number
  by_severity: Record<string, number>
  by_status: Record<string, number>

  // Jobs
  active_jobs: number
  completed_today?: number
  failed_today?: number
  jobs_by_type?: Record<string, number>
  recent_jobs: {
    id: string
    type: string
    status: string
    result_summary: Record<string, number> | null
    created_at: string
  }[]
  pipeline_jobs: {
    id: string
    finding_id: string
    status: string
    result: Record<string, unknown> | null
    logs: string[]
    created_at: string
  }[]

  // Fila ARQ / Redis
  queue_depth?: number
  workers_active?: number
  redis_memory_mb?: number

  // Reports / Pipeline IA
  total_reports: number
  total_reports_ready?: number
  reports_today?: number
  avg_review_score?: number | null

  // Targets
  total_targets?: number
  targets_in_scope?: number
  targets_with_recon_24h?: number

  // Bounty
  bounty_earned?: number

  // Saúde dos containers Docker
  containers?: {
    name: string
    state: string
    status: string
    started_at: string | null
    cpu_pct: number | null
    mem_pct: number | null
    mem_mb: number | null
  }[]
}

export interface RealtimeState {
  connected: boolean
  heartbeat: Heartbeat | null
  jobEvents: JobEvent[]
  findingEvents: FindingEvent[]
  pipelineEvents: PipelineEvent[]
  reconEvents: ReconDoneEvent[]
  lastUpdate: number
}

const DEFAULT_STATE: RealtimeState = {
  connected: false,
  heartbeat: null,
  jobEvents: [],
  findingEvents: [],
  pipelineEvents: [],
  reconEvents: [],
  lastUpdate: 0,
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useRealtime(): RealtimeState {
  const [state, setState] = useState<RealtimeState>(DEFAULT_STATE)
  const abortRef = useRef<AbortController | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (!token) return

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch(`${API_URL}/stream/events?token=${token}`, {
        signal: ctrl.signal,
        headers: { Accept: 'text/event-stream' },
      })

      if (!res.ok || !res.body) {
        scheduleReconnect(connect, ctrl, retryRef)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (!ctrl.signal.aborted) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            handleEvent(event, setState)
          } catch {}
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
    }

    setState(prev => ({ ...prev, connected: false }))
    scheduleReconnect(connect, ctrl, retryRef)
  }, [])

  useEffect(() => {
    // Espera o token estar disponível
    const delay = setTimeout(() => connect(), 500)
    return () => {
      clearTimeout(delay)
      clearTimeout(retryRef.current ?? undefined)
      abortRef.current?.abort()
    }
  }, [connect])

  return state
}

// ── Helpers ────────────────────────────────────────────────────────────────

function scheduleReconnect(
  connect: () => void,
  ctrl: AbortController,
  retryRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
) {
  if (ctrl.signal.aborted) return
  retryRef.current = setTimeout(() => connect(), 4000)
}

function handleEvent(
  event: Record<string, unknown>,
  setState: React.Dispatch<React.SetStateAction<RealtimeState>>,
) {
  const now = Date.now()
  const type = event.type as string

  setState(prev => {
    switch (type) {
      case 'connected':
        return { ...prev, connected: true, lastUpdate: now }

      case 'heartbeat':
        return {
          ...prev,
          connected: true,
          heartbeat: event as unknown as Heartbeat,
          lastUpdate: now,
        }

      case 'job_update':
        return {
          ...prev,
          jobEvents: [{ ...(event as unknown as JobEvent), } , ...prev.jobEvents].slice(0, 20),
          lastUpdate: now,
        }

      case 'finding_new':
        return {
          ...prev,
          findingEvents: [
            { ...(event as unknown as FindingEvent), timestamp: now },
            ...prev.findingEvents,
          ].slice(0, 30),
          lastUpdate: now,
        }

      case 'pipeline_step':
        return {
          ...prev,
          pipelineEvents: [
            { ...(event as unknown as PipelineEvent), timestamp: now },
            ...prev.pipelineEvents,
          ].slice(0, 50),
          lastUpdate: now,
        }

      case 'recon_done':
        return {
          ...prev,
          reconEvents: [
            { ...(event as unknown as ReconDoneEvent), timestamp: now },
            ...prev.reconEvents,
          ].slice(0, 20),
          lastUpdate: now,
        }

      default:
        return prev
    }
  })
}
