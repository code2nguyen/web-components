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

const chordEn = {
  flow: 'Flow',
  from: 'From',
  to: 'To',
  outgoing: 'Outgoing',
  incoming: 'Incoming',
  share: 'Share of total',
  flowName: (source: string, target: string) => `${source} → ${target}`,
  summary: (groups: string) => `Chord diagram of ${groups}`,
  roleDescription: 'chord diagram',
  groupAnnouncement: (group: string, outgoing: string, incoming: string) => `${group}: outgoing ${outgoing}, incoming ${incoming}`,
}

/** The chord chart's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const chordMessages = defineMessages('chord-chart', chordEn)

const chartEn = {
  annotations: 'Annotations',
  annotationAt: (label: string, at: string) => `${label}, ${at}`,
  annotationRange: (label: string, from: string, to: string) => `${label}, ${from} to ${to}`,
}

/** The interface text every chart shares, in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const chartMessages = defineMessages('chart', chartEn)

const sankeyEn = {
  flow: 'Flow',
  from: 'From',
  to: 'To',
  incoming: 'Incoming',
  outgoing: 'Outgoing',
  share: 'Share of total',
  shareOfSource: (source: string) => `Share of ${source}`,
  flowName: (source: string, target: string) => `${source} → ${target}`,
  summary: (nodes: string) => `Sankey diagram of ${nodes}`,
  roleDescription: 'sankey diagram',
  nodeAnnouncement: (node: string, incoming: string, outgoing: string) => `${node}: incoming ${incoming}, outgoing ${outgoing}`,
  cycle: (path: string) => `These flows form a loop, which a sankey diagram cannot draw: ${path}`,
}

/** The sankey chart's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const sankeyMessages = defineMessages('sankey-chart', sankeyEn)
