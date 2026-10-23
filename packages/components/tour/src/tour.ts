import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query } from 'lit/decorators.js'
import { assignSlot, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { computePosition, autoUpdate, flip, shift, offset, arrow, type Placement, type VirtualElement } from '@floating-ui/dom'
import type { TourStep } from './tour-step.js'
import { tourMessages } from './messages'
import styles from './tour.scss?inline'
import './tour-step.js'

export type { Placement }

/** Where a user is with a tour, as remembered under its `storage-key`. */
export type TourStatus = 'new' | 'in-progress' | 'finished' | 'skipped'

/** What a tour keeps in `localStorage` under its `storage-key`. */
export interface TourProgress {
  status: TourStatus
  /** Index of the step shown last. */
  step: number
  /** How many times the user has skipped the tour. */
  skips: number
  /** When the user last skipped the tour, in milliseconds since the epoch. */
  skippedAt?: number
}

/** Detail of the `step-change` event. */
export interface TourStepChangeDetail {
  /** Index of the step now shown. */
  index: number
  /** Index of the step shown before. */
  previous: number
}

/** Detail of the `skip` event. */
export interface TourSkipDetail {
  /** Index of the step the tour was closed on. */
  index: number
}

/** Events fired by {@link Tour}, keyed for `addEventListener`. */
export interface TourEventMap {
  'step-change': CustomEvent<TourStepChangeDetail>
  finish: Event
  skip: CustomEvent<TourSkipDetail>
  show: Event
  hide: Event
}

export interface Tour {
  addEventListener: TypedAddEventListener<Tour, TourEventMap>
  removeEventListener: TypedRemoveEventListener<Tour, TourEventMap>
}

/**
 * Guided product tour: walks a user through a page one element at a time, dimming everything else and explaining the
 * highlighted element in a panel beside it. Use it for onboarding and for introducing a new feature in place.
 *
 * Each step is a `c2-tour-step` child naming its `target` (a CSS selector), a `heading` and the explanation as its
 * content. Put a button in the `trigger` slot, set `open` or call `start()` to begin; the panel offers Back, Next (Done on the last step) and a close
 * button, and shows the progress as "2 of 5". The target is scrolled into view when it is off screen, and the panel is
 * placed beside it by floating-ui, flipping to the other side when there is no room. A step without a target, or
 * whose target is missing, shows centred over the dimmed page.
 *
 * The tour is a non-modal `dialog` in the top layer: the page stays interactive, so a step can ask the user to try
 * the highlighted control. Opening moves focus to Next; Escape (wherever focus is) and the close button end the tour early, and the
 * arrow keys move between steps while focus is in the panel. When it closes, focus returns to where it was before.
 *
 * With a `storage-key`, the tour remembers in `localStorage` whether the user finished it, skipped it or got part
 * way, on which step, and how many times it was skipped (`progress`). Add `autostart` to open it by itself on the
 * first visit: it then resumes on the step it was left on, opens again from the first step after a skip, and stays
 * closed once finished or skipped `skip-limit` times (once, by default). `skip-delay` makes a skipped tour wait, say
 * a week, before it opens again. `start()` and the trigger always open it;
 * `reset()` forgets the stored progress.
 *
 * Every tour a user ends fires exactly one `finish` (Done on the last step) or `skip` (Skip, the close button or Escape).
 * Moving between steps with the buttons, the keys or the methods fires `step-change`; setting `open` or `current`
 * from code fires only `show` / `hide`.
 *
 * @tag c2-tour
 *
 * @slot - The `c2-tour-step` elements, in order. Only the current step is shown, inside the panel.
 * @slot trigger - Optional button that starts the tour from its first step when clicked. It stays where the tour is placed.
 *
 * @event {CustomEvent<TourStepChangeDetail>} step-change - The user, or a method, moved to another step. `detail.index` is the new step, `detail.previous` the old one.
 * @event {Event} finish - The user completed the tour with Done on the last step.
 * @event {CustomEvent<TourSkipDetail>} skip - The user ended the tour early with Skip, the close button or Escape. `detail.index` is the step it was closed on.
 * @event {Event} show - The tour opened.
 * @event {Event} hide - The tour closed.
 *
 * @csspart panel - The dialog beside the target.
 * @csspart arrow - The arrow pointing at the target. Hidden on a centred step.
 * @csspart spotlight - The highlighted cut-out around the target; its shadow dims the rest of the page.
 * @csspart header - The row holding the heading and the close button.
 * @csspart heading - The current step's heading.
 * @csspart close - The button that ends the tour early.
 * @csspart body - The region wrapping the default slot: it shows the current `c2-tour-step`, assigned to it, and has no fallback content.
 * @csspart footer - The row holding the progress and the navigation buttons.
 * @csspart progress - The "2 of 5" progress text.
 * @csspart skip - The Skip button, which ends the tour early. Hidden on the last step.
 * @csspart previous - The Back button. Hidden on the first step.
 * @csspart next - The Next button, which reads Done on the last step.
 *
 * @cssproperty {background-color} [--c2-tour--background-color=#ffffff]
 * @cssproperty {color} [--c2-tour--color=#18181b]
 * @cssproperty {border} [--c2-tour--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-tour--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-tour--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {font-size} [--c2-tour--font-size=14px]
 * @cssproperty {font-family} --c2-tour--font-family
 * @cssproperty {line-height} [--c2-tour--line-height=1.5]
 * @cssproperty {padding} [--c2-tour--padding=16px]
 * @cssproperty {pixel} [--c2-tour--width=320px] - Width of the panel; it never grows past the viewport.
 * @cssproperty {pixel} [--c2-tour--offset=8px] - Distance between the spotlight and the tip of the arrow.
 * @cssproperty {time} [--c2-tour--transition-duration=200ms] - Fade of the panel and the spotlight's move between steps.
 * @cssproperty {transform} [--c2-tour--enter-transform=scale(0.96)] - Start of the panel's enter animation.
 *
 * @cssproperty {pixel} [--c2-tour__arrow--size=10px] - Side of the arrow square; `0px` hides it.
 *
 * @cssproperty {color} [--c2-tour__backdrop--color=rgba(9, 9, 11, 0.45)] - Colour that dims the page around the spotlight; `transparent` keeps the page undimmed.
 * @cssproperty {pixel} [--c2-tour__spotlight--padding=8px] - Space between the target and the edge of the spotlight.
 * @cssproperty {border-radius} [--c2-tour__spotlight--border-radius=8px]
 * @cssproperty {outline} [--c2-tour__spotlight--outline=2px solid rgba(2, 101, 220, 0.4)] - Ring drawn around the spotlight.
 *
 * @cssproperty {color} --c2-tour__heading--color - Defaults to the panel text colour.
 * @cssproperty {font-size} [--c2-tour__heading--font-size=14px]
 * @cssproperty {font-weight} [--c2-tour__heading--font-weight=600]
 *
 * @cssproperty {color} [--c2-tour__body--color=#71717a]
 * @cssproperty {pixel} [--c2-tour__body--margin-top=4px]
 *
 * @cssproperty {pixel} [--c2-tour__close--size=24px]
 * @cssproperty {color} [--c2-tour__close--color=#71717a]
 * @cssproperty {border-radius} [--c2-tour__close--border-radius=4px]
 * @cssproperty {background-color} [--c2-tour__close__hover--background-color=#f4f4f5]
 *
 * @cssproperty {pixel} [--c2-tour__footer--margin-top=16px]
 * @cssproperty {pixel} [--c2-tour__footer--gap=8px]
 * @cssproperty {color} [--c2-tour__progress--color=#71717a]
 * @cssproperty {font-size} [--c2-tour__progress--font-size=12px]
 *
 * @cssproperty {pixel} [--c2-tour__button--height=32px]
 * @cssproperty {padding} [--c2-tour__button--padding-left=12px]
 * @cssproperty {padding} [--c2-tour__button--padding-right=12px]
 * @cssproperty {border-radius} [--c2-tour__button--border-radius=6px]
 * @cssproperty {font-size} [--c2-tour__button--font-size=14px]
 * @cssproperty {font-weight} [--c2-tour__button--font-weight=500]
 * @cssproperty {outline} [--c2-tour__button__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Also the close button's focus ring.
 * @cssproperty {pixel} [--c2-tour__button__focus--outline-offset=2px]
 *
 * @cssproperty {display} [--c2-tour__skip--display=inline-flex] - `none` removes the Skip button; the close button still skips.
 * @cssproperty {color} [--c2-tour__skip--color=#71717a]
 * @cssproperty {background-color} [--c2-tour__skip__hover--background-color=#f4f4f5]
 *
 * @cssproperty {background-color} [--c2-tour__previous--background-color=transparent]
 * @cssproperty {color} [--c2-tour__previous--color=#18181b]
 * @cssproperty {border} [--c2-tour__previous--border=1px solid #bcbcc6]
 * @cssproperty {background-color} [--c2-tour__previous__hover--background-color=#f4f4f5]
 *
 * @cssproperty {background-color} [--c2-tour__next--background-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-tour__next--color=#ffffff]
 * @cssproperty {border} [--c2-tour__next--border=1px solid transparent]
 * @cssproperty {background-color} [--c2-tour__next__hover--background-color=rgb(1, 84, 184)]
 *
 * @slotcomponent c2-tour-step
 */
@customElement('c2-tour')
export class Tour extends LitElement {
  static override styles = unsafeCSS(styles)
  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, slotAssignment: 'manual' }

  /** Visible state. Set it, or call `start()`, to begin the tour; setting it fires `show` / `hide` but no `finish` or `skip`. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Index of the step shown, from 0. Setting it moves the tour without firing `step-change`. */
  @property({ type: Number }) current = 0

  /** Preferred side of the target for the panel; a step's own `placement` wins. Flips when there is no room. */
  @property() placement: Placement = 'bottom'

  /**
   * `localStorage` key under which the tour remembers its progress (`{ "status", "step", "skips" }`). Empty, nothing is
   * stored.
   * Use one key per tour, and a new key when a tour changes enough to be worth showing again.
   */
  @property({ attribute: 'storage-key' }) storageKey = ''

  /**
   * Opens the tour by itself when it is connected, unless the progress under `storage-key` says it was finished or
   * skipped `skip-limit` times. It resumes on the stored step, or on the first after a skip. Without a `storage-key`
   * it opens on every page load.
   */
  @property({ type: Boolean }) autostart = false

  /**
   * How many skips turn `autostart` off for good. Below it, a skipped tour opens again from its first step on the next
   * load. `0` never gives up: the tour keeps opening until it is finished.
   */
  @property({ type: Number, attribute: 'skip-limit' }) skipLimit = 1

  /**
   * How long a skipped tour waits before `autostart` opens it again: a number and a unit, `30m`, `12h`, `7d` or `2w`
   * (a bare number is days). Empty, it opens on the next load. Only matters while `skip-limit` allows another skip.
   */
  @property({ attribute: 'skip-delay' }) skipDelay = ''

  @query('.panel') private panel?: HTMLElement
  @query('.spotlight') private spotlight?: HTMLElement
  @query('.arrow') private arrowElement?: HTMLElement
  @query('.next') private nextButton?: HTMLButtonElement
  @query('.measure') private measure?: HTMLElement

  private readonly msg = new LocalizeController(this, tourMessages)
  private readonly childObserver = isServer ? null : new MutationObserver(() => this.requestUpdate())
  private cleanupPosition: (() => void) | null = null
  private shownStep: TourStep | null = null
  private shownTarget: HTMLElement | null = null
  private returnFocus: HTMLElement | null = null

  override connectedCallback() {
    super.connectedCallback()
    this.childObserver?.observe(this, { childList: true })
    // Removing the element closed its popovers; an open tour that is moved shows again where it lands.
    if (this.hasUpdated && this.open) this.requestUpdate()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.childObserver?.disconnect()
    this.stopPositioning()
    document.removeEventListener('keydown', this.handleDocumentKeydown)
    this.shownStep = null
    this.shownTarget = null
  }

  /** The progress stored under `storage-key`: `new` when nothing is stored, the key is empty or storage is unavailable. */
  get progress(): TourProgress {
    const fallback: TourProgress = { status: 'new', step: 0, skips: 0 }
    if (!this.storageKey || isServer) return fallback
    try {
      const stored = JSON.parse(localStorage.getItem(this.storageKey) ?? 'null') as Partial<TourProgress> | null
      if (!stored || !['in-progress', 'finished', 'skipped'].includes(stored.status ?? '')) return fallback
      const status = stored.status as TourStatus
      const step = Number.isInteger(stored.step) ? (stored.step as number) : 0
      // A count stored before skips were counted: a skipped tour was skipped once.
      const skips = Number.isInteger(stored.skips) ? Math.max(stored.skips as number, 0) : status === 'skipped' ? 1 : 0
      const progress: TourProgress = { status, step, skips }
      if (Number.isFinite(stored.skippedAt)) progress.skippedAt = stored.skippedAt
      return progress
    } catch {
      return fallback /* storage blocked or the value is not ours */
    }
  }

  /** Forgets the progress stored under `storage-key`, so `autostart` opens the tour again on the next load. */
  reset() {
    if (!this.storageKey) return
    try {
      localStorage.removeItem(this.storageKey)
    } catch {
      /* storage blocked */
    }
  }

  /** Whether `autostart` has given up: the tour was finished, or skipped as often as `skip-limit` allows. */
  private settled({ status, skips }: TourProgress) {
    return status === 'finished' || (status === 'skipped' && this.skipLimit > 0 && skips >= this.skipLimit)
  }

  private saveProgress(status: TourStatus) {
    if (!this.storageKey) return
    const stored = this.progress
    // Replaying a settled tour from its trigger does not make `autostart` open it again, and finishing is final.
    if (stored.status === 'finished' && status !== 'finished') return
    if (status === 'in-progress' && this.settled(stored)) return
    const progress: TourProgress = { status, step: this.currentIndex(), skips: stored.skips }
    if (status === 'skipped') {
      progress.skips++
      progress.skippedAt = Date.now()
    } else if (stored.skippedAt !== undefined) progress.skippedAt = stored.skippedAt
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(progress))
    } catch {
      /* storage blocked or full: the tour works without it */
    }
  }

  private autostartFromProgress() {
    if (!this.autostart || this.open) return
    const progress = this.progress
    if (this.settled(progress)) return
    if (progress.status === 'skipped') {
      // Still waiting out `skip-delay` since the last skip.
      if (progress.skippedAt !== undefined && Date.now() - progress.skippedAt < parseDuration(this.skipDelay)) return
      this.start(0)
    } else this.start(progress.step)
  }

  private get triggers(): Element[] {
    if (isServer || !this.children) return []
    return [...this.children].filter((child) => child.getAttribute('slot') === 'trigger')
  }

  /** The `c2-tour-step` children, in order. */
  get steps(): TourStep[] {
    if (isServer || !this.children) return []
    return [...this.children].filter((child): child is TourStep => child.localName === 'c2-tour-step')
  }

  /** The step shown while open: `current`, kept within the steps. */
  get currentStep(): TourStep | null {
    const steps = this.steps
    return steps[this.currentIndex(steps)] ?? null
  }

  private currentIndex(steps = this.steps) {
    return Math.min(Math.max(Math.trunc(this.current) || 0, 0), Math.max(steps.length - 1, 0))
  }

  /** Opens the tour on step `index` (the first by default). */
  start(index = 0) {
    this.current = index
    this.open = true
  }

  /** Moves to the next step, or finishes the tour on the last one. */
  next() {
    const steps = this.steps
    const index = this.currentIndex(steps)
    if (index >= steps.length - 1) this.finish()
    else this.goTo(index + 1)
  }

  /** Moves back one step. */
  previous() {
    this.goTo(this.currentIndex() - 1)
  }

  /** Moves to step `index`, firing `step-change` when that is another step. */
  goTo(index: number) {
    const steps = this.steps
    const previous = this.currentIndex(steps)
    const next = Math.min(Math.max(Math.trunc(index), 0), Math.max(steps.length - 1, 0))
    if (next === previous) return
    this.current = next
    this.dispatchEvent(new CustomEvent<TourStepChangeDetail>('step-change', { detail: { index: next, previous } }))
  }

  /** Closes the tour as completed, firing `finish`. */
  finish() {
    if (!this.open) return
    this.open = false
    this.saveProgress('finished')
    this.dispatchEvent(new Event('finish'))
  }

  /** Closes the tour before its end, firing `skip`. */
  skip() {
    if (!this.open) return
    const index = this.currentIndex()
    this.open = false
    this.saveProgress('skipped')
    this.dispatchEvent(new CustomEvent<TourSkipDetail>('skip', { detail: { index } }))
  }

  private handlePrevious = () => {
    this.previous()
    // Back is hidden on the first step; keep focus in the panel.
    if (this.currentIndex() === 0) void this.updateComplete.then(() => this.nextButton?.focus())
  }

  /** Escape ends the tour wherever focus is: the page stays usable, so it is often outside the panel. */
  private handleDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    this.skip()
  }

  private handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    // Leave the arrow keys to a control inside the step's content.
    const origin = event.composedPath()[0]
    if (origin instanceof HTMLElement && origin.closest('input, textarea, select, [contenteditable]')) return
    event.preventDefault()
    // Only Done finishes the tour; an arrow key on the last step does nothing.
    if (event.key === 'ArrowRight') this.goTo(this.currentIndex() + 1)
    else if (this.currentIndex() > 0) this.handlePrevious()
  }

  /** The length variables, resolved to pixels by CSS (any unit, `calc()`) on the hidden `.measure` box. */
  private lengths() {
    const style = this.measure ? getComputedStyle(this.measure) : null
    const read = (value: string | undefined) => {
      const pixels = Number.parseFloat(value ?? '')
      return Number.isNaN(pixels) ? 0 : pixels
    }
    return { offset: read(style?.paddingTop), padding: read(style?.paddingRight), arrow: read(style?.paddingBottom) }
  }

  /** The target when it is rendered, else `null` so the step shows centred. */
  private visibleTarget(step: TourStep | null) {
    const target = step?.targetElement ?? null
    if (!target || !target.isConnected) return null
    const rect = target.getBoundingClientRect()
    return rect.width || rect.height ? target : null
  }

  private spotlightRect(target: HTMLElement, padding: number) {
    const rect = target.getBoundingClientRect()
    return new DOMRect(rect.left - padding, rect.top - padding, rect.width + padding * 2, rect.height + padding * 2)
  }

  private enterStep(step: TourStep | null) {
    this.stopPositioning()
    if (step !== this.shownStep) this.saveProgress('in-progress')
    this.shownStep = step
    const target = this.visibleTarget(step)
    this.shownTarget = target
    const panel = this.panel
    const spotlight = this.spotlight
    if (!panel || !spotlight) return
    if (!target) {
      panel.dataset.placement = 'center'
      spotlight.dataset.placement = 'center'
      for (const element of [panel, spotlight]) Object.assign(element.style, { left: '', top: '', width: '', height: '' })
      return
    }
    delete spotlight.dataset.placement
    const rect = target.getBoundingClientRect()
    if (rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth) {
      target.scrollIntoView({ block: 'center', inline: 'nearest' })
    }
    this.cleanupPosition = autoUpdate(target, panel, () => void this.updatePosition(step, target, panel, spotlight))
  }

  private stopPositioning() {
    this.cleanupPosition?.()
    this.cleanupPosition = null
  }

  private async updatePosition(step: TourStep | null, target: HTMLElement, panel: HTMLElement, spotlight: HTMLElement) {
    const lengths = this.lengths()
    const rect = this.spotlightRect(target, lengths.padding)
    Object.assign(spotlight.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    // The spotlight animates between steps, so the panel is placed against the rectangle it is heading for.
    const reference: VirtualElement = { getBoundingClientRect: () => rect, contextElement: target }
    const arrowElement = this.arrowElement
    const arrowSize = arrowElement ? lengths.arrow : 0
    const middleware = [offset(lengths.offset + arrowSize / 2), flip({ padding: 8 }), shift({ padding: 8 })]
    if (arrowElement && arrowSize > 0) middleware.push(arrow({ element: arrowElement, padding: 8 }))
    const { x, y, placement, middlewareData } = await computePosition(reference, panel, {
      placement: step?.placement || this.placement,
      strategy: 'fixed',
      middleware,
    })
    if (this.shownTarget !== target) return
    panel.style.left = `${x}px`
    panel.style.top = `${y}px`
    panel.dataset.placement = placement
    if (arrowElement && middlewareData.arrow) {
      const side = placement.split('-')[0] as 'top' | 'right' | 'bottom' | 'left'
      const staticSide = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }[side]
      const { x: ax, y: ay } = middlewareData.arrow
      Object.assign(arrowElement.style, {
        left: ax != null ? `${ax}px` : '',
        top: ay != null ? `${ay}px` : '',
        right: '',
        bottom: '',
        [staticSide]: `${-arrowSize / 2}px`,
      })
    }
  }

  private show() {
    const panel = this.panel
    const spotlight = this.spotlight
    if (!panel || !spotlight || panel.matches(':popover-open')) return
    try {
      // The spotlight first, so the panel stacks above it in the top layer.
      spotlight.showPopover()
      panel.showPopover()
    } catch {
      return /* not connected yet */
    }
    this.returnFocus = deepActiveElement()
    document.addEventListener('keydown', this.handleDocumentKeydown)
    this.enterStep(this.currentStep)
    this.nextButton?.focus()
    this.dispatchEvent(new Event('show'))
  }

  private hide() {
    const panel = this.panel
    this.stopPositioning()
    document.removeEventListener('keydown', this.handleDocumentKeydown)
    this.shownStep = null
    this.shownTarget = null
    if (!panel?.matches(':popover-open')) return
    const focused = deepActiveElement()
    const hadFocus = !!focused && (this.renderRoot.contains(focused) || this.contains(focused))
    try {
      panel.hidePopover()
      this.spotlight?.hidePopover()
    } catch {
      /* already hidden */
    }
    if (hadFocus || document.activeElement === document.body) this.returnFocus?.focus()
    this.returnFocus = null
    this.dispatchEvent(new Event('hide'))
  }

  override updated(changed: PropertyValues<this>) {
    if (isServer) return
    // Every update, not only when `open` changes: the steps of an open tour may be added after it.
    if (this.open && this.steps.length) this.show()
    else this.hide()
    if (!this.open || !this.panel?.matches(':popover-open')) return
    const step = this.currentStep
    if (step !== this.shownStep || this.visibleTarget(step) !== this.shownTarget) this.enterStep(step)
    else if (changed.has('placement') && this.shownTarget && this.panel && this.spotlight) {
      void this.updatePosition(step, this.shownTarget, this.panel, this.spotlight)
    }
  }

  override render() {
    const steps = this.steps
    const index = this.currentIndex(steps)
    const step = steps[index] ?? null
    const last = index >= steps.length - 1
    const heading = step?.heading ?? ''
    return html`
      <slot name="trigger" ${assignSlot(this.triggers)} @click=${() => !this.open && this.start()}></slot>
      <span class="measure" aria-hidden="true"></span>
      <div class="spotlight" part="spotlight" popover="manual" aria-hidden="true"></div>
      <div
        class="panel"
        part="panel"
        popover="manual"
        role="dialog"
        aria-labelledby=${heading ? 'heading' : nothing}
        aria-label=${heading ? nothing : this.msg.t('label')}
        aria-describedby="body"
        @keydown=${this.handleKeydown}
      >
        <span class="arrow" part="arrow"></span>
        <div class="content" aria-live="polite">
          <div class="header" part="header">
            <div class="heading" part="heading" id="heading" ?hidden=${!heading}>${heading}</div>
            <button class="close" part="close" type="button" aria-label=${this.msg.t('close')} @click=${() => this.skip()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="body" part="body" id="body">
            <slot name="step" ${assignSlot(step ? [step] : [])}></slot>
          </div>
        </div>
        <div class="footer" part="footer">
          <span class="progress" part="progress">${steps.length > 1 ? this.msg.t('progress', index + 1, steps.length) : nothing}</span>
          <button class="button skip" part="skip" type="button" ?hidden=${last} @click=${() => this.skip()}>${this.msg.t('skip')}</button>
          <button class="button previous" part="previous" type="button" ?hidden=${index === 0} @click=${this.handlePrevious}>${this.msg.t('previous')}</button>
          <button class="button next" part="next" type="button" @click=${() => this.next()}>${last ? this.msg.t('done') : this.msg.t('next')}</button>
        </div>
      </div>
    `
  }

  constructor() {
    super()
    // A declarative shadow root (server-rendered) routes by `slot` attribute and ignores `assignSlot`; fall back to
    // writing it on the shown step only, from the first update on.
    if (isServer || !this.shadowRoot || this.shadowRoot.slotAssignment === 'manual') return
    this.addController({
      hostUpdated: () => {
        const step = this.open ? this.currentStep : null
        for (const child of this.steps) {
          if (child === step) child.setAttribute('slot', 'step')
          else if (child.getAttribute('slot') === 'step') child.removeAttribute('slot')
        }
      },
    })
  }

  override firstUpdated() {
    this.autostartFromProgress()
  }
}

const DURATION_UNITS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }

/** `30m`, `12h`, `7d`, `2w` or a bare number of days, in milliseconds; anything else is 0. */
function parseDuration(value: string): number {
  const match = /^\s*(\d+(?:\.\d+)?)\s*([mhdw])?\s*$/i.exec(value)
  return match ? Number(match[1]) * DURATION_UNITS[(match[2] ?? 'd').toLowerCase()] : 0
}

function deepActiveElement(): HTMLElement | null {
  let active = document.activeElement
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  return active instanceof HTMLElement ? active : null
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tour': Tour
  }
}
