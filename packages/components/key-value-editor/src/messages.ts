import { defineMessages } from '@c2n/core/localize.js'

const en = {
  show: (name: string) => `Show ${name}`,
  hide: (name: string) => `Hide ${name}`,
  remove: (key: string) => `Remove ${key}`,
  removeRow: (row: number) => `Remove row ${row}`,
  valueMissing: 'Please add at least one variable.',
  /** Header of the key and value columns. */
  key: 'Key',
  value: 'Value',
  /** A row's field as a screen reader names it: `{0}` is the column, `{1}` the row's number ("Key 1"). */
  field: (column: string, row: number) => `${column} ${row}`,
  /** Placeholders of the key and value fields. */
  keyPlaceholder: 'KEY',
  valuePlaceholder: 'value',
  /** Text of the add button. */
  add: 'Add another',
  /** Message under a key another row also has. */
  duplicate: 'This key is already used.',
  /** Message under a key that does not match `key-pattern`. */
  pattern: 'This key is not valid.',
  /** Shown instead of the rows when there are none (the `empty` slot's default). */
  empty: 'No variables',
  /** Read in place of a masked value in view mode. */
  hiddenValue: 'Hidden value',
}

/** The key-value editor's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const keyValueEditorMessages = defineMessages('key-value-editor', en)
