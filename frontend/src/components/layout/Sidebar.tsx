'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Shield, Target, Bug, Globe,
  LayoutDashboard, LogOut, ChevronRight, BookOpen, SendHorizonal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { Separator } from '@/components/ui/separator'

const NAV_ITEMS = [
  { href: '/',           label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/jobs',       label: 'Jobs',       icon: Target },
  { href: '/findings',   label: 'Findings',   icon: Bug },
  { href: '/hackerone',  label: 'HackerOne',  icon: Globe },
  { href: '/pipeline',   label: 'Pipeline',   icon: SendHorizonal },
  { href: '/report-guide', label: 'Guia Report', icon: BookOpen },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  return (
    <aside className="w-60 bg-card border-r border-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Shield size={14} className="text-primary-foreground" />
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">BugBounty AI</p>
            <p className="text-xs text-muted-foreground leading-tight">Platform</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Navegação */}
      <nav className="flex-1 p-3 space-y-0.5 mt-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link key={href} href={href}
              className={cn(
                'group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all',
                active
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}>
              <div className="flex items-center gap-2.5">
                <Icon size={15} className={active ? 'text-primary' : ''} />
                {label}
              </div>
              {active && <ChevronRight size={12} className="text-primary" />}
            </Link>
          )
        })}
      </nav>

      <Separator />

      {/* Usuário */}
      {user && (
        <div className="p-3">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-accent transition-colors">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user.username}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
            <button onClick={logout}
              className="ml-2 p-1.5 rounded-md text-muted-foreground hover:text-destructive-foreground hover:bg-destructive/20 transition-colors shrink-0">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
