import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The title of `c2-record-merge`'s result column. */
  result: 'Result',
  /** A field a record has no value in. */
  emptyValue: 'Empty',
  /** Accessible name of a merge with no `label` and no field label. */
  label: 'Merge records',
}

/** The record merge's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const recordMergeMessages = defineMessages('record-merge', en)
