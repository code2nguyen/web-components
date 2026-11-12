import { html, nothing } from 'lit'
import { LocalizeController } from '@c2n/core/localize.js'
import '@c2n/date-selector'
import '@c2n/overlay'
import type { DateSelector } from '@c2n/date-selector'
import { dateInputMessages } from './messages.js'
import styles from './calendar.scss?inline'
import type { DateInput } from './date-input.js'

/** What the calendar asks of the field it belongs to. */
export interface CalendarHost {
  /** The date picked, or an empty string from Clear: the field stores it and fires `input` and `change`. */
  commit(value: string): void
  /** The popover opened or closed, by the field or by the browser (Escape, a press outside). */
  toggled(open: boolean): void
}

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
export function createCalendar(input: DateInput, host: CalendarHost) {
  const msg = new LocalizeController(input, dateInputMessages)
  const root = input.renderRoot as ShadowRoot
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(styles)
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]

  const pick = (event: Event) => {
    event.stopPropagation()
    const value = (event.target as DateSelector).value
    if (value) host.commit(value)
  }

  return {
    /** The first day button of the open calendar that takes focus: the selected day, else today or the first pickable one. */
    focus() {
      root.querySelector<DateSelector>('c2-date-selector')?.focus()
    },
    render(open: boolean, anchor: HTMLElement | undefined) {
      const now = today()
      const todayUnavailable = (!!input.min && now < input.min) || (!!input.max && now > input.max)
      return html`<c2-overlay
        id="calendar"
        placement="bottom-start"
        free-width
        .anchor=${anchor}
        ?open=${open}
        @toggle=${(event: ToggleEvent) => host.toggled(event.newState === 'open')}
      >
        <div class="calendar" part="calendar" role="dialog" aria-label=${input.ariaLabel || msg.t('calendar')}>
          ${
            open
              ? html`<c2-date-selector
                  mode="single"
                  months="1"
                  aria-label=${msg.t('calendar')}
                  locale=${msg.locale}
                  .value=${input.value}
                  .min=${input.min}
                  .max=${input.max}
                  @input=${(event: Event) => event.stopPropagation()}
                  @change=${pick}
                ></c2-date-selector>`
              : nothing
          }
          <div class="calendar-actions" part="calendar-actions">
            <slot name="calendar-actions"></slot>
            <span class="spring"></span>
            <button class="calendar-action" type="button" ?disabled=${todayUnavailable} @click=${() => host.commit(now)}>${msg.t('today')}</button>
            <button class="calendar-action" type="button" ?disabled=${!input.value} @click=${() => host.commit('')}>${msg.t('clear')}</button>
          </div>
        </div>
      </c2-overlay>`
    },
  }
}

export type Calendar = ReturnType<typeof createCalendar>
