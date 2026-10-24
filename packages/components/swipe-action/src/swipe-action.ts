import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { KEY_ALIASES, matchesStroke, type ShortcutStroke } from '@c2n/core/shortcut-helper.js'
import { SWIPE_CONTAINER_EVENT, SWIPE_REQUEST_EVENT, type SwipeContainerEventDetail, type SwipeRequestEventDetail } from '@c2n/core/contexts/swipe.js'
import styles from './swipe-action.scss?inline'

/** Which side's actions are revealed: `start` (swiped toward the end edge), `end` (swiped toward the start edge), or none. */
export type SwipeActionSide = 'start' | 'end'

export type SwipeActionOpen = SwipeActionSide | ''

export interface SwipeActionOpenChangeDetail {
  open: SwipeActionOpen
}

export interface SwipeActionFullSwipeDetail {
  side: SwipeActionSide
}

/** Events fired by {@link SwipeAction}, keyed for `addEventListener`. */
export interface SwipeActionEventMap {
  'open-change': CustomEvent<SwipeActionOpenChangeDetail>
  'full-swipe': CustomEvent<SwipeActionFullSwipeDetail>
}

export interface SwipeAction {
  addEventListener: TypedAddEventListener<SwipeAction, SwipeActionEventMap>
  removeEventListener: TypedRemoveEventListener<SwipeAction, SwipeActionEventMap>
}

/**
 * Whether a key press matches one of the space-separated shortcuts of an `aria-keyshortcuts` value (`Delete`,
 * `Shift+Delete`, `A`). Each token is `+`-joined ARIA modifier names (`Alt`, `Control`, `Meta`, `Shift`) and a key;
 * the comparison is the library's own (`matchesStroke`), so modifiers match exactly as `c2-shortcut` matches them.
 */
function matchesShortcut(event: KeyboardEvent, value: string): boolean {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .some((token) => {
      const stroke: ShortcutStroke = { key: '', ctrl: false, meta: false, alt: false, shift: false, mod: false }
      // A trailing `++` is the plus key itself, as in `Shift++`.
      const parts = token.endsWith('++') ? [...token.slice(0, -2).split('+'), '+'] : token.split('+')
      for (const part of parts) {
        const name = part.toLowerCase()
        if (name === 'control') stroke.ctrl = true
        else if (name === 'meta') stroke.meta = true
        else if (name === 'alt') stroke.alt = true
        else if (name === 'shift') stroke.shift = true
        else if (name) stroke.key = KEY_ALIASES[name] ?? name
      }
      return !!stroke.key && matchesStroke(stroke, event)
    })
}

/** Whether an action is disabled, natively, as a form-associated element, or by `aria-disabled`. */
function isDisabledAction(element: HTMLElement): boolean {
  return element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true' || (element as { disabled?: unknown }).disabled === true
}

/** How far the pointer moves before a press becomes a swipe (or is left to the page as a scroll). */
const DRAG_SLOP = 6
/** A release faster than this (px/ms) settles in the direction of the flick, whatever the distance. */
const FLICK_VELOCITY = 0.4
/**
 * The speed of a release is the distance covered over this last stretch of the drag (ms). Averaging over a stretch
 * rather than the last two samples keeps two events that land a millisecond apart from reading as a flick, and a
 * pointer held still for this long before release is not flicking at all.
 */
const FLICK_WINDOW = 100
/** Share of the row's width a full swipe has to cross before release triggers the outermost action. */
const FULL_SWIPE_RATIO = 0.6

/**
 * A row whose content slides sideways to reveal actions behind it, as in a mail or task list on a phone: drag the row
 * toward the end edge to show the `start` actions, toward the start edge to show the `end` actions. Release past
 * halfway (or flick) and the row stays open; release short and it slides back. A tap on the open row, a press outside
 * it, Escape, or activating one of its actions closes it again.
 *
 * Put `c2-button`s (or any focusable element) in the `start` and `end` slots; they sit centred at their own height, or
 * fill the row with `--c2-swipe-action__actions--align-items: stretch`. Only one side can be open; vertical drags are
 * left to the page so a list still scrolls.
 *
 * Keyboard: by default the actions stay in the Tab order and in the accessibility tree while hidden, and focusing one
 * opens its side. Give an action `aria-keyshortcuts` (`Delete`, `E`, `Shift+Delete`) and that key runs it while focus
 * is on the row's content; a row with shortcuts takes its closed actions out of the Tab order, so a list of rows (each
 * wrapping a `c2-list-item` in a `c2-list`) stays one Tab stop with arrow keys between rows, as in `c2-reorder-list`.
 * Name the shortcuts somewhere a screen reader reads them, such as the row's description. A `c2-list` lets its rows
 * swipe only with its `swipeable` attribute: without it a row inside the list stays still, and its actions are hidden
 * and inert.
 *
 * With `full-swipe`, dragging past 60% of the row's width arms the outermost action of that side (the first `start`
 * action, the last `end` action), which grows to fill the row; releasing there fires a cancelable `full-swipe` event
 * and then clicks that action, so its own handler runs — the "swipe all the way to delete" gesture.
 *
 * The content needs an opaque background to cover the actions at rest: `--c2-swipe-action__content--background`.
 * Directions follow `dir`: in right-to-left the `start` actions sit on the right.
 *
 * @tag c2-swipe-action
 *
 * @slot default - The row's content.
 * @slot start - Actions revealed at the start edge (the left in left-to-right) by dragging the row toward the end edge.
 * @slot end - Actions revealed at the end edge (the right in left-to-right) by dragging the row toward the start edge.
 *
 * @csspart content - The sliding box around the default slot.
 * @csspart start - The box that holds the `start` actions.
 * @csspart end - The box that holds the `end` actions.
 *
 * @event {CustomEvent<{ open: '' | 'start' | 'end' }>} open-change - A swipe, tap, Escape, focus or an action opened or closed the row. `detail.open` is the side now open, or `''`. Not fired when `open` is set from code. Does not bubble.
 * @event {CustomEvent<{ side: 'start' | 'end' }>} full-swipe - A full swipe was released (with `full-swipe` set). Cancel it to keep the outermost action from being clicked; the row closes either way. Does not bubble.
 *
 * @cssproperty {color} [--c2-swipe-action__container--background=#f4f4f5] - Shown behind the actions where they do not fill the revealed area.
 * @cssproperty {border-radius} [--c2-swipe-action__container--border-radius=0px]
 * @cssproperty {border} [--c2-swipe-action__container--border=none]
 * @cssproperty {color} [--c2-swipe-action__content--background=#ffffff] - Must be opaque: it covers the actions while the row is closed.
 * @cssproperty {color} [--c2-swipe-action__content--color=#18181b]
 * @cssproperty {padding} [--c2-swipe-action__content--padding=12px 16px]
 * @cssproperty {pixel} [--c2-swipe-action__content--min-height=48px]
 * @cssproperty {box-shadow} [--c2-swipe-action__content__open--box-shadow=0 0 12px rgba(24, 24, 27, 0.12)] - Shadow under the content while it is moved, which lifts it off the actions.
 * @cssproperty {time} [--c2-swipe-action__content--transition-duration=200ms] - How long the row takes to settle after a release or an `open` change.
 * @cssproperty {string} [--c2-swipe-action__content--transition-timing-function=cubic-bezier(0.2, 0, 0, 1)]
 * @cssproperty {pixel} [--c2-swipe-action__actions--gap=8px] - Space between the actions of one side.
 * @cssproperty {padding} [--c2-swipe-action__actions--padding=0 8px] - Room around the actions of each side. `0` with `--c2-swipe-action__actions--align-items: stretch` makes full-bleed action blocks.
 * @cssproperty {align-items} [--c2-swipe-action__actions--align-items=center] - `center` keeps buttons at their own height; `stretch` makes them as tall as the row.
 */
@customElement('c2-swipe-action')
export class SwipeAction extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The side whose actions are shown: `start`, `end`, or `''` for closed. Swiping, tapping and focus change it. */
  @property({ type: String }) open: SwipeActionOpen = ''

  /** Stops the row from moving. An open row closes. */
  @property({ type: Boolean }) disabled = false

  /** Lets a long swipe, past 60% of the row's width, trigger the outermost action of that side on release. */
  @property({ type: Boolean, attribute: 'full-swipe' }) fullSwipe = false

  /** The offset of the content while a finger or mouse drags it, in logical pixels (positive reveals `start`). */
  @state() private dragOffset: number | null = null

  /** The natural widths of the two action boxes, measured while they are not stretched. */
  @state() private widths = { start: 0, end: 0 }

  @state() private hasActions = { start: false, end: false }

  /** Whether an action declares `aria-keyshortcuts`: then the closed actions leave the Tab order. */
  @state() private hasShortcuts = false

  /**
   * What a container around the row (a `c2-list`) allows: `false` turns swiping off and hides the actions, `undefined`
   * means there is no container and the row swipes on its own.
   */
  @state() private containerSwipeable: boolean | undefined = undefined

  /** Whether the row is held still: `disabled`, or in a container that does not let its rows swipe. */
  private get swipeOff(): boolean {
    return this.disabled || this.containerSwipeable === false
  }

  @query('.start') private startBox?: HTMLElement
  @query('.end') private endBox?: HTMLElement
  @query('.content') private contentBox?: HTMLElement

  private resizeObserver?: ResizeObserver

  private gesture?: {
    pointerId: number
    startX: number
    startY: number
    base: number
    dragging: boolean
    /** Recent positions along the drag, in logical pixels, for the release speed. */
    samples: { x: number; t: number }[]
  }

  /** Set after a drag or a tap that closed the row, so the click that follows does not reach the content. */
  private swallowClick = false

  /** Reveals one side's actions. */
  show(side: SwipeActionSide): void {
    this.open = side
  }

  /** Slides the content back over the actions. */
  close(): void {
    this.open = ''
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener('keydown', this.handleKeydown)
    this.addEventListener('focusin', this.handleFocusIn)
    this.addEventListener('focusout', this.handleFocusOut)
    this.addEventListener(SWIPE_CONTAINER_EVENT, this.handleContainerSetting)
    // Moved while open (a keyed list reordering its rows): `updated` sees no change to `open`, so listen again here.
    if (this.open) document.addEventListener('pointerdown', this.handleOutsidePointerDown, true)
    // A container that upgraded before this row answers now; one that upgrades later pushes its setting instead.
    this.dispatchEvent(
      new CustomEvent<SwipeRequestEventDetail>(SWIPE_REQUEST_EVENT, {
        bubbles: true,
        detail: { respond: (swipeable) => (this.containerSwipeable = swipeable) },
      }),
    )
  }

  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this.handleKeydown)
    this.removeEventListener('focusin', this.handleFocusIn)
    this.removeEventListener('focusout', this.handleFocusOut)
    this.removeEventListener(SWIPE_CONTAINER_EVENT, this.handleContainerSetting)
    this.containerSwipeable = undefined
    document.removeEventListener('pointerdown', this.handleOutsidePointerDown, true)
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
    super.disconnectedCallback()
  }

  protected override firstUpdated(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.measure())
      if (this.startBox) this.resizeObserver.observe(this.startBox)
      if (this.endBox) this.resizeObserver.observe(this.endBox)
      if (this.contentBox) this.resizeObserver.observe(this.contentBox)
      // Observing reports every box once after layout, which is the first measurement: measuring here instead would
      // set state from inside an update and render twice.
    } else {
      this.measure()
    }
  }

  private handleContainerSetting = (event: Event): void => {
    event.stopPropagation()
    this.containerSwipeable = (event as CustomEvent<SwipeContainerEventDetail>).detail.swipeable
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if ((changed.has('disabled') || (changed as PropertyValues).has('containerSwipeable')) && this.swipeOff) {
      this.open = ''
      this.dragOffset = null
      this.gesture = undefined
    }
    if (changed.has('open') && this.open !== '' && this.open !== 'start' && this.open !== 'end') this.open = ''
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('open')) {
      if (this.open) document.addEventListener('pointerdown', this.handleOutsidePointerDown, true)
      else document.removeEventListener('pointerdown', this.handleOutsidePointerDown, true)
    }
  }

  /** Reads the natural widths of the action boxes. A stretched box (mid full-swipe) keeps its last reading. */
  private measure(): void {
    const direction = getComputedStyle(this).direction === 'rtl' ? -1 : 1
    if (direction !== this.direction) {
      this.direction = direction
      this.requestUpdate()
    }
    // Read the slots here rather than only on `slotchange`, which does not fire when a server-rendered shadow root hydrates.
    const hasActions = { start: this.actionsOf('start').length > 0, end: this.actionsOf('end').length > 0 }
    if (hasActions.start !== this.hasActions.start || hasActions.end !== this.hasActions.end) this.hasActions = hasActions
    const hasShortcuts = this.shortcutActions().length > 0
    if (hasShortcuts !== this.hasShortcuts) this.hasShortcuts = hasShortcuts
    const next = { ...this.widths }
    for (const side of ['start', 'end'] as const) {
      const box = side === 'start' ? this.startBox : this.endBox
      if (box && !box.style.width) next[side] = box.getBoundingClientRect().width
    }
    if (next.start !== this.widths.start || next.end !== this.widths.end) this.widths = next
  }

  /** `-1` in right-to-left. Read with the widths, on the client only, so a server render assumes left-to-right. */
  private direction: 1 | -1 = 1

  private get rowWidth(): number {
    return this.getBoundingClientRect().width
  }

  /** The resting offset for the current `open`, in logical pixels. */
  private get restOffset(): number {
    if (this.open === 'start' && this.hasActions.start) return this.widths.start
    if (this.open === 'end' && this.hasActions.end) return -this.widths.end
    return 0
  }

  /** Clamps a raw drag to the sides that have actions, and resists past their width unless a full swipe is allowed. */
  private constrain(offset: number): number {
    if (offset > 0 && !this.hasActions.start) return 0
    if (offset < 0 && !this.hasActions.end) return 0
    const limit = offset > 0 ? this.widths.start : this.widths.end
    const magnitude = Math.abs(offset)
    if (magnitude <= limit) return offset
    const max = this.rowWidth
    const extra = magnitude - limit
    const resisted = this.fullSwipe ? Math.min(limit + extra, max) : limit + extra / (1 + extra / 40) / 2
    return Math.sign(offset) * resisted
  }

  private isArmed(offset: number): boolean {
    return this.fullSwipe && Math.abs(offset) >= this.rowWidth * FULL_SWIPE_RATIO
  }

  private setOpen(open: SwipeActionOpen): void {
    if (open === this.open) return
    this.open = open
    this.dispatchEvent(new CustomEvent<SwipeActionOpenChangeDetail>('open-change', { detail: { open } }))
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (this.swipeOff || (event.pointerType === 'mouse' && event.button !== 0)) return
    // A touch drag or a canceled pointer is never followed by a click, so a flag left from one must not swallow this one.
    this.swallowClick = false
    this.measure()
    this.gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      base: this.restOffset,
      dragging: false,
      samples: [],
    }
  }

  private handlePointerMove = (event: PointerEvent): void => {
    const gesture = this.gesture
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    if (!gesture.dragging) {
      if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return
      if (Math.abs(dy) > Math.abs(dx)) {
        // A vertical drag belongs to the page.
        this.gesture = undefined
        return
      }
      gesture.dragging = true
      this.contentBox?.setPointerCapture(event.pointerId)
    }
    event.preventDefault()
    gesture.samples.push({ x: event.clientX * this.direction, t: event.timeStamp })
    while (gesture.samples.length > 2 && event.timeStamp - gesture.samples[0].t > FLICK_WINDOW) gesture.samples.shift()
    this.dragOffset = this.constrain(gesture.base + dx * this.direction)
  }

  private handlePointerUp = (event: PointerEvent): void => {
    const gesture = this.gesture
    if (!gesture || gesture.pointerId !== event.pointerId) return
    this.gesture = undefined
    if (!gesture.dragging) {
      // A tap on an open row closes it instead of activating the content.
      if (this.open && event.type === 'pointerup') {
        this.swallowClick = true
        this.setOpen('')
      }
      return
    }
    const offset = this.dragOffset ?? 0
    this.dragOffset = null
    if (event.type === 'pointercancel') return
    this.swallowClick = true
    if (offset !== 0 && this.isArmed(offset)) {
      this.triggerFullSwipe(offset > 0 ? 'start' : 'end')
      return
    }
    this.setOpen(this.settle(offset, this.releaseVelocity(gesture.samples, event)))
  }

  /** Logical pixels per millisecond over the last `FLICK_WINDOW` of the drag, up to the release; 0 if it held still. */
  private releaseVelocity(samples: { x: number; t: number }[], release: PointerEvent): number {
    const recent = [...samples.filter((sample) => release.timeStamp - sample.t <= FLICK_WINDOW), { x: release.clientX * this.direction, t: release.timeStamp }]
    const first = recent[0]
    const last = recent[recent.length - 1]
    return last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0
  }

  /** Where a released drag comes to rest: the direction of a flick, else past halfway opens. */
  private settle(offset: number, velocity: number): SwipeActionOpen {
    if (Math.abs(velocity) >= FLICK_VELOCITY) {
      const toward = velocity > 0 ? 'start' : 'end'
      // A flick back toward the centre closes a side that was open.
      if (offset > 0) return toward === 'start' ? 'start' : ''
      if (offset < 0) return toward === 'end' ? 'end' : ''
      return ''
    }
    if (offset > 0 && offset >= this.widths.start / 2) return 'start'
    if (offset < 0 && -offset >= this.widths.end / 2) return 'end'
    return ''
  }

  private triggerFullSwipe(side: SwipeActionSide): void {
    const proceed = this.dispatchEvent(new CustomEvent<SwipeActionFullSwipeDetail>('full-swipe', { detail: { side }, cancelable: true }))
    const actions = this.actionsOf(side)
    const outermost = side === 'start' ? actions[0] : actions[actions.length - 1]
    this.setOpen('')
    const action = SwipeAction.actionElement(outermost)
    if (proceed && action && !isDisabledAction(action)) action.click()
  }

  /** The element to click for a slotted action, looking through `display: contents` wrappers (an Astro island, a framework's). */
  private static actionElement(element: Element | undefined): HTMLElement | undefined {
    let current = element
    while (current && getComputedStyle(current).display === 'contents' && current.firstElementChild) current = current.firstElementChild
    return current as HTMLElement | undefined
  }

  private actionsOf(side: SwipeActionSide): HTMLElement[] {
    const slot = this.renderRoot.querySelector<HTMLSlotElement>(`slot[name="${side}"]`)
    return (slot?.assignedElements({ flatten: true }) ?? []) as HTMLElement[]
  }

  private handleContentClick = (event: MouseEvent): void => {
    if (!this.swallowClick) return
    this.swallowClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  /** Activating an action closes the row, after the action's own click handlers have run. */
  private handleActionClick = (): void => {
    if (this.open) queueMicrotask(() => this.setOpen(''))
  }

  private handleKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return
    if (event.key === 'Escape') {
      if (!this.open) return
      event.preventDefault()
      this.setOpen('')
      return
    }
    if (this.swipeOff || !this.isFromContent(event)) return
    const action = this.shortcutActions().find((element) => matchesShortcut(event, element.getAttribute('aria-keyshortcuts') ?? ''))
    if (!action) return
    // The key is the action's: a list around the row must not also read it (as typeahead, say).
    event.preventDefault()
    event.stopPropagation()
    this.setOpen('')
    action.click()
  }

  /** The actions of both sides that declare `aria-keyshortcuts`, looked up through `display: contents` wrappers. */
  private shortcutActions(): HTMLElement[] {
    return [...this.actionsOf('start'), ...this.actionsOf('end')]
      .map((element) => SwipeAction.actionElement(element))
      .filter((element): element is HTMLElement => !!element?.getAttribute('aria-keyshortcuts')?.trim() && !isDisabledAction(element))
  }

  /** Whether a key was pressed on the row's content itself, not in one of its actions or a text field inside it. */
  private isFromContent(event: KeyboardEvent): boolean {
    const origin = event.composedPath()[0]
    if (origin instanceof HTMLElement && (origin.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(origin.tagName))) return false
    let child = event.target as Element | null
    while (child && child.parentElement !== this) child = child.parentElement
    const slot = child?.getAttribute('slot')
    return !!child && slot !== 'start' && slot !== 'end'
  }

  /** Focus moving onto an action shows its side, so the hidden actions are usable from the keyboard. */
  private handleFocusIn = (event: FocusEvent): void => {
    if (this.swipeOff) return
    let child = event.target as Element | null
    while (child && child.parentElement !== this) child = child.parentElement
    const slot = child?.getAttribute('slot')
    if (slot === 'start' || slot === 'end') this.setOpen(slot)
  }

  private handleFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null
    if (this.open && (!next || !this.contains(next))) this.setOpen('')
  }

  private handleOutsidePointerDown = (event: PointerEvent): void => {
    if (!event.composedPath().includes(this)) this.setOpen('')
  }

  private handleSlotChange = (): void => this.measure()

  override render() {
    const dragging = this.dragOffset !== null
    const offset = this.dragOffset ?? this.restOffset
    const physical = offset * this.direction
    const armed = dragging && this.isArmed(offset)
    const stretch = (side: SwipeActionSide): string | undefined => {
      const natural = this.widths[side]
      const magnitude = side === 'start' ? offset : -offset
      return dragging && magnitude > natural ? `${magnitude}px` : undefined
    }
    const revealed: SwipeActionOpen = offset > 0 ? 'start' : offset < 0 ? 'end' : ''
    return html`
      <div class=${classMap({ container: true, dragging, armed, moved: offset !== 0 })}>
        <!-- The content comes first so Tab reaches a row's content, then its start and end actions; z-index stacks them. -->
        <div
          class="content"
          part="content"
          style=${styleMap({ transform: `translateX(${physical}px)` })}
          @pointerdown=${this.handlePointerDown}
          @pointermove=${this.handlePointerMove}
          @pointerup=${this.handlePointerUp}
          @pointercancel=${this.handlePointerUp}
          @click=${this.handleContentClick}
        >
          <slot></slot>
        </div>
        <div
          class=${classMap({ actions: true, start: true, revealed: revealed === 'start' })}
          part="start"
          ?inert=${this.containerSwipeable === false || (this.hasShortcuts && revealed !== 'start' && this.open !== 'start')}
          style=${styleMap({ width: stretch('start') })}
          @click=${this.handleActionClick}
        >
          <slot name="start" @slotchange=${this.handleSlotChange}></slot>
        </div>
        <div
          class=${classMap({ actions: true, end: true, revealed: revealed === 'end' })}
          part="end"
          ?inert=${this.containerSwipeable === false || (this.hasShortcuts && revealed !== 'end' && this.open !== 'end')}
          style=${styleMap({ width: stretch('end') })}
          @click=${this.handleActionClick}
        >
          <slot name="end" @slotchange=${this.handleSlotChange}></slot>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-swipe-action': SwipeAction
  }
}
