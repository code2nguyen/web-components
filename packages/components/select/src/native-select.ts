import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { SlotPresenceController, disabledByAncestor, redispatchEvent } from '@c2n/core/dom-helper.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { nativeSelectMessages } from './native-select-messages'
import styles from './native-select.scss?inline'

/** One option of a {@link NativeSelect}. A plain string in `options` stands for `{ value: text, label: text }`. */
export interface NativeSelectOption {
  value: string
  /** The text shown. Defaults to `value`. */
  label?: string
  disabled?: boolean
}

/** A group of options, drawn as an `<optgroup>` with its `label` as the heading. */
export interface NativeSelectGroup {
  label: string
  options: (NativeSelectOption | string)[]
  disabled?: boolean
}

export type NativeSelectItem = NativeSelectOption | NativeSelectGroup | string

/** Events fired by {@link NativeSelect}, keyed for `addEventListener`. */
export interface NativeSelectEventMap {
  input: Event
  change: Event
}

export interface NativeSelect {
  addEventListener: TypedAddEventListener<NativeSelect, NativeSelectEventMap>
  removeEventListener: TypedRemoveEventListener<NativeSelect, NativeSelectEventMap>
}

type Option = Required<NativeSelectOption>
type Group = { label: string; disabled: boolean; options: Option[] }

const toOption = (item: NativeSelectOption | string): Option =>
  typeof item === 'string' ? { value: item, label: item, disabled: false } : { value: item.value, label: item.label ?? item.value, disabled: !!item.disabled }

const isGroup = (item: NativeSelectItem): item is NativeSelectGroup => typeof item === 'object' && Array.isArray((item as NativeSelectGroup).options)

const fromElement = (option: HTMLOptionElement): Option => ({ value: option.value, label: option.label, disabled: option.disabled })

/**
 * A field around the browser's own `<select>`, themed like `c2-text-field`: the phone's own picker, the keyboard and
 * typeahead of the platform, browser autofill where the browser offers it, and no popover code. Use it where the
 * operating system's picker is the better experience (forms on phones, long country lists) or where a page should
 * not load `c2-select`'s listbox. It holds a single value; `c2-select` is the one with search, multiple selection
 * and rich options.
 *
 * The options are written as `<option>` and `<optgroup>` children, as in a native select, or given as `options`
 * (JSON in markup, an array from script): `{ value, label?, disabled? }` objects, plain strings, or groups
 * `{ label, options, disabled? }`. The children win when both are given. They are copied into the select inside the
 * shadow root (a native select can only show options it contains) and followed as they change; nothing is written on
 * them. A `<option selected>` child gives the starting value when the host has no `value` attribute.
 *
 * `placeholder` adds a first, empty option shown in the placeholder colour while nothing is chosen; with `required`
 * it cannot be picked back, and the form is invalid until a real option is chosen. Without a placeholder, a value
 * that matches no option falls back to the first enabled option, as a native select does. While there are no options
 * yet, `value` keeps what was set, so options that load later can still select it.
 *
 * The field turns red after the user has left it invalid (`:user-invalid` on the inner select), while `error` is set
 * and while an enclosing `c2-form-field` shows an error. The host exposes `:state(disabled)`, `:state(error)` and
 * `:state(empty)` (the placeholder shows).
 *
 * @tag c2-native-select
 *
 * @slot prefix-icon - Icon at the start of the field, sized by `--c2-native-select__icon--size`. The select reserves that width plus the gap for it.
 * @slot suffix-icon - Replaces the chevron at the end of the field.
 *
 * @csspart field - The box around the select and its icons: border, background, radius.
 * @csspart select - The native `<select>`; its padding is the text's inset.
 * @csspart prefix-icon - The wrapper of the `prefix-icon` slot.
 * @csspart suffix-icon - The wrapper of the `suffix-icon` slot (the chevron).
 *
 * @event {Event} input - Re-dispatched from the inner select when the user picks an option; `value` is already updated.
 * @event {Event} change - Re-dispatched from the inner select after `input`.
 *
 * @cssproperty {pixel} [--c2-native-select--min-height=36px]
 * @cssproperty {pixel} [--c2-native-select--gap=8px] - Space between the icons and the text.
 * @cssproperty {border-radius} [--c2-native-select--border-radius=6px]
 * @cssproperty {padding} [--c2-native-select--padding-block=6px]
 * @cssproperty {padding} [--c2-native-select--padding-inline-start=12px] - Before the text, or before the prefix icon.
 * @cssproperty {padding} [--c2-native-select--padding-inline-end=10px] - After the chevron.
 * @cssproperty {border} [--c2-native-select--border=1px solid #bcbcc6]
 * @cssproperty {color} [--c2-native-select--color=#18181b] - The text, and the options in browsers that colour the picker.
 * @cssproperty {color} [--c2-native-select--background=#ffffff] - The field, and the options in browsers that colour the picker.
 * @cssproperty {font-size} [--c2-native-select--font-size=14px]
 * @cssproperty {font-weight} --c2-native-select--font-weight
 * @cssproperty {font-family} --c2-native-select--font-family
 * @cssproperty {pixel} [--c2-native-select--line-height=20px]
 *
 * @cssproperty {color} [--c2-native-select__placeholder--color=#71717a]
 *
 * @cssproperty {border} [--c2-native-select__hover--border=1px solid #a1a1aa]
 *
 * @cssproperty {border} [--c2-native-select__focus--border=1px solid #476ef9]
 * @cssproperty {color} --c2-native-select__focus--background
 * @cssproperty {outline} [--c2-native-select__focus--outline=none]
 * @cssproperty {pixel} [--c2-native-select__focus--outline-offset=0px]
 *
 * @cssproperty {border} [--c2-native-select__error--border=1px solid #dc2626]
 * @cssproperty {color} --c2-native-select__error--background
 *
 * @cssproperty {opacity} [--c2-native-select__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-native-select__icon--size=16px] - The prefix icon and the chevron.
 * @cssproperty {color} [--c2-native-select__icon--color=#71717a]
 */
@customElement('c2-native-select')
export class NativeSelect extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, nativeSelectMessages)
  /** Label and description handed down by an enclosing `c2-form-field`. */
  private readonly field = new FieldContextConsumer(this, { kind: 'choice' })
  private readonly slots = new SlotPresenceController(this, ['prefix-icon'])
  /** Server-rendered: the `<option>` children are read after the first update, so hydration matches the server. */
  private readonly serverRendered = this.shadowRoot !== null
  private observer?: MutationObserver
  private customValidityMessage = ''
  private dirty = false
  /** A `selected` child gave the value; it is not taken again. */
  private selectedAdopted = false
  /** The options shown, rebuilt when `options` or the children change. */
  private items: (Option | Group)[] = []
  @state() private disabledByForm = false
  /** The `<option>`/`<optgroup>` children, copied; empty while there are none. */
  @state() private childItems: (Option | Group)[] = []
  /** Text of whatever labels the host (`aria-labelledby`, a `<label for>`). */
  @state() private labelText = ''

  /** The chosen option's value. Written to the form under `name`. */
  @property() value = ''

  /** Form field name. */
  @property({ reflect: true }) name = ''

  /** The options, when they are not written as `<option>` children. See the class description for the shape. */
  @property({ converter: jsonPropertyConverter }) options: NativeSelectItem[] = []

  /** Text of a first, empty option shown while nothing is chosen. */
  @property() placeholder = ''

  /** A value must be chosen; with a `placeholder`, the placeholder can no longer be picked. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Dims the field and ignores interaction. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Shows the error look and marks the select invalid for assistive technology. */
  @property({ type: Boolean, reflect: true }) error = false

  /** `autocomplete` hint forwarded to the select, e.g. `country` or `bday-month`. */
  @property() autocomplete = ''

  /** Accessible name forwarded to the select. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Mirrors the host's `aria-labelledby` (a `c2-label[for]` sets it), so the select is named by that label's text. */
  @property({ attribute: 'aria-labelledby' }) ariaLabelledByAttr: string | null = null

  @query('select') private readonly select?: HTMLSelectElement | null

  /** The containing form, when this control is associated with one. */
  get form() {
    return this.internals.form
  }

  /** Labels associated with this form control. */
  get labels() {
    return this.internals.labels
  }

  get validity() {
    return this.internals.validity
  }

  get validationMessage() {
    return this.internals.validationMessage
  }

  get willValidate() {
    return this.internals.willValidate
  }

  /** Index of the chosen option in the inner select (the placeholder counts), or -1. */
  get selectedIndex(): number {
    return this.select?.selectedIndex ?? -1
  }

  checkValidity() {
    return this.internals.checkValidity()
  }

  reportValidity() {
    return this.internals.reportValidity()
  }

  /** Sets or clears a custom validation error. */
  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.syncFormState()
  }

  formResetCallback() {
    this.dirty = false
    this.value = this.getAttribute('value') ?? this.selectedChildValue() ?? ''
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabledByAncestor(this, disabled)
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  override connectedCallback() {
    super.connectedCallback()
    this.addEventListener('click', this.handleHostActivation)
    // A label may upgrade after this element does, so read it again once the current task has drained.
    queueMicrotask(() => this.isConnected && this.syncLabelText())
    if (isServer) return
    this.observer ??= new MutationObserver(() => this.readChildren())
    this.observer.observe(this, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value', 'label', 'disabled'] })
    if (!this.serverRendered || this.hasUpdated) this.readChildren()
  }

  override disconnectedCallback() {
    this.observer?.disconnect()
    this.removeEventListener('click', this.handleHostActivation)
    super.disconnectedCallback()
  }

  protected override firstUpdated() {
    if (this.serverRendered) this.readChildren()
  }

  /** WebKit associates form labels but does not focus a form-associated custom element when its label activates it. */
  private handleHostActivation = (event: MouseEvent): void => {
    if (event.composedPath()[0] === this && !this.effectiveDisabled) this.select?.focus()
  }

  private selectedChildValue(): string | undefined {
    return this.querySelector<HTMLOptionElement>(':scope > option[selected], :scope > optgroup > option[selected]')?.value
  }

  /**
   * Copies the `<option>`/`<optgroup>` children. While no value was given (no attribute, nothing set or picked), a
   * `selected` child gives the starting value, once, whenever it arrives.
   */
  private readChildren() {
    const items: (Option | Group)[] = []
    for (const child of this.children) {
      if (child instanceof HTMLOptionElement) items.push(fromElement(child))
      else if (child instanceof HTMLOptGroupElement) {
        items.push({ label: child.label, disabled: child.disabled, options: [...child.querySelectorAll('option')].map(fromElement) })
      }
    }
    // A slotted icon or an attribute that changes nothing visible must not re-render a long list.
    if (JSON.stringify(items) !== JSON.stringify(this.childItems)) this.childItems = items
    if (!this.selectedAdopted && !this.dirty && this.value === '' && !this.hasAttribute('value')) {
      const selected = this.selectedChildValue()
      if (selected !== undefined) {
        this.selectedAdopted = true
        this.value = selected
      }
    }
  }

  /** The options shown: the children when there are any, else `options`. */
  private computeItems(): (Option | Group)[] {
    if (this.childItems.length) return this.childItems
    return (Array.isArray(this.options) ? this.options : []).map((item) =>
      isGroup(item) ? { label: item.label, disabled: !!item.disabled, options: item.options.map(toOption) } : toOption(item),
    )
  }

  private get flatOptions(): Option[] {
    return this.items.flatMap((item) =>
      'options' in item ? item.options.map((option) => ({ ...option, disabled: option.disabled || item.disabled })) : [item],
    )
  }

  /** What a native select shows for `value`: the matching option, else the placeholder, else the first enabled option. */
  private resolveValue(value: string): string {
    const options = this.flatOptions
    if (!options.length || options.some((option) => option.value === value)) return value
    if (this.placeholder) return ''
    return options.find((option) => !option.disabled)?.value ?? value
  }

  private syncLabelText(): void {
    const root = this.getRootNode() as Document | ShadowRoot
    const ids = (this.ariaLabelledByAttr ?? '').split(/\s+/).filter(Boolean)
    const fromIds = ids.map((id) => root.getElementById?.(id)?.textContent?.trim()).filter(Boolean)
    const labels = [...(this.internals.labels ?? [])].map((label) => label.textContent?.trim()).filter(Boolean)
    this.labelText = (fromIds.length ? fromIds : labels).join(' ')
  }

  private handlePick(event: Event) {
    this.dirty = true
    this.value = (event.target as HTMLSelectElement).value
    redispatchEvent(this, event)
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  protected override willUpdate(changed: PropertyValues) {
    if (changed.has('ariaLabelledByAttr') && !isServer) this.syncLabelText()
    if (changed.has('options') || changed.has('childItems')) this.items = this.computeItems()
    if (changed.has('value') || changed.has('options') || changed.has('childItems') || changed.has('placeholder')) {
      this.value = this.resolveValue(this.value)
    }
  }

  protected override updated() {
    // After the options are rendered: a `.value` binding on the select would run before its children update.
    if (this.select && this.select.value !== this.value) this.select.value = this.value
    for (const [name, on] of Object.entries(this.states)) {
      if (on) this.internals.states.add(name)
      else this.internals.states.delete(name)
    }
    this.syncFormState()
  }

  private syncFormState() {
    const select = this.select
    // `value`: what the select shows once options exist, and the kept value while they have not arrived.
    this.internals.setFormValue(this.value)
    if (this.effectiveDisabled) {
      this.internals.setValidity({})
      return
    }
    if (!select) {
      // Before the first render: a custom error already counts.
      this.internals.setValidity(this.customValidityMessage ? { customError: true } : {}, this.customValidityMessage)
      return
    }
    select.setCustomValidity(this.customValidityMessage)
    const { validity } = select
    const message = validity.valueMissing && !validity.customError ? this.msg.t('valueMissing') : select.validationMessage
    this.internals.setValidity(validity, message, select)
  }

  private get states() {
    return {
      disabled: this.effectiveDisabled,
      error: !this.effectiveDisabled && (this.error || this.field.invalid),
      empty: !!this.placeholder && this.value === '',
    }
  }

  private renderOption(option: Option) {
    return html`<option value=${option.value} ?disabled=${option.disabled}>${option.label}</option>`
  }

  override render() {
    const states = this.states
    const prefix = this.slots.has('prefix-icon')
    return html`<div class="field ${classMap(states)}" part="field">
        <span class="icon prefix" part="prefix-icon" ?hidden=${!prefix}><slot name="prefix-icon" @slotchange=${this.slots.handleSlotChange}></slot></span>
        <select
          class="select"
          part="select"
          aria-label=${this.ariaLabel || this.labelText || this.field.label || nothing}
          aria-describedby=${this.field.describedBy()}
          aria-invalid=${states.error ? 'true' : nothing}
          autocomplete=${ifDefined(this.autocomplete || undefined)}
          ?disabled=${this.effectiveDisabled}
          ?required=${this.required}
          @input=${this.handlePick}
          @change=${(event: Event) => redispatchEvent(this, event)}
        >
          ${this.placeholder ? html`<option class="placeholder" value="" ?disabled=${this.required}>${this.placeholder}</option>` : nothing}
          ${this.items.map((item) =>
            'options' in item
              ? html`<optgroup label=${item.label} ?disabled=${item.disabled}>${item.options.map((option) => this.renderOption(option))}</optgroup>`
              : this.renderOption(item),
          )}
        </select>
        <span class="icon suffix" part="suffix-icon">
          <slot name="suffix-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </slot>
        </span>
      </div>
      ${this.field.renderDescription()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-native-select': NativeSelect
  }
}
