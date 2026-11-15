import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of a scorecard with no `label` and no field label. */
  label: 'Scorecard',
  /** The title of the score column. */
  score: 'Score',
  /** The title of the summary's total. */
  total: 'Total',
  /** Points earned out of the points possible, in a row, a group or the total. */
  points: (earned: string, possible: string) => `${earned} / ${possible}`,
  /** A row answered "not applicable": it counts towards neither total. */
  notApplicable: 'N/A',
  /** The mark beside a critical criterion's label. */
  critical: 'Critical',
  /** A criterion's weight beside its label, as shown. */
  weight: (weight: string) => `×${weight}`,
  /** That weight as a screen reader reads it after the label, its separator included. */
  weightName: (weight: string) => `, weight ${weight}`,
  /** What a screen reader hears between a criterion's label and its "Critical" mark. */
  separator: ', ',
  /** The total before any criterion counts. */
  noScore: '–',
  /** How many criteria are answered. */
  answered: (answered: string, total: string) => `${answered} of ${total} answered`,
  /** The verdict when a critical criterion took a failing answer, followed by their names. */
  failed: (criteria: string) => `Failed: ${criteria}`,
}

/** The scorecard's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const scorecardMessages = defineMessages('scorecard', en)
