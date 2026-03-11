'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface TooltipContent {
  title: string
  description: string
  priority?: 'critical' | 'high' | 'medium' | 'low' | 'info'
  actions?: string[]
  details?: { label: string; value: string }[]
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'border-red-500/40 bg-red-950/70',
  high:     'border-orange-500/40 bg-orange-950/70',
  medium:   'border-yellow-500/40 bg-yellow-950/70',
  low:      'border-blue-500/40 bg-blue-950/70',
  info:     'border-zinc-500/40 bg-zinc-900/90',
}

const PRIORITY_BADGE: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high:     'bg-orange-500/20 text-orange-300 border-orange-500/30',
  medium:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  low:      'bg-blue-500/20 text-blue-300 border-blue-500/30',
  info:     'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
}

const PRIORITY_LABEL: Record<string, string> = {
  critical: '🔴 Crítico', high: '🟠 Alto', medium: '🟡 Médio', low: '🔵 Baixo', info: 'ℹ Info',
}

const TOOLTIP_W = 320

export function RichTooltip({
  content,
  children,
  className,
}: {
  content: TooltipContent
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [vPos, setVPos] = useState<'bottom' | 'top'>('bottom')
  const [hPos, setHPos] = useState<'left' | 'right'>('left')
  const ref = useRef<HTMLDivElement>(null)
  const priority = content.priority ?? 'info'

  const handleEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setVPos(rect.bottom + 340 > window.innerHeight ? 'top' : 'bottom')
      setHPos(rect.left + TOOLTIP_W > window.innerWidth - 16 ? 'right' : 'left')
    }
    setOpen(true)
  }

  return (
    <div
      ref={ref}
      className={cn('relative', className)}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <div className={cn(
          'absolute z-50 w-80 rounded-xl border backdrop-blur-md shadow-2xl pointer-events-none select-none',
          PRIORITY_COLOR[priority],
          vPos === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
          hPos === 'left'   ? 'left-0'        : 'right-0',
        )}>
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-white leading-snug">{content.title}</p>
              <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold border shrink-0', PRIORITY_BADGE[priority])}>
                {PRIORITY_LABEL[priority]}
              </span>
            </div>

            <p className="text-[12px] text-zinc-300 leading-relaxed">{content.description}</p>

            {content.details && content.details.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-white/10">
                {content.details.map(d => (
                  <div key={d.label}>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{d.label}</p>
                    <p className="text-[11px] text-zinc-200 font-medium">{d.value}</p>
                  </div>
                ))}
              </div>
            )}

            {content.actions && content.actions.length > 0 && (
              <div className="pt-1 border-t border-white/10 space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold">O que fazer</p>
                {content.actions.map((a, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-[10px] text-zinc-500 mt-0.5 shrink-0">→</span>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">{a}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
