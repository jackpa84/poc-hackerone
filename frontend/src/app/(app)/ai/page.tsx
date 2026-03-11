'use client'
import { useEffect, useRef, useState } from 'react'
import {
  Bot, Send, Trash2, Settings2, ChevronDown, ChevronRight,
  Cpu, Cloud, CheckCircle2, XCircle, Sparkles, Copy, Check,
  AlertCircle, RefreshCw, Zap,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  provider?: string
  tokens?: number
  loading?: boolean
  error?: boolean
}

interface AIStatus {
  ollama: { available: boolean; url: string; current_model: string; installed_models: string[] }
  claude: { available: boolean; model: string }
  active_provider: string
}

type Provider = 'auto' | 'ollama' | 'claude'

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2)
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="p-1 rounded transition-colors"
      style={{ color: '#555' }}
      onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
      onMouseLeave={e => (e.currentTarget.style.color = '#555')}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProviderBadge({ name }: { name: string }) {
  const isOllama = name.startsWith('ollama')
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded"
      style={{
        background: isOllama ? 'rgba(16,185,129,0.1)' : 'rgba(249,115,22,0.1)',
        color: isOllama ? '#34d399' : '#fb923c',
        border: `1px solid ${isOllama ? 'rgba(16,185,129,0.2)' : 'rgba(249,115,22,0.2)'}`,
      }}>
      {isOllama ? <Cpu size={9} /> : <Cloud size={9} />}
      {name}
    </span>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.25)' }}>
          <Bot size={13} style={{ color: '#f97316' }} />
        </div>
      )}
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className="rounded-xl px-4 py-3 text-sm leading-relaxed"
          style={isUser
            ? { background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.2)', color: '#f5f5f5' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#e4e4e7' }
          }
        >
          {msg.loading ? (
            <div className="flex items-center gap-2 text-zinc-500">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span className="text-xs">Processando...</span>
            </div>
          ) : msg.error ? (
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle size={12} />
              {msg.content}
            </div>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none
              prose-p:my-1 prose-headings:text-zinc-200 prose-headings:font-semibold
              prose-code:text-orange-300 prose-code:bg-orange-500/10 prose-code:px-1 prose-code:rounded
              prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-white/[0.06]
              prose-a:text-blue-400 prose-strong:text-zinc-200
              prose-ul:my-1 prose-li:my-0">
              {isUser
                ? <p className="whitespace-pre-wrap m-0">{msg.content}</p>
                : <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              }
            </div>
          )}
        </div>
        {!isUser && !msg.loading && !msg.error && (
          <div className="flex items-center gap-2 px-1">
            {msg.provider && <ProviderBadge name={msg.provider} />}
            {msg.tokens !== undefined && (
              <span className="text-[10px] text-zinc-600 font-mono">{msg.tokens} tokens</span>
            )}
            <CopyButton text={msg.content} />
          </div>
        )}
      </div>
    </div>
  )
}

function StatusPanel({ status, loading, onRefresh }: {
  status: AIStatus | null; loading: boolean; onRefresh: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Provedores</span>
        <button onClick={onRefresh} disabled={loading}
          className="p-1 rounded transition-colors text-zinc-600 hover:text-zinc-400 disabled:opacity-40">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Ollama */}
      <div className="rounded-lg p-3 space-y-1.5"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Cpu size={11} style={{ color: '#34d399' }} />
            <span className="text-xs font-medium text-zinc-300">Ollama</span>
          </div>
          {status ? (
            status.ollama.available
              ? <CheckCircle2 size={12} style={{ color: '#22c55e' }} />
              : <XCircle size={12} className="text-red-400" />
          ) : <div className="w-3 h-3 rounded-full bg-zinc-700 animate-pulse" />}
        </div>
        {status && (
          <p className="text-[10px] text-zinc-600 font-mono truncate">{status.ollama.current_model}</p>
        )}
        {(status?.ollama.installed_models?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {status?.ollama.installed_models?.slice(0, 3).map(m => (
              <span key={m} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-500 font-mono truncate max-w-[120px]">{m}</span>
            ))}
          </div>
        )}
      </div>

      {/* Claude */}
      <div className="rounded-lg p-3 space-y-1.5"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Cloud size={11} style={{ color: '#fb923c' }} />
            <span className="text-xs font-medium text-zinc-300">Claude</span>
          </div>
          {status ? (
            status.claude.available
              ? <CheckCircle2 size={12} style={{ color: '#22c55e' }} />
              : <XCircle size={12} className="text-red-400" />
          ) : <div className="w-3 h-3 rounded-full bg-zinc-700 animate-pulse" />}
        </div>
        {status && (
          <p className="text-[10px] text-zinc-600 font-mono">{status.claude.model}</p>
        )}
        {status && !status.claude.available && (
          <p className="text-[10px] text-yellow-600">ANTHROPIC_API_KEY não configurada</p>
        )}
      </div>

      {status && (
        <div className="flex items-center gap-1.5 px-1">
          <Zap size={10} style={{ color: '#f97316' }} />
          <span className="text-[10px] text-zinc-500">Ativo: <span className="text-zinc-300 font-medium">{status.active_provider}</span></span>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  // Settings
  const [provider, setProvider] = useState<Provider>('auto')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(2048)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [showSettings, setShowSettings] = useState(true)

  // Status
  const [status, setStatus] = useState<AIStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function fetchStatus() {
    try {
      setStatusLoading(true)
      const res = await api.get<AIStatus>('/ai/status')
      setStatus(res.data)
    } catch {
      setStatus(null)
    } finally {
      setStatusLoading(false)
    }
  }

  useEffect(() => { fetchStatus() }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    const text = input.trim()
    if (!text || sending) return

    const userMsg: Message = { id: uid(), role: 'user', content: text }
    const loadingMsg: Message = { id: uid(), role: 'assistant', content: '', loading: true }

    setMessages(prev => [...prev, userMsg, loadingMsg])
    setInput('')
    setSending(true)

    try {
      const res = await api.post('/ai/chat', {
        message: text,
        provider,
        temperature,
        max_tokens: maxTokens,
        system_prompt: systemPrompt,
      })
      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id
          ? { ...m, content: res.data.content, provider: res.data.provider_used, tokens: res.data.completion_tokens, loading: false }
          : m
      ))
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Erro ao comunicar com a IA'
      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id
          ? { ...m, content: detail, loading: false, error: true }
          : m
      ))
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const totalTokens = messages.reduce((s, m) => s + (m.tokens ?? 0), 0)

  return (
    <div className="flex flex-1 overflow-hidden geo-bg">

      {/* ── Left settings panel ── */}
      <aside
        className="flex flex-col shrink-0 overflow-y-auto"
        style={{
          width: showSettings ? 240 : 44,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: '#040406',
          transition: 'width 0.2s ease',
        }}
      >
        {/* Toggle */}
        <button
          onClick={() => setShowSettings(s => !s)}
          className="flex items-center gap-2 p-3 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
        >
          <Settings2 size={15} />
          {showSettings && <span className="text-xs font-medium">Configurações</span>}
        </button>

        {showSettings && (
          <div className="px-3 pb-4 space-y-4">

            {/* Status dos provedores */}
            <StatusPanel status={status} loading={statusLoading} onRefresh={fetchStatus} />

            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />

            {/* Provider selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Provedor</label>
              <div className="flex flex-col gap-1">
                {(['auto', 'ollama', 'claude'] as Provider[]).map(p => (
                  <button key={p} onClick={() => setProvider(p)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all text-left"
                    style={provider === p
                      ? { background: 'rgba(249,115,22,0.12)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.25)' }
                      : { background: 'transparent', color: '#666', border: '1px solid transparent' }
                    }
                  >
                    {p === 'ollama' ? <Cpu size={11} /> : p === 'claude' ? <Cloud size={11} /> : <Sparkles size={11} />}
                    <span className="capitalize">{p === 'auto' ? 'Auto (Ollama → Claude)' : p}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Temperature */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Temperatura</label>
                <span className="text-[11px] font-mono text-zinc-300">{temperature.toFixed(1)}</span>
              </div>
              <input type="range" min="0" max="1" step="0.1" value={temperature}
                onChange={e => setTemperature(Number(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: '#f97316' }}
              />
              <div className="flex justify-between text-[9px] text-zinc-600">
                <span>Preciso</span>
                <span>Criativo</span>
              </div>
            </div>

            {/* Max tokens */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Máx. Tokens</label>
                <span className="text-[11px] font-mono text-zinc-300">{maxTokens}</span>
              </div>
              <input type="range" min="256" max="4096" step="256" value={maxTokens}
                onChange={e => setMaxTokens(Number(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: '#f97316' }}
              />
            </div>

            {/* System prompt */}
            <div className="space-y-1.5">
              <button onClick={() => setShowSystemPrompt(s => !s)}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider w-full">
                {showSystemPrompt ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                System Prompt
              </button>
              {showSystemPrompt && (
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  placeholder="Instruções de sistema (opcional)..."
                  rows={4}
                  className="w-full text-[11px] rounded-lg p-2 resize-none transition-colors"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#d4d4d8',
                    outline: 'none',
                    fontFamily: 'ui-monospace, monospace',
                  }}
                />
              )}
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />

            {/* Stats */}
            {totalTokens > 0 && (
              <div className="space-y-1 text-[10px] text-zinc-600">
                <div className="flex justify-between">
                  <span>Mensagens</span>
                  <span className="font-mono text-zinc-500">{messages.filter(m => !m.loading).length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tokens gerados</span>
                  <span className="font-mono text-zinc-500">{totalTokens.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ── Main chat area ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #f97316, #fb923c)', boxShadow: '0 0 12px rgba(249,115,22,0.3)' }}>
              <Bot size={13} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">AI Assistant</p>
              <p className="text-[10px] text-zinc-600">Bug bounty & security analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status && (
              <span className="text-[10px] text-zinc-600 font-mono hidden sm:block">
                {status.active_provider !== 'none' ? `🟢 ${status.active_provider}` : '🔴 nenhum provedor'}
              </span>
            )}
            {messages.length > 0 && (
              <button onClick={() => setMessages([])}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-red-400 transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                <Trash2 size={11} />
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.15)' }}>
                <Sparkles size={24} style={{ color: '#f97316' }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-300">AI Assistant pronto</p>
                <p className="text-xs text-zinc-600 mt-1 max-w-xs">
                  Pergunte sobre vulnerabilidades, peça análise de payloads, solicite relatórios ou explore técnicas de ataque.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md w-full mt-2">
                {[
                  'Explica como funciona um SSRF e como explorar',
                  'Qual o impacto de business logic bugs no H1?',
                  'Como escalar de XSS refletido para account takeover?',
                  'Descreva técnicas de bypass de WAF para SQLi',
                ].map(suggestion => (
                  <button key={suggestion}
                    onClick={() => { setInput(suggestion); textareaRef.current?.focus() }}
                    className="text-left px-3 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-5 pb-5 pt-3 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex gap-3 items-end rounded-xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre segurança, analise vulnerabilidades... (Enter para enviar, Shift+Enter para nova linha)"
              rows={1}
              disabled={sending}
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 resize-none outline-none disabled:opacity-50"
              style={{ minHeight: 24, maxHeight: 120 }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #f97316, #fb923c)', boxShadow: input.trim() && !sending ? '0 0 12px rgba(249,115,22,0.3)' : 'none' }}
            >
              {sending
                ? <RefreshCw size={13} className="text-white animate-spin" />
                : <Send size={13} className="text-white" />
              }
            </button>
          </div>
          <p className="text-[10px] text-zinc-700 text-center mt-2">
            Enter para enviar · Shift+Enter para nova linha · Provedor: <span className="text-zinc-600">{provider}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
