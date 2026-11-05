import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The handle's name when the slotted layers carry no alternative text and `label` is not set. */
  compare: 'Compare images',
  /** The handle's name from the two layers' alternative texts: `{0}` is the before layer's, `{1}` the after layer's. */
  compareNamed: (before: string, after: string) => `Compare: ${before} / ${after}`,
  /** The handle's value: `{0}` is the share of the before layer shown, `{1}` the share of the after layer, in percent. */
  value: (before: string, after: string) => `${before} before, ${after} after`,
}

/** The image compare's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const imageCompareMessages = defineMessages('image-compare', en)
