'use client'
import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { RealtimeProvider } from '@/contexts/RealtimeContext'
import { RealtimeStatusBar } from '@/components/layout/RealtimeStatusBar'
import api from '@/lib/api'

const DEV_EMAIL    = 'admin@example.com'
const DEV_PASSWORD = 'bugbounty2026'
const DEV_USERNAME = 'jackson'

async function ensureToken() {
  if (typeof window === 'undefined') return

  // Valida token existente chamando /auth/me
  if (localStorage.getItem('token')) {
    try {
      await api.get('/auth/me')
      return // Token válido
    } catch {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
  }

  // Tenta login
  try {
    const { data } = await api.post('/auth/login', { email: DEV_EMAIL, password: DEV_PASSWORD })
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    return
  } catch {}

  // Tenta registro (primeiro acesso)
  try {
    const { data } = await api.post('/auth/register', {
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
      username: DEV_USERNAME,
    })
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify(data.user))
  } catch {}
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    ensureToken().finally(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <RealtimeProvider>
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <RealtimeStatusBar />
          <main className="flex-1 overflow-auto p-6 lg:p-8 geo-bg">
            {children}
          </main>
        </div>
      </div>
    </RealtimeProvider>
  )
}
