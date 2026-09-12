import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './navigation-menu-link.scss?inline'

/**
 * A link row for the `panel` slot of a `c2-navigation-menu-item`: a title, an optional second line of `description`,
 * and optional icons. It renders a real `<a>`, so it is a tab stop, opens in a new tab with a modifier and reports
 * `aria-current="page"` when marked `current`. Lay several of them out with your own CSS grid to build a mega panel.
 *
 * @tag c2-navigation-menu-link
 *
 * @slot default - The title. Falls back to `label`.
 * @slot description - Secondary line under the title (muted, smaller).
 * @slot prefix-icon - Icon before the title.
 * @slot suffix-icon - Icon after the title, e.g. an arrow for an outbound link.
 *
 * @cssproperty {pixel} [--c2-navigation-menu-link--gap=10px] - Space between the icons and the text.
 *
 * @cssproperty {padding} [--c2-navigation-menu-link--padding-top=8px]
 * @cssproperty {padding} [--c2-navigation-menu-link--padding-right=10px]
 * @cssproperty {padding} [--c2-navigation-menu-link--padding-bottom=8px]
 * @cssproperty {padding} [--c2-navigation-menu-link--padding-left=10px]
 *
 * @cssproperty {border-radius} [--c2-navigation-menu-link--border-top-left-radius=6px]
 * @cssproperty {border-radius} [--c2-navigation-menu-link--border-top-right-radius=6px]
 * @cssproperty {border-radius} [--c2-navigation-menu-link--border-bottom-left-radius=6px]
 * @cssproperty {border-radius} [--c2-navigation-menu-link--border-bottom-right-radius=6px]
 *
 * @cssproperty {font-size} [--c2-navigation-menu-link--font-size=14px]
 * @cssproperty {font-weight} [--c2-navigation-menu-link--font-weight=500]
 * @cssproperty {pixel} [--c2-navigation-menu-link--line-height=20px]
 *
 * @cssproperty {color} [--c2-navigation-menu-link--color=#18181b]
 * @cssproperty {color} [--c2-navigation-menu-link--background=transparent]
 *
 * @cssproperty {color} [--c2-navigation-menu-link__hover--background=#f4f4f5]
 * @cssproperty {color} --c2-navigation-menu-link__hover--color - Defaults to the title colour.
 *
 * @cssproperty {color} [--c2-navigation-menu-link__current--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-navigation-menu-link__current--background=#edf1fe]
 *
 * @cssproperty {color} [--c2-navigation-menu-link__description--color=#71717a]
 * @cssproperty {font-size} [--c2-navigation-menu-link__description--font-size=12px]
 * @cssproperty {pixel} [--c2-navigation-menu-link__description--line-height=16px]
 * @cssproperty {font-weight} [--c2-navigation-menu-link__description--font-weight=400]
 * @cssproperty {pixel} [--c2-navigation-menu-link__description--margin-top=2px]
 *
 * @cssproperty {pixel} [--c2-navigation-menu-link__icon--size=18px]
 * @cssproperty {color} [--c2-navigation-menu-link__icon--color=#71717a]
 *
 * @cssproperty {outline} [--c2-navigation-menu-link__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-navigation-menu-link__focus--outline-offset=-2px]
 *
 * @cssproperty {opacity} [--c2-navigation-menu-link__disabled--opacity=0.38]
 */
@customElement('c2-navigation-menu-link')
export class NavigationMenuLink extends LitElement {
  static override styles = unsafeCSS(styles)

  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  @property() href?: string

  @property() target?: string

  /** The link to the page being shown: announced as `aria-current="page"` and styled with the `__current` variables. */
  @property({ type: Boolean, reflect: true }) current = false

  /** Dims the row and ignores clicks; the row stops being a link. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Title used as the default slot's fallback content. */
  @property({ reflect: true }) label?: string

  @state() private hasDescription = false

  @query('.link') private link?: HTMLElement

  override focus(options?: FocusOptions) {
    this.link?.focus(options)
  }

  private handleDescriptionSlotChange(event: Event) {
    const slot = event.target as HTMLSlotElement
    this.hasDescription = slot.assignedNodes({ flatten: true }).some((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== '')
  }

  override render() {
    return html`<a
      class="link"
      href=${ifDefined(this.disabled ? undefined : this.href)}
      target=${ifDefined(this.target)}
      rel=${this.target === '_blank' ? 'noopener noreferrer' : nothing}
      aria-current=${this.current ? 'page' : nothing}
      aria-disabled=${this.disabled ? 'true' : nothing}
    >
      <slot name="prefix-icon"></slot>
      <span class="content">
        <span class="title"><slot>${this.label ?? nothing}</slot></span>
        <span class="description" ?hidden=${!this.hasDescription}>
          <slot name="description" @slotchange=${this.handleDescriptionSlotChange}></slot>
        </span>
      </span>
      <slot name="suffix-icon"></slot>
    </a>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-navigation-menu-link': NavigationMenuLink
  }
}
