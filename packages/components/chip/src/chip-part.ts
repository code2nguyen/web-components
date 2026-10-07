import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './chip-part.scss?inline'

/** Events fired by {@link ChipPart}, keyed for `addEventListener`. */
export interface ChipPartEventMap {
  'part-click': CustomEvent<ChipPartClickDetail>
}

export interface ChipPartClickDetail {
  /** The part's `name`. */
  name: string
}

export interface ChipPart {
  addEventListener: TypedAddEventListener<ChipPart, ChipPartEventMap>
  removeEventListener: TypedRemoveEventListener<ChipPart, ChipPartEventMap>
}

export type ChipPartPopup = '' | 'menu' | 'listbox' | 'dialog' | 'tree' | 'grid'

/**
 * One segment of a `c2-chip`, for chips that read as a sentence: `Status | is any of | Active`. Put two or more in a
 * chip's default slot; the chip draws them side by side with a divider between them. A plain part is text. An
 * `interactive` part is a button that fires `part-click` with its `name`, so each segment can open its own editor;
 * the event bubbles, so one listener on the chip serves every part. Left and Right arrows move between a chip's
 * interactive parts and its remove button.
 *
 * A chip whose parts are interactive is not `selectable`: a toggle cannot contain buttons.
 *
 * @tag c2-chip-part
 *
 * @slot - Text of the part.
 * @slot prefix - Icon, colour dot or avatar shown before the text.
 *
 * @event {CustomEvent<ChipPartClickDetail>} part-click - An interactive part was clicked, or activated with Enter or Space. `detail.name` is the part's `name`; the event target is the part, to anchor a popover on. Bubbles.
 *
 * @csspart part - The `<button>` of an interactive part, or the wrapper of a plain one.
 *
 * @cssproperty {padding} [--c2-chip-part__container--padding-left=8px]
 * @cssproperty {padding} [--c2-chip-part__container--padding-right=8px]
 * @cssproperty {padding} [--c2-chip-part__container__first--padding-left=10px] - Left padding of the first part, matching the chip's own padding.
 * @cssproperty {pixel} [--c2-chip-part__container--gap=6px] - Space between the prefix and the text.
 * @cssproperty {border} [--c2-chip-part__container--border-left=1px solid #e4e4e7] - Divider drawn before every part but the first.
 * @cssproperty {color} [--c2-chip-part__container--color=inherit] - Text colour. Inherits the chip's.
 * @cssproperty {font-weight} [--c2-chip-part__container--font-weight=inherit]
 * @cssproperty {color} [--c2-chip-part__container__hover--background-color=rgba(24, 24, 27, 0.08)] - Background of an interactive part on hover and while its popup is expanded.
 * @cssproperty {outline} [--c2-chip-part__container__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-chip-part__container__focus--outline-offset=-2px] - Negative, so the ring stays inside the pill.
 * @cssproperty {opacity} [--c2-chip-part__container__disabled--opacity=0.38]
 * @cssproperty {pixel} [--c2-chip-part__icon--size=16px] - Size of an SVG in the `prefix` slot.
 */
@customElement('c2-chip-part')
export class ChipPart extends LitElement {
  static override styles = unsafeCSS(styles)

  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  /** Identity of the part, handed back in `part-click`: `field`, `operator`, `value`. */
  @property({ reflect: true }) name = ''

  /** Renders the part as a button that fires `part-click`. */
  @property({ type: Boolean, reflect: true }) interactive = false

  /** Disables an interactive part. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Accessible name of an interactive part when its text alone is unclear, e.g. `Status filter: change operator`. */
  @property() label = ''

  /** Kind of popup an interactive part opens, exposed as `aria-haspopup`. Empty for none. */
  @property() haspopup: ChipPartPopup = ''

  /** Whether the popup an interactive part opens is showing, exposed as `aria-expanded`. Unset for none. */
  @property({ type: Boolean }) expanded: boolean | undefined = undefined

  private readonly slotPresence = new SlotPresenceController(this, ['prefix'])

  private handleClick = () => {
    if (this.disabled) return
    this.dispatchEvent(new CustomEvent<ChipPartClickDetail>('part-click', { bubbles: true, composed: true, detail: { name: this.name } }))
  }

  private renderContent() {
    return html`<span class="prefix" ?hidden=${!this.slotPresence.has('prefix')}
        ><slot name="prefix" @slotchange=${this.slotPresence.handleSlotChange}></slot></span
      ><span class="label"><slot></slot></span>`
  }

  override render() {
    if (!this.interactive) return html`<span class="part" part="part">${this.renderContent()}</span>`
    return html`<button
      class="part"
      part="part"
      type="button"
      aria-label=${this.label || nothing}
      aria-haspopup=${this.haspopup || nothing}
      aria-expanded=${this.haspopup && this.expanded !== undefined ? String(this.expanded) : nothing}
      ?disabled=${this.disabled}
      @click=${this.handleClick}
    >
      ${this.renderContent()}
    </button>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-chip-part': ChipPart
  }
}
