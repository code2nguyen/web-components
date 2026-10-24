import { defineMessages } from '@c2n/core/localize.js'

const en = {
  label: 'Organization chart',
  expand: (count: number) => `Expand (${count})`,
  collapse: 'Collapse',
}

/** The org chart's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const orgChartMessages = defineMessages('org-chart', en)
