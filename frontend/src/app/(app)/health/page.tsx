'use client'
import { useEffect, useRef, useState } from 'react'
import { Activity, Database, Server, Cpu, RefreshCw, CheckCircle2, XCircle, AlertCircle, Wifi, WifiOff } from 'lucide-react'
import api from '@/lib/api'

interface ServiceStatus {
  status: 'up' | 'down'
  latency_ms?: number
  memory_mb?: number
  connections_current?: number
  connections_available?: number
  connected_clients?: number
  jobs_queued?: number
  jobs_in_progress?: number
  workers_registered?: number
  version?: string
  error?: string
}

interface HealthData {
  status: 'healthy' | 'degraded'
  response_ms: number
  services: {
    api: ServiceStatus
    mongodb: ServiceStatus
    redis: ServiceStatus
  }
}

const REFRESH_INTERVAL = 10

function StatusIcon({ status }: { status: 'up' | 'down' | undefined }) {
  if (!status) return <AlertCircle size={16} className="text-zinc-500 animate-pulse" />
  return status === 'up'
    ? <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
    : <XCircle size={16} className="text-red-400" />
}

function Metric({ label, value, unit = '' }: { label: string; value?: number | string; unit?: string }) {
  if (value === undefined || value === null) return null
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs font-mono font-medium text-zinc-200">{value}{unit}</span>
    </div>
  )
}

function ServiceCard({
  title,
  icon: Icon,
  color,
  data,
  loading,
}: {
  title: string
  icon: React.ElementType
  color: string
  data?: ServiceStatus
  loading: boolean
}) {
  const isUp = data?.status === 'up'
  const borderColor = !data ? 'rgba(255,255,255,0.06)' : isUp ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.3)'
  const glowColor = !data ? 'transparent' : isUp ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)'

  return (
    <div
      className="rounded-xl p-4 transition-all duration-300"
      style={{
        background: `${glowColor}`,
        border: `1px solid ${borderColor}`,
        backgroundColor: `color-mix(in srgb, ${glowColor} 100%, #0a0a0a)`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
            <Icon size={13} style={{ color }} />
          </div>
          <span className="text-sm font-semibold text-zinc-100">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {loading && <RefreshCw size={11} className="text-zinc-600 animate-spin" />}
          <StatusIcon status={data?.status} />
          <span className="text-[11px] font-medium" style={{ color: !data ? '#555' : isUp ? '#22c55e' : '#f87171' }}>
            {!data ? 'verificando' : isUp ? 'operacional' : 'indisponível'}
          </span>
        </div>
      </div>

      {/* Error */}
      {data?.error && (
        <div className="mb-2 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-[10px] text-red-400 font-mono break-all">{data.error}</p>
        </div>
      )}

      {/* Metrics */}
      <div className="space-y-0">
        <Metric label="Latência" value={data?.latency_ms} unit=" ms" />
        <Metric label="Memória" value={data?.memory_mb} unit=" MB" />
        <Metric label="Versão" value={data?.version} />
        <Metric label="Conexões ativas" value={data?.connections_current} />
        <Metric label="Conexões disponíveis" value={data?.connections_available} />
        <Metric label="Clientes conectados" value={data?.connected_clients} />
        <Metric label="Jobs na fila" value={data?.jobs_queued} />
        <Metric label="Jobs em execução" value={data?.jobs_in_progress} />
        <Metric label="Workers ativos" value={data?.workers_registered} />
      </div>
    </div>
  )
}

export default function HealthPage() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function fetchHealth() {
    try {
      setLoading(true)
      setError(null)
      const res = await api.get<HealthData>('/health')
      setData(res.data)
      setLastUpdated(new Date())
    } catch {
      setError('Falha ao buscar status dos serviços')
    } finally {
      setLoading(false)
    }
  }

  function resetCountdown() {
    setCountdown(REFRESH_INTERVAL)
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) return REFRESH_INTERVAL
        return c - 1
      })
    }, 1000)
  }

  useEffect(() => {
    fetchHealth()
    resetCountdown()

    const refreshTimer = setInterval(() => {
      fetchHealth()
      resetCountdown()
    }, REFRESH_INTERVAL * 1000)

    return () => {
      clearInterval(refreshTimer)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  const isHealthy = data?.status === 'healthy'

  return (
    <div className="flex-1 overflow-auto geo-bg">
      <div className="max-w-4xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Status dos Serviços</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Monitoramento em tempo real da infraestrutura</p>
          </div>
          <button
            onClick={() => { fetchHealth(); resetCountdown() }}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.08] text-xs text-zinc-400 hover:text-zinc-200 transition-all disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>

        {/* Overall status banner */}
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-500"
          style={{
            background: error
              ? 'rgba(239,68,68,0.06)'
              : isHealthy
              ? 'rgba(34,197,94,0.06)'
              : data
              ? 'rgba(234,179,8,0.06)'
              : 'rgba(255,255,255,0.02)',
            borderColor: error
              ? 'rgba(239,68,68,0.25)'
              : isHealthy
              ? 'rgba(34,197,94,0.25)'
              : data
              ? 'rgba(234,179,8,0.25)'
              : 'rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center gap-3">
            {error ? (
              <WifiOff size={18} className="text-red-400 shrink-0" />
            ) : isHealthy ? (
              <Wifi size={18} style={{ color: '#22c55e' }} className="shrink-0" />
            ) : data ? (
              <AlertCircle size={18} className="text-yellow-400 shrink-0" />
            ) : (
              <Activity size={18} className="text-zinc-500 animate-pulse shrink-0" />
            )}
            <div>
              <p className="text-sm font-semibold" style={{
                color: error ? '#f87171' : isHealthy ? '#22c55e' : data ? '#facc15' : '#666',
              }}>
                {error ? 'Erro de conexão' : isHealthy ? 'Todos os sistemas operacionais' : data ? 'Sistema degradado' : 'Verificando...'}
              </p>
              {data && !error && (
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Tempo de resposta total: <span className="text-zinc-400 font-mono">{data.response_ms} ms</span>
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-zinc-600">Próxima atualização em</p>
            <p className="text-lg font-mono font-bold text-zinc-400">{countdown}s</p>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Service cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ServiceCard
            title="API"
            icon={Server}
            color="#f97316"
            data={data?.services.api}
            loading={loading}
          />
          <ServiceCard
            title="MongoDB"
            icon={Database}
            color="#22c55e"
            data={data?.services.mongodb}
            loading={loading}
          />
          <ServiceCard
            title="Redis / Workers"
            icon={Cpu}
            color="#06b6d4"
            data={data?.services.redis}
            loading={loading}
          />
        </div>

        {/* Last updated */}
        {lastUpdated && (
          <p className="text-center text-[11px] text-zinc-700">
            Última atualização: {lastUpdated.toLocaleTimeString('pt-BR')}
          </p>
        )}
      </div>
    </div>
  )
}
