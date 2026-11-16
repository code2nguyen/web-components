import { defineMessages } from '@c2n/core/localize.js'

const en = {
  valueMissing: 'Please check this box.',
  groupValueMissing: 'Please select at least one option.',
  /** A `c2-checkbox-group` with fewer checked options than its `min`. */
  groupRangeUnderflow: (min: number) => (min === 1 ? 'Please select at least one option.' : `Please select at least ${min} options.`),
  /** A `c2-checkbox-group` with more checked options than its `max` (set from script or markup; the user cannot pass it). */
  groupRangeOverflow: (max: number) => (max === 1 ? 'Please select only one option.' : `Please select no more than ${max} options.`),
}

/** The checkbox's and checkbox group's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const checkboxMessages = defineMessages('checkbox', en)
