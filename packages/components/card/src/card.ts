import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './card.scss?inline'

/** What counts as a control of its own inside a link card: a click on one must not also follow the card's link. */
const INNER_CONTROL =
  'a[href], button, input, select, textarea, label, summary, [contenteditable=""], [contenteditable="true"], [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="radio"], [role="menuitem"], [role="tab"], [role="option"], [tabindex]:not([tabindex="-1"])'

/**
 * Surface that groups related content and actions. The body goes in the default slot; `media`, `header` and `footer`
 * are optional sections that render only when filled: media bleeds to the edges at the top, header and footer get
 * their own padding and divider tokens. With `href` the whole card is a link; with `interactive` it behaves like a
 * button (focusable, Enter and Space click it). The link or button holds the media, header and body, and stretches
 * over the whole card, so the footer's own actions stay separate controls above it. Hover, focus and disabled looks
 * are themeable.
 *
 * @tag c2-card
 *
 * @slot - Card body.
 * @slot media - Full-bleed image, video or any block shown above the body; it is clipped to the card radius.
 * @slot header - Title area above the body.
 * @slot footer - Actions row below the body (a flex row, see the `footer--*` tokens).
 *
 * @csspart media - Wrapper around the `media` slot; present when media content is assigned and clipped by the card surface.
 * @csspart header - Wrapper around the `header` slot; present when header content is assigned.
 * @csspart body - Wrapper around the default slot; present when body content is assigned.
 * @csspart footer - Wrapper around the `footer` slot; present when footer content is assigned.
 *
 * @cssproperty {padding} [--c2-card--padding-top=12px]
 * @cssproperty {padding} [--c2-card--padding-right=16px]
 * @cssproperty {padding} [--c2-card--padding-bottom=12px]
 * @cssproperty {padding} [--c2-card--padding-left=16px]
 *
 * @cssproperty {border-radius} [--c2-card--border-top-left-radius=8px]
 * @cssproperty {border-radius} [--c2-card--border-top-right-radius=8px]
 * @cssproperty {border-radius} [--c2-card--border-bottom-left-radius=8px]
 * @cssproperty {border-radius} [--c2-card--border-bottom-right-radius=8px]
 *
 * @cssproperty {border} [--c2-card--border-top=1px solid rgb(213, 213, 213)]
 * @cssproperty {border} [--c2-card--border-bottom=1px solid rgb(213, 213, 213)]
 * @cssproperty {border} [--c2-card--border-right=1px solid rgb(213, 213, 213)]
 * @cssproperty {border} [--c2-card--border-left=1px solid rgb(213, 213, 213)]
 *
 * @cssproperty {background} [--c2-card--background=rgb(255, 255, 255)]
 * @cssproperty {color} --c2-card--color - Text color of the card; inherits by default.
 * @cssproperty {box-shadow} [--c2-card--box-shadow=none]
 * @cssproperty {transform} --c2-card--transform
 *
 * @cssproperty {padding} --c2-card__header--padding-top - Falls back to `--c2-card--padding-top`.
 * @cssproperty {padding} --c2-card__header--padding-right - Falls back to `--c2-card--padding-right`.
 * @cssproperty {padding} [--c2-card__header--padding-bottom=0px]
 * @cssproperty {padding} --c2-card__header--padding-left - Falls back to `--c2-card--padding-left`.
 * @cssproperty {border} --c2-card__header--border-bottom - Divider under the header; raise `header--padding-bottom` with it.
 *
 * @cssproperty {padding} [--c2-card__footer--padding-top=0px]
 * @cssproperty {padding} --c2-card__footer--padding-right - Falls back to `--c2-card--padding-right`.
 * @cssproperty {padding} --c2-card__footer--padding-bottom - Falls back to `--c2-card--padding-bottom`.
 * @cssproperty {padding} --c2-card__footer--padding-left - Falls back to `--c2-card--padding-left`.
 * @cssproperty {border} --c2-card__footer--border-top - Divider above the footer; raise `footer--padding-top` with it.
 * @cssproperty {pixel} [--c2-card__footer--gap=8px]
 * @cssproperty {justify-content} [--c2-card__footer--justify-content=flex-start]
 *
 * @cssproperty {pixel} --c2-card__media--height
 * @cssproperty {aspect-ratio} --c2-card__media--aspect-ratio
 * @cssproperty {object-fit} [--c2-card__media--object-fit=cover]
 *
 * @cssproperty {border} --c2-card__hover--border-top
 * @cssproperty {border} --c2-card__hover--border-bottom
 * @cssproperty {border} --c2-card__hover--border-right
 * @cssproperty {border} --c2-card__hover--border-left
 * @cssproperty {background} --c2-card__hover--background
 * @cssproperty {box-shadow} --c2-card__hover--box-shadow
 * @cssproperty {transform} --c2-card__hover--transform - e.g. `translateY(-2px)` for a lift.
 *
 * @cssproperty {outline} [--c2-card__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-card__focus--outline-offset=2px]
 *
 * @cssproperty {box-shadow} --c2-card__disabled--box-shadow
 * @cssproperty {opacity} [--c2-card__disabled--opacity=0.38]
 */
@customElement('c2-card')
export class Card extends LitElement {
  static override styles = unsafeCSS(styles)

  constructor() {
    super()
    this.addEventListener(
      'click',
      (event) => {
        if (this.disabled && (this.interactive || this.href)) {
          event.preventDefault()
          event.stopImmediatePropagation()
        }
      },
      true,
    )
  }

  /** Dims the card and ignores pointer and keyboard interaction. A link card renders without its anchor. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Button-like card: focusable, `role="button"`, Enter and Space dispatch `click`, pointer cursor. Implied by `href`. */
  @property({ type: Boolean, reflect: true }) interactive = false

  /** Makes the whole card a link. */
  @property() href: string | undefined = undefined

  /** Browsing context used when `href` is set, such as `_blank`. */
  @property() target: string | undefined = undefined

  /** Link relationship forwarded to the anchor when `href` is set. */
  @property() rel: string | undefined = undefined

  private readonly slotPresence = new SlotPresenceController(this, ['media', 'header', '', 'footer'])

  private handleSlotChange(event: Event) {
    this.slotPresence.handleSlotChange(event)
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.target !== event.currentTarget) return
    // modern-web-ignore: ime-enter only the interactive card itself (target === currentTarget) reaches this line, never a text field inside it
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.click()
    }
  }

  private renderPrimary() {
    return html`
      <div part="media" class="c2-card-media" ?hidden=${!this.slotPresence.has('media')}><slot name="media" @slotchange=${this.handleSlotChange}></slot></div>
      <div part="header" class="c2-card-header" ?hidden=${!this.slotPresence.has('header')}>
        <slot name="header" @slotchange=${this.handleSlotChange}></slot>
      </div>
      <div part="body" class="c2-card-content" ?hidden=${!this.slotPresence.has()}><slot @slotchange=${this.handleSlotChange}></slot></div>
    `
  }

  /**
   * A click on a control inside the link (a button or checkbox in the body) is that control's: the browser would
   * otherwise also follow the link. Calling `preventDefault` would cancel the control's own action too (a checkbox
   * would not toggle), so the link is disarmed instead: an `<a>` without `href` does nothing when the click's
   * activation runs at the end of the dispatch, and the `href` comes back right after.
   */
  private handleLinkClick = (event: MouseEvent) => {
    const link = event.currentTarget as HTMLAnchorElement
    const path = event.composedPath()
    const end = path.indexOf(link)
    const fromControl = path.slice(0, end).some((node) => node instanceof Element && node.matches(INNER_CONTROL))
    if (!fromControl || !link.hasAttribute('href')) return
    const href = link.getAttribute('href')!
    link.removeAttribute('href')
    setTimeout(() => {
      if (!link.hasAttribute('href')) link.setAttribute('href', href)
    })
  }

  override render() {
    const isLink = !!this.href && !this.disabled
    const interactive = this.interactive || !!this.href
    // The link or button covers media, header and body only, so the footer's actions are not nested in it; its
    // stretched `::after` makes the rest of the card clickable, with the footer's content stacked above.
    const primary = isLink
      ? html`<a class="c2-card-primary" href=${this.href!} target=${ifDefined(this.target)} rel=${ifDefined(this.rel)} @click=${this.handleLinkClick}
          >${this.renderPrimary()}</a
        >`
      : html`<div
          class="c2-card-primary"
          role=${interactive ? 'button' : nothing}
          tabindex=${interactive && !this.disabled ? '0' : nothing}
          aria-disabled=${interactive && this.disabled ? 'true' : nothing}
          @keydown=${interactive && !this.disabled ? this.handleKeydown : nothing}
        >
          ${this.renderPrimary()}
        </div>`
    return html`
      <div class=${classMap({ 'c2-card': true, 'is-interactive': interactive })}>
        ${primary}
        <div part="footer" class="c2-card-footer" ?hidden=${!this.slotPresence.has('footer')}>
          <slot name="footer" @slotchange=${this.handleSlotChange}></slot>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-card': Card
  }
}
