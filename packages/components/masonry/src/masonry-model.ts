export type MasonryRange = 'xs' | 'sm' | 'md' | 'lg'
export type MasonryInputMethod = 'mouse' | 'touch' | 'pen' | 'keyboard'
export type MasonryAction = 'move' | 'resize'
export type MasonryErrorReason = 'missing-id' | 'duplicate-id' | 'invalid-span' | 'invalid-layout'

export const MASONRY_COLUMN_COUNT: Record<MasonryRange, number> = { xs: 1, sm: 6, md: 9, lg: 12 }

/** The component responds to its own content width, not the viewport. */
export function rangeForWidth(width: number): { range: MasonryRange; columns: number } {
  const range: MasonryRange = width < 600 ? 'xs' : width < 960 ? 'sm' : width < 1280 ? 'md' : 'lg'
  return { range, columns: MASONRY_COLUMN_COUNT[range] }
}

/** Resolve a tile's column span for one range without modifying its authored values. */
export function resolveColumns(
  tile: { cols: number; colsXs?: number; colsSm?: number; colsMd?: number; colsLg?: number },
  range: MasonryRange,
  columns = MASONRY_COLUMN_COUNT[range],
): number {
  const override = range === 'xs' ? tile.colsXs : range === 'sm' ? tile.colsSm : range === 'md' ? tile.colsMd : tile.colsLg
  const base = Number.isInteger(tile.cols) && tile.cols > 0 ? tile.cols : 3
  const requested = override === undefined ? base : Number.isInteger(override) && override > 0 ? override : base
  return Math.max(1, Math.min(requested, columns))
}

export interface MasonryColumns {
  xs: number
  sm: number
  md: number
  lg: number
}

export interface MasonryLayoutItem {
  id: string
  rows: number
  columns: MasonryColumns
}

export interface MasonryLayoutSnapshot {
  version: 1
  items: MasonryLayoutItem[]
}

export interface MasonryPlacement {
  id: string
  columnStart: number
  rowStart: number
  columnSpan: number
  rowSpan: number
}

export interface MasonryPackingItem {
  id: string
  columnSpan: number
  rowSpan: number
}

export interface MasonryLayoutChangeDetail {
  layout: MasonryLayoutSnapshot
  itemId: string
  action: MasonryAction
  inputMethod: MasonryInputMethod
}

export interface MasonryLayoutErrorDetail {
  reason: MasonryErrorReason
  itemId?: string
}

export interface MasonryEditSession {
  kind: MasonryAction
  inputMethod: MasonryInputMethod
  itemId: string
  original: MasonryLayoutSnapshot
  candidate: MasonryLayoutSnapshot
  phase: 'armed' | 'active' | 'committing' | 'canceled'
}

export interface MasonryAuthoredTile {
  id?: string
  rows: number
  cols: number
}

export interface MasonryNormalizedTile {
  id: string
  rows: number
  cols: number
}

/** Normalize authored values without hiding tiles whose identities or spans are invalid. */
export function normalizeAuthoredTiles(tiles: readonly MasonryAuthoredTile[]): {
  tiles: MasonryNormalizedTile[]
  canEdit: boolean
  errors: MasonryLayoutErrorDetail[]
} {
  const seen = new Set<string>()
  const errors: MasonryLayoutErrorDetail[] = []
  let canEdit = true
  const normalized = tiles.map((tile, index) => {
    const id = tile.id?.trim()
    if (!id) {
      errors.push({ reason: 'missing-id' })
      canEdit = false
    } else if (seen.has(id)) {
      errors.push({ reason: 'duplicate-id', itemId: id })
      canEdit = false
    } else seen.add(id)
    const rows = Number.isInteger(tile.rows) && tile.rows > 0 ? tile.rows : 10
    const cols = Number.isInteger(tile.cols) && tile.cols > 0 ? tile.cols : 3
    if (rows !== tile.rows || cols !== tile.cols) errors.push({ reason: 'invalid-span', itemId: id })
    return { id: id ?? `anonymous-${index}`, rows, cols }
  })
  return { tiles: normalized, canEdit, errors }
}

/** A saved arrangement must be complete, bounded, and unambiguous. */
export function validateSnapshot(value: unknown): value is MasonryLayoutSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1 || !Array.isArray(candidate.items)) return false
  const seen = new Set<string>()
  for (const raw of candidate.items) {
    if (typeof raw !== 'object' || raw === null) return false
    const item = raw as Record<string, unknown>
    if (typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id)) return false
    seen.add(item.id)
    if (typeof item.rows !== 'number' || !Number.isInteger(item.rows) || item.rows < 1) return false
    if (typeof item.columns !== 'object' || item.columns === null) return false
    const columns = item.columns as Record<string, unknown>
    for (const range of ['xs', 'sm', 'md', 'lg'] as const) {
      const count = columns[range]
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MASONRY_COLUMN_COUNT[range]) return false
    }
  }
  return true
}

/** Copy a snapshot so application-owned objects cannot be mutated by an edit session. */
export function cloneSnapshot(snapshot: MasonryLayoutSnapshot): MasonryLayoutSnapshot {
  return { version: 1, items: snapshot.items.map((item) => ({ id: item.id, rows: item.rows, columns: { ...item.columns } })) }
}

/** Preserve saved order, append newly-authored tiles, and discard removed tiles. */
export function reconcileSnapshot(authored: MasonryLayoutSnapshot, saved?: MasonryLayoutSnapshot): MasonryLayoutSnapshot {
  if (!saved) return cloneSnapshot(authored)
  const current = new Map(authored.items.map((item) => [item.id, item]))
  const ordered = saved.items.filter((item) => current.has(item.id)).map((item) => ({ id: item.id, rows: item.rows, columns: { ...item.columns } }))
  const retained = new Set(ordered.map((item) => item.id))
  for (const item of authored.items) if (!retained.has(item.id)) ordered.push({ id: item.id, rows: item.rows, columns: { ...item.columns } })
  return { version: 1, items: ordered }
}
