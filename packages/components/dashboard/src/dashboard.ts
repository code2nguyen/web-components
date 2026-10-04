import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { isServer } from 'lit-html/is-server.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { DashCardPlacement, DashboardCard, DashboardPanelSize } from './dashboard-host'
import styles from './dashboard.scss?inline'

// Registers `c2-dash-card`, so an app that imports the grid gets the panes too (same pattern as tabs → tab).
import './dash-card'

export type { DashCardPlacement, DashboardPanelSize } from './dashboard-host'

/** Track sizes the grid is laid out with. Both are CSS track lists, one entry per track. */
export interface DashboardLayoutChangeDetail {
  /** Column tracks, e.g. `['320px', '1fr']`. */
  columns: string[]
  /** Row tracks. */
  rows: string[]
  /** Stable card IDs in DOM and reading order. */
  order: string[]
  /** Active responsive media query, or `null` for the authored layout. */
  breakpoint: string | null
  /** Named size in force per card ID, for every card whose size the grid knows: `{ cpu: 'wide' }`. */
  sizes: Record<string, string>
}

/** Events fired by {@link Dashboard}, keyed for `addEventListener`. */
export interface DashboardEventMap {
  'layout-change': CustomEvent<DashboardLayoutChangeDetail>
}

export interface Dashboard {
  addEventListener: TypedAddEventListener<Dashboard, DashboardEventMap>
  removeEventListener: TypedRemoveEventListener<Dashboard, DashboardEventMap>
}

/**
 * One responsive variant of the grid. The first entry of `layouts` whose media query matches is applied over the
 * authored `columns`, `rows` and `layout`; with none matching the authored ones stand.
 */
export interface DashboardResponsiveLayout {
  /** Media query, as given to `matchMedia`: `'(max-width: 1279px)'`. */
  media: string
  /** Column tracks while this entry is active; the authored `columns` otherwise. */
  columns?: number | string | string[]
  /** Row tracks while this entry is active; the authored `rows` otherwise. */
  rows?: number | string | string[]
  /** Placement overrides by `card-id`, merged per card over the grid's `layout`. */
  layout?: Record<string, DashCardPlacement>
}

/**
 * What is kept under the storage key. Only `version: 1` is read back (a payload without `version` predates it and
 * is read too; any other version is discarded), and every field is validated: a malformed one is dropped, the rest
 * still applies.
 */
export interface DashboardStoredLayout {
  version?: 1
  columns?: string[]
  rows?: string[]
  order?: string[]
  breakpoint?: string | null
  /** Named sizes the user chose through `setPanelSize()`, by card ID. Absent from layouts stored before it existed. */
  sizes?: Record<string, string>
}

const LAYOUT_VERSION = 1

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

/** Keeps the well-formed fields of a stored payload; `null` for a payload of another version or no object at all. */
function normalizeStored(value: unknown): DashboardStoredLayout | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (input.version !== undefined && input.version !== LAYOUT_VERSION) return null
  const layout: DashboardStoredLayout = { version: LAYOUT_VERSION }
  if (isStringArray(input.columns)) layout.columns = input.columns
  if (isStringArray(input.rows)) layout.rows = input.rows
  if (isStringArray(input.order)) layout.order = input.order
  if (typeof input.breakpoint === 'string' || input.breakpoint === null) layout.breakpoint = input.breakpoint
  if (input.sizes && typeof input.sizes === 'object' && !Array.isArray(input.sizes)) {
    layout.sizes = Object.fromEntries(Object.entries(input.sizes).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  }
  return layout
}

const FRACTION = /^([\d.]*)fr$/

/** The weight of an `fr` track, `0` for any track that does not flex. */
function parseFraction(size: string): number {
  const match = FRACTION.exec(size.trim())
  if (!match) return 0
  if (match[1] === '') return 1
  const value = Number.parseFloat(match[1])
  return Number.isFinite(value) && value > 0 ? value : 0
}

function repeatFraction(count: number): string[] {
  return Array.from({ length: Math.max(1, Math.trunc(count)) }, () => '1fr')
}

/** `3` and `'3'` are three `1fr` tracks; anything else is a list of simple track sizes, separated by spaces or commas. */
function toTracks(input: number | string | string[]): string[] {
  if (Array.isArray(input)) return input.length > 0 ? [...input] : ['1fr']
  if (typeof input === 'number') return repeatFraction(input)
  const text = String(input ?? '').trim()
  if (text === '') return ['1fr']
  if (/^\d+$/.test(text)) return repeatFraction(Number.parseInt(text, 10))
  const tracks = text.split(/[\s,]+/).filter(Boolean)
  return tracks.length > 0 ? tracks : ['1fr']
}

/**
 * Grid of resizable panes. The children are `c2-dash-card` elements, placed by their `col`/`row` attributes; each
 * one draws drag handles on the edges it shares with a neighbour, and dragging one resizes the whole track, so the
 * cards on either side stay aligned. `columns` and `rows` take a track count (`columns="3"` is three equal columns)
 * or an explicit track list (`columns="320px 1fr"`); a track is switched to pixels the first time it is dragged, and
 * the `fr` tracks around it give up the space in proportion to their weight, down to the minimums. With a
 * `storage-key` the sizes survive a reload.
 *
 * `layouts` makes the grid responsive without a remount: each entry names a media query and the tracks and card
 * placements to use while it matches, the first match wins, and every entry keeps its own stored sizes under
 * `<storage-key>@<media>`. Stored payloads are versioned and include stable card order; `serializeLayout` and
 * `deserializeLayout` can add application metadata or migrate an older payload of the application's own.
 *
 * Named whole-panel sizes: `sizes` declares them (`{ "small": { "colSpan": 1 }, "wide": { "colSpan": 2 } }`), a
 * card picks one with its `size` attribute, and `setPanelSize(cardId, name)` changes it at runtime. A runtime choice
 * is stored with the layout and reported in `layout-change`; on restore a choice naming an unknown size or a card
 * that is no longer there is ignored, so that card falls back to its authored `size`, and `reset()` forgets every
 * choice along with the tracks.
 *
 * Placement is the application's: the grid never re-places cards on its own. A pane removed or hidden at runtime
 * leaves its cells empty and its neighbours where they were, and a pane added at runtime lands exactly where its
 * `col`/`row` say, on top of whatever is already there if that cell is taken. To close a gap, or to make room, set
 * the cards' `col`/`row`/`col-span`/`row-span` or hand the grid a `layout` record — both are applied in place.
 *
 * The grid is the sizing authority: a card never sets its own width. Give the element a height (or place it in a
 * flex/grid parent that does) whenever the rows use `fr`, since the row tracks divide the host's height.
 *
 * @tag c2-dashboard
 *
 * @slot - The `c2-dash-card` panes. Anything else becomes an ordinary grid item, placed by your own CSS.
 * @slotcomponent c2-dash-card
 *
 * @event {CustomEvent<DashboardLayoutChangeDetail>} layout-change - The tracks, the stable card order or a named
 * panel size changed: a gesture ended, `setPanelOrder()`/`setPanelSize()`/`reset()` was called, or another entry of
 * `layouts` took over. Includes the active breakpoint and the named sizes. Does not bubble: listen on the element.
 *
 * @cssproperty {pixel} [--c2-dashboard--gap=8px] - Gutter between the cards. The whole gutter drags: each card's
 * handle is centred on its edge and as thick as the gap (never under `--c2-dash-card__handle--size`).
 * @cssproperty {padding} [--c2-dashboard--padding=0px] - Inset around the tracks. With a `background` it is what
 * turns the gutters into a visible frame between the panes.
 * @cssproperty {background} [--c2-dashboard--background=transparent]
 * @cssproperty {border} [--c2-dashboard--border=none]
 * @cssproperty {border-radius} [--c2-dashboard--border-radius=0px]
 */
@customElement('c2-dashboard')
export class Dashboard extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Column count (`3`) or an explicit track list (`'320px 1fr'`). Each entry must be one simple size. */
  @property() columns: number | string | string[] = 2

  /** Row count (`2`) or an explicit track list (`'auto 1fr'`). */
  @property() rows: number | string | string[] = 1

  /** Floor for every column, in pixels. A card's own `min-width` raises it for the tracks that card covers. */
  @property({ type: Number, attribute: 'min-column-width' }) minColumnWidth = 50

  /** Floor for every row, in pixels. A card's own `min-height` raises it for the tracks that card covers. */
  @property({ type: Number, attribute: 'min-row-height' }) minRowHeight = 50

  /** `localStorage` key the track sizes and stable card order are stored under. Without it the grid starts from the authored layout. */
  @property({ attribute: 'storage-key' }) storageKey: string | undefined = undefined

  /**
   * Placement overrides keyed by the cards' `card-id`, for a layout that is chosen at runtime rather than authored
   * in the markup. Each entry wins over the card's own `col`/`row`/`col-span`/`row-span`/visibility. This is also
   * how an app re-flows the remaining panes after one was removed: the grid does not do that by itself.
   */
  @property({ attribute: false }) layout: Record<string, DashCardPlacement> | undefined = undefined

  /**
   * Responsive variants, in priority order: the first entry whose `media` matches supplies the tracks and the card
   * placements, and the grid switches as the viewport crosses a breakpoint. Nothing is stored across entries — each
   * one keeps its own sizes under `<storage-key>@<media>`.
   */
  @property({ attribute: false }) layouts: DashboardResponsiveLayout[] | undefined = undefined

  /**
   * Named whole-panel sizes, each a column and/or row span: `{ small: { colSpan: 1 }, wide: { colSpan: 2 } }`. A
   * card chooses one with `size`; spans past the grid's last track are clamped like any other. Settable as a JSON
   * attribute.
   */
  @property({ converter: jsonPropertyConverter }) sizes: Record<string, DashboardPanelSize> | undefined = undefined

  /** Optional storage encoder. Use it to add application metadata such as named panel sizes. */
  @property({ attribute: false }) serializeLayout: ((layout: DashboardStoredLayout) => unknown) | undefined = undefined

  /** Optional storage decoder paired with `serializeLayout`. It may also migrate older application payloads. */
  @property({ attribute: false }) deserializeLayout: ((value: unknown) => DashboardStoredLayout | null) | undefined = undefined

  @state() private columnTracks: string[] = []
  @state() private rowTracks: string[] = []
  /** Index into `layouts` of the entry in force, `-1` for the authored grid. */
  @state() private activeLayout = -1

  private cards = new Set<DashboardCard>()
  private mediaQueries: MediaQueryList[] = []
  private readonly handleMediaChange = () => {
    this.activeLayout = this.resolveActiveLayout()
  }

  /** Named sizes chosen at runtime, by card ID; they win over the cards' authored `size`. */
  private sizeChoices = new Map<string, string>()

  /** Used track sizes, valid until the next write to the tracks. */
  private pixelCache = new Map<'column' | 'row', number[]>()

  /** Column tracks as they are laid out right now. */
  get columnSizes(): string[] {
    return [...this.columnTracks]
  }

  /** Row tracks as they are laid out right now. */
  get rowSizes(): string[] {
    return [...this.rowTracks]
  }

  get columnCount(): number {
    return this.columnTracks.length
  }

  get rowCount(): number {
    return this.rowTracks.length
  }

  /** Named size in force per card ID, for every card whose size is one of `sizes`. */
  get panelSizes(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const card of this.childCards) {
      const id = this.idOf(card)
      const name = this.sizeNameOf(card)
      if (id && name) result[id] = name
    }
    return result
  }

  /** The entry of `layouts` in force, or `undefined` while the authored grid is. */
  get activeResponsiveLayout(): DashboardResponsiveLayout | undefined {
    return this.layouts?.[this.activeLayout]
  }

  override connectedCallback() {
    super.connectedCallback()
    if (this.hasUpdated) this.watchMedia()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unwatchMedia()
  }

  protected override willUpdate(changed: PropertyValues) {
    if (!this.hasUpdated || changed.has('layouts')) this.watchMedia()
    if (
      !this.hasUpdated ||
      changed.has('columns') ||
      changed.has('rows') ||
      changed.has('storageKey') ||
      changed.has('layouts') ||
      changed.has('activeLayout')
    ) {
      this.syncTracks()
    }
  }

  protected override updated(changed: PropertyValues) {
    this.pixelCache.clear()
    // The cards are light-DOM children, so the grid lives on the host itself.
    this.style.setProperty('--_columns', this.columnTracks.join(' '))
    this.style.setProperty('--_rows', this.rowTracks.join(' '))
    if (
      changed.has('columnTracks') ||
      changed.has('rowTracks') ||
      changed.has('layout') ||
      changed.has('layouts') ||
      changed.has('activeLayout') ||
      changed.has('sizes')
    ) {
      for (const card of this.cards) card.hostChanged()
    }
    // Crossing a breakpoint is a layout change the app did not make itself, so it is reported like a drag.
    if (changed.has('activeLayout') && changed.get('activeLayout') !== undefined) this.emitLayoutChange()
  }

  /** Back to the authored tracks of the layout in force, and its stored ones are forgotten. */
  reset() {
    const key = this.activeStorageKey
    if (key && !isServer) {
      try {
        localStorage.removeItem(key)
      } catch {
        // A private window or a full quota only costs the stored layout.
      }
    }
    this.columnTracks = toTracks(this.activeResponsiveLayout?.columns ?? this.columns)
    this.rowTracks = toTracks(this.activeResponsiveLayout?.rows ?? this.rows)
    this.sizeChoices.clear()
    this.refreshCards()
    this.emitLayoutChange()
  }

  registerCard(card: DashboardCard) {
    this.cards.add(card)
    card.hostChanged()
  }

  unregisterCard(card: DashboardCard) {
    this.cards.delete(card)
  }

  placementOf(cardId: string | undefined): DashCardPlacement | undefined {
    if (!cardId) return undefined
    const base = this.layout?.[cardId]
    const active = this.activeResponsiveLayout?.layout?.[cardId]
    return active && base ? { ...base, ...active } : (active ?? base)
  }

  resizeColumn(index: number, delta: number): number {
    this.pixelCache.clear()
    const result = this.resizeTrack(this.columnTracks, index, delta, 'column')
    if (!result) return 0
    this.columnTracks = result.tracks
    return result.applied
  }

  resizeRow(index: number, delta: number): number {
    this.pixelCache.clear()
    const result = this.resizeTrack(this.rowTracks, index, delta, 'row')
    if (!result) return 0
    this.rowTracks = result.tracks
    return result.applied
  }

  commitResize() {
    this.persist()
    this.emitLayoutChange()
  }

  /** Reorders known cards by stable `card-id`, persists the order, and reports one layout change. */
  setPanelOrder(order: readonly string[]) {
    this.applyPanelOrder(order)
    this.persist()
    this.emitLayoutChange()
  }

  /**
   * Gives the card with this `card-id` one of the named `sizes`, or its authored `size` back with `null`; persists
   * it and reports one layout change. Returns `false`, changing nothing, for an unknown card or size name.
   */
  setPanelSize(cardId: string, size: string | null): boolean {
    if (!this.childCards.some((card) => this.idOf(card) === cardId)) return false
    if (size === null) this.sizeChoices.delete(cardId)
    else if (this.knowsSize(size)) this.sizeChoices.set(cardId, size)
    else return false
    this.refreshCards()
    this.persist()
    this.emitLayoutChange()
    return true
  }

  /** Spans of the named size in force for `card`; read by the card when it places itself. */
  panelSizeOf(card: DashboardCard): DashboardPanelSize | undefined {
    const name = this.sizeNameOf(card)
    return name ? this.sizes![name] : undefined
  }

  /**
   * Where the splitter after `index` sits, as a percentage of the tracks' total. A focusable `separator` is a
   * window splitter, and a window splitter has to report a value.
   */
  splitterValue(axis: 'column' | 'row', index: number): number {
    if (isServer || index < 0) return 0
    const sizes = this.trackPixels(axis)
    const total = sizes.reduce((sum, size) => sum + size, 0)
    if (total <= 0) return 0
    const leading = sizes.slice(0, index + 1).reduce((sum, size) => sum + size, 0)
    return Math.round((leading / total) * 100)
  }

  /**
   * Reading a used track size forces layout, and a drag asks for it from every card's handles on every pointer
   * move. The answer cannot change until something writes to the DOM, so it is cached until one of them does.
   */
  private trackPixels(axis: 'column' | 'row'): number[] {
    const cached = this.pixelCache.get(axis)
    if (cached) return cached
    const template = getComputedStyle(this)[axis === 'column' ? 'gridTemplateColumns' : 'gridTemplateRows']
    const sizes = template
      .split(' ')
      .map((size) => Number.parseFloat(size))
      .filter((size) => Number.isFinite(size))
    this.pixelCache.set(axis, sizes)
    return sizes
  }

  /** What is left of the host along `axis` once the tracks, the gutters and the padding have taken their share. */
  private freeSpace(axis: 'column' | 'row', tracks: number[]): number {
    const style = getComputedStyle(this)
    const gap = Number.parseFloat(axis === 'column' ? style.columnGap : style.rowGap) || 0
    const padding =
      axis === 'column'
        ? (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
        : (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
    const inner = (axis === 'column' ? this.clientWidth : this.clientHeight) - padding
    const used = tracks.reduce((sum, size) => sum + size, 0) + gap * Math.max(0, tracks.length - 1)
    return Math.max(0, inner - used)
  }

  private emitLayoutChange() {
    this.dispatchEvent(
      new CustomEvent<DashboardLayoutChangeDetail>('layout-change', {
        detail: {
          columns: [...this.columnTracks],
          rows: [...this.rowTracks],
          order: this.panelOrder,
          breakpoint: this.activeResponsiveLayout?.media ?? null,
          sizes: this.panelSizes,
        },
        bubbles: false,
        composed: true,
      }),
    )
  }

  private resizeTrack(tracks: string[], index: number, delta: number, axis: 'column' | 'row'): { tracks: string[]; applied: number } | undefined {
    if (isServer || index < 0 || index >= tracks.length) return undefined
    const minOf = (track: number) => this.trackMin(axis, track)
    const computed = this.trackPixels(axis)
    const current = computed[index]
    if (!Number.isFinite(current)) return undefined

    let effective = delta
    if (delta > 0) {
      // Growing one track means the `fr` tracks give the space back in proportion to their weight, so the first one
      // to reach its minimum caps the gesture: track j can give up (px − min) × (totalFr / fr) before it gets there.
      let totalFraction = 0
      const flexible: { px: number; min: number; fraction: number }[] = []
      for (let track = 0; track < tracks.length; track++) {
        if (track === index) continue
        const fraction = parseFraction(tracks[track])
        if (fraction <= 0) continue
        flexible.push({ px: computed[track] ?? 0, min: minOf(track), fraction })
        totalFraction += fraction
      }
      for (const track of flexible) effective = Math.min(effective, Math.max(0, (track.px - track.min) * (totalFraction / track.fraction)))
      // With every track a fixed size there is nobody to take the space from, so growth stops at the free space
      // that is left — otherwise the drag would quietly push the grid past its own box.
      if (flexible.length === 0) effective = Math.min(effective, this.freeSpace(axis, computed))
    }

    const next = Math.round(Math.max(minOf(index), current + effective))
    const resized = [...tracks]
    resized[index] = `${next}px`
    // The caller advances the pointer by what landed, so a track pinned at its minimum has no dead zone to cross
    // on the way back.
    return { tracks: resized, applied: next - current }
  }

  /** The largest minimum any card covering this track asks for, spread over the tracks that card spans. */
  private trackMin(axis: 'column' | 'row', index: number): number {
    let min = axis === 'column' ? this.minColumnWidth : this.minRowHeight
    for (const card of this.cards) {
      const constraint = card.constraint
      if (!constraint) continue
      const start = (axis === 'column' ? constraint.col : constraint.row) - 1
      const span = axis === 'column' ? constraint.colSpan : constraint.rowSpan
      const size = axis === 'column' ? constraint.minWidth : constraint.minHeight
      if (size <= 0 || index < start || index > start + span - 1) continue
      min = Math.max(min, size / span)
    }
    return Math.max(0, min)
  }

  /**
   * One `MediaQueryList` per entry of `layouts`, listened to for as long as the element is connected. Whichever
   * entry matches first is the one in force; the listeners re-run the choice whenever any of them flips.
   */
  private watchMedia() {
    this.unwatchMedia()
    if (isServer || typeof matchMedia !== 'function') return
    for (const entry of this.layouts ?? []) {
      const query = matchMedia(entry.media)
      query.addEventListener('change', this.handleMediaChange)
      this.mediaQueries.push(query)
    }
    this.activeLayout = this.resolveActiveLayout()
  }

  private unwatchMedia() {
    for (const query of this.mediaQueries) query.removeEventListener('change', this.handleMediaChange)
    this.mediaQueries = []
  }

  private resolveActiveLayout(): number {
    return this.mediaQueries.findIndex((query) => query.matches)
  }

  /** Each entry of `layouts` stores its own sizes: `<storage-key>@<media>`; the authored grid uses the bare key. */
  private get activeStorageKey(): string | undefined {
    if (!this.storageKey) return undefined
    const active = this.activeResponsiveLayout
    return active ? `${this.storageKey}@${active.media}` : this.storageKey
  }

  private syncTracks() {
    const active = this.activeResponsiveLayout
    const columns = toTracks(active?.columns ?? this.columns)
    const rows = toTracks(active?.rows ?? this.rows)
    const stored = this.readStored()
    // A stored layout only applies while it still describes the same grid; changing `columns` discards it.
    this.columnTracks = stored?.columns?.length === columns.length ? [...stored.columns] : columns
    this.rowTracks = stored?.rows?.length === rows.length ? [...stored.rows] : rows
    if (stored?.order?.length) queueMicrotask(() => this.applyPanelOrder(stored.order!))
    // Each stored layout carries its own choices; unknown names and card IDs are ignored when they are resolved.
    this.sizeChoices = new Map(Object.entries(stored?.sizes ?? {}))
    if (this.hasUpdated) this.refreshCards()
  }

  private readStored(): DashboardStoredLayout | null {
    const key = this.activeStorageKey
    if (!key || isServer) return null
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const parsed: unknown = JSON.parse(raw)
      return normalizeStored(this.deserializeLayout ? this.deserializeLayout(parsed) : parsed)
    } catch {
      return null
    }
  }

  private persist() {
    const key = this.activeStorageKey
    if (!key || isServer) return
    try {
      const layout: DashboardStoredLayout = {
        version: 1,
        columns: [...this.columnTracks],
        rows: [...this.rowTracks],
        order: this.panelOrder,
        breakpoint: this.activeResponsiveLayout?.media ?? null,
        sizes: this.storedSizeChoices(),
      }
      localStorage.setItem(key, JSON.stringify(this.serializeLayout ? this.serializeLayout(layout) : layout))
    } catch {
      // A private window or a full quota only costs the stored layout.
    }
  }

  override render() {
    return html`<slot></slot>`
  }

  private get childCards(): DashboardCard[] {
    return [...this.children].filter((child): child is DashboardCard => child instanceof HTMLElement && child.tagName.toLowerCase() === 'c2-dash-card')
  }

  private idOf(card: DashboardCard): string {
    return card.cardId ?? card.getAttribute('card-id') ?? ''
  }

  private knowsSize(name: string | undefined): name is string {
    return name !== undefined && this.sizes !== undefined && Object.prototype.hasOwnProperty.call(this.sizes, name)
  }

  /** The runtime choice when it names a known size, else the card's authored one when that does, else none. */
  private sizeNameOf(card: DashboardCard): string | undefined {
    const id = this.idOf(card)
    const chosen = id ? this.sizeChoices.get(id) : undefined
    if (this.knowsSize(chosen)) return chosen
    const authored = card.size ?? card.getAttribute('size') ?? undefined
    return this.knowsSize(authored) ? authored : undefined
  }

  /** Runtime choices of cards that are still here, naming sizes that still exist. */
  private storedSizeChoices(): Record<string, string> {
    const ids = new Set(this.panelOrder)
    return Object.fromEntries([...this.sizeChoices].filter(([id, name]) => ids.has(id) && this.knowsSize(name)))
  }

  private refreshCards() {
    for (const card of this.cards) card.hostChanged()
  }

  private get panelOrder(): string[] {
    return this.childCards.map((card) => this.idOf(card)).filter(Boolean)
  }

  private applyPanelOrder(order: readonly string[]) {
    const cards = this.childCards
    const byId = new Map(cards.map((card) => [this.idOf(card), card]))
    const ordered = order.map((id) => byId.get(id)).filter((card): card is DashboardCard => Boolean(card))
    for (const card of cards) if (!ordered.includes(card)) ordered.push(card)
    if (ordered.every((card, index) => card === cards[index])) return
    this.append(...ordered)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-dashboard': Dashboard
  }
}
