'use client'

import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type DemoState = 'normal' | 'loading' | 'empty' | 'error'

interface DemoStateContextValue {
  demoState: DemoState
  setDemoState: (state: DemoState) => void
}

const DemoStateContext = createContext<DemoStateContextValue | undefined>(undefined)

export function DemoStateProvider({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname()
  const [demoState, setDemoState] = useState<DemoState>('normal')

  useEffect(() => setDemoState('normal'), [pathname])

  const value = useMemo(() => ({ demoState, setDemoState }), [demoState])
  return <DemoStateContext.Provider value={value}>{children}</DemoStateContext.Provider>
}

export function useDemoState(): DemoStateContextValue {
  const context = useContext(DemoStateContext)
  if (!context) throw new Error('useDemoState must be used inside DemoStateProvider')
  return context
}
