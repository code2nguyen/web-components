export const DATASET_SCHEMA_VERSION = 1 as const
export const DATASET_SEED = 0x5c2a9d17
export const DATASET_BASELINE_INSTANT = '2026-08-17T14:00:00.000Z'
export const REPLAY_STEP_MS = 15_000

export interface SeededRandom {
  next(): number
  integer(min: number, max: number): number
  pick<T>(values: readonly T[]): T
}

export function createSeededRandom(seed: number): SeededRandom {
  if (!Number.isInteger(seed) || seed === 0) throw new Error('Expected a non-zero integer seed')
  let state = seed | 0

  const next = (): number => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x1_0000_0000
  }

  return {
    next,
    integer(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new Error('Expected a valid integer range')
      return min + Math.floor(next() * (max - min + 1))
    },
    pick<T>(values: readonly T[]): T {
      if (values.length === 0) throw new Error('Cannot pick from an empty collection')
      return values[Math.floor(next() * values.length)]
    },
  }
}

export function stableId(prefix: string, index: number, width = 4): string {
  return `${prefix}-${String(index + 1).padStart(width, '0')}`
}
