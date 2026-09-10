import { LitElement, html, isServer, nothing, unsafeCSS } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import styles from './badge.scss?inline'

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
export type BadgePlacement = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
export type BadgeOverlap = 'rectangular' | 'circular'

/**
 * Small status label: a tinted pill with text, a number or an icon, or a plain dot. Six `tone`s carry meaning
 * (neutral, primary, success, warning, danger, info); each is a pair of CSS variables so a design system can recolour
 * them without touching the markup. Give it a `count` to show a number clamped at `max` (`99+`), or `dot` for a
 * presence indicator that can `pulse`. Put an element in the `anchor` slot and the badge pins itself to one of its
 * corners (`placement`), for example a notification count on an icon button; `overlap="circular"` moves it onto the
 * edge of a round anchor such as an avatar.
 *
 * @tag c2-badge
 *
 * @slot - Label text. Ignored while `count` or `dot` is set.
 * @slot prefix-icon - Icon shown before the text, sized by `--c2-badge__icon--size`.
 * @slot anchor - Element the badge is pinned to. When filled the badge becomes an overlay at the `placement` corner.
 *
 * @cssproperty {pixel} [--c2-badge--height=20px]
 * @cssproperty {pixel} [--c2-badge--min-width=20px] - Keeps single digits round.
 * @cssproperty {padding} [--c2-badge--padding-left=6px]
 * @cssproperty {padding} [--c2-badge--padding-right=6px]
 * @cssproperty {pixel} [--c2-badge--gap=4px] - Space between the icon and the text.
 * @cssproperty {border-radius} [--c2-badge--border-radius=999px]
 * @cssproperty {border} [--c2-badge--border=none] - Set a border for an outlined look, together with a transparent background.
 * @cssproperty {box-shadow} --c2-badge--box-shadow
 * @cssproperty {background} --c2-badge--background - Overrides the tone background.
 * @cssproperty {color} --c2-badge--color - Overrides the tone text colour.
 *
 * @cssproperty {font-family} [--c2-badge--font-family=inherit]
 * @cssproperty {font-size} [--c2-badge--font-size=12px]
 * @cssproperty {font-weight} [--c2-badge--font-weight=500]
 * @cssproperty {line-height} [--c2-badge--line-height=1]
 * @cssproperty {pixel} --c2-badge--letter-spacing
 * @cssproperty {text-transform} [--c2-badge--text-transform=none]
 *
 * @cssproperty {pixel} [--c2-badge__icon--size=12px]
 *
 * @cssproperty {background} [--c2-badge__neutral--background=#f4f4f5]
 * @cssproperty {color} [--c2-badge__neutral--color=#52525b]
 * @cssproperty {background} [--c2-badge__primary--background=#edf1fe]
 * @cssproperty {color} [--c2-badge__primary--color=#0265dc]
 * @cssproperty {background} [--c2-badge__success--background=#dcfce7]
 * @cssproperty {color} [--c2-badge__success--color=#166534]
 * @cssproperty {background} [--c2-badge__warning--background=#fef3c7]
 * @cssproperty {color} [--c2-badge__warning--color=#92400e]
 * @cssproperty {background} [--c2-badge__danger--background=#fee2e2]
 * @cssproperty {color} [--c2-badge__danger--color=#dc2626]
 * @cssproperty {background} [--c2-badge__info--background=#e0f2fe]
 * @cssproperty {color} [--c2-badge__info--color=#075985]
 *
 * @cssproperty {pixel} [--c2-badge__dot--size=8px] - Diameter of the `dot` badge; its colour is the tone text colour.
 * @cssproperty {time} [--c2-badge__pulse--animation-duration=1.5s] - Length of one `pulse` cycle; respects reduced motion.
 *
 * @cssproperty {border} [--c2-badge__anchor--border=2px solid #ffffff] - Ring around an anchored badge, in the page background colour. Drawn outside a `dot`.
 * @cssproperty {pixel} [--c2-badge__anchor--offset-x=0px] - Moves an anchored badge inwards horizontally (`14.6%` with `overlap="circular"`).
 * @cssproperty {pixel} [--c2-badge__anchor--offset-y=0px] - Moves an anchored badge inwards vertically (`14.6%` with `overlap="circular"`).
 */
@customElement('c2-badge')
export class Badge extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Colour role of the badge. */
  @property({ reflect: true }) tone: BadgeTone = 'neutral'

  /** Number to display instead of the slotted text. Hidden when it is `0` unless `show-zero` is set. */
  @property({ type: Number }) count: number | undefined = undefined

  /** Upper bound for `count`; larger values render as `<max>+`. */
  @property({ type: Number }) max = 99

  /** Keeps a `count` of `0` visible. */
  @property({ type: Boolean, reflect: true, attribute: 'show-zero' }) showZero = false

  /** Renders a small dot without text. */
  @property({ type: Boolean, reflect: true }) dot = false

  /** Animates a fading ring around a `dot` badge to draw attention. */
  @property({ type: Boolean, reflect: true }) pulse = false

  /** Corner of the `anchor` element the badge is pinned to. */
  @property({ reflect: true }) placement: BadgePlacement = 'top-right'

  /** Shape of the anchor: `circular` pulls the badge onto the edge of a round anchor instead of its bounding-box corner. */
  @property({ reflect: true }) overlap: BadgeOverlap = 'rectangular'

  @state() private hasAnchor = false

  /** Read the anchor before the first render so a server-rendered badge hydrates in its final position. */
  override connectedCallback() {
    super.connectedCallback()
    if (!isServer) this.hasAnchor = this.querySelector(':scope > [slot="anchor"]') !== null
  }

  /** `slotchange` does not fire for server-rendered slots, so read the anchor once after the first render. */
  override firstUpdated() {
    const slot = this.renderRoot.querySelector<HTMLSlotElement>('slot[name="anchor"]')
    if (slot) this.updateAnchor(slot)
  }

  private handleAnchorChange(event: Event) {
    this.updateAnchor(event.target as HTMLSlotElement)
  }

  private updateAnchor(slot: HTMLSlotElement) {
    this.hasAnchor = slot.assignedElements({ flatten: true }).length > 0
  }

  /** Text shown for `count`, clamped at `max`. */
  get displayCount(): string {
    if (this.count === undefined) return ''
    return this.count > this.max ? `${this.max}+` : String(this.count)
  }

  private get visible(): boolean {
    if (this.dot) return true
    return this.count === undefined || this.count !== 0 || this.showZero
  }

  private renderBadge() {
    if (!this.visible) return nothing
    const classes = classMap({
      'c2-badge': true,
      'is-dot': this.dot,
      'is-pulse': this.dot && this.pulse,
      'is-anchored': this.hasAnchor,
    })
    if (this.dot) return html`<span class=${classes} part="badge"></span>`
    return html`
      <span class=${classes} part="badge">
        <slot name="prefix-icon"></slot>
        ${this.count !== undefined ? this.displayCount : html`<slot></slot>`}
      </span>
    `
  }

  override render() {
    return html`<slot name="anchor" @slotchange=${this.handleAnchorChange}></slot>${this.renderBadge()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-badge': Badge
  }
}
