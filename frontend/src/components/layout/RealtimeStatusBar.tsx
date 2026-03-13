'use client'

import { useEffect, useState } from 'react'
import { Wifi, WifiOff, Zap, Bug, BrainCircuit, RefreshCw, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRealtimeContext } from '@/contexts/RealtimeContext'
import Link from 'next/link'

export function RealtimeStatusBar() {
  const rt = useRealtimeContext()
  const [toast, setToast] = useState<{ msg: string; type: 'finding' | 'job' | 'pipeline' } | null>(null)

  // Mostra toast quando chega evento instantâneo
  useEffect(() => {
    const latest = rt.findingEvents[0]
    if (!latest) return
    setToast({ msg: `🐛 ${latest.title}`, type: 'finding' })
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [rt.findingEvents[0]?.finding_id])

  useEffect(() => {
    const latest = rt.pipelineEvents[0]
    if (!latest || latest.step === 'started') return
    const msg = latest.submitted
      ? `✅ Submetido ao H1 #${latest.h1_report_id}`
      : latest.step === 'report_done'
      ? `🤖 Relatório IA gerado`
      : latest.step === 'readiness'
      ? `📊 Score: ${latest.score}%`
      : latest.message
    setToast({ msg, type: 'pipeline' })
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [rt.pipelineEvents[0]?.timestamp])

  useEffect(() => {
    const latest = rt.jobEvents[0]
    if (!latest || latest.status !== 'completed') return
    const summary = latest.result_summary
      ? Object.entries(latest.result_summary).map(([k, v]) => `${k}:${v}`).join(' ')
      : ''
    setToast({ msg: `⚡ ${latest.job_type} concluído ${summary}`, type: 'job' })
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [rt.jobEvents[0]?.job_id])

  const hb = rt.heartbeat
  const activeJobs = hb?.active_jobs ?? 0
  const totalFindings = hb?.total_findings ?? 0
  const criticals = hb?.by_severity?.critical ?? 0

  return (
    <>
      {/* Barra de status */}
      <div className="flex items-center gap-4 px-6 py-1.5 border-b border-border bg-card/50 shrink-0 text-[11px]">

        {/* Indicador de conexão */}
        <div className={cn('flex items-center gap-1.5 font-medium', rt.connected ? 'text-emerald-400' : 'text-red-400')}>
          {rt.connected
            ? <Wifi size={11} className="shrink-0" />
            : <WifiOff size={11} className="shrink-0 animate-pulse" />
          }
          {rt.connected ? 'Real-time' : 'Reconectando…'}
        </div>

        <div className="w-px h-3 bg-border" />

        {/* Jobs ativos */}
        <Link href="/jobs" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <Zap size={11} className={cn(activeJobs > 0 ? 'text-yellow-400 animate-pulse' : 'text-muted-foreground')} />
          <span className={activeJobs > 0 ? 'text-yellow-400 font-medium' : ''}>{activeJobs} job{activeJobs !== 1 ? 's' : ''} ativos</span>
        </Link>

        {/* Total findings */}
        <Link href="/findings" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <Bug size={11} className={criticals > 0 ? 'text-red-400' : 'text-muted-foreground'} />
          <span className={criticals > 0 ? 'text-red-400 font-medium' : ''}>{totalFindings} findings</span>
          {criticals > 0 && <span className="text-red-400 font-bold">({criticals} critical)</span>}
        </Link>

        {/* Reports gerados (prioriza "prontos" quando disponível) */}
        {((hb?.total_reports_ready ?? hb?.total_reports ?? 0) > 0) && (
          <Link href="/pipeline" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <BrainCircuit size={11} className="text-violet-400" />
            <span>{hb?.total_reports_ready ?? hb?.total_reports} relatório{((hb?.total_reports_ready ?? hb?.total_reports) ?? 0) !== 1 ? 's' : ''} IA</span>
          </Link>
        )}

        {/* Prontos para submeter */}
        {(hb?.by_status?.accepted ?? 0) > 0 && (
          <Link href="/pipeline" className="flex items-center gap-1.5 text-orange-400 hover:text-orange-300 transition-colors font-medium">
            <CheckCircle2 size={11} />
            {hb?.by_status?.accepted} prontos p/ Pipeline
          </Link>
        )}

        {/* Spinner quando está processando */}
        {activeJobs > 0 && (
          <RefreshCw size={10} className="animate-spin text-muted-foreground ml-auto" />
        )}
      </div>

      {/* Toast de notificação de evento instantâneo */}
      {toast && (
        <div className={cn(
          'fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-xl border shadow-xl backdrop-blur-md text-sm font-medium',
          'transition-all animate-in slide-in-from-bottom-2',
          toast.type === 'finding'  ? 'bg-red-950/90 border-red-500/30 text-red-200' :
          toast.type === 'pipeline' ? 'bg-violet-950/90 border-violet-500/30 text-violet-200' :
                                      'bg-emerald-950/90 border-emerald-500/30 text-emerald-200'
        )}>
          {toast.msg}
        </div>
      )}
    </>
  )
}
