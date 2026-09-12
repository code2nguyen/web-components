import { LitElement, html, unsafeCSS, type TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'
import styles from './phosphor-icon.scss?inline'

export const phosphorIconWeights = ['regular', 'thin', 'light', 'bold', 'fill', 'duotone'] as const
export type PhosphorIconWeight = (typeof phosphorIconWeights)[number]

/**
 * Shared base class for every generated `c2-phosphor-*` icon element.
 *
 * It owns the SVG wrapper, weight selection and shared theme properties. This
 * class is not registered as a custom element.
 */
export abstract class PhosphorIcon extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Visual weight of the icon. */
  @property({ reflect: true }) weight: PhosphorIconWeight = 'regular'

  protected abstract renderIcon(weight: PhosphorIconWeight): TemplateResult<2>

  override render() {
    const weight = phosphorIconWeights.includes(this.weight) ? this.weight : 'regular'
    return html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">
      ${this.renderIcon(weight)}
    </svg>`
  }
}
