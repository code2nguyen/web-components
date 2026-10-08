import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { computePosition, autoUpdate, flip, shift, offset, type Placement } from '@floating-ui/dom'
import styles from './popconfirm.scss?inline'

export type { Placement }

/** Events fired by {@link Popconfirm}, keyed for `addEventListener`. */
export interface PopconfirmEventMap {
  confirm: Event
  cancel: Event
  show: Event
  hide: Event
}

export interface Popconfirm {
  addEventListener: TypedAddEventListener<Popconfirm, PopconfirmEventMap>
  removeEventListener: TypedRemoveEventListener<Popconfirm, PopconfirmEventMap>
}

/**
 * Small "Are you sure?" popup anchored to the button that asked for it: delete a row, revoke a key, discard a draft.
 * The trigger goes in the `trigger` slot; clicking it opens the popup with a heading, an optional description and a
 * Cancel / OK pair. It asks for the one action that trigger stands for, so it suits a single destructive button; for a
 * decision that needs more room, or one not tied to a button, use `c2-modal`.
 *
 * The popup is a non-modal `alertdialog` in the top layer (`popover="manual"`), placed beside the trigger by floating-ui
 * and flipped when there is no room, so a scrolling or `overflow: hidden` ancestor never clips it. Opening it moves
 * focus to Cancel, the least destructive choice, so a stray Enter does not confirm.
 *
 * Every opening a user starts ends in exactly one `confirm` or `cancel` event: OK fires `confirm`; Cancel, Escape, a
 * click outside and moving focus elsewhere fire `cancel`. `confirm` is cancelable: call `preventDefault()` to keep the
 * popup open while the action runs, set `pending` to show it, then set `open` back to `false` when it is done. Setting
 * `open` from code fires `show` / `hide` only.
 *
 * Once opened, the trigger (or the button inside a `c2-*` trigger) carries `aria-haspopup="dialog"` and
 * `aria-expanded`. Nothing is written before the first opening, so server-rendered markup hydrates unchanged.
 *
 * @tag c2-popconfirm
 *
 * @slot trigger - The button that asks for confirmation. Clicking it toggles the popup.
 * @slot heading - The question, e.g. "Delete this task?". Overrides the `heading` attribute.
 * @slot - Optional description below the heading: what happens and whether it can be undone.
 * @slot icon - Icon beside the heading. Defaults to a warning sign; slot an empty element to remove it.
 *
 * @event {Event} confirm - The user chose OK. Cancelable: `preventDefault()` keeps the popup open.
 * @event {Event} cancel - The user dismissed the popup: Cancel, Escape, a click outside or focus moving away.
 * @event {Event} show - The popup opened.
 * @event {Event} hide - The popup closed.
 *
 * @csspart panel - The popup surface.
 * @csspart confirm - The OK button.
 * @csspart cancel - The Cancel button.
 * @csspart heading - The text region wrapping the `heading` slot; it shows the `heading` attribute as fallback and is hidden when both are empty.
 * @csspart description - The text region wrapping the default slot; it is hidden while nothing is assigned to it.
 * @csspart icon - The icon region wrapping the `icon` slot: the warning sign by default, or the assigned icon.
 *
 * @cssproperty {background-color} [--c2-popconfirm--background-color=#ffffff]
 * @cssproperty {color} [--c2-popconfirm--color=#18181b]
 * @cssproperty {border} [--c2-popconfirm--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-popconfirm--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-popconfirm--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {font-size} [--c2-popconfirm--font-size=14px]
 * @cssproperty {font-family} --c2-popconfirm--font-family
 * @cssproperty {line-height} [--c2-popconfirm--line-height=1.5]
 * @cssproperty {padding} [--c2-popconfirm--padding-top=12px]
 * @cssproperty {padding} [--c2-popconfirm--padding-right=16px]
 * @cssproperty {padding} [--c2-popconfirm--padding-bottom=12px]
 * @cssproperty {padding} [--c2-popconfirm--padding-left=16px]
 * @cssproperty {pixel} [--c2-popconfirm--max-width=320px]
 * @cssproperty {pixel} [--c2-popconfirm--offset=8px] - Distance between the trigger and the popup.
 * @cssproperty {time} [--c2-popconfirm--transition-duration=150ms]
 * @cssproperty {transform} [--c2-popconfirm--enter-transform=scale(0.96)] - Start of the enter animation.
 *
 * @cssproperty {display} [--c2-popconfirm__icon--display=flex] - `none` hides the icon.
 * @cssproperty {pixel} [--c2-popconfirm__icon--size=18px]
 * @cssproperty {color} [--c2-popconfirm__icon--color=#d97706]
 * @cssproperty {pixel} [--c2-popconfirm__body--gap=8px] - Space between the icon and the text.
 *
 * @cssproperty {color} [--c2-popconfirm__heading--color=#18181b]
 * @cssproperty {font-size} [--c2-popconfirm__heading--font-size=14px]
 * @cssproperty {font-weight} [--c2-popconfirm__heading--font-weight=600]
 * @cssproperty {color} [--c2-popconfirm__description--color=#71717a]
 * @cssproperty {font-size} [--c2-popconfirm__description--font-size=14px]
 *
 * @cssproperty {justify-content} [--c2-popconfirm__actions--justify-content=flex-end]
 * @cssproperty {pixel} [--c2-popconfirm__actions--gap=8px]
 * @cssproperty {pixel} [--c2-popconfirm__actions--margin-top=12px]
 *
 * @cssproperty {pixel} [--c2-popconfirm__button--height=28px]
 * @cssproperty {padding} [--c2-popconfirm__button--padding-left=12px]
 * @cssproperty {padding} [--c2-popconfirm__button--padding-right=12px]
 * @cssproperty {border-radius} [--c2-popconfirm__button--border-radius=6px]
 * @cssproperty {font-size} [--c2-popconfirm__button--font-size=14px]
 * @cssproperty {font-weight} [--c2-popconfirm__button--font-weight=500]
 * @cssproperty {outline} [--c2-popconfirm__button__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-popconfirm__button__focus--outline-offset=2px]
 *
 * @cssproperty {background-color} [--c2-popconfirm__cancel--background-color=#ffffff]
 * @cssproperty {color} [--c2-popconfirm__cancel--color=#18181b]
 * @cssproperty {border} [--c2-popconfirm__cancel--border=1px solid #d4d4d8]
 * @cssproperty {background-color} [--c2-popconfirm__cancel__hover--background-color=#f4f4f5]
 *
 * @cssproperty {background-color} [--c2-popconfirm__confirm--background-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-popconfirm__confirm--color=#ffffff]
 * @cssproperty {border} [--c2-popconfirm__confirm--border=1px solid transparent]
 * @cssproperty {background-color} [--c2-popconfirm__confirm__hover--background-color=rgb(1, 84, 184)]
 * @cssproperty {opacity} [--c2-popconfirm__confirm__pending--opacity=0.38] - OK while `pending`.
 */
@customElement('c2-popconfirm')
export class Popconfirm extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The question the popup asks. The `heading` slot overrides it. */
  @property() heading = ''

  /** Text of the button that confirms. */
  @property({ attribute: 'confirm-label' }) confirmLabel = 'OK'

  /** Text of the button that cancels. */
  @property({ attribute: 'cancel-label' }) cancelLabel = 'Cancel'

  /** Preferred side of the trigger; flips when there is no room. */
  @property({ reflect: true }) placement: Placement = 'top'

  /** Visible state. Set it to open or close the popup from code; that fires `show` / `hide` but no `confirm` or `cancel`. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Keeps the trigger from opening the popup. The trigger itself stays usable unless it is disabled too. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /**
   * The confirmed action is running: OK shows as busy and ignores clicks, Cancel and Escape still close. Set it from a
   * `confirm` listener that called `preventDefault()`, then close with `open = false`.
   */
  @property({ type: Boolean, reflect: true }) pending = false

  @query('.panel') private panel?: HTMLElement
  @query('.cancel') private cancelButton?: HTMLButtonElement

  @state() private hasHeading = false
  @state() private hasDescription = false

  private cleanupPosition: (() => void) | null = null
  private offsetObserver: MutationObserver | null = null
  private offsetValue = ''
  private ariaSynced = false

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.stopListening()
    this.stopPositioning()
  }

  /** The first element in the `trigger` slot. */
  get trigger(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > [slot="trigger"]')
  }

  private handleTriggerClick = () => {
    if (this.open) {
      this.dismiss(false)
      return
    }
    if (this.disabled) return
    this.open = true
    void this.updateComplete.then(() => this.cancelButton?.focus())
  }

  private handleConfirm = () => {
    if (this.pending) return
    const event = new Event('confirm', { cancelable: true })
    if (!this.dispatchEvent(event)) return
    this.open = false
    this.focusTrigger()
  }

  /** Closes as the user's choice not to go ahead. */
  private dismiss(returnFocus: boolean) {
    if (!this.open) return
    this.open = false
    this.dispatchEvent(new Event('cancel'))
    if (returnFocus) this.focusTrigger()
  }

  private handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    this.dismiss(true)
  }

  private handleDocumentPointerDown = (event: PointerEvent) => {
    if (event.composedPath().includes(this)) return
    this.dismiss(false)
  }

  private handleFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null
    // No related target: the window lost focus, or the click went to something unfocusable, which pointerdown handles.
    if (!next || next === this || this.contains(next) || this.renderRoot.contains(next)) return
    this.dismiss(false)
  }

  private focusTrigger() {
    const trigger = this.trigger
    if (!trigger) return
    trigger.focus()
  }

  private startListening() {
    document.addEventListener('pointerdown', this.handleDocumentPointerDown, true)
    this.addEventListener('focusout', this.handleFocusOut)
  }

  private stopListening() {
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true)
    this.removeEventListener('focusout', this.handleFocusOut)
  }

  /** `aria-haspopup` / `aria-expanded` belong on the element with the button role: inside a `c2-*` trigger, its control. */
  private async syncTriggerAria() {
    const trigger = this.trigger as (HTMLElement & { updateComplete?: Promise<unknown> }) | null
    if (!trigger) return
    if (trigger.updateComplete) await trigger.updateComplete
    const inner = trigger.localName.includes('-') ? trigger.shadowRoot?.querySelector<HTMLElement>('button, a, [role="button"]') : null
    const target = inner ?? trigger
    target.setAttribute('aria-haspopup', 'dialog')
    target.setAttribute('aria-expanded', String(this.open))
  }

  private readPixels(name: string, fallback: number) {
    const value = Number.parseFloat(getComputedStyle(this).getPropertyValue(name))
    return Number.isNaN(value) ? fallback : value
  }

  private startPositioning(panel: HTMLElement) {
    this.stopPositioning()
    const anchor = this.trigger ?? this
    this.cleanupPosition = autoUpdate(anchor, panel, () => void this.updatePosition(panel))
    // Floating UI observes layout, but an edit to the offset (an inline style, a class) need not resize either element.
    const offsetValue = () => getComputedStyle(this).getPropertyValue('--c2-popconfirm--offset')
    this.offsetValue = offsetValue()
    this.offsetObserver = new MutationObserver(() => {
      const next = offsetValue()
      if (next === this.offsetValue) return
      this.offsetValue = next
      void this.updatePosition(panel)
    })
    this.offsetObserver.observe(this, { attributes: true, attributeFilter: ['style', 'class'] })
  }

  private stopPositioning() {
    this.cleanupPosition?.()
    this.cleanupPosition = null
    this.offsetObserver?.disconnect()
    this.offsetObserver = null
  }

  private async updatePosition(panel: HTMLElement) {
    const { x, y, placement } = await computePosition(this.trigger ?? this, panel, {
      placement: this.placement,
      strategy: 'fixed',
      middleware: [offset(this.readPixels('--c2-popconfirm--offset', 8)), flip({ padding: 8 }), shift({ padding: 8 })],
    })
    panel.style.left = `${x}px`
    panel.style.top = `${y}px`
    panel.dataset.placement = placement
  }

  private show() {
    const panel = this.panel
    if (!panel || panel.matches(':popover-open')) return
    try {
      panel.showPopover()
    } catch {
      return /* not connected yet */
    }
    this.startPositioning(panel)
    this.startListening()
    this.dispatchEvent(new Event('show'))
  }

  private hide() {
    const panel = this.panel
    this.stopPositioning()
    this.stopListening()
    if (!panel?.matches(':popover-open')) return
    try {
      panel.hidePopover()
    } catch {
      /* already hidden */
    }
    this.dispatchEvent(new Event('hide'))
  }

  override updated(changed: PropertyValues<this>) {
    if (isServer) return
    if (changed.has('open')) {
      if (this.open) this.show()
      else this.hide()
      if (this.open) this.ariaSynced = true
      if (this.ariaSynced) void this.syncTriggerAria()
    }
    if (changed.has('placement') && this.open && this.panel) void this.updatePosition(this.panel)
  }

  private handleHeadingSlotChange(event: Event) {
    this.hasHeading = (event.target as HTMLSlotElement).assignedNodes({ flatten: true }).some(hasContent)
  }

  private handleDescriptionSlotChange(event: Event) {
    this.hasDescription = (event.target as HTMLSlotElement).assignedNodes({ flatten: true }).some(hasContent)
  }

  override render() {
    const labelled = this.hasHeading || this.heading
    return html`
      <slot name="trigger" @click=${this.handleTriggerClick}></slot>
      <div
        class="panel"
        part="panel"
        popover="manual"
        role="alertdialog"
        aria-labelledby=${labelled ? 'heading' : this.hasDescription ? 'description' : nothing}
        aria-describedby=${labelled && this.hasDescription ? 'description' : nothing}
        @keydown=${this.handleKeydown}
      >
        <div class="body">
          <span class="icon" part="icon" aria-hidden="true">
            <slot name="icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </slot>
          </span>
          <div class="text">
            <div class="heading" part="heading" id="heading" ?hidden=${!labelled}>
              <slot name="heading" @slotchange=${this.handleHeadingSlotChange}>${this.heading}</slot>
            </div>
            <div class="description" part="description" id="description" ?hidden=${!this.hasDescription}>
              <slot @slotchange=${this.handleDescriptionSlotChange}></slot>
            </div>
          </div>
        </div>
        <div class="actions">
          <button class="button cancel" part="cancel" type="button" @click=${() => this.dismiss(true)}>${this.cancelLabel}</button>
          <button
            class="button confirm"
            part="confirm"
            type="button"
            aria-disabled=${this.pending ? 'true' : nothing}
            aria-busy=${this.pending ? 'true' : nothing}
            @click=${this.handleConfirm}
          >
            ${this.confirmLabel}
          </button>
        </div>
      </div>
    `
  }
}

function hasContent(node: Node) {
  return node.nodeType === Node.ELEMENT_NODE || !!node.textContent?.trim()
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-popconfirm': Popconfirm
  }
}
