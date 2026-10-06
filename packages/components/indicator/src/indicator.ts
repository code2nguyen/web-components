import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import styles from './indicator.scss?inline'

export type IndicatorTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
export type IndicatorPosition = 'top-start' | 'top-center' | 'top-end' | 'middle-start' | 'middle-end' | 'bottom-start' | 'bottom-center' | 'bottom-end'

/**
 * Wraps any element and pins a solid dot or count to one of its edges: unread messages on an inbox button, presence on
 * an avatar, a "new" marker on a tab. The wrapped element goes in the default slot and keeps its own semantics; the
 * indicator is drawn over it at one of eight `position`s, written in logical terms (`top-end` is the top-right corner
 * in a left-to-right page and the top-left one in a right-to-left page).
 *
 * With no `count` and nothing in the `label` slot the indicator is a dot. A `count` is clamped at `max` (`99+`) and a
 * count of `0` hides the indicator unless `show-zero` is set; `invisible` hides it with a short scale-out, for a
 * notification that has been read. Because a bare number next to a button means little to a screen reader, give
 * `accessible-label` a phrase such as `{count} unread messages`: it replaces the visible text in the accessibility tree.
 *
 * Compared with the `anchor` slot of `c2-badge`, which pins a tinted label to one of four corners, `c2-indicator` wraps
 * its target, draws a solid marker, adds the centre and middle positions, follows the writing direction and names its
 * count for assistive technology. For a round target such as an avatar, set both offsets to `14.6%` to move the
 * indicator onto the circle.
 *
 * @tag c2-indicator
 *
 * @slot - The element the indicator is pinned to.
 * @slot label - Custom indicator content, such as an icon or a short word. Ignored while `count` is set.
 *
 * @csspart indicator - The dot or count drawn over the wrapped element.
 *
 * @cssproperty {pixel} [--c2-indicator--height=18px] - Height of a count or label indicator.
 * @cssproperty {pixel} [--c2-indicator--min-width=18px] - Keeps single digits round.
 * @cssproperty {padding} [--c2-indicator--padding-left=5px]
 * @cssproperty {padding} [--c2-indicator--padding-right=5px]
 * @cssproperty {border-radius} [--c2-indicator--border-radius=999px]
 * @cssproperty {border} [--c2-indicator--border=2px solid #ffffff] - Ring separating the indicator from the wrapped element, in the page background colour. Drawn outside a dot.
 * @cssproperty {box-shadow} --c2-indicator--box-shadow
 * @cssproperty {background} --c2-indicator--background - Overrides the tone background.
 * @cssproperty {color} --c2-indicator--color - Overrides the tone text colour.
 * @cssproperty {number} [--c2-indicator--z-index=1] - Stacking order of the indicator over the wrapped element.
 *
 * @cssproperty {font-family} [--c2-indicator--font-family=inherit]
 * @cssproperty {font-size} [--c2-indicator--font-size=12px]
 * @cssproperty {font-weight} [--c2-indicator--font-weight=600]
 * @cssproperty {line-height} [--c2-indicator--line-height=1]
 *
 * @cssproperty {pixel} [--c2-indicator--offset-x=0px] - Moves the indicator inwards from the inline edge it is pinned to. `14.6%` puts it on the edge of a round target.
 * @cssproperty {pixel} [--c2-indicator--offset-y=0px] - Moves the indicator inwards from the block edge it is pinned to. `14.6%` puts it on the edge of a round target.
 *
 * @cssproperty {background} [--c2-indicator__neutral--background=#71717a]
 * @cssproperty {color} [--c2-indicator__neutral--color=#ffffff]
 * @cssproperty {background} [--c2-indicator__primary--background=#0265dc]
 * @cssproperty {color} [--c2-indicator__primary--color=#ffffff]
 * @cssproperty {background} [--c2-indicator__success--background=#16a34a]
 * @cssproperty {color} [--c2-indicator__success--color=#ffffff]
 * @cssproperty {background} [--c2-indicator__warning--background=#f59e0b]
 * @cssproperty {color} [--c2-indicator__warning--color=#18181b]
 * @cssproperty {background} [--c2-indicator__danger--background=#dc2626]
 * @cssproperty {color} [--c2-indicator__danger--color=#ffffff]
 * @cssproperty {background} [--c2-indicator__info--background=#0284c7]
 * @cssproperty {color} [--c2-indicator__info--color=#ffffff]
 *
 * @cssproperty {pixel} [--c2-indicator__dot--size=10px] - Diameter of the dot, not counting the ring.
 * @cssproperty {pixel} [--c2-indicator__icon--size=12px] - Size of an `<svg>` icon in the `label` slot.
 * @cssproperty {time} [--c2-indicator__pulse--animation-duration=1.5s] - Length of one `pulse` cycle; respects reduced motion.
 * @cssproperty {time} [--c2-indicator--transition-duration=150ms] - Scale-in and scale-out when the indicator appears or hides; respects reduced motion.
 */
@customElement('c2-indicator')
export class Indicator extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Colour role of the indicator. */
  @property({ reflect: true }) tone: IndicatorTone = 'danger'

  /** Edge or corner of the wrapped element the indicator is pinned to, in logical terms (`end` follows the writing direction). */
  @property({ reflect: true }) position: IndicatorPosition = 'top-end'

  /** Number to display. Without it, and with nothing in the `label` slot, the indicator is a dot. */
  @property({ type: Number }) count: number | undefined = undefined

  /** Upper bound for `count`; larger values render as `<max>+`. */
  @property({ type: Number }) max = 99

  /** Keeps a `count` of `0` visible. */
  @property({ type: Boolean, reflect: true, attribute: 'show-zero' }) showZero = false

  /** Hides the indicator, for example once its notifications have been read. */
  @property({ type: Boolean, reflect: true }) invisible = false

  /** Animates a fading ring around the indicator to draw attention, such as a live or processing state. */
  @property({ type: Boolean, reflect: true }) pulse = false

  /**
   * Text announced in place of the visible indicator, such as `{count} unread messages`; `{count}` is replaced by the
   * displayed count. Without it the visible text, if any, is exposed as is and a dot is not announced.
   */
  @property({ attribute: 'accessible-label' }) accessibleLabel = ''

  private readonly slotPresence = new SlotPresenceController(this, ['label'])

  /** Whether `count` holds a number the indicator can display: finite and not negative. */
  private get validCount(): boolean {
    return this.count !== undefined && Number.isFinite(this.count) && this.count >= 0
  }

  /** Text shown for `count`, clamped at `max`. Empty without a valid count. */
  get displayCount(): string {
    if (!this.validCount) return ''
    const count = this.count as number
    return count > this.max ? `${this.max}+` : String(count)
  }

  /** Whether the indicator is currently shown. A negative or non-numeric `count` hides it, as `0` does without `show-zero`. */
  get shown(): boolean {
    if (this.invisible) return false
    if (this.count === undefined) return true
    if (!this.validCount) return false
    return this.count !== 0 || this.showZero
  }

  private get hasCount(): boolean {
    return this.displayCount !== ''
  }

  // Only known label content turns the dot into a pill: on the server the slot is `unknown`, and a dot is the common case.
  private get isDot(): boolean {
    return !this.hasCount && this.slotPresence.state('label') !== 'present'
  }

  override render() {
    const shown = this.shown
    const label = shown && this.accessibleLabel ? this.accessibleLabel.split('{count}').join(this.displayCount) : ''
    const classes = classMap({
      'c2-indicator': true,
      'is-dot': this.isDot,
      'is-pulse': this.pulse && shown,
      'is-hidden': !shown,
    })
    return html`
      <slot></slot>
      <span class=${classes} part="indicator" aria-hidden=${label || !shown ? 'true' : nothing}>
        ${this.displayCount}<slot name="label" ?hidden=${this.hasCount} @slotchange=${this.slotPresence.handleSlotChange}></slot>
      </span>
      ${label ? html`<span class="visually-hidden">${label}</span>` : nothing}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-indicator': Indicator
  }
}
