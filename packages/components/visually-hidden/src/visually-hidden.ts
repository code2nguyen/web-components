import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './visually-hidden.scss?inline'

/**
 * Content for screen readers only: the text stays in the accessibility tree, so it is read out, can name a control
 * and can be referenced by `aria-labelledby`/`aria-describedby`, but it takes no space and draws nothing. Use it for a
 * heading a visual layout makes obvious, the label of an icon-only control, or a live-region announcement (put `role`
 * and `aria-live` on the element itself). The hiding rules are `!important` inside the shadow root, so a page style
 * on the tag cannot bring the content back by accident; `display: none` still removes it from the accessibility tree.
 *
 * @tag c2-visually-hidden
 *
 * @slot - Text, or any content, to keep for assistive technology only.
 */
@customElement('c2-visually-hidden')
export class VisuallyHidden extends LitElement {
  static override styles = unsafeCSS(styles)

  /**
   * Shows the content while focus is inside it, for a link or button that only keyboard users need to see (a
   * "Skip to comments" link, an "Edit row" action). Revealed, the element applies no styles of its own, so it lays
   * out like any inline content and the page styles it.
   */
  @property({ type: Boolean, reflect: true }) focusable = false

  private readonly internals = this.attachInternals()

  override render() {
    return html`<slot></slot>`
  }

  protected override updated(changed: PropertyValues<this>): void {
    // The stylesheet reads this state, not the attribute: `focusable="false"` (Svelte 5, a server renderer) is false.
    if (!changed.has('focusable')) return
    if (this.focusable) this.internals.states.add('focusable')
    else this.internals.states.delete('focusable')
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-visually-hidden': VisuallyHidden
  }
}
