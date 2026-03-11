'use client'
/**
 * /register — Tela de cadastro
 *
 * Cria uma nova conta → chama POST /auth/register
 * Já faz login automático e redireciona para o dashboard.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Shield } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function RegisterPage() {
  const router              = useRouter()
  const { register }        = useAuth()
  const [form, setForm]     = useState({ email: '', username: '', password: '', confirm: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirm) {
      setError('As senhas não coincidem')
      return
    }
    if (form.password.length < 6) {
      setError('Senha deve ter pelo menos 6 caracteres')
      return
    }

    setLoading(true)
    try {
      await register(form.email, form.username, form.password)
      router.push('/')
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center mb-3">
            <Shield size={24} />
          </div>
          <h1 className="text-xl font-bold">Criar conta</h1>
          <p className="text-gray-400 text-sm mt-1">Comece a caçar bugs agora</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-6 border border-gray-800 space-y-4">
          {[
            { label: 'Email',           field: 'email',    type: 'email',    placeholder: 'voce@email.com' },
            { label: 'Nome de usuário', field: 'username', type: 'text',     placeholder: 'hacker123' },
            { label: 'Senha',           field: 'password', type: 'password', placeholder: '••••••••' },
            { label: 'Confirmar senha', field: 'confirm',  type: 'password', placeholder: '••••••••' },
          ].map(({ label, field, type, placeholder }) => (
            <div key={field}>
              <label className="block text-sm text-gray-400 mb-1.5">{label}</label>
              <input
                type={type}
                value={form[field as keyof typeof form]}
                onChange={set(field)}
                required
                placeholder={placeholder}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>
          ))}

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
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Já tem conta?{' '}
          <Link href="/login" className="text-red-400 hover:text-red-300">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
