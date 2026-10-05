import { LitElement, html, nothing, unsafeCSS, type PropertyDeclaration, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { columnOrder, matchesFilter, validateEntries, validateFilter } from './log-model.js'
import type { LogEntry, LogFilter, LogFilterMode } from './log-model.js'
import { LineIndex, textLayout, type TextLayout } from './log-position.js'
import { LogTokenLines } from './log-tokens.js'
import styles from './log-viewer.scss?inline'

export type { LogEntry, LogFilter, LogFilterMode } from './log-model.js'

const FRAME_INTERVAL = 16
interface LayoutEntry {
  source: number
  highlighted: boolean
  cells: TextLayout[]
  height: number
}

/**
 * A text-only, variable-height virtual log viewport. Filters and search are controlled by the application.
 * With the viewport focused, Home jumps to the first entry and End follows the latest; Ctrl/Command variants also work.
 * @tag c2-log-viewer
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
 * @csspart viewport - Keyboard accessible scroll surface
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
  private copyStatus = ''
  private copyVersion = 0
  private copyTimer?: ReturnType<typeof setTimeout>

  /** Number of retained entries, including entries hidden by the current filter. */
  get entryCount(): number {
    return this.entries.length
  }
  /** Number of entries matching the current filter. */
  get filteredCount(): number {
    return this.matchCount
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
    if (this.resetAnchor) {
      this.viewTop = 0
      if (this.viewport) this.viewport.scrollTop = 0
    } else if (this.viewport) this.viewTop = this.viewport.scrollTop
    this.follow = false
    this.needsLayout = true
    this.requestUpdate()
  }

  /** Clear retained entries; the current filter remains active. */
  clear(): void {
    this.entries = []
    this.discoveredKeys.clear()
    this.copyVersion++
    this.copiedSource = null
    this.copyStatus = ''
    clearTimeout(this.copyTimer)
    // Text widths depend on the font, not the entries: an application that replaces its whole snapshot reuses them.
    this.rebuild = true
    this.resetAnchor = true
    this.viewTop = 0
    if (this.viewport) this.viewport.scrollTop = 0
    this.needsLayout = true
    this.requestUpdate()
  }

  /** Scroll to the newest matching content and resume following subsequent appends. */
  scrollToEnd(): void {
    if (this.viewport) this.viewTop = this.viewport.scrollTop
    this.follow = true
    this.requestUpdate()
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
    if (this.hasUpdated && viewport && (Math.abs(viewport.scrollTop - this.viewTop) > 0.5 || (this.appended && !this.follow))) {
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
    if (Math.abs(viewport.scrollTop - this.viewTop) > 0.5) viewport.scrollTop = this.viewTop
  }

  private onScroll(): void {
    const viewport = this.viewport!
    // The event echoing updated()'s own tail-following scrollTop write needs no second render of an unchanged window.
    const echo = Math.abs(viewport.scrollTop - this.viewTop) <= 0.5 && viewport.scrollLeft === this.viewLeft && this.hoveredSource === null
    this.hoveredSource = null
    this.viewLeft = viewport.scrollLeft
    if (echo) return
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
    if (!viewport || event.target !== viewport || event.altKey || event.shiftKey) return
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (event.key === 'End') this.scrollToEnd()
      else {
        this.follow = false
        this.viewTop = 0
        viewport.scrollTo({ top: 0, behavior: 'instant' })
        this.requestUpdate()
      }
      return
    }
    if (event.ctrlKey || event.metaKey) return
    const page = Math.max(this.lineHeight, viewport.clientHeight - this.lineHeight)
    const distances: Record<string, number> = { PageUp: -page, PageDown: page, ArrowUp: -this.lineHeight, ArrowDown: this.lineHeight }
    const distance = distances[event.key]
    if (distance === undefined) return
    event.preventDefault()
    // Native animated keyboard scrolling can race virtual reflow. Keep each vertical movement immediate.
    this.viewTop = Math.max(0, Math.min(viewport.scrollTop + distance, viewport.scrollHeight - viewport.clientHeight))
    this.follow = viewport.scrollHeight - this.viewTop - viewport.clientHeight <= 2
    viewport.scrollTo({ top: this.viewTop, behavior: 'instant' })
    this.requestUpdate()
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
      this.copyStatus = `Copied message ${source + 1}`
      clearTimeout(this.copyTimer)
      this.copyTimer = setTimeout(() => {
        this.copiedSource = null
        this.requestUpdate()
      }, 1800)
    } catch {
      if (version !== this.copyVersion) return
      this.copiedSource = null
      clearTimeout(this.copyTimer)
      this.copyStatus = 'Unable to copy message. Try again.'
    }
    this.requestUpdate()
  }

  private renderCopy(source: number, top: number, height: number, leftOffset = 0) {
    if (top + height <= this.viewTop || top >= this.viewTop + this.viewportHeight) return nothing
    const viewport = this.viewport
    const right = (viewport?.scrollLeft ?? 0) + (viewport?.clientWidth ?? this.textWidth) - leftOffset
    const copied = this.copiedSource === source
    return html`<div class="copy-area" style=${`left:${right}px`}>
      <button
        part="copy-button"
        type="button"
        aria-label=${`Copy message ${source + 1}`}
        title=${copied ? 'Copied' : 'Copy message'}
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

  private renderLogText(layout: TextLayout, first = 0, last = layout.lines.length) {
    let tokens = this.tokenLines.get(layout)
    if (!tokens) {
      tokens = new LogTokenLines(layout)
      this.tokenLines.set(layout, tokens)
    }
    return tokens.slice(first, last).map((token) => (token.kind ? html`<span part="token" data-token=${token.kind}>${token.text}</span>` : token.text))
  }

  protected override render() {
    const start = this.index.at(Math.max(0, this.viewTop - 200))
    const end = Math.min(this.layout.length, this.index.at(this.viewTop + this.viewportHeight + 200) + 1)
    const template = this.widths.map((width) => `${width}px`).join(' ')
    return html` <div class="probe" aria-hidden="true">
        <span class="message-probe">M</span><span class="cell-probe">MMMMMMMMMMMMMMMM</span><span class="inset-probe"></span>
      </div>
      <div
        part="viewport"
        tabindex="0"
        role="region"
        aria-label=${this.getAttribute('aria-label') ?? 'Log content'}
        @scroll=${this.onScroll}
        @keydown=${this.onKeyDown}
        @pointerdown=${this.onPointerDown}
        @pointermove=${this.onPointerMove}
        @pointerleave=${this.onPointerLeave}
      >
        <div part="content" style=${`height:${this.index.total}px;min-width:${this.extent}px`}>
          ${this.layout.slice(start, end).map((entry, offset) => {
            const top = this.index.offsets[start + offset]
            if (this.tabular)
              return html`<div
                part=${entry.highlighted ? 'entry highlight' : 'entry'}
                data-copy-source=${entry.source}
                data-copy-hover=${this.hoveredSource === entry.source ? 'true' : 'false'}
                data-index=${entry.source}
                data-level=${this.entries[entry.source].level?.trim().toLowerCase() ?? ''}
                style=${`top:${top}px;height:${entry.height}px;grid-template-columns:${template}`}
              >
                ${this.renderCopy(entry.source, top, entry.height)}
                ${entry.cells.map((cell, column) => html`<div part="cell" data-attribute=${this.keys[column]}><span part="text">${this.keys[column] === 'message' ? this.renderLogText(cell) : cell.lines.join('\n')}</span></div>`)}
              </div>`
            const cell = entry.cells[0]
            const lines = cell.lines
            const first = Math.max(0, Math.floor((this.viewTop - 200 - top) / this.lineHeight))
            const last = Math.min(lines.length, Math.ceil((this.viewTop + this.viewportHeight + 200 - top) / this.lineHeight))
            const sliceTop = top + first * this.lineHeight
            const sliceHeight = (last - first) * this.lineHeight
            return html`<div
              class="plain-entry"
              data-copy-source=${entry.source}
              data-copy-hover=${this.hoveredSource === entry.source ? 'true' : 'false'}
              style=${`top:${sliceTop}px;height:${sliceHeight}px;left:${this.inset}px;width:${this.extent - this.inset * 2}px`}
            >
              <span
                class="plain"
                part=${entry.highlighted ? 'text highlight' : 'text'}
                data-index=${entry.source}
                style=${`top:0;left:0;min-width:${this.textWidth}px;min-height:${sliceHeight}px`}
                >${this.renderLogText(cell, first, last)}</span
              >
              ${this.renderCopy(entry.source, sliceTop, sliceHeight, this.inset)}
            </div>`
          })}
        </div>
        <span class="copy-status" role="status" aria-live="polite">${this.copyStatus}</span>
        ${this.layout.length ? nothing : html`<div part="empty">${this.entries.length ? 'No matching entries' : 'No log entries'}</div>`}
      </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-log-viewer': LogViewer
  }
}
