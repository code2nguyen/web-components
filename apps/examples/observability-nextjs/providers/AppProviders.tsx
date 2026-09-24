'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ReplayProvider } from './ReplayProvider'
import { ScopeProvider } from './ScopeProvider'
import { DemoStateProvider } from './DemoStateProvider'

export type ThemePreference = 'light' | 'dark' | 'system'

interface AppContextValue {
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
  announcement: string
  announce: (message: string) => void
}

const THEME_KEY = 'c2n-observability:v1:theme'
const AppContext = createContext<AppContextValue | undefined>(undefined)

function readTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (!raw) return 'system'
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return 'system'
    const theme = (parsed as { schemaVersion?: unknown; data?: { theme?: unknown } }).data?.theme
    return (parsed as { schemaVersion?: unknown }).schemaVersion === 1 && (theme === 'light' || theme === 'dark' || theme === 'system') ? theme : 'system'
  } catch {
    return 'system'
  }
}

function resolveTheme(theme: ThemePreference): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setThemeState] = useState<ThemePreference>('system')
  const [announcement, setAnnouncement] = useState('')

  const applyTheme = useCallback((nextTheme: ThemePreference) => {
    setThemeState(nextTheme)
    document.documentElement.dataset.theme = resolveTheme(nextTheme)
  }, [])

  useEffect(() => applyTheme(readTheme()), [applyTheme])

  useEffect(() => {
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'light'
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback(
    (nextTheme: ThemePreference) => {
      applyTheme(nextTheme)
      try {
        localStorage.setItem(THEME_KEY, JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), data: { theme: nextTheme } }))
      } catch {
        setAnnouncement('Theme changed for this session. Browser storage is unavailable.')
      }
    },
    [applyTheme],
  )

  const announce = useCallback((message: string) => {
    setAnnouncement('')
    window.requestAnimationFrame(() => setAnnouncement(message))
  }, [])

  const value = useMemo(() => ({ theme, setTheme, announcement, announce }), [announce, announcement, setTheme, theme])

  return (
    <AppContext.Provider value={value}>
      <ReplayProvider>
        <ScopeProvider>
          <DemoStateProvider>{children}</DemoStateProvider>
        </ScopeProvider>
      </ReplayProvider>
    </AppContext.Provider>
  )
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useAppContext must be used inside AppProviders')
  return context
}
