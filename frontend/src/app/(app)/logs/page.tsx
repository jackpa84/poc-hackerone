'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollText, RefreshCw, Circle, ChevronDown } from 'lucide-react'
import { RichTooltip } from '@/components/ui/rich-tooltip'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

interface Service {
  key: string
  label: string
  description: string
  state: string
  status: string
  status_text: string
  started_at: string | null
}

interface LogLine {
  timestamp: string
  message: string
  level: string
}

const STATUS_DOT: Record<string, string> = {
  healthy:   'bg-emerald-400',
  unhealthy: 'bg-red-400',
  stopped:   'bg-zinc-400',
}

const LEVEL_CLS: Record<string, string> = {
  error: 'text-red-400',
  warn:  'text-yellow-400',
  info:  'text-blue-400',
  debug: 'text-zinc-500',
}

export default function LogsPage() {
  const [services, setServices] = useState<Service[]>([])
  const [selected, setSelected] = useState<string>('backend')
  const [lines, setLines] = useState<LogLine[]>([])
  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadServices = async () => {
    try {
      const { data } = await api.get('/logs/services')
      setServices(data)
    } catch {}
    setLoadingServices(false)
  }

  const loadLogs = useCallback(async (key: string) => {
    setLoadingLogs(true)
    try {
      const { data } = await api.get(`/logs/services/${key}`, { params: { tail: 300 } })
      setLines(data.lines ?? [])
    } catch {
      setLines([])
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  useEffect(() => { loadServices() }, [])
  useEffect(() => { loadLogs(selected) }, [selected, loadLogs])

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, autoScroll])

  useEffect(() => {
    const t = setInterval(() => loadLogs(selected), 5000)
    return () => clearInterval(t)
  }, [selected, loadLogs])

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <RichTooltip content={{
            title: 'Logs dos Containers Docker',
            priority: 'info',
            description: 'Lê os logs em tempo real diretamente do Docker Engine via socket. Atualiza automaticamente a cada 5 segundos.',
            details: [
              { label: 'Atualização', value: 'a cada 5s' },
              { label: 'Linhas exibidas', value: '300 mais recentes' },
            ],
            actions: [
              'Selecione "Worker" para ver jobs de recon em execução.',
              'Linhas em vermelho indicam erros — investigue imediatamente.',
            ],
          }}>
            <div className="p-2 rounded-xl bg-zinc-500/10 cursor-default">
              <ScrollText size={18} className="text-zinc-400" />
            </div>
          </RichTooltip>
          <div>
            <h1 className="text-2xl font-bold">Logs</h1>
            <p className="text-sm text-muted-foreground">Logs em tempo real dos containers</p>
          </div>
        </div>
        <button onClick={() => loadLogs(selected)} className="p-2 border border-border rounded-lg hover:bg-accent transition-colors">
          <RefreshCw size={14} className={cn('text-muted-foreground', loadingLogs && 'animate-spin')} />
        </button>
      </div>

      {loadingServices ? (
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-9 w-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap shrink-0">
          {services.map(svc => (
            <RichTooltip key={svc.key} content={{
              title: svc.label,
              priority: svc.status === 'healthy' ? 'info' : svc.status === 'unhealthy' ? 'high' : 'medium',
              description: svc.description || `Container ${svc.key}.`,
              details: [
                { label: 'Status', value: svc.status.toUpperCase() },
                { label: 'Estado Docker', value: svc.state },
                { label: 'Iniciado', value: svc.started_at ? new Date(svc.started_at).toLocaleString('pt-BR') : '—' },
              ],
              actions: [
                svc.status === 'healthy' ? '✅ Container saudável.' : '⚠ Verifique os logs para encontrar o erro.',
                `Clique para ver os logs em tempo real do ${svc.label}.`,
              ],
            }}>
              <button
                onClick={() => setSelected(svc.key)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-all',
                  selected === svc.key ? 'bg-primary/15 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                )}
              >
                <Circle size={7} className={cn('fill-current', STATUS_DOT[svc.status] ?? 'text-zinc-400')} />
                {svc.label}
              </button>
            </RichTooltip>
          ))}
        </div>
      )}

      <div className="flex-1 relative min-h-0">
        <div className="h-[60vh] overflow-y-auto bg-zinc-950 border border-border rounded-xl p-4 font-mono text-xs space-y-0.5">
          {loadingLogs && lines.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw size={16} className="animate-spin text-muted-foreground" />
            </div>
          ) : lines.length === 0 ? (
            <p className="text-zinc-600 italic">Sem logs disponíveis.</p>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="flex gap-3 leading-relaxed">
                <span className="text-zinc-600 shrink-0 select-none">
                  {line.timestamp ? new Date(line.timestamp).toLocaleTimeString('pt-BR') : ''}
                </span>
                <span className={cn('break-all', LEVEL_CLS[line.level] ?? 'text-zinc-300')}>
                  {line.message}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <RichTooltip content={{
          title: 'Auto-scroll',
          priority: 'info',
          description: autoScroll ? 'Auto-scroll ATIVO: a tela desce automaticamente com novos logs.' : 'Auto-scroll PAUSADO: leia logs anteriores com calma.',
          actions: ['Clique para ativar/desativar o scroll automático.'],
        }}>
          <button
            onClick={() => setAutoScroll(v => !v)}
            className={cn(
              'absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] border transition-all',
              autoScroll ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-card border-border text-muted-foreground hover:bg-accent'
            )}
          >
            <ChevronDown size={10} className={autoScroll ? 'animate-bounce' : ''} />
            Auto-scroll {autoScroll ? 'on' : 'off'}
          </button>
        </RichTooltip>
      </div>

      <p className="text-[10px] text-muted-foreground shrink-0">
        Atualização automática a cada 5s · {lines.length} linhas
      </p>
    </div>
  )
}
