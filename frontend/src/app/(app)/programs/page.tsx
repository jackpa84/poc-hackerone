'use client'

import { useEffect, useState } from 'react'
import { Briefcase, Plus, ExternalLink, Trash2, RefreshCw, Globe, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { RichTooltip } from '@/components/ui/rich-tooltip'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { Program } from '@/types/api'

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  paused: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  closed: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25',
}

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/programs')
      setPrograms(data)
    } catch {
      setPrograms([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const deleteProgram = async (id: string) => {
    if (!confirm('Remover este programa?')) return
    setDeleting(id)
    try {
      await api.delete(`/programs/${id}`)
      setPrograms(prev => prev.filter(p => p.id !== id))
    } catch {}
    setDeleting(null)
  }

  const active = programs.filter(p => p.status === 'active').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <RichTooltip content={{
            title: 'Programas de Bug Bounty',
            priority: active === 0 ? 'high' : 'info',
            description: 'Cada programa representa um alvo de bug bounty. O auto-scanner roda a cada 15 minutos nos programas ativos, varrendo todos os targets in-scope.',
            details: [
              { label: 'Total', value: String(programs.length) },
              { label: 'Ativos (com recon)', value: String(active) },
              { label: 'Pausados', value: String(programs.filter(p => p.status === 'paused').length) },
            ],
            actions: [
              'Importe programas via "Via HackerOne" → selecione e clique em "Sync para DB".',
              'Apenas programas "active" recebem recon automático a cada 15min.',
              active === 0 ? '⚠ Nenhum programa ativo! Ative um para iniciar o recon.' : `${active} programa(s) sendo escaneado(s) automaticamente.`,
            ],
          }}>
            <div className="p-2 rounded-xl bg-primary/10 cursor-default">
              <Briefcase size={18} className="text-primary" />
            </div>
          </RichTooltip>
          <div>
            <h1 className="text-2xl font-bold">Programas</h1>
            <p className="text-sm text-muted-foreground">{programs.length} programa{programs.length !== 1 ? 's' : ''} · {active} ativo{active !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border border-border rounded-lg hover:bg-accent transition-colors">
            <RefreshCw size={14} className="text-muted-foreground" />
          </button>
          <a href="/hackerone" className="flex items-center gap-2 px-4 py-2 bg-primary/15 border border-primary/25 rounded-lg text-sm text-primary hover:bg-primary/25 transition-all">
            <Plus size={14} />
            Via HackerOne
          </a>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <RefreshCw size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : programs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
          <Globe size={32} className="opacity-30" />
          <p className="text-sm">Nenhum programa. Importe via HackerOne.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Cabeçalho da tabela */}
          <div className="grid grid-cols-[1fr_100px_120px_100px_80px_36px] gap-4 px-4 py-2.5 bg-muted/40 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            <span>Programa</span>
            <span>Status</span>
            <span>Bounty Máx</span>
            <span>Tags</span>
            <span>Adicionado</span>
            <span />
          </div>

          {/* Linhas */}
          <div className="divide-y divide-border">
            {programs.map(p => (
              <RichTooltip key={p.id} content={{
                title: p.name,
                priority: p.status === 'active' ? 'low' : 'info',
                description: p.scope_notes
                  ? `Escopo: ${p.scope_notes.slice(0, 180)}${p.scope_notes.length > 180 ? '...' : ''}`
                  : 'Sem notas de escopo.',
                details: [
                  { label: 'Status', value: p.status.toUpperCase() },
                  { label: 'Bounty máx', value: p.max_bounty ? `$${p.max_bounty.toLocaleString()}` : 'N/A' },
                  { label: 'Tags', value: p.tags.length > 0 ? p.tags.join(', ') : '—' },
                  { label: 'Adicionado', value: new Date(p.created_at).toLocaleDateString('pt-BR') },
                ],
                actions: [
                  p.status === 'active' ? '✅ Ativo — recon rodando automaticamente a cada 15min.' : '⏸ Pausado — sem recon automático.',
                  p.max_bounty ? `Potencial: até $${p.max_bounty.toLocaleString()} por vuln crítica.` : 'Verifique o bounty no HackerOne.',
                ],
              }}>
                <div className="grid grid-cols-[1fr_100px_120px_100px_80px_36px] gap-4 px-4 py-3 items-center hover:bg-accent/40 transition-colors group cursor-default">

                  {/* Nome + URL */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">{p.name}</span>
                      <Info size={9} className="text-muted-foreground/30 shrink-0" />
                    </div>
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-0.5 truncate w-fit max-w-full">
                        <ExternalLink size={9} className="shrink-0" />
                        {p.url.replace('https://', '')}
                      </a>
                    )}
                  </div>

                  {/* Status */}
                  <div>
                    <Badge className={cn('text-[10px] border', STATUS_STYLE[p.status] ?? STATUS_STYLE.closed)}>
                      {p.status}
                    </Badge>
                  </div>

                  {/* Bounty */}
                  <div>
                    {p.max_bounty
                      ? <span className="text-[12px] text-emerald-400 font-semibold">${p.max_bounty.toLocaleString()}</span>
                      : <span className="text-[11px] text-muted-foreground/50">—</span>
                    }
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1">
                    {p.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] bg-muted text-muted-foreground">{tag}</span>
                    ))}
                    {p.tags.length > 2 && (
                      <span className="text-[9px] text-muted-foreground/60">+{p.tags.length - 2}</span>
                    )}
                  </div>

                  {/* Data */}
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString('pt-BR')}
                  </span>

                  {/* Deletar */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => deleteProgram(p.id)}
                      disabled={deleting === p.id}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </RichTooltip>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
