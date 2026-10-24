import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { SlotPresenceController, lockPageScroll, redispatchEvent } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { sheetMessages } from './messages'
import styles from './sheet.scss?inline'

export type SheetSide = 'right' | 'left' | 'top' | 'bottom'

/** Pixels the pointer travels before a press on the header becomes a drag, so a click on a title button stays a click. */
const DRAG_THRESHOLD = 6
/** A drag released past this share of the panel's depth closes it. */
const CLOSE_DISTANCE = 0.35
/** A flick toward the edge faster than this (px/ms) closes it however short it was. */
const CLOSE_VELOCITY = 0.5
/** A pointer held still this long (ms) before it is released is a placed drop, not a flick. */
const FLICK_WINDOW = 100

/** Events fired by {@link Sheet}, keyed for `addEventListener`. */
export interface SheetEventMap {
  open: Event
  close: CustomEvent<{ returnValue: string }>
  cancel: Event
}

export interface Sheet {
  addEventListener: TypedAddEventListener<Sheet, SheetEventMap>
  removeEventListener: TypedRemoveEventListener<Sheet, SheetEventMap>
}

/**
 * Dialog pinned to an edge of the screen, for content that complements the page rather than interrupting it: filters,
 * details, a form beside the record it edits. Built on the native `<dialog>` like `c2-modal`, so focus is trapped and
 * restored, the page behind is inert and covered by a backdrop, and Escape closes — but the panel spans its edge and
 * slides in from it instead of being centred.
 *
 * `side` picks the edge (`right` by default). `--c2-sheet--size` is the width of a left/right sheet and the height of
 * a top/bottom one; the opposite axis always fills the screen. Open it with the `open` attribute or `show()`, close it
 * with `close(returnValue)`, the built-in close button, a click on the backdrop or Escape (each can be turned off).
 * Content is split into a `title` slot, the body (default slot) and a `footer` slot for actions, and the body scrolls
 * on its own so the header and footer stay put in a full-height panel.
 *
 * For the phone pattern, `side="bottom"` with `swipe-close` lets the user drag the sheet down by its header to dismiss
 * it (any side drags toward its own edge), and shows a grab handle on a top or bottom sheet. `--c2-sheet--size: auto`
 * fits the sheet to its content, up to `--c2-sheet--max-size`, past which the body scrolls.
 *
 * Use `c2-modal` for a decision that blocks the page, and `c2-side-nav` for navigation that is part of the layout
 * rather than a transient overlay.
 *
 * @tag c2-sheet
 *
 * @slot - Body content.
 * @slot title - Heading shown in the header; the sheet is labelled by it.
 * @slot footer - Actions row (a flex row, see the `footer--*` variables).
 * @slot close-icon - Replaces the default × icon of the close button.
 *
 * @event {Event} open - Fired after the sheet has been shown.
 * @event {CustomEvent<{ returnValue: string }>} close - Fired after the sheet has closed; `detail.returnValue` is what `close()` received (`''` for Escape / backdrop / the × button).
 * @event {Event} cancel - Native, cancelable: fired on Escape before closing.
 *
 * @csspart panel - The sheet surface positioned over the overlay.
 * @csspart header - Header containing the title and optional close button.
 * @csspart close - The native close button.
 * @csspart body - Scrollable container for the default slot.
 * @csspart footer - Container wrapping the assigned `footer` slot actions.
 * @csspart handle - The grab handle of a `swipe-close` top or bottom sheet.
 *
 * @cssproperty {pixel} [--c2-sheet--size=380px] - Width of a `left`/`right` sheet, height of a `top`/`bottom` one. The other axis fills the screen. `auto` fits the content.
 * @cssproperty {pixel} [--c2-sheet--max-size=100%] - Upper bound of `size` on the same axis, e.g. `90dvh` to keep the page in view above a content-sized bottom sheet; past it the body scrolls.
 * @cssproperty {background} [--c2-sheet--background=#ffffff]
 * @cssproperty {color} [--c2-sheet--color=#18181b]
 * @cssproperty {border} [--c2-sheet--border=none]
 * @cssproperty {border-radius} [--c2-sheet--border-radius=0px] - Rounds the two corners facing the page; the edge stays square.
 * @cssproperty {box-shadow} [--c2-sheet--box-shadow=0 24px 60px rgba(0, 0, 0, 0.25)]
 * @cssproperty {time} [--c2-sheet--transition-duration=280ms] - Slide in and out; `0ms` disables it.
 *
 * @cssproperty {padding} [--c2-sheet__header--padding-top=20px]
 * @cssproperty {padding} [--c2-sheet__header--padding-right=20px]
 * @cssproperty {padding} [--c2-sheet__header--padding-bottom=0px]
 * @cssproperty {padding} [--c2-sheet__header--padding-left=24px]
 * @cssproperty {font-size} [--c2-sheet__header--font-size=17px]
 * @cssproperty {font-weight} [--c2-sheet__header--font-weight=600]
 * @cssproperty {line-height} [--c2-sheet__header--line-height=1.35]
 * @cssproperty {border} --c2-sheet__header--border-bottom - Divider under the header; raise `header--padding-bottom` with it.
 *
 * @cssproperty {padding} [--c2-sheet__body--padding-top=12px]
 * @cssproperty {padding} [--c2-sheet__body--padding-right=24px]
 * @cssproperty {padding} [--c2-sheet__body--padding-bottom=20px]
 * @cssproperty {padding} [--c2-sheet__body--padding-left=24px]
 * @cssproperty {font-size} [--c2-sheet__body--font-size=14px]
 * @cssproperty {line-height} [--c2-sheet__body--line-height=1.6]
 * @cssproperty {color} --c2-sheet__body--color - Defaults to the sheet colour.
 * @cssproperty {scrollbar-width} [--c2-sheet__body__scrollbar--width=thin] - `scrollbar-width` of the body: `thin`, `auto` or `none`.
 * @cssproperty {pixel} [--c2-sheet__body__scrollbar--size=8px] - Scrollbar thickness in browsers without `scrollbar-color` (Safari before 26).
 * @cssproperty {color} [--c2-sheet__body__scrollbar__track--color=transparent]
 * @cssproperty {color} [--c2-sheet__body__scrollbar__thumb--color=color-mix(in srgb, currentColor 22%, transparent)]
 * @cssproperty {color} [--c2-sheet__body__scrollbar__thumb__hover--color=color-mix(in srgb, currentColor 40%, transparent)] - While the pointer is over the body.
 *
 * @cssproperty {padding} [--c2-sheet__footer--padding-top=12px]
 * @cssproperty {padding} [--c2-sheet__footer--padding-right=24px]
 * @cssproperty {padding} [--c2-sheet__footer--padding-bottom=20px]
 * @cssproperty {padding} [--c2-sheet__footer--padding-left=24px]
 * @cssproperty {pixel} [--c2-sheet__footer--gap=8px]
 * @cssproperty {justify-content} [--c2-sheet__footer--justify-content=flex-end]
 * @cssproperty {border} --c2-sheet__footer--border-top - Divider above the footer; raise `footer--padding-top` with it.
 *
 * @cssproperty {pixel} [--c2-sheet__close--size=32px]
 * @cssproperty {pixel} [--c2-sheet__close--icon-size=18px]
 * @cssproperty {border-radius} [--c2-sheet__close--border-radius=8px]
 * @cssproperty {color} [--c2-sheet__close--color=#71717a]
 * @cssproperty {background} [--c2-sheet__close__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-sheet__close__hover--color=#18181b]
 * @cssproperty {outline} [--c2-sheet__close__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 *
 * @cssproperty {display} [--c2-sheet__handle--display=block] - `none` hides the grab handle; the header still drags.
 * @cssproperty {pixel} [--c2-sheet__handle--width=36px]
 * @cssproperty {pixel} [--c2-sheet__handle--height=4px]
 * @cssproperty {border-radius} [--c2-sheet__handle--border-radius=999px]
 * @cssproperty {background} [--c2-sheet__handle--background=#d4d4d8]
 * @cssproperty {pixel} [--c2-sheet__handle--offset=8px] - Space between the handle and the panel's edge facing the page. A bottom sheet's handle sits in the header's top padding; a top sheet's has its own row under the footer.
 *
 * @cssproperty {background} [--c2-sheet__backdrop--background=rgba(9, 9, 11, 0.45)]
 * @cssproperty {backdrop-filter} --c2-sheet__backdrop--backdrop-filter - e.g. `blur(4px)`.
 */
@customElement('c2-sheet')
export class Sheet extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The close button's label in the nearest `lang` (English, or a language the app adds). */
  private readonly msg = new LocalizeController(this, sheetMessages)

  /** Open state. Setting it shows or closes the sheet. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Edge the sheet is pinned to and slides in from. */
  @property({ reflect: true }) side: SheetSide = 'right'

  /** Accessible name when there is no `title` slot. */
  @property() label: string | undefined = undefined

  /** Keep the sheet open when the backdrop is clicked. */
  @property({ type: Boolean, attribute: 'no-backdrop-close' }) noBackdropClose = false

  /** Ignore Escape. */
  @property({ type: Boolean, attribute: 'no-escape' }) noEscape = false

  /** Hide the built-in × button. */
  @property({ type: Boolean, reflect: true, attribute: 'hide-close' }) hideClose = false

  /**
   * Let the user drag the sheet toward its edge by the header (or the grab handle a top or bottom sheet then shows) to
   * close it. Released past 35% of its depth, or flicked, it closes; otherwise it springs back. A left or right sheet
   * drags by its header only, so it needs a title or the close button to be swipeable.
   */
  @property({ type: Boolean, attribute: 'swipe-close' }) swipeClose = false

  /** Leave the page scrollable while the sheet is open. */
  @property({ type: Boolean, attribute: 'no-scroll-lock' }) noScrollLock = false

  /** Value passed to the last `close()` call, mirrors `HTMLDialogElement.returnValue`. */
  returnValue = ''

  private readonly slotPresence = new SlotPresenceController(this, ['title', 'footer'])

  @query('dialog') private dialog!: HTMLDialogElement
  @query('.c2-sheet__header') private header!: HTMLElement
  @query('.c2-sheet__handle') private handle!: HTMLElement | null

  private releaseScroll: (() => void) | undefined

  /** The press or drag in progress on the header or handle; `offset` is how far the panel follows it toward its edge. */
  private drag: { pointerId: number; x: number; y: number; offset: number; time: number; velocity: number; moved: boolean } | null = null

  private suppressClick = false
  private suppressClickTimer: ReturnType<typeof setTimeout> | undefined

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unlockScroll()
  }

  /** Opens the sheet (modal). */
  show() {
    this.open = true
  }

  /** Closes the sheet with an optional `returnValue`. */
  close(returnValue = '') {
    this.returnValue = returnValue
    if (this.dialog?.open) this.dialog.close(returnValue)
    else this.open = false
  }

  private lockScroll() {
    if (this.noScrollLock || this.releaseScroll || isServer) return
    this.releaseScroll = lockPageScroll()
  }

  private unlockScroll() {
    this.releaseScroll?.()
    this.releaseScroll = undefined
  }

  private handleDialogClose = (event: Event) => {
    // A nested overlay's `close` is composed, so it reaches this listener through the slot; only our own dialog counts.
    if (event.target !== this.dialog) return
    this.returnValue = this.dialog.returnValue
    this.drag = null
    this.unlockScroll()
    this.open = false
    this.dispatchEvent(new CustomEvent('close', { detail: { returnValue: this.returnValue }, bubbles: true, composed: true }))
  }

  private handleDialogCancel = (event: Event) => {
    if (event.target !== this.dialog) return
    if (this.noEscape) {
      event.preventDefault()
      return
    }
    if (!redispatchEvent(this, event)) event.preventDefault()
  }

  private handleDialogClick = (event: MouseEvent) => {
    // Clicks on the ::backdrop are delivered to the <dialog> itself; anything inside targets the panel or its children.
    if (event.target === this.dialog && !this.noBackdropClose) this.close()
  }

  /** Distance the pointer has moved toward the sheet's edge, the only direction a drag follows. */
  private towardEdge(event: PointerEvent, drag: { x: number; y: number }) {
    switch (this.side) {
      case 'left':
        return drag.x - event.clientX
      case 'top':
        return drag.y - event.clientY
      case 'bottom':
        return event.clientY - drag.y
      default:
        return event.clientX - drag.x
    }
  }

  private setDragOffset(offset: number) {
    const axis = this.side === 'top' || this.side === 'bottom' ? 'Y' : 'X'
    const sign = this.side === 'top' || this.side === 'left' ? -1 : 1
    this.dialog.style.setProperty('--_c2-sheet-drag', `translate${axis}(${sign * offset}px)`)
  }

  private clearDrag() {
    this.dialog?.classList.remove('is-dragging')
    this.dialog?.style.removeProperty('--_c2-sheet-drag')
  }

  private handlePointerDown = (event: PointerEvent) => {
    if (!this.swipeClose || !event.isPrimary || event.button !== 0) return
    const path = event.composedPath()
    // Only this sheet's own header and handle: a `header` part of a component in the body is not a grab area.
    const grab = path.find((node) => node === this.header || (this.handle !== null && node === this.handle))
    // The close button and a field in the title keep their own press.
    const control = path.find((node) => node instanceof HTMLElement && node.matches('button, input, textarea, select, a[href], [contenteditable]'))
    if (!grab || (control && path.indexOf(control) < path.indexOf(grab))) return
    this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset: 0, time: event.timeStamp, velocity: 0, moved: false }
  }

  private handlePointerMove = (event: PointerEvent) => {
    const drag = this.drag
    if (!drag || event.pointerId !== drag.pointerId) return
    // A press released outside the panel before it became a drag never reaches pointerup here.
    if (event.buttons === 0) {
      this.drag = null
      return
    }
    const distance = this.towardEdge(event, drag)
    if (!drag.moved) {
      if (Math.abs(distance) < DRAG_THRESHOLD) return
      // Capture only once it is a drag: capturing on press would retarget a plain click on a title button.
      drag.moved = true
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      this.dialog.classList.add('is-dragging')
    }
    event.preventDefault()
    const offset = Math.max(0, distance)
    const elapsed = event.timeStamp - drag.time
    if (elapsed > 0) drag.velocity = (offset - drag.offset) / elapsed
    drag.offset = offset
    drag.time = event.timeStamp
    this.setDragOffset(offset)
  }

  private handlePointerUp = (event: PointerEvent) => {
    const drag = this.drag
    if (!drag || event.pointerId !== drag.pointerId) return
    this.drag = null
    if (!drag.moved) return
    this.suppressClick = true
    // A click that does not follow (the pointer left the page) must not swallow the next real one.
    clearTimeout(this.suppressClickTimer)
    this.suppressClickTimer = setTimeout(() => (this.suppressClick = false))
    const rect = this.dialog.getBoundingClientRect()
    const depth = this.side === 'top' || this.side === 'bottom' ? rect.height : rect.width
    const flick = drag.velocity > CLOSE_VELOCITY && drag.offset > DRAG_THRESHOLD && event.timeStamp - drag.time < FLICK_WINDOW
    const dismiss = event.type === 'pointerup' && (drag.offset > depth * CLOSE_DISTANCE || flick)
    // Both in one style change: the panel then slides from where it was let go, off-screen or back into place.
    this.clearDrag()
    if (dismiss) this.close()
  }

  /** Capturing, so a button under the released pointer does not also see the drag as a click. */
  private readonly handlePanelClick = {
    handleEvent: (event: MouseEvent) => {
      if (!this.suppressClick) return
      this.suppressClick = false
      event.preventDefault()
      event.stopPropagation()
    },
    capture: true,
  }

  private handleSlotChange(event: Event) {
    this.slotPresence.handleSlotChange(event)
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('open') && !isServer && this.dialog) {
      if (this.open && !this.dialog.open) {
        this.dialog.showModal()
        this.lockScroll()
        this.dispatchEvent(new Event('open', { bubbles: true, composed: true }))
      } else if (!this.open && this.dialog.open) {
        this.dialog.close(this.returnValue)
      }
    }
    if (changed.has('open') && !this.open) {
      this.drag = null
      this.clearDrag()
    }
  }

  override render() {
    const hasTitle = this.slotPresence.has('title')
    const hasFooter = this.slotPresence.has('footer')
    const handle = this.swipeClose && (this.side === 'top' || this.side === 'bottom')
    const headerHidden = !hasTitle && this.hideClose
    const handleTemplate = handle ? html`<div class="c2-sheet__handle" part="handle" aria-hidden="true"></div>` : nothing
    return html`
      <dialog
        class="c2-sheet"
        part="panel"
        aria-labelledby=${hasTitle ? 'title' : nothing}
        aria-label=${!hasTitle && this.label ? this.label : nothing}
        @close=${this.handleDialogClose}
        @cancel=${this.handleDialogCancel}
        @click=${this.handleDialogClick}
      >
        <div
          class=${classMap({
            'c2-sheet__panel': true,
            'has-title': hasTitle,
            'has-footer': hasFooter,
            'is-swipeable': this.swipeClose,
            'has-header': !headerHidden,
          })}
          @pointerdown=${this.handlePointerDown}
          @pointermove=${this.handlePointerMove}
          @pointerup=${this.handlePointerUp}
          @pointercancel=${this.handlePointerUp}
          @click=${this.handlePanelClick}
        >
          ${this.side === 'bottom' ? handleTemplate : nothing}
          <header class="c2-sheet__header" part="header" ?hidden=${headerHidden}>
            <div class="c2-sheet__title" id="title"><slot name="title" @slotchange=${this.handleSlotChange}></slot></div>
            ${
              this.hideClose
                ? nothing
                : html`<button class="c2-sheet__close" part="close" type="button" aria-label=${this.msg.t('close')} @click=${() => this.close()}>
                    <slot name="close-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 6 6 18M6 6l12 12"></path>
                      </svg>
                    </slot>
                  </button>`
            }
          </header>
          <div class="c2-sheet__body" part="body"><slot></slot></div>
          <footer class="c2-sheet__footer" part="footer" ?hidden=${!hasFooter}>
            <slot name="footer" @slotchange=${this.handleSlotChange}></slot>
          </footer>
          ${this.side === 'top' ? handleTemplate : nothing}
        </div>
      </dialog>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-sheet': Sheet
  }
}
