import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { classMap } from 'lit/directives/class-map.js'
import { keyed } from 'lit/directives/keyed.js'
import { styleMap } from 'lit/directives/style-map.js'
import { navigationProgressMessages } from './navigation-progress-messages.js'
import styles from './navigation-progress.scss?inline'

// Where a run starts, so the bar shows at once.
const START = 0.08
// Where trickling stops: the bar never fills until `done()`.
const CEILING = 0.994
// Time between two trickle steps, in milliseconds.
const TRICKLE_INTERVAL = 300

/**
 * The thin bar across the top of the page while a route changes or a request runs. `start()` shows it and trickles
 * it forward, in smaller and smaller steps that never reach the end; `done()` fills it and fades it out. The same
 * run is the `active` property, for a framework that binds a "navigating" flag instead of calling methods. Starting
 * again while the bar fades out begins a new run.
 *
 * Put one on the page. It draws across the top of the viewport in the top layer, above dialogs and anything
 * positioned; `contained` draws it at the top of the nearest positioned ancestor instead, for a panel or a frame
 * that loads on its own. The trickle is not a measure of the work: the bar is announced as a progress bar with a
 * name and no value. Use `c2-progress` for work whose share done is known.
 *
 * @tag c2-navigation-progress
 *
 * @csspart track - The strip across the top that holds the bar, as wide as the viewport (or the container).
 * @csspart indicator - The bar itself, growing from the start edge of the track.
 *
 * @cssproperty {pixel} [--c2-navigation-progress--height=3px] - Thickness of the bar.
 * @cssproperty {color} [--c2-navigation-progress__indicator--background-color=#0265dc] - Colour of the bar.
 * @cssproperty {shadow} [--c2-navigation-progress__indicator--box-shadow=none] - Glow under the bar, such as `0 0 8px #0265dc`.
 * @cssproperty {border-radius} [--c2-navigation-progress__indicator--border-radius=0] - Rounds the ends of the bar.
 * @cssproperty {time} [--c2-navigation-progress--animation-duration=200ms] - How long the bar takes to fade in, to move to its next step, and to fill on `done()`.
 * @cssproperty {time} [--c2-navigation-progress--fade-duration=400ms] - How long the full bar takes to fade out after `done()`.
 */
@customElement('c2-navigation-progress')
export class NavigationProgress extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Whether a run is under way: `true` shows the bar and trickles it forward, `false` fills it and fades it out. `start()` and `done()` set it. */
  @property({ type: Boolean }) active = false

  /** Draws the bar at the top of the nearest positioned ancestor instead of across the top of the viewport in the top layer. */
  @property({ type: Boolean }) contained = false

  /** Accessible name of the bar. Defaults to "Loading page" in the nearest `lang` (English, or a language the app adds). */
  @property() label = ''

  @state() private phase: 'idle' | 'running' | 'done' = 'idle'
  @state() private progress = 0

  // Counts runs, so a run that starts while the last one fades out draws a fresh bar instead of shrinking the full one.
  private run = 0
  private timer?: ReturnType<typeof setTimeout>
  private readonly msg = new LocalizeController(this, navigationProgressMessages)

  /** Shows the bar and starts trickling it forward. Does nothing while a run is under way. */
  start(): void {
    this.active = true
  }

  /** Fills the bar and fades it out. Does nothing when no run is under way. */
  done(): void {
    this.active = false
  }

  override connectedCallback(): void {
    super.connectedCallback()
    // Back in the page mid-run: carry on trickling, or finish the fade the removal interrupted.
    if (this.hasUpdated) this.sync()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    clearTimeout(this.timer)
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('active')) return
    if (this.active && this.phase !== 'running') {
      if (this.phase === 'done') this.run++
      this.phase = 'running'
      this.progress = START
    } else if (!this.active && this.phase === 'running') {
      this.phase = 'done'
      this.progress = 1
    }
  }

  protected override updated(): void {
    this.sync()
  }

  private get track(): HTMLElement | null {
    return this.renderRoot.querySelector('[part="track"]')
  }

  // Puts the bar in or out of the top layer and schedules what comes next in the run.
  private sync(): void {
    clearTimeout(this.timer)
    const track = this.track
    if (!track || !this.isConnected) return
    if (!this.contained && 'showPopover' in track) {
      const open = track.matches(':popover-open')
      if (this.phase === 'idle' && open) track.hidePopover()
      else if (this.phase !== 'idle' && !open) track.showPopover()
    }
    if (this.phase === 'running') {
      this.timer = setTimeout(() => this.trickle(), TRICKLE_INTERVAL)
    } else if (this.phase === 'done') {
      void this.finish(track, this.run)
    }
  }

  // Ends a run once the fill and the fade, two CSS transitions, have played: at once without any. A transition that
  // replaces another (the fade-in still running when `done()` came) cancels it, so the wait goes on until none is left.
  private async finish(track: HTMLElement, run: number): Promise<void> {
    // Only what is still to play: a finished animation that fills forwards stays in the list, a paused one never ends.
    const playing = () =>
      track
        .getAnimations({ subtree: true })
        .filter((animation) => (animation.playState === 'running' || animation.pending) && animation.effect?.getTiming().iterations !== Infinity)
    for (let animations = playing(); animations.length && this.run === run; animations = playing()) {
      await Promise.allSettled(animations.map((animation) => animation.finished))
    }
    if (this.phase === 'done' && this.run === run) {
      this.phase = 'idle'
      this.progress = 0
    }
  }

  // One step forward, smaller the further the bar has gone. Stops below the end, where no update means no next step.
  private trickle(): void {
    const at = this.progress
    this.progress = Math.min(CEILING, at + (at < 0.2 ? 0.1 : at < 0.5 ? 0.04 : at < 0.8 ? 0.02 : 0.005))
  }

  override render() {
    return html`
      <div
        class=${classMap({ track: true, 'is-done': this.phase === 'done', 'is-contained': this.contained })}
        part="track"
        popover=${this.contained ? nothing : 'manual'}
        ?hidden=${this.phase === 'idle'}
        role="progressbar"
        aria-label=${this.label || this.msg.t('loading')}
      >
        ${keyed(this.run, html`<div class="indicator" part="indicator" style=${styleMap({ width: `${this.progress * 100}%` })}></div>`)}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-navigation-progress': NavigationProgress
  }
}
