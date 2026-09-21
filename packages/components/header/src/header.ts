import { LitElement, html, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './header.scss?inline'

/**
 * A site-header shell that arranges branding, navigation, actions and an optional mobile trigger. Navigation behaviour
 * remains the responsibility of slotted controls such as `c2-navigation-menu`.
 *
 * @tag c2-header
 * @slot brand - Logo, product name or home link.
 * @slot - Primary navigation.
 * @slot actions - Account and application actions aligned to the end.
 * @slot mobile-trigger - Responsive navigation trigger, placed after the actions.
 * @csspart header - The outer page-header landmark.
 * @csspart content - Inner layout container wrapping and aligning the assigned default slot.
 * @csspart brand - Container for the `brand` slot.
 * @csspart navigation - Primary navigation landmark containing the default slot.
 * @csspart actions - Container for the trailing `actions` slot.
 * @csspart mobile-trigger - Container for the responsive `mobile-trigger` slot.
 *
 * @cssproperty {pixel} [--c2-header--min-height=64px]
 * @cssproperty {padding} [--c2-header--padding=8px 24px]
 * @cssproperty {pixel} [--c2-header--gap=24px]
 * @cssproperty {color} [--c2-header--background=#ffffff]
 * @cssproperty {color} [--c2-header--color=#18181b]
 * @cssproperty {border} [--c2-header--border-bottom=1px solid #e4e4e7]
 * @cssproperty {box-shadow} [--c2-header--box-shadow=none]
 * @cssproperty {pixel} [--c2-header--sticky-top=0px]
 * @cssproperty {backdrop-filter} [--c2-header--backdrop-filter=blur(16px)]
 * @cssproperty {color} [--c2-header__blurred--background=rgba(255, 255, 255, 0.82)]
 * @cssproperty {max-width} [--c2-header__content--max-width=none] - Constrains the inner content while the header surface remains full-width.
 * @cssproperty {pixel} [--c2-header__brand--gap=8px]
 * @cssproperty {pixel} [--c2-header__actions--gap=8px]
 */
@customElement('c2-header')
export class Header extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Pins the header to the configured top offset. */
  @property({ type: Boolean, reflect: true }) sticky = false

  /** Uses a translucent background and backdrop filter. */
  @property({ type: Boolean, reflect: true }) blurred = false

  /** Accessible name for the primary navigation landmark. */
  @property({ attribute: 'navigation-label' }) navigationLabel = 'Primary'

  override render() {
    return html`
      <header class="c2-header" part="header">
        <div class="content" part="content">
          <div class="brand" part="brand"><slot name="brand"></slot></div>
          <nav class="navigation" part="navigation" aria-label=${this.navigationLabel}><slot></slot></nav>
          <div class="actions" part="actions"><slot name="actions"></slot></div>
          <div class="mobile-trigger" part="mobile-trigger"><slot name="mobile-trigger"></slot></div>
        </div>
      </header>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-header': Header
  }
}
