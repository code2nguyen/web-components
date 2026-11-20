import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the send button. */
  send: 'Send message',
}

/** The chat input's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const chatInputMessages = defineMessages('chat-input', en)
