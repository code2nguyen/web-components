import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './code-viewer.scss?inline'
import type { BuiltinLanguage, SpecialLanguage, ThemeRegistration, ThemeRegistrationRaw } from 'shikiji'
import { createShikiHighlighter, type ShikiConfig, type ShikiHighlighter, type ThemePresets } from './shikiji'
import { Task, TaskStatus } from '@lit/task'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'

/**
 * @tag c2-code-viewer
 */
@customElement('c2-code-viewer')
export class CodeViewer extends LitElement {
  static override styles = unsafeCSS(styles)
  static cachedHighlighters = new Map<string, ShikiHighlighter>()

  @property({ type: String }) code = ''
  @property({ type: String, reflect: true }) theme: ThemePresets | ThemeRegistration | ThemeRegistrationRaw = 'github-light'
  @property({ type: Boolean, reflect: true }) wrap = false
  @property({ type: Boolean, reflect: true }) inline = false
  @property({ type: String, reflect: true }) langage: BuiltinLanguage | SpecialLanguage = 'plaintext'

  private _prepareHighlighterTask = new Task(this, {
    task: async () => {
      const highlighter = await this.getCachedHighlighter({
        langs: [this.langage],
        theme: this.theme ?? 'github-light',
        wrap: this.wrap,
      })
      return highlighter
    },
    args: () => [this.theme, this.wrap, this.langage],
  })

  override render() {
    if (this._prepareHighlighterTask.status === TaskStatus.COMPLETE) {
      const codeHtml = this._prepareHighlighterTask.value!.highlight(this.code.replace(/\\n/g, '\n'), this.langage, {
        inline: this.inline,
      })
      return html`${unsafeHTML(codeHtml)}`
    }

    return this._prepareHighlighterTask.render({
      complete: (highlighter) => {
        const codeHtml = highlighter.highlight(this.code.replace(/\\n/g, '\n'), this.langage, {
          inline: this.inline,
        })
        return html`${unsafeHTML(codeHtml)}`
      },
    })
  }

  async getCachedHighlighter(opts: ShikiConfig): Promise<ShikiHighlighter> {
    const key = JSON.stringify(opts, Object.keys(opts).sort())

    if (CodeViewer.cachedHighlighters.has(key)) {
      return CodeViewer.cachedHighlighters.get(key)
    }

    const highlighter = createShikiHighlighter(opts)
    CodeViewer.cachedHighlighters.set(key, highlighter)

    return highlighter
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-code-viewer': CodeViewer
  }
}
