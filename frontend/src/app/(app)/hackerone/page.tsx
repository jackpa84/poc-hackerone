'use client'

import { useEffect, useState } from 'react'
import {
  Globe, RefreshCw, Search, Download, CheckCircle2, XCircle,
  ExternalLink, Shield, ChevronRight, AlertCircle, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { RichTooltip } from '@/components/ui/rich-tooltip'

interface H1Status {
  configured: boolean
  connected: boolean
  username: string | null
  reputation?: number
  signal?: number
}

interface H1Program {
  id: string
  handle: string
  name: string
  url: string
  offers_bounties: boolean
  state: string
  submission_state: string
  started_accepting_at: string | null
}

interface H1Target {
  asset_identifier: string
  asset_type: string
  our_type: string
  eligible_for_bounty: boolean
  eligible_for_submission: boolean
  instruction: string
  max_severity: string
}

interface ScopeData {
  handle: string
  name: string
  url: string
  targets: H1Target[]
  total_targets: number
}

interface SyncResult {
  handle: string
  total_in_scope: number
  created: number
  skipped: number
  message: string
}

export default function HackerOnePage() {
  const [status, setStatus] = useState<H1Status | null>(null)
  const [programs, setPrograms] = useState<H1Program[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingPrograms, setLoadingPrograms] = useState(false)
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [search, setSearch] = useState('')

  // Scope viewer
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null)
  const [scope, setScope] = useState<ScopeData | null>(null)
  const [loadingScope, setLoadingScope] = useState(false)

  // Sync
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)

  const loadStatus = async () => {
    try {
      const { data } = await api.get('/hackerone/status')
      setStatus(data)
    } catch {
      setStatus({ configured: false, connected: false, username: null })
    }
    setLoading(false)
  }

  const loadPrograms = async (p: number = 1) => {
    setLoadingPrograms(true)
    try {
      const { data } = await api.get('/hackerone/programs', { params: { page: p } })
      if (p === 1) {
        setPrograms(data.programs)
      } else {
        setPrograms(prev => [...prev, ...data.programs])
      }
      setHasNext(data.has_next)
      setPage(p)
    } catch {}
    setLoadingPrograms(false)
  }

  const loadScope = async (handle: string) => {
    setSelectedHandle(handle)
    setLoadingScope(true)
    setScope(null)
    setSyncResult(null)
    try {
      const { data } = await api.get(`/hackerone/programs/${handle}/scope`)
      setScope(data)
    } catch {}
    setLoadingScope(false)
  }

  const syncTargets = async (handle: string) => {
    setSyncing(handle)
    setSyncResult(null)
    try {
      const { data } = await api.post('/hackerone/sync', { handle, only_bounty: true })
      setSyncResult(data)
    } catch {}
    setSyncing(null)
  }

  useEffect(() => { loadStatus() }, [])

  const filtered = search
    ? programs.filter(p =>
        p.handle.toLowerCase().includes(search.toLowerCase()) ||
        p.name.toLowerCase().includes(search.toLowerCase())
      )
    : programs

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Não configurado
  if (!status?.configured) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-zinc-500/10">
            <Globe size={18} className="text-zinc-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">HackerOne</h1>
            <p className="text-sm text-muted-foreground">Integração com programas de bug bounty</p>
          </div>
        </div>

        <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto">
            <AlertCircle size={28} className="text-orange-400" />
          </div>
          <h2 className="text-xl font-semibold">API não configurada</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Para usar a integração com o HackerOne, configure suas credenciais no arquivo <code className="bg-accent px-1.5 py-0.5 rounded text-xs">.env</code>:
          </p>
          <div className="bg-zinc-950 border border-border rounded-xl p-4 text-left font-mono text-xs space-y-1">
            <p className="text-zinc-500"># Gere em: https://hackerone.com/settings/api_token</p>
            <p><span className="text-blue-400">HACKERONE_USERNAME</span>=<span className="text-emerald-400">seu_username</span></p>
            <p><span className="text-blue-400">HACKERONE_API_TOKEN</span>=<span className="text-emerald-400">seu_token_aqui</span></p>
          </div>
          <p className="text-xs text-muted-foreground">Depois reinicie: <code className="bg-accent px-1.5 py-0.5 rounded">docker compose up -d</code></p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <RichTooltip content={{
            title: 'HackerOne Integration',
            priority: 'info',
            description: 'Busque programas de bug bounty do HackerOne e importe seus targets (domínios, IPs, wildcards) diretamente para a plataforma.',
            details: [
              { label: 'Usuário', value: status.username || '—' },
              { label: 'Status', value: status.connected ? 'Conectado' : 'Desconectado' },
              ...(status.reputation ? [{ label: 'Reputation', value: String(status.reputation) }] : []),
              ...(status.signal ? [{ label: 'Signal', value: String(status.signal) }] : []),
            ],
            actions: [
              'Busque programas e clique para ver os targets in-scope.',
              'Use "Importar" para sincronizar targets com a plataforma.',
              'Targets importados ficam disponíveis na página Jobs para recon.',
            ],
          }}>
            <div className="p-2 rounded-xl bg-zinc-500/10 cursor-default">
              <Globe size={18} className="text-zinc-400" />
            </div>
          </RichTooltip>
          <div>
            <h1 className="text-2xl font-bold">HackerOne</h1>
            <p className="text-sm text-muted-foreground">
              {status.connected ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  Conectado como <span className="text-foreground font-medium">{status.username}</span>
                  {status.reputation ? <span className="text-muted-foreground">· Rep: {status.reputation}</span> : null}
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                  Falha na conexão
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {programs.length === 0 ? (
            <button
              onClick={() => loadPrograms(1)}
              disabled={loadingPrograms}
              className="flex items-center gap-2 px-4 py-2 bg-primary/15 border border-primary/30 rounded-lg text-sm text-primary font-medium hover:bg-primary/25 transition-all disabled:opacity-40"
            >
              {loadingPrograms ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              Buscar Programas
            </button>
          ) : (
            <button
              onClick={() => loadPrograms(1)}
              className="p-2 border border-border rounded-lg hover:bg-accent transition-colors"
            >
              <RefreshCw size={14} className={cn('text-muted-foreground', loadingPrograms && 'animate-spin')} />
            </button>
          )}
        </div>
      </div>

      {/* Programas + Scope side by side */}
      {programs.length > 0 && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
          {/* Lista de programas */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                placeholder="Filtrar programas..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <span className="text-[10px] text-muted-foreground shrink-0">
                {filtered.length} programas
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filtered.map(prog => (
                <button
                  key={prog.id}
                  onClick={() => loadScope(prog.handle)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-lg border transition-all',
                    selectedHandle === prog.handle
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-card border-border hover:bg-accent'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{prog.name || prog.handle}</span>
                        {prog.offers_bounties && (
                          <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            $bounty
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        hackerone.com/{prog.handle}
                      </p>
                    </div>
                    <ChevronRight size={12} className={cn(
                      'shrink-0 ml-2 transition-colors',
                      selectedHandle === prog.handle ? 'text-primary' : 'text-muted-foreground'
                    )} />
                  </div>
                </button>
              ))}

              {hasNext && (
                <button
                  onClick={() => loadPrograms(page + 1)}
                  disabled={loadingPrograms}
                  className="w-full py-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg hover:bg-accent transition-all"
                >
                  {loadingPrograms ? 'Carregando...' : 'Carregar mais programas'}
                </button>
              )}
            </div>
          </div>

          {/* Scope / Targets do programa selecionado */}
          <div className="flex flex-col min-h-0">
            {!selectedHandle ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                <p>Selecione um programa para ver os targets</p>
              </div>
            ) : loadingScope ? (
              <div className="flex-1 flex items-center justify-center">
                <RefreshCw size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : scope ? (
              <>
                {/* Scope header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold">{scope.name}</h2>
                    <p className="text-[10px] text-muted-foreground">{scope.total_targets} targets in-scope</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={scope.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 border border-border rounded-lg hover:bg-accent transition-colors"
                    >
                      <ExternalLink size={12} className="text-muted-foreground" />
                    </a>
                    <button
                      onClick={() => syncTargets(scope.handle)}
                      disabled={syncing === scope.handle}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/15 border border-primary/30 rounded-lg text-xs text-primary font-medium hover:bg-primary/25 transition-all disabled:opacity-40"
                    >
                      {syncing === scope.handle
                        ? <RefreshCw size={12} className="animate-spin" />
                        : <Download size={12} />
                      }
                      Importar Targets
                    </button>
                  </div>
                </div>

                {/* Sync result */}
                {syncResult && (
                  <div className={cn(
                    'px-3 py-2 rounded-lg border text-xs mb-3',
                    syncResult.created > 0
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                      : 'bg-zinc-500/10 border-border text-muted-foreground'
                  )}>
                    <div className="flex items-center gap-2">
                      {syncResult.created > 0
                        ? <CheckCircle2 size={12} />
                        : <Zap size={12} />
                      }
                      <span>{syncResult.message}</span>
                    </div>
                    <p className="mt-1 text-[10px] opacity-75">
                      Total in-scope: {syncResult.total_in_scope} · Criados: {syncResult.created} · Já existiam: {syncResult.skipped}
                    </p>
                  </div>
                )}

                {/* Targets list */}
                <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                  {scope.targets.map((t, i) => (
                    <div
                      key={`${t.asset_identifier}-${i}`}
                      className={cn(
                        'px-3 py-2 rounded-lg border text-xs',
                        t.eligible_for_bounty
                          ? 'bg-card border-border'
                          : 'bg-card/50 border-border/50 opacity-60'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <Shield size={10} className={cn(
                            t.eligible_for_bounty ? 'text-emerald-400' : 'text-zinc-500'
                          )} />
                          <span className="font-mono text-foreground truncate">{t.asset_identifier}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className={cn(
                            'px-1.5 py-0.5 rounded text-[9px] border',
                            t.asset_type === 'WILDCARD' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' :
                            t.asset_type === 'URL' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                            t.asset_type === 'IP_ADDRESS' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                            'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                          )}>
                            {t.asset_type}
                          </span>
                          {t.eligible_for_bounty ? (
                            <span className="text-[9px] text-emerald-400">$</span>
                          ) : (
                            <XCircle size={10} className="text-zinc-500" />
                          )}
                        </div>
                      </div>
                      {t.instruction && (
                        <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed truncate">
                          {t.instruction}
                        </p>
                      )}
                    </div>
                  ))}

                  {scope.targets.length === 0 && (
                    <p className="text-center text-muted-foreground text-xs py-8">
                      Nenhum target encontrado para este programa
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                <p>Erro ao carregar scope</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {programs.length === 0 && !loadingPrograms && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
              <Globe size={20} className="text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              Clique em <span className="text-primary font-medium">"Buscar Programas"</span> para começar
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
