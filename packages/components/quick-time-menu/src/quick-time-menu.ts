import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { instantOf, parseWallClock } from '@c2n/core/zoned-time.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { Overlay } from '@c2n/overlay'
import '@c2n/overlay'
import '@c2n/button'
import '@c2n/date-time-picker'
import { formatQuickTime, formatQuickTimeLong, resolveQuickTime, type QuickTimePreset } from './quick-time.js'
import { quickTimeMenuMessages } from './messages.js'
import styles from './quick-time-menu.scss?inline'

export * from './quick-time.js'
export { quickTimeMenuMessages } from './messages.js'

export interface QuickTimeSelectDetail {
  /** The chosen wall-clock time, `YYYY-MM-DDTHH:mm`. */
  value: string
  /** The `id` of the preset picked, or `null` for a time picked in the date and time panel. */
  preset: string | null
}

/** Events fired by {@link QuickTimeMenu}, keyed for `addEventListener`. */
export interface QuickTimeMenuEventMap {
  'time-select': CustomEvent<QuickTimeSelectDetail>
  input: Event
  change: Event
}

export interface QuickTimeMenu {
  addEventListener: TypedAddEventListener<QuickTimeMenu, QuickTimeMenuEventMap>
  removeEventListener: TypedRemoveEventListener<QuickTimeMenu, QuickTimeMenuEventMap>
}

interface Row {
  preset: QuickTimePreset
  value: string
  time: string
}

const clockIcon = svg`<circle cx="8" cy="8" r="6.2"></circle><path d="M8 4.5V8l2.3 1.6"></path>`
const calendarIcon = svg`<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"></rect><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"></path>`
const checkIcon = svg`<path d="M3.5 8.5l3 3 6-7"></path>`
const clearIcon = svg`<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"></path>`

/**
 * "Later today · Tomorrow · Next week · Pick a date and time…": a menu of quick times, as Gmail's snooze, Slack's
 * reminders and Linear's "remind me" offer. Each row shows the time it falls at, in the locale's hour cycle.
 *
 * The default rows are Later today (in about 3 hours, on the hour; hidden from `evening`), This evening (at
 * `evening`, hidden from an hour before), Tomorrow, This weekend (hidden on weekends) and Next week (the locale's first
 * day of the week), the last three at `morning`. `presets` replaces them with rows of your own, each
 * `{ id, label, at }` where `at` is a function of the current instant or an expression such as `+3h`, `+30m`,
 * `tomorrow 09:00`, `next monday 09:00`, `saturday 10:00` or `end of day`; a row that does not apply now, or falls
 * outside `min`/`max`, is hidden. The last row, "Pick a date and time…", swaps the list for a `c2-date-time-picker`
 * in place, with Back and Set.
 *
 * The value is a wall-clock `YYYY-MM-DDTHH:mm` in `time-zone`, the shape `c2-date-time-picker` uses, and
 * `valueAsDate` is the instant it names. A row is resolved when it is picked, so "Tomorrow" means the day after the
 * click. A pick fires `input`, `change` and `time-select` (with the preset's `id`).
 *
 * The trigger shows `label` until a time is chosen, then that time; a separate clear button sits beside it
 * (`clearable="false"` removes it). Slot your own trigger into `trigger`. `inline` draws the list without a trigger or
 * popover, to sit inside another menu, a sheet or a card.
 *
 * It is a form control: under a `name` the form receives the value, `required` asks for one, and it takes part in
 * `c2-form-field`. The list is a `menu` of `menuitemradio` rows (the chosen one checked) with arrow keys, Home, End
 * and first-letter typeahead. `now` fixes the current time for tests and demos.
 *
 * @tag c2-quick-time-menu
 *
 * @slot trigger - Replaces the built-in trigger button: an element that opens the menu (a `c2-button`, a `c2-icon-button`, a plain `<button>`).
 *
 * @event {CustomEvent<QuickTimeSelectDetail>} time-select - A time was picked: `detail.value` and `detail.preset` (the preset's `id`, or `null` from the date and time panel).
 * @event {Event} input - The value changed (a pick or a clear).
 * @event {Event} change - The value changed (a pick or a clear).
 *
 * @csspart trigger - The built-in trigger button.
 * @csspart clear - The clear button beside the trigger.
 * @csspart menu - The surface holding the list or the date and time panel.
 *
 * @cssproperty {pixel} [--c2-quick-time-menu__trigger--min-height=36px]
 * @cssproperty {pixel} [--c2-quick-time-menu__trigger--padding-inline=12px]
 * @cssproperty {pixel} [--c2-quick-time-menu__trigger--gap=8px]
 * @cssproperty {border} [--c2-quick-time-menu__trigger--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-quick-time-menu__trigger--border-radius=6px]
 * @cssproperty {color} [--c2-quick-time-menu__trigger--background-color=#ffffff]
 * @cssproperty {color} [--c2-quick-time-menu__trigger--color=#18181b]
 * @cssproperty {font-size} [--c2-quick-time-menu__trigger--font-size=14px]
 * @cssproperty {border} [--c2-quick-time-menu__trigger__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-quick-time-menu__trigger__open--border=1px solid rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-quick-time-menu__trigger__set--color=rgb(2, 101, 220)] - Text and icon of a trigger showing a chosen time.
 * @cssproperty {color} [--c2-quick-time-menu__trigger__set--background-color=#edf1fe]
 * @cssproperty {border} [--c2-quick-time-menu__trigger__error--border=1px solid #dc2626] - While an enclosing `c2-form-field` shows an error.
 * @cssproperty {outline} [--c2-quick-time-menu__trigger__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-quick-time-menu__trigger__focus--outline-offset=2px]
 * @cssproperty {color} [--c2-quick-time-menu__icon--color=#71717a]
 * @cssproperty {pixel} [--c2-quick-time-menu__icon--size=16px]
 * @cssproperty {color} [--c2-quick-time-menu__clear--color=#71717a]
 * @cssproperty {color} [--c2-quick-time-menu__clear__hover--background-color=#f4f4f5]
 * @cssproperty {pixel} [--c2-quick-time-menu__menu--width=300px]
 * @cssproperty {color} [--c2-quick-time-menu__menu--background-color=#ffffff]
 * @cssproperty {border} [--c2-quick-time-menu__menu--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-quick-time-menu__menu--border-radius=8px]
 * @cssproperty {shadow} [--c2-quick-time-menu__menu--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {pixel} [--c2-quick-time-menu__menu--padding=4px]
 * @cssproperty {pixel} [--c2-quick-time-menu__item--min-height=36px]
 * @cssproperty {pixel} [--c2-quick-time-menu__item--padding-inline=10px]
 * @cssproperty {border-radius} [--c2-quick-time-menu__item--border-radius=6px]
 * @cssproperty {color} [--c2-quick-time-menu__item--color=#18181b]
 * @cssproperty {font-size} [--c2-quick-time-menu__item--font-size=14px]
 * @cssproperty {color} [--c2-quick-time-menu__item__hover--background-color=#f4f4f5] - Also the keyboard-focused row.
 * @cssproperty {font-weight} [--c2-quick-time-menu__item__checked--font-weight=500]
 * @cssproperty {color} [--c2-quick-time-menu__check--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-quick-time-menu__time--color=#52525b]
 * @cssproperty {font-size} [--c2-quick-time-menu__time--font-size=12px]
 * @cssproperty {color} [--c2-quick-time-menu__separator--color=#e4e4e7]
 * @cssproperty {color} [--c2-quick-time-menu__hint--color=#71717a]
 * @cssproperty {font-size} [--c2-quick-time-menu__hint--font-size=12px]
 * @cssproperty {opacity} [--c2-quick-time-menu__disabled--opacity=0.38]
 *
 * @internalcomponent c2-overlay
 * @internalcomponent c2-date-time-picker
 * @internalcomponent c2-button
 */
@customElement('c2-quick-time-menu')
export class QuickTimeMenu extends LitElement {
  static formAssociated = true
  static override styles = unsafeCSS(styles)

  /** The chosen time as a wall-clock `YYYY-MM-DDTHH:mm` in `time-zone`, or empty. */
  @property() value = ''

  /** The form field name. */
  @property({ reflect: true }) name = ''

  /** The trigger's text and the menu's name, such as "Snooze until"; "Pick a time" by default. */
  @property() label = ''

  /** Rows of your own, replacing the defaults: `{ id, label, at }`. Set functions as a property; expressions also work as JSON. */
  @property({ converter: jsonPropertyConverter }) presets: QuickTimePreset[] = []

  /** The current time, for tests and demos: a `Date`, a timestamp or an ISO string. The browser's clock when unset. */
  @property() now: Date | number | string | undefined = undefined

  /** Time of day of Tomorrow, This weekend, Next week and expressions without a time. */
  @property() morning = '09:00'

  /** Time of day of This evening and `end of day`; Later today is hidden from then on. */
  @property() evening = '18:00'

  /** IANA time zone the value is read in, such as `Europe/Paris`; empty is the browser's zone. */
  @property({ attribute: 'time-zone' }) timeZone = ''

  /** Earliest time a row may fall at, `YYYY-MM-DDTHH:mm`; later rows only. */
  @property() min = ''

  /** Latest time a row may fall at, `YYYY-MM-DDTHH:mm`. */
  @property() max = ''

  /** Draws the list in place, without a trigger or popover. */
  @property({ type: Boolean, reflect: true }) inline = false

  /** Shows the clear button beside the trigger once a time is chosen; `clearable="false"` removes it. */
  @property({ type: Boolean }) clearable = true

  /** A time must be chosen. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Turns the trigger off; a disabled menu is not submitted. */
  @property({ type: Boolean, reflect: true }) disabled = false

  @state() private open = false
  @state() private panel = false
  @state() private draft = ''
  @state() private active = 0
  @state() private announcement = ''
  @state() private formDisabled = false
  @state() private tick = 0
  @state() private slottedTrigger: HTMLElement | null = null

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, quickTimeMenuMessages)
  private readonly field = new FieldContextConsumer(this, { kind: 'choice' })
  private defaultValue: string | null = null
  private ticker: ReturnType<typeof setInterval> | undefined
  private closedAt = 0
  private focusLast = false

  /** The instant the value names in `time-zone`, or `null` when empty. */
  get valueAsDate(): Date | null {
    const clock = parseWallClock(this.value)
    return clock ? new Date(instantOf(clock, this.timeZone)) : null
  }

  get form(): HTMLFormElement | null {
    return this.internals.form
  }

  get validity(): ValidityState {
    return this.internals.validity
  }

  get validationMessage(): string {
    return this.internals.validationMessage
  }

  get willValidate(): boolean {
    return this.internals.willValidate
  }

  checkValidity(): boolean {
    return this.internals.checkValidity()
  }

  reportValidity(): boolean {
    return this.internals.reportValidity()
  }

  formResetCallback(): void {
    this.value = this.defaultValue ?? ''
  }

  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled
  }

  /** Opens the menu. Does nothing inline or while disabled. */
  showMenu(): void {
    if (this.inline || this.isDisabled) return
    this.overlay?.showPopover()
  }

  /** Closes the menu. */
  hideMenu(): void {
    if (this.overlay?.matches(':popover-open')) this.overlay.hidePopover()
  }

  override focus(options?: FocusOptions): void {
    if (this.inline) this.rowElements()[this.active]?.focus(options)
    else (this.slottedTrigger ?? this.renderRoot.querySelector<HTMLElement>('.trigger'))?.focus(options)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.defaultValue ??= this.getAttribute('value') ?? ''
    this.syncTicker()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    clearInterval(this.ticker)
    this.ticker = undefined
  }

  private get isDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  private get overlay(): (Overlay & HTMLElement) | null {
    return this.renderRoot.querySelector<Overlay & HTMLElement>('c2-overlay')
  }

  private get labelText(): string {
    return this.label || this.field.label || this.msg.t('label')
  }

  private get options() {
    return { now: this.now, timeZone: this.timeZone, morning: this.morning, evening: this.evening, locale: this.msg.locale }
  }

  private get presetList(): QuickTimePreset[] {
    if (Array.isArray(this.presets) && this.presets.length) return this.presets
    return [
      { id: 'later-today', label: this.msg.t('laterToday'), at: 'later today' },
      { id: 'this-evening', label: this.msg.t('thisEvening'), at: 'this evening' },
      { id: 'tomorrow', label: this.msg.t('tomorrow'), at: 'tomorrow' },
      { id: 'this-weekend', label: this.msg.t('thisWeekend'), at: 'this weekend' },
      { id: 'next-week', label: this.msg.t('nextWeek'), at: 'next week' },
    ]
  }

  private inRange(value: string): boolean {
    const time = value.slice(0, 16)
    return (!this.min || time >= this.min.slice(0, 16)) && (!this.max || time <= this.max.slice(0, 16))
  }

  /** The rows that apply now, each with the time it resolves to. */
  private rows(): Row[] {
    void this.tick
    const options = this.options
    const rows: Row[] = []
    for (const preset of this.presetList) {
      if (!preset || typeof preset.label !== 'string') continue
      const value = resolveQuickTime(preset.at, options)
      if (!value || !this.inRange(value)) continue
      rows.push({ preset, value, time: formatQuickTime(value, options) })
    }
    return rows
  }

  private rowElements(): HTMLElement[] {
    return [...this.renderRoot.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitem"]')]
  }

  private syncTicker(): void {
    const live = this.isConnected && (this.open || this.inline)
    if (live && !this.ticker) this.ticker = setInterval(() => this.tick++, 30_000)
    else if (!live && this.ticker) {
      clearInterval(this.ticker)
      this.ticker = undefined
    }
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('inline') || changed.has('open')) this.syncTicker()
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has('value') || changed.has('required') || changed.has('disabled') || changed.has('formDisabled') || changed.has('name')) this.syncForm()
    if (changed.has('slottedTrigger') || changed.has('open') || changed.has('disabled') || changed.has('formDisabled')) this.syncSlottedTrigger()
  }

  private syncForm(): void {
    this.internals.setFormValue(this.isDisabled || !this.value ? null : this.value)
    const anchor = this.renderRoot.querySelector<HTMLElement>('.anchor') ?? undefined
    if (this.required && !this.value) this.internals.setValidity({ valueMissing: true }, this.msg.t('valueMissing'), anchor)
    else this.internals.setValidity({})
  }

  /** `aria-haspopup` and `aria-expanded` belong on the element that is the button, so they go on a slotted trigger. */
  private syncSlottedTrigger(): void {
    const target = this.slottedTrigger
    if (!target) return
    target.setAttribute('aria-haspopup', 'menu')
    target.setAttribute('aria-expanded', String(this.open))
  }

  // ------------------------------------------------------------------------------------------------------- choices

  /** Fires `input` and `change`, then `time-select` for a pick (`preset` undefined for a clear). */
  private emit(preset?: string | null): void {
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true }))
    if (preset !== undefined) {
      this.dispatchEvent(new CustomEvent<QuickTimeSelectDetail>('time-select', { detail: { value: this.value, preset }, bubbles: true }))
    }
  }

  private pick(value: string, preset: string | null): void {
    if (!value) return
    this.value = value
    this.announcement = this.msg.t('picked', formatQuickTimeLong(value, this.options))
    this.panel = false
    this.emit(preset)
    if (this.inline) {
      void this.updateComplete.then(() => {
        const rows = this.rowElements()
        const index = Math.max(0, rows.findIndex((row) => row.getAttribute('aria-checked') === 'true'))
        this.active = index
        rows[index]?.focus()
      })
    } else {
      this.hideMenu()
    }
  }

  private pickRow(row: Row): void {
    // Resolved again at the click: a menu left open past a boundary must not pick a stale time.
    const value = resolveQuickTime(row.preset.at, this.options) || row.value
    this.pick(value, row.preset.id)
  }

  private clear(): void {
    this.value = ''
    this.announcement = this.msg.t('cleared')
    this.emit()
    this.focus()
  }

  private openPanel(): void {
    const tomorrow = resolveQuickTime('tomorrow', this.options)
    this.draft = this.value || (this.inRange(tomorrow) ? tomorrow : this.min.slice(0, 16)) || tomorrow
    this.panel = true
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>('c2-date-time-picker')?.focus())
  }

  private closePanel(): void {
    this.panel = false
    void this.updateComplete.then(() => {
      const rows = this.rowElements()
      this.active = rows.length - 1
      rows[rows.length - 1]?.focus()
    })
  }

  // ------------------------------------------------------------------------------------------------------ keyboard

  private handleTriggerKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    this.focusLast = event.key === 'ArrowUp'
    this.showMenu()
  }

  private handleListKeyDown(event: KeyboardEvent): void {
    const rows = this.rowElements()
    if (!rows.length) return
    const current = rows.indexOf(event.composedPath().find((node) => rows.includes(node as HTMLElement)) as HTMLElement)
    let next = -1
    switch (event.key) {
      case 'ArrowDown':
        next = (current + 1) % rows.length
        break
      case 'ArrowUp':
        next = (current - 1 + rows.length) % rows.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = rows.length - 1
        break
      case 'Enter':
      case ' ':
        if (current >= 0) {
          event.preventDefault()
          rows[current].click()
        }
        return
      case 'Tab':
        if (!this.inline) this.hideMenu()
        return
      default:
        if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const letter = event.key.toLocaleLowerCase()
          for (let step = 1; step <= rows.length; step++) {
            const index = (current + step) % rows.length
            if ((rows[index].textContent ?? '').trim().toLocaleLowerCase().startsWith(letter)) {
              next = index
              break
            }
          }
        }
    }
    if (next < 0) return
    event.preventDefault()
    this.active = next
    rows[next].focus()
  }

  // ------------------------------------------------------------------------------------------------------- popover

  private handleToggle(event: ToggleEvent): void {
    this.open = event.newState === 'open'
    if (this.open) {
      void this.updateComplete.then(() => {
        const rows = this.rowElements()
        const checked = rows.findIndex((row) => row.getAttribute('aria-checked') === 'true')
        this.active = this.focusLast ? rows.length - 1 : Math.max(0, checked)
        this.focusLast = false
        rows[this.active]?.focus()
      })
    } else {
      this.closedAt = Date.now()
      const hadFocus = this.overlay?.contains((this.renderRoot as ShadowRoot).activeElement) ?? false
      this.panel = false
      if (hadFocus) this.focus()
    }
  }

  private handleSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement
    this.slottedTrigger = (slot.assignedElements()[0] as HTMLElement | undefined) ?? null
  }

  private handleSlottedClick(): void {
    if (this.isDisabled) return
    // A click on the trigger of an open menu first light-dismisses it; do not open it again.
    if (Date.now() - this.closedAt < 300) return
    if (this.open) this.hideMenu()
    else this.showMenu()
  }

  // ------------------------------------------------------------------------------------------------------- render

  private renderList(rows: Row[]) {
    const checkedIndex = rows.findIndex((row) => row.value === this.value)
    const active = Math.min(this.active, rows.length)
    return html`<div class="list" role="menu" aria-label=${this.labelText} @keydown=${this.handleListKeyDown}>
      ${rows.map(
        (row, index) =>
          html`<div
            class=${classMap({ item: true, checked: index === checkedIndex })}
            role="menuitemradio"
            aria-checked=${index === checkedIndex ? 'true' : 'false'}
            aria-label=${this.msg.t('presetName', row.preset.label, formatQuickTimeLong(row.value, this.options))}
            tabindex=${index === active ? '0' : '-1'}
            data-preset=${row.preset.id}
            @click=${() => this.pickRow(row)}
            @focus=${() => (this.active = index)}
          >
            <svg class="check" viewBox="0 0 16 16" aria-hidden="true">${checkIcon}</svg>
            <span class="text">${row.preset.label}</span>
            <span class="time" aria-hidden="true">${row.time}</span>
          </div>`,
      )}
      ${rows.length ? html`<div class="separator" role="separator"></div>` : nothing}
      <div
        class="item custom"
        role="menuitem"
        tabindex=${active === rows.length ? '0' : '-1'}
        data-preset="custom"
        @click=${this.openPanel}
        @focus=${() => (this.active = rows.length)}
      >
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">${calendarIcon}</svg>
        <span class="text">${this.msg.t('custom')}</span>
      </div>
    </div>`
  }

  private renderPanel() {
    const valid = !!parseWallClock(this.draft) && this.inRange(this.draft)
    return html`<div class="panel" role="group" aria-labelledby="panel-heading" @keydown=${(event: KeyboardEvent) => event.stopPropagation()}>
      <div class="panel-heading" id="panel-heading">${this.msg.t('customHeading')}</div>
      <c2-date-time-picker
        .value=${this.draft}
        min=${this.min || nothing}
        max=${this.max || nothing}
        time-zone=${this.timeZone || nothing}
        aria-label=${this.msg.t('customHeading')}
        aria-describedby="panel-hint"
        @input=${(event: Event) => (this.draft = (event.target as HTMLInputElement).value)}
        @change=${(event: Event) => (this.draft = (event.target as HTMLInputElement).value)}
      ></c2-date-time-picker>
      <span class="hint" id="panel-hint">${valid ? formatQuickTimeLong(this.draft, this.options) : nothing}</span>
      <div class="actions">
        <c2-button class="back" @click=${this.closePanel}>${this.msg.t('back')}</c2-button>
        <c2-button class="set" ?disabled=${!valid} @click=${() => this.pick(this.draft, null)}>${this.msg.t('set')}</c2-button>
      </div>
    </div>`
  }

  private renderSurface() {
    const show = this.inline || this.open
    return html`<div class="menu" part="menu">${show ? (this.panel ? this.renderPanel() : this.renderList(this.rows())) : nothing}</div>`
  }

  private renderTrigger() {
    const options = this.options
    const time = this.value ? formatQuickTime(this.value, options) : ''
    const disabled = this.isDisabled
    return html`<slot name="trigger" @slotchange=${this.handleSlotChange} @click=${this.handleSlottedClick} @keydown=${this.handleTriggerKeyDown}
        ><button
          id="trigger"
          class=${classMap({ trigger: true, set: !!time, open: this.open, invalid: this.field.invalid })}
          part="trigger"
          type="button"
          popovertarget="menu"
          aria-haspopup="menu"
          aria-expanded=${this.open ? 'true' : 'false'}
          aria-label=${time ? this.msg.t('triggerName', this.labelText, formatQuickTimeLong(this.value, options)) : this.labelText}
          aria-describedby=${this.field.describedBy()}
          aria-invalid=${this.field.invalid ? 'true' : nothing}
          ?disabled=${disabled}
          @click=${(event: Event) => event.stopPropagation()}
          @keydown=${(event: KeyboardEvent) => {
            event.stopPropagation()
            this.handleTriggerKeyDown(event)
          }}
        >
          <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">${clockIcon}</svg>
          <span class="text">${time || this.labelText}</span>
        </button></slot
      >${
        this.value && this.clearable && !disabled
          ? html`<button class="clear" part="clear" type="button" aria-label=${this.msg.t('clear')} @click=${this.clear}>
              <svg viewBox="0 0 16 16" aria-hidden="true">${clearIcon}</svg>
            </button>`
          : nothing
      }`
  }

  override render() {
    return html`${
      this.inline
        ? this.renderSurface()
        : html`<span class="anchor-row">${this.renderTrigger()}</span>
            <c2-overlay id="menu" .anchor=${this.slottedTrigger ?? 'trigger'} placement="bottom-start" free-width @toggle=${this.handleToggle}
              >${this.renderSurface()}</c2-overlay
            >`
    }
      <span class="anchor" aria-hidden="true"></span>${this.field.renderDescription()}
      <span class="announcement" aria-live="polite">${this.announcement}</span>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-quick-time-menu': QuickTimeMenu
  }
}
