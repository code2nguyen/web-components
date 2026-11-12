import { defineMessages } from '@c2n/core/localize.js'

const en = {
  remove: (tag: string) => `Remove ${tag}`,
  valueMissing: 'Add at least one entry.',
}

/** The tag input's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const tagInputMessages = defineMessages('tag-input', en)
