import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './questionnaire.scss?inline'

export type QuestionnaireQuestionType = 'select' | 'choice' | 'single' | 'multiple'
export type QuestionnaireAnswer = string | string[]
export type QuestionnaireAnswers = Record<string, QuestionnaireAnswer>

export interface QuestionnaireOption {
  value: string
  label: string
  description?: string
  shortcut?: string
  disabled?: boolean
}

export interface QuestionnaireQuestion {
  id: string
  title: string
  description?: string
  type?: QuestionnaireQuestionType
  options: QuestionnaireOption[]
  required?: boolean
  skippable?: boolean
  otherPlaceholder?: string
  errorMessage?: string
}

export interface QuestionnaireItemRenderContext {
  question: QuestionnaireQuestion
  questionIndex: number
  option: QuestionnaireOption
  optionIndex: number
  selected: boolean
  shortcut: string
}

/** Renders the label area of one option card. The component continues to own its native input, indicator and shortcut. */
export type QuestionnaireItemRender = (context: QuestionnaireItemRenderContext) => unknown

export interface QuestionnaireEventMap {
  'answer-change': CustomEvent<{ questionId: string; value: QuestionnaireAnswer; answers: QuestionnaireAnswers }>
  'step-change': CustomEvent<{ index: number; question: QuestionnaireQuestion }>
  skip: CustomEvent<{ index: number; questionId: string }>
  complete: CustomEvent<{ answers: QuestionnaireAnswers }>
}

export interface Questionnaire {
  addEventListener: TypedAddEventListener<Questionnaire, QuestionnaireEventMap>
  removeEventListener: TypedRemoveEventListener<Questionnaire, QuestionnaireEventMap>
}

const jsonConverter = {
  fromAttribute(value: string | null) {
    if (!value) return []
    try {
      return JSON.parse(value) as unknown
    } catch {
      return []
    }
  },
}

let instanceId = 0

/**
 * A complete multi-step questionnaire with single- and multiple-choice questions, optional free-text answers,
 * validation, keyboard shortcuts and previous / skip / next navigation. Questions are supplied as an array through
 * the `questions` property or as JSON in the `questions` attribute. The component preserves answers between steps,
 * emits progress events and submits the complete answer object as JSON when given a form `name`.
 *
 * @tag c2-questionnaire
 *
 * @slot header - Content before the progress and question heading.
 * @slot footer - Content after the navigation actions.
 * @slot empty - Content shown when no questions were supplied.
 * @slot previous-button - Replaces the Previous control while retaining its navigation behavior.
 * @slot skip-button - Replaces the Skip control while retaining its skip behavior.
 * @slot next-button - Replaces the Next control while retaining validation and navigation.
 * @slot submit-button - Replaces the final submit control while retaining validation and completion.
 * @slot summary - Replaces the answer summary shown after successful completion. Read the host's `answers` property or the `complete` event to render custom data.
 *
 * @csspart previous-button - Fallback button inside the `previous-button` slot when no assigned replacement is present.
 * @csspart skip-button - Fallback button inside the `skip-button` slot when no assigned replacement is present.
 * @csspart next-button - Fallback button inside the `next-button` slot when no assigned replacement is present.
 * @csspart submit-button - Fallback button inside the `submit-button` slot when no assigned replacement is present.
 *
 * @event {CustomEvent<{ questionId: string, value: QuestionnaireAnswer, answers: QuestionnaireAnswers }>} answer-change - Fired whenever an answer changes.
 * @event {CustomEvent<{ index: number, question: QuestionnaireQuestion }>} step-change - Fired after navigation changes the visible question.
 * @event {CustomEvent<{ index: number, questionId: string }>} skip - Fired when a skippable question is skipped.
 * @event {CustomEvent<{ answers: QuestionnaireAnswers }>} complete - Fired from Next / Save on the last valid question.
 *
 * @cssproperty {width} [--c2-questionnaire--width=100%] - Width of the questionnaire host.
 * @cssproperty {width} [--c2-questionnaire--max-width=448px] - Maximum readable width of the flow.
 * @cssproperty {color} [--c2-questionnaire--color=#18181b] - Default text colour.
 * @cssproperty {font-size} [--c2-questionnaire__progress--font-size=12px] - Progress label size.
 * @cssproperty {color} [--c2-questionnaire__progress--color=#71717a] - Progress label colour.
 * @cssproperty {font-size} [--c2-questionnaire__title--font-size=16px] - Question title size.
 * @cssproperty {font-weight} [--c2-questionnaire__title--font-weight=600] - Question title weight.
 * @cssproperty {color} [--c2-questionnaire__description--color=#71717a] - Question description colour.
 * @cssproperty {font-size} [--c2-questionnaire__description--font-size=14px] - Question description size.
 * @cssproperty {pixel} [--c2-questionnaire__options--gap=8px] - Space between option cards.
 * @cssproperty {padding} [--c2-questionnaire__option--padding=10px 12px] - Option card padding.
 * @cssproperty {border} [--c2-questionnaire__option--border=1px solid #e4e4e7] - Resting option border.
 * @cssproperty {border-radius} [--c2-questionnaire__option--border-radius=8px] - Option card corner radius.
 * @cssproperty {color} [--c2-questionnaire__option--background-color=#ffffff] - Resting option background.
 * @cssproperty {border} [--c2-questionnaire__option__hover--border=1px solid #bcbcc6] - Hovered option border.
 * @cssproperty {border} [--c2-questionnaire__option__selected--border=1px solid #a1a1aa] - Selected option border.
 * @cssproperty {color} [--c2-questionnaire__option__selected--background-color=#fafafa] - Selected option background.
 * @cssproperty {border} [--c2-questionnaire__option__error--border=1px solid #dc2626] - Option border after validation fails.
 * @cssproperty {outline} [--c2-questionnaire__option__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Keyboard focus outline.
 * @cssproperty {pixel} [--c2-questionnaire__control--size=16px] - Radio and checkbox indicator size.
 * @cssproperty {color} [--c2-questionnaire__control__selected--background-color=#18181b] - Selected indicator fill.
 * @cssproperty {color} [--c2-questionnaire__option-description--color=#71717a] - Option supporting-text colour.
 * @cssproperty {color} [--c2-questionnaire__shortcut--color=#71717a] - Shortcut badge text colour.
 * @cssproperty {color} [--c2-questionnaire__error--color=#dc2626] - Validation message colour.
 * @cssproperty {border-radius} [--c2-questionnaire__action--border-radius=8px] - Navigation button corner radius.
 * @cssproperty {color} [--c2-questionnaire__primary-action--background-color=#18181b] - Next and complete button background.
 * @cssproperty {color} [--c2-questionnaire__primary-action--color=#ffffff] - Next and complete button text colour.
 * @cssproperty {border} [--c2-questionnaire__secondary-action--border=1px solid #e4e4e7] - Previous and skip button border.
 * @cssproperty {color} [--c2-questionnaire__secondary-action--background-color=#ffffff] - Previous and skip button background.
 */
@customElement('c2-questionnaire')
export class Questionnaire extends LitElement {
  static formAssociated = true
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly groupName = `c2-questionnaire-${++instanceId}`

  /** Questionnaire definition. Use `select` for one answer and `choice` for multiple answers (`single` / `multiple` remain aliases). May also be supplied as JSON. */
  @property({ converter: jsonConverter }) questions: QuestionnaireQuestion[] = []

  /** Optional renderer for each option's content. Assign this as a JavaScript property; functions cannot be passed through HTML attributes. */
  @property({ attribute: false }) questionItemRender?: QuestionnaireItemRender

  /** Current answers keyed by question id. */
  @property({ attribute: false }) answers: QuestionnaireAnswers = {}

  /** Zero-based visible question index. */
  @property({ type: Number, reflect: true }) current = 0

  /** Shows the answer summary after successful completion. */
  @property({ type: Boolean, reflect: true }) completed = false

  /** Form field name. Its submitted value is the answer object serialized as JSON. */
  @property() name = ''

  /** Disables options and navigation. */
  @property({ type: Boolean, reflect: true }) disabled = false

  @state() private disabledByForm = false

  /** Label of the forward action before the final question. */
  @property({ attribute: 'next-label' }) nextLabel = 'Next'

  /** Label of the forward action on the final question. */
  @property({ attribute: 'complete-label' }) completeLabel = 'Save'

  /** Label of the backward action. */
  @property({ attribute: 'previous-label' }) previousLabel = 'Previous'

  /** Label of the skip action. */
  @property({ attribute: 'skip-label' }) skipLabel = 'Skip'

  @state() private showError = false
  @query('.option input') private firstOption?: HTMLInputElement

  /** Currently visible question. */
  get question(): QuestionnaireQuestion | undefined {
    return this.questions[this.current]
  }

  override connectedCallback() {
    super.connectedCallback()
    this.addEventListener('keydown', this.handleShortcut)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener('keydown', this.handleShortcut)
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('questions') && this.current >= this.questions.length) this.current = Math.max(0, this.questions.length - 1)
    if (changed.has('answers') || changed.has('name')) this.internals.setFormValue(this.name ? JSON.stringify(this.answers) : null)
  }

  formResetCallback() {
    this.reset()
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled
  }

  private get effectiveDisabled(): boolean {
    return this.disabled || this.disabledByForm
  }

  /** Move to the next question, or complete the questionnaire on the final question. Returns whether validation passed. */
  next(): boolean {
    const question = this.question
    if (!question || this.effectiveDisabled) return false
    if (!this.hasAnswer(question)) {
      this.showError = true
      void this.updateComplete.then(() => this.firstOption?.focus())
      return false
    }
    this.showError = false
    if (this.current === this.questions.length - 1) {
      this.completed = true
      this.dispatchEvent(new CustomEvent('complete', { detail: { answers: { ...this.answers } }, bubbles: true, composed: true }))
      return true
    }
    this.goTo(this.current + 1)
    return true
  }

  /** Return to the previous question. */
  previous() {
    if (this.effectiveDisabled || this.current === 0) return
    this.goTo(this.current - 1)
  }

  /** Skip the current question when it is marked `skippable`. */
  skip() {
    const question = this.question
    if (!question?.skippable || this.effectiveDisabled) return
    const answers = { ...this.answers }
    delete answers[question.id]
    this.answers = answers
    this.showError = false
    this.dispatchEvent(new CustomEvent('skip', { detail: { index: this.current, questionId: question.id }, bubbles: true, composed: true }))
    if (this.current === this.questions.length - 1) {
      this.completed = true
      this.dispatchEvent(new CustomEvent('complete', { detail: { answers: { ...answers } }, bubbles: true, composed: true }))
    } else {
      this.goTo(this.current + 1)
    }
  }

  /** Clear all answers and return to the first question. */
  reset() {
    this.answers = {}
    this.current = 0
    this.completed = false
    this.showError = false
  }

  private goTo(index: number) {
    this.current = index
    this.completed = false
    this.showError = false
    const question = this.questions[index]
    if (question) this.dispatchEvent(new CustomEvent('step-change', { detail: { index, question }, bubbles: true, composed: true }))
  }

  private hasAnswer(question: QuestionnaireQuestion): boolean {
    if (question.required === false) return true
    const answer = this.answers[question.id]
    return Array.isArray(answer) ? answer.length > 0 : typeof answer === 'string' && answer.trim().length > 0
  }

  private isMultipleQuestion(question: QuestionnaireQuestion): boolean {
    return question.type === 'choice' || question.type === 'multiple'
  }

  private setAnswer(question: QuestionnaireQuestion, value: QuestionnaireAnswer) {
    this.answers = { ...this.answers, [question.id]: value }
    this.showError = false
    this.dispatchEvent(
      new CustomEvent('answer-change', {
        detail: { questionId: question.id, value, answers: { ...this.answers } },
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleOptionChange(event: Event, question: QuestionnaireQuestion, option: QuestionnaireOption) {
    const input = event.currentTarget as HTMLInputElement
    if (this.isMultipleQuestion(question)) {
      const current = this.answers[question.id]
      const values = Array.isArray(current) ? current : []
      this.setAnswer(question, input.checked ? [...values, option.value] : values.filter((value) => value !== option.value))
    } else {
      this.setAnswer(question, option.value)
    }
  }

  private handleOtherInput(event: InputEvent, question: QuestionnaireQuestion) {
    this.setAnswer(question, (event.currentTarget as HTMLInputElement).value)
  }

  private handleShortcut = (event: KeyboardEvent) => {
    const origin = event.composedPath()[0]
    if (this.effectiveDisabled || event.metaKey || event.ctrlKey || event.altKey || (origin instanceof HTMLInputElement && origin.classList.contains('other')))
      return
    const question = this.question
    if (!question || event.key.length !== 1) return
    const optionIndex = question.options.findIndex(
      (option, index) => (option.shortcut ?? String.fromCharCode(65 + index)).toLowerCase() === event.key.toLowerCase(),
    )
    if (optionIndex < 0) return
    const option = question.options[optionIndex]
    if (option.disabled) return
    event.preventDefault()
    if (this.isMultipleQuestion(question)) {
      const current = this.answers[question.id]
      const values = Array.isArray(current) ? current : []
      this.setAnswer(question, values.includes(option.value) ? values.filter((value) => value !== option.value) : [...values, option.value])
    } else {
      this.setAnswer(question, option.value)
    }
  }

  private optionSelected(question: QuestionnaireQuestion, option: QuestionnaireOption): boolean {
    const answer = this.answers[question.id]
    return Array.isArray(answer) ? answer.includes(option.value) : answer === option.value
  }

  private answerLabels(question: QuestionnaireQuestion): string[] {
    const answer = this.answers[question.id]
    const values = Array.isArray(answer) ? answer : answer ? [answer] : []
    return values.map((value) => question.options.find((option) => option.value === value)?.label ?? value)
  }

  override render() {
    const question = this.question
    if (!question) return html`<slot name="empty">No questions configured.</slot>`
    if (this.completed) {
      return html`
        <div class="questionnaire">
          <slot name="header"></slot>
          <section class="summary" aria-live="polite">
            <slot name="summary">
              <h2>Summary</h2>
              <dl>
                ${this.questions.map((item) => {
                  const labels = this.answerLabels(item)
                  return html`<div>
                    <dt>${item.title}</dt>
                    <dd>${labels.length ? labels.join(', ') : 'Skipped'}</dd>
                  </div>`
                })}
              </dl>
            </slot>
          </section>
          <slot name="footer"></slot>
        </div>
      `
    }
    const answer = this.answers[question.id]
    const describedBy = this.showError ? 'question-description question-error' : 'question-description'

    return html`
      <div class="questionnaire">
        <slot name="header"></slot>
        <div class="progress">Question ${this.current + 1} of ${this.questions.length}</div>
        <section aria-labelledby="question-title" aria-describedby=${describedBy}>
          <h2 id="question-title">${question.title}</h2>
          ${question.description ? html`<p id="question-description">${question.description}</p>` : html`<span id="question-description" hidden></span>`}
          <div class="options" role=${this.isMultipleQuestion(question) ? 'group' : 'radiogroup'} aria-labelledby="question-title">
            ${question.options.map((option, index) => {
              const selected = this.optionSelected(question, option)
              const shortcut = option.shortcut ?? String.fromCharCode(65 + index)
              return html`
                <label class=${classMap({ option: true, selected, invalid: this.showError, disabled: !!option.disabled })}>
                  <input
                    type=${this.isMultipleQuestion(question) ? 'checkbox' : 'radio'}
                    name=${this.isMultipleQuestion(question) ? `${this.groupName}-${question.id}-${index}` : `${this.groupName}-${question.id}`}
                    .value=${option.value}
                    .checked=${selected}
                    ?disabled=${this.effectiveDisabled || option.disabled}
                    @change=${(event: Event) => this.handleOptionChange(event, question, option)}
                  />
                  <span class="control" aria-hidden="true"></span>
                  <span class="option-copy">
                    ${
                      this.questionItemRender
                        ? this.questionItemRender({ question, questionIndex: this.current, option, optionIndex: index, selected, shortcut })
                        : html`
                            <span class="option-label">${option.label}</span>
                            ${option.description ? html`<span class="option-description">${option.description}</span>` : nothing}
                          `
                    }
                  </span>
                  <kbd>${shortcut}</kbd>
                </label>
              `
            })}
          </div>
          ${
            question.otherPlaceholder
              ? html`<input
                  class="other"
                  type="text"
                  placeholder=${question.otherPlaceholder}
                  aria-label=${question.otherPlaceholder}
                  .value=${typeof answer === 'string' && !question.options.some((option) => option.value === answer) ? answer : ''}
                  ?disabled=${this.effectiveDisabled}
                  @input=${(event: InputEvent) => this.handleOtherInput(event, question)}
                />`
              : nothing
          }
          ${
            this.showError
              ? html`<p class="error" id="question-error" role="alert">
                  ${question.errorMessage ?? (question.skippable ? 'Choose an answer or skip this question.' : 'Choose an answer to continue.')}
                </p>`
              : nothing
          }
        </section>
        <div class="actions">
          <div>
            ${
              this.current > 0
                ? html`<slot name="previous-button" @click=${this.previous}>
                    <button class="secondary" part="previous-button" type="button" ?disabled=${this.effectiveDisabled}>${this.previousLabel}</button>
                  </slot>`
                : nothing
            }
          </div>
          <div class="forward-actions">
            ${
              question.skippable
                ? html`<slot name="skip-button" @click=${this.skip}>
                    <button class="secondary" part="skip-button" type="button" ?disabled=${this.effectiveDisabled}>${this.skipLabel}</button>
                  </slot>`
                : nothing
            }
            ${
              this.current === this.questions.length - 1
                ? html`<slot name="submit-button" @click=${this.next}>
                    <button class="primary" part="submit-button" type="button" ?disabled=${this.effectiveDisabled}>${this.completeLabel}</button>
                  </slot>`
                : html`<slot name="next-button" @click=${this.next}>
                    <button class="primary" part="next-button" type="button" ?disabled=${this.effectiveDisabled}>${this.nextLabel}</button>
                  </slot>`
            }
          </div>
        </div>
        <slot name="footer"></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-questionnaire': Questionnaire
  }
}
