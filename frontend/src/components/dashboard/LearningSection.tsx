'use client'

import { useState } from 'react'
import { Info, Layers, Search, FileText, TrendingUp, Activity, ChevronDown, Shield, BookOpen, Target } from 'lucide-react'
import { cn } from '@/lib/utils'

const GLOSSARY = [
  { term: 'Finding', def: 'Vulnerabilidade detectada pelo recon ou inserida manualmente.' },
  { term: 'Recon', def: 'Reconhecimento automatizado: subfinder, httpx, nuclei.' },
  { term: 'Pipeline', def: 'Fluxo: finding aceito -> relatorio IA -> revisao -> submissao H1.' },
  { term: 'HPA', def: 'Horizontal Pod Autoscaler: escala pods por CPU no Kubernetes.' },
  { term: 'CVSS', def: 'Common Vulnerability Scoring System: escala 0-10.' },
  { term: 'Triagem', def: 'Validar se um finding e real e reproduzivel.' },
  { term: 'Bounty', def: 'Recompensa paga pelo programa. $50 (low) a $50k+ (critical).' },
  { term: 'SSE', def: 'Server-Sent Events: conexao persistente para real-time.' },
  { term: 'Scope', def: 'Dominios autorizados para teste. Fora = desqualificacao.' },
  { term: 'PoC', def: 'Proof of Concept: demonstracao pratica da vulnerabilidade.' },
  { term: 'Signal', def: 'Metrica H1 (0-7). Reports validos aumentam, duplicatas reduzem.' },
  { term: 'Triage', def: 'Equipe que analisa seu report. Tempo: 1-14 dias.' },
]

const TOOLS = [
  { tool: 'subfinder', desc: 'Descobre subdominios', color: 'text-blue-400' },
  { tool: 'httpx', desc: 'Verifica hosts ativos', color: 'text-cyan-400' },
  { tool: 'nuclei', desc: 'Scanner de vulns com templates', color: 'text-red-400' },
  { tool: 'naabu', desc: 'Port scanner rapido', color: 'text-yellow-400' },
  { tool: 'ffuf', desc: 'Fuzzer de diretorios', color: 'text-orange-400' },
  { tool: 'sqlmap', desc: 'Detecta SQL Injection', color: 'text-red-500' },
  { tool: 'dalfox', desc: 'Scanner XSS', color: 'text-purple-400' },
  { tool: 'arjun', desc: 'Descobre parametros HTTP ocultos', color: 'text-emerald-400' },
  { tool: 'gitleaks', desc: 'Busca secrets em repos Git', color: 'text-pink-400' },
  { tool: 'kiterunner', desc: 'Descobre rotas de API', color: 'text-violet-400' },
  { tool: 'dnsx', desc: 'Resolucao DNS em massa', color: 'text-teal-400' },
  { tool: 'katana', desc: 'Crawler de URLs e endpoints', color: 'text-amber-400' },
]

const TIPS = [
  { tip: 'Priorize Critical e High: pagam mais e sao triados mais rapido.', icon: '🎯' },
  { tip: 'Preencha todos os campos: relatorios completos tem menor chance de N/A.', icon: '📝' },
  { tip: 'Use o Pipeline para gerar relatorio com IA antes de submeter.', icon: '🤖' },
  { tip: 'Teste no Sandbox antes de enviar ao programa real.', icon: '🧪' },
  { tip: 'IDOR e SQLi sao os tipos que mais pagam bounty.', icon: '💰' },
  { tip: 'Documente impacto real: "acesso a 10k usuarios" > "parametro vulneravel".', icon: '📊' },
  { tip: 'Pesquise o Hacktivity do programa antes - evite duplicatas.', icon: '🔍' },
  { tip: 'Encadeie vulns: XSS + CSRF = impacto maior = bounty maior.', icon: '🔗' },
]

const ARCH = [
  { step: 'Cron (15min)', desc: 'Scheduler verifica targets sem scan recente', color: 'bg-blue-500/15 border-blue-500/30 text-blue-300' },
  { step: 'Redis Queue', desc: 'Jobs enfileirados no Redis (ARQ)', color: 'bg-orange-500/15 border-orange-500/30 text-orange-300' },
  { step: 'Workers (4x)', desc: 'Executam subfinder, httpx, nuclei em paralelo', color: 'bg-violet-500/15 border-violet-500/30 text-violet-300' },
  { step: 'SSE Stream', desc: 'Backend emite eventos. Dashboard atualiza live', color: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
  { step: 'Pipeline IA', desc: 'Ollama/Claude gera relatorio + score 0-100', color: 'bg-pink-500/15 border-pink-500/30 text-pink-300' },
  { step: 'HackerOne', desc: 'Se score >= 70%, submete automaticamente', color: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300' },
]

const OWASP = [
  { rank: 'A01', name: 'Broken Access Control', desc: 'IDOR, privilege escalation', ex: 'Mudar user_id na URL', color: 'text-red-400', pct: '94%' },
  { rank: 'A02', name: 'Cryptographic Failures', desc: 'Dados sem criptografia', ex: 'Cookies sem Secure flag', color: 'text-orange-400', pct: '78%' },
  { rank: 'A03', name: 'Injection', desc: 'SQLi, XSS, Command Injection', ex: "' OR 1=1--", color: 'text-yellow-400', pct: '94%' },
  { rank: 'A04', name: 'Insecure Design', desc: 'Falhas de logica de negocio', ex: 'Reset de senha sem verificacao', color: 'text-blue-400', pct: '40%' },
  { rank: 'A05', name: 'Security Misconfiguration', desc: 'Config padrao, debug em prod', ex: 'Stack traces expostos, CORS *', color: 'text-cyan-400', pct: '90%' },
  { rank: 'A06', name: 'Vulnerable Components', desc: 'Libs desatualizadas com CVEs', ex: 'Log4j, Spring4Shell', color: 'text-violet-400', pct: '82%' },
  { rank: 'A07', name: 'Auth Failures', desc: 'Brute force sem protecao', ex: 'Login sem rate limit', color: 'text-pink-400', pct: '72%' },
  { rank: 'A08', name: 'Data Integrity Failures', desc: 'Deserializacao insegura', ex: 'Supply chain attack', color: 'text-emerald-400', pct: '36%' },
  { rank: 'A09', name: 'Logging Failures', desc: 'Sem logs de seguranca', ex: 'Brute force sem alerta', color: 'text-zinc-400', pct: '56%' },
  { rank: 'A10', name: 'SSRF', desc: 'Servidor faz requests internos', ex: 'url=http://169.254.169.254', color: 'text-amber-400', pct: '68%' },
]

const REPORT_SEC = [
  { s: 'Titulo', desc: 'Especifico. Ex: "IDOR em /api/users/{id}"', tip: 'Inclua tipo de vuln e endpoint', req: true },
  { s: 'Severidade', desc: 'Baseada no CVSS 3.1 com vetor', tip: 'Use cvssscores.com', req: true },
  { s: 'Resumo', desc: '2-3 paragrafos: o que e, onde esta, por que e perigoso', tip: 'Seja direto', req: true },
  { s: 'Passos', desc: 'Lista numerada. Requests HTTP exatos', tip: 'Screenshots ajudam muito', req: true },
  { s: 'Impacto', desc: 'O que um atacante pode fazer? Quantos usuarios?', tip: 'Quantifique o dano', req: true },
  { s: 'Material', desc: 'Screenshots, videos, scripts PoC', tip: 'Video de 30-60s e o melhor', req: false },
  { s: 'Correcao', desc: 'Como o dev deve corrigir', tip: 'Mostra conhecimento tecnico', req: false },
]

const H1_LIFE = [
  { state: 'New', desc: 'Report chegou. Equipe nao viu.', dur: '0-3d', icon: '📩', color: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300' },
  { state: 'Triaged', desc: 'Confirmado valido. Aguardando fix.', dur: '1-30d', icon: '✅', color: 'border-blue-500/30 bg-blue-500/10 text-blue-300' },
  { state: 'Bounty', desc: 'Bounty aprovado e pago.', dur: '1-90d', icon: '💰', color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  { state: 'Resolved', desc: 'Vuln corrigida. Report fechado.', dur: 'Var', icon: '🔒', color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  { state: 'Informative', desc: 'Valido mas sem bounty.', dur: '-', icon: 'ℹ️', color: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300' },
  { state: 'Duplicate', desc: 'Outro reportou antes.', dur: '-', icon: '📋', color: 'border-orange-500/30 bg-orange-500/10 text-orange-300' },
  { state: 'N/A', desc: 'Nao aplicavel. Reduz Signal.', dur: '-', icon: '❌', color: 'border-red-500/30 bg-red-500/10 text-red-300' },
  { state: 'Spam', desc: 'Invalido. Penalidade severa.', dur: '-', icon: '🚫', color: 'border-red-500/30 bg-red-500/10 text-red-400' },
]

function Accordion({ icon, title, open, onToggle, children }: {
  icon: React.ReactNode; title: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/30 transition-colors">
        <div className="flex items-center gap-3">{icon}<span className="text-base font-semibold">{title}</span></div>
        <ChevronDown size={16} className={cn('text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  )
}

export function DashLearningSection({ bySev, byStatus, totalFindings }: {
  bySev: Record<string, number>; byStatus: Record<string, number>; totalFindings: number
}) {
  const [open, setOpen] = useState<string | null>(null)
  const tog = (s: string) => setOpen(open === s ? null : s)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Info size={18} className="text-blue-400" />
        <h2 className="text-lg font-bold">Centro de Aprendizado</h2>
        <span className="text-sm text-muted-foreground">entenda cada parte da plataforma</span>
      </div>

      <Accordion icon={<Layers size={18} className="text-violet-400" />} title="Como a plataforma funciona por dentro" open={open === 'arch'} onToggle={() => tog('arch')}>
        <p className="text-sm text-muted-foreground">Backend (FastAPI) serve a API, workers (ARQ) executam recon, MongoDB armazena tudo e Redis gerencia jobs + pub/sub.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ARCH.map(f => (<div key={f.step} className={cn('px-4 py-3 rounded-lg border', f.color)}><p className="text-sm font-semibold">{f.step}</p><p className="text-xs opacity-80 mt-1">{f.desc}</p></div>))}
        </div>
        <div className="bg-zinc-900/60 rounded-lg p-4 font-mono text-xs text-zinc-400 leading-relaxed">
          <p className="text-emerald-400 mb-1"># Fluxo completo:</p>
          <p>Cron &rarr; scheduler &rarr; Redis &rarr; Worker &rarr; subfinder &rarr; httpx &rarr; nuclei &rarr;</p>
          <p>MongoDB &rarr; SSE &rarr; Dashboard &rarr; Pipeline IA &rarr; Revisao &rarr; HackerOne API</p>
        </div>
        <div className="bg-zinc-900/60 rounded-lg p-4 font-mono text-xs text-zinc-400 leading-relaxed">
          <p className="text-blue-400 mb-1"># Stack tecnologico:</p>
          <p>Backend: Python 3.12 + FastAPI + Beanie + ARQ</p>
          <p>Frontend: Next.js 14 + React 18 + Tailwind + Recharts</p>
          <p>IA: Ollama (local) com fallback para Claude (Anthropic)</p>
          <p>Infra: Docker Compose (dev) / Kubernetes + HPA (prod)</p>
        </div>
      </Accordion>

      <Accordion icon={<Shield size={18} className="text-red-400" />} title="OWASP Top 10 - vulnerabilidades mais comuns" open={open === 'owasp'} onToggle={() => tog('owasp')}>
        <p className="text-sm text-muted-foreground mb-2">As 10 categorias mais criticas (OWASP 2021). Foque nessas para maximizar bounties.</p>
        <div className="space-y-2">
          {OWASP.map(o => (
            <div key={o.rank} className="flex items-start gap-4 px-4 py-3 rounded-lg border border-border/50 hover:bg-accent/20 transition-colors">
              <div className="shrink-0 text-center">
                <span className={cn('font-mono text-lg font-bold', o.color)}>{o.rank}</span>
                <p className="text-[10px] text-zinc-500 mt-0.5">{o.pct} apps</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-bold', o.color)}>{o.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{o.desc}</p>
                <p className="text-xs text-zinc-500 mt-1 font-mono">Ex: {o.ex}</p>
              </div>
            </div>
          ))}
        </div>
      </Accordion>

      <Accordion icon={<BookOpen size={18} className="text-orange-400" />} title="Como escrever um bom report no HackerOne" open={open === 'report'} onToggle={() => tog('report')}>
        <p className="text-sm text-muted-foreground mb-2">A IA gera essas secoes automaticamente. Reports bem escritos sao triados mais rapido.</p>
        <div className="space-y-3">
          {REPORT_SEC.map(s => (
            <div key={s.s} className="rounded-lg border border-border/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/40">
                <span className="text-sm font-bold">{s.s}</span>
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded', s.req ? 'bg-red-500/15 text-red-400' : 'bg-zinc-500/15 text-zinc-400')}>{s.req ? 'OBRIGATORIO' : 'RECOMENDADO'}</span>
              </div>
              <div className="px-4 py-3 space-y-1">
                <p className="text-xs text-muted-foreground">{s.desc}</p>
                <p className="text-xs text-emerald-400/80">Dica: {s.tip}</p>
              </div>
            </div>
          ))}
        </div>
      </Accordion>

      <Accordion icon={<Target size={18} className="text-orange-400" />} title="Ciclo de vida de um report no HackerOne" open={open === 'h1life'} onToggle={() => tog('h1life')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {H1_LIFE.map(s => (
            <div key={s.state} className={cn('px-4 py-3 rounded-lg border', s.color)}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{s.icon}</span>
                <span className="text-sm font-bold">{s.state}</span>
                {s.dur !== '-' && <span className="text-[10px] text-zinc-500 ml-auto font-mono">{s.dur}</span>}
              </div>
              <p className="text-xs opacity-80">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="bg-zinc-900/60 rounded-lg p-4 text-sm text-muted-foreground">
          <p className="font-bold text-foreground mb-2">Metricas H1:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="px-3 py-2 rounded border border-border/50"><p className="text-xs font-bold text-blue-400">Signal (0-7)</p><p className="text-[11px] text-zinc-400 mt-1">Qualidade dos reports</p></div>
            <div className="px-3 py-2 rounded border border-border/50"><p className="text-xs font-bold text-violet-400">Impact (0-7)</p><p className="text-[11px] text-zinc-400 mt-1">Gravidade media das vulns</p></div>
            <div className="px-3 py-2 rounded border border-border/50"><p className="text-xs font-bold text-emerald-400">Reputation</p><p className="text-[11px] text-zinc-400 mt-1">Acesso a programas privados</p></div>
          </div>
        </div>
      </Accordion>

      <Accordion icon={<Search size={18} className="text-yellow-400" />} title="Ferramentas de Recon (12 tools)" open={open === 'tools'} onToggle={() => tog('tools')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {TOOLS.map(t => (<div key={t.tool} className="flex items-start gap-3 px-4 py-3 rounded-lg border border-border/50"><span className={cn('font-mono text-sm font-bold shrink-0 w-28', t.color)}>{t.tool}</span><span className="text-sm text-muted-foreground">{t.desc}</span></div>))}
        </div>
      </Accordion>

      <Accordion icon={<FileText size={18} className="text-blue-400" />} title="Glossario (12 termos)" open={open === 'glossary'} onToggle={() => tog('glossary')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {GLOSSARY.map(g => (<div key={g.term} className="px-4 py-3 rounded-lg border border-border/50"><span className="text-sm font-bold text-foreground">{g.term}</span><p className="text-xs text-muted-foreground mt-1">{g.def}</p></div>))}
        </div>
      </Accordion>

      <Accordion icon={<TrendingUp size={18} className="text-emerald-400" />} title="Dicas para maximizar bounties" open={open === 'tips'} onToggle={() => tog('tips')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TIPS.map((b, i) => (<div key={i} className="flex items-start gap-3 px-4 py-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5"><span className="text-xl shrink-0">{b.icon}</span><p className="text-sm text-muted-foreground">{b.tip}</p></div>))}
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-zinc-900/80"><th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Severidade</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">CVSS</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Bounty</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Seus</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Urgencia</th></tr></thead>
            <tbody className="divide-y divide-border">
              {[
                { sev: 'Critical', key: 'critical', cvss: '9.0-10', bounty: '$10k-$50k+', color: 'text-red-400', urg: '24h' },
                { sev: 'High', key: 'high', cvss: '7.0-8.9', bounty: '$2k-$10k', color: 'text-orange-400', urg: '48h' },
                { sev: 'Medium', key: 'medium', cvss: '4.0-6.9', bounty: '$200-$2k', color: 'text-yellow-400', urg: '1sem' },
                { sev: 'Low', key: 'low', cvss: '0.1-3.9', bounty: '$50-$500', color: 'text-blue-400', urg: 'Quando puder' },
                { sev: 'Info', key: 'informational', cvss: 'N/A', bounty: '$0-$50', color: 'text-zinc-400', urg: 'Opcional' },
              ].map(r => (<tr key={r.sev} className="hover:bg-accent/20"><td className={cn('px-4 py-2.5 font-semibold', r.color)}>{r.sev}</td><td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{r.cvss}</td><td className="px-4 py-2.5 text-emerald-400 font-semibold">{r.bounty}</td><td className="px-4 py-2.5 font-bold tabular-nums">{bySev[r.key] ?? 0}</td><td className="px-4 py-2.5 text-muted-foreground text-xs">{r.urg}</td></tr>))}
            </tbody>
          </table>
        </div>
      </Accordion>

      <Accordion icon={<Activity size={18} className="text-cyan-400" />} title="Entendendo seus dados" open={open === 'data'} onToggle={() => tog('data')}>
        <p className="text-sm text-muted-foreground">Cada finding passa por um ciclo de vida:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { st: 'new', label: 'Novo', desc: 'Detectado pelo recon', color: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300', next: 'Revise e aceite' },
            { st: 'triaging', label: 'Triagem', desc: 'Validando reprodutibilidade', color: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300', next: 'Confirme e aceite' },
            { st: 'accepted', label: 'Aceito', desc: 'Pronto para Pipeline', color: 'border-blue-500/30 bg-blue-500/10 text-blue-300', next: 'Execute Pipeline' },
            { st: 'resolved', label: 'Resolvido', desc: 'Submetido ao H1', color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', next: 'Preencha bounty' },
            { st: 'duplicate', label: 'Duplicado', desc: 'Ja reportado', color: 'border-orange-500/30 bg-orange-500/10 text-orange-300', next: 'Normal no recon' },
            { st: 'not_applicable', label: 'N/A', desc: 'Falso positivo', color: 'border-red-500/30 bg-red-500/10 text-red-300', next: 'Ajuste filtros' },
          ].map(s => (<div key={s.st} className={cn('px-4 py-3 rounded-lg border', s.color)}><div className="flex items-center justify-between mb-1"><span className="text-sm font-bold">{s.label}</span><span className="text-lg font-bold tabular-nums">{byStatus[s.st] ?? 0}</span></div><p className="text-xs opacity-80">{s.desc}</p><p className="text-xs opacity-60 mt-2 italic">{s.next}</p></div>))}
        </div>
        <div className="bg-zinc-900/60 rounded-lg p-4 text-sm text-muted-foreground">
          <p><strong className="text-foreground">Total:</strong> {totalFindings} findings</p>
          <p className="mt-1"><strong className="text-foreground">Fluxo:</strong> Novo &rarr; Triagem &rarr; Aceito &rarr; Pipeline IA &rarr; Resolvido</p>
          <p className="mt-1 text-xs text-zinc-500">Pipeline sweep automatico a cada 30 min para findings Aceito.</p>
        </div>
      </Accordion>
    </div>
  )
}
