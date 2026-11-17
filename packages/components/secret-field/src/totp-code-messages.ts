import { defineMessages } from '@c2n/core/localize.js'
import { secretFieldMessages } from './messages'

/** The secret field's keys, worded for a code, plus the code's own. */
const en = {
  ...secretFieldMessages.en,
  show: 'Show code',
  copy: 'Copy code',
  empty: 'No code',
  /** Shown when the secret cannot be read or Web Crypto is missing. */
  unavailable: 'Code unavailable',
  /** The countdown ring, for a screen reader. */
  period: (seconds: number) => `New code every ${seconds} seconds`,
}

export const totpCodeMessages = defineMessages('totp-code', en)
