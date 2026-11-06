import { defineMessages } from '@c2n/core/localize.js'

// Its own module rather than `messages.ts`, which every chart imports: only the sunburst chart loads this text.
const sunburstEn = {
  name: 'Name',
  group: 'Group',
  value: 'Value',
  share: 'Share of total',
  shareOf: (group: string) => `Share of ${group}`,
  shareOfGroup: 'Share of group',
  path: (parent: string, name: string) => `${parent} › ${name}`,
  total: 'Total',
  /** The breadcrumb's first entry, which zooms all the way out. */
  root: 'All',
  breadcrumb: 'Zoom level',
  back: (name: string) => `Back to ${name}`,
  roleDescription: 'sunburst chart',
  // The count comes first, so a translation can pick its plural form: `{ "one": "…, {0} élément", "other": "…, {0} éléments" }`.
  summary: (count: number, series: string) => `Sunburst of ${series}, ${count} ${count === 1 ? 'item' : 'items'}`,
  leafAnnouncement: (path: string, value: string, share: string) => `${path}, ${value}, ${share} of total`,
  groupAnnouncement: (count: number, path: string, value: string, share: string) =>
    `${path}, ${value}, ${share} of total, ${count} ${count === 1 ? 'item' : 'items'}. Enter to zoom.`,
  zoomAnnouncement: (path: string, value: string) => `Zoomed into ${path}, ${value}`,
  zoomOutAnnouncement: (value: string) => `Zoomed out to all, ${value}`,
}

/** The sunburst chart's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const sunburstMessages = defineMessages('sunburst-chart', sunburstEn)
