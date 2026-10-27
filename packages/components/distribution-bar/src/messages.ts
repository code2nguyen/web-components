import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name when the bar has no label. */
  label: 'Distribution',
  /** The part that sums the items past `max-items`. */
  other: 'Other',
  /** Shown and announced when no item has a value. */
  empty: 'No data',
  /** The bar as a screen reader hears it when it has no label: the default name, then every part. With a label, the label is followed by the parts. */
  summary: (name: string, parts: string) => `${name}: ${parts}`,
  /** One part as the screen reader hears it. */
  part: (label: string, share: string) => `${label} ${share}`,
  /** A share and a value together, in the legend and the tooltip. */
  both: (share: string, value: string) => `${share} · ${value}`,
  /** A share too small to show at the chosen precision. */
  below: (smallest: string) => `<${smallest}`,
}

/** The distribution bar's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const distributionBarMessages = defineMessages('distribution-bar', en)
