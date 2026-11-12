import { defineMessages } from '@c2n/core/localize.js'

const en = {
  copy: 'Copy',
  copied: 'Copied',
  failed: 'Copy failed',
}

/** The copy button's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const copyButtonMessages = defineMessages('copy-button', en)
