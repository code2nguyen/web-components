import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the conversation log. */
  label: 'Conversation',
  /** Accessible name of the jump-to-latest button. */
  jump: 'Jump to latest message',
  /** Shown above the messages while older ones load (the `loading` slot's default). */
  loading: 'Loading earlier messages…',
}

/** The chat message list's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const chatMessageListMessages = defineMessages('chat-message-list', en)
