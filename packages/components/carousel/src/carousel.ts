import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './carousel.scss?inline'

export interface SlideChangeEventDetail {
  /** Zero-based index of the slide now at the start of the viewport. */
  index: number
  /** Zero-based index of the slide shown before. */
  previousIndex: number
  /** Number of positions the carousel can rest at; one per slide unless several slides share the viewport. */
  count: number
}

/** Events fired by {@link Carousel}, keyed for `addEventListener`. */
export interface CarouselEventMap {
  'slide-change': CustomEvent<SlideChangeEventDetail>
}

export interface Carousel {
  addEventListener: TypedAddEventListener<Carousel, CarouselEventMap>
  removeEventListener: TypedRemoveEventListener<Carousel, CarouselEventMap>
}

/** Substitutes `{index}` and `{count}` in a label template. */
function format(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}

/** How long scrolling must pause before the carousel treats the position as settled, where `scrollend` is missing. */
const SETTLE_DELAY = 120
/** How far, in pixels, a mouse must move with the button down before the press becomes a drag instead of a click. */
const DRAG_THRESHOLD = 5

const chevronLeft = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="15 18 9 12 15 6"></polyline>
</svg>`

const chevronRight = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="9 18 15 12 9 6"></polyline>
</svg>`

const playIcon = html`<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg>`

const pauseIcon = html`<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
  <rect x="6" y="4" width="4" height="16" rx="1"></rect>
  <rect x="14" y="4" width="4" height="16" rx="1"></rect>
</svg>`

/**
 * A horizontal slideshow of its children. Every child element is a slide; the track scrolls natively, so touch
 * swipes, trackpads and a focused track's arrow keys all move it, and CSS scroll snapping keeps a slide aligned to
 * the start of the viewport.
 *
 * With a mouse, dragging the track moves it too (`mouse-drag`, on by default): releasing it past a few pixels goes to the
 * next or previous slide, and the click that ends a drag does not reach a link in the slide. Clicking a slide that
 * only peeks into view (a `--c2-carousel__slide--width` below 100%) moves to it, so a peek layout can do without the
 * controls.
 *
 * Previous/next controls sit over the track and a row of indicators below it, one per position the carousel can rest
 * at. How wide a slide is and how far apart slides sit are CSS variables (`--c2-carousel__slide--width`,
 * `--c2-carousel--gap`), so showing two or three slides at once, or letting the next one peek in, needs no attribute;
 * `index` then names the first slide in view and the indicators shrink to the positions that can actually be reached.
 * Hiding the controls or the indicators is also CSS (`--c2-carousel__control--display`,
 * `--c2-carousel__indicators--display`), and so is showing the controls only while the pointer is over the carousel
 * (`--c2-carousel__control--opacity: 0`), or only the one whose edge the pointer is near, with nothing shown while it
 * is over the middle (`--c2-carousel__control__opposite--opacity: 0` as well; `--c2-carousel__control__zone--width`
 * sets how near).
 *
 * `loop` wraps previous/next around the ends. `autoplay` advances every `interval` milliseconds, always wrapping to the
 * first slide, and adds a play/pause control; rotation pauses while the pointer is over the carousel or focus is inside
 * it, and does not start on its own when the user prefers reduced motion.
 *
 * Accessibility follows the WAI-ARIA carousel pattern: the component is a region named by `label` with the
 * `carousel` role description, each slide becomes a group with the `slide` role description and a "2 of 5" name
 * (unless it already carries an `aria-label`), and the current slide is announced politely while rotation is stopped.
 * The indicators are one tab stop: arrow keys, Home and End move between them.
 *
 * @tag c2-carousel
 *
 * @slot - The slides. Every child element is one slide.
 * @slot previous-icon - Icon of the previous-slide control. Defaults to a chevron.
 * @slot next-icon - Icon of the next-slide control. Defaults to a chevron.
 * @slot play-icon - Icon of the play control shown with `autoplay` while rotation is stopped.
 * @slot pause-icon - Icon of the pause control shown with `autoplay` while slides rotate.
 *
 * @event {CustomEvent<SlideChangeEventDetail>} slide-change - Fired after the slide at the start of the viewport changes by a control, an indicator, the keyboard, a swipe, a drag, a click on a peeking slide, autoplay or a `next()`/`previous()`/`goTo()` call. Setting `index` does not fire it. Does not bubble.
 *
 * @csspart carousel - The region that wraps the whole carousel.
 * @csspart track - The scrolling row of slides.
 * @csspart control - The previous and next buttons.
 * @csspart previous - The previous-slide button.
 * @csspart next - The next-slide button.
 * @csspart indicators - The row of indicators, with the play/pause control when `autoplay` is set.
 * @csspart indicator - One indicator button.
 * @csspart rotation - The play/pause button shown with `autoplay`.
 *
 * @cssproperty {pixel} [--c2-carousel--gap=16px] - Space between slides.
 * @cssproperty {length} [--c2-carousel__slide--width=100%] - Width of one slide; `50%` shows two at once, `85%` lets the next one peek in.
 * @cssproperty {border-radius} [--c2-carousel__track--border-radius=8px] - Rounding of the viewport the slides scroll through.
 * @cssproperty {outline} [--c2-carousel__track__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-carousel__track__focus--outline-offset=2px]
 *
 * @cssproperty {display} [--c2-carousel__control--display=inline-flex] - `none` hides the previous/next buttons.
 * @cssproperty {opacity} [--c2-carousel__control--opacity=1] - Opacity of the previous/next buttons while the pointer is off the carousel and focus is outside it; `0` shows them only on hover. Ignored on devices that cannot hover.
 * @cssproperty {opacity} [--c2-carousel__control__opposite--opacity=1] - Opacity of a control the pointer is not near while it hovers the carousel: with `0` only the edge zone under the pointer shows its button (previous on the left, next on the right) and the middle shows neither. A focused control always shows.
 * @cssproperty {length} [--c2-carousel__control__zone--width=20%] - Width of the zone along each edge of the track that reveals that edge's control; a percentage is of the track width. Never narrower than the control and its inset.
 * @cssproperty {time} [--c2-carousel__control--transition-duration=240ms] - How long the previous/next buttons take to fade and slide in and out.
 * @cssproperty {pixel} [--c2-carousel__control__hidden--translate=8px] - How far towards its edge a hidden previous/next button sits; it slides in from there as it fades in. `0px` only fades.
 * @cssproperty {pixel} [--c2-carousel__control--size=36px]
 * @cssproperty {pixel} [--c2-carousel__control--inset=12px] - Distance from a control to the edge of the track.
 * @cssproperty {color} [--c2-carousel__control--color=#18181b]
 * @cssproperty {color} [--c2-carousel__control--background-color=#ffffff]
 * @cssproperty {border} [--c2-carousel__control--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-carousel__control--border-radius=999px]
 * @cssproperty {box-shadow} [--c2-carousel__control--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {color} [--c2-carousel__control__hover--background-color=#f4f4f5]
 * @cssproperty {outline} [--c2-carousel__control__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-carousel__control__focus--outline-offset=2px]
 * @cssproperty {opacity} [--c2-carousel__control__disabled--opacity=0.38]
 * @cssproperty {pixel} [--c2-carousel__icon--size=16px]
 * @cssproperty {color} [--c2-carousel__rotation--color=#71717a] - Colour of the play/pause control in the indicator row.
 * @cssproperty {color} [--c2-carousel__rotation__hover--color=#18181b]
 *
 * @cssproperty {display} [--c2-carousel__indicators--display=flex] - `none` hides the indicator row.
 * @cssproperty {pixel} [--c2-carousel__indicators--gap=4px] - Space between indicators.
 * @cssproperty {pixel} [--c2-carousel__indicators--margin-top=8px] - Space between the track and the indicator row.
 * @cssproperty {justify-content} [--c2-carousel__indicators--justify-content=center] - Where the indicators sit in the row.
 * @cssproperty {pixel} [--c2-carousel__indicator--width=8px]
 * @cssproperty {pixel} [--c2-carousel__indicator--height=8px]
 * @cssproperty {border-radius} [--c2-carousel__indicator--border-radius=999px]
 * @cssproperty {color} [--c2-carousel__indicator--background-color=#a1a1aa]
 * @cssproperty {color} [--c2-carousel__indicator__hover--background-color=#71717a]
 * @cssproperty {pixel} [--c2-carousel__indicator__selected--width=24px] - Width of the indicator of the current slide.
 * @cssproperty {color} [--c2-carousel__indicator__selected--background-color=rgb(2, 101, 220)]
 * @cssproperty {outline} [--c2-carousel__indicator__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {time} [--c2-carousel__indicator--transition-duration=200ms]
 */
@customElement('c2-carousel')
export class Carousel extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Zero-based index of the slide at the start of the viewport. Reflected, and clamped to the reachable range. */
  @property({ type: Number, reflect: true }) index = 0

  /** Wrap previous/next around the ends instead of stopping there. */
  @property({ type: Boolean, reflect: true }) loop = false

  /** Advance to the next slide every `interval` milliseconds and show a play/pause control. */
  @property({ type: Boolean, reflect: true }) autoplay = false

  /** Let a mouse drag the track from slide to slide. Touch and trackpads scroll it natively either way; `"false"` turns it off. */
  @property({ type: Boolean, reflect: true, attribute: 'mouse-drag' }) mouseDrag = true

  /** Milliseconds each slide stays on show while `autoplay` rotates. */
  @property({ type: Number }) interval = 5000

  /** Accessible name of the carousel region. */
  @property({ type: String }) label = 'Carousel'

  /** Accessible name of the previous-slide control. */
  @property({ type: String, attribute: 'previous-label' }) previousLabel = 'Previous slide'
  /** Accessible name of the next-slide control. */
  @property({ type: String, attribute: 'next-label' }) nextLabel = 'Next slide'
  /** Accessible name of the indicator group. */
  @property({ type: String, attribute: 'indicators-label' }) indicatorsLabel = 'Choose slide'
  /** Accessible name of an indicator. Placeholders: `{index}` (1-based), `{count}`. */
  @property({ type: String, attribute: 'indicator-label-template' }) indicatorLabelTemplate = 'Go to slide {index}'
  /** Accessible name given to a slide without its own `aria-label`. Placeholders: `{index}` (1-based), `{count}`. */
  @property({ type: String, attribute: 'slide-label-template' }) slideLabelTemplate = '{index} of {count}'
  /** Accessible name of the control that starts rotation. */
  @property({ type: String, attribute: 'play-label' }) playLabel = 'Start slide rotation'
  /** Accessible name of the control that stops rotation. */
  @property({ type: String, attribute: 'pause-label' }) pauseLabel = 'Stop slide rotation'

  @state() private slides: HTMLElement[] = []

  /** Number of positions the track can rest at: slides past the last full scroll share the final position. */
  @state() private positionCount = 0

  /** Whether the user has left rotation running; the play/pause control toggles it. */
  @state() private rotating = true

  /** Hover or focus inside the carousel holds rotation without changing what the play/pause control shows. */
  @state() private held = false
  private hovered = false
  private focused = false
  /** Set when play is pressed under the pointer, so that same hover does not immediately hold rotation again. */
  private resumedUnderPointer = false

  @query('.c2-carousel-track') private track?: HTMLElement

  /** The index the track rests at or is scrolling towards; `-1` when it must be re-aligned. */
  private scrolledIndex = -1
  /**
   * Offset a programmatic scroll is heading to. Until the track gets there, a `scrollend` elsewhere is the late end of
   * the scroll it interrupted (Chromium fires one when a second `scrollTo` cuts the first short) and must not move the
   * index back. A user gesture on the track clears it, so a swipe that interrupts still settles where it stops.
   */
  private scrollTarget: number | null = null
  /** The mouse drag in progress: where it started, and whether it has moved far enough to be a drag rather than a click. */
  private drag: { pointerId: number; x: number; scrollLeft: number; index: number; moved: boolean } | null = null
  /** Set when a drag ends, so the click the browser fires on release does not follow a link in the slide. */
  private suppressClick = false
  private settleTimer?: ReturnType<typeof setTimeout>
  private rotationTimer?: ReturnType<typeof setTimeout>
  private resizeObserver?: ResizeObserver
  private focusIndicatorAfterUpdate = false
  private focusControlAfterUpdate: 'previous' | 'next' | null = null
  /** Slides whose `aria-label` the carousel wrote, so it may rewrite it and never touches an author's. */
  private readonly labelledSlides = new WeakSet<Element>()
  private readonly reducedMotion = !isServer && typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined

  /** Number of positions the carousel can rest at; one per slide unless several slides fit in the viewport at once. */
  get count(): number {
    return this.positionCount || this.slides.length
  }

  /** `index` clamped to the reachable range; this is the slide the carousel actually shows first. */
  get currentIndex(): number {
    const last = Math.max(0, this.count - 1)
    return Math.min(Math.max(0, Math.floor(this.index) || 0), last)
  }

  /** Whether autoplay is advancing right now. */
  get playing(): boolean {
    return this.autoplay && this.rotating && !this.held && this.count > 1
  }

  /** Show the slide at `index`, clamped to the reachable range. Fires `slide-change` when it moves. */
  goTo(index: number) {
    const previousIndex = this.currentIndex
    const next = Math.min(Math.max(0, Math.floor(index) || 0), Math.max(0, this.count - 1))
    this.index = next
    if (next !== previousIndex) this.emitChange(next, previousIndex)
  }

  /** Show the next slide; past the last one it wraps with `loop` and stays put without. */
  next() {
    const index = this.currentIndex
    if (index < this.count - 1) this.goTo(index + 1)
    else if (this.loop) this.goTo(0)
  }

  /** Show the previous slide; before the first one it wraps with `loop` and stays put without. */
  previous() {
    const index = this.currentIndex
    if (index > 0) this.goTo(index - 1)
    else if (this.loop) this.goTo(this.count - 1)
  }

  override connectedCallback() {
    super.connectedCallback()
    if (isServer) return
    this.rotating = !this.reducedMotion?.matches
    this.addEventListener('pointerenter', this.handlePointerEnter)
    this.addEventListener('pointerleave', this.handlePointerLeave)
    this.addEventListener('pointermove', this.handlePointerMove)
    this.addEventListener('focusin', this.handleFocusIn)
    this.addEventListener('focusout', this.handleFocusOut)
    document.addEventListener('visibilitychange', this.handleVisibility)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver ??= new ResizeObserver(() => this.realign())
      if (this.track) this.resizeObserver.observe(this.track)
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener('pointerenter', this.handlePointerEnter)
    this.removeEventListener('pointerleave', this.handlePointerLeave)
    this.removeEventListener('pointermove', this.handlePointerMove)
    this.removeEventListener('focusin', this.handleFocusIn)
    this.removeEventListener('focusout', this.handleFocusOut)
    document.removeEventListener('visibilitychange', this.handleVisibility)
    this.resizeObserver?.disconnect()
    clearTimeout(this.settleTimer)
    clearTimeout(this.rotationTimer)
  }

  protected override firstUpdated() {
    if (this.track) this.resizeObserver?.observe(this.track)
  }

  protected override updated(changed: PropertyValues) {
    if (changed.has('slides') || changed.has('positionCount') || changed.has('slideLabelTemplate')) this.labelSlides()
    if (this.scrolledIndex !== this.currentIndex) this.scrollToIndex(this.currentIndex, this.scrolledIndex !== -1)
    if (changed.has('index') || changed.has('autoplay') || changed.has('interval') || changed.has('rotating') || changed.has('held') || changed.has('slides')) {
      this.scheduleRotation()
    }
    this.restoreFocus()
  }

  private emitChange(index: number, previousIndex: number) {
    this.dispatchEvent(new CustomEvent<SlideChangeEventDetail>('slide-change', { detail: { index, previousIndex, count: this.count } }))
  }

  private handleSlotChange(event: Event) {
    const slot = event.target as HTMLSlotElement
    this.slides = slot.assignedElements().filter((element): element is HTMLElement => element instanceof HTMLElement)
    this.measure()
  }

  private labelSlides() {
    const count = this.slides.length
    this.slides.forEach((slide, index) => {
      slide.setAttribute('role', slide.getAttribute('role') ?? 'group')
      slide.setAttribute('aria-roledescription', slide.getAttribute('aria-roledescription') ?? 'slide')
      if (slide.hasAttribute('aria-label') && !this.labelledSlides.has(slide)) return
      slide.setAttribute('aria-label', format(this.slideLabelTemplate, { index: index + 1, count }))
      this.labelledSlides.add(slide)
    })
  }

  private get isRtl(): boolean {
    return !!this.track && getComputedStyle(this.track).direction === 'rtl'
  }

  /** Scroll offset at which each slide sits at the start of the track, clamped to the scrollable range. */
  private offsets(): number[] {
    const track = this.track
    if (!track) return []
    const rtl = this.isRtl
    const box = track.getBoundingClientRect()
    const max = Math.max(0, track.scrollWidth - track.clientWidth)
    return this.slides.map((slide) => {
      const rect = slide.getBoundingClientRect()
      // In RTL the start edge is the right one and scrollLeft runs from 0 down to -max.
      const offset = rtl ? rect.right - box.right + track.scrollLeft : rect.left - box.left + track.scrollLeft
      return rtl ? Math.max(-max, Math.min(0, offset)) : Math.max(0, Math.min(max, offset))
    })
  }

  /** Count the positions the track can rest at: every slide from the first that needs the full scroll shares the last. */
  private measure() {
    const track = this.track
    if (!track || this.slides.length === 0) {
      this.positionCount = this.slides.length
      return
    }
    const max = Math.max(0, track.scrollWidth - track.clientWidth)
    const offsets = this.offsets()
    const last = offsets.findIndex((offset) => Math.abs(offset) >= max - 1)
    this.positionCount = last === -1 ? offsets.length : last + 1
  }

  /** A resize moves every snap point; re-measure and put the current slide back at the start without animating. */
  private realign() {
    this.measure()
    this.scrolledIndex = -1
    this.requestUpdate()
  }

  private scrollToIndex(index: number, smooth: boolean) {
    const track = this.track
    const offset = this.offsets()[index]
    if (!track || offset === undefined) return
    this.scrolledIndex = index
    if (Math.abs(track.scrollLeft - offset) < 1) return
    this.scrollTarget = offset
    const behavior: ScrollBehavior = smooth && !this.reducedMotion?.matches ? 'smooth' : 'instant'
    track.scrollTo({ left: offset, behavior })
  }

  private handleScroll() {
    clearTimeout(this.settleTimer)
    if ('onscrollend' in window) return
    this.settleTimer = setTimeout(() => this.settle(), SETTLE_DELAY)
  }

  /** The track stopped: whichever slide it rests closest to is now the current one. */
  private settle() {
    const track = this.track
    if (!track || this.drag) return
    if (this.scrollTarget !== null) {
      if (Math.abs(track.scrollLeft - this.scrollTarget) >= 2) return
      this.scrollTarget = null
    }
    this.releaseSnap(false)
    const offsets = this.offsets().slice(0, this.count)
    if (offsets.length === 0) return
    let nearest = 0
    offsets.forEach((offset, index) => {
      if (Math.abs(offset - track.scrollLeft) < Math.abs(offsets[nearest] - track.scrollLeft)) nearest = index
    })
    this.scrolledIndex = nearest
    const previousIndex = this.currentIndex
    if (nearest === previousIndex) return
    this.index = nearest
    this.emitChange(nearest, previousIndex)
  }

  /** Passive, so a wheel or touch scroll never waits on it. */
  private readonly handleUserScroll = {
    handleEvent: () => {
      if (this.drag) return
      this.scrollTarget = null
      this.releaseSnap(false)
    },
    passive: true,
  }

  /**
   * Snapping is switched off while a drag moves the track and until the scroll that follows it lands, or the browser
   * would snap to the nearest slide under the pointer and again the moment the drag lets go.
   */
  private releaseSnap(released: boolean) {
    this.track?.classList.toggle('is-dragging', released)
  }

  private handleDragStart(event: PointerEvent) {
    this.handleUserScroll.handleEvent()
    if (!this.mouseDrag || event.pointerType !== 'mouse' || event.button !== 0 || this.count < 2) return
    // A field in a slide keeps its own text selection and caret placement.
    const field = event.composedPath().find((node) => node instanceof HTMLElement && node.matches('input, textarea, select, [contenteditable]'))
    if (field || !this.track) return
    this.drag = { pointerId: event.pointerId, x: event.clientX, scrollLeft: this.track.scrollLeft, index: this.currentIndex, moved: false }
  }

  private handleDragMove(event: PointerEvent) {
    const drag = this.drag
    const track = this.track
    if (!drag || !track || event.pointerId !== drag.pointerId) return
    const dx = event.clientX - drag.x
    if (!drag.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return
      // Capture only once it is a drag: capturing on press would retarget a plain click on a link to the track.
      drag.moved = true
      this.scrollTarget = null
      track.setPointerCapture(event.pointerId)
      this.releaseSnap(true)
    }
    event.preventDefault()
    track.scrollLeft = drag.scrollLeft - dx
  }

  private handleDragEnd(event: PointerEvent) {
    const drag = this.drag
    const track = this.track
    if (!drag || event.pointerId !== drag.pointerId) return
    this.drag = null
    if (!drag.moved || !track) return
    this.suppressClick = true
    // A click that does not follow (the pointer left the page) must not swallow the next real one.
    setTimeout(() => (this.suppressClick = false))
    const offsets = this.offsets().slice(0, this.count)
    let target = 0
    offsets.forEach((offset, index) => {
      if (Math.abs(offset - track.scrollLeft) < Math.abs(offsets[target] - track.scrollLeft)) target = index
    })
    // Past the threshold the drag always turns the page, however little of the next slide it revealed.
    const dx = event.clientX - drag.x
    const forward = this.isRtl ? dx > 0 : dx < 0
    if (target === drag.index && event.type === 'pointerup') target = Math.min(Math.max(0, drag.index + (forward ? 1 : -1)), this.count - 1)
    const previousIndex = this.currentIndex
    this.scrollToIndex(target, true)
    if (this.scrollTarget === null) this.releaseSnap(false)
    if (target === previousIndex) return
    this.index = target
    this.emitChange(target, previousIndex)
  }

  /** Capturing, so it runs before a link or a listener in the slide sees the click. */
  private readonly handleTrackClick = {
    handleEvent: (event: MouseEvent) => {
      if (this.suppressClick) {
        this.suppressClick = false
        event.preventDefault()
        event.stopPropagation()
        return
      }
      // A click on a slide that only peeks into view brings it in, and does not also reach a link inside it.
      const slide = this.peekingSlideIndex(event)
      if (slide === -1) return
      event.preventDefault()
      event.stopPropagation()
      this.goTo(slide)
    },
    capture: true,
  }

  /** Index of the partly visible slide a click landed on, if showing it would move the carousel; `-1` otherwise. */
  private peekingSlideIndex(event: MouseEvent): number {
    const track = this.track
    if (!track) return -1
    const index = this.slides.findIndex((slide) => event.composedPath().includes(slide))
    if (index === -1) return -1
    const box = track.getBoundingClientRect()
    const rect = this.slides[index].getBoundingClientRect()
    if (rect.left >= box.left - 1 && rect.right <= box.right + 1) return -1
    const target = Math.min(index, this.count - 1)
    return target === this.currentIndex ? -1 : target
  }

  private handleNativeDrag(event: DragEvent) {
    // Links and images in a slide are draggable by default, which would hijack the pointer before the track moves.
    if (this.mouseDrag) event.preventDefault()
  }

  private handleTrackKeydown(event: KeyboardEvent) {
    if (event.target !== event.currentTarget) return
    const forward = this.isRtl ? 'ArrowLeft' : 'ArrowRight'
    const backward = this.isRtl ? 'ArrowRight' : 'ArrowLeft'
    if (event.key === forward) this.next()
    else if (event.key === backward) this.previous()
    else if (event.key === 'Home') this.goTo(0)
    else if (event.key === 'End') this.goTo(this.count - 1)
    else return
    event.preventDefault()
  }

  private handleIndicatorKeydown(event: KeyboardEvent) {
    const forward = this.isRtl ? 'ArrowLeft' : 'ArrowRight'
    const backward = this.isRtl ? 'ArrowRight' : 'ArrowLeft'
    const index = this.currentIndex
    const last = this.count - 1
    let target: number
    if (event.key === forward) target = index < last ? index + 1 : 0
    else if (event.key === backward) target = index > 0 ? index - 1 : last
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = last
    else return
    event.preventDefault()
    this.focusIndicatorAfterUpdate = true
    this.goTo(target)
  }

  private handleControl(event: Event, control: 'previous' | 'next') {
    // Only a control that holds focus hands it on; a mouse press on a button that does not keep focus leaves it alone.
    this.focusControlAfterUpdate = this.shadowRoot?.activeElement === event.currentTarget ? control : null
    if (control === 'previous') this.previous()
    else this.next()
  }

  /**
   * Keep the keyboard where it was: the indicator that roved follows the current slide, and a control that the press
   * just disabled at an end of the track hands focus to the opposite one instead of dropping it to the document.
   */
  private restoreFocus() {
    const root = this.shadowRoot
    if (!root) return
    if (this.focusIndicatorAfterUpdate) {
      this.focusIndicatorAfterUpdate = false
      root.querySelector<HTMLButtonElement>('.c2-carousel-indicator[aria-current="true"]')?.focus()
    }
    const pressed = this.focusControlAfterUpdate
    this.focusControlAfterUpdate = null
    if (!pressed) return
    const button = root.querySelector<HTMLButtonElement>(`[data-control="${pressed}"]`)
    // Chromium blurs a button as it becomes disabled, so the press itself, not the current focus, decides this.
    if (button?.disabled) {
      root.querySelector<HTMLButtonElement>(`[data-control="${pressed === 'previous' ? 'next' : 'previous'}"]`)?.focus()
    }
  }

  private scheduleRotation() {
    clearTimeout(this.rotationTimer)
    if (!this.playing || isServer) return
    this.rotationTimer = setTimeout(
      () => {
        if (!this.playing) return
        const index = this.currentIndex
        this.goTo(index < this.count - 1 ? index + 1 : 0)
      },
      Math.max(0, this.interval),
    )
  }

  /** Pressing play starts rotation right away, although the pointer or focus that pressed it is inside the carousel. */
  private toggleRotation() {
    this.rotating = !this.rotating
    if (!this.rotating) return
    this.resumedUnderPointer = this.hovered
    this.hovered = false
    this.focused = false
    this.syncHold()
  }

  private isInside(node: Node | null): boolean {
    return !!node && (node === this || this.contains(node) || !!this.shadowRoot?.contains(node))
  }

  private syncHold() {
    this.held = this.hovered || this.focused
  }

  private handlePointerEnter = () => {
    // Chromium fires a fresh `pointerenter` when the play/pause icon is swapped under a resting pointer; after the user
    // pressed play, hovering only holds rotation again once the pointer has left and come back.
    if (this.resumedUnderPointer) return
    this.hovered = true
    this.syncHold()
  }

  /**
   * Mark which half of the carousel the pointer is over, in reading order, so CSS can fade the control on the other
   * half. A class on the inner region rather than state: it changes on every crossing of the middle, never re-renders.
   */
  private handlePointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    const root = this.shadowRoot
    const region = root?.querySelector('.c2-carousel')
    const viewport = root?.querySelector('.c2-carousel-viewport')
    if (!region || !viewport) return
    const box = viewport.getBoundingClientRect()
    // The zone probe is sized by `--c2-carousel__control__zone--width`, so a percentage, a length or a calc() all resolve.
    const zone = root?.querySelector('.c2-carousel-zone')?.getBoundingClientRect().width ?? box.width / 2
    const fromStart = this.isRtl ? box.right - event.clientX : event.clientX - box.left
    const side = fromStart < zone ? 'pointer-start' : box.width - fromStart < zone ? 'pointer-end' : 'pointer-middle'
    if (region.classList.contains(side)) return
    region.classList.remove('pointer-start', 'pointer-end', 'pointer-middle')
    region.classList.add(side)
  }

  private handlePointerLeave = () => {
    this.shadowRoot?.querySelector('.c2-carousel')?.classList.remove('pointer-start', 'pointer-end', 'pointer-middle')
    this.resumedUnderPointer = false
    this.hovered = false
    this.syncHold()
  }

  private handleFocusIn = (event: FocusEvent) => {
    if (this.isInside(event.relatedTarget as Node | null)) return
    this.focused = true
    this.syncHold()
  }

  private handleFocusOut = (event: FocusEvent) => {
    if (this.isInside(event.relatedTarget as Node | null)) return
    this.focused = false
    this.syncHold()
  }

  private handleVisibility = () => {
    if (document.hidden) clearTimeout(this.rotationTimer)
    else this.scheduleRotation()
  }

  private renderIndicators(index: number, count: number) {
    return Array.from({ length: count }, (_, position) => {
      const current = position === index
      return html`<button
        class="c2-carousel-indicator"
        part="indicator"
        type="button"
        tabindex=${current ? 0 : -1}
        aria-label=${format(this.indicatorLabelTemplate, { index: position + 1, count })}
        aria-current=${current ? 'true' : nothing}
        @click=${() => this.goTo(position)}
      ></button>`
    })
  }

  override render() {
    const count = this.count
    const index = this.currentIndex
    const atStart = !this.loop && index <= 0
    const atEnd = !this.loop && index >= count - 1
    return html`<section class="c2-carousel" part="carousel" aria-roledescription="carousel" aria-label=${this.label}>
      <div class="c2-carousel-viewport">
        <div class="c2-carousel-zone" aria-hidden="true"></div>
        <div
          class="c2-carousel-track ${this.mouseDrag ? 'is-draggable' : ''}"
          part="track"
          tabindex="0"
          aria-live=${this.playing ? 'off' : 'polite'}
          @scroll=${this.handleScroll}
          @scrollend=${this.settle}
          @wheel=${this.handleUserScroll}
          @touchstart=${this.handleUserScroll}
          @pointerdown=${this.handleDragStart}
          @pointermove=${this.handleDragMove}
          @pointerup=${this.handleDragEnd}
          @pointercancel=${this.handleDragEnd}
          @click=${this.handleTrackClick}
          @dragstart=${this.handleNativeDrag}
          @keydown=${this.handleTrackKeydown}
        >
          <slot @slotchange=${this.handleSlotChange}></slot>
        </div>
        ${
          count > 1
            ? html`<button
                  class="c2-carousel-control c2-carousel-previous"
                  part="control previous"
                  type="button"
                  data-control="previous"
                  aria-label=${this.previousLabel}
                  ?disabled=${atStart}
                  @click=${(event: Event) => this.handleControl(event, 'previous')}
                >
                  <span class="c2-carousel-icon"><slot name="previous-icon">${chevronLeft}</slot></span>
                </button>
                <button
                  class="c2-carousel-control c2-carousel-next"
                  part="control next"
                  type="button"
                  data-control="next"
                  aria-label=${this.nextLabel}
                  ?disabled=${atEnd}
                  @click=${(event: Event) => this.handleControl(event, 'next')}
                >
                  <span class="c2-carousel-icon"><slot name="next-icon">${chevronRight}</slot></span>
                </button>`
            : nothing
        }
      </div>
      ${
        count > 1
          ? html`<div class="c2-carousel-indicators" part="indicators">
              ${
                this.autoplay
                  ? html`<button
                      class="c2-carousel-rotation"
                      part="rotation"
                      type="button"
                      aria-label=${this.rotating ? this.pauseLabel : this.playLabel}
                      @click=${this.toggleRotation}
                    >
                      <span class="c2-carousel-icon">
                        ${this.rotating ? html`<slot name="pause-icon">${pauseIcon}</slot>` : html`<slot name="play-icon">${playIcon}</slot>`}
                      </span>
                    </button>`
                  : nothing
              }
              <div class="c2-carousel-indicator-group" role="group" aria-label=${this.indicatorsLabel} @keydown=${this.handleIndicatorKeydown}>
                ${this.renderIndicators(index, count)}
              </div>
            </div>`
          : nothing
      }
    </section>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-carousel': Carousel
  }
}
