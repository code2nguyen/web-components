import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Announced when loading starts, unless `label` or the `label` slot says something more specific. */
  label: 'Loading',
}

/** The loading overlay's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const loadingOverlayMessages = defineMessages('loading-overlay', en)
