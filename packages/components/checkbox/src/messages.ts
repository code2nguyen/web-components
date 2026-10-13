import { defineMessages } from '@c2n/core/localize.js'

const en = {
  valueMissing: 'Please check this box.',
  groupValueMissing: 'Please select at least one option.',
}

/** The checkbox's and checkbox group's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const checkboxMessages = defineMessages('checkbox', en)
