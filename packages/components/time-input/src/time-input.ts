import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { redispatchEvent, SlotPresenceController } from '@c2n/core/dom-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import type { Overlay } from '@c2n/overlay'
import styles from './time-input.scss?inline'

import '@c2n/overlay'

type Column = 'hour' | 'minute' | 'second' | 'period'

interface TimeParts {
  hour: number
  minute: number
  second: number
}

interface ColumnOption {
  value: number
  label: string
  disabled: boolean
}

const DAY = 24 * 60 * 60

function parseTime(value: string): TimeParts | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(value)
  if (!match) return null
  return { hour: Number(match[1]), minute: Number(match[2]), second: Number(match[3] ?? 0) }
}

function toSeconds({ hour, minute, second }: TimeParts) {
  return hour * 3600 + minute * 60 + second
}

function fromSeconds(total: number): TimeParts {
  const t = ((total % DAY) + DAY) % DAY
  return { hour: Math.floor(t / 3600), minute: Math.floor((t % 3600) / 60), second: t % 60 }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The value in `times` closest to `target`; `times` must not be empty. */
function nearest(times: number[], target: number) {
  return times.reduce((best, t) => (Math.abs(t - target) < Math.abs(best - target) ? t : best))
}

/** Values a column offers for a step in seconds: the step's share of that unit when it divides it evenly, else 1. */
function unitStep(stepSeconds: number, unit: number, span: number) {
  return stepSeconds >= unit && stepSeconds % unit === 0 && (span * unit) % stepSeconds === 0 ? stepSeconds / unit : 1
}

/** Events fired by {@link TimeInput}, keyed for `addEventListener`. */
export interface TimeInputEventMap {
  input: InputEvent
  change: Event
}

export interface TimeInput {
  addEventListener: TypedAddEventListener<TimeInput, TimeInputEventMap>
  removeEventListener: TypedRemoveEventListener<TimeInput, TimeInputEventMap>
}

/**
 * A form-associated time-of-day field backed by a native `<input type="time">`. Values, `min` and `max` are 24-hour
 * strings (`HH:mm`, or `HH:mm:ss` when `step` is below 60 seconds); the browser displays them in the user's locale
 * (12- or 24-hour), and keyboard editing stays native. The clock button (or Alt+ArrowDown in the field) opens the
 * component's own picker in a `c2-overlay` popover: a large readout of the chosen time over scroll-snapping hour,
 * minute, second (when `step` is below 60) and AM/PM (on 12-hour locales) columns. The columns follow `step`, and
 * times outside `min`/`max` are dimmed and cannot be picked.
 *
 * @tag c2-time-input
 *
 * @slot clock-icon - Replaces the clock icon at the end of the field.
 * @slot supporting-text - Rich helper content below the field. `help` and `error-text` are plain-text shortcuts.
 *
 * @event {InputEvent} input - Re-dispatched from the inner time input whenever the value changes.
 * @event {Event} change - Re-dispatched from the inner time input when the value is committed.
 *
 * @cssproperty {pixel} [--c2-time-input--min-height=36px]
 * @cssproperty {pixel} [--c2-time-input--gap=8px]
 * @cssproperty {padding} [--c2-time-input--padding=6px 8px 6px 12px]
 * @cssproperty {border} [--c2-time-input--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-time-input--border-radius=6px]
 * @cssproperty {color} [--c2-time-input--color=#18181b]
 * @cssproperty {color} [--c2-time-input--background=#ffffff]
 * @cssproperty {font-size} [--c2-time-input--font-size=14px]
 * @cssproperty {font-family} [--c2-time-input--font-family=inherit]
 * @cssproperty {pixel} [--c2-time-input--line-height=20px]
 * @cssproperty {border} [--c2-time-input__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-time-input__focus--border=1px solid #0265dc]
 * @cssproperty {outline} [--c2-time-input__focus--outline=none]
 * @cssproperty {pixel} [--c2-time-input__focus--outline-offset=0px]
 * @cssproperty {border} [--c2-time-input__error--border=1px solid #dc2626]
 * @cssproperty {outline} [--c2-time-input__error__focus--outline=none]
 * @cssproperty {color} [--c2-time-input__read-only--background=#fafafa]
 * @cssproperty {opacity} [--c2-time-input__disabled--opacity=0.38]
 * @cssproperty {pixel} [--c2-time-input__clock-icon--size=18px]
 * @cssproperty {color} [--c2-time-input__clock-icon--color=#71717a]
 * @cssproperty {color} [--c2-time-input__clock-icon__hover--color=#18181b]
 * @cssproperty {pixel} [--c2-time-input__supporting-text--gap=4px]
 * @cssproperty {font-size} [--c2-time-input__supporting-text--font-size=12px]
 * @cssproperty {pixel} [--c2-time-input__supporting-text--line-height=16px]
 * @cssproperty {color} [--c2-time-input__supporting-text--color=#71717a]
 * @cssproperty {color} [--c2-time-input__supporting-text__error--color=#dc2626]
 * @cssproperty {color} [--c2-time-input__picker--background=#ffffff]
 * @cssproperty {border} [--c2-time-input__picker--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-time-input__picker--border-radius=8px]
 * @cssproperty {shadow} [--c2-time-input__picker--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {padding} [--c2-time-input__picker--padding=10px 6px 6px]
 * @cssproperty {color} [--c2-time-input__picker--color=#18181b]
 * @cssproperty {font-size} [--c2-time-input__picker-readout--font-size=20px]
 * @cssproperty {font-weight} [--c2-time-input__picker-readout--font-weight=600]
 * @cssproperty {color} [--c2-time-input__picker-readout--color=#18181b]
 * @cssproperty {color} [--c2-time-input__picker-readout__empty--color=#a1a1aa]
 * @cssproperty {color} [--c2-time-input__picker-readout-period--color=#71717a]
 * @cssproperty {pixel} [--c2-time-input__picker-column--width=38px]
 * @cssproperty {number} [--c2-time-input__picker-column--visible-rows=5]
 * @cssproperty {pixel} [--c2-time-input__picker-option--height=28px]
 * @cssproperty {font-size} [--c2-time-input__picker-option--font-size=13px]
 * @cssproperty {color} [--c2-time-input__picker-option--color=#71717a]
 * @cssproperty {color} [--c2-time-input__picker-option__hover--color=#18181b]
 * @cssproperty {color} [--c2-time-input__picker-option__selected--color=#0265dc]
 * @cssproperty {font-weight} [--c2-time-input__picker-option__selected--font-weight=600]
 * @cssproperty {number} [--c2-time-input__picker-option__selected--scale=1.15]
 * @cssproperty {opacity} [--c2-time-input__picker-option__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-time-input__picker-separator--color=#d4d4d8]
 * @cssproperty {border} [--c2-time-input__picker-divider--border=1px solid #e4e4e7]
 * @cssproperty {font-size} [--c2-time-input__picker-action--font-size=12px]
 * @cssproperty {font-weight} [--c2-time-input__picker-action--font-weight=600]
 * @cssproperty {color} [--c2-time-input__picker-action--color=#71717a]
 * @cssproperty {color} [--c2-time-input__picker-action__hover--color=#18181b]
 * @cssproperty {color} [--c2-time-input__picker-action-primary--color=#0265dc]
 * @cssproperty {color} [--c2-time-input__picker-action-primary__hover--color=#0154b8]
 *
 * @internalcomponent c2-overlay
 */
@customElement('c2-time-input')
export class TimeInput extends LitElement {
  static formAssociated = true
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private customValidityMessage = ''
  private defaultValue = ''
  private defaultCaptured = false
  @state() private disabledByForm = false
  @state() private focused = false
  @state() private pickerOpen = false
  private validCache?: {
    key: string
    times: number[]
    hours: Set<number>
    minutes: Set<number>
    seconds: Set<number>
    anyMinute: Set<number>
    anySecond: Set<number>
  }
  private readonly slotPresence = new SlotPresenceController(this, ['supporting-text'])
  @query('input') private readonly input?: HTMLInputElement
  @query('#picker') private readonly picker?: Overlay

  /** Current time as a 24-hour `HH:mm` or `HH:mm:ss` string, or an empty string. */
  @property({ type: String, reflect: true }) value = ''
  /** Earliest valid time as `HH:mm`. When `min` is later than `max` the range wraps past midnight. */
  @property({ type: String }) min = ''
  /** Latest valid time as `HH:mm`. */
  @property({ type: String }) max = ''
  /** Granularity in seconds between valid times. Below 60 the field also shows seconds. */
  @property({ type: Number }) step = 60
  /** Form field name. */
  @property({ type: String }) name = ''
  /** Browser autocomplete hint. */
  @property({ type: String }) autocomplete = ''
  /** Requires a time before the form can be submitted. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Prevents editing while keeping the value in form submission. */
  @property({ type: Boolean, reflect: true }) readOnly = false
  /** Prevents interaction and excludes the value from form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Applies the visual error state and sets `aria-invalid`. */
  @property({ type: Boolean, reflect: true }) error = false
  /** Helper text shown below the field. */
  @property({ type: String }) help = ''
  /** Message shown below the field while `error` is set. */
  @property({ attribute: 'error-text' }) errorText = ''
  /** Accessible name forwarded to the native time input. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

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
  /** Current time as milliseconds since midnight, or `NaN` when empty. */
  get valueAsNumber() {
    return this.input?.valueAsNumber ?? NaN
  }

  override connectedCallback() {
    super.connectedCallback()
    if (!this.defaultCaptured) {
      this.defaultValue = this.getAttribute('value') ?? ''
      this.defaultCaptured = true
    }
  }

  override focus(options?: FocusOptions) {
    this.input?.focus(options)
  }

  /** Opens the time picker. Does nothing while disabled or read-only. */
  showPicker() {
    if (this.effectiveDisabled || this.readOnly) return
    this.picker?.showPopover()
  }

  /** Closes the time picker. */
  hidePicker() {
    if (this.picker?.matches(':popover-open')) this.picker.hidePopover()
  }

  checkValidity() {
    return this.internals.checkValidity()
  }
  reportValidity() {
    return this.internals.reportValidity()
  }
  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.input?.setCustomValidity(message)
    this.syncFormState()
  }

  formResetCallback() {
    this.value = this.defaultValue
    this.error = false
  }
  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }
  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  private handleInput(event: InputEvent) {
    this.value = (event.target as HTMLInputElement).value
    redispatchEvent(this, event)
  }
  private handleChange(event: Event) {
    this.value = (event.target as HTMLInputElement).value
    redispatchEvent(this, event)
  }
  private handleFocusIn(event: FocusEvent) {
    this.focused = true
    redispatchEvent(this, event)
  }
  private handleFocusOut(event: FocusEvent) {
    this.focused = false
    redispatchEvent(this, event)
  }
  private stopClick(event: Event) {
    // The field forwards clicks to the input; the clock button opens the picker through popovertarget instead.
    event.stopPropagation()
  }
  private handleInputKeyDown(event: KeyboardEvent) {
    if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault()
      this.showPicker()
    }
  }

  // ---- picker ------------------------------------------------------------------------------------------------------

  private get stepSeconds() {
    return Number.isFinite(this.step) && this.step > 0 ? this.step : 60
  }
  private get showSeconds() {
    return this.stepSeconds < 60
  }
  /** The nearest `lang`, which the native field's 12/24-hour display follows too. */
  private get locale() {
    return this.closest('[lang]')?.getAttribute('lang') || undefined
  }
  private get twelveHour() {
    return new Intl.DateTimeFormat(this.locale, { hour: 'numeric' }).resolvedOptions().hour12 === true
  }
  private periodLabels(): [string, string] {
    const format = new Intl.DateTimeFormat(this.locale, { hour: 'numeric', hour12: true })
    const label = (hour: number) =>
      format.formatToParts(new Date(2000, 0, 1, hour)).find((part) => part.type === 'dayPeriod')?.value ?? (hour < 12 ? 'AM' : 'PM')
    return [label(9), label(21)]
  }

  private inRange(seconds: number) {
    const min = parseTime(this.min)
    const max = parseTime(this.max)
    const lo = min ? toSeconds(min) : 0
    const hi = max ? toSeconds(max) : DAY - 1
    return lo <= hi ? seconds >= lo && seconds <= hi : seconds >= lo || seconds <= hi
  }

  /** Valid times on the step grid (stepped from `min`, like the native input), indexed per column. */
  private validIndex() {
    const key = `${this.min}|${this.max}|${this.stepSeconds}`
    if (this.validCache?.key === key) return this.validCache
    const step = this.stepSeconds
    const base = parseTime(this.min)
    const times: number[] = []
    const hours = new Set<number>()
    const minutes = new Set<number>() // hour * 60 + minute
    const seconds = new Set<number>() // (hour * 60 + minute) * 60 + second, i.e. the time itself
    const anyMinute = new Set<number>() // minutes that occur in some hour, for an empty value
    const anySecond = new Set<number>()
    for (let t = base ? toSeconds(base) % step : 0; t < DAY; t += step) {
      if (!this.inRange(t)) continue
      times.push(t)
      hours.add(Math.floor(t / 3600))
      minutes.add(Math.floor(t / 60))
      seconds.add(t)
      anyMinute.add(Math.floor(t / 60) % 60)
      anySecond.add(t % 60)
    }
    this.validCache = { key, times, hours, minutes, seconds, anyMinute, anySecond }
    return this.validCache
  }

  private columnOptions(column: Column, current: TimeParts | null): ColumnOption[] {
    const step = this.stepSeconds
    const valid = this.validIndex()
    if (column === 'period') {
      const [am, pm] = this.periodLabels()
      const any = (from: number) => Array.from({ length: 12 }, (_, i) => from + i).some((hour) => valid.hours.has(hour))
      return [
        { value: 0, label: am, disabled: !any(0) },
        { value: 1, label: pm, disabled: !any(12) },
      ]
    }
    if (column === 'hour') {
      const hourStep = unitStep(step, 3600, 24)
      const twelve = this.twelveHour
      const offset = twelve && current && current.hour >= 12 ? 12 : 0
      const options: ColumnOption[] = []
      // A 12-hour clock face leads with 12, which is hour 0 of its half-day.
      for (let h = 0; h < (twelve ? 12 : 24); h += hourStep) {
        const hour = h + offset
        options.push({ value: hour, label: twelve ? pad(h || 12) : pad(hour), disabled: !valid.hours.has(hour) })
      }
      return options
    }
    const options: ColumnOption[] = []
    if (column === 'minute') {
      const minuteStep = step >= 3600 ? 60 : unitStep(step, 60, 60)
      for (let m = 0; m < 60; m += minuteStep) {
        const disabled = current ? !valid.minutes.has(current.hour * 60 + m) : !valid.anyMinute.has(m)
        options.push({ value: m, label: pad(m), disabled })
      }
      return options
    }
    for (let s = 0; s < 60; s += unitStep(step, 1, 60)) {
      const disabled = current ? !valid.seconds.has(toSeconds({ ...current, second: s })) : !valid.anySecond.has(s)
      options.push({ value: s, label: pad(s), disabled })
    }
    return options
  }

  /** Applies one column's value, then snaps to the nearest valid time, keeping the hour (and minute) when it can. */
  private pick(column: Column, value: number) {
    const { times } = this.validIndex()
    if (!times.length) return
    const current = parseTime(this.value) ?? fromSeconds(times[0])
    const next = { ...current }
    if (column === 'hour') next.hour = value
    else if (column === 'minute') next.minute = value
    else if (column === 'second') next.second = value
    else next.hour = (next.hour % 12) + (value ? 12 : 0)

    const target = toSeconds(next)
    const sameHour = times.filter((t) => Math.floor(t / 3600) === next.hour && (column !== 'second' || Math.floor(t / 60) % 60 === next.minute))
    this.commit(fromSeconds(nearest(sameHour.length ? sameHour : times, target)))
  }

  private commit(parts: TimeParts) {
    const value = this.showSeconds ? `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}` : `${pad(parts.hour)}:${pad(parts.minute)}`
    if (value === this.value) return
    this.value = value
    this.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true }))
    this.updateComplete.then(() => this.centerSelected('smooth'))
  }

  private pickNow() {
    const { times } = this.validIndex()
    if (!times.length) return
    const now = new Date()
    this.commit(fromSeconds(nearest(times, now.getHours() * 3600 + now.getMinutes() * 60 + (this.showSeconds ? now.getSeconds() : 0))))
  }

  private handlePickerToggle(event: ToggleEvent) {
    this.pickerOpen = event.newState === 'open'
    if (this.pickerOpen) {
      this.updateComplete.then(() => {
        this.centerSelected('instant')
        this.renderRoot.querySelector<HTMLElement>('.column')?.focus({ preventScroll: true })
      })
    } else if (this.renderRoot.querySelector('.picker')?.contains((this.renderRoot as ShadowRoot).activeElement)) {
      this.input?.focus()
    }
  }

  private centerSelected(behavior: ScrollBehavior) {
    for (const column of this.renderRoot.querySelectorAll<HTMLElement>('.column')) {
      const selected = column.querySelector<HTMLElement>('[aria-selected="true"]')
      if (!selected) continue
      column.scrollTo({ top: selected.offsetTop - (column.clientHeight - selected.offsetHeight) / 2, behavior })
    }
  }

  private handleColumnKeyDown(event: KeyboardEvent, column: Column, options: ColumnOption[], selected: number | undefined) {
    const enabled = options.filter((option) => !option.disabled)
    if (!enabled.length) return
    const index = enabled.findIndex((option) => option.value === selected)
    let next: ColumnOption | undefined
    switch (event.key) {
      case 'ArrowDown':
        next = enabled[index < 0 ? 0 : (index + 1) % enabled.length]
        break
      case 'ArrowUp':
        next = enabled[index < 0 ? enabled.length - 1 : (index - 1 + enabled.length) % enabled.length]
        break
      case 'Home':
        next = enabled[0]
        break
      case 'End':
        next = enabled[enabled.length - 1]
        break
      case 'ArrowRight':
      case 'ArrowLeft': {
        const columns = [...this.renderRoot.querySelectorAll<HTMLElement>('.column')]
        const at = columns.indexOf(event.currentTarget as HTMLElement)
        columns[at + (event.key === 'ArrowRight' ? 1 : -1)]?.focus({ preventScroll: true })
        event.preventDefault()
        return
      }
      case 'Enter':
        event.preventDefault()
        this.hidePicker()
        return
      default:
        return
    }
    event.preventDefault()
    this.pick(column, next.value)
  }

  private renderColumn(column: Column, label: string, current: TimeParts | null) {
    const options = this.columnOptions(column, current)
    const selected = !current
      ? undefined
      : column === 'hour'
        ? current.hour
        : column === 'minute'
          ? current.minute
          : column === 'second'
            ? current.second
            : Number(current.hour >= 12)
    return html`<div
      class="column ${column}"
      role="listbox"
      tabindex="0"
      aria-label=${label}
      @keydown=${(event: KeyboardEvent) => this.handleColumnKeyDown(event, column, options, selected)}
    >
      ${options.map(
        (option) =>
          html`<div
            class="option"
            role="option"
            aria-selected=${option.value === selected ? 'true' : 'false'}
            aria-disabled=${option.disabled ? 'true' : nothing}
            @click=${() => !option.disabled && this.pick(column, option.value)}
          >
            ${option.label}
          </div>`,
      )}
    </div>`
  }

  private renderReadout(current: TimeParts | null) {
    const twelve = this.twelveHour
    if (!current) {
      return html`<div class="readout empty" aria-hidden="true">
        --<span class="colon">:</span>--${this.showSeconds ? html`<span class="colon">:</span>--` : nothing}
      </div>`
    }
    const hour = twelve ? current.hour % 12 || 12 : current.hour
    return html`<div class="readout" aria-hidden="true">
      ${pad(hour)}<span class="colon">:</span>${pad(current.minute)}${this.showSeconds ? html`<span class="colon">:</span>${pad(current.second)}` : nothing}
      ${twelve ? html`<span class="period">${this.periodLabels()[current.hour >= 12 ? 1 : 0]}</span>` : nothing}
    </div>`
  }

  private renderPicker() {
    const interactive = !this.effectiveDisabled && !this.readOnly
    if (!interactive) return nothing
    const current = parseTime(this.value)
    return html`<c2-overlay id="picker" anchor="field" placement="bottom-start" free-width @toggle=${this.handlePickerToggle}>
      <div class="picker">
        ${
          this.pickerOpen
            ? html`${this.renderReadout(current)}
                <div class="columns">
                  ${this.renderColumn('hour', 'Hours', current)}
                  <span class="separator" aria-hidden="true">:</span>
                  ${this.renderColumn('minute', 'Minutes', current)}
                  ${this.showSeconds ? html`<span class="separator" aria-hidden="true">:</span>${this.renderColumn('second', 'Seconds', current)}` : nothing}
                  ${this.twelveHour ? this.renderColumn('period', 'AM/PM', current) : nothing}
                </div>
                <div class="actions">
                  <button type="button" class="action" @click=${this.pickNow}>Now</button>
                  <button type="button" class="action primary" @click=${this.hidePicker}>Done</button>
                </div>`
            : nothing
        }
      </div>
    </c2-overlay>`
  }
  private forwardFocus(event: Event) {
    if (event.target !== this.input) this.input?.focus()
  }

  protected override updated(changed: PropertyValues<this>) {
    if (changed.has('value') && this.input && this.input.value !== this.value) {
      this.value = this.input.value
      return
    }
    this.syncFormState()
  }

  private syncFormState() {
    if (!this.input) return
    if (this.effectiveDisabled) {
      this.internals.setFormValue(null)
      this.internals.setValidity({})
      return
    }
    this.internals.setFormValue(this.value, this.value)
    this.input.setCustomValidity(this.customValidityMessage)
    this.internals.setValidity(this.input.validity, this.input.validationMessage, this.input)
  }

  override render() {
    const showError = this.error && !this.effectiveDisabled
    const message = showError ? this.errorText : this.help
    const showSupporting = !!message || this.slotPresence.has('supporting-text')
    return html`
      <div
        id="field"
        class="field ${classMap({
          focused: this.focused || this.pickerOpen,
          error: showError,
          'read-only': this.readOnly,
          disabled: this.effectiveDisabled,
        })}"
        @click=${this.forwardFocus}
      >
        <input
          type="time"
          aria-label=${ifDefined(this.ariaLabel || undefined)}
          aria-invalid=${showError ? 'true' : nothing}
          aria-describedby=${showSupporting ? 'supporting-text' : nothing}
          name=${ifDefined(this.name || undefined)}
          autocomplete=${ifDefined(this.autocomplete || undefined)}
          min=${ifDefined(this.min || undefined)}
          max=${ifDefined(this.max || undefined)}
          step=${this.step}
          ?required=${this.required}
          ?readonly=${this.readOnly}
          ?disabled=${this.effectiveDisabled}
          .value=${live(this.value)}
          @input=${this.handleInput}
          @change=${this.handleChange}
          @focusin=${this.handleFocusIn}
          @focusout=${this.handleFocusOut}
          @keydown=${this.handleInputKeyDown}
        />
        <button
          class="clock-button"
          type="button"
          tabindex="-1"
          aria-label="Open time picker"
          aria-haspopup="dialog"
          aria-expanded=${this.pickerOpen ? 'true' : 'false'}
          popovertarget=${this.effectiveDisabled || this.readOnly ? nothing : 'picker'}
          ?disabled=${this.effectiveDisabled || this.readOnly}
          @click=${this.stopClick}
        >
          <slot name="clock-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M12 7v5l3 2"></path>
            </svg>
          </slot>
        </button>
      </div>
      ${this.renderPicker()}
      ${
        showSupporting
          ? html`<div id="supporting-text" class="supporting-text ${classMap({ error: showError })}">
              <slot name="supporting-text" @slotchange=${this.slotPresence.handleSlotChange}>${message}</slot>
            </div>`
          : html`<slot name="supporting-text" hidden @slotchange=${this.slotPresence.handleSlotChange}></slot>`
      }
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-time-input': TimeInput
  }
}
