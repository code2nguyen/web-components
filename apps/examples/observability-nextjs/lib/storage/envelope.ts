export const STORAGE_SCHEMA_VERSION = 1 as const

export interface StorageEnvelope<T> {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION
  updatedAt: string
  data: T
}

export type Validator<T> = (value: unknown) => value is T

export function createEnvelope<T>(data: T, updatedAt = new Date().toISOString()): StorageEnvelope<T> {
  return { schemaVersion: STORAGE_SCHEMA_VERSION, updatedAt, data }
}

export function isStorageEnvelope<T>(value: unknown, validate: Validator<T>): value is StorageEnvelope<T> {
  if (!value || typeof value !== 'object') return false
  const envelope = value as Partial<StorageEnvelope<unknown>>
  return (
    envelope.schemaVersion === STORAGE_SCHEMA_VERSION &&
    typeof envelope.updatedAt === 'string' &&
    Number.isFinite(Date.parse(envelope.updatedAt)) &&
    validate(envelope.data)
  )
}

export function parseEnvelope<T>(raw: string | null, validate: Validator<T>): StorageEnvelope<T> | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    return isStorageEnvelope(value, validate) ? value : null
  } catch {
    return null
  }
}
