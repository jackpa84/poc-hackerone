import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// Helpers de severidade e status para Badge variant
export type SeverityVariant = 'critical' | 'high' | 'medium' | 'low' | 'informational'
export type JobStatusVariant = 'pending' | 'running' | 'completed' | 'failed'
export type FindingStatusVariant = 'new' | 'triaging' | 'accepted' | 'resolved' | 'duplicate' | 'not_applicable'

// Mantido para compatibilidade com código legado
export const SEVERITY_COLORS: Record<string, string> = {
  critical:      'badge-critical',
  high:          'badge-high',
  medium:        'badge-medium',
  low:           'badge-low',
  informational: 'badge-info',
}

export const JOB_STATUS_COLORS: Record<string, string> = {
  pending:   'badge-pending',
  running:   'badge-running',
  completed: 'badge-completed',
  failed:    'badge-failed',
}

// Status de findings (new, triaging, accepted, resolved, duplicate, not_applicable)
export const STATUS_COLORS: Record<string, string> = {
  new:            'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  triaging:       'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  accepted:       'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  resolved:       'bg-gray-500/15 text-gray-400 border border-gray-500/30',
  duplicate:      'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  not_applicable: 'bg-gray-500/15 text-gray-500 border border-gray-500/30',
}
