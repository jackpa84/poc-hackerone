import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted/60',
        className
      )}
    />
  )
}

/** Linha de texto genérica */
export function SkeletonText({ className }: SkeletonProps) {
  return <Skeleton className={cn('h-3 w-full', className)} />
}

/** Card com shimmer para itens de lista */
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('p-4 rounded-xl border border-border space-y-3', className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-16 rounded" />
        <Skeleton className="h-4 flex-1 max-w-xs" />
        <Skeleton className="h-3 w-24 ml-auto" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  )
}

/** Linha de tabela */
export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  const widths = ['flex-1', 'w-24', 'w-28', 'w-20', 'w-8']
  return (
    <div className="grid gap-4 px-4 py-3 items-center border-b border-border"
      style={{ gridTemplateColumns: `1fr ${Array(cols - 1).fill('auto').join(' ')}` }}
    >
      <div className="space-y-1.5">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
      {Array.from({ length: cols - 1 }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', widths[i + 1] ?? 'w-16')} />
      ))}
    </div>
  )
}

/** KPI card skeleton */
export function SkeletonKPI({ className }: SkeletonProps) {
  return (
    <div className={cn('p-4 rounded-xl border border-border space-y-2', className)}>
      <Skeleton className="h-7 w-12" />
      <Skeleton className="h-3 w-20" />
    </div>
  )
}
