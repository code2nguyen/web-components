import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { fieldsetMessages } from './messages'
import styles from './fieldset.scss?inline'

type Disableable = HTMLElement & { disabled: boolean }

const NATIVE_CONTROLS = new Set(['button', 'input', 'select', 'textarea', 'fieldset', 'output'])

/**
 * A control the fieldset can disable: a native form control, or a custom element with a writable `disabled` property.
 * A wrapper that only reports its control's state (`c2-form-field` has a `disabled` getter) is not one; the fieldset
 * looks inside it instead.
 */
function isControl(element: Element): element is Disableable {
  if (NATIVE_CONTROLS.has(element.localName)) return true
  if (!element.localName.includes('-')) return false
  for (let proto: object | null = element; proto; proto = Object.getPrototypeOf(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'disabled')
    if (descriptor) return 'value' in descriptor ? descriptor.writable === true : descriptor.set !== undefined
  }
  return false
}

/**
 * Groups related controls under a legend, like a native `<fieldset>`: a set of radios or checkboxes, an address, the
 * parts of a date. The legend names the group for assistive technology (the group is a native `fieldset` in the shadow
 * root, so the slotted controls sit inside it in the accessibility tree), and the description and error describe it.
 *
 * `disabled` disables every control inside the group, as a native disabled fieldset does: each native control and
 * each custom element with a `disabled` property gets `disabled = true` (a nested control's own children are left to
 * it), so the controls also leave the form's data. Turning it off re-enables only the controls the fieldset disabled.
 * Because that sets a property on the controls, a server-rendered page should render a disabled group with its
 * controls already disabled.
 *
 * Layout is CSS: `--c2-fieldset__content--direction: row` lays the controls out in a row (wrapping), and the box
 * (border, radius, padding, background) is all custom properties; set `--c2-fieldset--border: none` and
 * `--c2-fieldset--padding: 0` for a bare group.
 *
 * The host exposes custom states: `:state(disabled)`, `:state(invalid)` (an error is shown) and `:state(required)`.
 *
 * @tag c2-fieldset
 *
 * @slot - The grouped controls.
 * @slot legend - Rich legend content; replaces `legend`.
 * @slot legend-action - A link or button at the end of the legend row, e.g. "Same as billing".
 * @slot description - Rich description content shown under the legend; replaces `description`.
 * @slot error - Rich error content; replaces `error-text`. Shown while it holds content.
 *
 * @cssproperty {grid-column} [--c2-fieldset--grid-column=1 / -1] - The group spans every column of a `c2-form` grid by default.
 * @cssproperty {border} [--c2-fieldset--border=1px solid #e4e4e7]
 * @cssproperty {pixel} [--c2-fieldset--border-radius=8px]
 * @cssproperty {pixel} [--c2-fieldset--padding=16px]
 * @cssproperty {color} [--c2-fieldset--background-color=transparent]
 * @cssproperty {border} [--c2-fieldset__invalid--border=1px solid #dc2626] - The box border while an error is shown.
 *
 * @cssproperty {pixel} [--c2-fieldset__header--gap=2px] - Space between the legend, the description and the error.
 * @cssproperty {pixel} [--c2-fieldset__header--margin-bottom=12px] - Space between the header and the controls.
 * @cssproperty {color} [--c2-fieldset__legend--color=#18181b]
 * @cssproperty {font-size} [--c2-fieldset__legend--font-size=14px]
 * @cssproperty {font-weight} [--c2-fieldset__legend--font-weight=600]
 * @cssproperty {line-height} [--c2-fieldset__legend--line-height=20px]
 * @cssproperty {color} [--c2-fieldset__required-indicator--color=#dc2626]
 * @cssproperty {color} [--c2-fieldset__legend-action--color=#0265dc]
 * @cssproperty {font-size} [--c2-fieldset__legend-action--font-size=12px]
 * @cssproperty {color} [--c2-fieldset__description--color=#71717a]
 * @cssproperty {font-size} [--c2-fieldset__description--font-size=12px]
 * @cssproperty {line-height} [--c2-fieldset__description--line-height=16px]
 * @cssproperty {color} [--c2-fieldset__error--color=#dc2626]
 * @cssproperty {font-size} [--c2-fieldset__error--font-size=12px]
 * @cssproperty {pixel} [--c2-fieldset__icon--size=14px] - The error icon.
 * @cssproperty {color} [--c2-fieldset__icon-glyph--color=#ffffff] - The exclamation mark inside the icon.
 * @cssproperty {opacity} [--c2-fieldset__header__disabled--opacity=0.38] - The legend and description while the group is disabled.
 *
 * @cssproperty {flex-direction} [--c2-fieldset__content--direction=column] - `row` lays the controls out side by side, wrapping.
 * @cssproperty {pixel} [--c2-fieldset__content--gap=12px] - Space between the controls.
 * @cssproperty {align-items} [--c2-fieldset__content--align-items=stretch] - `flex-start` keeps each control at its own width.
 *
 * @csspart fieldset - The group box.
 * @csspart header - The legend, description and error.
 * @csspart legend - The legend text.
 * @csspart description - The description line.
 * @csspart error - The error line.
 * @csspart content - The wrapper around the grouped controls.
 */
@customElement('c2-fieldset')
export class Fieldset extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, fieldsetMessages)
  private readonly slots = new SlotPresenceController(this, ['legend', 'legend-action', 'description', 'error'])

  /** Plain-text legend, the group's accessible name. The `legend` slot wins. */
  @property({ type: String }) legend = ''

  /** Plain-text description shown under the legend. The `description` slot wins. */
  @property({ type: String }) description = ''

  /** An error for the group as a whole, e.g. "Choose at least one topic." The `error` slot wins. */
  @property({ attribute: 'error-text' }) errorText = ''

  /** Marks the legend with an asterisk (and "required" for screen readers). State `required` on the controls too. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Disables every control inside the group. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Controls this fieldset disabled, so enabling it again leaves the ones disabled by the author alone. */
  private readonly disabledByFieldset = new Set<Disableable>()
  private observer: MutationObserver | undefined

  /** The controls inside the group, in document order; nested controls' own children are not included. */
  get elements(): HTMLElement[] {
    return this.controls()
  }

  private controls(): Disableable[] {
    const found: Disableable[] = []
    const visit = (parent: Element) => {
      for (const child of parent.children) {
        if (isControl(child)) found.push(child)
        else visit(child)
      }
    }
    visit(this)
    return found
  }

  /** True while an error is shown. */
  get invalid(): boolean {
    return !!this.errorText || this.slots.has('error')
  }

  override connectedCallback() {
    super.connectedCallback()
    if (isServer) return
    this.observer ??= new MutationObserver(() => this.syncDisabled())
    this.observer.observe(this, { childList: true, subtree: true })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.observer?.disconnect()
  }

  protected override updated(changed: PropertyValues<this>) {
    if (changed.has('disabled')) this.syncDisabled()
    this.toggleState('disabled', this.disabled)
    this.toggleState('required', this.required)
    this.toggleState('invalid', this.invalid)
  }

  private toggleState(name: string, on: boolean) {
    if (on) this.internals.states.add(name)
    else this.internals.states.delete(name)
  }

  private syncDisabled() {
    if (this.disabled) {
      for (const control of this.controls()) {
        if (control.localName.includes('-') && !customElements.get(control.localName)) {
          customElements.whenDefined(control.localName).then(() => this.syncDisabled())
          continue
        }
        if (control.disabled || this.disabledByFieldset.has(control)) continue
        control.disabled = true
        this.disabledByFieldset.add(control)
      }
    } else {
      for (const control of this.disabledByFieldset) control.disabled = false
      this.disabledByFieldset.clear()
    }
  }

  private handleSlotChange = () => this.requestUpdate()

  private renderIcon() {
    return html`<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="8" fill="currentColor"></circle>
      <rect class="glyph" x="7.1" y="3.5" width="1.8" height="5.6" rx="0.9"></rect>
      <circle class="glyph" cx="8" cy="11.6" r="1.1"></circle>
    </svg>`
  }

  override render() {
    const hasLegend = !!this.legend || this.slots.has('legend')
    const hasAction = this.slots.has('legend-action')
    const hasDescription = !!this.description || this.slots.has('description')
    const invalid = this.invalid
    const describedBy = [hasDescription ? 'description' : '', invalid ? 'error' : ''].filter(Boolean).join(' ')
    return html`<fieldset part="fieldset" class=${invalid ? 'invalid' : ''} ?disabled=${this.disabled} aria-describedby=${describedBy || nothing}>
      <legend class="legend-row" ?hidden=${!hasLegend && !hasAction}>
        <span class="legend" part="legend"
          ><slot name="legend" @slotchange=${this.handleSlotChange}>${this.legend}</slot>${
            this.required && hasLegend
              ? html`<span class="required" aria-hidden="true">*</span><span class="visually-hidden">${this.msg.t('required')}</span>`
              : nothing
          }</span
        >
        <span class="legend-action" ?hidden=${!hasAction}><slot name="legend-action" @slotchange=${this.handleSlotChange}></slot></span>
      </legend>
      <div class="header" part="header" ?hidden=${!hasLegend && !hasAction && !hasDescription && !invalid}>
        <div id="description" class="description" part="description" ?hidden=${!hasDescription}>
          <slot name="description" @slotchange=${this.handleSlotChange}>${this.description}</slot>
        </div>
        <div class="error-region" aria-live="polite">
          <div id="error" class="error" part="error" ?hidden=${!invalid}>
            ${this.renderIcon()}<span class="visually-hidden">${this.msg.t('errorPrefix')}</span>
            <span><slot name="error" @slotchange=${this.handleSlotChange}>${this.errorText}</slot></span>
          </div>
        </div>
      </div>
      <div class="content" part="content"><slot></slot></div>
    </fieldset>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-fieldset': Fieldset
  }
}
