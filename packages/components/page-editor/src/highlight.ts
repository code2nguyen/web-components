/**
 * Syntax colours for code blocks, from shiki.
 *
 * Nothing here imports shiki at module scope: the engine and each grammar load the first time a code block names a
 * language, so a page with no code costs nothing and the module is safe to evaluate during SSR. Once a grammar is
 * loaded, tokenizing is synchronous, so typing in a code block never flashes uncoloured text.
 *
 * Tokens are coloured with shiki's `css-variables` theme pointed at private `--_tok-*` variables, which the
 * stylesheet sets from the component's documented `--c2-page-editor__syntax-*--color` variables: the theme, dark mode
 * and a consumer's overrides all apply, and the editor never writes a literal colour. Each token span gets an inline
 * `color: var(--_tok-token-<kind>)` decoration; `.code-block` defines those from:
 *
 * - `--_tok-token-keyword` ← `--c2-page-editor__syntax-keyword--color`
 * - `--_tok-token-string` (and `-string-expression`) ← `--c2-page-editor__syntax-string--color`
 * - `--_tok-token-function` ← `--c2-page-editor__syntax-function--color`
 * - `--_tok-token-constant` ← `--c2-page-editor__syntax-constant--color`
 * - `--_tok-token-comment` ← `--c2-page-editor__syntax-comment--color`
 * - `--_tok-token-parameter` ← `--c2-page-editor__syntax-parameter--color`
 * - `--_tok-token-punctuation` ← `--c2-page-editor__syntax-punctuation--color`
 * - `--_tok-token-link` ← `--c2-page-editor__syntax-link--color`
 */
import type { Node as ProseNode } from 'prosemirror-model'
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import type { HighlighterCore } from 'shiki/core'
import { normalizeLanguage } from './languages'

const THEME = 'c2-page-editor'
const CACHE_SIZE = 200

interface Span {
  from: number
  to: number
  style: string
}

let core: HighlighterCore | null = null
let corePromise: Promise<HighlighterCore> | null = null
const loaded = new Set<string>()
const unavailable = new Set<string>()
const loading = new Map<string, Promise<boolean>>()
const cache = new Map<string, Span[]>()

async function loadLanguage(language: string): Promise<boolean> {
  const [{ createHighlighterCore, createCssVariablesTheme }, { createJavaScriptRegexEngine }, { bundledLanguages }] = await Promise.all([
    import('shiki/core'),
    import('shiki/engine/javascript'),
    import('shiki/langs'),
  ])
  if (!(language in bundledLanguages)) return false
  corePromise ??= createHighlighterCore({
    // An explicit target: `auto` misreads JavaScriptCore's regex support (Safari, WebKit), and the grammars then match
    // nothing. ES2024 (the `v` flag) where the engine has it, ES2018 (the `u` flag) on an older one.
    engine: createJavaScriptRegexEngine({ forgiving: true, target: regexTarget() }),
    themes: [createCssVariablesTheme({ name: THEME, variablePrefix: '--_tok-', variableDefaults: {}, fontStyle: true })],
    langs: [],
  })
  core = await corePromise
  await core.loadLanguage(bundledLanguages[language as keyof typeof bundledLanguages])
  return true
}

function regexTarget(): 'ES2024' | 'ES2018' {
  try {
    new RegExp('', 'v')
    return 'ES2024'
  } catch {
    return 'ES2018'
  }
}

/** Loads a grammar once; resolves to whether it can be used. */
function ensureLanguage(language: string): Promise<boolean> {
  let pending = loading.get(language)
  if (!pending) {
    pending = loadLanguage(language)
      .catch((error: unknown) => {
        // The block stays plain text for this page; say why rather than fail silently.
        console.warn(`c2-page-editor: the ${language} grammar could not be loaded, so its code blocks stay uncoloured.`, error)
        return false
      })
      .then((ok) => {
        if (ok) loaded.add(language)
        else unavailable.add(language)
        return ok
      })
    loading.set(language, pending)
  }
  return pending
}

function tokenize(text: string, language: string): Span[] {
  const key = `${language}\n${text}`
  const hit = cache.get(key)
  if (hit) {
    // Least recently used goes first.
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const spans: Span[] = []
  try {
    const { tokens } = core!.codeToTokens(text, { lang: language, theme: THEME })
    console.log('[probe:pe]', JSON.stringify({ language, line0: tokens[0]?.map((x) => [x.content, x.color]) }))
    for (const line of tokens) {
      for (const token of line) {
        if (!token.content.trim()) continue
        const styles: string[] = []
        if (token.color && !token.color.includes('foreground')) styles.push(`color: ${token.color}`)
        const fontStyle = token.fontStyle ?? 0
        if (fontStyle & 1) styles.push('font-style: italic')
        if (fontStyle & 2) styles.push('font-weight: 600')
        if (styles.length) spans.push({ from: token.offset, to: token.offset + token.content.length, style: styles.join('; ') })
      }
    }
  } catch (e) {
    console.log('[probe:pe-throw]', String((e as Error)?.stack ?? e).slice(0, 1500))
    // A grammar that fails on this text leaves it plain.
  }
  cache.set(key, spans)
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
  return spans
}

function build(doc: ProseNode): DecorationSet {
  if (!core) return DecorationSet.empty
  const decorations: Decoration[] = []
  doc.forEach((block, offset) => {
    if (block.type.name !== 'code_block' || !block.content.size) return
    const language = normalizeLanguage(block.attrs.language)
    if (!loaded.has(language)) return
    const start = offset + 1
    for (const span of tokenize(block.textContent, language)) decorations.push(Decoration.inline(start + span.from, start + span.to, { style: span.style }))
  })
  return DecorationSet.create(doc, decorations)
}

/** Languages the document uses that are not loaded yet. */
function missing(state: EditorState): string[] {
  const languages = new Set<string>()
  state.doc.forEach((block) => {
    if (block.type.name !== 'code_block') return
    const language = normalizeLanguage(block.attrs.language)
    if (language && !loaded.has(language) && !unavailable.has(language)) languages.add(language)
  })
  return [...languages]
}

export const highlightKey = new PluginKey<DecorationSet>('c2-page-editor-highlight')

export function highlightPlugin(): Plugin<DecorationSet> {
  const request = (view: EditorView) => {
    for (const language of missing(view.state)) {
      void ensureLanguage(language).then((ok) => {
        if (ok && !view.isDestroyed) view.dispatch(view.state.tr.setMeta(highlightKey, true).setMeta('addToHistory', false))
      })
    }
  }
  return new Plugin<DecorationSet>({
    key: highlightKey,
    state: {
      init: (_config, state) => build(state.doc),
      apply: (tr, set, _old, state) => (tr.docChanged || tr.getMeta(highlightKey) ? build(state.doc) : set),
    },
    props: {
      decorations: (state) => highlightKey.getState(state),
    },
    view: (view) => {
      request(view)
      return { update: (updated) => request(updated) }
    },
  })
}
