import { LitElement, html, nothing, svg, unsafeCSS, type TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { isServer } from 'lit-html/is-server.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { DASHBOARD_TAG, type DashCardConstraint, type DashboardHost } from './dashboard-host'
import styles from './dash-card.scss?inline'

/** Which edges of the card can be dragged. */
export type DashCardResize = 'both' | 'horizontal' | 'vertical' | 'none'

/** How far the card is expanded over its authored placement. */
export type DashCardExpanded = 'none' | 'width' | 'height' | 'full'

/** Detail of the `expand-change` event. */
export interface DashCardExpandChangeDetail {
  /** The new expansion state. */
  expanded: DashCardExpanded
}

/** Events fired by {@link DashCard}, keyed for `addEventListener`. */
export interface DashCardEventMap {
  'expand-change': CustomEvent<DashCardExpandChangeDetail>
}

export interface DashCard {
  addEventListener: TypedAddEventListener<DashCard, DashCardEventMap>
  removeEventListener: TypedRemoveEventListener<DashCard, DashCardEventMap>
}

/** Placement after the layout override, the expansion state and the grid's bounds have been applied. */
interface EffectivePlacement {
  col: number
  row: number
  colSpan: number
  rowSpan: number
}

const KEYBOARD_STEP = 10
const KEYBOARD_FINE_STEP = 1

const ICONS = {
  expandWidth: svg`<polyline points="10 7 5 12 10 17" /><polyline points="14 7 19 12 14 17" />`,
  collapseWidth: svg`<polyline points="5 7 10 12 5 17" /><polyline points="19 7 14 12 19 17" />`,
  expandHeight: svg`<polyline points="7 10 12 5 17 10" /><polyline points="7 14 12 19 17 14" />`,
  collapseHeight: svg`<polyline points="7 5 12 10 17 5" /><polyline points="7 19 12 14 17 19" />`,
  expandFull: svg`<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />`,
  collapseFull: svg`<path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3" />`,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * One pane of a `c2-dashboard`. It owns its place in the grid (`col`, `row`, `col-span`, `row-span`), the drag
 * handles on the edges it shares with a neighbour, and the optional expand controls; it draws no surface of its
 * own, so put a `c2-card` — or any markup — in the default slot.
 *
 * A handle resizes the whole grid track, never just this card, and it only appears where there is a neighbour to
 * take the space from: the right edge has one when another column follows, the left edge when one precedes. Drag
 * it, or focus it and use the arrow keys (10px a step, 1px with Shift).
 *
 * Filling the `header`, `actions` or `footer` slot turns on that row; with the header and actions both empty the
 * expand controls float over the top-right corner of the pane instead. An expanded card covers its neighbours, so
 * give it — or the card inside it — a background.
 *
 * Every built-in icon is a slot whose fallback is the default drawing, so a pane can use the host application's own
 * icon set without giving up the behaviour.
 *
 * @tag c2-dash-card
 *
 * @slot - Pane content. Give it `height: 100%` (a `c2-card` already stretches) so it follows the row track.
 * @slot header - Title area of the header row; filling it turns the row on.
 * @slot actions - Your own controls at the end of the header row, before the built-in expand buttons and separated
 * from them by `--c2-dash-card__actions--gap`.
 * @slot controls - Your own controls inside the built-in group, immediately before the expand buttons — for a
 * button that belongs with them, such as a refresh or a close.
 * @slot footer - Status bar under the pane content; filling it turns the row on.
 * @slot expand-width-icon - Icon of the full-width control while the card is not expanded that way.
 * @slot collapse-width-icon - Icon of the full-width control while it is.
 * @slot expand-height-icon - Icon of the full-height control while the card is not expanded that way.
 * @slot collapse-height-icon - Icon of the full-height control while it is.
 * @slot expand-full-icon - Icon of the fullscreen control while the card is not expanded.
 * @slot collapse-full-icon - Icon of the fullscreen control while it is.
 *
 * @event {CustomEvent<DashCardExpandChangeDetail>} expand-change - The card was expanded or collapsed through one
 * of its own controls. Does not bubble: listen on the element.
 *
 * @csspart header - The header row, or the floating control group when the header and actions slots are empty.
 * @csspart body - The wrapper around the default slot.
 * @csspart footer - The footer row.
 * @csspart controls - The group holding the `controls` slot and the built-in expand buttons.
 * @csspart control - One built-in expand button.
 * @csspart handle - Every drag handle. Each also carries the part of its edge.
 * @csspart handle-left - The handle on the left edge.
 * @csspart handle-right - The handle on the right edge.
 * @csspart handle-top - The handle on the top edge.
 * @csspart handle-bottom - The handle on the bottom edge.
 *
 * @cssproperty {background} [--c2-dash-card--background=transparent]
 * @cssproperty {border} [--c2-dash-card--border=none]
 * @cssproperty {border-radius} [--c2-dash-card--border-radius=0px]
 * @cssproperty {box-shadow} [--c2-dash-card--box-shadow=none]
 * @cssproperty {padding} [--c2-dash-card--padding=0px]
 * @cssproperty {overflow} [--c2-dash-card--overflow=hidden] - `hidden` keeps the content inside the track; switch
 * it to `visible` for a pane that has to overflow, such as one holding a menu.
 *
 * @cssproperty {background} --c2-dash-card__expanded--background - Fill while the card is expanded over its
 * neighbours; falls back to `--c2-dash-card--background`, which is transparent, so set one of the two.
 * @cssproperty {number} [--c2-dash-card__expanded--z-index=20]
 * @cssproperty {duration} [--c2-dash-card__expanded--animation-duration=200ms] - Length of the scale-in the card
 * plays when it expands or collapses. Ignored under `prefers-reduced-motion`.
 *
 * @cssproperty {pixel} [--c2-dash-card__header--min-height=44px]
 * @cssproperty {padding} [--c2-dash-card__header--padding-block=8px]
 * @cssproperty {padding} [--c2-dash-card__header--padding-inline=12px]
 * @cssproperty {pixel} [--c2-dash-card__header--gap=12px]
 * @cssproperty {background} [--c2-dash-card__header--background=transparent]
 * @cssproperty {border} [--c2-dash-card__header--border-bottom=none]
 * @cssproperty {color} [--c2-dash-card__header--color=#18181b]
 * @cssproperty {pixel} [--c2-dash-card__header--font-size=14px]
 * @cssproperty {font-weight} [--c2-dash-card__header--font-weight=600]
 *
 * @cssproperty {pixel} [--c2-dash-card__footer--min-height=36px]
 * @cssproperty {padding} [--c2-dash-card__footer--padding-block=6px]
 * @cssproperty {padding} [--c2-dash-card__footer--padding-inline=12px]
 * @cssproperty {pixel} [--c2-dash-card__footer--gap=8px]
 * @cssproperty {background} [--c2-dash-card__footer--background=transparent]
 * @cssproperty {border} [--c2-dash-card__footer--border-top=none]
 * @cssproperty {color} [--c2-dash-card__footer--color=#71717a]
 * @cssproperty {pixel} [--c2-dash-card__footer--font-size=12px]
 *
 * @cssproperty {pixel} [--c2-dash-card__actions--gap=8px]
 * @cssproperty {pixel} [--c2-dash-card__controls--gap=2px]
 * @cssproperty {pixel} [--c2-dash-card__controls--offset=4px] - Inset of the floating control group from the
 * top-right corner, used only while the header row is off.
 *
 * @cssproperty {pixel} [--c2-dash-card__control--size=24px]
 * @cssproperty {pixel} [--c2-dash-card__control--icon-size=16px]
 * @cssproperty {border-radius} [--c2-dash-card__control--border-radius=6px]
 * @cssproperty {color} [--c2-dash-card__control--color=#71717a]
 * @cssproperty {background} [--c2-dash-card__control--background=transparent]
 * @cssproperty {background} [--c2-dash-card__control__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-dash-card__control__hover--color=#18181b]
 * @cssproperty {outline} [--c2-dash-card__control__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-dash-card__control__focus--outline-offset=2px]
 *
 * @cssproperty {pixel} [--c2-dash-card__handle--size=6px] - Thickness of the grab area on an edge. It reaches into
 * the pane, so it stays grabbable however wide the grid gutter is.
 * @cssproperty {pixel} [--c2-dash-card__handle--inset=2px] - Gap between the handle's visible bar and the ends of
 * the edge.
 * @cssproperty {background} [--c2-dash-card__handle--background=transparent]
 * @cssproperty {background} [--c2-dash-card__handle__hover--background=rgba(2, 101, 220, 0.2)]
 * @cssproperty {background} [--c2-dash-card__handle__active--background=rgb(2, 101, 220)]
 * @cssproperty {border-radius} [--c2-dash-card__handle--border-radius=999px]
 * @cssproperty {duration} [--c2-dash-card__handle--transition-duration=150ms]
 * @cssproperty {outline} [--c2-dash-card__handle__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-dash-card')
export class DashCard extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Identifier the grid's `layout` record is keyed by. */
  @property({ attribute: 'card-id' }) cardId: string | undefined = undefined

  /** 1-based column the card starts in. */
  @property({ type: Number }) col = 1

  /** 1-based row the card starts in. */
  @property({ type: Number }) row = 1

  /** Number of columns the card occupies. */
  @property({ type: Number, attribute: 'col-span' }) colSpan = 1

  /** Number of rows the card occupies. */
  @property({ type: Number, attribute: 'row-span' }) rowSpan = 1

  /** Smallest width in pixels the card accepts; it raises the minimum of every column it covers. */
  @property({ type: Number, attribute: 'min-width' }) minWidth = 0

  /** Smallest height in pixels the card accepts; it raises the minimum of every row it covers. */
  @property({ type: Number, attribute: 'min-height' }) minHeight = 0

  /** Which edges carry a drag handle. */
  @property({ reflect: true }) resize: DashCardResize = 'both'

  /** Offers a control that expands the card across every column. */
  @property({ type: Boolean, attribute: 'expand-width' }) expandWidth = false

  /** Offers a control that expands the card across every row. */
  @property({ type: Boolean, attribute: 'expand-height' }) expandHeight = false

  /** Offers a control that expands the card over the whole grid. */
  @property({ type: Boolean, attribute: 'expand-full' }) expandFull = false

  /** How far the card is currently expanded. Settable, so an app can expand a card from its own control. */
  @property({ reflect: true }) expanded: DashCardExpanded = 'none'

  @state() private hasHeader = false
  @state() private hasActions = false
  @state() private hasSlottedControls = false
  @state() private hasFooter = false
  @state() private dashboard: DashboardHost | undefined = undefined

  /** The grid reads this during a drag; a hidden card asks for nothing. */
  get constraint(): DashCardConstraint | undefined {
    if (this.hidden) return undefined
    const placement = this.placement
    return {
      col: placement.col,
      colSpan: placement.colSpan,
      row: placement.row,
      rowSpan: placement.rowSpan,
      minWidth: Math.max(0, this.minWidth),
      minHeight: Math.max(0, this.minHeight),
    }
  }

  override connectedCallback() {
    super.connectedCallback()
    this.attachToDashboard()
  }

  override disconnectedCallback() {
    this.dashboard?.unregisterCard(this)
    this.dashboard = undefined
    super.disconnectedCallback()
  }

  /** Called by the grid when its shape or its layout record changed. */
  hostChanged() {
    this.requestUpdate()
  }

  override willUpdate() {
    const visible = this.dashboard?.placementOf(this.cardId)?.visible
    if (visible !== undefined) this.hidden = !visible
  }

  override updated() {
    const placement = this.placement
    this.style.setProperty('--_grid-column', `${placement.col} / span ${placement.colSpan}`)
    this.style.setProperty('--_grid-row', `${placement.row} / span ${placement.rowSpan}`)
    this.syncHandleValues()
  }

  /**
   * The splitter values are written straight onto the handles rather than re-rendered: a drag changes them on
   * every pointer move, and nothing else about the card changes with them.
   */
  private syncHandleValues() {
    const dashboard = this.dashboard
    if (!dashboard) return
    for (const handle of this.renderRoot.querySelectorAll<HTMLElement>('.c2-dash-card__handle')) {
      const axis = handle.dataset.axis === 'column' ? 'column' : 'row'
      const index = Number(handle.dataset.track)
      if (!Number.isFinite(index)) continue
      handle.setAttribute('aria-valuenow', String(dashboard.splitterValue(axis, index)))
    }
  }

  /** `slotchange` does not fire for a server-rendered shadow root, so read every slot once. */
  override firstUpdated() {
    for (const slot of this.renderRoot.querySelectorAll('slot')) this.updateSection(slot)
  }

  /**
   * The grid may upgrade after its cards do — the card element is in the document either way, so find it and wait
   * for the definition rather than for a parent that is already alive.
   */
  private attachToDashboard() {
    const host = this.closest(DASHBOARD_TAG) as DashboardHost | null
    if (!host) return
    if (typeof host.registerCard !== 'function') {
      if (isServer) return
      void customElements.whenDefined(DASHBOARD_TAG).then(() => {
        if (this.isConnected) this.attachToDashboard()
      })
      return
    }
    this.dashboard = host
    host.registerCard(this)
  }

  private get placement(): EffectivePlacement {
    const override = this.dashboard?.placementOf(this.cardId)
    const columnCount = this.dashboard?.columnCount ?? 0
    const rowCount = this.dashboard?.rowCount ?? 0
    const wide = this.expanded === 'width' || this.expanded === 'full'
    const tall = this.expanded === 'height' || this.expanded === 'full'

    let col = wide ? 1 : (override?.col ?? this.col)
    let row = tall ? 1 : (override?.row ?? this.row)
    let colSpan = wide ? Math.max(1, columnCount) : (override?.colSpan ?? this.colSpan)
    let rowSpan = tall ? Math.max(1, rowCount) : (override?.rowSpan ?? this.rowSpan)

    // Outside a grid, or past its last track, a card would otherwise create implicit tracks the grid knows nothing
    // about — and could not resize.
    if (columnCount > 0) {
      col = clamp(Math.trunc(col), 1, columnCount)
      colSpan = clamp(Math.trunc(colSpan), 1, columnCount - col + 1)
    }
    if (rowCount > 0) {
      row = clamp(Math.trunc(row), 1, rowCount)
      rowSpan = clamp(Math.trunc(rowSpan), 1, rowCount - row + 1)
    }
    return { col: Math.max(1, col), row: Math.max(1, row), colSpan: Math.max(1, colSpan), rowSpan: Math.max(1, rowSpan) }
  }

  private handleSlotChange(event: Event) {
    this.updateSection(event.target as HTMLSlotElement)
  }

  private updateSection(slot: HTMLSlotElement) {
    const filled = slot.assignedNodes({ flatten: true }).some((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== '')
    switch (slot.name) {
      case 'header':
        this.hasHeader = filled
        break
      case 'actions':
        this.hasActions = filled
        break
      case 'controls':
        this.hasSlottedControls = filled
        break
      case 'footer':
        this.hasFooter = filled
        break
      default:
        break
    }
  }

  private startDrag(event: PointerEvent, axis: 'column' | 'row', index: number) {
    const dashboard = this.dashboard
    if (!dashboard || event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget as HTMLElement
    let last = axis === 'column' ? event.clientX : event.clientY

    const move = (moveEvent: PointerEvent) => {
      const position = axis === 'column' ? moveEvent.clientX : moveEvent.clientY
      const delta = position - last
      if (delta === 0) return
      // Advance by what the grid could actually apply, so a track held at its minimum leaves no dead zone behind.
      last += axis === 'column' ? dashboard.resizeColumn(index, delta) : dashboard.resizeRow(index, delta)
    }
    const finish = (endEvent: PointerEvent) => {
      handle.releasePointerCapture(endEvent.pointerId)
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', finish)
      handle.removeEventListener('pointercancel', finish)
      handle.classList.remove('is-dragging')
      dashboard.commitResize()
      this.syncHandleValues()
    }

    handle.setPointerCapture(event.pointerId)
    handle.classList.add('is-dragging')
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', finish)
    handle.addEventListener('pointercancel', finish)
  }

  private handleHandleKeydown(event: KeyboardEvent, axis: 'column' | 'row', index: number) {
    const dashboard = this.dashboard
    if (!dashboard) return
    const step = event.shiftKey ? KEYBOARD_FINE_STEP : KEYBOARD_STEP
    const back = axis === 'column' ? 'ArrowLeft' : 'ArrowUp'
    const forward = axis === 'column' ? 'ArrowRight' : 'ArrowDown'
    const delta = event.key === back ? -step : event.key === forward ? step : 0
    if (delta === 0) return
    event.preventDefault()
    if (axis === 'column') dashboard.resizeColumn(index, delta)
    else dashboard.resizeRow(index, delta)
    dashboard.commitResize()
    this.syncHandleValues()
  }

  private toggleExpanded(axis: 'width' | 'height' | 'full') {
    let wide = this.expanded === 'width' || this.expanded === 'full'
    let tall = this.expanded === 'height' || this.expanded === 'full'
    if (axis === 'width') wide = !wide
    else if (axis === 'height') tall = !tall
    else wide = tall = !(wide && tall)

    this.expanded = wide && tall ? 'full' : wide ? 'width' : tall ? 'height' : 'none'
    this.dispatchEvent(new CustomEvent<DashCardExpandChangeDetail>('expand-change', { detail: { expanded: this.expanded }, bubbles: false, composed: true }))
  }

  private renderControl(axis: 'width' | 'height' | 'full', active: boolean, label: string, icon: TemplateResult) {
    // One slot per control and state: only the state on screen has a slot, so the icon for the other one stays
    // unassigned and out of the way, and the built-in drawing is simply the fallback.
    const slot = `${active ? 'collapse' : 'expand'}-${axis}-icon`
    return html`
      <button class="c2-dash-card__control" part="control" type="button" aria-label=${label} aria-pressed=${active} @click=${() => this.toggleExpanded(axis)}>
        <slot name=${slot}>
          <svg
            class="c2-dash-card__control-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            ${icon}
          </svg>
        </slot>
      </button>
    `
  }

  private renderControls() {
    const wide = this.expanded === 'width' || this.expanded === 'full'
    const tall = this.expanded === 'height' || this.expanded === 'full'
    return html`
      <slot name="controls" @slotchange=${this.handleSlotChange}></slot>
      ${
        this.expandWidth
          ? this.renderControl(
              'width',
              wide,
              wide ? 'Collapse to the original width' : 'Expand to the full width',
              wide ? ICONS.collapseWidth : ICONS.expandWidth,
            )
          : nothing
      }
      ${
        this.expandHeight
          ? this.renderControl(
              'height',
              tall,
              tall ? 'Collapse to the original height' : 'Expand to the full height',
              tall ? ICONS.collapseHeight : ICONS.expandHeight,
            )
          : nothing
      }
      ${
        this.expandFull
          ? this.renderControl(
              'full',
              wide && tall,
              wide && tall ? 'Collapse the card' : 'Expand the card',
              wide && tall ? ICONS.collapseFull : ICONS.expandFull,
            )
          : nothing
      }
    `
  }

  private renderHandle(axis: 'column' | 'row', edge: 'left' | 'right' | 'top' | 'bottom', index: number) {
    const label = axis === 'column' ? 'Resize column' : 'Resize row'
    return html`
      <div
        class="c2-dash-card__handle c2-dash-card__handle--${edge}"
        part="handle handle-${edge}"
        role="separator"
        tabindex="0"
        aria-orientation=${axis === 'column' ? 'vertical' : 'horizontal'}
        aria-label=${label}
        aria-valuenow=${this.dashboard?.splitterValue(axis, index) ?? 0}
        data-axis=${axis}
        data-track=${index}
        @pointerdown=${(event: PointerEvent) => this.startDrag(event, axis, index)}
        @keydown=${(event: KeyboardEvent) => this.handleHandleKeydown(event, axis, index)}
      >
        <span class="c2-dash-card__handle-bar"></span>
      </div>
    `
  }

  private renderHandles() {
    if (!this.dashboard || this.resize === 'none') return nothing
    const placement = this.placement
    const horizontal = this.resize === 'both' || this.resize === 'horizontal'
    const vertical = this.resize === 'both' || this.resize === 'vertical'
    const wide = this.expanded === 'width' || this.expanded === 'full'
    const tall = this.expanded === 'height' || this.expanded === 'full'
    const lastColumn = placement.col + placement.colSpan - 1
    const lastRow = placement.row + placement.rowSpan - 1

    return html`
      ${horizontal && !wide && lastColumn < this.dashboard.columnCount ? this.renderHandle('column', 'right', lastColumn - 1) : nothing}
      ${horizontal && !wide && placement.col > 1 ? this.renderHandle('column', 'left', placement.col - 2) : nothing}
      ${vertical && !tall && lastRow < this.dashboard.rowCount ? this.renderHandle('row', 'bottom', lastRow - 1) : nothing}
      ${vertical && !tall && placement.row > 1 ? this.renderHandle('row', 'top', placement.row - 2) : nothing}
    `
  }

  override render() {
    const hasControls = this.hasSlottedControls || this.expandWidth || this.expandHeight || this.expandFull
    const hasHeaderRow = this.hasHeader || this.hasActions
    // One header element either way: with the slots empty it is styled as the floating control group instead of a
    // row, so the `controls` slot exists exactly once and keeps its assignment.
    return html`
      <div class=${classMap({ 'c2-dash-card': true, 'has-header': hasHeaderRow })}>
        <div class="c2-dash-card__header" part="header" ?hidden=${!hasHeaderRow && !hasControls}>
          <div class="c2-dash-card__title"><slot name="header" @slotchange=${this.handleSlotChange}></slot></div>
          <div class="c2-dash-card__actions">
            <slot name="actions" @slotchange=${this.handleSlotChange}></slot>
            <div class="c2-dash-card__controls" part="controls" ?hidden=${!hasControls}>${this.renderControls()}</div>
          </div>
        </div>
        <div class="c2-dash-card__body" part="body"><slot></slot></div>
        <div class="c2-dash-card__footer" part="footer" ?hidden=${!this.hasFooter}>
          <slot name="footer" @slotchange=${this.handleSlotChange}></slot>
        </div>
      </div>
      ${this.renderHandles()}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-dash-card': DashCard
  }
}
