import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Text shown before a path is selected. */
  placeholder: 'Please select',
  /** Accessible name of the panel when the cascader has no label. */
  panel: 'Cascader options',
  /** Accessible name of a column, `{0}` being its level from 1. */
  level: (level: number) => `Level ${level}`,
  /** Shown when there are no options (the `empty` slot's default). */
  empty: 'No options available.',
}

/** The cascader's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const cascaderMessages = defineMessages('cascader', en)
