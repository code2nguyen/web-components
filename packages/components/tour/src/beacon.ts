import { html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { autoUpdate, computePosition, hide, offset } from '@floating-ui/dom'
import { Tour, type TourEventMap } from './tour.js'
import type { TourStep } from './tour-step.js'
import styles from './beacon.scss?inline'

/** Detail of the `dismiss` event. */
export interface BeaconDismissDetail {
  /** Index of the dismissed tip among the `c2-tour-step` children. */
  index: number
  /** The key the tip is remembered under: the step's `id`, else its index. */
  key: string
}

/** Events fired by {@link Beacon}, keyed for `addEventListener`. */
export interface BeaconEventMap extends TourEventMap {
  dismiss: CustomEvent<BeaconDismissDetail>
}

export interface Beacon {
  addEventListener: TypedAddEventListener<Beacon, BeaconEventMap>
  removeEventListener: TypedRemoveEventListener<Beacon, BeaconEventMap>
}

interface Dot {
  element: HTMLElement
  target: HTMLElement
  /** Stops following the target. */
  stop: () => void
}

/**
 * Hotspots: a pulsing dot on each element worth a word, which opens a short explanation when clicked. Unlike a
 * `c2-tour`, the tips stand alone: there is no order, no progress and no dimming, and several dots show at once. Use
 * it to point at a new feature in place without interrupting the user.
 *
 * Each tip is a `c2-tour-step` child naming its `target` (a CSS selector), a `heading` and the explanation as its
 * content, as in a tour. Its dot sits on the target's top end corner (`--c2-beacon__dot--translate` moves it) and
 * follows it as the page scrolls; a target that is not rendered or scrolled out of view shows no dot, and a target
 * added to the page later gets its dot then. Clicking the dot opens the tip in the tour's panel, beside a ring around
 * the target. "Got it" dismisses the tip: its dot goes away and focus moves to the target. The close button, Escape, a
 * click outside and a second click on the dot close the tip and keep the dot.
 *
 * With a `storage-key`, the dismissed tips are remembered in `localStorage` (`{ "dismissed": ["tip-export", "2"] }`),
 * so a dot dismissed once never comes back on that browser; `reset()` forgets them. A tip is remembered by its step's
 * `id`, else by its index: give each step an `id` (not the one its target has) so the memory survives adding or
 * reordering tips. Without a `storage-key`, a dismissed tip stays dismissed until the page reloads.
 *
 * The dots are buttons in the top layer, in the tab order where the `c2-beacon` sits: place it next to the content it
 * explains. Nothing opens or takes focus by itself. The panel is the tour's, styled by the same `--c2-tour--*`
 * variables and parts. Of the tour's API, `open`, `current`, `placement`, `storage-key`, `start()` and `reset()` apply;
 * `autostart`, `skip-limit`, `skip-delay`, the `step-change`, `finish` and `skip` events and the `progress`, `skip`,
 * `previous` and `next` parts do not, and the `trigger` slot opens the first tip.
 *
 * @tag c2-beacon
 *
 * @event {CustomEvent<BeaconDismissDetail>} dismiss - The user dismissed a tip with Got it, or `dismiss()` was called. `detail.index` is the tip, `detail.key` what it is remembered under.
 *
 * @csspart beacon - Each pulsing dot: the button over a tip's target that opens it.
 * @csspart dismiss - The Got it button in the open tip's footer, which dismisses the tip for good.
 *
 * @cssproperty {pixel} [--c2-beacon__dot--size=12px] - Diameter of the dot.
 * @cssproperty {pixel} [--c2-beacon__dot--hit-size=24px] - Side of the clickable area around the dot; keep it at 24px or more for touch.
 * @cssproperty {color} [--c2-beacon__dot--color=rgb(2, 101, 220)] - Fill of the dot and of its pulse.
 * @cssproperty {color} [--c2-beacon__dot--border-color=#ffffff] - Ring that separates the dot from the target under it.
 * @cssproperty {pixel} [--c2-beacon__dot--border-width=2px]
 * @cssproperty {box-shadow} [--c2-beacon__dot--box-shadow=0 1px 3px rgba(24, 24, 27, 0.3)]
 * @cssproperty {translate} [--c2-beacon__dot--translate=0px 0px] - Moves the dot from the target's top end corner, e.g. `-12px 12px` to sit inside it.
 * @cssproperty {outline} [--c2-beacon__dot__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {number} [--c2-beacon__pulse--scale=2.5] - How far the pulse grows, as a multiple of the dot.
 * @cssproperty {time} [--c2-beacon__pulse--duration=1.6s] - Length of one pulse. The dot does not pulse while its tip is open or when the user prefers reduced motion.
 * @cssproperty {color} [--c2-beacon__backdrop--color=transparent] - Dimming of the page around an open tip; the tour's own default dims, a beacon does not.
 *
 * @slotcomponent c2-tour-step
 */
@customElement('c2-beacon')
export class Beacon extends Tour {
  static override styles = [Tour.styles, unsafeCSS(styles)]

  private readonly dots = new Map<TourStep, Dot>()
  private readonly dismissedHere = new Set<string>()
  /** What is stored under `storage-key`, read once per key. */
  private stored: { key: string; dismissed: string[] } | null = null
  /** The dot that opened the tip: focus goes back to it when the tip closes. */
  private openedFrom: HTMLElement | null = null
  /** Notices a target added to the page after the beacon drew, or replaced by a re-render. */
  private readonly targetObserver = isServer ? null : new MutationObserver(() => this.targetsMoved() && this.requestUpdate())
  private observingTargets = false

  override connectedCallback() {
    super.connectedCallback()
    // Removing the element closed its dots; show them again where it lands.
    if (this.hasUpdated) this.requestUpdate()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.clearDots()
    this.observeTargets(false)
    document.removeEventListener('pointerdown', this.handleOutsidePointer)
  }

  /** The keys of the dismissed tips: those stored under `storage-key`, and those dismissed since the page loaded. */
  get dismissed(): string[] {
    return [...new Set([...this.storedDismissed(), ...this.dismissedHere])]
  }

  private storedDismissed(): string[] {
    if (!this.storageKey || isServer) return []
    if (this.stored?.key === this.storageKey) return this.stored.dismissed
    const dismissed: string[] = []
    try {
      const stored = JSON.parse(localStorage.getItem(this.storageKey) ?? 'null') as { dismissed?: unknown } | null
      if (Array.isArray(stored?.dismissed)) for (const key of stored.dismissed) if (typeof key === 'string') dismissed.push(key)
    } catch {
      /* storage blocked or the value is not ours */
    }
    this.stored = { key: this.storageKey, dismissed }
    return dismissed
  }

  /** Dismisses tip `index` (the open one by default) for good: closes it, removes its dot and remembers it. */
  dismiss(index = this.openIndex()) {
    const step = this.steps[index]
    if (!step) return
    const key = stepKey(step, index)
    this.dismissedHere.add(key)
    if (this.storageKey) {
      // Read again: another beacon or tab may have stored tips under the same key since.
      this.stored = null
      try {
        localStorage.setItem(this.storageKey, JSON.stringify({ dismissed: this.dismissed }))
      } catch {
        /* storage blocked or full: the tip stays dismissed until the page reloads */
      }
    }
    if (this.open && this.openIndex() === index) {
      // Its dot is about to go: send focus to what the tip was about instead.
      if (!this.returnFocus || this.renderRoot.contains(this.returnFocus)) this.returnFocus = this.focusAfterDismiss(step, index)
      this.open = false
    }
    this.requestUpdate()
    this.dispatchEvent(new CustomEvent<BeaconDismissDetail>('dismiss', { detail: { index, key } }))
  }

  /** Forgets the dismissed tips, so every dot shows again. */
  override reset() {
    super.reset()
    this.dismissedHere.clear()
    this.stored = null
    this.requestUpdate()
  }

  /** Got it: dismisses the open tip. */
  override next() {
    this.dismiss()
  }

  /** Same as `next()`: a tip has no last step to finish. */
  override finish() {
    this.dismiss()
  }

  /** Closes the open tip and keeps its dot. Fires no `skip`. */
  override skip() {
    this.open = false
  }

  /** Tips stand alone: there is no previous one. */
  override previous() {}

  /** Tips stand alone: open another with `start(index)`. */
  override goTo(_index: number) {}

  protected override saveProgress() {
    /* a beacon stores dismissed tips, not a tour's progress */
  }

  override firstUpdated() {
    /* nothing opens by itself */
  }

  private openIndex() {
    const step = this.open ? this.currentStep : null
    return step ? this.steps.indexOf(step) : -1
  }

  private toggleTip(index: number, dot: HTMLElement) {
    if (this.openIndex() === index) return this.skip()
    // Named here rather than read from the focus: Safari does not focus a clicked button.
    this.openedFrom = dot
    this.start(index)
  }

  /** Where focus goes when the tip's dot goes away: the target when it takes focus, else the next dot shown. */
  private focusAfterDismiss(step: TourStep, index: number): HTMLElement | null {
    const target = step.targetElement
    if (target && !target.matches(':disabled') && (target.tabIndex >= 0 || target.shadowRoot?.delegatesFocus)) return target
    const others = [...this.renderRoot.querySelectorAll<HTMLElement>('.beacon:popover-open:not([data-hidden])')].filter(
      (dot) => Number(dot.dataset.index) !== index,
    )
    return others.find((dot) => Number(dot.dataset.index) > index) ?? others[0] ?? null
  }

  /** A click anywhere but the tip and the dots closes the tip, as a popup would. */
  private handleOutsidePointer = (event: PointerEvent) => {
    if (!event.composedPath().includes(this)) this.skip()
  }

  private clearDots() {
    for (const dot of this.dots.values()) removeDot(dot)
    this.dots.clear()
  }

  /** Shows a dot on each target found and follows it, and keeps looking for the targets that are missing. */
  private syncDots() {
    const live = new Set<TourStep>()
    let watch = false
    this.steps.forEach((step, index) => {
      const element = this.renderRoot.querySelector<HTMLElement>(`.beacon[data-index="${index}"]`)
      if (!element) return
      watch ||= !!step.target
      const target = step.targetElement
      if (!target) return
      live.add(step)
      const dot = this.dots.get(step)
      if (dot?.element === element && dot.target === target) return
      if (dot && dot.element !== element) removeDot(dot)
      else dot?.stop()
      if (!element.matches(':popover-open')) {
        try {
          element.showPopover()
        } catch {
          return /* not connected */
        }
      }
      this.dots.set(step, { element, target, stop: autoUpdate(target, element, () => void placeDot(target, element)) })
    })
    for (const [step, dot] of this.dots) {
      if (live.has(step)) continue
      removeDot(dot)
      this.dots.delete(step)
    }
    this.observeTargets(watch)
  }

  /**
   * Whether a shown tip's target is now another element: added after the beacon drew, or replaced by a re-render.
   * Run on every mutation of the page, so it only compares; the redraw follows only when it says so.
   */
  private targetsMoved() {
    const dismissed = new Set(this.dismissed)
    return this.steps.some((step, index) => !dismissed.has(stepKey(step, index)) && (this.dots.get(step)?.target ?? null) !== step.targetElement)
  }

  private observeTargets(on: boolean) {
    if (on === this.observingTargets || !this.targetObserver) return
    this.observingTargets = on
    if (!on) return this.targetObserver.disconnect()
    const roots = new Set<Node>([document, ...this.steps.map((step) => step.getRootNode())])
    for (const root of roots) this.targetObserver.observe(root, { childList: true, subtree: true })
  }

  override updated(changed: PropertyValues<this>) {
    if (isServer) return super.updated(changed)
    // The dots first, so an open tip's panel and spotlight stack above them in the top layer.
    this.syncDots()
    super.updated(changed)
    if (this.open && this.openedFrom) this.returnFocus = this.openedFrom
    this.openedFrom = null
    if (this.open) document.addEventListener('pointerdown', this.handleOutsidePointer)
    else document.removeEventListener('pointerdown', this.handleOutsidePointer)
  }

  protected override renderFooter() {
    return html`<div class="footer" part="footer">
      <button class="button next" part="dismiss" type="button" @click=${() => this.dismiss()}>${this.msg.t('dismiss')}</button>
    </div>`
  }

  override render() {
    const steps = this.steps
    const dismissed = new Set(this.dismissed)
    const open = this.openIndex()
    return html`${super.render()}${repeat(
      steps,
      (step) => step,
      (step, index) =>
        dismissed.has(stepKey(step, index))
          ? nothing
          : html`<button
              class="beacon"
              part="beacon"
              type="button"
              popover="manual"
              data-index=${index}
              aria-haspopup="dialog"
              aria-expanded=${open === index ? 'true' : 'false'}
              aria-label=${step.heading ? this.msg.t('beacon', step.heading) : this.msg.t('beaconUnnamed')}
              @click=${(event: Event) => this.toggleTip(index, event.currentTarget as HTMLElement)}
            ></button>`,
    )}`
  }
}

function removeDot(dot: Dot) {
  dot.stop()
  if (dot.element.isConnected && dot.element.matches(':popover-open')) dot.element.hidePopover()
}

function stepKey(step: TourStep, index: number) {
  return step.id || String(index)
}

/** Centres the dot on the target's top end corner, and hides it while the target is not rendered or clipped away. */
async function placeDot(target: HTMLElement, dot: HTMLElement) {
  const { x, y, middlewareData } = await computePosition(target, dot, {
    placement: 'top-end',
    strategy: 'fixed',
    middleware: [offset(({ rects }) => ({ mainAxis: -rects.floating.height / 2, alignmentAxis: -rects.floating.width / 2 })), hide()],
  })
  dot.style.left = `${x}px`
  dot.style.top = `${y}px`
  dot.toggleAttribute('data-hidden', !target.isConnected || !target.getClientRects().length || !!middlewareData.hide?.referenceHidden)
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-beacon': Beacon
  }
}
