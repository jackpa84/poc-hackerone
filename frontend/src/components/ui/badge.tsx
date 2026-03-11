import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:     'border-transparent bg-primary/20 text-primary',
        secondary:   'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive/20 text-destructive-foreground',
        outline:     'text-foreground',
        // Severidades
        critical:    'badge-critical',
        high:        'badge-high',
        medium:      'badge-medium',
        low:         'badge-low',
        informational: 'badge-info',
        // Status de job
        pending:     'badge-pending',
        running:     'badge-running',
        completed:   'badge-completed',
        failed:      'badge-failed',
        // Status de finding
        new:             'border-blue-500/30 bg-blue-500/10 text-blue-400',
        triaging:        'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
        accepted:        'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        resolved:        'border-gray-500/30 bg-gray-500/10 text-gray-400',
        duplicate:       'border-purple-500/30 bg-purple-500/10 text-purple-400',
        not_applicable:  'border-red-500/30 bg-red-500/10 text-red-400',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
