import { html, nothing } from 'lit'
import { isComposingKey } from '@c2n/core/dom-helper.js'
import { fieldConsumerOf, type FieldContextConsumer } from '@c2n/core/contexts/field.js'
import type { LocalizeController } from '@c2n/core/localize.js'
import '@c2n/text-field'
import type { ConfirmDialogMessages } from './messages.js'
import type { PromptOptions, PromptValidator } from './confirm-dialog.js'

// The typed confirmation and the prompt of `c2-confirm-dialog`: loaded with the text field the first time a dialog
// uses one of them, so a plain confirmation does not pay for either.

/** What the dialog reads from the control in its `input` slot, or from its built-in field. */
type InputControl = HTMLElement & {
  value?: unknown
  validity?: ValidityState
  validationMessage?: string
  checkValidity?(): boolean
  select?(): void
  updateComplete?: Promise<unknown>
}

/** The part of `c2-confirm-dialog` the fields work with. */
export interface FieldsDialog {
  host: HTMLElement & { confirmText: string; inputLabel: string; heading: string; message: string; renderRoot: ParentNode; requestUpdate(): void }
  msg: LocalizeController<ConfirmDialogMessages>
  prompting(): PromptOptions<never> | undefined
  /** Whether a slot holds content (`''` for the message). */
  has(slot: string): boolean
  slotChange(event: Event): void
  setBusy(busy: boolean): void
  confirm(): void
}

// Stands in for the phrase while the "type … to confirm" message is split around it.
const PHRASE = '\u{E000}'
const TEXT_INPUT = /^(text|search|email|url|tel|password|number)$/

export class ConfirmDialogFields {
  private typed = ''
  private fieldValue = ''
  private error = ''
  /** What the live region says: the error of a confirm that failed, so it is heard even when focus does not move. */
  private announcement = ''
  private run = 0
  private checking = false
  private consumer: FieldContextConsumer | undefined

  constructor(private readonly dialog: FieldsDialog) {
    this.reset()
  }

  /** Starts a new question: no typed text, the prompt's initial value and no error. */
  reset() {
    this.typed = ''
    this.fieldValue = this.dialog.prompting()?.value ?? ''
    this.error = ''
    this.announcement = ''
    this.run++
  }

  /** True while a phrase is required and the typed text does not match it. */
  get blocked() {
    const phrase = this.dialog.host.confirmText.trim()
    return !!phrase && this.typed.trim() !== phrase
  }

  private get builtIn() {
    return !!this.dialog.prompting() && !this.dialog.has('input')
  }

  private query<E extends Element = InputControl>(selector: string) {
    return this.dialog.host.renderRoot.querySelector<E>(selector) ?? undefined
  }

  private get typedField() {
    return this.query('.c2-confirm-dialog__typed')
  }

  private get promptField() {
    return this.query('.c2-confirm-dialog__prompt')
  }

  /** The control a prompt reads: the first element in the `input` slot, else the built-in field while prompting. */
  private get control(): InputControl | undefined {
    const slot = this.query<HTMLSlotElement>('slot[name="input"]')
    return (slot?.assignedElements({ flatten: true })[0] as InputControl | undefined) ?? (this.dialog.prompting() ? this.promptField : undefined)
  }

  /** The value the prompt resolves with. */
  value() {
    return this.control?.value ?? null
  }

  /** Focuses the field to type in, its value selected; answers whether there was one. */
  async focus() {
    const field = this.typedField ?? this.control
    await field?.updateComplete
    field?.focus()
    if (field && field === this.promptField) field.select?.()
    return !!field
  }

  /** On confirm: the phrase must match, then the input's own constraints and the prompt's `validate` must pass. */
  async check() {
    if (this.blocked) return false
    this.checking = true
    try {
      if (await this.validate()) return true
    } finally {
      this.checking = false
    }
    // The field's description carries the error once focused; the live region says it when focus stays put.
    this.announcement = this.error
    this.dialog.host.requestUpdate()
    this.control?.focus()
    return false
  }

  /**
   * Checks the input's own constraints, then the prompt's `validate`, and shows the first error. While the user types
   * after a failed confirm (`live`), only the constraints are checked again: `validate` (often a request) waits for the
   * next confirm.
   */
  private async validate(live = false): Promise<boolean> {
    const control = this.control
    if (!control) return true
    const run = ++this.run
    // A control updates its validity when it renders the value an `input` event just reported.
    await control.updateComplete
    const { msg, setBusy } = this.dialog
    let message: string | null | undefined = ''
    if (control.checkValidity && !control.checkValidity()) {
      message = control.validity?.valueMissing ? msg.t('valueMissing') : control.validationMessage || msg.t('invalid')
    }
    const validate = this.dialog.prompting()?.validate as PromptValidator<unknown> | undefined
    if (!message && validate && !live) {
      const result = validate(control.value)
      // A pending check spins the confirm button.
      if (result instanceof Promise) setBusy(true)
      try {
        message = await result
      } finally {
        setBusy(false)
      }
    }
    // A newer check (the user kept typing, or the dialog reopened) answers instead.
    if (run !== this.run) return false
    this.error = message ?? ''
    this.dialog.host.requestUpdate()
    return !message
  }

  /** Hands each field its name, error and invalid look through the field protocol, as `c2-form-field` does. */
  sync() {
    const { host, msg } = this.dialog
    fieldConsumerOf(this.typedField)?.attach(host, { label: msg.t('typeToConfirm', host.confirmText), description: '', invalid: false })
    const consumer = fieldConsumerOf(this.control)
    if (this.consumer !== consumer) this.consumer?.detach(host)
    this.consumer = consumer
    consumer?.attach(host, {
      label: this.dialog.prompting()?.label || host.inputLabel || host.heading || msg.t('answer'),
      description: this.error ? `${msg.t('errorPrefix')} ${this.error}` : '',
      invalid: !!this.error,
    })
  }

  private handleConnect = (event: Event) => {
    // A field that upgraded after this render (a slotted control): claim it.
    event.stopPropagation()
    this.dialog.host.requestUpdate()
  }

  private handleInput = (event: Event) => {
    const target = event.target as InputControl
    if (target === this.typedField) this.typed = String(target.value ?? '')
    else if (target === this.promptField) this.fieldValue = String(target.value ?? '')
    this.dialog.host.requestUpdate()
    // After a failed confirm, the error follows the value until it is fixed.
    if (this.error && !this.checking && target !== this.typedField) void this.validate(true)
  }

  private handleKeydown = (event: KeyboardEvent) => {
    // Enter in a text input confirms; a control that uses Enter itself (a list, a combobox) prevents it first.
    const input = event.composedPath()[0]
    if (event.key !== 'Enter' || event.defaultPrevented || isComposingKey(event) || !(input instanceof HTMLInputElement) || !TEXT_INPUT.test(input.type)) return
    event.preventDefault()
    this.dialog.confirm()
  }

  render() {
    const { host, msg } = this.dialog
    const prompting = this.dialog.prompting()
    const builtIn = this.builtIn
    const label = prompting?.label || host.inputLabel
    // No message above: the first field sits right under the heading.
    const flush = !host.message && !this.dialog.has('')
    const [before, after = ''] = msg.t('typeToConfirm', PHRASE).split(PHRASE)
    return html`${
        host.confirmText
          ? html`<div
              part="confirm-text"
              class="c2-confirm-dialog__field ${flush ? 'c2-confirm-dialog__field--flush' : ''}"
              @c2-field-connect=${this.handleConnect}
              @input=${this.handleInput}
              @keydown=${this.handleKeydown}
            >
              <span part="label" class="c2-confirm-dialog__label" aria-hidden="true"
                >${before}<span part="phrase" class="c2-confirm-dialog__phrase">${host.confirmText}</span>${after}</span
              >
              <c2-text-field part="field" class="c2-confirm-dialog__typed" autocomplete="off" .value=${this.typed}></c2-text-field>
            </div>`
          : nothing
      }
      <div
        part="input"
        class="c2-confirm-dialog__field ${flush && !host.confirmText ? 'c2-confirm-dialog__field--flush' : ''}"
        ?hidden=${!builtIn && !this.dialog.has('input')}
        @c2-field-connect=${this.handleConnect}
        @input=${this.handleInput}
        @change=${this.handleInput}
        @keydown=${this.handleKeydown}
      >
        ${label ? html`<span part="label" class="c2-confirm-dialog__label" aria-hidden="true">${label}</span>` : nothing}
        <slot name="input" @slotchange=${this.dialog.slotChange}></slot>
        ${
          builtIn
            ? html`<c2-text-field
                part="field"
                class="c2-confirm-dialog__prompt"
                type=${prompting?.type ?? 'text'}
                placeholder=${prompting?.placeholder ?? ''}
                ?required=${!!prompting?.required}
                .value=${this.fieldValue}
              ></c2-text-field>`
            : nothing
        }
        ${this.error ? html`<span part="error" class="c2-confirm-dialog__error">${this.error}</span>` : nothing}
        <span class="c2-confirm-dialog__announce" aria-live="polite">${this.announcement}</span>
      </div>`
  }
}
