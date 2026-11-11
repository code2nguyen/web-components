import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Announced after a row moves among the roots. */
  moved: (label: string, position: number, total: number) => `${label} moved to position ${position} of ${total}.`,
  /** Announced after a row moves under another row. */
  movedInto: (label: string, parent: string, position: number, total: number) => `${label} moved into ${parent}, position ${position} of ${total}.`,
  /** Announced when Alt with an arrow key cannot move the row any further that way. */
  cannotMove: (label: string) => `${label} cannot move there.`,
  /** Announced when Escape drops a dragged row back where it was. */
  cancelled: (label: string) => `Move of ${label} cancelled.`,
}

/**
 * The tree's interface text in English: the announcements of a `reorderable` tree. Only the reordering module, loaded
 * the first time a tree reorders, imports it. An app adds its languages with `addTranslations`.
 */
export const treeMessages = defineMessages('tree', en)
