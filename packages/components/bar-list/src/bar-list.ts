import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { barListMessages } from './messages'
import styles from './bar-list.scss?inline'

export { barListMessages } from './messages'

/** One row of the list. */
export interface BarListItem {
  /** The row's name. */
  label: string
  /** Its value: the bar is drawn in proportion to it. Negative values are drawn to the left in `diverging` mode, and as no bar otherwise. */
  value: number
  /** Makes the row a link. Only http(s) and relative addresses are followed. */
  href?: string
  /** An image before the label, such as a site's favicon or a country's flag. Only http(s), relative and `data:image/` addresses load. */
  icon?: string
}

/** Events fired by {@link BarList}, keyed for `addEventListener`. */
export interface BarListEventMap {
  'item-select': CustomEvent<{ item: BarListItem; index: number }>
}

export interface BarList {
  addEventListener: TypedAddEventListener<BarList, BarListEventMap>
  removeEventListener: TypedRemoveEventListener<BarList, BarListEventMap>
}

/** An address a row may follow or load: http(s), or relative to the page, once the characters a browser drops are removed. */
function safeUrl(value: string | undefined, allowImageData = false): string {
  // eslint-disable-next-line no-control-regex
  const url = (value ?? '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '')
  if (!url) return ''
  if (allowImageData && /^data:image\//i.test(url)) return url
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase()
  return scheme === undefined || scheme === 'http' || scheme === 'https' ? url : ''
}

/** Whether a link `target` opens another browsing context, which must not get a handle on this page. */
function opensElsewhere(target: string): boolean {
  const name = target.trim().toLowerCase()
  return name !== '' && name !== '_self' && name !== '_parent' && name !== '_top'
}

/**
 * A ranked list whose rows carry their own bar, like the top pages, referrers and countries of Vercel Analytics,
 * Plausible and Stripe, or Tremor's BarList: each row's background is a bar as long as its share of the largest value,
 * with the label (and an optional icon or link) on it and the value at the end.
 *
 * Rows are sorted largest first (`sort`), and `max-items` shows only the first rows with a button to show the rest.
 * `diverging` draws changes instead: bars grow right from a centre line for positive values and left for negative ones,
 * coloured apart, and the values carry their sign. Values are formatted in the page's language with `value-format`
 * (`Intl.NumberFormat` options, such as a percent or a currency), or by `valueFormatter`.
 *
 * A row is a link when it has an `href`. With `interactive`, rows without one are buttons that fire `item-select`, for a
 * dashboard that filters by the row picked. A screen reader hears a list of rows, each its label and its value.
 *
 * @tag c2-bar-list
 *
 * @event {CustomEvent<{ item: BarListItem; index: number }>} item-select - An `interactive` row was pressed. `index` is its position in `items`.
 *
 * @csspart list - The list of rows.
 * @csspart header - The row of column titles, shown when `label-header` or `value-header` is set.
 * @csspart row - One row.
 * @csspart bar - A row's bar.
 * @csspart label - A row's label, drawn on its bar.
 * @csspart icon - A row's icon.
 * @csspart value - A row's value.
 * @csspart toggle - The button that shows or hides the rows past `max-items`.
 * @csspart empty - The message shown when there are no items.
 *
 * @cssproperty {pixel} [--c2-bar-list--gap=6px] - Space between the rows.
 * @cssproperty {pixel} [--c2-bar-list__row--height=32px]
 * @cssproperty {pixel} [--c2-bar-list__row--column-gap=16px] - Space between the bar and the value.
 * @cssproperty {color} [--c2-bar-list__bar--background-color=#edf1fe]
 * @cssproperty {color} [--c2-bar-list__bar__hover--background-color=#dce4fd] - The bar of a link or an interactive row under the pointer.
 * @cssproperty {color} [--c2-bar-list__bar__positive--background-color=#dcfce7] - A positive bar in `diverging` mode.
 * @cssproperty {color} [--c2-bar-list__bar__negative--background-color=#fee2e2] - A negative bar in `diverging` mode.
 * @cssproperty {color} [--c2-bar-list__axis--color=#e4e4e7] - The centre line in `diverging` mode.
 * @cssproperty {border-radius} [--c2-bar-list__bar--border-radius=4px]
 * @cssproperty {padding} [--c2-bar-list__label--padding=0 8px] - Space around the label inside its bar.
 * @cssproperty {color} [--c2-bar-list__label--color=#18181b]
 * @cssproperty {font-size} [--c2-bar-list__label--font-size=14px]
 * @cssproperty {pixel} [--c2-bar-list__icon--size=16px]
 * @cssproperty {border-radius} [--c2-bar-list__icon--border-radius=4px]
 * @cssproperty {color} [--c2-bar-list__value--color=#18181b]
 * @cssproperty {font-size} [--c2-bar-list__value--font-size=14px]
 * @cssproperty {font-weight} [--c2-bar-list__value--font-weight=500]
 * @cssproperty {color} [--c2-bar-list__value__positive--color=#15803d] - A positive value in `diverging` mode.
 * @cssproperty {color} [--c2-bar-list__value__negative--color=#dc2626] - A negative value in `diverging` mode.
 * @cssproperty {color} [--c2-bar-list__header--color=#71717a]
 * @cssproperty {font-size} [--c2-bar-list__header--font-size=12px]
 * @cssproperty {font-weight} [--c2-bar-list__header--font-weight=500]
 * @cssproperty {color} [--c2-bar-list__toggle--color=rgb(2, 101, 220)]
 * @cssproperty {outline} [--c2-bar-list__row__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-bar-list')
export class BarList extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The rows. As an attribute, a JSON array of `{ label, value, href, icon }`. */
  @property({ converter: jsonPropertyConverter }) items: BarListItem[] = []

  /** The order of the rows: largest value first, smallest first, or as given. */
  @property() sort: 'descending' | 'ascending' | 'none' = 'descending'

  /** How many rows show before a button reveals the rest. 0 shows them all. */
  @property({ type: Number, attribute: 'max-items' }) maxItems = 0

  /** Draws changes: positive bars grow right from a centre line, negative ones left, and values carry their sign. */
  @property({ type: Boolean }) diverging = false

  /** `Intl.NumberFormat` options for the values, as an object or JSON: `{"style":"percent"}`, `{"style":"currency","currency":"EUR"}`. */
  @property({ converter: jsonPropertyConverter, attribute: 'value-format' }) valueFormat: Intl.NumberFormatOptions | undefined = undefined

  /** Formats a value instead of `value-format`. */
  @property({ attribute: false }) valueFormatter: ((value: number, item: BarListItem) => string) | undefined = undefined

  /** The value the longest bar stands for. Defaults to the largest value (in absolute terms when `diverging`). */
  @property({ type: Number }) max: number | undefined = undefined

  /** Makes the rows without an `href` buttons that fire `item-select`. */
  @property({ type: Boolean }) interactive = false

  /** Where row links open. */
  @property() target = ''

  /** Title above the labels; with `value-header`, shows a header row. */
  @property({ attribute: 'label-header' }) labelHeader = ''

  /** Title above the values. */
  @property({ attribute: 'value-header' }) valueHeader = ''

  /** The accessible name of the list. Defaults to "Ranking" in the page's language. */
  @property() label = ''

  @state() private expanded = false

  private readonly msg = new LocalizeController(this, barListMessages)

  private rows(): { item: BarListItem; index: number }[] {
    const valid = (Array.isArray(this.items) ? this.items : [])
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item && typeof item.label === 'string' && Number.isFinite(item.value))
    if (this.sort === 'descending') valid.sort((a, b) => b.item.value - a.item.value)
    else if (this.sort === 'ascending') valid.sort((a, b) => a.item.value - b.item.value)
    return valid
  }

  private format(value: number, item: BarListItem): string {
    if (this.valueFormatter) return this.valueFormatter(value, item)
    const options: Intl.NumberFormatOptions = { maximumFractionDigits: 2, ...(this.valueFormat ?? {}) }
    if (this.diverging) options.signDisplay ??= 'exceptZero'
    try {
      return new Intl.NumberFormat(this.msg.locale, options).format(value)
    } catch {
      return String(value)
    }
  }

  override render() {
    const rows = this.rows()
    const scale =
      typeof this.max === 'number' && this.max > 0 ? this.max : Math.max(0, ...rows.map(({ item }) => (this.diverging ? Math.abs(item.value) : item.value)))
    const limit = this.maxItems > 0 && !this.expanded ? this.maxItems : rows.length
    const shown = rows.slice(0, limit)
    const hidden = rows.length - shown.length
    const hasHeader = !!(this.labelHeader || this.valueHeader)
    return html`
      ${
        hasHeader
          ? html`<div class="header ${this.diverging ? 'header--diverging' : ''}" part="header" aria-hidden="true">
              <span class="header-label">${this.labelHeader}</span><span class="header-value">${this.valueHeader}</span>
            </div>`
          : nothing
      }
      ${
        rows.length
          ? html`<ul class="list ${this.diverging ? 'list--diverging' : ''}" part="list" aria-label=${this.label || this.msg.t('label')}>
              ${shown.map(({ item, index }) => this.renderRow(item, index, scale))}
            </ul>`
          : html`<p class="empty" part="empty">${this.msg.t('empty')}</p>`
      }
      ${
        this.maxItems > 0 && rows.length > this.maxItems
          ? html`<button class="toggle" part="toggle" type="button" aria-expanded=${this.expanded ? 'true' : 'false'} @click=${this.toggle}>
              ${this.expanded ? this.msg.t('showFewer') : this.msg.t('showAll', hidden + shown.length)}
            </button>`
          : nothing
      }
    `
  }

  private renderRow(item: BarListItem, index: number, scale: number) {
    // Outside `diverging`, a negative value has no bar rather than one that reads as a large positive share.
    const magnitude = this.diverging ? Math.abs(item.value) : Math.max(0, item.value)
    const share = scale > 0 ? Math.min(1, magnitude / scale) : 0
    const sign = item.value > 0 ? 'positive' : item.value < 0 ? 'negative' : 'zero'
    const width = `${(share * (this.diverging ? 50 : 100)).toFixed(3)}%`
    const icon = safeUrl(item.icon, true)
    const href = safeUrl(item.href)
    const value = this.format(item.value, item)
    const content = html`<span class="track"><span class="bar bar--${sign}" part="bar" style="--_share: ${width}"></span></span>
      <span class="label" part="label">
        ${icon ? html`<img class="icon" part="icon" src=${icon} alt="" loading="lazy" referrerpolicy="no-referrer" />` : nothing}
        <span class="label-text">${item.label}</span>
      </span>
      <span class="value value--${sign}" part="value">${value}</span>`
    let row
    if (href) {
      row = html`<a
        class="row row--action"
        part="row"
        href=${href}
        target=${this.target || nothing}
        rel=${opensElsewhere(this.target) ? 'noopener noreferrer' : nothing}
        >${content}</a
      >`
    } else if (this.interactive) {
      row = html`<button class="row row--action" part="row" type="button" @click=${() => this.select(item, index)}>${content}</button>`
    } else {
      row = html`<div class="row" part="row">${content}</div>`
    }
    return html`<li>${row}</li>`
  }

  private toggle(): void {
    this.expanded = !this.expanded
  }

  private select(item: BarListItem, index: number): void {
    this.dispatchEvent(new CustomEvent('item-select', { detail: { item, index } }))
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-bar-list': BarList
  }
}
