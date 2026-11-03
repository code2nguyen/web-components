import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { assignSlot, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/avatar'
import { videoGridMessages } from './messages'
import styles from './video-grid.scss?inline'

export { videoGridMessages } from './messages'

/** How the grid lays its tiles out. */
export type VideoGridLayout = 'grid' | 'spotlight' | 'sidebar'

/** Events fired by {@link VideoGrid}, keyed for `addEventListener`. */
export interface VideoGridEventMap {
  'overflow-click': CustomEvent<{ hidden: Element[] }>
  'featured-change': CustomEvent<{ tile: Element | null }>
}

export interface VideoGrid {
  addEventListener: TypedAddEventListener<VideoGrid, VideoGridEventMap>
  removeEventListener: TypedRemoveEventListener<VideoGrid, VideoGridEventMap>
}

/** The size of each tile and how many columns hold them, for `count` tiles in an area. */
export interface VideoGridFit {
  columns: number
  width: number
  height: number
}

/**
 * The column count that makes `count` tiles of `aspect` (width ÷ height) largest inside `width` × `height` with `gap`
 * between them: the layout Meet and Zoom draw.
 */
export function fitTiles(count: number, width: number, height: number, gap: number, aspect: number): VideoGridFit {
  let best: VideoGridFit = { columns: 1, width: 0, height: 0 }
  if (count < 1 || width <= 0 || height <= 0) return best
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns)
    const tileWidth = Math.min((width - (columns - 1) * gap) / columns, ((height - (rows - 1) * gap) / rows) * aspect)
    if (tileWidth > best.width) best = { columns, width: tileWidth, height: tileWidth / aspect }
  }
  return { columns: best.columns, width: Math.floor(best.width), height: Math.floor(best.height) }
}

/** Reads an aspect ratio written as `16 / 9`, `1.5` or `4/3`. */
function parseAspect(value: string): number {
  const [width, height] = value.split('/').map((part) => Number.parseFloat(part))
  const ratio = height ? width / height : width
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9
}

const OBSERVED = ['featured', 'kind', 'pinned', 'speaking', 'name']

/**
 * Lays out the tiles of a call, usually `c2-video-tile`s, the way Meet does: every tile as large as the space allows.
 *
 * `layout="grid"` (the default) picks the column count that makes the tiles largest for the grid's size and the tiles'
 * aspect ratio, recomputed as it resizes, and centres the last row: one tile fills the stage, two sit side by side or,
 * on a portrait screen, one above the other. `spotlight` draws the featured tile large with the others in a filmstrip
 * below; `sidebar` puts the others in a column at the inline end.
 *
 * The featured tile is the first child marked `featured`, else the first screen share (`kind="screen"`), else the first
 * `pinned` tile, else the first child. It does not follow the active speaker by itself, since a stage that jumps with
 * every voice is hard to watch; an app that wants that sets `featured`. `featured-change` fires when it changes.
 *
 * `max-tiles` caps the tiles drawn; the others fold into a "+5 more" tile showing their avatars, which fires
 * `overflow-click` with the folded elements so the app can open its participants panel. The featured tile and tiles
 * marked `pinned` or `speaking` are never folded: they take the place of the last quiet ones.
 *
 * Tiles are routed by manual slot assignment, never by a `slot` attribute, so a tile that moves from the grid to the
 * stage keeps its element (and its playing video).
 *
 * @tag c2-video-grid
 *
 * @slot - The tiles, usually `c2-video-tile` elements.
 *
 * @event {CustomEvent<{ hidden: Element[] }>} overflow-click - Fired when the "+N more" tile is pressed. Does not bubble.
 * @event {CustomEvent<{ tile: Element | null }>} featured-change - Fired when the featured tile changes. Does not bubble.
 *
 * @csspart stage - The area of the grid, or of the featured tile.
 * @csspart strip - The filmstrip or sidebar.
 * @csspart more - The "+N more" tile.
 *
 * @internalcomponent c2-avatar-group
 *
 * @cssproperty {pixel} [--c2-video-grid--height=auto] - The height the tiles are fitted to; `100%` fills a sized parent. While `auto`, the grid takes `--c2-video-grid--aspect-ratio` from its width.
 * @cssproperty {number} [--c2-video-grid--aspect-ratio=16 / 9] - The grid's own shape while its height is `auto`.
 * @cssproperty {pixel} [--c2-video-grid--gap=8px]
 * @cssproperty {pixel} [--c2-video-grid--padding=8px]
 * @cssproperty {color} [--c2-video-grid--background=transparent]
 * @cssproperty {number} [--c2-video-grid__tile--aspect-ratio=16 / 9] - The shape of the tiles the grid fits.
 * @cssproperty {pixel} [--c2-video-grid__strip--size=112px] - Height of the filmstrip, or width of the sidebar.
 * @cssproperty {color} [--c2-video-grid__more--background=light-dark(#e4e4e7, #27272a)]
 * @cssproperty {color} [--c2-video-grid__more--color=light-dark(#18181b, #fafafa)]
 * @cssproperty {border-radius} [--c2-video-grid__more--border-radius=8px]
 * @cssproperty {outline} [--c2-video-grid__more__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-video-grid')
export class VideoGrid extends LitElement {
  static override styles = unsafeCSS(styles)
  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, slotAssignment: 'manual' }

  /** `grid`, `spotlight` or `sidebar`. */
  @property() layout: VideoGridLayout = 'grid'

  /** The most tiles drawn; the rest fold into a "+N more" tile. 0 draws them all. */
  @property({ type: Number, attribute: 'max-tiles' }) maxTiles = 0

  @state() private tiles: Element[] = []
  @state() private stageFit: VideoGridFit = { columns: 1, width: 0, height: 0 }

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, videoGridMessages)
  private mutations: MutationObserver | null = null
  private resizes: ResizeObserver | null = null
  private featuredTile: Element | null = null

  constructor() {
    super()
    this.internals.role = 'group'
  }

  /** The tile the spotlight and sidebar layouts draw large. */
  get featured(): Element | null {
    return this.pickFeatured(this.tiles)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.mutations = new MutationObserver(() => this.collect())
    this.mutations.observe(this, { childList: true, attributes: true, subtree: true, attributeFilter: OBSERVED })
    this.collect()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.mutations?.disconnect()
    this.mutations = null
    this.resizes?.disconnect()
    this.resizes = null
  }

  protected override firstUpdated(): void {
    this.resizes = new ResizeObserver(() => this.measure())
    const stage = this.renderRoot.querySelector('.stage')
    if (stage) this.resizes.observe(stage)
  }

  protected override willUpdate(changed: PropertyValues): void {
    this.internals.ariaLabel = this.msg.t('participants', this.tiles.length)
    if (changed.has('tiles')) {
      const featured = this.pickFeatured(this.tiles)
      if (featured !== this.featuredTile) {
        this.featuredTile = featured
        if (this.hasUpdated) this.dispatchEvent(new CustomEvent('featured-change', { detail: { tile: featured } }))
      }
    }
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has('tiles') || changed.has('layout') || changed.has('maxTiles')) this.measure()
    if (!this.manualSlots) this.routeBySlotAttribute()
  }

  /** The element children, in order: the tiles. */
  private collect(): void {
    const tiles = [...this.children].filter((child) => !(child instanceof HTMLTemplateElement) && child.localName !== 'script' && child.localName !== 'style')
    // A new array for every change, also an attribute change on a tile: who is featured or folded may follow it.
    this.tiles = tiles
  }

  private pickFeatured(tiles: readonly Element[]): Element | null {
    return (
      tiles.find((tile) => tile.hasAttribute('featured')) ??
      tiles.find((tile) => tile.getAttribute('kind') === 'screen') ??
      tiles.find((tile) => tile.hasAttribute('pinned')) ??
      tiles[0] ??
      null
    )
  }

  /** Which tiles are drawn and which fold into the "+N more" tile. */
  private split(): { shown: Element[]; hidden: Element[] } {
    const tiles = this.tiles
    const limit = Math.floor(this.maxTiles)
    if (!(limit > 0) || tiles.length <= limit) return { shown: tiles, hidden: [] }
    // One place goes to the "+N more" tile.
    const room = Math.max(1, limit - 1)
    const featured = this.layout === 'grid' ? null : this.featured
    const kept = new Set<Element>()
    const keep = (tile: Element | null | undefined) => {
      if (tile && kept.size < room) kept.add(tile)
    }
    keep(featured)
    for (const tile of tiles) if (tile.hasAttribute('pinned') || tile.hasAttribute('speaking')) keep(tile)
    for (const tile of tiles) keep(tile)
    return { shown: tiles.filter((tile) => kept.has(tile)), hidden: tiles.filter((tile) => !kept.has(tile)) }
  }

  /** Fits the tiles of the stage (all of them in the grid layout, the featured one otherwise) to its size. */
  private measure(): void {
    const stage = this.renderRoot?.querySelector<HTMLElement>('.stage')
    if (!stage) return
    const style = getComputedStyle(this)
    const gap = Number.parseFloat(style.getPropertyValue('--c2-video-grid--gap')) || 8
    const aspect = parseAspect(style.getPropertyValue('--c2-video-grid__tile--aspect-ratio').trim() || '16 / 9')
    const { shown, hidden } = this.split()
    const count = this.layout === 'grid' ? shown.length + (hidden.length ? 1 : 0) : 1
    const fit = fitTiles(count, stage.clientWidth, stage.clientHeight, gap, aspect)
    const current = this.stageFit
    if (fit.columns !== current.columns || fit.width !== current.width || fit.height !== current.height) this.stageFit = fit
  }

  private get manualSlots(): boolean {
    return (this.renderRoot as ShadowRoot).slotAssignment === 'manual'
  }

  /**
   * A server-rendered (declarative) shadow root stays in named mode, where `assign()` does nothing: the tiles are
   * routed by their `slot` attribute there instead.
   */
  private routeBySlotAttribute(): void {
    const { shown } = this.split()
    const grid = this.layout === 'grid' || shown.length <= 1
    const featured = grid ? null : this.featured
    for (const tile of this.tiles) {
      // A tile in no slot of the root is not drawn: that is how a folded tile hides.
      const name = !shown.includes(tile) ? 'folded' : grid || tile === featured ? 'main' : 'strip'
      if (tile.getAttribute('slot') !== name) tile.setAttribute('slot', name)
    }
  }

  private handleMore(hidden: Element[]): void {
    this.dispatchEvent(new CustomEvent('overflow-click', { detail: { hidden } }))
  }

  private renderMore(hidden: Element[]) {
    if (!hidden.length) return nothing
    const names = hidden.map((tile) => tile.getAttribute('name') ?? '').filter(Boolean)
    return html`<button type="button" class="more" part="more" aria-label=${this.msg.t('showMore', hidden.length)} @click=${() => this.handleMore(hidden)}>
      ${
        names.length
          ? html`<c2-avatar-group class="faces" max-visible="3" aria-hidden="true">
              ${repeat(
                names.slice(0, 4),
                (name, index) => `${index}:${name}`,
                (name) => html`<c2-avatar name=${name} initial-count="2" auto-color></c2-avatar>`,
              )}
            </c2-avatar-group>`
          : nothing
      }
      <span class="more-label">${this.msg.t('more', hidden.length)}</span>
    </button>`
  }

  override render() {
    const { shown, hidden } = this.split()
    const fit = this.stageFit
    const grid = this.layout === 'grid' || shown.length <= 1
    const featured = grid ? null : this.featured
    const main = grid ? shown : featured ? [featured] : []
    const strip = grid ? [] : shown.filter((tile) => tile !== featured)
    return html`<div class="grid layout-${grid ? 'grid' : this.layout}">
      <div class="stage" part="stage" style=${isServer ? '' : `--_tile-width: ${fit.width}px; --_tile-height: ${fit.height}px`}>
        <slot name="main" ${assignSlot(main)}></slot>
        ${grid ? this.renderMore(hidden) : nothing}
      </div>
      <div class="strip" part="strip" ?hidden=${grid}>
        <slot name="strip" ${assignSlot(strip)}></slot>
        ${grid ? nothing : this.renderMore(hidden)}
      </div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-video-grid': VideoGrid
  }
}
