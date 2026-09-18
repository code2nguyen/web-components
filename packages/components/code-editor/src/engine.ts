/**
 * Lazy access to CodeMirror 6.
 *
 * Nothing here is imported by the element file at module scope: `c2-code-editor` pulls in no engine until an
 * instance actually mounts, so importing the package costs nothing, the module is safe to evaluate during SSR, and
 * the whole of CodeMirror stays an *optional* peer dependency — the element degrades to a plain textarea when it is
 * not installed, the same contract `@c2n/chart` has with uPlot and ECharts.
 *
 * Every visible colour comes from the component's CSS custom properties, not from a CodeMirror theme: the editor
 * renders real DOM inside the shadow root, so `code-editor.scss` can style `.cm-*` directly, and the syntax
 * highlighter maps Lezer tags to `c2tok-*` classes rather than to inline styles.
 */
import type { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

/** Language ids with a built-in loader. Anything else needs `languageLoader`. */
export const BUILT_IN_LANGUAGES = ['javascript', 'typescript', 'jsx', 'tsx', 'html', 'css', 'json'] as const

export type BuiltInLanguage = (typeof BUILT_IN_LANGUAGES)[number]

/** Resolves a language id to CodeMirror extensions. Return nothing for "no highlighting". */
export type LanguageLoader = (id: string) => Promise<Extension | undefined> | Extension | undefined

export interface EditorOptions {
  parent: HTMLElement
  /** The shadow root the editor lives in. CodeMirror needs it for selection and focus tracking. */
  root: ShadowRoot | Document
  value: string
  language: string
  languageLoader?: LanguageLoader
  readOnly: boolean
  editable: boolean
  lineNumbers: boolean
  lineWrapping: boolean
  autocomplete: boolean
  tabSize: number
  placeholder: string
  /** Accessible name put on the editable element itself, which is what carries `role=textbox`. */
  label: string
  onInput: (value: string) => void
  onBlur: () => void
  onFocus: () => void
}

/** What the element drives. Every setter is a live reconfiguration, never a teardown. */
export interface EditorHandle {
  readonly view: EditorView
  getValue(): string
  setValue(value: string): void
  setLanguage(language: string, loader?: LanguageLoader): Promise<void>
  setEditing(readOnly: boolean, editable: boolean): void
  setLineNumbers(on: boolean): void
  setLineWrapping(on: boolean): void
  setAutocomplete(on: boolean): void
  setTabSize(size: number): void
  setPlaceholder(text: string): void
  setLabel(label: string): void
  focus(): void
  destroy(): void
}

/** Thrown by nothing: a missing peer resolves to `undefined` so the element can fall back instead of failing. */
type Modules = Awaited<ReturnType<typeof importModules>>

async function importModules() {
  const [state, view, commands, language, autocomplete, search, highlight] = await Promise.all([
    import('@codemirror/state'),
    import('@codemirror/view'),
    import('@codemirror/commands'),
    import('@codemirror/language'),
    import('@codemirror/autocomplete'),
    import('@codemirror/search'),
    import('@lezer/highlight'),
  ])
  return { state, view, commands, language, autocomplete, search, highlight }
}

let pending: Promise<Modules | undefined> | undefined

/**
 * Loads CodeMirror once per page; ten editors mounting together share one request and one module evaluation.
 * Resolves to `undefined` when the peer is not installed, which is a supported state, not an error.
 */
export function loadCodeMirror(): Promise<Modules | undefined> {
  return (pending ??= importModules().catch(() => undefined))
}

/**
 * Token classes instead of inline colours, so the palette lives in `code-editor.scss` as
 * `--c2-code-editor__theme--token-*` — the same names `@c2n/code-viewer` uses for its `css-variables` theme, so the
 * two components can be given one palette.
 */
function buildHighlightStyle({ language, highlight }: Modules) {
  const { tags } = highlight
  return language.HighlightStyle.define([
    { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword], class: 'c2tok-keyword' },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'c2tok-string' },
    { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], class: 'c2tok-comment' },
    { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.constant(tags.name)], class: 'c2tok-constant' },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName], class: 'c2tok-function' },
    { tag: [tags.typeName, tags.className, tags.namespace, tags.standard(tags.typeName)], class: 'c2tok-type' },
    { tag: [tags.propertyName, tags.attributeName], class: 'c2tok-property' },
    { tag: [tags.variableName, tags.definition(tags.variableName), tags.local(tags.variableName)], class: 'c2tok-variable' },
    { tag: [tags.tagName, tags.angleBracket], class: 'c2tok-tag' },
    { tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket, tags.derefOperator], class: 'c2tok-punctuation' },
    { tag: [tags.link, tags.url], class: 'c2tok-link' },
    { tag: tags.invalid, class: 'c2tok-invalid' },
    { tag: [tags.heading, tags.strong], class: 'c2tok-strong' },
    { tag: tags.emphasis, class: 'c2tok-emphasis' },
  ])
}

/** The built-in language loaders. Each grammar is its own dynamic import, so only what is used is fetched. */
async function loadBuiltInLanguage(id: string): Promise<Extension | undefined> {
  switch (id) {
    case 'javascript':
      return import('@codemirror/lang-javascript').then((module) => module.javascript())
    case 'jsx':
      return import('@codemirror/lang-javascript').then((module) => module.javascript({ jsx: true }))
    case 'typescript':
      return import('@codemirror/lang-javascript').then((module) => module.javascript({ typescript: true }))
    case 'tsx':
      return import('@codemirror/lang-javascript').then((module) => module.javascript({ typescript: true, jsx: true }))
    case 'html':
      return import('@codemirror/lang-html').then((module) => module.html())
    case 'css':
      return import('@codemirror/lang-css').then((module) => module.css())
    case 'json':
      return import('@codemirror/lang-json').then((module) => module.json())
    default:
      return undefined
  }
}

async function resolveLanguage(id: string, loader: LanguageLoader | undefined): Promise<Extension | undefined> {
  const normalized = id.trim().toLowerCase()
  if (!normalized || normalized === 'plaintext' || normalized === 'text') return undefined
  // A caller's loader wins, so an app can add Python or SQL without this package growing a peer dependency for it.
  if (loader) {
    const custom = await loader(normalized)
    if (custom) return custom
  }
  return loadBuiltInLanguage(normalized).catch(() => undefined)
}

/**
 * Mounts an editor, or resolves to `undefined` when CodeMirror is not installed. Each reconfigurable concern gets its
 * own `Compartment`, so toggling line numbers or swapping the language never rebuilds the document or loses history.
 */
export async function createEditor(options: EditorOptions): Promise<EditorHandle | undefined> {
  const modules = await loadCodeMirror()
  if (!modules) return undefined
  const { state, view: viewModule, commands, language, autocomplete, search } = modules
  const { Compartment, EditorState } = state
  const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, placeholder } = viewModule

  // One compartment for the content attributes: the accessible name, the editing state a screen reader announces,
  // and the input hints. They change together, so they are rebuilt together.
  let contentState = { label: options.label, readOnly: options.readOnly, editable: options.editable }
  const contentAttributes = () => ({
    'aria-label': contentState.label,
    'aria-readonly': contentState.readOnly ? 'true' : 'false',
    ...(contentState.editable ? {} : { 'aria-disabled': 'true' }),
    spellcheck: 'false',
    autocapitalize: 'off',
    autocorrect: 'off',
  })

  const compartments = {
    language: new Compartment(),
    readOnly: new Compartment(),
    editable: new Compartment(),
    lineNumbers: new Compartment(),
    lineWrapping: new Compartment(),
    autocomplete: new Compartment(),
    tabSize: new Compartment(),
    placeholder: new Compartment(),
    label: new Compartment(),
  }

  // A programmatic `setValue` dispatches a transaction like any edit, so the update listener has to be able to tell
  // them apart. `dispatch` runs the listener synchronously, so a plain flag is enough.
  let applying = false

  const view = new EditorView({
    parent: options.parent,
    // Without this CodeMirror measures selection against the wrong root and the cursor never appears.
    root: options.root,
    state: EditorState.create({
      doc: options.value,
      extensions: [
        lineNumbers && compartments.lineNumbers.of(options.lineNumbers ? lineNumbers() : []),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        rectangularSelection(),
        commands.history(),
        language.bracketMatching(),
        language.indentOnInput(),
        language.foldGutter(),
        autocomplete.closeBrackets(),
        language.syntaxHighlighting(buildHighlightStyle(modules), { fallback: true }),
        keymap.of([...commands.defaultKeymap, ...commands.historyKeymap, ...search.searchKeymap, ...autocomplete.completionKeymap, commands.indentWithTab]),
        compartments.language.of([]),
        compartments.autocomplete.of(options.autocomplete ? autocomplete.autocompletion() : []),
        compartments.lineWrapping.of(options.lineWrapping ? EditorView.lineWrapping : []),
        compartments.tabSize.of(EditorState.tabSize.of(options.tabSize)),
        compartments.readOnly.of(EditorState.readOnly.of(options.readOnly)),
        compartments.editable.of(EditorView.editable.of(options.editable)),
        compartments.placeholder.of(options.placeholder ? placeholder(options.placeholder) : []),
        // The editor is the labelled control, not the box around it: this is the element that carries `role=textbox`.
        compartments.label.of(EditorView.contentAttributes.of(contentAttributes())),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !applying) options.onInput(update.state.doc.toString())
          if (update.focusChanged) (update.view.hasFocus ? options.onFocus : options.onBlur)()
        }),
      ].filter(Boolean) as Extension[],
    }),
  })

  const reconfigure = (compartment: InstanceType<typeof Compartment>, extension: Extension) => {
    view.dispatch({ effects: compartment.reconfigure(extension) })
  }

  const handle: EditorHandle = {
    view,
    getValue: () => view.state.doc.toString(),
    setValue(value) {
      if (value === view.state.doc.toString()) return
      applying = true
      try {
        // Replacing the whole document rather than recreating the state keeps scroll position and undo history.
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
      } finally {
        applying = false
      }
    },
    async setLanguage(id, loader) {
      const extension = await resolveLanguage(id, loader)
      reconfigure(compartments.language, extension ?? [])
    },
    setEditing(readOnly, editable) {
      contentState = { ...contentState, readOnly, editable }
      reconfigure(compartments.readOnly, EditorState.readOnly.of(readOnly))
      reconfigure(compartments.editable, EditorView.editable.of(editable))
      reconfigure(compartments.label, EditorView.contentAttributes.of(contentAttributes()))
    },
    setLineNumbers: (on) => reconfigure(compartments.lineNumbers, on ? lineNumbers() : []),
    setLineWrapping: (on) => reconfigure(compartments.lineWrapping, on ? EditorView.lineWrapping : []),
    setAutocomplete: (on) => reconfigure(compartments.autocomplete, on ? autocomplete.autocompletion() : []),
    setTabSize: (size) => reconfigure(compartments.tabSize, EditorState.tabSize.of(size)),
    setPlaceholder: (text) => reconfigure(compartments.placeholder, text ? placeholder(text) : []),
    setLabel(label) {
      contentState = { ...contentState, label }
      reconfigure(compartments.label, EditorView.contentAttributes.of(contentAttributes()))
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  }

  await handle.setLanguage(options.language, options.languageLoader)
  return handle
}
