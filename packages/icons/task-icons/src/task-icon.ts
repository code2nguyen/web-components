import { LitElement, html, nothing, unsafeCSS, type TemplateResult } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import styles from './task-icon.scss?inline'

/**
 * Shared base class for every generated `c2-task-icon-*` element.
 *
 * It owns the `<svg>` wrapper (a 24x24 canvas), the accessible name and the duotone styling; each generated subclass
 * only supplies the inner SVG markup via `renderIcon()`. This class is not registered as a custom element.
 */
export abstract class TaskIconElement extends LitElement {
  static override styles = unsafeCSS(styles)

  /**
   * Accessible name. When set the icon is exposed as an image with this name; when empty it is decorative and hidden
   * from assistive technology, which is right when the task label next to it already says what it is.
   */
  @property() label = ''

  protected abstract renderIcon(): TemplateResult<2>

  override render() {
    const label = this.label.trim()
    return html`<svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      role=${label ? 'img' : nothing}
      aria-label=${label || nothing}
      aria-hidden=${label ? nothing : 'true'}
      focusable="false"
    >
      ${this.renderIcon()}
    </svg>`
  }
}
