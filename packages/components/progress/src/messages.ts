import { defineMessages } from '@c2n/core/localize.js'

const en = {
  loading: 'Loading',
  markReached: (value: string) => `${value}, reached`,
  markClaimable: (value: string) => `${value}, ready to claim`,
  markLocked: (value: string, remaining: string) => `${value}, ${remaining} to go`,
  markAhead: (value: string) => `${value}, not reached`,
}

/** The progress indicator's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const progressMessages = defineMessages('progress', en)
