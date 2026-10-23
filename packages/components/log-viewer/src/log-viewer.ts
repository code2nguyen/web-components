import { LitElement, html, nothing, unsafeCSS, type PropertyDeclaration, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { SearchField } from '@c2n/search-field'
import { columnOrder, matchesFilter, validateEntries, validateFilter } from './log-model.js'
import type { LogEntry, LogFilter, LogFilterMode } from './log-model.js'
import { LineIndex, textLayout, type TextLayout } from './log-position.js'
import { LogTokenLines, type LogPiece } from './log-tokens.js'
import { cellMatches, countMatches, findPattern, markPieces, type FindMark, type FindMatch } from './log-find.js'
import { logViewerMessages } from './messages.js'
import styles from './log-viewer.scss?inline'

export type { LogEntry, LogFilter, LogFilterMode } from './log-model.js'

const FRAME_INTERVAL = 16
// Ticks closer than this many pixels on the find ruler share one mark, so a query matching every entry draws a bounded number.
const RULER_STEP = 3

// The find bar's controls load when the viewer is first focused or find opens: a viewer nobody uses does not pay for them.
let findModules: Promise<unknown> | undefined
const loadFindModules = () => (findModules ??= Promise.all([import('@c2n/search-field'), import('@c2n/icon-button')]))
interface LayoutEntry {
  source: number
  highlighted: boolean
  cells: TextLayout[]
  height: number
}

/** Detail of `entry-click`: the clicked entry and its position among the retained entries (`entryCount`), whatever the filter. */
export interface LogViewerEntryEventDetail {
  entry: LogEntry
  index: number
}

/** Events fired by {@link LogViewer}, keyed for `addEventListener`. */
export interface LogViewerEventMap {
  'entry-click': CustomEvent<LogViewerEntryEventDetail>
  'entry-activate': CustomEvent<LogViewerEntryEventDetail>
}

/** Options of {@link LogViewer.find}. */
export interface LogViewerFindOptions {
  matchCase?: boolean
}

export interface LogViewer {
  addEventListener: TypedAddEventListener<LogViewer, LogViewerEventMap>
  removeEventListener: TypedRemoveEventListener<LogViewer, LogViewerEventMap>
}

/**
 * A text-only, variable-height virtual log viewport. Filters are controlled by the application; find is the viewer's own.
 *
 * The viewport is one Tab stop holding an active entry. With it focused, Arrow Up/Down move the active entry (a tall
 * entry scrolls line by line until its end is in view), Page Up/Down move it by a viewport, Home jumps to the first
 * entry and End to the last, resuming following the tail (Ctrl/Command variants also work), and Enter fires
 * `entry-activate`. Clicking an entry makes it active.
 *
 * Ctrl/Command+F inside the viewer opens the find bar: it searches every displayed entry, not only the rendered ones,
 * marks the matches and moves the active entry to the current one. Enter and Shift+Enter (or F3, Ctrl/Command+G) step
 * through the matches, Alt+C toggles match case, Escape closes the bar; Ctrl/Command+F pressed again in the bar is left
 * to the browser. Set `find-shortcut="false"` to leave Ctrl/Command+F to the page; `find()` still opens the bar.
 * @tag c2-log-viewer
 * @event {CustomEvent<LogViewerEntryEventDetail>} entry-click - Fired when an entry is clicked, except on its copy button or at the end of a drag or text selection. Bubbles.
 * @event {CustomEvent<LogViewerEntryEventDetail>} entry-activate - Fired when Enter is pressed on the active entry, with the same detail as `entry-click`. Bubbles.
 * @cssproperty {CSS value} [--c2-log-viewer--height=480px] - Viewport height
 * @cssproperty {color} [--c2-log-viewer--background=#0b1220] - Terminal surface
 * @cssproperty {color} [--c2-log-viewer--color=#d3deee] - Text color
 * @cssproperty {CSS value} [--c2-log-viewer--font-family=ui-monospace, monospace] - Text font
 * @cssproperty {CSS value} [--c2-log-viewer--font-size=13px] - Text size
 * @cssproperty {CSS value} [--c2-log-viewer--line-height=1.65] - Line spacing
 * @cssproperty {CSS value} [--c2-log-viewer--border=1px solid #263449] - Outer edge
 * @cssproperty {CSS value} [--c2-log-viewer--border-radius=12px] - Outer corners
 * @cssproperty {CSS value} [--c2-log-viewer__message--min-width=240px] - Minimum primary column width
 * @cssproperty {CSS value} [--c2-log-viewer__cell--padding=8px 12px] - Attribute cell inset included in row measurements
 * @cssproperty {CSS value} [--c2-log-viewer__text--inset=12px] - Horizontal inset for continuous text
 * @cssproperty {CSS value} [--c2-log-viewer__empty--padding=24px] - Empty state inset
 * @cssproperty {color} [--c2-log-viewer__empty--color=#94a3b8] - Empty state text
 * @cssproperty {CSS value} [--c2-log-viewer__viewport__focus--outline=2px solid #60a5fa] - Keyboard focus indicator
 * @cssproperty {color} [--c2-log-viewer__timestamp--color=#94a3b8] - Timestamp text
 * @cssproperty {color} [--c2-log-viewer__attribute--color=#a5b4cc] - Secondary attribute text
 * @cssproperty {color} [--c2-log-viewer__level--color=#c4b5fd] - Unclassified level text
 * @cssproperty {color} [--c2-log-viewer__level__info--color=#6ee7b7] - Info level text
 * @cssproperty {color} [--c2-log-viewer__level__warning--color=#fcd34d] - Warn and warning level text
 * @cssproperty {color} [--c2-log-viewer__level__error--color=#fda4af] - Error and fatal level text
 * @cssproperty {CSS value} [--c2-log-viewer__entry--box-shadow=inset 0 -1px 0 #1b293d] - Subtle row divider without changing measured geometry
 * @cssproperty {color} [--c2-log-viewer__entry__hover--background=#142238] - Hovered row surface
 * @cssproperty {color} [--c2-log-viewer__entry__highlighted--background=#17304c] - Matching entry surface in highlight mode
 * @cssproperty {CSS value} [--c2-log-viewer__entry__highlighted--box-shadow=inset 3px 0 0 #60a5fa] - Matching entry accent without changing measured geometry
 * @cssproperty {color} [--c2-log-viewer__entry__active--background=#1b2d47] - Active entry surface
 * @cssproperty {CSS value} [--c2-log-viewer__entry__active--box-shadow=inset 0 0 0 1px #60a5fa] - Active entry ring while the viewport has keyboard focus, without changing measured geometry
 * @cssproperty {color} [--c2-log-viewer__find-match--background=rgba(250, 204, 21, 0.26)] - Find match surface
 * @cssproperty {color} [--c2-log-viewer__find-match--color=#fef3c7] - Find match text
 * @cssproperty {color} [--c2-log-viewer__find-match__current--background=#fbbf24] - Current find match surface
 * @cssproperty {color} [--c2-log-viewer__find-match__current--color=#1c1300] - Current find match text
 * @cssproperty {CSS value} [--c2-log-viewer__find--inset=8px] - Find bar offset from the top and right edges
 * @cssproperty {CSS value} [--c2-log-viewer__find--padding=6px] - Find bar inset
 * @cssproperty {CSS value} [--c2-log-viewer__find--gap=4px] - Space between the find bar controls
 * @cssproperty {color} [--c2-log-viewer__find--background=#142238] - Find bar surface
 * @cssproperty {CSS value} [--c2-log-viewer__find--border=1px solid #2c4366] - Find bar edge
 * @cssproperty {CSS value} [--c2-log-viewer__find--border-radius=8px] - Find bar corners
 * @cssproperty {CSS value} [--c2-log-viewer__find--box-shadow=0 8px 24px rgba(0, 0, 0, 0.45)] - Find bar elevation
 * @cssproperty {CSS value} [--c2-log-viewer__find--font-family=system-ui, sans-serif] - Find bar text font
 * @cssproperty {CSS value} [--c2-log-viewer__find--font-size=12px] - Find counter text size
 * @cssproperty {color} [--c2-log-viewer__find--color=#a5b4cc] - Find counter text
 * @cssproperty {color} [--c2-log-viewer__find__empty--color=#fda4af] - Find counter text when nothing matches
 * @cssproperty {CSS value} [--c2-log-viewer__find-field--width=200px] - Find field width
 * @cssproperty {color} [--c2-log-viewer__find-field--background=#0b1220] - Find field surface
 * @cssproperty {color} [--c2-log-viewer__find-field--color=#e5edf8] - Find field text
 * @cssproperty {CSS value} [--c2-log-viewer__find-field--border=1px solid #2c4366] - Find field edge
 * @cssproperty {CSS value} [--c2-log-viewer__find-field__focus--border=1px solid #60a5fa] - Focused find field edge
 * @cssproperty {color} [--c2-log-viewer__find-icon--color=#8aa0bd] - Find field magnifier, clear icon and placeholder
 * @cssproperty {CSS value} [--c2-log-viewer__find-button--size=28px] - Find bar button size
 * @cssproperty {color} [--c2-log-viewer__find-button--color=#dbeafe] - Find bar button icon
 * @cssproperty {color} [--c2-log-viewer__find-button__hover--background=#2a4263] - Hovered find bar button surface
 * @cssproperty {color} [--c2-log-viewer__find-button__selected--background=#2a4263] - Pressed match case button surface
 * @cssproperty {CSS value} [--c2-log-viewer__find-button__focus--outline=2px solid #60a5fa] - Find bar button keyboard focus
 * @cssproperty {CSS value} [--c2-log-viewer__ruler--width=6px] - Width of the find ruler along the right edge
 * @cssproperty {color} [--c2-log-viewer__ruler--color=rgba(250, 204, 21, 0.55)] - Find ruler tick of an entry with matches
 * @cssproperty {color} [--c2-log-viewer__ruler__current--color=#fbbf24] - Find ruler tick of the current match
 * @cssproperty {CSS value} [--c2-log-viewer__copy--size=28px] - Copy button size
 * @cssproperty {CSS value} [--c2-log-viewer__copy--icon-size=55%] - Copy and success icon width and height
 * @cssproperty {number} [--c2-log-viewer__copy--stroke-width=1.8] - Copy and success SVG stroke width
 * @cssproperty {CSS value} [--c2-log-viewer__copy--inset=8px] - Copy button offset from viewport edges
 * @cssproperty {CSS value} [--c2-log-viewer__copy--padding-top=4px] - Space above the copy button within an entry
 * @cssproperty {color} [--c2-log-viewer__copy--background=transparent] - Copy button surface
 * @cssproperty {color} [--c2-log-viewer__copy--color=#dbeafe] - Copy icon color
 * @cssproperty {CSS value} [--c2-log-viewer__copy--border=none] - Copy button edge
 * @cssproperty {CSS value} [--c2-log-viewer__copy--border-radius=6px] - Copy button corners
 * @cssproperty {color} [--c2-log-viewer__copy__hover--background=#2a4263] - Hovered copy button surface
 * @cssproperty {CSS value} [--c2-log-viewer__copy__focus--outline=2px solid #60a5fa] - Copy button keyboard focus
 * @cssproperty {color} [--c2-log-viewer__token--color=#93c5fd] - Quoted values, numbers, URLs and recognizable IDs in log text
 * @csspart token - Colored log token; severity and timestamp tokens use the existing level and timestamp colors
 * @csspart copy-icon - Copy and success SVG icon
 * @csspart copy-button - Copy the complete message of a visible entry; revealed on hover, tap or keyboard focus
 * @csspart highlight - Matching visible entry or plain text slice in highlight mode
 * @csspart active - The active entry (tabular) or its plain text slice
 * @csspart find-bar - The find bar, built from c2-search-field and c2-icon-button
 * @csspart find-match - A find match in the text; the current one also has the `current` part
 * @csspart current - The current find match, or its tick on the ruler
 * @csspart ruler - Find match ticks along the right edge
 * @csspart viewport - Keyboard accessible scroll surface: a tree grid of entries with an active entry
 * @csspart content - Virtual content and its total scroll extent
 * @csspart entry - Visible tabular entry
 * @csspart cell - Attribute column containing its sticky text
 * @csspart text - Plain text content
 * @csspart empty - Empty state
 */
@customElement('c2-log-viewer')
export class LogViewer extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Align attributes vertically in columns; false displays concatenated entry text. */
  @property({ type: Boolean, reflect: true }) tabular = true
  /** Break text to fit the available column or viewport width. */
  @property({ type: Boolean, reflect: true }) wrap = false
  /** Ordered attribute names. Empty discovers attributes automatically, with message last. */
  @property({ attribute: false }) columns: readonly string[] = []
  /** Open the find bar on Ctrl/Command+F while focus is inside the viewer. `false` leaves the shortcut to the page. */
  @property({ type: Boolean, attribute: 'find-shortcut' }) findShortcut = true

  private readonly msg = new LocalizeController(this, logViewerMessages)

  private entries: LogEntry[] = []
  private filter: LogFilter | null = null
  private filterMode: LogFilterMode = 'filter'
  private matchCount = 0
  private layout: LayoutEntry[] = []
  private index = new LineIndex()
  private keys: string[] = ['message']
  private discoveredKeys = new Set<string>()
  private widths: number[] = [240]
  private attributeWidths = new Map<string, number>()
  private lineHeight = 21.45
  private textWidth = 240
  private inset = 12
  private extent = 240
  private widestLine = 0
  private viewTop = 0
  private viewLeft = 0
  private viewportHeight = 480
  private observer?: ResizeObserver
  private frame = 0
  private needsLayout = true
  private rebuild = true
  private processed = 0
  private signature = ''
  private resetAnchor = false
  private follow = true
  // Set by scrollToStart(): appends keep the viewport at the top, even while it is also the bottom, until the user scrolls.
  private pinned = false
  private appended = false
  private deferred = false
  private lastUpdate = -Infinity
  private flush?: () => void
  private canvas?: CanvasRenderingContext2D | null
  private font = ''
  private measurements = new Map<string, number>()
  private lineWidths = new WeakMap<LogEntry, { text: string; widths: number[] }>()
  private tokenLines = new WeakMap<TextLayout, LogTokenLines>()
  private copiedSource: number | null = null
  private hoveredSource: number | null = null
  private press?: { x: number; y: number }
  private copyStatus = ''
  private copyVersion = 0
  private copyTimer?: ReturnType<typeof setTimeout>
  // The live region speaks for whichever of copy and find changed last.
  private status: 'copy' | 'find' = 'copy'
  private cellPaddingTop = 0
  private cellPaddingLeft = 0
  /** Source index of the active entry, or -1. */
  private active = -1
  private findOpen = false
  private findQuery = ''
  private matchCase = false
  private pattern: RegExp | null = null
  /** Matches per layout position, and the running total before each position (built on demand). */
  private findCounts: number[] = []
  private findPrefix: number[] | null = null
  private findTotal = 0
  private findCurrent: { source: number; ordinal: number } | null = null
  private findStatus = ''
  // A new query is matched in the next update, after any pending layout, so a filter change and a query can arrive together.
  private findPending = false
  // Each open or close takes a number, so a close (or a newer open) made while the controls load cancels the open.
  private findRequest = 0
  private findLoading = false
  // An activeIndex set before its entry is laid out is resolved in the next update.
  private revealActive = false
  // Match counts per source entry, valid while the pattern and the displayed columns stay the same: a resize or a
  // font load rebuilds the layout but not the text being searched.
  private countCache = new Map<number, number>()
  private countKey = ''
  private matchCache = new WeakMap<LayoutEntry, { pattern: RegExp; matches: FindMatch[] }>()
  private ruler: number[] | null = null

  /** Number of retained entries, including entries hidden by the current filter. */
  get entryCount(): number {
    return this.entries.length
  }
  /** Number of entries matching the current filter. */
  get filteredCount(): number {
    return this.matchCount
  }

  /**
   * Index of the active entry among the retained entries (as in `entry-click`), or -1. Setting it to a displayed
   * entry makes that entry active and scrolls it into view; any other value clears it (after `updateComplete` for an
   * entry the filter hides).
   */
  get activeIndex(): number {
    return this.active
  }
  set activeIndex(index: number) {
    this.active = Number.isInteger(index) && index >= 0 && index < this.entries.length ? index : -1
    this.revealActive = this.active >= 0
    this.requestUpdate()
  }

  /** Number of find matches across the displayed entries; 0 while find is closed. */
  get findMatchCount(): number {
    return this.findOpen ? this.findTotal : 0
  }

  /** Position of the current find match among `findMatchCount`, or -1. */
  get findMatchIndex(): number {
    return this.findOpen && this.findCurrent ? this.globalIndex(this.findCurrent) : -1
  }

  /** Open the find bar with `query` (an empty string clears it) and move to the first match from the active entry or the top of the view. */
  async find(query: string, options: LogViewerFindOptions = {}): Promise<void> {
    if (typeof query !== 'string') throw new TypeError('query must be a string')
    if (options.matchCase !== undefined) this.matchCase = Boolean(options.matchCase)
    await this.openFind(query, false)
    // Matching waits for the first layout, which can take one more update than the open itself.
    for (let attempt = 0; this.findPending && attempt < 3; attempt++) await this.updateComplete
  }

  /** Move to the next find match, wrapping after the last. Returns false when there is none. */
  findNext(): boolean {
    return this.stepFind(1)
  }

  /** Move to the previous find match, wrapping before the first. Returns false when there is none. */
  findPrevious(): boolean {
    return this.stepFind(-1)
  }

  /** Close the find bar and remove its marks. The query is kept for the next time it opens. */
  closeFind(): void {
    this.findRequest++
    if (!this.findOpen) return
    const focused = this.renderRoot.querySelector('[part="find-bar"]')?.matches(':focus-within')
    this.findOpen = false
    this.findStatus = ''
    this.pattern = null
    this.findPending = false
    this.countFind(0)
    this.requestUpdate()
    if (focused) this.viewport?.focus()
  }

  /** Append an atomic snapshot of one entry or a batch. Existing data is retained while filtered. */
  appendEntries(input: LogEntry | readonly LogEntry[]): void {
    const batch = validateEntries(input)
    if (!batch.length) return
    // Scroll position and tail following are read once per frame in willUpdate; reading layout here would force it per append.
    for (const entry of batch) {
      this.entries.push(entry)
      for (const key in entry) this.discoveredKeys.add(key)
    }
    this.appended = true
    this.needsLayout = true
    if (!this.isUpdatePending) this.deferred = this.hasUpdated
    super.requestUpdate()
  }

  /** Replace criteria; filter hides nonmatches, highlight marks matches while keeping every entry visible. null clears criteria. */
  setFilter(filter: LogFilter | null, mode: LogFilterMode = 'filter'): void {
    if (mode !== 'filter' && mode !== 'highlight') throw new TypeError('Filter mode must be filter or highlight')
    this.filter = validateFilter(filter)
    this.filterMode = this.filter === null ? 'filter' : mode
    this.rebuild = true
    this.resetAnchor = this.filterMode === 'filter'
    if (this.resetAnchor) this.toTop()
    else if (this.viewport) this.viewTop = this.viewport.scrollTop
    this.follow = false
    this.needsLayout = true
    this.requestUpdate()
  }

  /** Clear retained entries; the current filter remains active. */
  clear(): void {
    this.entries = []
    this.countCache.clear()
    this.active = -1
    this.findCurrent = null
    this.discoveredKeys.clear()
    this.copyVersion++
    this.copiedSource = null
    this.copyStatus = ''
    clearTimeout(this.copyTimer)
    // Text widths depend on the font, not the entries: an application that replaces its whole snapshot reuses them.
    this.rebuild = true
    this.resetAnchor = true
    this.toTop()
    this.needsLayout = true
    this.requestUpdate()
  }

  /** Scroll to the first matching entry and hold it there through appends until the user scrolls or `scrollToEnd()` is called. */
  scrollToStart(): void {
    this.follow = false
    this.pinned = true
    this.toTop()
    this.requestUpdate()
  }

  /** Scroll to the newest matching content and resume following subsequent appends. */
  scrollToEnd(): void {
    if (this.viewport) this.viewTop = this.viewport.scrollTop
    this.follow = true
    this.pinned = false
    this.requestUpdate()
  }

  // Instant even under an author's smooth scroll-behavior: an animated scroll would race the virtual window.
  private toTop(): void {
    this.viewTop = 0
    this.viewport?.scrollTo({ top: 0, behavior: 'instant' })
  }

  private get viewport(): HTMLElement | null {
    return this.renderRoot?.querySelector<HTMLElement>('[part="viewport"]') ?? null
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (this.hasUpdated) this.observe()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer?.disconnect()
    cancelAnimationFrame(this.frame)
    this.frame = 0
    // Render a waiting append now rather than from a timer firing after removal; cancelling would leave Lit's update pending.
    this.flush?.()
    clearTimeout(this.copyTimer)
    this.copyVersion++
    this.copiedSource = null
    this.copyStatus = ''
  }

  protected override firstUpdated(): void {
    this.observe()
    void document.fonts.ready.then(() => {
      if (this.isConnected) this.reflow()
    })
  }

  private observe(): void {
    this.observer?.disconnect()
    this.observer = new ResizeObserver(() => this.reflow())
    this.observer.observe(this.viewport!)
    this.observer.observe(this.renderRoot.querySelector('.probe')!)
    this.reflow()
  }

  private reflow(): void {
    // A loaded font can change glyph widths without changing its CSS font name.
    this.measurements.clear()
    this.lineWidths = new WeakMap()
    this.rebuild = true
    this.needsLayout = true
    this.requestUpdate()
  }

  protected override willUpdate(changes: PropertyValues): void {
    // Scroll events can arrive after a resize/update. Capture user movement before reflow anchors or tail following.
    const viewport = this.viewport
    // An append while resting at the bottom resumes following, as does any user movement that ends there.
    if (this.hasUpdated && viewport && (Math.abs(viewport.scrollTop - this.viewTop) > 0.5 || (this.appended && !this.follow && !this.pinned))) {
      this.pinned = false
      this.viewTop = viewport.scrollTop
      this.follow = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 2
    }
    this.appended = false
    if (changes.has('wrap') || changes.has('tabular') || changes.has('columns')) {
      this.needsLayout = true
      this.rebuild = true
    }
    if (this.needsLayout && this.hasUpdated) this.buildLayout()
    if (this.hasUpdated)
      this.viewTop = this.follow
        ? Math.max(0, this.index.total - this.viewport!.clientHeight)
        : Math.max(0, Math.min(this.viewTop, this.index.total - this.viewport!.clientHeight))
    if (this.findPending && this.hasUpdated) {
      this.findPending = false
      this.selectFirstMatch()
    }
    if (this.revealActive && this.hasUpdated) {
      this.revealActive = false
      const position = this.active >= 0 ? this.layoutPosition(this.active) : -1
      if (position < 0) this.active = -1
      else this.revealEntry(position)
    }
  }

  // Live streams make most measured lines unique; bound the cache instead of retaining every line ever measured.
  private measure = (text: string): number => {
    let width = this.measurements.get(text)
    if (width === undefined) {
      if (this.measurements.size >= 50000) this.measurements.clear()
      width = this.canvas!.measureText(text).width
      this.measurements.set(text, width)
    }
    return width
  }

  /** Natural widths of an entry's primary text lines, kept while the font and the text stay the same. */
  private widthsFor(entry: LogEntry, text: string): number[] {
    let cached = this.lineWidths.get(entry)
    if (!cached || cached.text !== text) {
      cached = { text, widths: [] }
      this.lineWidths.set(entry, cached)
    }
    return cached.widths
  }

  private plainLayout(entry: LogEntry): TextLayout {
    const text = this.keys
      .map((key) => (Object.prototype.hasOwnProperty.call(entry, key) ? (entry[key] ?? '') : ''))
      .filter(Boolean)
      .join(' ')
    return textLayout(text, this.textWidth, this.measure, this.wrap, this.widthsFor(entry, text))
  }

  private buildLayout(): void {
    const viewport = this.viewport!
    const probe = this.renderRoot.querySelector<HTMLElement>('.probe')!
    const computed = getComputedStyle(probe)
    const font = `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`
    this.canvas ??= document.createElement('canvas').getContext('2d')
    if (font !== this.font) {
      this.font = font
      this.measurements.clear()
      this.lineWidths = new WeakMap()
    }
    this.canvas!.font = font
    const anchorIndex = this.index.at(this.viewTop)
    const anchor = this.layout[anchorIndex]
    const anchorOffset = this.viewTop - this.index.offsets[anchorIndex]
    const oldLineHeight = this.lineHeight
    this.lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.5
    this.viewportHeight = viewport.clientHeight
    this.inset = probe.querySelector<HTMLElement>('.inset-probe')!.getBoundingClientRect().width
    this.textWidth = Math.max(1, viewport.clientWidth - this.inset * 2)
    const cellStyle = getComputedStyle(probe.querySelector('.cell-probe')!)
    const horizontalPadding = parseFloat(cellStyle.paddingLeft) + parseFloat(cellStyle.paddingRight)
    const verticalPadding = parseFloat(cellStyle.paddingTop) + parseFloat(cellStyle.paddingBottom)
    this.cellPaddingTop = parseFloat(cellStyle.paddingTop)
    this.cellPaddingLeft = parseFloat(cellStyle.paddingLeft)
    this.keys = this.columns.length ? [...new Set(this.columns)] : columnOrder(this.discoveredKeys)
    const messageWidth = probe.querySelector<HTMLElement>('.message-probe')!.getBoundingClientRect().width
    if (this.rebuild) this.attributeWidths.clear()
    if (this.tabular) {
      // Attribute values determine their columns. Appends measure only the new suffix.
      for (let source = this.rebuild ? 0 : this.processed; source < this.entries.length; source++) {
        const entry = this.entries[source]
        for (const key of this.keys) {
          if (key === 'message') continue
          let width = this.attributeWidths.get(key) ?? horizontalPadding
          const value = Object.prototype.hasOwnProperty.call(entry, key) ? (entry[key] ?? '') : ''
          for (const line of value.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'))
            width = Math.max(width, Math.ceil(this.measure(line)) + horizontalPadding)
          this.attributeWidths.set(key, width)
        }
      }
    }
    const attributesWidth = this.keys.reduce((total, key) => total + (key === 'message' ? 0 : (this.attributeWidths.get(key) ?? horizontalPadding)), 0)
    this.widths = this.keys.map((key) =>
      key === 'message' ? Math.max(messageWidth, viewport.clientWidth - attributesWidth) : (this.attributeWidths.get(key) ?? horizontalPadding),
    )
    // Unwrapped rows do not depend on column widths, so a widening column (common in live streams) only changes the extent.
    const signature = JSON.stringify([
      this.keys,
      this.wrap && this.widths,
      this.wrap && this.textWidth,
      this.font,
      this.lineHeight,
      verticalPadding,
      this.tabular,
      this.wrap,
    ])
    const restart = this.rebuild || signature !== this.signature
    const index = restart ? new LineIndex() : this.index
    const from = restart ? 0 : this.processed
    if (restart) {
      this.layout = []
      this.matchCount = 0
      this.widestLine = 0
    }
    const firstPosition = this.layout.length
    for (let source = from; source < this.entries.length; source++) {
      const entry = this.entries[source]
      const matches = matchesFilter(entry, this.filter)
      if (matches) this.matchCount++
      if (!matches && this.filterMode === 'filter') continue
      const cells = this.tabular
        ? this.keys.map((key, column) => {
            const text = Object.prototype.hasOwnProperty.call(entry, key) ? (entry[key] ?? '') : ''
            // Attribute columns are sized to their widest value, so only the message ever wraps.
            if (key !== 'message') return textLayout(text, Math.max(1, this.widths[column] - horizontalPadding), this.measure, false)
            return textLayout(text, Math.max(1, this.widths[column] - horizontalPadding), this.measure, this.wrap, this.widthsFor(entry, text))
          })
        : [this.plainLayout(entry)]
      const height = Math.max(...cells.map((cell) => cell.lines.length)) * this.lineHeight + (this.tabular ? verticalPadding : 0)
      if (!this.wrap) {
        // Unwrapped lines are the logical lines, whose widths are cached with the entry.
        const primary = this.tabular ? cells[this.keys.indexOf('message')] : cells[0]
        if (primary) {
          const widths = this.lineWidths.get(entry)!.widths
          primary.lines.forEach((line, i) => (this.widestLine = Math.max(this.widestLine, (widths[i] ??= this.measure(line)))))
        }
      }
      this.layout.push({ source, cells, height, highlighted: this.filter !== null && this.filterMode === 'highlight' && matches })
      index.append(height)
    }
    this.index = index
    this.extent = this.tabular
      ? Math.max(
          this.widths.reduce((sum, width) => sum + width, 0),
          this.wrap || !this.keys.includes('message') ? 0 : attributesWidth + this.widestLine + horizontalPadding,
        )
      : Math.max(this.textWidth, this.wrap ? 0 : this.widestLine + this.inset * 2)
    if (anchor && !this.follow && !this.resetAnchor) {
      const position = this.layoutPosition(anchor.source)
      if (position >= 0) this.viewTop = index.offsets[position] + (anchorOffset * this.lineHeight) / oldLineHeight
    }
    this.needsLayout = false
    this.resetAnchor = false
    this.rebuild = false
    this.processed = this.entries.length
    this.signature = signature
    // A filter change keeps the active entry while it is still displayed.
    if (restart && this.active >= 0 && this.layoutPosition(this.active) < 0) this.active = -1
    this.countFind(firstPosition)
  }

  /** Recount matches from a layout position on: every position after a rebuild, only the appended ones otherwise. */
  private countFind(from: number): void {
    this.findPrefix = null
    this.ruler = null
    if (!this.pattern) {
      this.findCounts = []
      this.findTotal = 0
      this.findCurrent = null
      return
    }
    if (from === 0) {
      this.findCounts = []
      this.findTotal = 0
    }
    const key = `${this.pattern.source}/${this.pattern.flags}/${this.tabular}/${this.keys.join('\u0000')}`
    if (key !== this.countKey) {
      this.countCache.clear()
      this.countKey = key
    }
    for (let position = from; position < this.layout.length; position++) {
      const entry = this.layout[position]
      let count = this.countCache.get(entry.source)
      if (count === undefined) {
        count = countMatches(entry.cells, this.pattern)
        this.countCache.set(entry.source, count)
      }
      this.findCounts[position] = count
      this.findTotal += count
    }
    const current = this.findCurrent
    if (from > 0 || !current) return
    // After a rebuild the current match keeps its entry when it is still displayed, else moves to the next entry that matches.
    const position = this.layoutPosition(current.source)
    if (position >= 0 && this.findCounts[position] > current.ordinal) return
    this.findCurrent = this.firstMatchFrom(position >= 0 ? position : this.positionAfter(current.source))
    if (this.findCurrent) this.active = this.findCurrent.source
  }

  /** The first layout position whose source is at or after `source`. */
  private positionAfter(source: number): number {
    let low = 0
    let high = this.layout.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (this.layout[mid].source < source) low = mid + 1
      else high = mid
    }
    return low
  }

  /** The first match at or after a layout position, wrapping to the top; null when nothing matches. */
  private firstMatchFrom(position: number): { source: number; ordinal: number } | null {
    if (!this.findTotal) return null
    const length = this.layout.length
    for (let step = 0; step < length; step++) {
      const at = (position + step) % length
      if (this.findCounts[at]) return { source: this.layout[at].source, ordinal: 0 }
    }
    return null
  }

  private matchPrefix(): number[] {
    if (!this.findPrefix) {
      const prefix = (this.findPrefix = new Array<number>(this.findCounts.length + 1))
      prefix[0] = 0
      for (let position = 0; position < this.findCounts.length; position++) prefix[position + 1] = prefix[position] + this.findCounts[position]
    }
    return this.findPrefix
  }

  private globalIndex(current: { source: number; ordinal: number }): number {
    const position = this.layoutPosition(current.source)
    return position < 0 ? -1 : this.matchPrefix()[position] + current.ordinal
  }

  /** Make the match at a position among all matches current: it becomes the active entry and is scrolled into view. */
  private selectMatch(index: number, wrapped = false): void {
    const prefix = this.matchPrefix()
    let low = 0
    let high = this.findCounts.length - 1
    while (low < high) {
      const mid = (low + high + 1) >>> 1
      if (prefix[mid] <= index) low = mid
      else high = mid - 1
    }
    const entry = this.layout[low]
    this.findCurrent = { source: entry.source, ordinal: index - prefix[low] }
    this.active = entry.source
    this.revealMatch(low, this.findCurrent.ordinal)
    this.announceFind(index, wrapped)
  }

  private announceFind(index: number, wrapped = false): void {
    this.status = 'find'
    this.findStatus = this.findTotal
      ? this.msg.t(wrapped ? 'findWrapped' : 'findMatch', index + 1, this.findTotal)
      : this.findQuery
        ? this.msg.t('findNone')
        : ''
    this.requestUpdate()
  }

  private stepFind(step: 1 | -1): boolean {
    // A query not matched yet has no counts to step through: they belong to the previous one.
    if (!this.findOpen || this.findPending || !this.findTotal) return false
    const total = this.findTotal
    const current = this.findCurrent ? this.globalIndex(this.findCurrent) : -1
    let next = current < 0 ? (step > 0 ? 0 : total - 1) : current + step
    const wrapped = current >= 0 && (next < 0 || next >= total)
    next = (next + total) % total
    this.selectMatch(next, wrapped)
    return true
  }

  /** Re-run find for a new query or case setting. */
  private runFind(): void {
    this.pattern = this.findOpen ? findPattern(this.findQuery, this.matchCase) : null
    this.findCurrent = null
    this.findPending = true
    this.requestUpdate()
  }

  /** Count every match and make the first one at or after the active entry (else the top of the view) current. */
  private selectFirstMatch(): void {
    this.countFind(0)
    const active = this.active >= 0 ? this.layoutPosition(this.active) : -1
    const first = this.firstMatchFrom(active >= 0 ? active : this.index.at(this.viewTop))
    if (first) this.selectMatch(this.globalIndex(first))
    else this.announceFind(-1)
  }

  private async openFind(query: string | null, focus: boolean): Promise<void> {
    const request = ++this.findRequest
    this.findLoading = true
    try {
      await loadFindModules()
    } catch (error) {
      // A failed load (offline, a deploy in between) is retried by the next open rather than cached.
      findModules = undefined
      throw error
    } finally {
      if (request === this.findRequest) this.findLoading = false
    }
    if (request !== this.findRequest) return
    const opening = !this.findOpen
    this.findOpen = true
    if (query !== null) this.findQuery = query
    if (opening || query !== null) this.runFind()
    this.requestUpdate()
    await this.updateComplete
    const field = this.renderRoot.querySelector<SearchField>('.find-field')
    if (!field || !focus) return
    const opened = this.findQuery
    await field.updateComplete
    field.focus()
    // Selected so typing replaces it, unless typing has already begun while the controls loaded.
    if (this.findQuery === opened) field.select()
  }

  private setFindQuery(query: string): void {
    if (query === this.findQuery) return
    this.findQuery = query
    this.runFind()
  }

  private toggleMatchCase(): void {
    this.matchCase = !this.matchCase
    this.runFind()
  }

  /** Text selected inside the viewer, when it is one line: what Ctrl/Command+F looks for. */
  private selectedText(): string | null {
    const root = this.renderRoot as ShadowRoot & { getSelection?: () => Selection | null }
    let text = ''
    if (root.getSelection) text = String(root.getSelection() ?? '')
    else {
      // WebKit and Firefox: the document's selection, read through the shadow root with getComposedRanges; it may lie
      // anywhere on the page, so only a range inside this viewer counts.
      const selection = document.getSelection() as (Selection & { getComposedRanges?: (options: { shadowRoots: ShadowRoot[] }) => StaticRange[] }) | null
      const composed = selection?.getComposedRanges?.({ shadowRoots: [root] })[0]
      if (composed && root.contains(composed.startContainer) && root.contains(composed.endContainer)) {
        const range = document.createRange()
        range.setStart(composed.startContainer, composed.startOffset)
        range.setEnd(composed.endContainer, composed.endOffset)
        text = range.toString()
      } else if (selection?.anchorNode && root.contains(selection.anchorNode)) text = String(selection)
    }
    return text && !text.includes('\n') ? text : null
  }

  /** The find matches of a laid-out entry, computed once per pattern. */
  private entryMatches(entry: LayoutEntry): FindMatch[] {
    if (!this.pattern) return []
    let cached = this.matchCache.get(entry)
    if (cached?.pattern !== this.pattern) {
      cached = { pattern: this.pattern, matches: cellMatches(entry.cells, this.pattern) }
      this.matchCache.set(entry, cached)
    }
    return cached.matches
  }

  /** Ruler tick offsets as fractions of the content height, one per RULER_STEP pixels of viewport. */
  private rulerTicks(): number[] {
    if (!this.ruler) {
      const total = this.index.total || 1
      const buckets = Math.max(1, Math.floor(this.viewportHeight / RULER_STEP))
      const seen = new Set<number>()
      this.findCounts.forEach((count, position) => {
        if (count) seen.add(Math.min(buckets - 1, Math.floor((this.index.offsets[position] / total) * buckets)))
      })
      this.ruler = [...seen].map((bucket) => bucket / buckets)
    }
    return this.ruler
  }

  /** Layout entries are ordered by source, so the anchor is found by binary search instead of a scan. */
  private layoutPosition(source: number): number {
    let low = 0
    let high = this.layout.length - 1
    while (low <= high) {
      const mid = (low + high) >>> 1
      const value = this.layout[mid].source
      if (value === source) return mid
      if (value < source) low = mid + 1
      else high = mid - 1
    }
    return -1
  }

  // A live stream can append many times per frame. An update requested only by appends renders at most once per frame
  // interval, so layout and the scroll write happen once for a burst; an append after a quiet period renders right away.
  // A timer rather than requestAnimationFrame keeps that latency independent of how a browser paces frames.
  protected override async scheduleUpdate(): Promise<void> {
    // Only append renders open the throttle window, so a hover or scroll render does not delay the next append.
    const deferred = this.deferred
    const wait = deferred ? this.lastUpdate + FRAME_INTERVAL - performance.now() : 0
    if (wait > 0)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, wait)
        this.flush = () => {
          clearTimeout(timer)
          resolve()
        }
      })
    this.flush = undefined
    this.deferred = false
    if (deferred) this.lastUpdate = performance.now()
    super.scheduleUpdate()
  }

  // Any other change (filter, properties, scrolling) renders right away, including one made before the wait has begun.
  override requestUpdate(name?: PropertyKey, oldValue?: unknown, options?: PropertyDeclaration, useNewValue?: boolean, newValue?: unknown): void {
    super.requestUpdate(name, oldValue, options, useNewValue, newValue)
    this.deferred = false
    this.flush?.()
  }

  protected override updated(): void {
    const viewport = this.viewport!
    if (Math.abs(viewport.scrollTop - this.viewTop) > 0.5) {
      viewport.scrollTop = this.viewTop
      // The browser clamps and rounds a fractional offset; keep what it applied so the scroll event reads as this write's echo.
      this.viewTop = viewport.scrollTop
    }
  }

  private onScroll(): void {
    const viewport = this.viewport!
    // The event echoing updated()'s own tail-following scrollTop write needs no second render of an unchanged window.
    const moved = Math.abs(viewport.scrollTop - this.viewTop) > 0.5
    const echo = !moved && viewport.scrollLeft === this.viewLeft && this.hoveredSource === null
    this.hoveredSource = null
    this.viewLeft = viewport.scrollLeft
    if (echo) return
    if (moved) this.pinned = false
    this.viewTop = viewport.scrollTop
    this.follow = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 2
    if (!this.frame)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0
        this.requestUpdate()
      })
  }

  private onKeyDown(event: KeyboardEvent): void {
    const viewport = this.viewport
    if (!viewport) return
    const modifier = event.ctrlKey || event.metaKey
    // Anywhere inside the viewport, a copy button included: the viewer renders only part of the log, so browser find cannot search it.
    if (this.findShortcut && modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      this.openFind(this.selectedText(), true).catch(reportError)
      return
    }
    if (this.onFindStepKey(event)) return
    if (event.key === 'Escape' && (this.findOpen || this.findLoading) && !modifier) {
      event.preventDefault()
      this.closeFind()
      return
    }
    if (event.target !== viewport || event.altKey || event.shiftKey) return
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const edge = this.layout[event.key === 'End' ? this.layout.length - 1 : 0]
      if (edge) this.active = edge.source
      if (event.key === 'End') this.scrollToEnd()
      else this.scrollToStart()
      return
    }
    if (modifier) return
    if (event.key === 'Enter') {
      const entry = this.entries[this.active]
      if (!entry || this.layoutPosition(this.active) < 0) return
      event.preventDefault()
      this.dispatchEvent(
        new CustomEvent<LogViewerEntryEventDetail>('entry-activate', { detail: { entry: { ...entry }, index: this.active }, bubbles: true, composed: true }),
      )
      return
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'PageUp' && event.key !== 'PageDown') return
    event.preventDefault()
    this.moveActive(event.key)
  }

  // Start loading the find controls once the viewer is in use, so the first Ctrl/Command+F opens without a wait.
  private onFocus(): void {
    if (this.findShortcut) void loadFindModules()
  }

  /** F3 and Ctrl/Command+G step through the matches, Shift going back; with the bar closed they reopen it on the last query. */
  private onFindStepKey(event: KeyboardEvent): boolean {
    const modifier = event.ctrlKey || event.metaKey
    if (event.altKey || !(event.key === 'F3' ? !modifier : modifier && event.key.toLowerCase() === 'g')) return false
    if (!this.findOpen && !this.findQuery) return false
    event.preventDefault()
    if (this.findOpen) this.stepFind(event.shiftKey ? -1 : 1)
    else this.openFind(null, false).catch(reportError)
    return true
  }

  // Enter, Shift+Enter and Escape mean "next", "previous" and "close" here. The field runs first: it leaves Escape alone
  // (`escape="none"`), and its own Enter handling only fires a `search` event nothing listens for.
  private readonly findBarKeys = (event: KeyboardEvent) => this.onFindBarKeydown(event)

  private onFindBarKeydown(event: KeyboardEvent): void {
    if (this.onFindStepKey(event)) return
    const modifier = event.ctrlKey || event.metaKey
    const inField = event.composedPath().some((node) => node instanceof HTMLElement && node.classList.contains('find-field'))
    if (event.key === 'Escape' && !modifier) {
      event.preventDefault()
      event.stopPropagation()
      this.closeFind()
    } else if (event.altKey && !modifier && event.code === 'KeyC') {
      event.preventDefault()
      event.stopPropagation()
      this.toggleMatchCase()
    } else if (event.key === 'Enter' && inField && !modifier && !event.altKey) {
      event.preventDefault()
      event.stopPropagation()
      this.stepFind(event.shiftKey ? -1 : 1)
    }
  }

  private moveActive(key: string): void {
    const height = this.viewport!.clientHeight
    const offsets = this.index.offsets
    const last = this.layout.length - 1
    if (last < 0) return
    const position = this.active >= 0 ? this.layoutPosition(this.active) : -1
    // With no active entry, or one scrolled out of view, the keys start from the first entry in view instead of jumping away.
    if (position < 0 || offsets[position + 1] <= this.viewTop || offsets[position] >= this.viewTop + height) {
      let first = this.index.at(this.viewTop)
      if (offsets[first] < this.viewTop - 0.5 && first < last && offsets[first + 1] < this.viewTop + height) first++
      this.active = this.layout[first].source
      this.revealEntry(first)
      return
    }
    const page = Math.max(this.lineHeight, height - this.lineHeight)
    const top = offsets[position]
    const bottom = offsets[position + 1]
    // Only an entry taller than the view is read through: browsers round scroll offsets, so a fitting entry can sit a
    // fraction of a pixel outside it after being revealed, which must not swallow the key.
    const tall = bottom - top > height
    const below = tall && bottom > this.viewTop + height + 2
    const above = tall && top < this.viewTop - 2
    let target: number
    // An entry taller than the rest of the view is read through before the next one becomes active.
    if (key === 'ArrowDown') {
      if (below) return this.scrollToOffset(this.viewTop + this.lineHeight)
      target = position + 1
    } else if (key === 'ArrowUp') {
      if (above) return this.scrollToOffset(this.viewTop - this.lineHeight)
      target = position - 1
    } else if (key === 'PageDown') {
      if (below) return this.scrollToOffset(Math.min(this.viewTop + page, bottom - height))
      target = Math.max(position + 1, this.index.at(top + page))
    } else {
      if (above) return this.scrollToOffset(Math.max(this.viewTop - page, top))
      target = Math.min(position - 1, this.index.at(Math.max(0, top - page)))
    }
    target = Math.max(0, Math.min(last, target))
    if (target === position) return
    this.active = this.layout[target].source
    this.revealEntry(target, target < position)
  }

  /** Scroll just enough to show an entry; one taller than the view shows its top, or its end when reached from below. */
  private revealEntry(position: number, fromBelow = false): void {
    const height = this.viewport!.clientHeight
    const top = this.index.offsets[position]
    const bottom = this.index.offsets[position + 1]
    if (bottom - top > height) this.scrollToOffset(fromBelow ? bottom - height : top)
    else if (top < this.viewTop) this.scrollToOffset(top)
    else if (bottom > this.viewTop + height) this.scrollToOffset(bottom - height)
    else this.requestUpdate()
  }

  /** Bring a find match into view: its visual line vertically (centred when it was off screen), its text horizontally. */
  private revealMatch(position: number, ordinal: number): void {
    const viewport = this.viewport
    const entry = this.layout[position]
    const match = viewport ? this.entryMatches(entry)[ordinal] : undefined
    if (!match || !viewport) return this.revealEntry(position)
    const cell = entry.cells[match.cell]
    let line = 0
    for (let visual = 0; visual < cell.lines.length; visual++) if (cell.sources[visual] === match.line && cell.starts[visual] <= match.start) line = visual
    const height = viewport.clientHeight
    const y = this.index.offsets[position] + (this.tabular ? this.cellPaddingTop : 0) + line * this.lineHeight
    if (y < this.viewTop || y + this.lineHeight > this.viewTop + height) this.scrollToOffset(y - (height - this.lineHeight) / 2)
    else this.requestUpdate()
    const text = cell.lines[line]
    const from = match.start - cell.starts[line]
    const start = this.tabular ? this.widths.slice(0, match.cell).reduce((sum, width) => sum + width, 0) + this.cellPaddingLeft : this.inset
    const left = start + this.measure(text.slice(0, from))
    const width = this.measure(text.slice(from, from + match.end - match.start))
    if (left < viewport.scrollLeft || left + width > viewport.scrollLeft + viewport.clientWidth)
      viewport.scrollLeft = Math.max(0, left - viewport.clientWidth / 3)
  }

  // Instant, for the same reason as toTop(); the write is kept in viewTop so willUpdate does not read it as the user's.
  private scrollToOffset(top: number): void {
    const viewport = this.viewport!
    this.pinned = false
    this.viewTop = Math.max(0, Math.min(top, this.index.total - viewport.clientHeight))
    this.follow = this.index.total - this.viewTop - viewport.clientHeight <= 2
    viewport.scrollTo({ top: this.viewTop, behavior: 'instant' })
    this.requestUpdate()
  }

  private onClick(event: MouseEvent): void {
    const press = this.press
    this.press = undefined
    // Releasing a drag (a text selection, or a pan) inside the entry is reading, not choosing it.
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) return
    const root = this.renderRoot as ShadowRoot & { getSelection?: () => Selection | null }
    if (String((root.getSelection?.() ?? document.getSelection()) || '')) return
    let index = -1
    for (const node of event.composedPath()) {
      if (!(node instanceof HTMLElement)) continue
      if (node.part.contains('copy-button')) return
      if (node.dataset.copySource !== undefined) {
        index = Number(node.dataset.copySource)
        break
      }
    }
    const entry = this.entries[index]
    if (!entry) return
    this.active = index
    this.requestUpdate()
    this.dispatchEvent(new CustomEvent<LogViewerEntryEventDetail>('entry-click', { detail: { entry: { ...entry }, index }, bubbles: true, composed: true }))
  }

  private revealCopy(event: PointerEvent): void {
    const row = (event.target as Element).closest<HTMLElement>('[data-copy-source]')
    const source = row ? Number(row.dataset.copySource) : null
    if (source === this.hoveredSource) return
    this.hoveredSource = source
    this.requestUpdate()
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerType !== 'touch') this.revealCopy(event)
  }

  // Touch has no hover: a tap reveals that entry's copy button only, instead of showing one on every row.
  private onPointerDown(event: PointerEvent): void {
    this.press = { x: event.clientX, y: event.clientY }
    if (event.pointerType === 'touch') this.revealCopy(event)
  }

  private onPointerLeave(event: PointerEvent): void {
    // Touch fires pointerleave right after every tap; keep the tapped entry revealed until another tap or a scroll.
    if (event.pointerType === 'touch') return
    this.hoveredSource = null
    this.requestUpdate()
  }

  private async copyMessage(source: number): Promise<void> {
    const message = this.entries[source]?.message
    if (message === undefined) return
    const version = ++this.copyVersion
    try {
      await navigator.clipboard.writeText(message)
      if (version !== this.copyVersion) return
      this.copiedSource = source
      this.status = 'copy'
      this.copyStatus = this.msg.t('copiedEntry', source + 1)
      clearTimeout(this.copyTimer)
      this.copyTimer = setTimeout(() => {
        this.copiedSource = null
        this.requestUpdate()
      }, 1800)
    } catch {
      if (version !== this.copyVersion) return
      this.copiedSource = null
      clearTimeout(this.copyTimer)
      this.status = 'copy'
      this.copyStatus = this.msg.t('copyFailed')
    }
    this.requestUpdate()
  }

  private renderCopy(source: number, top: number, height: number, leftOffset = 0) {
    if (top + height <= this.viewTop || top >= this.viewTop + this.viewportHeight) return nothing
    const viewport = this.viewport
    const right = (viewport?.scrollLeft ?? 0) + (viewport?.clientWidth ?? this.textWidth) - leftOffset
    const copied = this.copiedSource === source
    // A cell of its own, so its button is a valid descendant of the row.
    return html`<div class="copy-area" role="gridcell" style=${`left:${right}px`}>
      <button
        part="copy-button"
        type="button"
        aria-label=${this.msg.t('copyEntry', source + 1)}
        title=${copied ? this.msg.t('copied') : this.msg.t('copy')}
        @click=${() => void this.copyMessage(source)}
      >
        ${
          copied
            ? html`<svg part="copy-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>`
            : html`<svg part="copy-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="8" y="8" width="12" height="12" rx="2" />
                <path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
              </svg>`
        }
      </button>
    </div>`
  }

  private renderPieces(pieces: readonly LogPiece[], marks: readonly FindMark[]) {
    return markPieces(pieces, marks).map((piece) => {
      const text = piece.kind ? html`<span part="token" data-token=${piece.kind}>${piece.text}</span>` : piece.text
      return piece.mark ? html`<mark part=${piece.mark === 'current' ? 'find-match current' : 'find-match'}>${text}</mark>` : text
    })
  }

  private renderLogText(layout: TextLayout, marks: readonly FindMark[], first = 0, last = layout.lines.length) {
    let tokens = this.tokenLines.get(layout)
    if (!tokens) {
      tokens = new LogTokenLines(layout)
      this.tokenLines.set(layout, tokens)
    }
    return this.renderPieces(tokens.slice(first, last), marks)
  }

  /** An attribute cell's lines as they are: no token colours, only find marks. */
  private renderAttribute(layout: TextLayout, marks: readonly FindMark[]) {
    if (!marks.length) return layout.lines.join('\n')
    const pieces: LogPiece[] = []
    layout.lines.forEach((line, visual) => {
      if (visual) pieces.push({ text: '\n' })
      pieces.push({ text: line, line: layout.sources[visual], start: layout.starts[visual] })
    })
    return this.renderPieces(pieces, marks)
  }

  /** Find marks of a rendered entry, one list per cell; matching runs only for entries in the virtual window. */
  private entryMarks(entry: LayoutEntry, position: number): FindMark[][] {
    const marks: FindMark[][] = entry.cells.map(() => [])
    if (!this.findOpen || !this.pattern || !this.findCounts[position]) return marks
    const current = this.findCurrent?.source === entry.source ? this.findCurrent.ordinal : -1
    this.entryMatches(entry).forEach((match, ordinal) =>
      marks[match.cell].push({ line: match.line, start: match.start, end: match.end, current: ordinal === current }),
    )
    return marks
  }

  private renderFind() {
    const current = this.findCurrent ? this.globalIndex(this.findCurrent) : -1
    const counter = !this.findQuery ? '' : this.findTotal ? this.msg.t('findCount', current + 1, this.findTotal) : this.msg.t('findNone')
    const icon = (path: string) =>
      html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d=${path} />
      </svg>`
    return html`<div part="find-bar" role="search" aria-label=${this.msg.t('find')} @keydown=${this.findBarKeys}>
      <c2-search-field
        class="find-field"
        escape="none"
        debounce="0"
        .value=${this.findQuery}
        placeholder=${this.msg.t('find')}
        aria-label=${this.msg.t('find')}
        @input=${(event: Event) => this.setFindQuery((event.currentTarget as SearchField).value)}
      ></c2-search-field>
      <span class="find-count" ?data-empty=${Boolean(this.findQuery) && !this.findTotal} aria-hidden="true">${counter}</span>
      <c2-icon-button
        class="find-case"
        toggle
        ?selected=${this.matchCase}
        aria-label=${this.msg.t('matchCase')}
        tooltip=${this.msg.t('matchCase')}
        @click=${() => this.toggleMatchCase()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <text x="12" y="16.5" text-anchor="middle" font-size="12.5" font-weight="600" font-family="system-ui, sans-serif" fill="currentColor">Aa</text>
        </svg>
      </c2-icon-button>
      <span class="find-divider" aria-hidden="true"></span>
      <c2-icon-button class="find-previous" aria-label=${this.msg.t('previousMatch')} tooltip=${this.msg.t('previousMatch')} @click=${() => this.stepFind(-1)}>
        ${icon('m18 15-6-6-6 6')}
      </c2-icon-button>
      <c2-icon-button class="find-next" aria-label=${this.msg.t('nextMatch')} tooltip=${this.msg.t('nextMatch')} @click=${() => this.stepFind(1)}>
        ${icon('m6 9 6 6 6-6')}
      </c2-icon-button>
      <c2-icon-button class="find-close" aria-label=${this.msg.t('closeFind')} tooltip=${this.msg.t('closeFind')} @click=${() => this.closeFind()}>
        ${icon('M18 6 6 18M6 6l12 12')}
      </c2-icon-button>
    </div>`
  }

  private renderRuler() {
    if (!this.findOpen || !this.findTotal) return nothing
    const position = this.findCurrent ? this.layoutPosition(this.findCurrent.source) : -1
    const current = position >= 0 ? this.index.offsets[position] / (this.index.total || 1) : -1
    return html`<div part="ruler" aria-hidden="true">
      ${this.rulerTicks().map((at) => html`<span style=${`top:${at * 100}%`}></span>`)}
      ${current >= 0 ? html`<span part="current" style=${`top:${current * 100}%`}></span>` : nothing}
    </div>`
  }

  protected override render() {
    const start = this.index.at(Math.max(0, this.viewTop - 200))
    const end = Math.min(this.layout.length, this.index.at(this.viewTop + this.viewportHeight + 200) + 1)
    const template = this.widths.map((width) => `${width}px`).join(' ')
    const rows = this.layout.length > 0
    const activePosition = this.active >= 0 ? this.layoutPosition(this.active) : -1
    // The active entry is announced through aria-activedescendant only while it is rendered: the id must resolve. The
    // viewport is a treegrid rather than a grid because there a row, the whole entry, may be the active descendant.
    const activeRendered = activePosition >= start && activePosition < end
    return html` <div class="probe" aria-hidden="true">
        <span class="message-probe">M</span><span class="cell-probe">MMMMMMMMMMMMMMMM</span><span class="inset-probe"></span>
      </div>
      <div
        part="viewport"
        tabindex="0"
        role=${rows ? 'treegrid' : 'region'}
        aria-label=${this.getAttribute('aria-label') ?? this.msg.t('content')}
        aria-rowcount=${rows ? this.layout.length : nothing}
        aria-activedescendant=${activeRendered ? `entry-${this.active}` : nothing}
        aria-describedby=${rows ? nothing : 'empty'}
        @scroll=${this.onScroll}
        @keydown=${this.onKeyDown}
        @focus=${this.onFocus}
        @click=${this.onClick}
        @pointerdown=${this.onPointerDown}
        @pointermove=${this.onPointerMove}
        @pointerleave=${this.onPointerLeave}
      >
        <div part="content" style=${`height:${this.index.total}px;min-width:${this.extent}px`}>
          ${this.layout.slice(start, end).map((entry, offset) => {
            const position = start + offset
            const top = this.index.offsets[position]
            const marks = this.entryMarks(entry, position)
            const active = entry.source === this.active
            if (this.tabular)
              return html`<div
                part=${['entry', entry.highlighted && 'highlight', active && 'active'].filter(Boolean).join(' ')}
                role="row"
                id=${`entry-${entry.source}`}
                aria-rowindex=${position + 1}
                data-copy-source=${entry.source}
                data-copy-hover=${this.hoveredSource === entry.source ? 'true' : 'false'}
                data-index=${entry.source}
                data-level=${this.entries[entry.source].level?.trim().toLowerCase() ?? ''}
                style=${`top:${top}px;height:${entry.height}px;grid-template-columns:${template}`}
              >
                ${this.renderCopy(entry.source, top, entry.height)}
                ${entry.cells.map((cell, column) => {
                  const key = this.keys[column]
                  // One line: whitespace between the cell and its text would join a drag selection's text.
                  const text = key === 'message' ? this.renderLogText(cell, marks[column]) : this.renderAttribute(cell, marks[column])
                  return html`<div part="cell" role="gridcell" data-attribute=${key}><span part="text">${text}</span></div>`
                })}
              </div>`
            const cell = entry.cells[0]
            const lines = cell.lines
            const first = Math.max(0, Math.floor((this.viewTop - 200 - top) / this.lineHeight))
            const last = Math.min(lines.length, Math.ceil((this.viewTop + this.viewportHeight + 200 - top) / this.lineHeight))
            const sliceTop = top + first * this.lineHeight
            const sliceHeight = (last - first) * this.lineHeight
            return html`<div
              class="plain-entry"
              role="row"
              id=${`entry-${entry.source}`}
              aria-rowindex=${position + 1}
              data-copy-source=${entry.source}
              data-copy-hover=${this.hoveredSource === entry.source ? 'true' : 'false'}
              style=${`top:${sliceTop}px;height:${sliceHeight}px;left:${this.inset}px;width:${this.extent - this.inset * 2}px`}
            >
              <span
                class="plain"
                role="gridcell"
                part=${['text', entry.highlighted && 'highlight', active && 'active'].filter(Boolean).join(' ')}
                data-index=${entry.source}
                style=${`top:0;left:0;min-width:${this.textWidth}px;min-height:${sliceHeight}px`}
                >${this.renderLogText(cell, marks[0], first, last)}</span
              >
              ${this.renderCopy(entry.source, sliceTop, sliceHeight, this.inset)}
            </div>`
          })}
        </div>
      </div>
      ${rows ? nothing : html`<div part="empty" id="empty">${this.entries.length ? this.msg.t('noMatches') : this.msg.t('noEntries')}</div>`}
      ${this.renderRuler()} ${this.findOpen ? this.renderFind() : nothing}
      <span class="copy-status" role="status" aria-live="polite">${this.status === 'find' ? this.findStatus : this.copyStatus}</span>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-log-viewer': LogViewer
  }
}
