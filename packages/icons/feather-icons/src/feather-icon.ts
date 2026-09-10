import { LitElement, html, unsafeCSS, type TemplateResult } from 'lit'
import styles from './feather-icon.scss?inline'

/**
 * Shared base class for every generated `c2-feather-*` icon element.
 *
 * It owns the `<svg>` wrapper (Feather's 24x24 stroked canvas) and the theming
 * CSS custom properties; each generated subclass only supplies the inner SVG
 * markup via `renderIcon()`. This class is not registered as a custom element.
 */
export abstract class FeatherIcon extends LitElement {
  static override styles = unsafeCSS(styles)

  protected abstract renderIcon(): TemplateResult<2>

  override render() {
    return html`<svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      ${this.renderIcon()}
    </svg>`
  }
}
