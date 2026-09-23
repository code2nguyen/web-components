'use client'

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import {
  createReplayClock,
  DEFAULT_REPLAY_BASELINE_INSTANT,
  DEFAULT_REPLAY_STEP_MS,
  type ReplayClock,
  type ReplayClockSnapshot,
} from '../lib/replay/replay-clock'

export interface ReplayContextValue extends ReplayClockSnapshot {
  play(): void
  pause(): void
  refresh(): void
}

export interface ReplayProviderProps {
  children: ReactNode
  baselineInstant?: string
  stepMs?: number
  clock?: ReplayClock
}

const ReplayContext = createContext<ReplayContextValue | null>(null)

export function ReplayProvider({
  children,
  baselineInstant = DEFAULT_REPLAY_BASELINE_INSTANT,
  stepMs = DEFAULT_REPLAY_STEP_MS,
  clock: providedClock,
}: ReplayProviderProps) {
  const ownedClock = useRef<ReplayClock | null>(null)
  if (!providedClock && !ownedClock.current) ownedClock.current = createReplayClock({ baselineInstant, stepMs })
  const clock = providedClock ?? ownedClock.current
  if (!clock) throw new Error('Replay clock is unavailable')
  const current = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getServerSnapshot)

  useEffect(
    () => () => {
      // Pause rather than destroy so React Strict Mode's setup/cleanup rehearsal
      // cannot leave the still-mounted provider with an unusable clock.
      if (!providedClock) clock.pause()
    },
    [clock, providedClock],
  )

  const value: ReplayContextValue = {
    ...current,
    play: clock.play,
    pause: clock.pause,
    refresh: clock.refresh,
  }
  return <ReplayContext.Provider value={value}>{children}</ReplayContext.Provider>
}

export function useReplay(): ReplayContextValue {
  const value = useContext(ReplayContext)
  if (!value) throw new Error('useReplay must be used within ReplayProvider')
  return value
}
