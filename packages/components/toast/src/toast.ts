import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { ToastController, type ToastOptions, type ToastDismissReason } from './toast-controller.js'
import styles from './toast.scss?inline'
import regionStyles from './toast-region.scss?inline'

export type ToastAnimation = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'scale'

export type { ToastOptions, ToastRecord, ToastVariant, ToastDismissReason } from './toast-controller.js'

/**
 * A notification card. Use c2-toast-region to manage stacking, queueing and timed dismissal.
 * @tag c2-toast
 * @slot default - Message content, replacing message.
 * @slot icon - Leading icon, with a variant-specific SVG default.
 * @slot action - Custom action content, replacing the action-label button.
 * @slot close-icon - Replaces the dismiss button icon.
 * @event {CustomEvent} toast-close - Dismiss requested by the close button or Escape; detail contains reason.
 * @event {CustomEvent} toast-action - The action-label button was activated.
 * @cssproperty {color} [--c2-toast__container--background=#ffffff]
 * @cssproperty {color} [--c2-toast__container--color=#18181b]
 * @cssproperty {border} [--c2-toast__container--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-toast__container--border-radius=10px]
 * @cssproperty {padding} [--c2-toast__container--padding=14px 16px]
 * @cssproperty {pixel} [--c2-toast__container--gap=12px]
 * @cssproperty {box-shadow} [--c2-toast__container--box-shadow=0 4px 16px rgba(0, 0, 0, 0.1)]
 * @cssproperty {font-family} [--c2-toast__container--font-family=inherit]
 * @cssproperty {font-size} [--c2-toast__container--font-size=14px]
 * @cssproperty {line-height} [--c2-toast__container--line-height=1.5]
 * @cssproperty {font-weight} [--c2-toast__heading--font-weight=600]
 * @cssproperty {align-self} [--c2-toast__icon--align-self=center]
 * @cssproperty {pixel} [--c2-toast__progress--height=3px]
 * @cssproperty {color} [--c2-toast__progress--color=#2563eb]
 * @cssproperty {color} [--c2-toast__progress--background=rgba(37, 99, 235, 0.15)]
 * @cssproperty {pixel} [--c2-toast__icon--size=20px]
 * @cssproperty {color} [--c2-toast__icon--color=#71717a]
 * @cssproperty {color} [--c2-toast__icon__info--color=#2563eb]
 * @cssproperty {color} [--c2-toast__icon__success--color=#15803d]
 * @cssproperty {color} [--c2-toast__icon__warning--color=#a16207]
 * @cssproperty {color} [--c2-toast__icon__error--color=#dc2626]
 * @cssproperty {color} [--c2-toast__action--color=#2563eb]
 * @cssproperty {color} [--c2-toast__close--color=#71717a]
 * @cssproperty {color} [--c2-toast__close__hover--background=#f4f4f5]
 * @cssproperty {outline} [--c2-toast__button__focus--outline=2px solid #476ef9]
 */
@customElement('c2-toast')
export class Toast extends LitElement {
  static override styles = unsafeCSS(styles)
  /** Plain-text message; the default slot can replace it. */
  @property() message = ''
  /** Optional title above the message. */
  @property() heading = ''
  /** Semantic icon variant. */
  @property({ reflect: true }) variant: 'neutral' | 'info' | 'success' | 'warning' | 'error' = 'neutral'
  /** Hides the leading icon and removes its space from the layout. */
  @property({ type: Boolean, attribute: 'no-icon' }) noIcon = false
  /** Displays a countdown bar. Managed toasts receive progress from their region. */
  @property({ type: Boolean, attribute: 'show-progress' }) showProgress = false
  /** Remaining fraction from 0 to 1. Standalone cards display this value without starting a timer. */
  @property({ type: Number }) progress = 1
  /** Shows a keyboard-accessible dismiss button. */
  @property({ type: Boolean }) dismissible = false
  /** Label for the optional action button. */
  @property({ attribute: 'action-label' }) actionLabel = ''
  /** Accessible name of the dismiss button. */
  @property({ attribute: 'close-label' }) closeLabel = 'Dismiss notification'
  /** Set by a region to prevent duplicate announcements. */
  @property({ type: Boolean }) managed = false

  /** Requests dismissal. Standalone toasts are hidden; a region removes managed toasts. */
  dismiss() {
    this.dispatchEvent(new CustomEvent('toast-close', { bubbles: true, composed: true, detail: { reason: 'close' } }))
    if (!this.managed) this.hidden = true
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.dismissible && !event.defaultPrevented) {
      event.stopPropagation()
      this.dismiss()
    }
  }

  private renderIcon() {
    const mark =
      this.variant === 'success'
        ? html`<path d="m7 12 3 3 7-7"></path>`
        : this.variant === 'error'
          ? html`<path d="m9 9 6 6m0-6-6 6"></path>`
          : html`<path d="M12 11v5m0-9v1"></path>`
    return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"></circle>
      ${mark}
    </svg>`
  }

  override render() {
    return html`<div class="toast" part="container" role=${this.managed ? nothing : 'status'} aria-atomic="true" @keydown=${this.handleKeydown}>
      ${this.noIcon ? nothing : html`<span class="icon" part="icon" aria-hidden="true"><slot name="icon">${this.renderIcon()}</slot></span>`}
      <div class="content">
        ${this.heading ? html`<div class="heading" part="heading">${this.heading}</div>` : nothing}
        <div part="message"><slot>${this.message}</slot></div>
        <slot name="action"
          >${this.actionLabel ? html`<button type="button" class="action" part="action" @click=${() => this.dispatchEvent(new CustomEvent('toast-action', { bubbles: true, composed: true }))}>${this.actionLabel}</button>` : nothing}</slot
        >
      </div>
      ${
        this.dismissible
          ? html`<button type="button" class="close" part="close" aria-label=${this.closeLabel} @click=${this.dismiss}>
              <slot name="close-icon"
                ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"></path></svg
              ></slot>
            </button>`
          : nothing
      }
      ${this.showProgress ? html`<div class="progress" part="progress" aria-hidden="true"><div class="progress__bar" part="progress-bar" style=${styleMap({ transform: `scaleX(${Number.isFinite(this.progress) ? Math.max(0, Math.min(1, this.progress)) : 1})` })}></div></div>` : nothing}
    </div>`
  }
}

/**
 * Fixed notification stack with a FIFO overflow queue and independent visible lifetimes.
 * @tag c2-toast-region
 * @internalcomponent c2-toast
 * @event {CustomEvent} toast-dismiss - A toast was removed; detail contains id, toast and reason.
 * @event {CustomEvent} toast-action - Action activated; detail contains id and toast. The toast is then dismissed.
 * @cssproperty {pixel} [--c2-toast-region__container--width=360px]
 * @cssproperty {pixel} [--c2-toast-region__container--gap=12px]
 * @cssproperty {pixel} [--c2-toast-region__container--offset=20px]
 * @cssproperty {number} [--c2-toast-region__container--z-index=1000]
 */
@customElement('c2-toast-region')
export class ToastRegion extends LitElement {
  static override styles = unsafeCSS(regionStyles)
  /** Viewport corner or center edge at which notifications appear. */
  @property({ reflect: true }) position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' = 'bottom-right'
  /** Maximum visible notifications; the rest wait without running their timers. */
  @property({ type: Number, attribute: 'max-visible' }) maxVisible = 3
  /** Accessible region name. */
  @property() label = 'Notifications'
  /** Inline layout for embedded notification stacks. */
  @property({ type: Boolean, reflect: true }) inline = false

  /** Entrance effect. Directions describe movement: slide-down enters from above. */
  @property({ attribute: 'enter-animation' }) enterAnimation: ToastAnimation = 'slide-up'
  /** Exit effect. Directions describe movement: slide-right exits toward the right. */
  @property({ attribute: 'exit-animation' }) exitAnimation: ToastAnimation = 'fade'
  /** Entrance and exit duration in milliseconds. Zero disables animation. */
  @property({ type: Number, attribute: 'animation-duration' }) animationDuration = 200

  /** Shows a remaining-time bar on timed notifications by default; set false to hide it. */
  @property({ type: Boolean, attribute: 'show-progress' }) showProgress = true

  private progressFrame?: number
  private entered = new WeakSet<Element>()
  private animations = new Map<Element, Animation>()
  private exits = new Map<string, Animation>()
  private controller = new ToastController(
    (toast, reason) => {
      this.dispatchEvent(new CustomEvent('toast-dismiss', { bubbles: true, composed: true, detail: { id: toast.id, toast, reason } }))
    },
    (toast) => this.animateExit(toast.id),
  )
  private unsubscribe?: () => void
  private visibilityChanged = () => {
    if (this.ownerDocument.hidden) this.controller.pause('hidden')
    else this.controller.resume('hidden')
  }

  constructor() {
    super()
    this.controller.pause('disconnected')
  }

  override connectedCallback() {
    super.connectedCallback()
    if (isServer) return
    this.unsubscribe = this.controller.subscribe(() => {
      for (const [id, animation] of this.exits) {
        if (!this.controller.isClosing(id)) {
          animation.cancel()
          this.exits.delete(id)
        }
      }
      this.requestUpdate()
    })
    this.controller.maxVisible = this.maxVisible
    this.visibilityChanged()
    this.controller.resume('disconnected')
    this.ownerDocument.addEventListener('visibilitychange', this.visibilityChanged)
  }
  override disconnectedCallback() {
    super.disconnectedCallback()
    if (isServer) return
    this.controller.pause('disconnected')
    if (this.progressFrame !== undefined) this.ownerDocument.defaultView?.cancelAnimationFrame(this.progressFrame)
    this.progressFrame = undefined
    this.animations.forEach((animation) => animation.cancel())
    this.animations.clear()
    this.controller.resume('hover')
    this.controller.resume('focus')
    this.unsubscribe?.()
    this.ownerDocument.removeEventListener('visibilitychange', this.visibilityChanged)
  }
  protected override updated(changed: PropertyValues) {
    if (changed.has('maxVisible')) this.controller.maxVisible = this.maxVisible
    if (!this.renderRoot.querySelector(':focus-within')) this.controller.resume('focus')
    this.updateProgress()
    for (const element of this.renderRoot.querySelectorAll('c2-toast')) {
      if (this.entered.has(element)) continue
      this.entered.add(element)
      if (!this.controller.isClosing(element.dataset.toastId!)) this.animateToast(element, this.enterAnimation, false)
    }
  }

  private updateProgress = () => {
    const view = this.ownerDocument?.defaultView
    if (this.progressFrame !== undefined) view?.cancelAnimationFrame(this.progressFrame)
    this.progressFrame = undefined
    if (!this.isConnected || !view) return
    let running = false
    for (const element of this.renderRoot.querySelectorAll('c2-toast')) {
      if (!element.showProgress) continue
      const timing = this.controller.getTiming(element.dataset.toastId!)
      if (!timing || timing.duration <= 0) continue
      element.progress = timing.remaining / timing.duration
      running ||= timing.running
    }
    if (running) this.progressFrame = view.requestAnimationFrame(this.updateProgress)
  }

  private animateToast(element: HTMLElement, effect: ToastAnimation, exiting: boolean): Animation | undefined {
    this.animations.get(element)?.cancel()
    const duration = Number.isFinite(this.animationDuration) ? Math.max(0, this.animationDuration) : 200
    if (
      !this.isConnected ||
      effect === 'none' ||
      !duration ||
      this.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !element.animate
    )
      return
    const transforms: Record<string, string> = {
      'slide-up': `translateY(${exiting ? '-' : ''}24px)`,
      'slide-down': `translateY(${exiting ? '' : '-'}24px)`,
      'slide-left': `translateX(${exiting ? '-' : ''}24px)`,
      'slide-right': `translateX(${exiting ? '' : '-'}24px)`,
      scale: 'scale(0.9)',
    }
    const hidden = { opacity: 0, transform: transforms[effect] ?? 'none' }
    const visible = { opacity: 1, transform: 'none' }
    const animation = element.animate(exiting ? [visible, hidden] : [hidden, visible], {
      duration,
      easing: exiting ? 'ease-in' : 'ease-out',
      fill: exiting ? 'forwards' : 'backwards',
    })
    this.animations.set(element, animation)
    void animation.finished
      .catch(() => {})
      .finally(() => {
        if (this.animations.get(element) === animation) this.animations.delete(element)
      })
    return animation
  }

  private animateExit(id: string): Promise<unknown> | undefined {
    const element = Array.from(this.renderRoot.querySelectorAll('c2-toast')).find((element) => element.dataset.toastId === id)
    if (!element) return
    const animation = this.animateToast(element, this.exitAnimation, true)
    if (!animation) return
    this.exits.set(id, animation)
    return animation.finished
      .catch(() => {})
      .finally(() => {
        if (this.exits.get(id) === animation) this.exits.delete(id)
      })
  }

  /** Number of notifications waiting for a visible slot. */
  get queuedCount() {
    return this.controller.queuedCount
  }
  /** Number of visible and queued notifications. */
  get count() {
    return this.controller.count
  }
  /** Adds a notification or updates the one with the same ID. Returns its ID. */
  show(options: ToastOptions): string {
    return this.controller.show(options)
  }
  /** Updates content in place and restarts its visible lifetime. */
  updateToast(id: string, options: Partial<Omit<ToastOptions, 'id'>>): boolean {
    return this.controller.update(id, options)
  }
  /** Removes a visible or queued toast. */
  dismiss(id: string, reason: ToastDismissReason = 'programmatic'): boolean {
    return this.controller.dismiss(id, reason)
  }
  /** Removes all visible and queued notifications and cancels their timers. */
  clear() {
    this.controller.clear()
  }
  /** Pauses all visible timers until resume is called. */
  pause() {
    this.controller.pause()
  }
  resume() {
    this.controller.resume()
  }

  private handleFocusout() {
    queueMicrotask(() => {
      if (!this.renderRoot.querySelector(':focus-within')) this.controller.resume('focus')
    })
  }
  private handleAction(event: Event, id: string) {
    event.stopPropagation()
    const toast = this.controller.visible.find((item) => item.id === id)
    if (!toast) return
    this.dispatchEvent(new CustomEvent('toast-action', { bubbles: true, composed: true, detail: { id, toast } }))
    this.dismiss(id, 'action')
  }

  override render() {
    return html`<section
      aria-label=${this.label}
      @mouseenter=${() => this.controller.pause('hover')}
      @mouseleave=${() => this.controller.resume('hover')}
      @focusin=${() => this.controller.pause('focus')}
      @focusout=${this.handleFocusout}
    >
      <div class="stack" part="stack" aria-live="polite" aria-relevant="additions text" aria-atomic="false">
        ${repeat(
          this.controller.visible,
          (item) => item.id,
          (item) =>
            html`<c2-toast
              managed
              data-toast-id=${item.id}
              ?inert=${this.controller.isClosing(item.id)}
              .message=${item.message}
              .heading=${item.heading}
              .variant=${item.variant}
              .noIcon=${item.noIcon}
              .showProgress=${item.duration > 0 && (item.showProgress ?? this.showProgress)}
              .dismissible=${item.dismissible}
              .actionLabel=${item.actionLabel}
              @toast-close=${(event: Event) => {
                event.stopPropagation()
                this.dismiss(item.id, 'close')
              }}
              @toast-action=${(event: Event) => this.handleAction(event, item.id)}
            ></c2-toast>`,
        )}
      </div>
    </section>`
  }
}

let defaultRegion: ToastRegion | undefined
/** Creates a shared region on first use. Safe to import during SSR; call only in a browser. */
export function getToastRegion(): ToastRegion {
  if (typeof document === 'undefined' || !document.body) throw new Error('Toast notifications require a document body.')
  if (!defaultRegion?.isConnected) {
    defaultRegion = document.createElement('c2-toast-region')
    document.body.append(defaultRegion)
  }
  return defaultRegion
}

/** Convenience manager for the shared region. Use an explicit ToastRegion for scoped stacks. */
export const toast = {
  show: (options: ToastOptions) => getToastRegion().show(options),
  update: (id: string, options: Partial<Omit<ToastOptions, 'id'>>) => defaultRegion?.updateToast(id, options) ?? false,
  dismiss: (id: string) => defaultRegion?.dismiss(id) ?? false,
  clear: () => defaultRegion?.clear(),
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-toast': Toast
    'c2-toast-region': ToastRegion
  }
}
