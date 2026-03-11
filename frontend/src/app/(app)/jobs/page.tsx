'use client'

import { useEffect, useState } from 'react'
import { Target, RefreshCw, XCircle, CheckCircle2, Clock, Loader2, AlertCircle, Info } from 'lucide-react'
import { RichTooltip } from '@/components/ui/rich-tooltip'
import { SkeletonCard, SkeletonKPI } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { Job } from '@/types/api'

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  pending:   { label: 'Pendente',   icon: <Clock size={11} />,     cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25' },
  running:   { label: 'Rodando',    icon: <Loader2 size={11} className="animate-spin" />, cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
  completed: { label: 'Concluído',  icon: <CheckCircle2 size={11} />, cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  failed:    { label: 'Falhou',     icon: <XCircle size={11} />,   cls: 'bg-red-500/15 text-red-400 border-red-500/25' },
}

const STATUS_TOOLTIP: Record<string, { priority: 'critical'|'high'|'medium'|'low'|'info'; desc: string; actions: string[] }> = {
  pending: {
    priority: 'info',
    desc: 'Jobs na fila aguardando um worker livre. O worker processa até 10 jobs em paralelo. Se houver muitos pending, aguarde — eles serão executados em ordem.',
    actions: ['Jobs pending são processados automaticamente.', 'Se ficar preso em pending por muito tempo, verifique se o worker está rodando na página Logs.'],
  },
  running: {
    priority: 'low',
    desc: 'Job em execução ativa agora. Ferramentas: subfinder, httpx, katana, gau, nuclei, naabu, ffuf, dnsx, dalfox, sqlmap, arjun, gitleaks, kiterunner. Pode levar de segundos a vários minutos.',
    actions: ['Aguarde a conclusão — não cancele sem necessidade.', 'Clique em "Cancelar" se o job estiver travado há mais de 30 minutos.', 'Verifique os logs na página Logs → Worker para detalhes em tempo real.'],
  },
  completed: {
    priority: 'info',
    desc: 'Job concluído com sucesso. O result_summary mostra quantos subdomínios, hosts e URLs foram encontrados. Findings criados automaticamente aparecem na Dashboard.',
    actions: ['Verifique a Dashboard para novos findings detectados automaticamente.', 'Resultados como "subdomains:50" indicam muita superfície de ataque.'],
  },
  failed: {
    priority: 'high',
    desc: 'Job falhou. Causas comuns: ferramenta não instalada no container, timeout (>1h), target inválido, ou erro de rede. O campo "error" mostra a causa exata.',
    actions: ['Leia o campo "error" abaixo do job para entender a falha.', 'Verifique a página Logs → Worker para stack trace completo.', 'Tente re-executar manualmente via API se necessário.'],
  },
}

const TYPE_TOOLTIP: Record<string, { desc: string; creates_findings: boolean; tools: string }> = {
  recon:           { desc: 'Reconhecimento completo: enumera subdomínios, probes hosts HTTP ativos e coleta URLs históricas.',    creates_findings: true,  tools: 'subfinder + httpx + katana + gau + nuclei' },
  dir_fuzz:        { desc: 'Força bruta de diretórios HTTP buscando caminhos ocultos, backups, painéis admin e arquivos expostos.', creates_findings: true,  tools: 'ffuf (wordlist interna)' },
  param_fuzz:      { desc: 'Testa parâmetros de URL com payloads para detectar injeções, traversal e comportamentos inesperados.', creates_findings: false, tools: 'ffuf (param mode)' },
  sub_fuzz:        { desc: 'Força bruta de subdomínios. Subdomínios encontrados são adicionados como novos targets automaticamente.', creates_findings: false, tools: 'ffuf (subdomain mode)' },
  idor:            { desc: 'Testa IDs sequenciais para detectar acesso não autorizado a recursos de outros usuários (IDOR/BOLA).',  creates_findings: true,  tools: 'httpx (baseline comparison)' },
  port_scan:       { desc: 'Escaneia portas TCP para encontrar serviços expostos: bancos de dados, painéis admin, SSH, etc.',      creates_findings: true,  tools: 'naabu' },
  dns_recon:       { desc: 'Analisa registros DNS, detecta SPF permissivo (+all), subdomain takeover e misconfigurações de DNS.',  creates_findings: true,  tools: 'dnsx' },
  xss_scan:        { desc: 'Scanner XSS com Dalfox: detecta reflected, DOM e blind XSS analisando parâmetros de URLs coletadas.',  creates_findings: true,  tools: 'dalfox + gau' },
  sqli_scan:       { desc: 'Detecção de SQL Injection com SQLMap: testa boolean-based, time-based, union e error-based injection.',  creates_findings: true,  tools: 'sqlmap' },
  param_discovery: { desc: 'Descobre parâmetros HTTP ocultos (GET/POST/JSON) que não aparecem na UI. Fundamental para encontrar funcionalidades escondidas.', creates_findings: true, tools: 'arjun' },
  js_analysis:     { desc: 'Analisa arquivos JavaScript em busca de endpoints ocultos, API keys, tokens e credenciais expostas.',   creates_findings: true,  tools: 'linkfinder + secretfinder (custom)' },
  secret_scan:     { desc: 'Escaneia repositórios Git públicos em busca de secrets, API keys e credenciais no histórico de commits.', creates_findings: true, tools: 'gitleaks' },
  api_scan:        { desc: 'Descobre rotas de API REST com Kiterunner e testa GraphQL introspection. Complementa o recon para APIs modernas.', creates_findings: true, tools: 'kiterunner + nuclei' },
  pipeline:        { desc: 'Pipeline de automação completo: gera relatório com IA (Ollama) e submete ao HackerOne se score ≥ 70%.', creates_findings: false, tools: 'Ollama + HackerOne API' },
}

const TYPE_LABEL: Record<string, string> = {
  recon:           'Recon',
  dir_fuzz:        'Dir Fuzz',
  param_fuzz:      'Param Fuzz',
  sub_fuzz:        'Sub Fuzz',
  idor:            'IDOR',
  port_scan:       'Port Scan',
  dns_recon:       'DNS Recon',
  xss_scan:        'XSS Scan',
  sqli_scan:       'SQLi Scan',
  param_discovery: 'Param Discovery',
  js_analysis:     'JS Analysis',
  secret_scan:     'Secret Scan',
  api_scan:        'API Scan',
  pipeline:        'Pipeline',
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [cancelling, setCancelling] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = statusFilter ? { status: statusFilter } : {}
      const { data } = await api.get('/jobs', { params })
      setJobs(data)
    } catch {
      setJobs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter])

  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'running' || j.status === 'pending')
    if (!hasActive) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [jobs])

  const cancelJob = async (id: string) => {
    setCancelling(id)
    try {
      await api.post(`/jobs/${id}/cancel`)
      await load()
    } catch {}
    setCancelling(null)
  }

  const counts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <RichTooltip content={{
            title: 'Jobs de Reconhecimento',
            priority: (counts.failed ?? 0) > 0 ? 'high' : (counts.running ?? 0) > 0 ? 'low' : 'info',
            description: 'Tarefas assíncronas executadas pelo worker ARQ em background. Cada job roda uma ferramenta de segurança em um target específico e pode criar findings automaticamente.',
            details: [
              { label: 'Total', value: String(jobs.length) },
              { label: 'Rodando', value: String(counts.running ?? 0) },
              { label: 'Pendentes', value: String(counts.pending ?? 0) },
              { label: 'Falhos', value: String(counts.failed ?? 0) },
              { label: 'Paralelo máx', value: '10 workers' },
              { label: 'Timeout', value: '1 hora/job' },
            ],
            actions: [
              'Jobs são criados automaticamente pelo scheduler a cada 15min.',
              'Clique nos cards de status para filtrar por tipo.',
              (counts.failed ?? 0) > 0 ? `⚠ ${counts.failed} job(s) falharam — verifique os erros abaixo.` : 'Nenhum job com falha no momento.',
            ],
          }}>
            <div className="p-2 rounded-xl bg-blue-500/10 cursor-default">
              <Target size={18} className="text-blue-400" />
            </div>
          </RichTooltip>
          <div>
            <h1 className="text-2xl font-bold">Jobs</h1>
            <p className="text-sm text-muted-foreground">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={load} className="p-2 border border-border rounded-lg hover:bg-accent transition-colors">
          <RefreshCw size={14} className="text-muted-foreground" />
        </button>
      </div>

      {/* Stats with tooltips */}
      {jobs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(STATUS_CONFIG).map(([key, cfg], idx) => {
            const tt = STATUS_TOOLTIP[key]
            const HOV_COLORS = ['hov-yellow', 'hov-cyan', 'hov-emerald', 'hov-red']
            return (
              <RichTooltip key={key} content={{
                title: `Jobs ${cfg.label}`,
                priority: tt.priority,
                description: tt.desc,
                details: [{ label: 'Quantidade', value: String(counts[key] ?? 0) }],
                actions: tt.actions,
              }}>
                <button
                  onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
                  className={cn(
                    'w-full p-3 rounded-xl border text-left transition-all group geo-shadow',
                    statusFilter === key ? 'border-primary/40 bg-primary/8' : `bg-card border-border ${HOV_COLORS[idx] ?? ''}`
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className={cn('text-xl font-bold', counts[key] ? '' : 'text-muted-foreground')}>{counts[key] ?? 0}</p>
                    <Info size={10} className="text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                  </div>
                  <p className="text-[11px] text-muted-foreground capitalize">{cfg.label}</p>
                </button>
              </RichTooltip>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
          <AlertCircle size={32} className="opacity-30" />
          <p className="text-sm">Nenhum job encontrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map(job => {
            const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.pending
            const typeInfo = TYPE_TOOLTIP[job.type]
            return (
              <RichTooltip key={job.id} content={{
                title: `${TYPE_LABEL[job.type] ?? job.type} — ${cfg.label}`,
                priority: job.status === 'failed' ? 'high' : job.status === 'running' ? 'low' : 'info',
                description: typeInfo?.desc ?? `Job do tipo "${job.type}".`,
                details: [
                  { label: 'Ferramentas', value: typeInfo?.tools ?? '—' },
                  { label: 'Cria findings', value: typeInfo?.creates_findings ? 'Sim (automático)' : 'Não' },
                  { label: 'Status', value: cfg.label },
                  { label: 'Criado', value: new Date(job.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) },
                  ...(job.result_summary
                    ? Object.entries(job.result_summary).map(([k, v]) => ({ label: k, value: String(v) }))
                    : []
                  ),
                ],
                actions: [
                  ...(STATUS_TOOLTIP[job.status]?.actions ?? []),
                  ...(job.error ? [`Erro: ${job.error.slice(0, 100)}`] : []),
                ],
              }}>
                <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border hover:border-border/80 transition-all cursor-default">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{TYPE_LABEL[job.type] ?? job.type}</span>
                      <span className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border', cfg.cls)}>
                        {cfg.icon}
                        {cfg.label}
                      </span>
                      <Info size={10} className="text-muted-foreground/30" />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      <span>target: {job.target_id ?? '—'}</span>
                      <span>{new Date(job.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      {job.result_summary && Object.entries(job.result_summary).map(([k, v]) => (
                        <span key={k} className="text-emerald-400">{k}: {v}</span>
                      ))}
                    </div>
                    {job.error && (
                      <p className="text-[11px] text-red-400 mt-1 truncate">{job.error}</p>
                    )}
                  </div>
                  {(job.status === 'running' || job.status === 'pending') && (
                    <RichTooltip content={{
                      title: 'Cancelar Job',
                      priority: 'medium',
                      description: 'Interrompe o job imediatamente. Se estiver rodando, tenta abortar via ARQ e muda o status para "failed". Use apenas se o job estiver travado.',
                      actions: ['Cancel pending: marca como failed sem executar.', 'Cancela running: tenta abortar a ferramenta em execução.', 'Não use desnecessariamente — jobs cancelados não geram findings.'],
                    }}>
                      <button
                        onClick={() => cancelJob(job.id)}
                        disabled={cancelling === job.id}
                        className="px-3 py-1.5 text-[11px] border border-red-500/25 text-red-400 rounded-lg hover:bg-red-500/10 transition-all disabled:opacity-50 shrink-0"
                      >
                        Cancelar
                      </button>
                    </RichTooltip>
                  )}
                </div>
              </RichTooltip>
            )
          })}
        </div>
      )}
    </div>
  )
}
