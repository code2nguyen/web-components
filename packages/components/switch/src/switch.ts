import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import styles from './switch.scss?inline'

/**
 * On/off toggle built on a native `<input type="checkbox" role="switch">`, so keyboard activation (Space), form value
 * and the `switch` role come from the browser. The thumb can also be dragged: it follows the pointer and the side it is
 * released on decides the state. The whole row is the label: text in the default slot and an optional `description`
 * sit beside the track, and clicking them toggles it. Icons for either state can ride inside the thumb.
 *
 * @tag c2-switch
 *
 * @slot - Label text. Falls back to the `label` attribute.
 * @slot description - Supporting text shown under the label.
 * @slot checked-icon - Small icon shown inside the thumb while on (an inline SVG, a `c2-feather-*` icon or a `c2-mat-icon`).
 * @slot unchecked-icon - Small icon shown inside the thumb while off.
 *
 * @event {Event} change - Re-dispatched from the inner input when the state changes.
 *
 * @cssproperty {pixel} [--c2-switch__container--gap=8px] - Space between the track and the text.
 * @cssproperty {flex-direction-row} [--c2-switch__container--flex-direction=row] - `row-reverse` puts the text before the track.
 * @cssproperty {justify-content} [--c2-switch__container--justify-content=flex-start] - `space-between` with a fixed width pushes the track to the far edge.
 * @cssproperty {opacity} [--c2-switch__container__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-switch__track--width=36px]
 * @cssproperty {pixel} [--c2-switch__track--height=20px]
 * @cssproperty {border-radius} [--c2-switch__track--border-radius=999px]
 * @cssproperty {border} [--c2-switch__track--border=1px solid transparent] - Set a colour for an outlined switch.
 * @cssproperty {color} [--c2-switch__track--color=#e4e4e7] - Track fill while off.
 * @cssproperty {color} [--c2-switch__track__hover--color=#d4d4d8]
 * @cssproperty {color} [--c2-switch__track__checked--color=#0265dc] - Track fill while on.
 * @cssproperty {color} [--c2-switch__track__checked__hover--color=#0154b8]
 * @cssproperty {border} --c2-switch__track__checked--border
 * @cssproperty {outline} [--c2-switch__track__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-switch__track__focus--outline-offset=2px]
 *
 * @cssproperty {pixel} [--c2-switch__thumb--size=16px]
 * @cssproperty {pixel} [--c2-switch__thumb--offset=2px] - Gap between the thumb and the track edge.
 * @cssproperty {border-radius} [--c2-switch__thumb--border-radius=999px]
 * @cssproperty {color} [--c2-switch__thumb--color=#ffffff]
 * @cssproperty {color} --c2-switch__thumb__checked--color - Thumb fill while on; falls back to the off colour.
 * @cssproperty {box-shadow} [--c2-switch__thumb--box-shadow=0 1px 2px rgba(0, 0, 0, 0.2)]
 * @cssproperty {pixel} [--c2-switch__thumb__active--stretch=4px] - Extra thumb width while pressed, for a squishy feel; `0px` disables it.
 *
 * @cssproperty {pixel} [--c2-switch__icon--size=10px]
 * @cssproperty {color} [--c2-switch__icon--color=#71717a] - Colour of the `unchecked-icon`.
 * @cssproperty {color} [--c2-switch__icon__checked--color=#0265dc] - Colour of the `checked-icon`.
 *
 * @cssproperty {color} [--c2-switch__label--color=inherit]
 * @cssproperty {font-size} [--c2-switch__label--font-size=inherit]
 * @cssproperty {font-weight} [--c2-switch__label--font-weight=inherit]
 * @cssproperty {line-height} [--c2-switch__label--line-height=inherit]
 * @cssproperty {color} [--c2-switch__description--color=#71717a]
 * @cssproperty {font-size} [--c2-switch__description--font-size=12px]
 * @cssproperty {pixel} [--c2-switch__description--margin-top=2px]
 *
 * @cssproperty {time} [--c2-switch--transition-duration=200ms] - Thumb slide and colour change.
 */
@customElement('c2-switch')
export class Switch extends LitElement {
  static override styles = unsafeCSS(styles)

  @query('input') protected formElement!: HTMLInputElement
  @query('.c2-switch-track') private trackElement!: HTMLElement
  @query('.c2-switch-thumb') private thumbElement!: HTMLElement

  /** Whether the switch is on. */
  @property({ type: Boolean, reflect: true }) checked = false

  /** Disables the control: it no longer toggles and is rendered dimmed. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Form field name forwarded to the inner input. */
  @property() name = ''

  /** Form value submitted while on. Defaults to `on`, like a native checkbox. */
  @property() value = 'on'

  /** Label text when the default slot is empty. */
  @property() label = ''

  @property({ type: String, attribute: 'aria-label' })
  override ariaLabel!: string

  @property({ type: String, attribute: 'aria-labelledby' })
  ariaLabelledBy!: undefined | string

  @property({ type: String, attribute: 'aria-describedby' })
  ariaDescribedBy!: undefined | string

  @state() private hasDescription = false
  /** True while the thumb follows the pointer; disables the slide transition. */
  @state() private dragging = false

  private drag?: { pointerId: number; startX: number; startPosition: number; travel: number; position: number; moved: boolean }
  /** The click that follows a drag must not toggle the input again. */
  private suppressClick = false

  override focus(options?: FocusOptions) {
    this.formElement?.focus(options)
  }

  /** Flips the state (or forces it) and fires `change`, as a click would. */
  toggle(force?: boolean) {
    if (this.disabled) return
    const next = force ?? !this.checked
    if (next === this.checked) return
    this.checked = next
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  /** `slotchange` does not fire for server-rendered slots, so read the description once after the first render. */
  override firstUpdated() {
    const slot = this.renderRoot.querySelector<HTMLSlotElement>('slot[name="description"]')
    if (slot) this.updateDescription(slot)
  }

  protected override update(changed: PropertyValues<this>) {
    if (changed.has('checked') && this.formElement) this.formElement.checked = this.checked
    super.update(changed)
  }

  private handleDescriptionChange(event: Event) {
    this.updateDescription(event.target as HTMLSlotElement)
  }

  private updateDescription(slot: HTMLSlotElement) {
    this.hasDescription = slot.assignedNodes({ flatten: true }).some((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== '')
  }

  private handleChange(event: Event) {
    this.checked = this.formElement.checked
    redispatchEvent(this, event)
  }

  private get rtl(): boolean {
    return getComputedStyle(this).direction === 'rtl'
  }

  private handlePointerDown(event: PointerEvent) {
    if (this.disabled || event.button !== 0) return
    const track = this.trackElement
    const padding = parseFloat(getComputedStyle(track).paddingLeft) || 0
    // The thumb is square; its height is not affected by the press stretch, unlike its width.
    const travel = Math.max(0, track.clientWidth - 2 * padding - this.thumbElement.getBoundingClientRect().height)
    const startPosition = this.checked ? travel : 0
    this.drag = { pointerId: event.pointerId, startX: event.clientX, startPosition, travel, position: startPosition, moved: false }
    this.formElement.setPointerCapture(event.pointerId)
  }

  private handlePointerMove(event: PointerEvent) {
    const drag = this.drag
    if (!drag || event.pointerId !== drag.pointerId) return
    const rtl = this.rtl
    const delta = (event.clientX - drag.startX) * (rtl ? -1 : 1)
    // A few pixels of tolerance keep a plain press a click.
    if (!drag.moved && Math.abs(delta) < 4) return
    drag.moved = true
    drag.position = Math.min(drag.travel, Math.max(0, drag.startPosition + delta))
    this.dragging = true
    this.thumbElement.style.setProperty('--_drag', `${rtl ? -drag.position : drag.position}px`)
  }

  private handlePointerUp(event: PointerEvent) {
    const drag = this.drag
    if (!drag || event.pointerId !== drag.pointerId) return
    this.drag = undefined
    if (!drag.moved) return
    this.endDrag()
    // Swallow the click the browser fires after the pointer sequence, then settle on the side the thumb was released.
    this.suppressClick = true
    const next = drag.position > drag.travel / 2
    if (next !== this.checked) {
      this.checked = next
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    }
  }

  private handlePointerCancel(event: PointerEvent) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return
    this.drag = undefined
    this.endDrag()
  }

  private endDrag() {
    this.dragging = false
    this.thumbElement.style.removeProperty('--_drag')
  }

  private handleClick(event: Event) {
    if (!this.suppressClick) return
    this.suppressClick = false
    event.preventDefault()
  }

  override render() {
    return html`
      <label class=${classMap({ 'c2-switch': true, 'has-description': this.hasDescription, 'is-dragging': this.dragging })}>
        <span class="c2-switch-control" part="control">
          <input
            class="c2-switch-input"
            type="checkbox"
            role="switch"
            name=${ifDefined(this.name || undefined)}
            .value=${this.value}
            aria-label=${ifDefined(this.ariaLabel)}
            aria-labelledby=${ifDefined(this.ariaLabelledBy)}
            aria-describedby=${ifDefined(this.ariaDescribedBy)}
            ?checked=${this.checked}
            ?disabled=${this.disabled}
            @change=${this.handleChange}
            @click=${this.handleClick}
            @pointerdown=${this.handlePointerDown}
            @pointermove=${this.handlePointerMove}
            @pointerup=${this.handlePointerUp}
            @pointercancel=${this.handlePointerCancel}
          />
          <span class="c2-switch-track" part="track">
            <span class="c2-switch-thumb" part="thumb">
              <span class="c2-switch-icon c2-switch-icon--unchecked" part="unchecked-icon"><slot name="unchecked-icon"></slot></span>
              <span class="c2-switch-icon c2-switch-icon--checked" part="checked-icon"><slot name="checked-icon"></slot></span>
            </span>
          </span>
        </span>
        <span class="c2-switch-text">
          <span class="c2-switch-label" part="label"><slot>${this.label}</slot></span>
          <span class="c2-switch-description" part="description" ?hidden=${!this.hasDescription}>
            <slot name="description" @slotchange=${this.handleDescriptionChange}></slot>
          </span>
        </span>
      </label>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-switch': Switch
  }
}
