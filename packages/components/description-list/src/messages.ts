import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Shown in an item whose value is empty, when `empty-text` is not set. */
  empty: '—',
  /** The button beside an editable item's value, and its tooltip. */
  edit: (label: string) => `Edit ${label}`,
}

/** The description list's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const descriptionListMessages = defineMessages('description-list', en)
