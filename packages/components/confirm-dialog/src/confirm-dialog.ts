import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/modal'
import '@c2n/button'
import type { Modal } from '@c2n/modal'
import type { Button } from '@c2n/button'
import styles from './confirm-dialog.scss?inline'

/** Events fired by {@link ConfirmDialog}, keyed for `addEventListener`. */
export interface ConfirmDialogEventMap {
  open: Event
  confirm: Event
  cancel: Event
  close: CustomEvent<{ confirmed: boolean }>
  'confirm-error': CustomEvent<{ error: unknown }>
}

export interface ConfirmDialog {
  addEventListener: TypedAddEventListener<ConfirmDialog, ConfirmDialogEventMap>
  removeEventListener: TypedRemoveEventListener<ConfirmDialog, ConfirmDialogEventMap>
}

/** Work run when the user confirms; the dialog stays open, its confirm button spinning, until it settles. */
export type ConfirmAction = () => unknown

/**
 * Asks the user to confirm an action before it happens. `await dialog.show()` (or the {@link confirm} helper, which
 * needs no markup) resolves `true` when the user confirms and `false` when they cancel, press Escape or the dialog is
 * closed by code. `destructive` paints the confirm button in the error colour and puts the initial focus on Cancel,
 * so Enter right after opening never deletes anything. Give it a `confirm-action` (`confirmAction` property) to run
 * the work from the dialog: the confirm button spins until it settles, and a failure keeps the dialog open for a retry.
 *
 * The dialog is a `c2-modal` announced as an `alertdialog` described by its message: a click on the backdrop does not
 * close it, Escape cancels it. Restyle the frame through the `--c2-modal…` variables, which reach the inner modal.
 *
 * @tag c2-confirm-dialog
 * @internalcomponent c2-modal
 * @internalcomponent c2-button
 *
 * @slot - Message; replaces the `message` attribute. The dialog is described by it.
 * @slot heading - Heading; replaces the `heading` attribute. The dialog is labelled by it.
 * @slot icon - Icon shown before the heading, coloured by `--c2-confirm-dialog__icon--color`.
 * @csspart modal - The inner `c2-modal`.
 * @csspart heading - Row wrapping the `icon` slot and the `heading` slot (or its `heading` attribute fallback).
 * @csspart message - Region wrapping the default slot (or its `message` attribute fallback).
 * @csspart cancel-button - The Cancel `c2-button`.
 * @csspart confirm-button - The confirm `c2-button`.
 *
 * @event {Event} open - Fired after the dialog has been shown.
 * @event {Event} confirm - Cancelable: fired when the user confirms, before the action runs and the dialog closes; `preventDefault()` keeps it open.
 * @event {Event} cancel - Fired when the dialog is dismissed without confirming: Cancel, Escape or `close(false)`.
 * @event {CustomEvent<{ confirmed: boolean }>} close - Fired after the dialog has closed; `detail.confirmed` is the answer `show()` resolves with.
 * @event {CustomEvent<{ error: unknown }>} confirm-error - Fired when `confirmAction` throws or rejects; the dialog stays open.
 *
 * @cssproperty {pixel} [--c2-confirm-dialog--width=min(420px, calc(100vw - 32px))] - Sets the inner modal's width.
 * @cssproperty {pixel} [--c2-confirm-dialog__heading--gap=12px] - Space between the icon and the heading.
 * @cssproperty {pixel} [--c2-confirm-dialog__icon--size=24px]
 * @cssproperty {color} [--c2-confirm-dialog__icon--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-confirm-dialog__icon__destructive--color=#dc2626]
 * @cssproperty {color} [--c2-confirm-dialog__message--color=#71717a]
 *
 * @cssproperty {border} [--c2-confirm-dialog__cancel-button--border=1px solid #bcbcc6]
 * @cssproperty {color} [--c2-confirm-dialog__cancel-button--background-color=#ffffff]
 * @cssproperty {color} [--c2-confirm-dialog__cancel-button--color=#18181b]
 * @cssproperty {color} [--c2-confirm-dialog__cancel-button__hover--background-color=#f4f4f5]
 * @cssproperty {border} [--c2-confirm-dialog__cancel-button__hover--border=1px solid #a1a1aa]
 *
 * @cssproperty {color} [--c2-confirm-dialog__confirm-button--background-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-confirm-dialog__confirm-button--color=#ffffff]
 * @cssproperty {color} [--c2-confirm-dialog__confirm-button__hover--background-color=rgb(1, 84, 184)]
 * @cssproperty {color} [--c2-confirm-dialog__confirm-button__active--background-color=rgb(1, 70, 154)]
 *
 * @cssproperty {color} [--c2-confirm-dialog__confirm-button__destructive--background-color=#dc2626]
 * @cssproperty {color} [--c2-confirm-dialog__confirm-button__destructive--color=#ffffff]
 * @cssproperty {color} [--c2-confirm-dialog__confirm-button__destructive__hover--background-color=#b91c1c]
 * @cssproperty {color} [--c2-confirm-dialog__confirm-button__destructive__active--background-color=#991b1b]
 * @cssproperty {outline} [--c2-confirm-dialog__confirm-button__destructive__focus--outline=2px solid rgba(220, 38, 38, 0.4)]
 */
@customElement('c2-confirm-dialog')
export class ConfirmDialog extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Open state. Setting it shows the dialog; clearing it closes the dialog as a cancel. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Heading text, when the `heading` slot is empty. */
  @property() heading = ''

  /** Message text, when the default slot is empty. */
  @property() message = ''

  /** Label of the button that confirms. */
  @property({ attribute: 'confirm-label' }) confirmLabel = 'Confirm'

  /** Label of the button that cancels. */
  @property({ attribute: 'cancel-label' }) cancelLabel = 'Cancel'

  /** The action cannot be undone: error-coloured confirm button, and the initial focus goes to Cancel. */
  @property({ type: Boolean, reflect: true }) destructive = false

  /**
   * Work to run when the user confirms. While its promise is pending the confirm button spins and the dialog cannot be
   * dismissed; it closes as confirmed when the promise resolves and stays open (firing `confirm-error`) when it rejects.
   */
  @property({ attribute: false }) confirmAction: ConfirmAction | undefined = undefined

  /** Whether `confirmAction` is running. */
  get running() {
    return this.busy
  }

  @query('c2-modal') private modal!: Modal
  @query('.c2-confirm-dialog__cancel') private cancelButton!: Button
  @query('.c2-confirm-dialog__confirm') private confirmButton!: Button

  private busy = false
  private pending: { promise: Promise<boolean>; resolve: (confirmed: boolean) => void } | undefined

  /** Opens the dialog and resolves with the answer: `true` when confirmed, `false` otherwise. */
  show(): Promise<boolean> {
    this.open = true
    return this.answer()
  }

  /** Closes the dialog with the given answer (`false` by default). */
  close(confirmed = false) {
    if (!this.open) return
    const returnValue = confirmed ? 'confirm' : 'cancel'
    if (this.modal?.open) this.modal.close(returnValue)
    else this.settle(confirmed)
  }

  private answer() {
    if (!this.pending) {
      let resolve!: (confirmed: boolean) => void
      const promise = new Promise<boolean>((r) => (resolve = r))
      this.pending = { promise, resolve }
    }
    return this.pending.promise
  }

  private settle(confirmed: boolean) {
    this.open = false
    this.setBusy(false)
    if (!confirmed) this.dispatchEvent(new Event('cancel', { bubbles: true, composed: true }))
    this.dispatchEvent(new CustomEvent('close', { detail: { confirmed }, bubbles: true, composed: true }))
    const pending = this.pending
    this.pending = undefined
    pending?.resolve(confirmed)
  }

  private setBusy(busy: boolean) {
    if (this.busy === busy) return
    this.busy = busy
    this.requestUpdate()
  }

  private async handleConfirm() {
    if (this.busy) return
    if (!this.dispatchEvent(new Event('confirm', { bubbles: true, composed: true, cancelable: true }))) return
    const action = this.confirmAction
    if (action) {
      this.setBusy(true)
      try {
        await action()
      } catch (error) {
        this.setBusy(false)
        this.dispatchEvent(new CustomEvent('confirm-error', { detail: { error }, bubbles: true, composed: true }))
        await this.updateComplete
        this.confirmButton?.focus()
        return
      }
      // Closed (or reopened) by code while the action ran: that answer stands.
      if (!this.busy) return
    }
    this.close(true)
  }

  private handleModalOpen = async (event: Event) => {
    event.stopPropagation()
    await this.updateComplete
    // Destructive: land on Cancel so a reflexive Enter does not run the action.
    ;(this.destructive ? this.cancelButton : this.confirmButton)?.focus()
    this.dispatchEvent(new Event('open', { bubbles: true, composed: true }))
  }

  private handleModalCancel = (event: Event) => {
    // Escape while the action runs would leave its outcome without an answer.
    if (this.busy) event.preventDefault()
  }

  private handleModalClose = (event: CustomEvent<{ returnValue: string }>) => {
    event.stopPropagation()
    if (!this.open) return
    this.settle(event.detail.returnValue === 'confirm')
  }

  override updated(changed: PropertyValues<this>) {
    if (!changed.has('open') || isServer) return
    if (this.open) {
      void this.answer()
    } else if (changed.get('open') && this.pending) {
      // Cleared from outside (attribute or property): the inner modal closes as part of this render, so answer here.
      this.modal?.close('cancel')
      this.settle(false)
    }
  }

  override render() {
    return html`
      <c2-modal
        part="modal"
        class="c2-confirm-dialog"
        alert
        hide-close
        no-backdrop-close
        ?no-escape=${this.busy}
        .open=${this.open}
        @open=${this.handleModalOpen}
        @cancel=${this.handleModalCancel}
        @close=${this.handleModalClose}
      >
        <div slot="title" part="heading" class="c2-confirm-dialog__heading">
          <slot name="icon"></slot>
          <span class="c2-confirm-dialog__heading-text"><slot name="heading">${this.heading}</slot></span>
        </div>
        <div part="message" class="c2-confirm-dialog__message"><slot>${this.message || nothing}</slot></div>
        <c2-button slot="footer" part="cancel-button" class="c2-confirm-dialog__cancel" ?disabled=${this.busy} @click=${() => this.close(false)}>
          ${this.cancelLabel}
        </c2-button>
        <c2-button slot="footer" part="confirm-button" class="c2-confirm-dialog__confirm" ?running=${this.busy} @click=${this.handleConfirm}>
          ${this.confirmLabel}
        </c2-button>
      </c2-modal>
    `
  }
}

/** Options of {@link confirm}: the attributes of `c2-confirm-dialog` as properties, plus where to mount it. */
export interface ConfirmOptions {
  heading: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** Runs on confirm; see `ConfirmDialog.confirmAction`. */
  action?: ConfirmAction
  /** Element the temporary dialog is appended to. Defaults to `document.body`. */
  container?: Element
}

/**
 * Asks for confirmation without any markup: mounts a temporary `c2-confirm-dialog`, opens it and resolves with the
 * answer, then removes the dialog once its closing transition has finished.
 *
 * ```ts
 * if (await confirm({ heading: 'Delete project?', message: 'This cannot be undone.', confirmLabel: 'Delete', destructive: true })) remove()
 * ```
 */
export async function confirm(options: ConfirmOptions): Promise<boolean> {
  const { container = document.body, action, ...attributes } = options
  const dialog = document.createElement('c2-confirm-dialog')
  // An option passed as `undefined` keeps the element's default rather than blanking it.
  Object.assign(dialog, Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== undefined)), { confirmAction: action })
  container.append(dialog)
  const confirmed = await dialog.show()
  const inner = dialog.shadowRoot?.querySelector('c2-modal')?.shadowRoot?.querySelector('dialog')
  void Promise.all((inner?.getAnimations({ subtree: true }) ?? []).map((animation) => animation.finished.catch(() => {}))).then(() => dialog.remove())
  return confirmed
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-confirm-dialog': ConfirmDialog
  }
}
