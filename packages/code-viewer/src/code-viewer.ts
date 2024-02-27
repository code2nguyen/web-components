import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './code-viewer.scss?inline'
/**
 * @tag c2-code-viewer
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-code-viewer')
export class CodeViewer extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: String }) name = 'Example property'

  override render() {
    return html` <div class="c2-code-viewer">${name}</div> `
  }
}

export async function createShikiHighlighter({
  langs = [],
  theme = 'github-dark',
  experimentalThemes = {},
  wrap = false,
  transformers = [],
}: ShikiConfig = {}): Promise<ShikiHighlighter> {
  const themes = experimentalThemes

  theme = theme === 'css-variables' ? cssVariablesTheme() : theme

  const highlighter = await getHighlighter({
    langs: langs.length ? langs : Object.keys(bundledLanguages),
    themes: Object.values(themes).length ? Object.values(themes) : [theme],
  })

  const loadedLanguages = highlighter.getLoadedLanguages()

  return {
    highlight(code, lang = 'plaintext', options) {},
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-code-viewer': CodeViewer
  }
}
