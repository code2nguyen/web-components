import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { consume } from '@lit/context'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import { radioGroupContext, type RadioGroupContext } from './radio-context'
import styles from './radio.scss?inline'

/**
 * A single radio option built on a native `<input type="radio">`, with its label and an optional description beside
 * the control. Put several in a `c2-radio-group` to get a single `value`, arrow-key navigation and a roving tab stop;
 * standalone radios that share a `name` in the same document or shadow root still uncheck each other. Theme the
 * control, the label and the whole row (`container`), which turns a radio into a selectable card. The indicator is
 * not tied to the ring: the `dot` slot swaps the inner mark, and `icon` / `checked-icon` replace the control with
 * any icon per state.
 *
 * @tag c2-radio
 *
 * @slot - Label text. Falls back to the `label` attribute.
 * @slot description - Supporting text shown under the label.
 * @slot dot - Mark inside the ring while checked (an inline SVG, a `c2-feather-*` icon or a `c2-mat-icon`). Replaces the filled dot.
 * @slot icon - Replaces the ring with your own indicator. Shown while unchecked, and while checked too unless `checked-icon` is set.
 * @slot checked-icon - Indicator shown while checked, replacing the ring and dot. Without `icon` the default ring still shows while unchecked.
 *
 * @event {Event} change - Re-dispatched from the inner input when the user checks this radio.
 *
 * @cssproperty {pixel} [--c2-radio__container--gap=4px] - Space between the control and the text.
 * @cssproperty {flex-direction-row} [--c2-radio__container--flex-direction=row] - `row-reverse` puts the indicator after the text, e.g. a trailing check mark.
 * @cssproperty {padding} [--c2-radio__container--padding-top=0px]
 * @cssproperty {padding} [--c2-radio__container--padding-right=0px]
 * @cssproperty {padding} [--c2-radio__container--padding-bottom=0px]
 * @cssproperty {padding} [--c2-radio__container--padding-left=0px]
 * @cssproperty {border} [--c2-radio__container--border=none] - Set a border and padding for a card-style option.
 * @cssproperty {border-radius} [--c2-radio__container--border-radius=8px]
 * @cssproperty {background} --c2-radio__container--background
 * @cssproperty {background} --c2-radio__container__hover--background
 * @cssproperty {border} --c2-radio__container__checked--border
 * @cssproperty {background} --c2-radio__container__checked--background
 *
 * @cssproperty {pixel} [--c2-radio__control--size=18px]
 * @cssproperty {border-radius} [--c2-radio__control--border-radius=999px] - Shape of the ring and its dot; `4px` gives a square control.
 * @cssproperty {border} [--c2-radio__control--border=1px solid #bcbcc6]
 * @cssproperty {color} [--c2-radio__control--background-color=transparent]
 * @cssproperty {border} [--c2-radio__control__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-radio__control__checked--border=1px solid transparent] - Transparent so the fill shows through; set an accent border with a transparent fill for an outlined look.
 * @cssproperty {color} [--c2-radio__control__checked--background-color=#0265dc]
 * @cssproperty {color} [--c2-radio__control__checked__hover--background-color=#0154b8]
 * @cssproperty {outline} [--c2-radio__control__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-radio__control__focus--outline-offset=2px]
 * @cssproperty {opacity} [--c2-radio__control__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-radio__dot--size=8px]
 * @cssproperty {color} [--c2-radio__dot--color=#ffffff] - Fill of the dot, or `currentColor` of a slotted `dot` mark.
 *
 * @cssproperty {pixel} --c2-radio__icon--size - Size of slotted `icon` / `checked-icon` content. Falls back to the control size.
 * @cssproperty {color} [--c2-radio__icon--color=#71717a] - Colour of the slotted indicator while unchecked.
 * @cssproperty {color} [--c2-radio__icon__checked--color=#0265dc] - Colour of the slotted indicator while checked.
 *
 * @cssproperty {pixel} [--c2-radio__state-layer--size=32px] - Touch target around the control; also the hover layer.
 * @cssproperty {border-radius} [--c2-radio__state-layer--border-radius=999px]
 * @cssproperty {color} --c2-radio__state-layer__hover--color - Tint of the hover layer; transparent unless set.
 *
 * @cssproperty {color} [--c2-radio__label--color=inherit]
 * @cssproperty {font-size} [--c2-radio__label--font-size=inherit]
 * @cssproperty {font-weight} [--c2-radio__label--font-weight=inherit]
 * @cssproperty {line-height} [--c2-radio__label--line-height=inherit]
 * @cssproperty {color} --c2-radio__label__checked--color
 * @cssproperty {opacity} [--c2-radio__label__disabled--opacity=0.38]
 *
 * @cssproperty {color} [--c2-radio__description--color=#71717a]
 * @cssproperty {font-size} [--c2-radio__description--font-size=12px]
 * @cssproperty {line-height} [--c2-radio__description--line-height=1.4]
 * @cssproperty {pixel} [--c2-radio__description--margin-top=2px]
 */
@customElement('c2-radio')
export class Radio extends LitElement {
  static override styles = unsafeCSS(styles)

  @query('input') protected formElement!: HTMLInputElement

  /** Whether this option is selected. Checking one radio unchecks the others of its group. */
  @property({ type: Boolean, reflect: true }) checked = false

  /** Disables this option. A disabled `c2-radio-group` disables every radio inside it. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Value reported by the group and by the inner input. Every radio of a group needs one. */
  @property() value = ''

  /** Form field name. Inside a group, the group's `name` wins. */
  @property() name = ''

  /** Label text when the default slot is empty. */
  @property() label = ''

  /** Whether the inner input is in the tab order. The parent group manages this (roving tabindex); do not set by hand. */
  @property({ type: Boolean, attribute: false }) tabbable = true

  @property({ type: String, attribute: 'aria-label' })
  override ariaLabel!: string

  @property({ type: String, attribute: 'aria-describedby' })
  ariaDescribedBy!: undefined | string

  @state() private hasDescription = false
  @state() private hasDot = false
  @state() private hasIcon = false
  @state() private hasCheckedIcon = false

  @consume({ context: radioGroupContext, subscribe: true })
  private group: RadioGroupContext | undefined

  /** Field name in effect: the group's, or this radio's own. */
  get effectiveName(): string {
    return this.group?.name || this.name
  }

  /** Disabled by its own attribute or by the group. */
  get effectiveDisabled(): boolean {
    return this.disabled || !!this.group?.disabled
  }

  override focus(options?: FocusOptions) {
    this.formElement?.focus(options)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.group = undefined
  }

  /** `slotchange` does not fire for server-rendered slots, so read them once after the first render. */
  override firstUpdated() {
    for (const slot of this.renderRoot.querySelectorAll('slot')) this.updateSlot(slot)
  }

  protected override update(changed: PropertyValues<this>) {
    // Keep the native input in sync before render so `:checked` styles and the change handler agree.
    if (changed.has('checked') && this.formElement) this.formElement.checked = this.checked
    super.update(changed)
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('checked') && changed.get('checked') !== undefined && this.isConnected) {
      if (this.group) this.group.checkedChanged(this)
      else if (this.checked) this.uncheckSiblings()
    }
  }

  /** Standalone radios sharing a `name` in the same root behave as one group. */
  private uncheckSiblings() {
    if (!this.name) return
    const root = this.getRootNode() as Document | ShadowRoot
    if (typeof root.querySelectorAll !== 'function') return
    for (const radio of root.querySelectorAll<Radio>('c2-radio')) {
      if (radio !== this && radio.checked && radio.name === this.name && !radio.group) radio.checked = false
    }
  }

  private handleSlotChange(event: Event) {
    this.updateSlot(event.target as HTMLSlotElement)
  }

  private updateSlot(slot: HTMLSlotElement) {
    const filled = slot.assignedNodes({ flatten: true }).some((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== '')
    if (slot.name === 'description') this.hasDescription = filled
    else if (slot.name === 'dot') this.hasDot = filled
    else if (slot.name === 'icon') this.hasIcon = filled
    else if (slot.name === 'checked-icon') this.hasCheckedIcon = filled
  }

  private handleChange(event: Event) {
    this.checked = this.formElement.checked
    redispatchEvent(this, event)
  }

  override render() {
    const disabled = this.effectiveDisabled
    return html`
      <label
        class=${classMap({
          'c2-radio': true,
          'has-description': this.hasDescription,
          'has-dot': this.hasDot,
          'has-icon': this.hasIcon,
          'has-checked-icon': this.hasCheckedIcon,
        })}
      >
        <span class="c2-radio-control">
          <input
            class="c2-radio-input"
            type="radio"
            name=${ifDefined(this.effectiveName || undefined)}
            .value=${this.value}
            tabindex=${this.tabbable ? nothing : '-1'}
            aria-label=${ifDefined(this.ariaLabel)}
            aria-describedby=${ifDefined(this.ariaDescribedBy)}
            ?checked=${this.checked}
            ?disabled=${disabled}
            @change=${this.handleChange}
          />
          <span class="c2-radio__background" part="control">
            <span class="c2-radio__dot" part="dot"><slot name="dot" @slotchange=${this.handleSlotChange}></slot></span>
          </span>
          <span class="c2-radio__icon c2-radio__icon--unchecked" part="icon"><slot name="icon" @slotchange=${this.handleSlotChange}></slot></span>
          <span class="c2-radio__icon c2-radio__icon--checked" part="checked-icon"><slot name="checked-icon" @slotchange=${this.handleSlotChange}></slot></span>
          <span class="c2-radio-state-layer"></span>
        </span>
        <span class="c2-radio-text">
          <span class="c2-radio-label" part="label"><slot>${this.label}</slot></span>
          <span class="c2-radio-description" part="description" ?hidden=${!this.hasDescription}>
            <slot name="description" @slotchange=${this.handleSlotChange}></slot>
          </span>
        </span>
      </label>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-radio': Radio
  }
}
