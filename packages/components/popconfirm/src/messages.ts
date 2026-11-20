import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Text of the button that confirms. */
  confirm: 'OK',
  /** Text of the button that cancels. */
  cancel: 'Cancel',
}

/** The popconfirm's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const popconfirmMessages = defineMessages('popconfirm', en)
