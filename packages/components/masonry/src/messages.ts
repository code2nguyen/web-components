import { defineMessages } from '@c2n/core/localize.js'

type Kind = 'move' | 'resize'

const en = {
  // c2-masonry-item
  tile: 'Tile',
  move: (label: string) => `Move ${label}`,
  resize: (label: string) => `Resize ${label}`,
  content: (label: string) => `${label} content`,
  instructions: 'Press Enter or Space, use arrow keys, then press Enter to save or Escape to cancel.',
  // c2-masonry live region
  started: (label: string, kind: Kind) => `${label} ${kind} started. Use arrow keys; Enter saves and Escape cancels.`,
  position: (label: string, position: number, count: number) => `${label}: position ${position} of ${count}.`,
  size: (label: string, columns: number, rows: number, atMinimum: boolean) =>
    `${label}: ${columns} columns, ${rows} rows.${atMinimum ? ' Smallest size reached.' : ''}`,
  noChange: 'No layout change.',
  saved: (label: string, kind: Kind) => `${label} ${kind} saved.`,
  canceled: (label: string) => `${label} edit canceled.`,
}

/** The masonry's and its tiles' interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const masonryMessages = defineMessages('masonry', en)
