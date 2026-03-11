'use client'
/**
 * /login — Tela de login
 *
 * Formulário simples: email + senha → chama POST /auth/login
 * Salva o JWT no localStorage e redireciona para o dashboard.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Shield } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const router           = useRouter()
  const { login }        = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      router.push('/')
    } catch {
      setError('Email ou senha incorretos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center mb-3">
            <Shield size={24} />
          </div>
          <h1 className="text-xl font-bold">BugBounty Platform</h1>
          <p className="text-gray-400 text-sm mt-1">Entre na sua conta</p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-6 border border-gray-800 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="voce@email.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-red-600 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Não tem conta?{' '}
          <Link href="/register" className="text-red-400 hover:text-red-300">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  )
}
