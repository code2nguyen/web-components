import { createCssVariablesTheme, createHighlighterCore, type HighlighterCore, type ThemeRegistrationAny } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { bundledLanguages, type BundledLanguage } from 'shiki/langs'
import { bundledThemes, type BundledTheme } from 'shiki/themes'

export type { BundledLanguage, BundledTheme }

/** Built-in shiki theme name, or `css-variables` to colour tokens with the `--c2-code-viewer__theme--*` custom properties. */
export type ThemeName = BundledTheme | 'css-variables'

export const CSS_VARIABLES_THEME = 'css-variables'
const CSS_VARIABLES_PREFIX = '--c2-code-viewer__theme--'

/**
 * Every custom property the `css-variables` theme reads, with the default baked into it (a GitHub-light-like palette),
 * overridable per element. shiki writes each one into the token spans and the frame as `var(<name>, <default>)`.
 */
const CSS_VARIABLES: Record<string, string> = {
  '--c2-code-viewer__theme--foreground': '#24292e',
  '--c2-code-viewer__theme--background': '#ffffff',
  '--c2-code-viewer__theme--token-constant': '#005cc5',
  '--c2-code-viewer__theme--token-string': '#032f62',
  '--c2-code-viewer__theme--token-comment': '#6a737d',
  '--c2-code-viewer__theme--token-keyword': '#d73a49',
  '--c2-code-viewer__theme--token-parameter': '#24292e',
  '--c2-code-viewer__theme--token-function': '#6f42c1',
  '--c2-code-viewer__theme--token-string-expression': '#22863a',
  '--c2-code-viewer__theme--token-punctuation': '#24292e',
  '--c2-code-viewer__theme--token-link': '#032f62',
}

/** The same defaults keyed the way shiki's `variableDefaults` expects: the name without the prefix. */
export const CSS_VARIABLE_DEFAULTS: Record<string, string> = Object.fromEntries(
  Object.entries(CSS_VARIABLES).map(([name, value]) => [name.slice(CSS_VARIABLES_PREFIX.length), value]),
)

export interface HighlightOptions {
  code: string
  lang: string
  theme: ThemeName
  /** Second theme: the output carries both palettes as `--shiki-light` / `--shiki-dark` variables. */
  darkTheme?: ThemeName
  inline?: boolean
  lineNumbers?: boolean
  startLine?: number
  /** 1-based line numbers to mark as highlighted. */
  highlightedLines?: Set<number>
}

let corePromise: Promise<HighlighterCore> | undefined
const pending = new Map<string, Promise<void>>()

/**
 * One shared highlighter for every `c2-code-viewer`; grammars and themes are loaded on demand.
 *
 * The regex target is explicit: `auto` misreads JavaScriptCore's regex support (Safari, WebKit), and the grammars then
 * match nothing, so every token comes out in the default colour. ES2024 (the `v` flag) where the engine has it, ES2018
 * (the `u` flag) on an older one.
 */
function getCore(): Promise<HighlighterCore> {
  return (corePromise ??= createHighlighterCore({ engine: createJavaScriptRegexEngine({ forgiving: true, target: regexTarget() }), langs: [], themes: [] }))
}

function regexTarget(): 'ES2024' | 'ES2018' {
  try {
    new RegExp('', 'v')
    return 'ES2024'
  } catch {
    return 'ES2018'
  }
}

/** Resolves a language id or alias to what the highlighter knows, falling back to `plaintext`. */
export function normalizeLang(lang: string | undefined): string {
  const id = (lang ?? '').trim().toLowerCase()
  if (!id || id === 'text' || id === 'txt' || id === 'plaintext' || id === 'plain') return 'plaintext'
  return id in bundledLanguages ? id : 'plaintext'
}

async function ensureLanguage(core: HighlighterCore, lang: string) {
  if (lang === 'plaintext' || core.getLoadedLanguages().includes(lang)) return
  const key = `lang:${lang}`
  if (!pending.has(key)) {
    pending.set(
      key,
      core.loadLanguage(bundledLanguages[lang as BundledLanguage]).finally(() => pending.delete(key)),
    )
  }
  await pending.get(key)
}

let cssVariablesTheme: ThemeRegistrationAny | undefined

async function ensureTheme(core: HighlighterCore, theme: ThemeName) {
  if (core.getLoadedThemes().includes(theme)) return
  const key = `theme:${theme}`
  if (!pending.has(key)) {
    const registration =
      theme === CSS_VARIABLES_THEME
        ? (cssVariablesTheme ??= createCssVariablesTheme({
            name: CSS_VARIABLES_THEME,
            variablePrefix: CSS_VARIABLES_PREFIX,
            variableDefaults: CSS_VARIABLE_DEFAULTS,
            fontStyle: true,
          }))
        : bundledThemes[theme as BundledTheme]
    pending.set(
      key,
      core.loadTheme(registration).finally(() => pending.delete(key)),
    )
  }
  await pending.get(key)
}

export function isKnownTheme(theme: string | undefined): theme is ThemeName {
  return !!theme && (theme === CSS_VARIABLES_THEME || theme in bundledThemes)
}

export interface HighlightResult {
  /** `<pre class="shiki"><code>…</code></pre>`, or only the token spans when `inline`. */
  html: string
  /**
   * The theme's frame colours as custom properties (`--cv-bg` / `--cv-fg` for one theme, shiki's `--shiki-light(-bg)` /
   * `--shiki-dark(-bg)` for two). Put it on the frame so the stylesheet can use them for header and body alike.
   */
  style: string
}

/** Highlights `code`; the component stylesheet owns the frame look, the theme only supplies colours. */
export async function highlight({
  code,
  lang,
  theme,
  darkTheme,
  inline = false,
  lineNumbers = false,
  startLine = 1,
  highlightedLines,
}: HighlightOptions): Promise<HighlightResult> {
  const core = await getCore()
  const language = normalizeLang(lang)
  await Promise.all([ensureLanguage(core, language), ensureTheme(core, theme), darkTheme ? ensureTheme(core, darkTheme) : undefined])

  {
    const g = core.getLanguage(language) as unknown as { _grammar?: unknown; name?: string }
    const t = core.codeToTokens(code, { lang: language, theme })
    console.log('[probe:cv]', JSON.stringify({ lang, language, loaded: core.getLoadedLanguages(), grammarName: g?.name, line0: t.tokens[0]?.map((x) => [x.content, x.color]) }))
    try {
      const strict = await createHighlighterCore({ engine: createJavaScriptRegexEngine({ forgiving: false }), langs: [bundledLanguages[language as BundledLanguage]], themes: [] })
      console.log('[probe:cv-strict]', JSON.stringify(strict.codeToTokens(code, { lang: language, theme: 'none' }).tokens[0]?.map((x) => x.content)))
    } catch (e) {
      console.log('[probe:cv-strict-throw]', String((e as Error)?.stack ?? e).slice(0, 1500))
    }
  }
  const themeOptions = darkTheme ? { themes: { light: theme, dark: darkTheme }, defaultColor: false as const } : { theme }

  const html = core.codeToHtml(code, {
    lang: language,
    ...themeOptions,
    transformers: [
      {
        pre(node) {
          // Move the theme's own frame colours into custom properties: the stylesheet decides whether they are used.
          const style = String(node.properties.style ?? '')
          if (!darkTheme) {
            node.properties.style = style.replace(/background-color:/, '--cv-bg:').replace(/(^|;)color:/, '$1--cv-fg:')
          }
          const classes = [
            ...String(node.properties.class ?? '')
              .split(' ')
              .filter(Boolean),
          ]
          if (lineNumbers) classes.push('has-line-numbers')
          if (darkTheme) classes.push('dual')
          node.properties.class = classes.join(' ')
          delete node.properties.tabindex
        },
        code(node) {
          if (lineNumbers) node.properties.style = `counter-reset: line ${startLine - 1}`
        },
        line(node, line) {
          if (highlightedLines?.has(line)) this.addClassToHast(node, 'highlighted')
          // Diff markers stay visible but are not copied with the selection.
          if (language === 'diff') {
            const first = node.children[0]
            const text = first?.type === 'element' ? first.children[0] : undefined
            if (text?.type === 'text' && (text.value[0] === '+' || text.value[0] === '-')) {
              const marker = text.value[0]
              text.value = text.value.slice(1)
              ;(first as typeof node).children.unshift({
                type: 'element',
                tagName: 'span',
                properties: { class: 'diff-marker' },
                children: [{ type: 'text', value: marker }],
              })
            }
          }
        },
      },
    ],
  })

  const style = html.match(/^<pre[^>]*?style="([^"]*)"/)?.[1] ?? ''
  if (inline) {
    const inner = html.match(/<code[^>]*>([\s\S]*)<\/code>\s*<\/pre>\s*$/)?.[1] ?? html
    return { html: inner, style }
  }
  return { html, style }
}
