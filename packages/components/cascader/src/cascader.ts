import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import type { Overlay } from '@c2n/overlay'
import styles from './cascader.scss?inline'

import '@c2n/overlay'

/** One node in a cascader hierarchy. */
export interface CascaderOption {
  value: string
  label: string
  disabled?: boolean
  children?: CascaderOption[]
  data?: unknown
}

export interface CascaderItemContext {
  option: CascaderOption
  level: number
  active: boolean
  selected: boolean
}

/** Returns custom content for an option row while the cascader keeps interaction and accessibility. */
export type CascaderItemRenderer = (context: CascaderItemContext) => unknown

export interface CascaderChangeEventDetail {
  value: string[]
  labels: string[]
  options: CascaderOption[]
  complete: boolean
}

/** Events fired by {@link Cascader}, keyed for `addEventListener`. */
export interface CascaderEventMap {
  'cascader-change': CustomEvent<CascaderChangeEventDetail>
  'open-change': CustomEvent<{ open: boolean }>
  input: Event
  change: Event
}

export interface Cascader {
  addEventListener: TypedAddEventListener<Cascader, CascaderEventMap>
  removeEventListener: TypedRemoveEventListener<Cascader, CascaderEventMap>
}

/**
 * Hierarchical single-value picker that opens every active level in one floating panel. Supply nested `options`, then
 * read the selected value path from `value`. Branches open another column; choosing a leaf commits the path.
 *
 * @tag c2-cascader
 *
 * @slot prefix-icon - Icon shown before the selected path or placeholder.
 * @slot suffix-icon - Replaces the trigger chevron.
 * @slot empty - Replaces the message shown when `options` is empty.
 *
 * @event {CustomEvent<CascaderChangeEventDetail>} cascader-change - Fired when a leaf, or a branch with `change-on-select`, is committed. Detail contains value, label and option paths plus whether the last option is a leaf.
 * @event {CustomEvent<{ open: boolean }>} open-change - Fired when the floating panel opens or closes.
 * @event {Event} input - Fired after `value` changes through user interaction.
 * @event {Event} change - Fired after `value` changes through user interaction.
 *
 * @cssproperty {pixel} [--c2-cascader__trigger--min-height=36px]
 * @cssproperty {pixel} [--c2-cascader__trigger--width=220px]
 * @cssproperty {padding} [--c2-cascader__trigger--padding=6px 10px 6px 12px]
 * @cssproperty {pixel} [--c2-cascader__trigger--gap=8px]
 * @cssproperty {color} [--c2-cascader__trigger--background=#ffffff]
 * @cssproperty {color} [--c2-cascader__trigger--color=#18181b]
 * @cssproperty {font-size} [--c2-cascader__trigger--font-size=14px]
 * @cssproperty {border} [--c2-cascader__trigger--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-cascader__trigger--border-radius=6px]
 * @cssproperty {border} [--c2-cascader__trigger__hover--border=1px solid #a1a1aa]
 * @cssproperty {color} [--c2-cascader__trigger__hover--background=#fafafa]
 * @cssproperty {border} [--c2-cascader__trigger__open--border=1px solid rgb(2, 101, 220)]
 * @cssproperty {outline} [--c2-cascader__trigger__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-cascader__trigger__focus--outline-offset=0px]
 * @cssproperty {opacity} [--c2-cascader__trigger__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-cascader__placeholder--color=#71717a]
 * @cssproperty {pixel} [--c2-cascader__icon--size=16px]
 * @cssproperty {color} [--c2-cascader__icon--color=#71717a]
 * @cssproperty {color} [--c2-cascader__panel--background=#ffffff]
 * @cssproperty {border} [--c2-cascader__panel--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-cascader__panel--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-cascader__panel--box-shadow=0 12px 32px rgba(24, 24, 27, 0.14)]
 * @cssproperty {pixel} [--c2-cascader__panel--max-width=720px]
 * @cssproperty {pixel} [--c2-cascader__column--min-width=150px]
 * @cssproperty {pixel} [--c2-cascader__column--max-width=240px]
 * @cssproperty {pixel} [--c2-cascader__column--max-height=280px]
 * @cssproperty {padding} [--c2-cascader__column--padding=4px]
 * @cssproperty {border} [--c2-cascader__column--border=1px solid #e4e4e7]
 * @cssproperty {pixel} [--c2-cascader__option--min-height=36px]
 * @cssproperty {padding} [--c2-cascader__option--padding=8px 10px]
 * @cssproperty {pixel} [--c2-cascader__option--gap=8px]
 * @cssproperty {border-radius} [--c2-cascader__option--border-radius=6px]
 * @cssproperty {color} [--c2-cascader__option--color=#18181b]
 * @cssproperty {font-size} [--c2-cascader__option--font-size=14px]
 * @cssproperty {color} [--c2-cascader__option__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-cascader__option__active--background=#e8f2ff]
 * @cssproperty {color} [--c2-cascader__option__active--color=#18181b]
 * @cssproperty {color} [--c2-cascader__option__selected--color=rgb(2, 101, 220)]
 * @cssproperty {opacity} [--c2-cascader__option__disabled--opacity=0.38]
 * @cssproperty {padding} [--c2-cascader__empty--padding=18px]
 * @cssproperty {color} [--c2-cascader__empty--color=#71717a]
 *
 * @internalcomponent c2-overlay
 */
@customElement('c2-cascader')
export class Cascader extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)
  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  private readonly internals = this.attachInternals()
  private defaultValue: string[] = []
  private defaultValueCaptured = false
  private customValidityMessage = ''
  @state() private disabledByForm = false
  @state() private activePath: CascaderOption[] = []

  /** Nested hierarchy shown in the floating panel. In markup this is a JSON array. */
  @property({ converter: jsonPropertyConverter }) options: CascaderOption[] = []

  /** Selected value path. In markup, separate levels with semicolons. */
  @property({ converter: arrayPropertyConverter, reflect: true }) value: string[] = []

  /** Name used when the cascader participates in a form. */
  @property({ type: String }) name = ''

  /** Text shown before a path is selected. */
  @property({ type: String }) placeholder = 'Please select'

  /** String placed between selected labels in the trigger. */
  @property({ type: String }) separator = ' / '

  /** Accessible name forwarded to the trigger and option tree. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Whether the floating panel is open. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Disables opening, selection and form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Displays the selected path without allowing changes. */
  @property({ type: Boolean, reflect: true }) readonly = false

  /** Requires a committed path for native form validation. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Commit branch values as they are chosen instead of waiting for a leaf. */
  @property({ type: Boolean, attribute: 'change-on-select' }) changeOnSelect = false

  /** Open child columns on pointer hover instead of click. */
  @property({ attribute: 'expand-trigger', reflect: true }) expandTrigger: 'click' | 'hover' = 'click'

  /** Replaces an option row's content while interaction and hierarchy controls remain owned by the cascader. */
  @property({ attribute: false }) itemRenderer: CascaderItemRenderer | undefined

  @query('#trigger', true) public trigger!: HTMLButtonElement
  @query('#panel-overlay', true) public panel!: Overlay

  /** The resolved option path for the current `value`. Invalid trailing values are omitted. */
  get selectedOptions(): CascaderOption[] {
    return this.resolvePath(this.value)
  }

  /** Human-readable selected path. */
  get displayValue(): string {
    return this.selectedOptions.map((option) => option.label).join(this.separator)
  }

  get form() {
    return this.internals.form
  }

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

  override connectedCallback(): void {
    super.connectedCallback()
    if (!this.defaultValueCaptured) {
      this.defaultValue = arrayPropertyConverter.fromAttribute(this.getAttribute('value') ?? '')
      this.defaultValueCaptured = true
    }
  }

  formResetCallback(): void {
    this.value = [...this.defaultValue]
  }

  formDisabledCallback(disabled: boolean): void {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
    if (typeof state === 'string') this.value = arrayPropertyConverter.fromAttribute(state)
  }

  checkValidity(): boolean {
    return this.internals.checkValidity()
  }

  reportValidity(): boolean {
    return this.internals.reportValidity()
  }

  setCustomValidity(message: string): void {
    this.customValidityMessage = message
    this.syncFormState()
  }

  /** Opens, closes or toggles the floating panel. */
  toggle(force?: boolean): void {
    if (this.readonly || this.effectiveDisabled) {
      if (this.panel?.matches(':popover-open')) this.panel.hidePopover()
      return
    }
    const next = force ?? !this.panel.matches(':popover-open')
    if (next && !this.panel.matches(':popover-open')) this.panel.showPopover()
    if (!next && this.panel.matches(':popover-open')) this.panel.hidePopover()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('value') && typeof this.value === 'string') this.value = arrayPropertyConverter.fromAttribute(this.value)
    if (changed.has('options') && !Array.isArray(this.options)) this.options = []
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('open') || changed.has('disabled') || changed.has('readonly')) this.toggle(this.open)
    if (changed.has('value') || changed.has('required') || changed.has('disabled') || changed.has('name')) this.syncFormState()
  }

  private get effectiveDisabled(): boolean {
    return this.disabled || this.disabledByForm
  }

  private resolvePath(values: string[]): CascaderOption[] {
    const path: CascaderOption[] = []
    let options = this.options
    for (const value of values) {
      const option = options.find((candidate) => candidate.value === value)
      if (!option) break
      path.push(option)
      options = option.children ?? []
    }
    return path
  }

  private get columns(): CascaderOption[][] {
    const columns = [this.options]
    for (const option of this.activePath) {
      if (!option.children?.length) break
      columns.push(option.children)
    }
    return columns
  }

  private handleOverlayToggle(event: Event): void {
    const open = (event as ToggleEvent).newState === 'open'
    this.open = open
    if (open) this.activePath = this.selectedOptions
    this.dispatchEvent(new CustomEvent('open-change', { detail: { open }, bubbles: true, composed: true }))
  }

  private handleTriggerKeydown(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return
    event.preventDefault()
    this.toggle(true)
    void this.focusOption(0, event.key === 'ArrowUp' ? -1 : 0)
  }

  private optionPath(level: number, option: CascaderOption): CascaderOption[] {
    return [...this.activePath.slice(0, level), option]
  }

  private activateOption(level: number, option: CascaderOption, commitBranch: boolean): void {
    if (option.disabled) return
    const path = this.optionPath(level, option)
    this.activePath = path
    const complete = !option.children?.length
    if (complete || commitBranch) this.commit(path, complete)
    if (complete) this.toggle(false)
  }

  private handleOptionClick(level: number, option: CascaderOption): void {
    this.activateOption(level, option, this.changeOnSelect)
    if (option.children?.length) void this.focusOption(level + 1, 0)
  }

  private handleOptionPointerEnter(level: number, option: CascaderOption): void {
    if (this.expandTrigger !== 'hover' || option.disabled || !option.children?.length) return
    this.activePath = this.optionPath(level, option)
  }

  private commit(path: CascaderOption[], complete: boolean): void {
    this.value = path.map((option) => option.value)
    const detail: CascaderChangeEventDetail = {
      value: [...this.value],
      labels: path.map((option) => option.label),
      options: [...path],
      complete,
    }
    this.dispatchEvent(new CustomEvent('cascader-change', { detail, bubbles: true, composed: true }))
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  private async focusOption(level: number, index: number): Promise<void> {
    await this.updateComplete
    const options = [...this.renderRoot.querySelectorAll<HTMLElement>(`[data-level="${level}"]`)].filter(
      (option) => option.getAttribute('aria-disabled') !== 'true',
    )
    if (!options.length) return
    const resolvedIndex = index < 0 ? options.length - 1 : Math.min(index, options.length - 1)
    options[resolvedIndex]?.focus()
  }

  private handleOptionKeydown(event: KeyboardEvent, level: number, option: CascaderOption): void {
    const enabled = this.columns[level].filter((item) => !item.disabled)
    const enabledIndex = enabled.indexOf(option)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = (enabledIndex + direction + enabled.length) % enabled.length
      void this.focusOption(level, nextIndex)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      void this.focusOption(level, event.key === 'Home' ? 0 : -1)
    } else if (event.key === 'ArrowRight' && option.children?.length) {
      event.preventDefault()
      this.activateOption(level, option, false)
      void this.focusOption(level + 1, 0)
    } else if (event.key === 'ArrowLeft' && level > 0) {
      event.preventDefault()
      const parentOptions = this.columns[level - 1].filter((item) => !item.disabled)
      void this.focusOption(level - 1, parentOptions.indexOf(this.activePath[level - 1]))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.handleOptionClick(level, option)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.toggle(false)
      this.trigger.focus()
    }
  }

  private syncFormState(): void {
    const serialized = this.value.join(';')
    this.internals.setFormValue(this.effectiveDisabled ? null : serialized || null, serialized)
    const missing = this.required && this.value.length === 0
    const flags = this.customValidityMessage ? { customError: true } : missing ? { valueMissing: true } : {}
    const message = this.customValidityMessage || (missing ? 'Please select an option.' : '')
    this.internals.setValidity(flags, message, this.trigger)
  }

  private renderChevron(): unknown {
    return svg`<svg class="trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>`
  }

  private renderOption(option: CascaderOption, level: number): unknown {
    const active = this.activePath[level]?.value === option.value
    const selected = this.value[level] === option.value
    const hasChildren = Boolean(option.children?.length)
    return html`
      <button
        type="button"
        role="treeitem"
        class=${classMap({ option: true, 'option--active': active, 'option--selected': selected })}
        data-level=${level}
        aria-level=${level + 1}
        aria-expanded=${hasChildren ? String(active) : nothing}
        aria-selected=${selected ? 'true' : 'false'}
        aria-disabled=${option.disabled ? 'true' : 'false'}
        ?disabled=${option.disabled}
        @click=${() => this.handleOptionClick(level, option)}
        @pointerenter=${() => this.handleOptionPointerEnter(level, option)}
        @keydown=${(event: KeyboardEvent) => this.handleOptionKeydown(event, level, option)}
      >
        <span class="option-content">${this.itemRenderer?.({ option, level, active, selected }) ?? option.label}</span>
        ${
          hasChildren
            ? svg`<svg class="option-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>`
            : selected
              ? svg`<svg class="option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>`
              : nothing
        }
      </button>
    `
  }

  override render() {
    const displayValue = this.displayValue
    return html`
      <button
        id="trigger"
        class="trigger"
        type="button"
        aria-label=${this.ariaLabel || nothing}
        aria-haspopup="tree"
        aria-expanded=${this.open ? 'true' : 'false'}
        popovertarget=${this.readonly || this.effectiveDisabled ? nothing : 'panel-overlay'}
        ?disabled=${this.effectiveDisabled}
        @keydown=${this.handleTriggerKeydown}
      >
        <slot name="prefix-icon"></slot>
        <span class=${classMap({ value: true, placeholder: !displayValue })}>${displayValue || this.placeholder}</span>
        <slot name="suffix-icon">${this.renderChevron()}</slot>
      </button>
      <c2-overlay id="panel-overlay" popover free-width @toggle=${this.handleOverlayToggle}>
        <div class="panel" role="tree" aria-label=${this.ariaLabel || 'Cascader options'}>
          ${
            this.options.length
              ? this.columns.map(
                  (column, level) => html`
                    <div class="column" role="group" aria-label=${`Level ${level + 1}`}>${column.map((option) => this.renderOption(option, level))}</div>
                  `,
                )
              : html`<div class="empty" role="status"><slot name="empty">No options available.</slot></div>`
          }
        </div>
      </c2-overlay>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-cascader': Cascader
  }
}
