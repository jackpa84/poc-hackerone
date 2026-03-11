'use client'

import { BookOpen, CheckCircle2, AlertTriangle, Lightbulb, Shield, ExternalLink, Info, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

// ── Severity thresholds (HackerOne CVSS-based) ────────────────────────────
const SEVERITIES = [
  {
    level: 'Critical',
    cvss: '9.0 – 10.0',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/25',
    examples: 'RCE sem autenticação, SQL Injection com dump do banco, Account Takeover completo',
    bounty: '$$$$$',
  },
  {
    level: 'High',
    cvss: '7.0 – 8.9',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/25',
    examples: 'IDOR com dados sensíveis, SQLi autenticado, SSRF interno, Privilege Escalation',
    bounty: '$$$$',
  },
  {
    level: 'Medium',
    cvss: '4.0 – 6.9',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/25',
    examples: 'Stored XSS, CSRF em ação crítica, Broken Auth parcial, Open Redirect + phishing',
    bounty: '$$$',
  },
  {
    level: 'Low',
    cvss: '0.1 – 3.9',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/25',
    examples: 'Reflected XSS (baixo impacto), leakage de stack trace, Missing security headers',
    bounty: '$$',
  },
  {
    level: 'Informational',
    cvss: 'N/A',
    color: 'text-zinc-400',
    bg: 'bg-zinc-500/10',
    border: 'border-zinc-500/25',
    examples: 'Best practices, rate limiting ausente sem impacto real, versão de software exposta',
    bounty: '-',
  },
]

// ── Report states on HackerOne ────────────────────────────────────────────
const STATES = [
  { state: 'New',          color: 'text-zinc-400',    desc: 'Recém submetido, aguardando triagem' },
  { state: 'Triaged',      color: 'text-blue-400',    desc: 'Confirmado como válido, aguardando fix' },
  { state: 'Needs more info', color: 'text-yellow-400', desc: 'Analista pediu mais detalhes — responda rápido' },
  { state: 'Resolved',     color: 'text-emerald-400', desc: 'Corrigido. Bounty geralmente liberado aqui' },
  { state: 'Informative',  color: 'text-zinc-500',    desc: 'Válido mas sem impacto suficiente para bounty' },
  { state: 'Not Applicable', color: 'text-orange-400', desc: 'Fora do escopo ou comportamento esperado' },
  { state: 'Duplicate',    color: 'text-red-400',     desc: 'Já foi reportado por outro pesquisador' },
  { state: 'Spam',         color: 'text-red-500',     desc: 'Report inválido/malicioso — afeta reputação' },
]

// ── Common rejection reasons ───────────────────────────────────────────────
const REJECTIONS = [
  { reason: 'Out of scope',       fix: 'Leia o escopo do programa ANTES de testar. Assets não listados = N/A.' },
  { reason: 'Self-XSS',           fix: 'XSS que só afeta seu próprio navegador não é uma vulnerabilidade reportável.' },
  { reason: 'Missing PoC',        fix: 'Sempre inclua passos exatos + request/response completo do Burp Suite.' },
  { reason: 'No security impact', fix: 'IDOR sem dados sensíveis, rate limit sem impacto = Informational.' },
  { reason: 'Duplicate',          fix: 'Pesquise se o bug foi reportado. Programas grandes têm muitos duplicados.' },
  { reason: 'Non-reproducible',   fix: 'Teste em conta fresh, documente ambiente (browser, OS, extensões).' },
  { reason: 'Known / Won\'t fix', fix: 'Alguns programas listam bugs conhecidos na política. Leia antes de submeter.' },
  { reason: 'Theoretical',        fix: 'Demonstre o impacto na prática. Hipóteses sem PoC são rejeitadas.' },
]

// ── Report template fields ─────────────────────────────────────────────────
const TEMPLATE_FIELDS = [
  {
    field: 'Title',
    required: true,
    tip: '[Tipo] Descrição objetiva do impacto — ex: [Stored XSS] Execução de scripts em perfis públicos via campo "bio"',
  },
  {
    field: 'Severity',
    required: true,
    tip: 'Escolha com base no CVSS 3.1. Justifique no corpo do report. Não infle — prejudica sua reputação.',
  },
  {
    field: 'Weakness',
    required: false,
    tip: 'Selecione o CWE correto (ex: CWE-79 XSS, CWE-89 SQLi). Facilita triagem e indexação.',
  },
  {
    field: 'Vulnerability Information',
    required: true,
    tip: 'Descrição técnica completa: o que é, onde está, por que é explorável. Inclua contexto de negócio.',
  },
  {
    field: 'Steps to Reproduce',
    required: true,
    tip: '1. Faça login em conta A\n2. Acesse /api/endpoint\n3. Altere parâmetro X para Y\n4. Observe resposta Z\nUse Burp requests completos.',
  },
  {
    field: 'Impact',
    required: true,
    tip: 'O que um atacante real consegue fazer? "Acesso a dados de qualquer usuário" > "bug de segurança". Seja específico.',
  },
  {
    field: 'Supporting Material',
    required: false,
    tip: 'Screenshots, vídeos, PoC code, requests Burp. Para bugs complexos, vídeo de 30s vale mais que 10 imagens.',
  },
]

export default function ReportGuidePage() {
  return (
    <div className="space-y-8 max-w-4xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-orange-500/10">
          <BookOpen size={18} className="text-orange-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Guia de Reports — HackerOne</h1>
          <p className="text-sm text-muted-foreground">Baseado nas diretrizes oficiais da plataforma</p>
        </div>
        <a
          href="https://docs.hackerone.com/hackers/submitting-reports.html"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1.5 text-xs text-orange-400 hover:underline"
        >
          <ExternalLink size={11} />
          Docs oficiais
        </a>
      </div>

      {/* Intro */}
      <div className="p-4 rounded-xl border border-orange-500/20 bg-orange-500/5 text-sm text-muted-foreground leading-relaxed">
        A HackerOne avalia reports com base em <strong className="text-foreground">impacto real, reprodutibilidade e clareza</strong>.
        Reports bem escritos são triados mais rápido, têm menor chance de serem marcados como duplicados ou N/A,
        e influenciam diretamente o bounty recebido e seu <strong className="text-foreground">Signal</strong> na plataforma.
      </div>

      {/* Severity Table */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Shield size={14} className="text-orange-400" />
          Classificação de Severidade (CVSS 3.1)
        </h2>
        <div className="space-y-2">
          {SEVERITIES.map(s => (
            <div key={s.level} className={`flex items-start gap-3 p-3 rounded-xl border ${s.border} ${s.bg}`}>
              <div className="flex items-center gap-2 w-36 shrink-0">
                <span className={`text-xs font-bold ${s.color}`}>{s.level}</span>
                <span className="text-[10px] text-muted-foreground">{s.cvss}</span>
              </div>
              <p className="text-[11px] text-muted-foreground flex-1 leading-relaxed">{s.examples}</p>
              <span className={`text-xs font-bold shrink-0 ${s.color}`}>{s.bounty}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Report Template */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-400" />
          Campos do Report (Template HackerOne)
        </h2>
        <div className="space-y-2">
          {TEMPLATE_FIELDS.map(f => (
            <div key={f.field} className="p-3.5 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-foreground">{f.field}</span>
                {f.required
                  ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/15 text-red-400 border border-red-500/20">OBRIGATÓRIO</span>
                  : <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-500/15 text-zinc-400 border border-zinc-500/20">OPCIONAL</span>
                }
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-line">{f.tip}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Report States */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Info size={14} className="text-blue-400" />
          Estados de um Report na HackerOne
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {STATES.map(s => (
            <div key={s.state} className="flex items-start gap-2.5 p-3 rounded-xl bg-card border border-border">
              <span className={`text-xs font-semibold shrink-0 mt-0.5 ${s.color}`}>{s.state}</span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Common Rejections */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <XCircle size={14} className="text-red-400" />
          Motivos Comuns de Rejeição e Como Evitar
        </h2>
        <div className="space-y-2">
          {REJECTIONS.map(r => (
            <div key={r.reason} className="flex items-start gap-3 p-3.5 rounded-xl bg-card border border-border">
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 shrink-0 mt-0.5 whitespace-nowrap">
                {r.reason}
              </span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{r.fix}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Good vs Bad titles */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Lightbulb size={14} className="text-yellow-400" />
          Títulos: Ruim vs Bom
        </h2>
        <div className="space-y-2">
          {[
            {
              bad:  'XSS found',
              good: '[Stored XSS] Script execution via bio field affects all visitors of public profiles',
            },
            {
              bad:  'IDOR vulnerability',
              good: '[IDOR] Unauthenticated access to any user\'s private messages via /api/messages?user_id=',
            },
            {
              bad:  'Authentication bypass',
              good: '[Auth Bypass] JWT signature not validated on /api/admin/* — full admin access without credentials',
            },
            {
              bad:  'SQL injection',
              good: '[SQLi] Blind SQL injection in /search?q= parameter leaks full users table via time-based attack',
            },
          ].map((ex, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-lg bg-red-500/8 border border-red-500/15 text-red-400/70 line-through leading-relaxed">
                {ex.bad}
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-500/8 border border-emerald-500/15 text-emerald-300 leading-relaxed">
                {ex.good}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-2">
          <div className="flex-1 text-center text-[10px] text-red-400/70">❌ Vago, sem impacto claro</div>
          <div className="flex-1 text-center text-[10px] text-emerald-400">✅ Tipo + localização + impacto</div>
        </div>
      </div>

      {/* Signal & Reputation */}
      <Card className="border border-orange-500/20 bg-orange-500/5">
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Shield size={14} className="text-orange-400" />
            Signal e Reputação na HackerOne
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                metric: 'Signal',
                desc: 'Média de resolução dos seus reports. Quanto maior (máx 7), maior prioridade na triagem e acesso a programas privados.',
                color: 'text-orange-400',
              },
              {
                metric: 'Impact',
                desc: 'Calculado com base no bounty acumulado. Influencia o ranking global e convites para programas premium.',
                color: 'text-yellow-400',
              },
              {
                metric: 'Reputation',
                desc: 'Pontuação geral. Reports Informative e Duplicate reduzem. Resolved e Triaged aumentam. Spam = penalidade severa.',
                color: 'text-blue-400',
              },
            ].map(m => (
              <div key={m.metric} className="space-y-1">
                <p className={`text-xs font-bold ${m.color}`}>{m.metric}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 pb-4">
        {[
          { label: 'Submitting Reports', href: 'https://docs.hackerone.com/hackers/submitting-reports.html' },
          { label: 'CVSS Calculator', href: 'https://www.first.org/cvss/calculator/3.1' },
          { label: 'CWE List', href: 'https://cwe.mitre.org/data/definitions/1000.html' },
          { label: 'Disclosure Guidelines', href: 'https://docs.hackerone.com/hackers/disclosure.html' },
          { label: 'H1 Severity Ratings', href: 'https://docs.hackerone.com/programs/severity-ratings.html' },
        ].map(l => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
          >
            <ExternalLink size={10} />
            {l.label}
          </a>
        ))}
      </div>

    </div>
  )
}
