import { defineMessages } from '@c2n/core/localize.js'

const en = {
  instructions: 'Press Space to pick up an item. Use Arrow keys, Home, or End to move it; Space drops and Escape cancels.',
  swipeShortcut: (key: string, action: string) => `Press ${key} to ${action.toLowerCase()}.`,
  /** Name of an item with no text, `data-reorder-label` or `aria-label`. */
  item: 'Item',
  pickedUp: (label: string, position: number, count: number) =>
    `${label} picked up, position ${position} of ${count}. Use Arrow keys, Home, or End to move; Space drops and Escape cancels.`,
  returned: (label: string, position: number) => `${label} returned to position ${position}.`,
  atFirst: (label: string) => `${label} is already at the first permitted position.`,
  atLast: (label: string) => `${label} is already at the last permitted position.`,
  moved: (label: string, position: number, count: number) => `${label} moved to position ${position} of ${count}.`,
  dropped: (label: string, from: number, to: number) => `${label} moved from position ${from} to ${to}.`,
  swipeOpen: (label: string, actions: string) => `${label}: ${actions} available. Press Escape to close.`,
  deleted: (label: string) => `${label} deleted.`,
  actionDone: (action: string, label: string) => `${action}: ${label}.`,
  duplicateKey: (key: string) => `Reordering is unavailable because the item key ${key} is used more than once.`,
  canceled: 'Reordering canceled. The item returned to its original position.',
  canceledNotEditable: 'Reordering canceled because editing is no longer available.',
  canceledItemsChanged: 'Items changed. Reordering canceled.',
  canceledItemHidden: 'Reordering canceled because the item is not visible.',
  canceledListHidden: 'Reordering canceled because the item or list is not visible.',
  canceledPointerLost: 'Reordering canceled because pointer control was lost.',
}

/** The reorder list's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const reorderListMessages = defineMessages('reorder-list', en)
