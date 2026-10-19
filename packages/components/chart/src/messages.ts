import { defineMessages } from '@c2n/core/localize.js'

const en = {
  noData: 'No data',
  needsAxes: 'A heatmap grid needs x-field and y-field.',
  needsDate: 'A calendar heatmap needs date-field.',
  clearFilter: 'Clear filter',
  cells: (count: string) => `${count} cells`,
  days: (count: string) => `${count} days`,
  ofTotal: (count: string, total: string) => `${count} of ${total}`,
  range: (from: string, to: string) => `${from} to ${to}`,
  below: (value: string) => `below ${value}`,
  andAbove: (value: string) => `${value} and above`,
  total: (value: string) => `total ${value}`,
  pastScale: 'some values past the scale',
  inBand: (count: string) => `${count} in this band`,
  hintStepped: 'Hover a band to preview it, click to keep it',
  hintContinuous: 'Hover to preview a band, click to keep it, drag for a range',
  scaleLabel: (title: string) => `${title} colour scale. Arrow keys pick a band, Enter keeps it, Escape clears.`,
  bandLabel: (range: string, count: string) => `${range}, ${count}`,
  roleDescription: 'heatmap',
  rows: (count: string) => `${count} rows`,
  totalFor: (name: string) => `Total for ${name}`,
  row: 'Row',
  column: 'Column',
  date: 'Date',
  value: 'Value',
  cellAnnouncement: (name: string, value: string) => `${name}: ${value}`,
}

/** The heatmap's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const heatmapMessages = defineMessages('heatmap-chart', en)
