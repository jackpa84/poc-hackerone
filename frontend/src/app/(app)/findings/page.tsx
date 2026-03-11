'use client'

import { useEffect, useState } from 'react'
import { Bug, RefreshCw, AlertCircle, ExternalLink, Info } from 'lucide-react'
import { RichTooltip } from '@/components/ui/rich-tooltip'
import { SkeletonCard } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { Finding } from '@/types/api'

const SEV_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  critical:      { bg: 'bg-red-500/15',    text: 'text-red-400',    border: 'border-red-500/30' },
  high:          { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  medium:        { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  low:           { bg: 'bg-blue-500/15',   text: 'text-blue-400',   border: 'border-blue-500/30' },
  informational: { bg: 'bg-zinc-500/15',   text: 'text-zinc-400',   border: 'border-zinc-500/30' },
}

const STATUS_INFO: Record<string, { label: string; priority: 'critical'|'high'|'medium'|'low'|'info'; desc: string; action: string }> = {
  new:            { label: 'Novo',      priority: 'medium', desc: 'Finding detectado automaticamente ou criado manualmente. Ainda não foi avaliado se é válido.', action: 'Verifique se é reproduzível. Mova para "Triagem" se sim, ou "N/A" se for falso positivo.' },
  triaging:       { label: 'Triagem',   priority: 'medium', desc: 'Finding em análise. Você está verificando os detalhes, reproduzindo o bug e avaliando o impacto real.', action: 'Mova para "Aceito" quando confirmar que é válido e reproduzível.' },
  accepted:       { label: 'Aceito',    priority: 'high',   desc: 'Finding válido e confirmado. Pronto para gerar relatório com IA e submeter ao HackerOne via Pipeline.', action: '⚡ Acesse Pipeline → Executar para submeter automaticamente ao HackerOne.' },
  resolved:       { label: 'Resolvido', priority: 'info',   desc: 'Finding reportado ao HackerOne ou corrigido. Registre o bounty recebido no campo bounty_amount.', action: 'Preencha o campo "bounty_amount" para rastrear seus ganhos totais.' },
  duplicate:      { label: 'Duplicado', priority: 'info',   desc: 'Já foi reportado anteriormente por você ou outro pesquisador. Não será submetido novamente.', action: 'Nenhuma ação necessária — afeta negativamente o Signal apenas se submetido.' },
  not_applicable: { label: 'N/A',       priority: 'info',   desc: 'Falso positivo, fora do escopo, ou sem impacto real. Não será submetido ao HackerOne.', action: 'Archive este finding — não representa uma vulnerabilidade real.' },
}

const SEV_INFO: Record<string, { cvss: string; bounty: string; urgency: string; examples: string }> = {
  critical:      { cvss: '9.0–10.0', bounty: '$10k–$50k+', urgency: '🚨 Reporte em 24h', examples: 'RCE sem auth, ATO completo, SQLi dump total' },
  high:          { cvss: '7.0–8.9',  bounty: '$2k–$10k',   urgency: '⚡ Reporte em 48h', examples: 'IDOR com dados sensíveis, SQLi auth, Priv Esc' },
  medium:        { cvss: '4.0–6.9',  bounty: '$200–$2k',   urgency: '📋 Reporte em 1 sem', examples: 'Stored XSS, CSRF crítico, Open Redirect' },
  low:           { cvss: '0.1–3.9',  bounty: '$50–$500',   urgency: '📝 Reporte quando puder', examples: 'Reflected XSS, Missing headers, Rate limit' },
  informational: { cvss: 'N/A',      bounty: '$0–$50',     urgency: '💡 Opcional',      examples: 'Versão exposta, best practices, config' },
}

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'informational']

export default function FindingsPage() {
  const [findings, setFindings] = useState<Finding[]>([])
  const [loading, setLoading] = useState(true)
  const [sevFilter, setSevFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (sevFilter) params.severity = sevFilter
      if (statusFilter) params.status = statusFilter
      const { data } = await api.get('/findings', { params })
      setFindings(data)
    } catch {
      setFindings([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [sevFilter, statusFilter])

  const allFindings = findings
  const counts = SEVERITIES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = allFindings.filter(f => f.severity === s).length
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <RichTooltip content={{
            title: 'Findings — Vulnerabilidades',
            priority: (counts.critical ?? 0) > 0 ? 'critical' : (counts.high ?? 0) > 0 ? 'high' : 'info',
            description: 'Lista completa de vulnerabilidades encontradas pelo recon automático e adicionadas manualmente. Use os filtros de severidade e status para priorizar o que reportar.',
            details: [
              { label: 'Critical', value: String(counts.critical ?? 0) },
              { label: 'High', value: String(counts.high ?? 0) },
              { label: 'Medium', value: String(counts.medium ?? 0) },
              { label: 'Low', value: String(counts.low ?? 0) },
              { label: 'Total', value: String(findings.length) },
            ],
            actions: [
              'Filtre por severidade para priorizar os mais críticos.',
              'Findings "accepted" vão direto para o Pipeline de submissão.',
              'Use "Todos status → accepted" para ver apenas o que está pronto.',
            ],
          }}>
            <div className="p-2 rounded-xl bg-red-500/10 cursor-default">
              <Bug size={18} className="text-red-400" />
            </div>
          </RichTooltip>
          <div>
            <h1 className="text-2xl font-bold">Findings</h1>
            <p className="text-sm text-muted-foreground">{findings.length} vulnerabilidade{findings.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={load} className="p-2 border border-border rounded-lg hover:bg-accent transition-colors">
          <RefreshCw size={14} className="text-muted-foreground" />
        </button>
      </div>

      {/* Severity filter pills with tooltips */}
      <div className="flex gap-2 flex-wrap">
        <RichTooltip content={{
          title: 'Todos os Findings',
          priority: 'info',
          description: 'Exibe todos os findings sem filtro de severidade. Combine com o filtro de status para segmentar.',
          actions: ['Use os botões de severidade ao lado para filtrar por nível de risco.'],
        }}>
          <button
            onClick={() => setSevFilter('')}
            className={cn('px-3 py-1.5 rounded-lg text-xs border transition-all',
              !sevFilter ? 'bg-primary/15 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
            )}
          >
            Todos ({findings.length})
          </button>
        </RichTooltip>

        {SEVERITIES.map(sev => {
          const s = SEV_STYLE[sev]
          const info = SEV_INFO[sev]
          return (
            <RichTooltip key={sev} content={{
              title: `Severidade: ${sev.charAt(0).toUpperCase() + sev.slice(1)}`,
              priority: sev as 'critical'|'high'|'medium'|'low'|'info',
              description: `${counts[sev] ?? 0} finding(s) com severidade ${sev.toUpperCase()}. ${info.urgency}`,
              details: [
                { label: 'CVSS 3.1', value: info.cvss },
                { label: 'Bounty estimado', value: info.bounty },
                { label: 'Exemplos', value: info.examples },
                { label: 'Urgência', value: info.urgency },
              ],
              actions: [
                `Clique para filtrar apenas findings ${sev}.`,
                `Bounty típico para ${sev}: ${info.bounty}.`,
              ],
            }}>
              <button
                onClick={() => setSevFilter(sevFilter === sev ? '' : sev)}
                className={cn('px-3 py-1.5 rounded-lg text-xs border transition-all capitalize',
                  sevFilter === sev ? `${s.bg} ${s.text} ${s.border}` : 'border-border text-muted-foreground hover:bg-accent'
                )}
              >
                {sev} ({counts[sev] ?? 0})
              </button>
            </RichTooltip>
          )
        })}

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="ml-auto bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none"
        >
          <option value="">Todos status</option>
          {Object.entries(STATUS_INFO).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : findings.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
          <AlertCircle size={32} className="opacity-30" />
          <p className="text-sm">Nenhum finding encontrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {findings.map(f => {
            const sev = SEV_STYLE[f.severity] ?? SEV_STYLE.informational
            const stInfo = STATUS_INFO[f.status]
            const sevInfo = SEV_INFO[f.severity]
            return (
              <RichTooltip key={f.id} content={{
                title: f.title,
                priority: f.severity as 'critical'|'high'|'medium'|'low'|'info',
                description: f.description
                  ? f.description.slice(0, 180) + (f.description.length > 180 ? '...' : '')
                  : 'Sem descrição. Preencha para aumentar o score de prontidão.',
                details: [
                  { label: 'Severidade', value: f.severity.toUpperCase() },
                  { label: 'Status', value: stInfo?.label ?? f.status },
                  { label: 'Tipo', value: f.type.replace('_', ' ').toUpperCase() },
                  { label: 'CVSS', value: f.cvss_score != null ? f.cvss_score.toFixed(1) : 'Não calc.' },
                  { label: 'Bounty estimado', value: sevInfo?.bounty ?? '—' },
                  { label: 'Urgência', value: sevInfo?.urgency ?? '—' },
                  ...(f.bounty_amount ? [{ label: 'Bounty recebido', value: `$${f.bounty_amount.toLocaleString()}` }] : []),
                ],
                actions: [
                  stInfo?.action ?? '',
                  f.impact ? `Impacto: ${f.impact.slice(0, 100)}` : 'Preencha o campo "impacto" para melhorar o relatório.',
                  f.status === 'accepted' ? '⚡ Pipeline: este finding está pronto para submissão automática.' : '',
                ].filter(Boolean),
              }}>
                <div className={cn('p-4 rounded-xl border transition-all duration-300 cursor-default geo-shadow', sev.border, sev.bg + '/20')}>
                  <div className="flex items-start gap-3">
                    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 mt-0.5', sev.bg, sev.text)}>
                      {f.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold truncate">{f.title}</p>
                        <Info size={10} className="text-muted-foreground/30 shrink-0" />
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                        <span className="capitalize">{f.type.replace('_', ' ')}</span>
                        <span className={cn('capitalize font-medium', stInfo?.priority === 'high' || stInfo?.priority === 'critical' ? 'text-orange-400' : '')}>
                          {stInfo?.label ?? f.status}
                        </span>
                        {f.affected_url && (
                          <a
                            href={f.affected_url.startsWith('http') ? f.affected_url : `https://${f.affected_url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:text-foreground transition-colors truncate max-w-[200px]"
                          >
                            <ExternalLink size={9} />
                            {f.affected_url}
                          </a>
                        )}
                        {f.cvss_score != null && (
                          <span className="font-medium">CVSS {f.cvss_score.toFixed(1)}</span>
                        )}
                        {f.bounty_amount != null && f.bounty_amount > 0 && (
                          <span className="text-emerald-400 font-medium">${f.bounty_amount.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(f.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              </RichTooltip>
            )
          })}
        </div>
      )}
    </div>
  )
}
