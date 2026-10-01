import { LitElement, html, nothing, unsafeCSS, type TemplateResult } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import styles from './symbol.scss?inline'

/**
 * Shared base class for every generated `c2-symbol-*` element.
 *
 * It owns the `<svg>` wrapper (a 160x160 canvas), the accessible name and the colour roles the artwork is drawn
 * with; each generated subclass only supplies the inner SVG markup via `renderSymbol()`. This class is not
 * registered as a custom element.
 */
export abstract class SymbolElement extends LitElement {
  static override styles = unsafeCSS(styles)

  /**
   * Accessible name. When set the symbol is exposed as an image with this name; when empty it is decorative and
   * hidden from assistive technology, which is right when a heading next to it already says the same thing.
   */
  @property() label = ''

  protected abstract renderSymbol(): TemplateResult<2>

  override render() {
    const label = this.label.trim()
    return html`<svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 160 160"
      role=${label ? 'img' : nothing}
      aria-label=${label || nothing}
      aria-hidden=${label ? nothing : 'true'}
      focusable="false"
    >
      ${this.renderSymbol()}
    </svg>`
  }
}
