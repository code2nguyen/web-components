import { createEnvelope, parseEnvelope, type Validator } from './envelope.ts'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface BrowserStore<T> {
  getSnapshot(): T
  getServerSnapshot(): T
  subscribe(listener: () => void): () => void
  hydrate(): T
  set(value: T): boolean
  reset(): boolean
}

export interface BrowserStoreOptions<T> {
  key: string
  defaultValue: T
  validate: Validator<T>
  storage?: () => StorageLike | null | undefined
}

function defaultStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

export function createBrowserStore<T>({ key, defaultValue, validate, storage = defaultStorage }: BrowserStoreOptions<T>): BrowserStore<T> {
  let snapshot = defaultValue
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())
  const resolveStorage = () => {
    try {
      return storage() ?? null
    } catch {
      return null
    }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => defaultValue,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    hydrate() {
      const target = resolveStorage()
      if (!target) return snapshot
      let raw: string | null
      try {
        raw = target.getItem(key)
      } catch {
        return snapshot
      }
      if (raw === null) return snapshot
      const envelope = parseEnvelope(raw, validate)
      if (!envelope) {
        try {
          target.removeItem(key)
        } catch {
          // Storage cleanup is best-effort; one unavailable key must not affect the app.
        }
        snapshot = defaultValue
        notify()
        return snapshot
      }
      snapshot = envelope.data
      notify()
      return snapshot
    },
    set(value) {
      if (!validate(value)) return false
      snapshot = value
      notify()
      const target = resolveStorage()
      if (!target) return false
      try {
        target.setItem(key, JSON.stringify(createEnvelope(value)))
        return true
      } catch {
        return false
      }
    },
    reset() {
      snapshot = defaultValue
      notify()
      const target = resolveStorage()
      if (!target) return false
      try {
        target.removeItem(key)
        return true
      } catch {
        return false
      }
    },
  }
}
