'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Shield, Target, Bug,
  LayoutDashboard, LogOut, ChevronRight, BookOpen, SendHorizonal, Activity, Bot, Boxes, ShieldAlert, Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { Separator } from '@/components/ui/separator'

const NAV_ITEMS = [
  { href: '/',           label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/jobs',       label: 'Jobs',       icon: Target },
  { href: '/findings',   label: 'Findings',   icon: Bug },
  { href: '/pipeline',   label: 'Pipeline',   icon: SendHorizonal },
  { href: '/report-guide', label: 'Guia Report', icon: BookOpen },
  { href: '/ai',           label: 'AI Assistant', icon: Bot },
  { href: '/health',        label: 'Status',        icon: Activity },
  { href: '/architecture',    label: 'Arquitetura',   icon: Boxes },
  { href: '/vuln-types',      label: 'Tipos de Vuln', icon: ShieldAlert },
  { href: '/hackerone',       label: 'H1 Inbox',      icon: Inbox },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  return (
    <aside className="w-60 flex flex-col shrink-0" style={{ background: '#040406', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Logo */}
      <div className="p-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #f97316, #fb923c)', boxShadow: '0 0 16px rgba(249,115,22,0.4)' }}>
            <Shield size={15} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight text-white">BugBounty AI</p>
            <p className="text-[10px] leading-tight" style={{ color: '#f97316' }}>Platform</p>
          </div>
        </div>
      </div>

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

      {/* Navegação */}
      <nav className="flex-1 p-3 space-y-0.5 mt-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link key={href} href={href}
              className={cn(
                'group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-200',
                active
                  ? 'font-semibold'
                  : 'text-zinc-500 hover:text-zinc-200'
              )}
              style={active ? {
                background: 'rgba(249,115,22,0.12)',
                color: '#fb923c',
                boxShadow: 'inset 0 0 0 1px rgba(249,115,22,0.2)',
              } : {}}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '' }}
            >
              <div className="flex items-center gap-2.5">
                <Icon size={15} style={active ? { color: '#fb923c' } : {}} />
                {label}
              </div>
              {active && <ChevronRight size={12} style={{ color: '#fb923c' }} />}
            </Link>
          )
        })}
      </nav>

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

      {/* Usuário */}
      {user && (
        <div className="p-3">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg transition-colors"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate text-zinc-200">{user.username}</p>
              <p className="text-xs truncate" style={{ color: '#555' }}>{user.email}</p>
            </div>
            <button onClick={logout}
              className="ml-2 p-1.5 rounded-md transition-colors shrink-0"
              style={{ color: '#555' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#555'; (e.currentTarget as HTMLElement).style.background = '' }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
