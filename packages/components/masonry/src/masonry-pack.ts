import type { MasonryPackingItem, MasonryPlacement } from './masonry-model'

export interface MasonryPackingResult {
  placements: MasonryPlacement[]
  usedRows: number
}

/** Place each tile in the first free rectangle, scanning rows then columns. */
export function packMasonry(items: readonly MasonryPackingItem[], columnCount: number): MasonryPackingResult {
  const columns = Number.isInteger(columnCount) && columnCount > 0 ? columnCount : 1
  const occupied = new Set<string>()
  const placements: MasonryPlacement[] = []
  let usedRows = 0

  for (const item of items) {
    const columnSpan = Number.isInteger(item.columnSpan) && item.columnSpan > 0 ? Math.min(item.columnSpan, columns) : 1
    const rowSpan = Number.isInteger(item.rowSpan) && item.rowSpan > 0 ? item.rowSpan : 1
    let rowStart = 0
    let columnStart = 0
    let found = false

    while (!found) {
      for (let column = 0; column <= columns - columnSpan; column++) {
        let free = true
        for (let row = rowStart; row < rowStart + rowSpan && free; row++) {
          for (let cell = column; cell < column + columnSpan; cell++) {
            if (occupied.has(`${cell}:${row}`)) {
              free = false
              break
            }
          }
        }
        if (free) {
          columnStart = column
          found = true
          break
        }
      }
      if (!found) rowStart++
    }

    for (let row = rowStart; row < rowStart + rowSpan; row++) {
      for (let column = columnStart; column < columnStart + columnSpan; column++) occupied.add(`${column}:${row}`)
    }
    placements.push({ id: item.id, columnStart, rowStart, columnSpan, rowSpan })
    usedRows = Math.max(usedRows, rowStart + rowSpan)
  }

  return { placements, usedRows }
}
