import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The trigger's text when every counter is 0 and there is no `placeholder`. */
  none: 'None',
  /** The button that closes the panel. */
  done: 'Done',
  /** Accessible name of a counter's − button: `{0}` is the counter's label. */
  decrease: (label: string) => `Decrease ${label}`,
  /** Accessible name of a counter's + button: `{0}` is the counter's label. */
  increase: (label: string) => `Increase ${label}`,
  /** The note under the counters when `max-total` is set: `{0}` is the limit. */
  upTo: (max: number) => `Up to ${max}`,
  /** The note when the limit is reached: `{0}` the total, `{1}` the limit. */
  full: (total: number, max: number) => `${total} of ${max}, the most allowed`,
  /** Announced after a change: `{0}` is the new summary. */
  changed: (summary: string) => `Now ${summary}`,
}

/** The quantity picker's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const quantityPickerMessages = defineMessages('quantity-picker', en)
