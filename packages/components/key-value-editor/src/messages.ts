import { defineMessages } from '@c2n/core/localize.js'

const en = {
  show: (name: string) => `Show ${name}`,
  hide: (name: string) => `Hide ${name}`,
  remove: (key: string) => `Remove ${key}`,
  removeRow: (row: number) => `Remove row ${row}`,
  valueMissing: 'Please add at least one variable.',
}

/** The key-value editor's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const keyValueEditorMessages = defineMessages('key-value-editor', en)
