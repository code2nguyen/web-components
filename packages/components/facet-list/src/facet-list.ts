import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { state } from 'lit/decorators.js'
import { live } from 'lit/directives/live.js'
import { property, jsonPropertyConverter, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { facetListMessages } from './messages'
import styles from './facet-list.scss?inline'

export { facetListMessages } from './messages'

/** One value of the facet. */
export interface FacetValue {
  /** What `include` and `exclude` hold for it. A number (an HTTP status, say) is read as its text. */
  value: string | number
  /** What is shown; defaults to `value`. */
  label?: string
  /** How many records have it. */
  count?: number
}

/** What `filter-change` carries: the selection as it is about to become. */
export interface FacetFilterDetail {
  include: string[]
  exclude: string[]
}

/** Events fired by {@link FacetList}, keyed for `addEventListener`. */
export interface FacetListEventMap {
  'filter-change': CustomEvent<FacetFilterDetail>
  toggle: Event
}

export interface FacetList {
  addEventListener: TypedAddEventListener<FacetList, FacetListEventMap>
  removeEventListener: TypedRemoveEventListener<FacetList, FacetListEventMap>
}

/**
 * One facet of a filter sidebar, like the facets of Datadog, Sentry and Kibana: an attribute's values with how many
 * records have each, to include or exclude from a search. A sidebar stacks one element per attribute.
 *
 * Each value has a checkbox that includes it, an Only button that makes it the only value included, and an Exclude
 * button that filters it out (Datadog's `-service:x`); an excluded value is struck through and its button includes it
 * again. Clear empties the selection. `include` and `exclude` hold the values; every change fires a cancelable
 * `filter-change` with the selection as it is about to become, then updates them, so cancel it to keep the facet
 * controlled.
 *
 * Values are sorted by count (`sort`), counts are shortened in the page's language, `searchable` adds a field that
 * filters a long list, and `max-items` shows the first values with a button to show the rest. The title is a
 * disclosure button that collapses the facet (`open`).
 *
 * The Only and Exclude buttons appear on hover and focus, but are always in the tab order and named for screen readers
 * ("Only checkout"); each checkbox is named by its value and count, and says when the value is excluded.
 *
 * @tag c2-facet-list
 *
 * @event {CustomEvent<FacetFilterDetail>} filter-change - The user changed the selection. `detail` is `include` and `exclude` as they are about to become. Cancelable.
 * @event {Event} toggle - The facet was opened or collapsed by the user.
 *
 * @csspart header - The row with the title and the Clear button.
 * @csspart title - The title, a button that opens and collapses the facet.
 * @csspart clear - The Clear button.
 * @csspart search - The field that filters the values.
 * @csspart value - One value's row.
 * @csspart checkbox - A value's checkbox.
 * @csspart label - A value's label.
 * @csspart count - A value's count.
 * @csspart action - The Only and Exclude buttons.
 * @csspart toggle - The button that shows or hides the values past `max-items`.
 *
 * @cssproperty {font-size} [--c2-facet-list--font-size=14px]
 * @cssproperty {color} [--c2-facet-list--color=#18181b]
 * @cssproperty {font-weight} [--c2-facet-list__title--font-weight=600]
 * @cssproperty {padding} [--c2-facet-list__header--padding=6px 4px]
 * @cssproperty {pixel} [--c2-facet-list__value--height=30px]
 * @cssproperty {padding} [--c2-facet-list__value--padding=0 4px]
 * @cssproperty {border-radius} [--c2-facet-list__value--border-radius=6px]
 * @cssproperty {color} [--c2-facet-list__value__hover--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-facet-list__count--color=#71717a]
 * @cssproperty {font-size} [--c2-facet-list__count--font-size=12px]
 * @cssproperty {pixel} [--c2-facet-list__checkbox--size=16px]
 * @cssproperty {border} [--c2-facet-list__checkbox--border=1px solid #bcbcc6]
 * @cssproperty {color} [--c2-facet-list__checkbox__selected--background-color=#476ef9]
 * @cssproperty {color} [--c2-facet-list__checkbox__mark--color=#ffffff] - The check and the dash drawn on a selected checkbox.
 * @cssproperty {color} [--c2-facet-list__excluded--color=#dc2626] - The excluded value's checkbox and label.
 * @cssproperty {pixel} [--c2-facet-list__action--size=24px]
 * @cssproperty {color} [--c2-facet-list__action--color=#71717a]
 * @cssproperty {color} [--c2-facet-list__action__hover--background-color=#e4e4e7]
 * @cssproperty {border} [--c2-facet-list__search--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-facet-list__search--border-radius=6px]
 * @cssproperty {color} [--c2-facet-list__link--color=rgb(2, 101, 220)] - The Clear and Show all buttons.
 * @cssproperty {outline} [--c2-facet-list__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-facet-list')
export class FacetList extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The facet's title: the attribute it filters by. */
  @property() label = ''

  /** The values. As an attribute, a JSON array of `{ value, label, count }`. */
  @property({ converter: jsonPropertyConverter }) values: FacetValue[] = []

  /** The values included. As an attribute, values separated by `;`. */
  @property({ converter: arrayPropertyConverter }) include: string[] = []

  /** The values excluded. As an attribute, values separated by `;`. */
  @property({ converter: arrayPropertyConverter }) exclude: string[] = []

  /** Whether the values are shown. */
  @property({ type: Boolean, reflect: true }) open = true

  /** Adds a field that filters the values. */
  @property({ type: Boolean }) searchable = false

  /** How many values show before a button reveals the rest. 0 shows them all. */
  @property({ type: Number, attribute: 'max-items' }) maxItems = 0

  /** The order of the values: largest count first, by label, or as given. */
  @property() sort: 'count' | 'label' | 'none' = 'count'

  /** `Intl.NumberFormat` options for the counts, as an object or JSON. Defaults to the compact notation (`12K`). */
  @property({ converter: jsonPropertyConverter, attribute: 'count-format' }) countFormat: Intl.NumberFormatOptions | undefined = undefined

  @state() private query = ''
  @state() private expanded = false

  private readonly msg = new LocalizeController(this, facetListMessages)
  private readonly internals = this.attachInternals()

  override connectedCallback(): void {
    super.connectedCallback()
    this.internals.role = 'group'
  }

  protected override updated(): void {
    this.internals.ariaLabel = this.label || this.msg.t('label')
  }

  private get includeList(): string[] {
    return Array.isArray(this.include) ? this.include : []
  }

  private get excludeList(): string[] {
    return Array.isArray(this.exclude) ? this.exclude : []
  }

  private sorted(): FacetValue[] {
    const list = (Array.isArray(this.values) ? this.values : [])
      .filter((item) => item && (typeof item.value === 'string' || typeof item.value === 'number'))
      .map((item) => (typeof item.value === 'number' ? { ...item, value: String(item.value) } : item))
    const name = (item: FacetValue) => item.label ?? String(item.value)
    if (this.sort === 'count') return [...list].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    if (this.sort === 'label') return [...list].sort((a, b) => name(a).localeCompare(name(b), this.msg.locale))
    return list
  }

  private formatCount(count: number | undefined): string {
    if (typeof count !== 'number' || !Number.isFinite(count)) return ''
    try {
      return new Intl.NumberFormat(this.msg.locale, this.countFormat ?? { notation: 'compact', maximumFractionDigits: 1 }).format(count)
    } catch {
      return String(count)
    }
  }

  /** Announces the selection about to be set, then sets it unless the event was cancelled. */
  private commit(include: string[], exclude: string[]): void {
    const allowed = this.dispatchEvent(
      new CustomEvent<FacetFilterDetail>('filter-change', { cancelable: true, detail: { include: [...include], exclude: [...exclude] } }),
    )
    if (!allowed) {
      // Draw the checkboxes back to the selection that stands.
      this.requestUpdate()
      return
    }
    this.include = include
    this.exclude = exclude
  }

  private toggleInclude(value: string): void {
    const included = this.includeList.includes(value)
    this.commit(
      included ? this.includeList.filter((item) => item !== value) : [...this.includeList, value],
      this.excludeList.filter((item) => item !== value),
    )
  }

  private only(value: string): void {
    this.commit([value], [])
  }

  private toggleExclude(value: string): void {
    const excluded = this.excludeList.includes(value)
    this.commit(
      this.includeList.filter((item) => item !== value),
      excluded ? this.excludeList.filter((item) => item !== value) : [...this.excludeList, value],
    )
  }

  private clear(): void {
    this.commit([], [])
  }

  private toggleOpen(): void {
    this.open = !this.open
    this.dispatchEvent(new Event('toggle'))
  }

  override render() {
    const title = this.label || this.msg.t('label')
    const selected = this.includeList.length + this.excludeList.length > 0
    const query = this.query.trim().toLowerCase()
    const all = this.sorted()
    const matching = query ? all.filter((item) => (item.label ?? String(item.value)).toLowerCase().includes(query)) : all
    const limit = this.maxItems > 0 && !this.expanded && !query ? this.maxItems : matching.length
    // A value in the selection is always shown, even past `max-items`, so an active filter can be seen and undone.
    const selection = new Set([...this.includeList, ...this.excludeList])
    const shown = [...matching.slice(0, limit), ...matching.slice(limit).filter((item) => selection.has(String(item.value)))]
    return html`
      <div class="header" part="header">
        <button class="title" part="title" type="button" aria-expanded=${this.open ? 'true' : 'false'} aria-controls="body" @click=${this.toggleOpen}>
          <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
          <span>${title}</span>
        </button>
        ${
          selected
            ? html`<button class="link clear" part="clear" type="button" aria-label=${this.msg.t('clearLabel', title)} @click=${this.clear}>
                ${this.msg.t('clear')}
              </button>`
            : nothing
        }
      </div>
      <div class="body" id="body" ?hidden=${!this.open}>
        ${
          this.searchable
            ? html`<input
                class="search"
                part="search"
                type="search"
                autocomplete="off"
                .value=${this.query}
                placeholder=${this.msg.t('search')}
                aria-label=${this.msg.t('search')}
                @input=${(event: Event) => (this.query = (event.target as HTMLInputElement).value)}
              />`
            : nothing
        }
        <ul class="values" role="list">
          ${shown.map((item) => this.renderValue(item))}
        </ul>
        ${query && !matching.length ? html`<p class="empty">${this.msg.t('noMatches')}</p>` : nothing}
        ${
          !query && this.maxItems > 0 && matching.length > this.maxItems
            ? html`<button
                class="link more"
                part="toggle"
                type="button"
                aria-expanded=${this.expanded ? 'true' : 'false'}
                @click=${() => (this.expanded = !this.expanded)}
              >
                ${this.expanded ? this.msg.t('showFewer') : this.msg.t('showAll', matching.length)}
              </button>`
            : nothing
        }
      </div>
    `
  }

  private renderValue(item: FacetValue) {
    const value = String(value)
    const label = item.label ?? value
    const count = this.formatCount(item.count)
    const included = this.includeList.includes(value)
    const excluded = this.excludeList.includes(value)
    const name = this.msg.t('valueName', label, count)
    return html`<li class="value ${excluded ? 'value--excluded' : ''}" part="value">
      <label class="pick">
        <input
          class="checkbox"
          part="checkbox"
          type="checkbox"
          .checked=${live(included)}
          .indeterminate=${live(excluded)}
          aria-label=${excluded ? this.msg.t('excluded', name) : name}
          @change=${() => this.toggleInclude(value)}
        />
        <span class="label" part="label">${label}</span>
      </label>
      <span class="actions">
        <button class="action action--only" part="action" type="button" aria-label=${this.msg.t('only', label)} @click=${() => this.only(value)}>
          ${this.msg.t('onlyText')}
        </button>
        <button
          class="action"
          part="action"
          type="button"
          aria-label=${excluded ? this.msg.t('include', label) : this.msg.t('exclude', label)}
          @click=${() => this.toggleExclude(value)}
        >
          ${
            excluded
              ? html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4v8M4 8h8" /></svg>`
              : html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8h8" /></svg>`
          }
        </button>
      </span>
      ${count ? html`<span class="count" part="count" aria-hidden="true">${count}</span>` : nothing}
    </li>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-facet-list': FacetList
  }
}
