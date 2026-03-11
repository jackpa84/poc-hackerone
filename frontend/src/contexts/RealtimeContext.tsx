'use client'

import { createContext, useContext } from 'react'
import { useRealtime, type RealtimeState } from '@/hooks/useRealtime'

const RealtimeContext = createContext<RealtimeState>({
  connected: false,
  heartbeat: null,
  jobEvents: [],
  findingEvents: [],
  pipelineEvents: [],
  reconEvents: [],
  lastUpdate: 0,
})

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const realtime = useRealtime()
  return (
    <RealtimeContext.Provider value={realtime}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtimeContext() {
  return useContext(RealtimeContext)
}
