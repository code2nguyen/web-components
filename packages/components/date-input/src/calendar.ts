import { html, nothing } from 'lit'
import { keyed } from 'lit/directives/keyed.js'
import { LocalizeController } from '@c2n/core/localize.js'
import '@c2n/date-selector'
import '@c2n/overlay'
import type { DateSelector } from '@c2n/date-selector'
import { dateInputMessages } from './messages.js'
import styles from './calendar.scss?inline'
import type { DateInput } from './date-input.js'

/** One sheet for every field: a constructed sheet is made to be shared between shadow roots. */
let sheet: CSSStyleSheet | undefined

/** Today as a local-calendar `YYYY-MM-DD` string. */
function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * The calendar popover of `picker="calendar"`: `c2-date-selector` in single mode inside a `c2-overlay`, with Today
 * and Clear. This module, and the two components it imports, load the first time the calendar opens, so a form of
 * date fields that never opens one pays for none of it.
 */
/**
 * `toggled` tells the field its popover opened or closed, by the field or by the browser (Escape, a press outside).
 */
export function createCalendar(input: DateInput, toggled: (open: boolean) => void) {
  const msg = new LocalizeController(input, dateInputMessages)
  const root = input.renderRoot as ShadowRoot
  if (!sheet) {
    sheet = new CSSStyleSheet()
    sheet.replaceSync(styles)
  }
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
  // Counts the openings: each gets a fresh calendar, on the month of the value, while the one before it stays in
  // place for as long as the closing popover fades.
  let opening = 0
  let wasOpen = false

  const pick = (event: Event) => {
    event.stopPropagation()
    const value = (event.target as DateSelector).value
    if (value) input.pick(value)
  }

  const field = () => root.querySelector('input')
  const activeElement = () => (input.getRootNode() as Document | ShadowRoot).activeElement
  /** Whether focus is on a day, on Today or Clear, or on a slotted action. */
  const focusInside = () => {
    // Not `:focus-within`, which Chromium does not report on the host for focus inside its open popover.
    const active = activeElement()
    return (active === input || (!!active && input.contains(active))) && root.activeElement !== field()
  }
  /** Focus inside the popover goes back to the field as the popover closes. */
  const returnFocus = () => {
    if (focusInside()) field()?.focus()
  }

  // The browser may have blurred what was focused in the popover by the time `toggle` reports it closed (Escape), so
  // where focus was is read before it closes. It is not taken back from a control the user pressed outside.
  let hadFocus = false
  const handleBeforeToggle = (event: ToggleEvent) => {
    if (event.newState === 'closed') hadFocus = focusInside()
  }
  const handleToggle = (event: ToggleEvent) => {
    const open = event.newState === 'open'
    const active = activeElement()
    // On the selected day, else today or the first one that can be picked.
    if (open) void input.updateComplete.then(() => root.querySelector<DateSelector>('c2-date-selector')?.focus())
    else if (focusInside() || (hadFocus && (!active || active === document.body))) field()?.focus()
    toggled(open)
  }

  return {
    returnFocus,
    render(open: boolean, anchor: HTMLElement | undefined, label: string) {
      if (open && !wasOpen) opening++
      wasOpen = open
      const now = today()
      const todayUnavailable = (!!input.min && now < input.min) || (!!input.max && now > input.max)
      return html`<c2-overlay
        id="calendar"
        placement="bottom-start"
        free-width
        .anchor=${anchor}
        ?open=${open}
        @beforetoggle=${handleBeforeToggle}
        @toggle=${handleToggle}
      >
        <div class="calendar" part="calendar" role="dialog" aria-label=${label || msg.t('calendar')}>
          ${
            opening
              ? keyed(
                  opening,
                  html`<c2-date-selector
                    mode="single"
                    months="1"
                    aria-label=${msg.t('calendar')}
                    locale=${msg.locale}
                    .value=${input.value}
                    .min=${input.min}
                    .max=${input.max}
                    @input=${(event: Event) => event.stopPropagation()}
                    @change=${pick}
                  ></c2-date-selector>`,
                )
              : nothing
          }
          <div class="calendar-actions" part="calendar-actions">
            <slot name="calendar-actions"></slot>
            <span class="spring"></span>
            <button class="calendar-action" type="button" ?disabled=${todayUnavailable} @click=${() => input.pick(now)}>${msg.t('today')}</button>
            <button class="calendar-action" type="button" ?disabled=${!input.value} @click=${() => input.pick('')}>${msg.t('clear')}</button>
          </div>
        </div>
      </c2-overlay>`
    },
  }
}

export type Calendar = ReturnType<typeof createCalendar>
