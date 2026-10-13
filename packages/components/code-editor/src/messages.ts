import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the editor when nothing labels it. */
  codeEditor: 'Code editor',
  valueMissing: 'Please enter some code.',
  // CodeMirror's own interface text (search panel, go-to-line, folding, completions), passed as `EditorState.phrases`.
  find: 'Find',
  replace: 'Replace',
  next: 'next',
  previous: 'previous',
  all: 'all',
  matchCase: 'match case',
  regexp: 'regexp',
  byWord: 'by word',
  replaceOne: 'replace',
  replaceAll: 'replace all',
  close: 'close',
  currentMatch: 'current match',
  onLine: 'on line',
  replacedMatches: 'replaced $ matches',
  replacedMatchOnLine: 'replaced match on line $',
  goToLine: 'Go to line',
  go: 'go',
  foldLine: 'Fold line',
  unfoldLine: 'Unfold line',
  foldedCode: 'folded code',
  unfold: 'unfold',
  foldedLines: 'Folded lines',
  unfoldedLines: 'Unfolded lines',
  to: 'to',
  controlCharacter: 'Control character',
  completions: 'Completions',
  selectionDeleted: 'Selection deleted',
}

/** The code editor's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const codeEditorMessages = defineMessages('code-editor', en)

/** The messages that are CodeMirror phrases: CodeMirror looks each up by its English text, `en[key]`. */
export const CODEMIRROR_PHRASES = Object.keys(en).filter((key) => key !== 'codeEditor' && key !== 'valueMissing') as Array<keyof typeof en>
