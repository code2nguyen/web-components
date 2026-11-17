import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { jsonPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { SlotPresenceController, redispatchEvent } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { Citation } from './citation'
import { citationListMessages } from './citation-list-messages'
import { opensElsewhere, safeIconUrl, safeSourceUrl, sourceHost } from './source-url'
import styles from './citation-list.scss?inline'

/** One source of an answer, as a `c2-citation` marker names it. */
export interface CitationSource {
  /** The source's number, as its markers show it. */
  index?: number
  /** The page cited. Only http(s) and relative addresses become a link. */
  href?: string
  /** The cited page's title. */
  title?: string
  /** The passage the answer draws on. */
  snippet?: string
  /** The site's name. Defaults to the address's host. */
  site?: string
  /** The site's icon. Only http(s), relative and `data:image/` addresses are loaded. */
  favicon?: string
}

/** What {@link CitationList.renderSource} is handed for each card. */
export interface CitationListSourceContext {
  source: CitationSource
  /** The number the card shows: the source's `index`, else its position from 1. */
  number: number
  /** The source's position in the list, from 0. */
  position: number
}

/** Draws the content of one source card; the list keeps the card, its link and its link to the markers. */
export type CitationListSourceRenderer = (context: CitationListSourceContext) => unknown

/** Events fired by {@link CitationList}, keyed for `addEventListener`. */
export interface CitationListEventMap {
  toggle: ToggleEvent
}

export interface CitationList {
  addEventListener: TypedAddEventListener<CitationList, CitationListEventMap>
  removeEventListener: TypedRemoveEventListener<CitationList, CitationListEventMap>
}

/** Attributes of a marker that change what the list shows. */
const WATCHED = ['index', 'href', 'source-title', 'snippet', 'site', 'favicon']

/** What makes two markers the same source: the address, else the number. */
const keyOf = (source: CitationSource) => source.href || (source.index === undefined ? '' : `#${source.index}`)

/** A marker's source, read from its properties once upgraded and from its attributes before. */
function readMarker(marker: Element): CitationSource {
  const element = marker as Partial<Citation>
  const attribute = (name: string) => marker.getAttribute(name) ?? ''
  const index = element.index ?? (marker.hasAttribute('index') ? Number(attribute('index')) : undefined)
  return {
    index: typeof index === 'number' && Number.isFinite(index) ? index : undefined,
    href: element.href ?? attribute('href'),
    title: element.sourceTitle ?? attribute('source-title'),
    snippet: element.snippet ?? attribute('snippet'),
    site: element.site ?? attribute('site'),
    favicon: element.favicon ?? attribute('favicon'),
  }
}

/**
 * The "Used 12 sources" line under an AI answer, like the sources of Perplexity and ChatGPT search: a stack of the
 * sites' icons and a count, which expands into a card per source. It collects the `c2-citation` markers of the answer
 * it sits in (its parent element, or the element named by `for`), one card per address however often it is cited, in
 * the order of their numbers, and follows the answer as markers are added, as they are while it streams. Pointing at a
 * card highlights the markers that cite it.
 *
 * The sources can also be handed over as `sources` (a JSON attribute or the property), which then wins over the
 * markers. Only http(s) and relative addresses become links, and only those (plus `data:image/`) load as icons.
 *
 * The cards sit in a native `<details>`, so the summary is a keyboard-reachable toggle and the browser's find-in-page
 * opens the list when it finds a source in it.
 *
 * @tag c2-citation-list
 *
 * @slot summary - Replaces the toggle's text ("Used 3 sources").
 * @slot footer - Action zone under the cards, such as a button that copies every source. Hidden when empty.
 *
 * @csspart summary - The toggle region: the stack of icons, the count and the chevron.
 * @csspart icons - The stack of site icons inside the toggle.
 * @csspart icon - One site's icon in the stack: its favicon, or the site's first letter when it has none.
 * @csspart count - The toggle's text region, holding the `summary` slot.
 * @csspart list - The region of source cards shown while the list is open.
 * @csspart source - One source card region: a link to the source when it has an address.
 * @csspart number - The source's number region on its card, matching its markers.
 * @csspart site - The site's name region on a card.
 * @csspart title - The page's title region on a card.
 * @csspart snippet - The quoted passage region on a card.
 * @csspart footer - The footer region wrapping the `footer` slot.
 *
 * @event {ToggleEvent} toggle - Re-dispatched from the native details after the list opens or closes (`newState` is `open` or `closed`).
 *
 * @cssproperty {padding} [--c2-citation-list__summary--padding=4px 10px 4px 4px]
 * @cssproperty {border} [--c2-citation-list__summary--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-citation-list__summary--border-radius=999px]
 * @cssproperty {color} [--c2-citation-list__summary--background-color=#ffffff]
 * @cssproperty {color} [--c2-citation-list__summary--color=#52525b]
 * @cssproperty {font-size} [--c2-citation-list__summary--font-size=12px]
 * @cssproperty {font-weight} [--c2-citation-list__summary--font-weight=500]
 * @cssproperty {color} [--c2-citation-list__summary__hover--background-color=#f4f4f5]
 * @cssproperty {outline} [--c2-citation-list__summary__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-citation-list__icon--size=20px]
 * @cssproperty {pixel} [--c2-citation-list__icon--overlap=6px] - How far each icon of the stack slides under the one before.
 * @cssproperty {color} [--c2-citation-list__icon--background-color=#f4f4f5] - Behind an icon, and the fill of a site's letter.
 * @cssproperty {color} [--c2-citation-list__icon--border-color=#ffffff] - The ring that separates the icons of the stack.
 * @cssproperty {pixel} [--c2-citation-list__list--margin-top=8px] - Space between the toggle and the cards.
 * @cssproperty {pixel} [--c2-citation-list__list--gap=8px] - Space between the cards.
 * @cssproperty {pixel} [--c2-citation-list__source--min-width=200px] - Narrowest a card gets before the grid drops a column.
 * @cssproperty {padding} [--c2-citation-list__source--padding=10px 12px]
 * @cssproperty {border} [--c2-citation-list__source--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-citation-list__source--border-radius=8px]
 * @cssproperty {color} [--c2-citation-list__source--background-color=#ffffff]
 * @cssproperty {color} [--c2-citation-list__source__hover--background-color=#f4f4f5] - Also while the card has keyboard focus.
 * @cssproperty {color} [--c2-citation-list__number--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-citation-list__number--color=#52525b]
 * @cssproperty {color} [--c2-citation-list__site--color=#71717a]
 * @cssproperty {font-size} [--c2-citation-list__site--font-size=12px]
 * @cssproperty {color} [--c2-citation-list__title--color=#18181b]
 * @cssproperty {font-size} [--c2-citation-list__title--font-size=14px]
 * @cssproperty {font-weight} [--c2-citation-list__title--font-weight=500]
 * @cssproperty {color} [--c2-citation-list__snippet--color=#52525b]
 * @cssproperty {font-size} [--c2-citation-list__snippet--font-size=12px]
 * @cssproperty {number} [--c2-citation-list__snippet--line-clamp=2] - Most lines of a card's snippet before it is cut with an ellipsis.
 */
@customElement('c2-citation-list')
export class CitationList extends LitElement {
  static override styles = unsafeCSS(styles)

  /**
   * The `id` of the element whose `c2-citation` markers are listed, in the same document or shadow root. Without it,
   * the markers of the list's parent element (past any wrapper that holds nothing but the list, such as a framework's
   * island element). Markers inside another component's shadow root are not found: hand those
   * sources over as `sources`.
   */
  @property() for = ''

  /**
   * The sources, handed over as a JSON attribute or the property (`[{ index, href, title, snippet, site, favicon }]`).
   * When it holds any, it wins over the markers, which are then only highlighted from the cards.
   */
  @property({ converter: jsonPropertyConverter }) sources: CitationSource[] = []

  /** Whether the cards are shown. Follows the toggle; set it to open or close the list. */
  @property({ type: Boolean }) open = false

  /** How many site icons the toggle stacks, one per site. */
  @property({ type: Number, attribute: 'max-icons' }) maxIcons = 3

  /** Where a card's link opens. A source leaves the page the reader is on, so a new tab by default. */
  @property() target = '_blank'

  /** Draws the content of each card (its number, site, title and snippet by default). */
  @property({ attribute: false }) renderSource?: CitationListSourceRenderer

  /** The sources the markers name, gathered on connection and on every change to them. */
  @state() private collected: CitationSource[] = []

  private readonly msg = new LocalizeController(this, citationListMessages)
  private readonly slots = new SlotPresenceController(this, ['footer'])
  private observer?: MutationObserver
  private highlightedMarkers: Citation[] = []

  override connectedCallback() {
    super.connectedCallback()
    // After the first render, so a server-rendered list hydrates as it was drawn.
    if (this.hasUpdated) this.watch()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.observer?.disconnect()
    this.observer = undefined
    this.highlight()
  }

  override firstUpdated() {
    this.watch()
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('for') && changed.get('for') !== undefined) this.watch()
  }

  /** The element whose markers are listed: the one `for` names, else the parent. */
  private scope(): Element | null {
    if (this.for) return (this.getRootNode() as Document | ShadowRoot).getElementById?.(this.for) ?? null
    // Past wrappers that hold nothing but the list, such as a framework's island element.
    let scope = this.parentElement
    while (scope?.parentElement && scope.childElementCount === 1) scope = scope.parentElement
    return scope
  }

  /** Observes the scope for markers coming, going and changing; until a `for` target exists, the whole root. */
  private watch() {
    this.observer?.disconnect()
    if (!this.isConnected) return
    const scope = this.scope()
    this.observer = new MutationObserver(() => (scope && scope.isConnected ? this.collect() : this.watch()))
    this.observer.observe(
      scope ?? this.getRootNode(),
      scope ? { childList: true, subtree: true, attributes: true, attributeFilter: WATCHED } : { childList: true, subtree: true },
    )
    this.collect()
  }

  private markers(): Citation[] {
    return [...(this.scope()?.querySelectorAll('c2-citation') ?? [])]
  }

  /** One source per address (or number), the first marker's details winning, in the order of their numbers. */
  private collect() {
    const byKey = new Map<string, CitationSource>()
    for (const marker of this.markers()) {
      const source = readMarker(marker)
      const key = keyOf(source)
      if (key && !byKey.has(key)) byKey.set(key, source)
    }
    const next = [...byKey.values()].sort((a, b) => (a.index ?? Infinity) - (b.index ?? Infinity))
    if (JSON.stringify(next) !== JSON.stringify(this.collected)) this.collected = next
  }

  /** Highlights the markers that cite `source`, and clears the ones highlighted before. */
  private highlight(source?: CitationSource) {
    for (const marker of this.highlightedMarkers) marker.highlighted = false
    const key = source && keyOf(source)
    this.highlightedMarkers = key ? this.markers().filter((marker) => keyOf(readMarker(marker)) === key) : []
    for (const marker of this.highlightedMarkers) marker.highlighted = true
  }

  private get shown(): CitationSource[] {
    return this.sources?.length ? this.sources : this.collected
  }

  private readonly handleToggle = (event: Event) => {
    this.open = (event.target as HTMLDetailsElement).open
    redispatchEvent(this, event)
  }

  override render() {
    const sources = this.shown
    if (!sources.length) return nothing
    return html`<details ?open=${this.open} @toggle=${this.handleToggle}>
      <summary part="summary">
        <span class="icons" part="icons" aria-hidden="true">${this.renderIcons(sources)}</span>
        <span class="count" part="count"><slot name="summary">${this.msg.t('summary', sources.length)}</slot></span>
        <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
      </summary>
      <ul class="list" part="list" aria-label=${this.msg.t('label')}>
        ${sources.map((source, position) => this.renderCard(source, position))}
      </ul>
      <div class="footer" part="footer" ?hidden=${!this.slots.has('footer')}>
        <slot name="footer" @slotchange=${this.slots.handleSlotChange}></slot>
      </div>
    </details>`
  }

  /** One icon per site, the first `maxIcons` of them. */
  private renderIcons(sources: CitationSource[]) {
    const seen = new Set<string>()
    const icons = []
    for (const source of sources) {
      const site = source.site || sourceHost(safeSourceUrl(source.href ?? ''))
      const icon = safeIconUrl(source.favicon ?? '')
      const key = icon || site
      if (!key || seen.has(key)) continue
      seen.add(key)
      icons.push(
        html`<span class="icon" part="icon"
          >${icon ? html`<img src=${icon} alt="" width="20" height="20" loading="lazy" referrerpolicy="no-referrer" />` : site.charAt(0).toUpperCase()}</span
        >`,
      )
      if (icons.length >= this.maxIcons) break
    }
    return icons
  }

  private renderCard(source: CitationSource, position: number) {
    const number = source.index ?? position + 1
    const href = safeSourceUrl(source.href ?? '')
    const site = source.site || sourceHost(href)
    const title = source.title || site || href
    const content = this.renderSource
      ? this.renderSource({ source, number, position })
      : html`<span class="head"
            ><span class="number" part="number">${number}</span>${site ? html`<span class="site" part="site">${site}</span>` : nothing}</span
          >
          ${source.title ? html`<span class="title" part="title">${source.title}</span>` : nothing}
          ${source.snippet ? html`<span class="snippet" part="snippet" id=${`snippet-${position}`}>${source.snippet}</span>` : nothing}`
    const name = this.msg.t('card', String(number), title)
    const point = () => this.highlight(source)
    const leave = () => this.highlight()
    return html`<li>
      ${
        href
          ? html`<a
              class="source"
              part="source"
              href=${href}
              target=${this.target || nothing}
              rel=${opensElsewhere(this.target) ? 'noopener noreferrer' : nothing}
              aria-label=${name}
              aria-describedby=${!this.renderSource && source.snippet ? `snippet-${position}` : nothing}
              @pointerenter=${point}
              @pointerleave=${leave}
              @focus=${point}
              @blur=${leave}
              >${content}</a
            >`
          : html`<div class="source" part="source" @pointerenter=${point} @pointerleave=${leave}>${content}</div>`
      }
    </li>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-citation-list': CitationList
  }
}
