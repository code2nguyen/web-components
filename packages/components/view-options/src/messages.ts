import { defineMessages } from '@c2n/core/localize.js'

const en = {
  display: 'Display',
  panel: 'Display options',
  layout: 'Layout',
  list: 'List',
  board: 'Board',
  table: 'Table',
  gallery: 'Gallery',
  calendar: 'Calendar',
  timeline: 'Timeline',
  grouping: 'Grouping',
  subGrouping: 'Sub-grouping',
  columns: 'Columns',
  rows: 'Rows',
  noGrouping: 'No grouping',
  noSubGrouping: 'No sub-grouping',
  noRows: 'No rows',
  ordering: 'Ordering',
  sortField: (level: number) => `Sort level ${level}`,
  ascending: 'Ascending',
  removeSort: (level: number) => `Remove sort level ${level}`,
  addSort: 'Add sort',
  show: 'Show',
  properties: 'Display properties',
  reset: 'Reset',
  setDefault: 'Set as default',
}

/** The view options' interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const viewOptionsMessages = defineMessages('view-options', en)
