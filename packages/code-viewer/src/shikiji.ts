import { bundledLanguages, createCssVariablesTheme, getHighlighter } from 'shikiji'
import type { BuiltinLanguage, BuiltinTheme, SpecialLanguage, ThemeRegistration, ThemeRegistrationRaw } from 'shikiji'
import { visit } from 'unist-util-visit'
import type { Properties } from 'hast'

export type ThemePresets = BuiltinTheme | 'css-variables'

export interface ShikiConfig {
  langs?: Array<BuiltinLanguage | SpecialLanguage>
  theme?: ThemePresets | ThemeRegistration | ThemeRegistrationRaw
  wrap?: boolean | null
}

const COLOR_REPLACEMENTS: Record<string, string> = {
  '--c2-code-viewer-foreground': '--c2-code-viewer-color-text',
  '--c2-code-viewer-background': '--c2-code-viewer-color-background',
}
const COLOR_REPLACEMENT_REGEX = new RegExp(`${Object.keys(COLOR_REPLACEMENTS).join('|')}`, 'g')

export interface ShikiHighlighter {
  highlight(code: string, lang?: string, options?: { inline?: boolean }): string
}

let _cssVariablesTheme: ReturnType<typeof createCssVariablesTheme>
const cssVariablesTheme = () => _cssVariablesTheme ?? (_cssVariablesTheme = createCssVariablesTheme({ variablePrefix: '--c2-code-viewer-' }))

export async function createShikiHighlighter({ langs = [], theme = 'github-dark', wrap = false }: ShikiConfig = {}): Promise<ShikiHighlighter> {
  theme = theme === 'css-variables' ? cssVariablesTheme() : theme

  const highlighter = await getHighlighter({
    langs: langs.length ? langs : Object.keys(bundledLanguages),
    themes: [theme],
  })

  const loadedLanguages = highlighter.getLoadedLanguages()

  return {
    highlight(code, lang = 'plaintext', options) {
      if (lang !== 'plaintext' && !loadedLanguages.includes(lang)) {
        // eslint-disable-next-line no-console
        console.warn(`[Shiki] The language "${lang}" doesn't exist, falling back to "plaintext".`)
        lang = 'plaintext'
      }

      const themeOptions = { theme }
      const inline = options?.inline ?? false

      return highlighter.codeToHtml(code, {
        ...themeOptions,
        lang,
        transformers: [
          {
            pre(node) {
              // Swap to `code` tag if inline
              if (inline) {
                node.tagName = 'code'
              }

              const classValue = normalizePropAsString(node.properties.class) ?? ''
              const styleValue = normalizePropAsString(node.properties.style) ?? ''

              // Replace "shiki" class naming with "astro-code"
              node.properties.class = classValue.replace(/shiki/g, 'c2-code-viewer')

              // Handle code wrapping
              // if wrap=null, do nothing.
              if (wrap === false) {
                node.properties.style = styleValue + '; overflow-x: auto;'
              } else if (wrap === true) {
                node.properties.style = styleValue + '; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word;'
              }
            },
            line(node) {
              // Add "user-select: none;" for "+"/"-" diff symbols.
              // Transform `<span class="line"><span style="...">+ something</span></span>
              // into      `<span class="line"><span style="..."><span style="user-select: none;">+</span> something</span></span>`
              if (lang === 'diff') {
                const innerSpanNode = node.children[0]
                const innerSpanTextNode = innerSpanNode?.type === 'element' && innerSpanNode.children?.[0]

                if (innerSpanTextNode && innerSpanTextNode.type === 'text') {
                  const start = innerSpanTextNode.value[0]
                  if (start === '+' || start === '-') {
                    innerSpanTextNode.value = innerSpanTextNode.value.slice(1)
                    innerSpanNode.children.unshift({
                      type: 'element',
                      tagName: 'span',
                      properties: { style: 'user-select: none;' },
                      children: [{ type: 'text', value: start }],
                    })
                  }
                }
              }
            },
            code(node) {
              if (inline) {
                return node.children[0] as typeof node
              }
              return node
            },
            root(node) {
              // theme.id for shiki -> shikiji compat
              const themeName = typeof theme === 'string' ? theme : theme.name
              if (themeName === 'css-variables') {
                // Replace special color tokens to CSS variables
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                visit(node as any, 'element', (child) => {
                  if (child.properties?.style) {
                    child.properties.style = replaceCssVariables(child.properties.style)
                  }
                })
              }
            },
          },
        ],
      })
    },
  }
}

function normalizePropAsString(value: Properties[string]): string | null {
  return Array.isArray(value) ? value.join(' ') : (value as string | null)
}

/**
 * shiki -> shikiji compat as we need to manually replace it
 * @internal Exported for error overlay use only
 */
export function replaceCssVariables(str: string) {
  return str.replace(COLOR_REPLACEMENT_REGEX, (match) => COLOR_REPLACEMENTS[match] || match)
}
