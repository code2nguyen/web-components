import { defineMessages } from '@c2n/core/localize.js'

const en = {
  next: 'Next',
  complete: 'Save',
  previous: 'Previous',
  skip: 'Skip',
  skipped: 'Skipped',
  progress: (current: number, total: number) => `Question ${current} of ${total}`,
  summary: 'Summary',
  empty: 'No questions configured.',
  required: 'Choose an answer to continue.',
  requiredSkippable: 'Choose an answer or skip this question.',
}

/** The questionnaire's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const questionnaireMessages = defineMessages('questionnaire', en)
