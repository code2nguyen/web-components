import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { findMatches, type TextMatch } from './find-matches.js'
import styles from './highlight.scss?inline'

export { findMatches, queryTerms, type MatchOptions, type TextMatch } from './find-matches.js'

/** Events fired by {@link Highlight}, keyed for `addEventListener`. */
export interface HighlightEventMap {
  'match-change': CustomEvent<number>
}

export interface Highlight {
  addEventListener: TypedAddEventListener<Highlight, HighlightEventMap>
  removeEventListener: TypedRemoveEventListener<Highlight, HighlightEventMap>
}

/**
 * Marks the parts of its text that match a query, the way a search result list, a command palette or a filtered
 * table shows why a row matched. The text is the element's own text content; each match is drawn as a `<mark>`.
 *
 * Matching ignores letter case unless `match-case` is set, and can also ignore accents (`ignore-accents`), match
 * whole words only (`whole-word`) or every word of the query on its own (`words`). Several queries can be given at
 * once by assigning an array to the `query` property. `active-index` singles out one match, for a find bar that
 * steps through them; the match count is the `matchCount` property, the `match-change` event and the custom state
 * `c2-highlight:state(matched)`.
 *
 * The same matcher is exported as `findMatches(text, query, options)` for code that filters or ranks the items
 * it highlights.
 *
 * @tag c2-highlight
 *
 * @slot - The text to search. Only its text content is used: elements inside it are read as plain text.
 *
 * @event {CustomEvent<number>} match-change - Fired when the number of matches changes; `detail` is the new `matchCount`. Does not bubble.
 *
 * @csspart text - The wrapper around the rendered text.
 * @csspart mark - Every highlighted match.
 * @csspart active - The match at `active-index`, which also carries the `mark` part.
 *
 * @cssproperty {color} [--c2-highlight__mark--color=inherit]
 * @cssproperty {color} [--c2-highlight__mark--background-color=rgba(250, 204, 21, 0.4)]
 * @cssproperty {font-weight} [--c2-highlight__mark--font-weight=inherit]
 * @cssproperty {padding} [--c2-highlight__mark--padding=0]
 * @cssproperty {border-radius} [--c2-highlight__mark--border-radius=2px]
 * @cssproperty {text-decoration} [--c2-highlight__mark--text-decoration=none]
 * @cssproperty {box-shadow} [--c2-highlight__mark--box-shadow=none]
 *
 * @cssproperty {color} [--c2-highlight__mark__active--color=inherit]
 * @cssproperty {color} [--c2-highlight__mark__active--background-color=rgba(251, 146, 60, 0.6)]
 * @cssproperty {font-weight} [--c2-highlight__mark__active--font-weight=inherit]
 * @cssproperty {box-shadow} [--c2-highlight__mark__active--box-shadow=0 0 0 1px rgba(234, 88, 12, 0.8)]
 */
@customElement('c2-highlight')
export class Highlight extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  /**
   * Text to highlight. Assign an array to the property to highlight several queries at once. White space at either
   * end is kept, so `" app"` only matches after a space; an empty query highlights nothing.
   */
  @property() query: string | string[] = ''

  /** Compares letter case exactly. Off by default, so `app` matches `Apple`. */
  @property({ type: Boolean, reflect: true, attribute: 'match-case' }) matchCase = false

  /** Ignores accents and other diacritics, so `cafe` matches `café` and the other way round. */
  @property({ type: Boolean, reflect: true, attribute: 'ignore-accents' }) ignoreAccents = false

  /** Only highlights matches that are whole words, so `app` no longer matches inside `Apple`. */
  @property({ type: Boolean, reflect: true, attribute: 'whole-word' }) wholeWord = false

  /** Splits the query on white space and highlights every word on its own, the way a search box usually matches. */
  @property({ type: Boolean, reflect: true }) words = false

  /**
   * Zero-based index of the match drawn as the current one (part `active`), for a find bar stepping through the
   * matches; `-1` marks none. When it changes, the match is scrolled into view.
   */
  @property({ type: Number, attribute: 'active-index' }) activeIndex = -1

  /** Text read from the light DOM; `null` until the element is connected, so a server render keeps the slot. */
  private text: string | null = null
  private found: TextMatch[] = []
  private mutationObserver?: MutationObserver
  private reportedCount = 0

  /** Number of matches in the current text. */
  get matchCount(): number {
    return this.found.length
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (isServer) return
    this.readText()
    this.mutationObserver ??= new MutationObserver(() => this.readText())
    this.mutationObserver.observe(this, { childList: true, characterData: true, subtree: true })
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.mutationObserver?.disconnect()
  }

  private readText(): void {
    const text = this.textContent ?? ''
    if (text === this.text) return
    this.text = text
    this.requestUpdate()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed)
    if (this.text === null) return
    this.found = findMatches(this.text, this.query, {
      matchCase: this.matchCase,
      ignoreAccents: this.ignoreAccents,
      wholeWord: this.wholeWord,
      words: this.words,
    })
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed)
    const count = this.found.length
    if (count > 0) this.internals.states.add('matched')
    else this.internals.states.delete('matched')
    if (count !== this.reportedCount) {
      this.reportedCount = count
      this.dispatchEvent(new CustomEvent('match-change', { detail: count }))
    }
    if (changed.has('activeIndex') && changed.get('activeIndex') !== undefined) {
      this.renderRoot.querySelector('[part~="active"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }

  override render() {
    if (this.text === null) return html`<span class="c2-highlight" part="text"><slot></slot></span>`
    const text = this.text
    const parts: unknown[] = []
    let offset = 0
    this.found.forEach(({ start, end }, index) => {
      if (start > offset) parts.push(text.slice(offset, start))
      const active = index === this.activeIndex
      parts.push(
        html`<mark class="c2-highlight__mark ${active ? 'c2-highlight__mark--active' : ''}" part=${active ? 'mark active' : 'mark'}
          >${text.slice(start, end)}</mark
        >`,
      )
      offset = end
    })
    if (offset < text.length) parts.push(text.slice(offset))
    return html`<span class="c2-highlight" part="text">${parts.length ? parts : nothing}</span>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-highlight': Highlight
  }
}
