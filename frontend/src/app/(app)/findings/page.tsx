'use client'

import { useEffect, useState } from 'react'
import { Bug, RefreshCw, AlertCircle, ExternalLink, Info, Plus, X, Loader2 } from 'lucide-react'
import { RichTooltip } from '@/components/ui/rich-tooltip'
import { SkeletonCard } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { Finding } from '@/types/api'

// ── Modal de Criar Finding ─────────────────────────────────────────────────

function NewFindingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '',
    type: 'other',
    severity: 'medium',
    affected_url: '',
    parameter: '',
    payload: '',
    description: '',
    steps_to_reproduce: '',
    impact: '',
    cvss_score: '',
  })

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload: Record<string, unknown> = { ...form }
      if (!payload.cvss_score) delete payload.cvss_score
      else payload.cvss_score = parseFloat(payload.cvss_score as string)
      if (!payload.parameter) delete payload.parameter
      if (!payload.payload) delete payload.payload
      await api.post('/findings', payload)
      onCreated()
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof msg === 'string' ? msg : 'Erro ao criar finding')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-zinc-900 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/60 placeholder:text-zinc-600'
  const labelCls = 'block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide'

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-red-500/15"><Bug size={16} className="text-red-400" /></div>
              <div>
                <h2 className="text-base font-semibold">Novo Finding</h2>
                <p className="text-xs text-muted-foreground">Crie um finding manualmente para gerar relatório com IA</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
              <X size={16} className="text-muted-foreground" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Título */}
            <div>
              <label className={labelCls}>Título <span className="text-red-400">*</span></label>
              <input required value={form.title} onChange={e => set('title', e.target.value)}
                className={inputCls} placeholder='Ex: "IDOR em /api/v1/users/{id} — acesso a dados de outros usuários"' />
              <p className="text-[10px] text-zinc-600 mt-1">Seja específico. Inclua o tipo de vuln e o endpoint.</p>
            </div>

            {/* Tipo + Severidade */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Tipo <span className="text-red-400">*</span></label>
                <select value={form.type} onChange={e => set('type', e.target.value)} className={inputCls}>
                  <option value="idor">IDOR</option>
                  <option value="xss">XSS</option>
                  <option value="sqli">SQL Injection</option>
                  <option value="ssrf">SSRF</option>
                  <option value="lfi">LFI/RFI</option>
                  <option value="open_redirect">Open Redirect</option>
                  <option value="info_disclosure">Info Disclosure</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Severidade <span className="text-red-400">*</span></label>
                <select value={form.severity} onChange={e => set('severity', e.target.value)} className={inputCls}>
                  <option value="critical">Critical (9.0–10.0)</option>
                  <option value="high">High (7.0–8.9)</option>
                  <option value="medium">Medium (4.0–6.9)</option>
                  <option value="low">Low (0.1–3.9)</option>
                  <option value="informational">Informational</option>
                </select>
              </div>
            </div>

            {/* URL + CVSS */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>URL Afetada</label>
                <input value={form.affected_url} onChange={e => set('affected_url', e.target.value)}
                  className={inputCls} placeholder="https://api.example.com/v1/users/123" />
              </div>
              <div>
                <label className={labelCls}>CVSS Score</label>
                <input type="number" min="0" max="10" step="0.1" value={form.cvss_score}
                  onChange={e => set('cvss_score', e.target.value)}
                  className={inputCls} placeholder="ex: 8.5" />
              </div>
            </div>

            {/* Parâmetro + Payload */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Parâmetro Vulnerável</label>
                <input value={form.parameter} onChange={e => set('parameter', e.target.value)}
                  className={inputCls} placeholder="ex: id, user_id, token" />
              </div>
              <div>
                <label className={labelCls}>Payload / Prova</label>
                <input value={form.payload} onChange={e => set('payload', e.target.value)}
                  className={inputCls} placeholder="ex: ../../../etc/passwd" />
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label className={labelCls}>Descrição <span className="text-red-400">*</span></label>
              <textarea required rows={3} value={form.description} onChange={e => set('description', e.target.value)}
                className={inputCls} placeholder="O que é a vulnerabilidade? Onde está? Por que existe? (mín. 100 chars para score alto)" />
              <p className={cn('text-[10px] mt-1', form.description.length >= 100 ? 'text-emerald-400' : 'text-zinc-600')}>
                {form.description.length}/100 chars mínimos
              </p>
            </div>

            {/* Passos */}
            <div>
              <label className={labelCls}>Passos para Reproduzir <span className="text-red-400">*</span></label>
              <textarea required rows={3} value={form.steps_to_reproduce} onChange={e => set('steps_to_reproduce', e.target.value)}
                className={inputCls} placeholder="1. Faça login como usuário A&#10;2. Acesse /api/v1/users/99999&#10;3. Observe que retorna dados de outro usuário (mín. 50 chars)" />
              <p className={cn('text-[10px] mt-1', form.steps_to_reproduce.length >= 50 ? 'text-emerald-400' : 'text-zinc-600')}>
                {form.steps_to_reproduce.length}/50 chars mínimos
              </p>
            </div>

            {/* Impacto */}
            <div>
              <label className={labelCls}>Impacto <span className="text-red-400">*</span></label>
              <textarea required rows={2} value={form.impact} onChange={e => set('impact', e.target.value)}
                className={inputCls} placeholder="O que um atacante pode fazer? Quantos usuários afeta? Dados expostos? (mín. 50 chars)" />
              <p className={cn('text-[10px] mt-1', form.impact.length >= 50 ? 'text-emerald-400' : 'text-zinc-600')}>
                {form.impact.length}/50 chars mínimos
              </p>
            </div>

            {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          </form>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-border flex justify-between items-center shrink-0">
            <p className="text-xs text-zinc-500">Após criar, mude o status para <strong className="text-blue-400">Aceito</strong> e execute o Pipeline para gerar o relatório com IA.</p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors">
                Cancelar
              </button>
              <button onClick={handleSubmit} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Criando…</> : <><Plus size={14} /> Criar Finding</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

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
  const [showNewModal, setShowNewModal] = useState(false)

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
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-sm font-semibold hover:bg-red-500/25 transition-colors"
        >
          <Plus size={15} /> Novo Finding
        </button>
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

      {showNewModal && (
        <NewFindingModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => { load(); setShowNewModal(false) }}
        />
      )}
    </div>
  )
}
