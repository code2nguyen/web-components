import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import '@c2n/modal'
import '@c2n/button'
import type { Modal } from '@c2n/modal'
import type { Button } from '@c2n/button'
import type { TextFieldType } from '@c2n/text-field'
import { LocalizeController } from '@c2n/core/localize.js'
import { confirmDialogMessages } from './messages.js'
import type { ConfirmDialogFields } from './confirm-dialog-fields.js'
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
 * Checks a prompt's value when the user confirms: return an error message to keep the dialog open and show it under
 * the input, or nothing to accept the value. A promise keeps the confirm button spinning until it settles.
 */
export type PromptValidator<T = string> = (value: T) => string | null | undefined | Promise<string | null | undefined>

/** Options of {@link ConfirmDialog.prompt}. The field options apply to the built-in text field, not to a slotted control. */
export interface PromptOptions<T = string> {
  /** Name and visible label of the input. Defaults to `input-label`, then the heading. */
  label?: string
  /** Initial text of the built-in field; it is selected when the dialog opens. */
  value?: string
  /** Placeholder of the built-in field. */
  placeholder?: string
  /** Input type of the built-in field (`text` by default). */
  type?: TextFieldType
  /** The built-in field must not be empty. */
  required?: boolean
  /** Checks the value on confirm, after the control's own constraints pass; see {@link PromptValidator}. */
  validate?: PromptValidator<T>
}

// The typed confirmation and the prompt load, with the text field, the first time a dialog uses one of them.
let fieldsModule: Promise<typeof import('./confirm-dialog-fields.js')> | undefined
const loadFieldsModule = () =>
  (fieldsModule ??= import('./confirm-dialog-fields.js').catch((error: unknown) => {
    // A failed load (offline, a stale deploy) is tried again next time.
    fieldsModule = undefined
    throw error
  }))

/**
 * Asks the user to confirm an action before it happens. `await dialog.show()` (or the {@link confirm} helper, which
 * needs no markup) resolves `true` when the user confirms and `false` when they cancel, press Escape or the dialog is
 * closed by code. `destructive` paints the confirm button in the error colour and puts the initial focus on Cancel,
 * so Enter right after opening never deletes anything. Give it a `confirm-action` (`confirmAction` property) to run
 * the work from the dialog: the confirm button spins until it settles, and a failure keeps the dialog open for a retry.
 *
 * Two opt-in modes ask for more than a click. `confirm-text` is a typed confirmation: the confirm button stays disabled
 * until the user types that phrase (a repository's name) into the field the dialog adds. `prompt()` (or the
 * {@link prompt} helper) asks for a value: it opens the dialog with a text field, or the control in the `input` slot,
 * and resolves with its value, or `null` when cancelled. The control's own constraints (`required`, `type`) and the
 * prompt's `validate` function are checked on confirm; an error keeps the dialog open with the message under the
 * input. Enter in a text input confirms.
 *
 * The dialog is a `c2-modal` announced as an `alertdialog` described by its message: a click on the backdrop does not
 * close it, Escape cancels it. Restyle the frame through the `--c2-modal…` variables, which reach the inner modal.
 *
 * @tag c2-confirm-dialog
 * @internalcomponent c2-modal
 * @internalcomponent c2-button
 * @internalcomponent c2-text-field
 *
 * @slot - Message; replaces the `message` attribute. The dialog is described by it.
 * @slot heading - Heading; replaces the `heading` attribute. The dialog is labelled by it.
 * @slot icon - Icon shown before the heading, coloured by `--c2-confirm-dialog__icon--color`.
 * @slot input - A form control whose value `prompt()` resolves with, in place of the built-in text field (a `c2-select` of `c2-list-item` options, a `c2-number-input`). The dialog names it with `input-label`, or the heading, and checks its validity on confirm.
 * @csspart modal - The inner `c2-modal`.
 * @csspart heading - Row wrapping the `icon` slot and the `heading` slot (or its `heading` attribute fallback).
 * @csspart message - Region wrapping the default slot (or its `message` attribute fallback).
 * @csspart confirm-text - Region of the typed confirmation: its instruction and its field.
 * @csspart phrase - The phrase to type, inside the typed confirmation's instruction.
 * @csspart input - Region wrapping the `input` slot (or the built-in prompt field), its label and its error.
 * @csspart label - The visible label above the typed-confirmation field or the prompt input.
 * @csspart field - The built-in `c2-text-field` of the typed confirmation or of the prompt.
 * @csspart error - The validation message under the prompt input.
 * @csspart cancel-button - The Cancel `c2-button`.
 * @csspart confirm-button - The confirm `c2-button`.
 *
 * @event {Event} open - Fired after the dialog has been shown.
 * @event {Event} confirm - Cancelable: fired when the user confirms, after the input is validated and before the action runs and the dialog closes; `preventDefault()` keeps it open.
 * @event {Event} cancel - Fired when the dialog is dismissed without confirming: Cancel, Escape or `close(false)`.
 * @event {CustomEvent<{ confirmed: boolean }>} close - Fired after the dialog has closed; `detail.confirmed` is the answer `show()` resolves with.
 * @event {CustomEvent<{ error: unknown }>} confirm-error - Fired when `confirmAction` or a prompt's `validate` throws or rejects; the dialog stays open.
 *
 * @cssproperty {pixel} [--c2-confirm-dialog--width=min(420px, calc(100vw - 32px))] - Sets the inner modal's width.
 * @cssproperty {pixel} [--c2-confirm-dialog__heading--gap=12px] - Space between the icon and the heading.
 * @cssproperty {pixel} [--c2-confirm-dialog__icon--size=24px] - Width and height of the icon.
 * @cssproperty {color} [--c2-confirm-dialog__icon--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-confirm-dialog__icon__destructive--color=#dc2626]
 * @cssproperty {color} [--c2-confirm-dialog__message--color=#71717a]
 *
 * @cssproperty {pixel} [--c2-confirm-dialog__field--margin-top=16px] - Space between the message and the typed-confirmation or prompt input.
 * @cssproperty {pixel} [--c2-confirm-dialog__field--gap=6px] - Space between the label, the input and the error.
 * @cssproperty {color} [--c2-confirm-dialog__label--color=#18181b]
 * @cssproperty {pixel} [--c2-confirm-dialog__label--font-size=14px]
 * @cssproperty {string} [--c2-confirm-dialog__phrase--font-family=ui-monospace, SFMono-Regular, Menlo, monospace]
 * @cssproperty {number} [--c2-confirm-dialog__phrase--font-weight=600]
 * @cssproperty {color} [--c2-confirm-dialog__phrase--color=#18181b]
 * @cssproperty {color} [--c2-confirm-dialog__phrase--background-color=#f4f4f5]
 * @cssproperty {pixel} [--c2-confirm-dialog__phrase--border-radius=4px]
 * @cssproperty {string} [--c2-confirm-dialog__phrase--padding=1px 4px]
 * @cssproperty {color} [--c2-confirm-dialog__error--color=#dc2626]
 * @cssproperty {pixel} [--c2-confirm-dialog__error--font-size=12px]
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

  /** Label of the button that confirms. Defaults to "Confirm" in the nearest `lang` (English, or a language the app adds). */
  @property({ attribute: 'confirm-label' }) confirmLabel = ''

  /** Label of the button that cancels. Defaults to "Cancel" in the nearest `lang`. */
  @property({ attribute: 'cancel-label' }) cancelLabel = ''

  /** The action cannot be undone: error-coloured confirm button, and the initial focus goes to Cancel. */
  @property({ type: Boolean, reflect: true }) destructive = false

  /**
   * Phrase the user must type before the confirm button enables, such as the name of what is deleted. Adds a field under
   * the message, which takes the initial focus. The comparison is exact, ignoring spaces at either end.
   */
  @property({ attribute: 'confirm-text' }) confirmText = ''

  /** Name and visible label of the control in the `input` slot, or of the built-in prompt field. Defaults to the heading. */
  @property({ attribute: 'input-label' }) inputLabel = ''

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

  private readonly msg = new LocalizeController(this, confirmDialogMessages)
  private readonly slots = new SlotPresenceController(this, ['', 'input'])
  private busy = false
  private pending: { promise: Promise<boolean>; resolve: (confirmed: boolean) => void } | undefined
  /** The running `prompt()`'s options; kept until the next opening, so the field stays while the dialog closes. */
  private prompting: PromptOptions<never> | undefined
  private answerValue: unknown = null
  /** The value that passed validation when the user confirmed; what `prompt()` resolves with. */
  private confirmedValue: { value: unknown } | undefined
  /** Counts the openings, so work started for one question does not act on the next. */
  private question = 0
  /** The typed confirmation and the prompt, loaded the first time this dialog needs them. */
  private fields: ConfirmDialogFields | undefined

  /** Opens the dialog and resolves with the answer: `true` when confirmed, `false` otherwise. */
  show(): Promise<boolean> {
    if (!this.open) this.prompting = undefined
    this.open = true
    return this.answer()
  }

  /**
   * Opens the dialog as a prompt and resolves with its input's value when the user confirms, `null` otherwise. The input
   * is the control in the `input` slot, else a built-in text field set up by `options`.
   *
   * ```ts
   * const name = await dialog.prompt({ label: 'File name', value: file.name, required: true })
   * ```
   */
  async prompt<T = string>(options: PromptOptions<T> = {}): Promise<T | null> {
    // On a dialog already open as a plain confirmation, the prompt takes over.
    if (!this.open || !this.prompting) this.prompting = options as PromptOptions<never>
    this.open = true
    this.requestUpdate()
    return (await this.answer()) ? (this.answerValue as T) : null
  }

  /** Closes the dialog with the given answer (`false` by default). */
  close(confirmed = false) {
    if (!this.open) return
    const returnValue = confirmed ? 'confirm' : 'cancel'
    if (this.modal?.open) this.modal.close(returnValue)
    else this.settle(confirmed)
  }

  private get needsFields() {
    return !!this.confirmText || !!this.prompting || this.slots.state('input') === 'present'
  }

  /** Loads the typed confirmation and the prompt (with the text field) when this dialog uses one of them. */
  private async loadFields() {
    if (!this.needsFields) return this.fields
    const { ConfirmDialogFields } = await loadFieldsModule()
    this.fields ??= new ConfirmDialogFields({
      host: this,
      msg: this.msg,
      prompting: () => this.prompting,
      has: (slot) => this.slots.has(slot),
      slotChange: (event) => {
        this.slots.handleSlotChange(event)
        this.requestUpdate()
      },
      setBusy: (busy) => this.setBusy(busy),
      confirm: () => void this.handleConfirm(),
    })
    this.requestUpdate()
    await this.updateComplete
    return this.fields
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
    this.answerValue = confirmed ? (this.confirmedValue ? this.confirmedValue.value : (this.fields?.value() ?? null)) : null
    this.confirmedValue = undefined
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
    const action = this.confirmAction
    try {
      // The phrase, the input's constraints and the prompt's `validate`; confirmed before the module arrived, it waits.
      const question = this.question
      const fields = await this.loadFields()
      const passed = !fields || (await fields.check())
      // Dismissed (or reopened) while the module loaded or `validate` ran: that answer stands.
      if (!passed || !this.open || question !== this.question) return
      if (fields) this.confirmedValue = { value: fields.value() }
      if (!this.dispatchEvent(new Event('confirm', { bubbles: true, composed: true, cancelable: true }))) return
      if (action) {
        this.setBusy(true)
        await action()
        // Closed (or reopened) by code while the action ran: that answer stands.
        if (!this.busy) return
      }
    } catch (error) {
      this.setBusy(false)
      this.dispatchEvent(new CustomEvent('confirm-error', { detail: { error }, bubbles: true, composed: true }))
      await this.updateComplete
      this.confirmButton?.focus()
      return
    }
    this.close(true)
  }

  private handleModalOpen = async (event: Event) => {
    event.stopPropagation()
    const fields = await this.loadFields().catch(() => undefined)
    await this.updateComplete
    // A field to type in takes the focus. Otherwise a destructive dialog lands on Cancel, so a reflexive Enter does not
    // run the action.
    if (!(await fields?.focus())) (this.destructive ? this.cancelButton : this.confirmButton)?.focus()
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

  override willUpdate(changed: PropertyValues<this>) {
    if (isServer) return
    if (changed.has('open') && this.open) {
      // Opened through the attribute rather than show() or prompt(): no prompt is running.
      if (!this.pending) this.prompting = undefined
      this.question++
      this.confirmedValue = undefined
      this.fields?.reset()
    }
    if (!this.fields) this.loadFields().catch(() => {})
  }

  override updated(changed: PropertyValues<this>) {
    if (isServer) return
    this.fields?.sync()
    if (!changed.has('open')) return
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
          <span class="c2-confirm-dialog__heading-text"><slot name="heading">${this.heading || nothing}</slot></span>
        </div>
        <div part="message" class="c2-confirm-dialog__message"><slot @slotchange=${this.slots.handleSlotChange}>${this.message || nothing}</slot></div>
        ${this.fields?.render() ?? nothing}
        <c2-button slot="footer" part="cancel-button" class="c2-confirm-dialog__cancel" ?disabled=${this.busy} @click=${() => this.close(false)}>
          ${this.cancelLabel || this.msg.t('cancel')}
        </c2-button>
        <c2-button
          slot="footer"
          part="confirm-button"
          class="c2-confirm-dialog__confirm"
          ?running=${this.busy}
          ?disabled=${this.fields ? this.fields.blocked : !!this.confirmText}
          @click=${this.handleConfirm}
        >
          ${this.confirmLabel || this.msg.t('confirm')}
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
  /** Phrase the user must type before confirming; see `ConfirmDialog.confirmText`. */
  confirmText?: string
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
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return ask(options, (dialog) => dialog.show())
}

/** Options of {@link prompt}: those of {@link confirm} plus the built-in field's {@link PromptOptions}. */
export interface PromptDialogOptions extends ConfirmOptions, PromptOptions<string> {}

/**
 * Asks for a value without any markup: mounts a temporary `c2-confirm-dialog` with a text field, resolves with what the
 * user typed, or `null` when they cancel, then removes the dialog.
 *
 * ```ts
 * const name = await prompt({ heading: 'Rename file', label: 'File name', value: file.name, confirmLabel: 'Rename' })
 * if (name !== null) rename(file, name)
 * ```
 */
export function prompt(options: PromptDialogOptions): Promise<string | null> {
  const { label, value, placeholder, type, required, validate, ...dialogOptions } = options
  return ask(dialogOptions, (dialog) => dialog.prompt({ label, value, placeholder, type, required, validate }))
}

async function ask<R>(options: ConfirmOptions, open: (dialog: ConfirmDialog) => Promise<R>): Promise<R> {
  const { container = document.body, action, ...attributes } = options
  const dialog = document.createElement('c2-confirm-dialog')
  // An option passed as `undefined` keeps the element's default rather than blanking it.
  Object.assign(dialog, Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== undefined)), { confirmAction: action })
  container.append(dialog)
  const answer = await open(dialog)
  const inner = dialog.shadowRoot?.querySelector('c2-modal')?.shadowRoot?.querySelector('dialog')
  void Promise.all((inner?.getAnimations({ subtree: true }) ?? []).map((animation) => animation.finished.catch(() => {}))).then(() => dialog.remove())
  return answer
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-confirm-dialog': ConfirmDialog
  }
}
