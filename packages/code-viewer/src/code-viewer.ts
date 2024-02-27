import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './code-viewer.scss?inline'
import type { BuiltinLanguage, LanguageRegistration, SpecialLanguage } from 'shikiji'

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

  @property({ type: String }) code = ''
  @property({ type: String }) lang: BuiltinLanguage | SpecialLanguage | LanguageRegistration = 'plaintext'

  override render() {
    return html` <div class="c2-code-viewer">${name}</div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-code-viewer': CodeViewer
  }
}
