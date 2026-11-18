import { defineMessages } from '@c2n/core/localize.js'

const en = {
  withReferenceLines: (summary: string, lines: string) => `${summary}. Reference lines: ${lines}`,
  referenceLine: (label: string, value: string) => `${label} ${value}`,
  referenceBand: (label: string, from: string, to: string) => `${label} ${from} to ${to}`,
}

/**
 * How the line chart reads out its `reference-lines` at the end of its accessible name. Loaded with them, the first
 * time a chart has some. An app adds its languages with `addTranslations`; each shows for the nearest `lang`.
 */
export const referenceLineMessages = defineMessages('chart-reference-lines', en)
