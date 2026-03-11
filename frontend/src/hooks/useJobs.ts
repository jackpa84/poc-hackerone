'use client'
/**
 * hooks/useJobs.ts — Busca jobs com polling automático
 *
 * SWR faz polling a cada 3s enquanto há jobs running/pending.
 * Quando todos terminam, para de fazer requisições.
 * Isso simula "tempo real" sem precisar de WebSocket.
 */
import useSWR from 'swr'
import api from '@/lib/api'
import type { Job } from '@/types/api'

const fetcher = (url: string) => api.get(url).then(r => r.data)

export function useJobs(programId?: string) {
  const query = programId ? `?program_id=${programId}` : ''

  const { data, error, mutate } = useSWR<Job[]>(
    `/jobs${query}`,
    fetcher,
    {
      // Faz polling a cada 3s se há jobs ativos, para quando tudo termina
      refreshInterval: (data) => {
        const hasActive = data?.some(j => j.status === 'running' || j.status === 'pending')
        return hasActive ? 3000 : 0
      },
    }
  )

  return { jobs: data ?? [], loading: !data && !error, error, mutate }
}

export function useJob(jobId: string) {
  const { data, error } = useSWR<Job>(
    jobId ? `/jobs/${jobId}` : null,
    fetcher,
    {
      // Faz polling enquanto o job está ativo
      refreshInterval: (data) => {
        return data?.status === 'running' || data?.status === 'pending' ? 2000 : 0
      },
    }
  )

  return { job: data, loading: !data && !error, error }
}
