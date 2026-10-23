import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import type { Placement } from '@floating-ui/dom'
import styles from './tour-step.scss?inline'

/**
 * One step of a `c2-tour`: the element it points at, a heading and the text that explains it. The step draws nothing
 * on its own; its tour shows the current step inside its panel, beside the highlighted target.
 *
 * `target` is a CSS selector, looked up from the tour's root (the document, or the shadow root the tour sits in) when
 * the step is shown. A step without a target, or whose target is missing or not rendered, shows centred on a fully
 * dimmed page: use one for a welcome or closing step.
 *
 * @tag c2-tour-step
 *
 * @slot - The step's explanation: a sentence, a list, an image. It is the tour panel's accessible description.
 */
@customElement('c2-tour-step')
export class TourStep extends LitElement {
  static override styles = unsafeCSS(styles)

  /** CSS selector of the element this step highlights. Empty, or matching nothing visible, the step shows centred. */
  @property() target = ''

  /** The step's title, shown at the top of the panel and used as its accessible name. */
  @property() heading = ''

  /** Preferred side of the target for the panel, overriding the tour's `placement`; flips when there is no room. */
  @property() placement?: Placement

  /** The element `target` selects right now, or `null`. */
  get targetElement(): HTMLElement | null {
    if (!this.target) return null
    const root = this.getRootNode() as Document | ShadowRoot
    try {
      return root.querySelector<HTMLElement>(this.target) ?? (root === document ? null : document.querySelector<HTMLElement>(this.target))
    } catch {
      return null /* invalid selector */
    }
  }

  override updated(changed: PropertyValues<this>) {
    // The tour reads these when it draws the step, so it redraws when they change.
    if (changed.size && this.parentElement?.localName === 'c2-tour') (this.parentElement as LitElement).requestUpdate()
  }

  override render() {
    return html`<slot></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tour-step': TourStep
  }
}
