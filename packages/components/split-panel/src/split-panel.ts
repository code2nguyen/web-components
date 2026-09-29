import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { query } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { styleMap } from 'lit/directives/style-map.js'
import styles from './split-panel.scss?inline'

export type SplitPanelOrientation = 'horizontal' | 'vertical'
export type SplitPanelPrimary = 'start' | 'end'

/** Events fired by {@link SplitPanel}, keyed for `addEventListener`. */
export interface SplitPanelEventMap {
  reposition: CustomEvent<{ position: number }>
}

export interface SplitPanel {
  addEventListener: TypedAddEventListener<SplitPanel, SplitPanelEventMap>
  removeEventListener: TypedRemoveEventListener<SplitPanel, SplitPanelEventMap>
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Two panels separated by a draggable divider — an editor beside its preview, a list beside the record it opens, a
 * sidebar the reader can widen. The divider follows the WAI-ARIA window splitter pattern: it is a focusable
 * `separator` whose value is the size of the start panel, moved by dragging (mouse, touch or pen) or with the keyboard
 * (Arrow keys by 1%, Shift + Arrow by 10%, Home/End to `min`/`max`, Enter to collapse the start panel to `min` and
 * restore it).
 *
 * `position` is the start panel's share of the space, in percent. `orientation="vertical"` stacks the panels top and
 * bottom; the host then needs a height. `min`/`max` bound the position, `snap` lists positions the divider sticks to
 * while dragging, and `primary` names the panel that keeps its pixel size when the host is resized — a sidebar that
 * should stay 240px wide while the window grows. Nest a second split panel in a slot for a three-way layout.
 *
 * @tag c2-split-panel
 *
 * @slot start - Content of the first panel (left, or top when vertical; right in a right-to-left context).
 * @slot end - Content of the second panel.
 * @slot handle - Replaces the default grip drawn in the middle of the divider.
 *
 * @event {CustomEvent<{ position: number }>} reposition - Fired when the user moves the divider (drag, keyboard). Not fired for `position` changes made by script or by `primary` on resize. Does not bubble.
 *
 * @csspart start - Panel wrapping the `start` slot; sized by `position` and scrolls its assigned content.
 * @csspart end - Panel wrapping the `end` slot; takes the remaining space and scrolls its assigned content.
 * @csspart divider - The draggable separator between the panels.
 * @csspart handle - Grip box in the middle of the divider, wrapping the `handle` slot; shows the default dot grip as fallback until content is assigned.
 *
 * @cssproperty {pixel} [--c2-split-panel__divider--size=1px] - Thickness of the visible divider line; it takes that much room between the panels.
 * @cssproperty {pixel} [--c2-split-panel__divider--hit-area=12px] - Thickness of the invisible grab area centred on the divider.
 * @cssproperty {opacity} [--c2-split-panel__divider--opacity=0] - Resting opacity of the divider line and its grip; hidden until hovered, dragged or keyboard-focused (always shown on devices without hover). Set `1` to keep it visible.
 * @cssproperty {opacity} [--c2-split-panel__divider__hover--opacity=1] - Opacity while hovered, dragged or keyboard-focused.
 * @cssproperty {color} [--c2-split-panel__divider--background=#e4e4e7]
 * @cssproperty {color} [--c2-split-panel__divider__hover--background=#a1a1aa]
 * @cssproperty {color} [--c2-split-panel__divider__active--background=rgb(2, 101, 220)] - While dragging.
 * @cssproperty {color} [--c2-split-panel__divider__focus--background=rgb(2, 101, 220)] - While keyboard-focused; the divider draws no outline.
 * @cssproperty {opacity} [--c2-split-panel__divider__disabled--opacity=0.38] - Multiplied by `--c2-split-panel__divider--opacity`, so a hidden divider stays hidden when disabled.
 *
 * @cssproperty {display} [--c2-split-panel__handle--display=flex] - `none` hides the grip, leaving a bare line.
 * @cssproperty {pixel} [--c2-split-panel__handle--width=12px] - Across the divider.
 * @cssproperty {pixel} [--c2-split-panel__handle--height=24px] - Along the divider.
 * @cssproperty {background} [--c2-split-panel__handle--background=#ffffff]
 * @cssproperty {border} [--c2-split-panel__handle--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-split-panel__handle--border-radius=4px]
 * @cssproperty {color} [--c2-split-panel__handle--color=#71717a] - Colour of the grip dots.
 *
 * @cssproperty {overflow} [--c2-split-panel__panel--overflow=auto] - Overflow of both panels.
 * @cssproperty {background} [--c2-split-panel__start--background=transparent]
 * @cssproperty {background} [--c2-split-panel__end--background=transparent]
 */
@customElement('c2-split-panel')
export class SplitPanel extends LitElement {
  static override styles = unsafeCSS(styles)

  @query('.container') private container!: HTMLElement
  @query('[part~="divider"]') private divider!: HTMLElement

  /** Size of the start panel in percent of the space the two panels share, clamped to `min`/`max`. */
  @property({ type: Number, reflect: true }) position = 50

  /** Smallest `position`, in percent. */
  @property({ type: Number }) min = 0

  /** Largest `position`, in percent. */
  @property({ type: Number }) max = 100

  /** `horizontal` puts the panels side by side; `vertical` stacks them. */
  @property({ reflect: true }) orientation: SplitPanelOrientation = 'horizontal'

  /** Panel that keeps its pixel size when the host is resized. Without it both panels scale with the host. */
  @property({ reflect: true }) primary: SplitPanelPrimary | undefined = undefined

  /** Space-separated positions in percent (`"25 50 75"`) the divider snaps to while dragging within `snap-threshold`. */
  @property() snap = ''

  /** Distance in pixels within which a drag snaps to a `snap` position. */
  @property({ type: Number, attribute: 'snap-threshold' }) snapThreshold = 12

  /** Locks the divider: no dragging, no keyboard, not focusable. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Accessible name of the divider. */
  @property() label = 'Resize panels'

  private resizeObserver?: ResizeObserver
  private lastSize = 0
  private restorePosition: number | undefined
  private dragging = false

  override connectedCallback() {
    super.connectedCallback()
    if (typeof ResizeObserver === 'undefined') return
    this.resizeObserver ??= new ResizeObserver(() => this.handleResize())
    if (this.hasUpdated) this.resizeObserver.observe(this.container)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
  }

  protected override firstUpdated() {
    this.resizeObserver?.observe(this.container)
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('position') || changed.has('min') || changed.has('max')) {
      const position = this.clampPosition(this.position)
      if (position !== this.position) this.position = position
    }
  }

  private get vertical() {
    return this.orientation === 'vertical'
  }

  private get rtl() {
    return !this.vertical && getComputedStyle(this).direction === 'rtl'
  }

  private clampPosition(value: number) {
    const min = clamp(Number.isFinite(this.min) ? this.min : 0, 0, 100)
    const max = clamp(Number.isFinite(this.max) ? this.max : 100, min, 100)
    return clamp(Number.isFinite(value) ? value : 50, min, max)
  }

  /** Pixels the two panels share: the container along the split axis minus the divider. */
  private availableSize() {
    const rect = this.container.getBoundingClientRect()
    const divider = this.divider.getBoundingClientRect()
    return this.vertical ? rect.height - divider.height : rect.width - divider.width
  }

  private handleResize() {
    const size = this.availableSize()
    const previous = this.lastSize
    this.lastSize = size
    if (!this.primary || previous <= 0 || size <= 0 || previous === size) return
    const start = (previous * this.position) / 100
    const end = previous - start
    this.position = this.clampPosition(this.primary === 'start' ? (start / size) * 100 : 100 - (end / size) * 100)
  }

  private moveTo(value: number) {
    const position = this.clampPosition(value)
    if (position === this.position) return
    this.position = position
    this.dispatchEvent(new CustomEvent('reposition', { detail: { position } }))
  }

  private snapPositions() {
    return this.snap
      .split(/[\s,]+/)
      .map((entry) => parseFloat(entry))
      .filter((entry) => Number.isFinite(entry))
  }

  private positionFromPointer(event: PointerEvent) {
    const rect = this.container.getBoundingClientRect()
    const dividerSize = this.vertical ? this.divider.offsetHeight : this.divider.offsetWidth
    const size = (this.vertical ? rect.height : rect.width) - dividerSize
    if (size <= 0) return this.position
    let offset = this.vertical ? event.clientY - rect.top : event.clientX - rect.left
    if (this.rtl) offset = rect.width - offset
    offset -= dividerSize / 2
    for (const snap of this.snapPositions()) {
      if (Math.abs(offset - (size * snap) / 100) <= this.snapThreshold) return snap
    }
    return (offset / size) * 100
  }

  private handlePointerDown(event: PointerEvent) {
    if (this.disabled || (event.pointerType === 'mouse' && event.button !== 0)) return
    // preventDefault also keeps the divider from taking focus: a drag leaves focus where it was.
    event.preventDefault()
    this.divider.setPointerCapture(event.pointerId)
    this.dragging = true
    this.toggleAttribute('dragging', true)
  }

  private handlePointerMove(event: PointerEvent) {
    if (!this.dragging) return
    this.moveTo(this.positionFromPointer(event))
  }

  private handlePointerUp(event: PointerEvent) {
    if (!this.dragging) return
    this.dragging = false
    this.toggleAttribute('dragging', false)
    if (this.divider.hasPointerCapture(event.pointerId)) this.divider.releasePointerCapture(event.pointerId)
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (this.disabled) return
    const step = event.shiftKey ? 10 : 1
    const forward = this.rtl ? 'ArrowLeft' : 'ArrowRight'
    const backward = this.rtl ? 'ArrowRight' : 'ArrowLeft'
    let next: number | undefined
    switch (event.key) {
      case backward:
      case 'ArrowUp':
        next = this.position - step
        break
      case forward:
      case 'ArrowDown':
        next = this.position + step
        break
      case 'Home':
        next = this.min
        break
      case 'End':
        next = this.max
        break
      case 'Enter':
        if (this.restorePosition !== undefined && this.position === this.clampPosition(this.min)) {
          next = this.restorePosition
          this.restorePosition = undefined
        } else {
          this.restorePosition = this.position
          next = this.min
        }
        break
    }
    if (next === undefined) return
    event.preventDefault()
    if (event.key !== 'Enter') this.restorePosition = undefined
    this.moveTo(next)
  }

  override render() {
    const template = `calc((100% - var(--_divider)) * ${this.position / 100}) var(--_divider) minmax(0, 1fr)`
    const layout = this.vertical ? { gridTemplateRows: template } : { gridTemplateColumns: template }
    return html`
      <div class="container" style=${styleMap(layout)}>
        <div part="start" class="panel" id="start"><slot name="start"></slot></div>
        <div
          part="divider"
          role="separator"
          tabindex=${this.disabled ? -1 : 0}
          aria-label=${this.label}
          aria-controls="start"
          aria-orientation=${this.vertical ? 'horizontal' : 'vertical'}
          aria-valuenow=${Math.round(this.position)}
          aria-valuemin=${this.clampPosition(this.min)}
          aria-valuemax=${this.clampPosition(this.max)}
          aria-disabled=${this.disabled ? 'true' : 'false'}
          @pointerdown=${this.handlePointerDown}
          @pointermove=${this.handlePointerMove}
          @pointerup=${this.handlePointerUp}
          @pointercancel=${this.handlePointerUp}
          @lostpointercapture=${this.handlePointerUp}
          @keydown=${this.handleKeyDown}
        >
          <div part="handle">
            <slot name="handle">
              <svg viewBox="0 0 6 14" aria-hidden="true">
                <circle cx="1.5" cy="2" r="1" />
                <circle cx="4.5" cy="2" r="1" />
                <circle cx="1.5" cy="7" r="1" />
                <circle cx="4.5" cy="7" r="1" />
                <circle cx="1.5" cy="12" r="1" />
                <circle cx="4.5" cy="12" r="1" />
              </svg>
            </slot>
          </div>
        </div>
        <div part="end" class="panel"><slot name="end"></slot></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-split-panel': SplitPanel
  }
}
