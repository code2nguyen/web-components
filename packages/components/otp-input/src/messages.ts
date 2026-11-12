import { defineMessages } from '@c2n/core/localize.js'

const en = {
  label: 'Verification code',
  valueMissing: 'Enter the code.',
  tooShort: (count: number) => `Enter all ${count} characters.`,
}

/** The one-time code input's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const otpInputMessages = defineMessages('otp-input', en)
