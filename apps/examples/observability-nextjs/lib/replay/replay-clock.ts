import { DATASET_BASELINE_INSTANT, REPLAY_STEP_MS } from '../data/seed.ts'

export const DEFAULT_REPLAY_BASELINE_INSTANT = DATASET_BASELINE_INSTANT
export const DEFAULT_REPLAY_STEP_MS = REPLAY_STEP_MS
export const DEFAULT_REPLAY_MAX_TICK = 12

export type ReplayStatus = 'paused' | 'playing'
export interface ReplayClockSnapshot {
  baselineInstant: string
  tick: number
  status: ReplayStatus
  stepMs: number
}
export interface ReplayScheduler {
  setInterval(callback: () => void, delayMs: number): unknown
  clearInterval(id: unknown): void
}
export interface ReplayClock {
  getSnapshot(): ReplayClockSnapshot
  getServerSnapshot(): ReplayClockSnapshot
  getInitialSnapshot(): ReplayClockSnapshot
  subscribe(listener: () => void): () => void
  play(): void
  pause(): void
  refresh(): void
  destroy(): void
}
export interface ReplayClockOptions {
  baselineInstant?: string
  stepMs?: number
  scheduler?: ReplayScheduler
  maxTick?: number
}

const browserScheduler: ReplayScheduler = {
  setInterval: (callback, delayMs) => globalThis.setInterval(callback, delayMs),
  clearInterval: (id) => globalThis.clearInterval(id as ReturnType<typeof setInterval>),
}

function snapshot(baselineInstant: string, tick: number, status: ReplayStatus, stepMs: number): ReplayClockSnapshot {
  return Object.freeze({ baselineInstant, tick, status, stepMs })
}

export function createReplayClock({
  baselineInstant = DEFAULT_REPLAY_BASELINE_INSTANT,
  stepMs = DEFAULT_REPLAY_STEP_MS,
  scheduler = browserScheduler,
  maxTick = DEFAULT_REPLAY_MAX_TICK,
}: ReplayClockOptions = {}): ReplayClock {
  if (!Number.isSafeInteger(stepMs) || stepMs <= 0) throw new TypeError('Replay stepMs must be a positive integer')
  if (!Number.isSafeInteger(maxTick) || maxTick <= 0) throw new TypeError('Replay maxTick must be a positive integer')
  if (!Number.isFinite(Date.parse(baselineInstant))) throw new TypeError('Replay baselineInstant must be a valid timestamp')

  const initial = snapshot(new Date(baselineInstant).toISOString(), 0, 'paused', stepMs)
  let current = initial
  let timer: unknown = null
  let destroyed = false
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())
  const update = (tick: number, status: ReplayStatus) => {
    current = snapshot(initial.baselineInstant, tick, status, initial.stepMs)
    notify()
  }
  const stopTimer = () => {
    if (timer !== null) scheduler.clearInterval(timer)
    timer = null
  }

  const clock: ReplayClock = {
    getSnapshot: () => current,
    getServerSnapshot: () => initial,
    getInitialSnapshot: () => initial,
    subscribe(listener) {
      if (destroyed) return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    play() {
      if (destroyed || timer !== null) return
      if (current.tick >= maxTick) {
        if (current.status !== 'paused') update(maxTick, 'paused')
        return
      }
      update(current.tick, 'playing')
      timer = scheduler.setInterval(() => {
        if (destroyed) return
        const nextTick = Math.min(current.tick + 1, maxTick)
        if (nextTick === maxTick) {
          stopTimer()
          update(nextTick, 'paused')
        } else update(nextTick, 'playing')
      }, stepMs)
    },
    pause() {
      if (destroyed) return
      stopTimer()
      if (current.status !== 'paused') update(current.tick, 'paused')
    },
    refresh() {
      if (destroyed) return
      stopTimer()
      if (current !== initial) {
        current = initial
        notify()
      }
    },
    destroy() {
      if (destroyed) return
      stopTimer()
      destroyed = true
      listeners.clear()
    },
  }
  return clock
}
