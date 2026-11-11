import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { redispatchEvent, SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { Highlight } from './highlight.js'
import { findBarMessages } from './messages.js'
import styles from './find-bar.scss?inline'

/** `detail` of the `match-change` event of {@link FindBar}. */
export interface FindBarMatchDetail {
  /** Matches across every `c2-highlight` of the target. */
  count: number
  /** Zero-based index of the current match across the target, `-1` for none. */
  index: number
}

/**
 * `detail` of the `replace` event of {@link FindBar}: what to replace, which the application does in its own text. Find
 * the matches of each highlight with its own options (`matchCase`, `wholeWord`, `ignoreAccents`, `words`), which the bar
 * counts with, so `index` points at the same match.
 */
export interface FindBarReplaceDetail {
  query: string
  replacement: string
  /** True for "Replace all": every match of every highlight in `highlights`. */
  all: boolean
  /** The `c2-highlight` elements of the target that hold at least one match. */
  highlights: Highlight[]
  /** For a single replace: the highlight holding the current match, and the match's index inside it (`-1` for all). */
  highlight?: Highlight
  index: number
}

/** Events fired by {@link FindBar}, keyed for `addEventListener`. */
export interface FindBarEventMap {
  'match-change': CustomEvent<FindBarMatchDetail>
  replace: CustomEvent<FindBarReplaceDetail>
  close: CustomEvent<void>
}

export interface FindBar {
  addEventListener: TypedAddEventListener<FindBar, FindBarEventMap>
  removeEventListener: TypedRemoveEventListener<FindBar, FindBarEventMap>
}

const PREVIOUS = svg`<path d="m6 15 6-6 6 6" />`
const NEXT = svg`<path d="m6 9 6 6 6-6" />`
const CLOSE = svg`<path d="M18 6 6 18M6 6l12 12" />`

/**
 * A find bar for a region: a query field, a "3 of 12" count, previous and next, match case and whole word toggles,
 * an optional replace row and Escape to close. It drives the `c2-highlight` elements of its target (`for` or
 * `target`: one highlight or an element holding several), setting their `query`, `match-case` and `whole-word` and
 * stepping `active-index` through their matches in document order. It never edits text: "Replace" fires `replace`
 * and the application changes its own text. Escape and the close button fire `close` and clear the highlights.
 *
 * Keyboard: Enter and Shift+Enter step to the next and previous match, Alt+C and Alt+W toggle match case and whole
 * word, Escape closes. In the replace field, Enter replaces the current match and Ctrl+Enter (⌘+Enter) every match.
 *
 * @tag c2-find-bar
 *
 * @slot actions - Extra commands after the navigation buttons, such as a "Filter to matches" toggle. Hidden when empty.
 *
 * @event {CustomEvent<FindBarMatchDetail>} match-change - Fired when the number of matches or the current match changes. Does not bubble.
 * @event {CustomEvent<FindBarReplaceDetail>} replace - Fired by "Replace" and "Replace all" (and Enter in the replace field) when there is a match. Does not bubble.
 * @event {CustomEvent<void>} close - Fired by Escape and the close button. Cancelable: cancelling keeps the highlights. Does not bubble.
 * @event {Event} input - Re-dispatched from the query field as the user types.
 *
 * @csspart bar - The bar's container.
 * @csspart field - The query field's box, holding the input, the count and the toggles.
 * @csspart input - The query input.
 * @csspart count - The "3 of 12" count, a polite live region.
 * @csspart toggle - The match case and whole word toggle buttons.
 * @csspart button - Every icon button: previous, next and close.
 * @csspart close - The close button, which also carries the `button` part.
 * @csspart actions - Wrapper of the `actions` slot.
 * @csspart replace-row - The replace row, shown with the `replace` attribute.
 * @csspart replace-input - The replacement input.
 * @csspart replace-button - The "Replace" and "Replace all" buttons.
 *
 * @cssproperty {color} [--c2-find-bar--background-color=#ffffff]
 * @cssproperty {border} [--c2-find-bar--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-find-bar--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-find-bar--box-shadow=0 4px 12px rgba(0, 0, 0, 0.08)]
 * @cssproperty {padding} [--c2-find-bar--padding=6px]
 * @cssproperty {gap} [--c2-find-bar--gap=4px]
 * @cssproperty {color} [--c2-find-bar--color=#18181b]
 * @cssproperty {font-size} [--c2-find-bar--font-size=14px]
 * @cssproperty {pixel} [--c2-find-bar__field--width=240px]
 * @cssproperty {pixel} [--c2-find-bar__field--height=32px]
 * @cssproperty {color} [--c2-find-bar__field--background-color=#ffffff]
 * @cssproperty {border} [--c2-find-bar__field--border=1px solid #d4d4d8] - Also the border of the replace buttons.
 * @cssproperty {border-radius} [--c2-find-bar__field--border-radius=6px]
 * @cssproperty {outline} [--c2-find-bar__field__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {color} [--c2-find-bar__count--color=#71717a]
 * @cssproperty {font-size} [--c2-find-bar__count--font-size=12px]
 * @cssproperty {pixel} [--c2-find-bar__button--size=28px]
 * @cssproperty {border-radius} [--c2-find-bar__button--border-radius=6px]
 * @cssproperty {color} [--c2-find-bar__button--color=#18181b]
 * @cssproperty {color} [--c2-find-bar__button__hover--background-color=rgba(24, 24, 27, 0.08)]
 * @cssproperty {outline} [--c2-find-bar__button__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {opacity} [--c2-find-bar__button__disabled--opacity=0.38]
 * @cssproperty {pixel} [--c2-find-bar__toggle--size=24px]
 * @cssproperty {color} [--c2-find-bar__toggle__pressed--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-find-bar__toggle__pressed--background-color=#edf1fe]
 * @cssproperty {padding} [--c2-find-bar__replace-button--padding=0 10px]
 */
@customElement('c2-find-bar')
export class FindBar extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Id of the element to search, looked up in the bar's own document or shadow root: one `c2-highlight` or an element holding several. */
  @property() for = ''

  /** The element to search, which wins over `for`. */
  @property({ attribute: false }) target?: Element | null

  /** The query, as typed in the field. */
  @property() value = ''

  /** Compares letter case exactly; the "Aa" toggle sets it. */
  @property({ type: Boolean, reflect: true, attribute: 'match-case' }) matchCase = false

  /** Only matches whole words; the "ab" toggle sets it. */
  @property({ type: Boolean, reflect: true, attribute: 'whole-word' }) wholeWord = false

  /** Shows the replace row. The replacing itself is the application's, on the `replace` event. */
  @property({ type: Boolean, reflect: true }) replace = false

  /** Text of the replace field. */
  @property() replacement = ''

  /** Accessible name of the query field. Empty: "Find" in the page language. */
  @property() label = ''

  @state() private count = 0
  @state() private current = -1
  /** False until the first count, so a server render and the first client render show no "No results". */
  @state() private counted = false

  private readonly msg = new LocalizeController(this, findBarMessages)
  private readonly slots = new SlotPresenceController(this, ['actions'])
  private highlights: Highlight[] = []
  private listened?: Element
  private observer?: MutationObserver
  private syncing = false
  private synced = false
  private pending = false
  private running?: Promise<void>
  private reported = '0:-1'

  /** Number of matches across the target. */
  get matchCount(): number {
    return this.count
  }

  /** Zero-based index of the current match across the target, `-1` for none. */
  get activeIndex(): number {
    return this.current
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (this.synced) void this.sync()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    // Leaves no marks behind; reconnecting re-applies the query.
    if (this.counted) this.clear()
    this.listen(undefined)
  }

  /** Focuses the query field and selects its text, the way pressing Ctrl+F again does in a browser; re-applies the query. */
  override focus(options?: FocusOptions): void {
    const input = this.renderRoot.querySelector<HTMLInputElement>('.c2-find-bar__input')
    input?.focus(options)
    input?.select()
    void this.sync()
  }

  /** Moves to the next match, wrapping after the last. */
  next(): void {
    this.step(1)
  }

  /** Moves to the previous match, wrapping before the first. */
  previous(): void {
    this.step(-1)
  }

  /** Clears the highlights of the target, keeping the query in the field. The next keystroke or `focus()` re-applies it. */
  clear(): void {
    // Disconnected, `for` cannot be looked up: clear the last highlights.
    for (const highlight of this.isConnected ? this.collect() : this.highlights) {
      highlight.query = ''
      highlight.activeIndex = -1
    }
    this.count = 0
    this.current = -1
    this.counted = false
    this.report()
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed)
    const query = changed.has('value') || changed.has('matchCase') || changed.has('wholeWord')
    if (!this.synced || query || changed.has('for') || changed.has('target')) {
      this.synced = true
      void this.sync(query)
    }
  }

  private resolveTarget(): Element | undefined {
    if (this.target) return this.target
    if (!this.for || !this.isConnected) return undefined
    return (this.getRootNode() as Document | ShadowRoot).getElementById?.(this.for) ?? undefined
  }

  private collect(): Highlight[] {
    const target = this.resolveTarget()
    this.listen(this.isConnected ? target : undefined)
    if (!target) return []
    if (target.localName === 'c2-highlight') return [target as Highlight]
    return Array.from(target.querySelectorAll('c2-highlight'))
  }

  /** `match-change` does not bubble: capture it on the target. The observer sees highlights added or removed. */
  private listen(target: Element | undefined): void {
    if (target === this.listened) return
    this.listened?.removeEventListener('match-change', this.onMatchChange, true)
    this.observer?.disconnect()
    this.listened = target
    if (!target) return
    target.addEventListener('match-change', this.onMatchChange, true)
    this.observer ??= new MutationObserver(this.onChange)
    this.observer.observe(target, { childList: true, subtree: true })
  }

  /** Ignores the bar's own `match-change` when it sits inside its target. */
  private readonly onMatchChange = (event: Event): void => {
    if ((event.target as Element).localName === 'c2-highlight') this.onChange()
  }

  private readonly onChange = (): void => {
    if (this.syncing || this.pending || !this.counted) return
    this.pending = true
    queueMicrotask(() => {
      this.pending = false
      void this.sync()
    })
  }

  private sync(restart = false): Promise<void> {
    const run = this.run(restart).finally(() => {
      if (this.running === run) this.running = undefined
    })
    return (this.running = run)
  }

  private async run(restart: boolean): Promise<void> {
    const list = this.collect()
    this.syncing = true
    for (const highlight of list) {
      highlight.query = this.value
      highlight.matchCase = this.matchCase
      highlight.wholeWord = this.wholeWord
    }
    await Promise.all(list.map((highlight) => highlight.updateComplete))
    this.syncing = false
    if (this.isConnected) this.recount(restart)
  }

  private recount(restart: boolean): void {
    this.highlights = this.collect()
    const count = this.highlights.reduce((sum, highlight) => sum + (highlight.matchCount ?? 0), 0)
    this.count = count
    this.counted = true
    if (count === 0) this.current = -1
    else if (restart || this.current < 0) this.current = 0
    else if (this.current >= count) this.current = count - 1
    this.place()
  }

  private step(delta: number): void {
    // Step through the new query's matches, not the old ones.
    if (this.running) {
      void this.running.then(() => this.step(delta))
      return
    }
    if (this.count === 0) return
    this.current = (this.current + delta + this.count) % this.count
    this.place()
  }

  private locate(index: number): [Highlight | undefined, number] {
    let offset = 0
    for (const highlight of this.highlights) {
      const count = highlight.matchCount ?? 0
      if (index < offset + count) return [highlight, index - offset]
      offset += count
    }
    return [undefined, -1]
  }

  private place(): void {
    const [owner, local] = this.locate(this.current)
    for (const highlight of this.highlights) highlight.activeIndex = highlight === owner ? local : -1
    this.report()
  }

  private report(): void {
    const key = `${this.count}:${this.current}`
    if (key === this.reported) return
    this.reported = key
    this.dispatchEvent(new CustomEvent('match-change', { detail: { count: this.count, index: this.current } }))
  }

  private close(): void {
    if (this.dispatchEvent(new CustomEvent('close', { cancelable: true }))) this.clear()
  }

  private fireReplace(all: boolean): void {
    if (this.count === 0) return
    const [highlight, index] = all ? [undefined, -1] : this.locate(this.current)
    const detail: FindBarReplaceDetail = {
      query: this.value,
      replacement: this.replacement,
      all,
      highlights: this.highlights.filter((item) => (item.matchCount ?? 0) > 0),
      highlight,
      index,
    }
    this.dispatchEvent(new CustomEvent('replace', { detail }))
  }

  private handleInput(event: InputEvent): void {
    this.value = (event.target as HTMLInputElement).value
    redispatchEvent(this, event)
  }

  private handleReplaceInput(event: InputEvent): void {
    this.replacement = (event.target as HTMLInputElement).value
  }

  private handleKeydown(event: KeyboardEvent): void {
    // Keys pressed in slotted actions belong to them.
    if (event.defaultPrevented || (event.target as Node).getRootNode() !== this.renderRoot) return
    if (event.key === 'Escape') {
      event.preventDefault()
      this.close()
    } else if (event.altKey && !event.ctrlKey && !event.metaKey && (event.code === 'KeyC' || event.code === 'KeyW')) {
      event.preventDefault()
      if (event.code === 'KeyC') this.matchCase = !this.matchCase
      else this.wholeWord = !this.wholeWord
    }
  }

  private handleQueryKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) return
    event.preventDefault()
    this.step(event.shiftKey ? -1 : 1)
  }

  private handleReplaceKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) return
    event.preventDefault()
    this.fireReplace(event.ctrlKey || event.metaKey)
  }

  private iconButton(part: string, label: string, icon: unknown, onClick: () => void, disabled = false) {
    return html`<button type="button" class="c2-find-bar__button" part=${part} aria-label=${label} ?disabled=${disabled} @click=${onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${icon}
      </svg>
    </button>`
  }

  private toggle(label: string, pressed: boolean, glyph: string, onClick: () => void) {
    return html`<button
      type="button"
      class="c2-find-bar__toggle"
      part="toggle"
      aria-label=${label}
      aria-pressed=${pressed ? 'true' : 'false'}
      @click=${onClick}
    >
      <span aria-hidden="true">${glyph}</span>
    </button>`
  }

  private renderCount() {
    if (!this.counted || !this.value) return nothing
    return this.count ? this.msg.t('count', this.current + 1, this.count) : this.msg.t('noResults')
  }

  override render() {
    const none = this.count === 0
    return html`<div class="c2-find-bar" part="bar" @keydown=${this.handleKeydown}>
      <div class="c2-find-bar__row">
        <div class="c2-find-bar__field" part="field">
          <input
            class="c2-find-bar__input"
            part="input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            aria-label=${this.label || this.msg.t('find')}
            placeholder=${this.msg.t('find')}
            .value=${this.value}
            @input=${this.handleInput}
            @keydown=${this.handleQueryKeydown}
          />
          <span class="c2-find-bar__count" part="count" role="status">${this.renderCount()}</span>
          ${this.toggle(this.msg.t('matchCase'), this.matchCase, this.msg.t('matchCaseGlyph'), () => (this.matchCase = !this.matchCase))}
          ${this.toggle(this.msg.t('wholeWord'), this.wholeWord, this.msg.t('wholeWordGlyph'), () => (this.wholeWord = !this.wholeWord))}
        </div>
        ${this.iconButton('button', this.msg.t('previous'), PREVIOUS, () => this.previous(), none)}
        ${this.iconButton('button', this.msg.t('next'), NEXT, () => this.next(), none)}
        <div class="c2-find-bar__actions" part="actions" ?hidden=${!this.slots.has('actions')}>
          <slot name="actions" @slotchange=${this.slots.handleSlotChange}></slot>
        </div>
        ${this.iconButton('button close', this.msg.t('close'), CLOSE, () => this.close())}
      </div>
      ${
        this.replace
          ? html`<div class="c2-find-bar__row" part="replace-row">
              <div class="c2-find-bar__field" part="field">
                <input
                  class="c2-find-bar__input"
                  part="replace-input"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label=${this.msg.t('replaceWith')}
                  placeholder=${this.msg.t('replaceWith')}
                  .value=${this.replacement}
                  @input=${this.handleReplaceInput}
                  @keydown=${this.handleReplaceKeydown}
                />
              </div>
              <button type="button" class="c2-find-bar__replace" part="replace-button" ?disabled=${none} @click=${() => this.fireReplace(false)}>
                ${this.msg.t('replace')}
              </button>
              <button type="button" class="c2-find-bar__replace" part="replace-button" ?disabled=${none} @click=${() => this.fireReplace(true)}>
                ${this.msg.t('replaceAll')}
              </button>
            </div>`
          : nothing
      }
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-find-bar': FindBar
  }
}
