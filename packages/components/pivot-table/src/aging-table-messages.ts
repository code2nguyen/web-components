import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The accessible name of the grid when it has no `label`. */
  table: 'Aging table',
  /** The line above the grid: `{0}` is the as-of date. */
  asOf: (date: string) => `As of ${date}`,
  /** The bucket of amounts not yet due. */
  current: 'Current',
  /** A bucket of days past due: `{0}` is its first day, `{1}` its last. */
  range: (from: string, to: string) => `${from}–${to}`,
  /** The last bucket: `{0}` is the last day of the bucket before it. */
  over: (days: string) => `Over ${days}`,
  /** The bucket of records with no date to age from. */
  noDate: 'No date',
  /** The bucket field's name in the field list. */
  age: 'Age',
}

/** The aging table's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const agingTableMessages = defineMessages('aging-table', en)
