import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import styles from './status-light.scss?inline'

export type StatusLightTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger'

/**
 * A coloured dot followed by a short label, for the state of something: a deployment that is Building or Live, a
 * service that is Degraded, an invoice that is Overdue. The label goes in the default slot and carries the meaning, so
 * the colour is never the only signal; `tone` picks the colour and `pulse` adds a soft ring for a state in progress.
 *
 * With an empty label the element is a bare dot. Give it an `accessible-label` then: the host becomes an image named by
 * that text in the accessibility tree. The same attribute on a labelled light replaces the visible text, for a short
 * label such as `P1` that needs a longer reading.
 *
 * Size, spacing and shape are CSS variables, not attributes. Set `--c2-status-light--background`, the paddings and
 * the radius for a pill, `--c2-status-light__dot--clip-path` for a shape-coded dot, or put an icon in the `dot` slot;
 * an icon drawn with `currentColor` takes the tone colour.
 *
 * Compared with `c2-indicator`, which pins a dot or count to the edge of another element, `c2-status-light` sits inline
 * with its own label; compared with `c2-badge`, it is text with a mark, not a filled tag.
 *
 * @tag c2-status-light
 *
 * @slot - The status label, such as `Live` or `Failed`. Leave it empty for a bare dot and set `accessible-label`.
 * @slot dot - Replaces the dot with an icon or any other mark. An `<svg>` is sized by `--c2-status-light__icon--size` and coloured with the tone through `currentColor`.
 *
 * @csspart dot - The coloured dot, drawn while the `dot` slot is empty.
 * @csspart label - The wrapper of the default slot.
 *
 * @cssproperty {pixel} [--c2-status-light--gap=8px] - Space between the dot and the label.
 * @cssproperty {padding} [--c2-status-light--padding-top=0px]
 * @cssproperty {padding} [--c2-status-light--padding-right=0px]
 * @cssproperty {padding} [--c2-status-light--padding-bottom=0px]
 * @cssproperty {padding} [--c2-status-light--padding-left=0px]
 * @cssproperty {background} --c2-status-light--background - Background of the whole light, for a pill. None by default.
 * @cssproperty {border} --c2-status-light--border - Border of the whole light. None by default.
 * @cssproperty {border-radius} [--c2-status-light--border-radius=999px] - Corner radius, visible once a background or border is set.
 *
 * @cssproperty {color} [--c2-status-light--color=#18181b] - Label text colour.
 * @cssproperty {font-family} [--c2-status-light--font-family=inherit]
 * @cssproperty {font-size} [--c2-status-light--font-size=14px]
 * @cssproperty {font-weight} [--c2-status-light--font-weight=inherit]
 * @cssproperty {line-height} [--c2-status-light--line-height=20px]
 *
 * @cssproperty {pixel} [--c2-status-light__dot--size=8px] - Diameter of the dot.
 * @cssproperty {border-radius} [--c2-status-light__dot--border-radius=999px] - `2px` gives a square dot.
 * @cssproperty {clip-path} [--c2-status-light__dot--clip-path=none] - Cuts the dot to a shape, such as `polygon(50% 0, 100% 100%, 0 100%)` for a triangle.
 * @cssproperty {box-shadow} --c2-status-light__dot--box-shadow - An inset shadow with a transparent background draws a ring.
 * @cssproperty {background} --c2-status-light__dot--background - Overrides the tone colour of the dot and a slotted icon. The pulse ring keeps the tone colour, so a transparent ring-style dot still pulses.
 * @cssproperty {pixel} [--c2-status-light__icon--size=14px] - Size of an `<svg>` in the `dot` slot.
 *
 * @cssproperty {background} [--c2-status-light__dot__neutral--background=#71717a]
 * @cssproperty {background} [--c2-status-light__dot__primary--background=#0265dc]
 * @cssproperty {background} [--c2-status-light__dot__info--background=#0284c7]
 * @cssproperty {background} [--c2-status-light__dot__success--background=#16a34a]
 * @cssproperty {background} [--c2-status-light__dot__warning--background=#f59e0b]
 * @cssproperty {background} [--c2-status-light__dot__danger--background=#dc2626]
 *
 * @cssproperty {time} [--c2-status-light__pulse--animation-duration=1.5s] - Length of one `pulse` cycle; the ring is stilled under reduced motion.
 */
@customElement('c2-status-light')
export class StatusLight extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Colour role of the dot. */
  @property({ reflect: true }) tone: StatusLightTone = 'neutral'

  /**
   * Animates a fading ring around the dot, or around an icon in the `dot` slot, for a state in progress such as Building
   * or an open incident. The ring is a circle in the tone colour whatever the dot's shape.
   */
  @property({ type: Boolean, reflect: true }) pulse = false

  /**
   * Text read in place of the light, which is then exposed as an image. Required for a bare dot; on a labelled light it
   * replaces the visible label.
   */
  @property({ attribute: 'accessible-label' }) accessibleLabel = ''

  private readonly internals = this.attachInternals()

  private readonly slotPresence = new SlotPresenceController(this, [''])

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('accessibleLabel')) {
      this.internals.role = this.accessibleLabel ? 'img' : null
      this.internals.ariaLabel = this.accessibleLabel || null
    }
  }

  override render() {
    const classes = classMap({
      'c2-status-light': true,
      // On the server the label slot is `unknown`; the stylesheet's `:host(:empty)` covers a bare dot until then.
      'is-bare': this.slotPresence.state('') === 'empty',
    })
    return html`
      <span class=${classes}>
        <span class="mark" aria-hidden="true">
          ${this.pulse ? html`<span class="pulse"></span>` : nothing}
          <span class="icon"
            ><slot name="dot"><span class="dot" part="dot"></span></slot
          ></span>
        </span>
        <span class="label" part="label"><slot @slotchange=${this.slotPresence.handleSlotChange}></slot></span>
      </span>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-status-light': StatusLight
  }
}
