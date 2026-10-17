import { defineMessages } from '@c2n/core/localize.js'

const plural = (count: number, one: string, other: string) => `${count} ${count === 1 ? one : other}`

const en = {
  /** Accessible name of the element when `label` is not set. */
  label: 'Changes',
  /** Column headers, read by screen readers only. */
  original: 'Original',
  modified: 'Modified',
  originalLine: 'Original line',
  modifiedLine: 'Modified line',
  change: 'Change',
  text: 'Text',
  /** What a changed line is, read before its text. */
  added: 'Added',
  removed: 'Removed',
  summary: (additions: number, deletions: number) => `${plural(additions, 'addition', 'additions')}, ${plural(deletions, 'deletion', 'deletions')}`,
  expand: (count: number) => `Show ${plural(count, 'unchanged line', 'unchanged lines')}`,
  noChanges: 'No changes',
  noNewline: 'No newline at end of file',
}

/** The diff viewer's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const diffViewerMessages = defineMessages('diff-viewer', en)
