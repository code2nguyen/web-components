import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { repeat } from 'lit/directives/repeat.js'
import { live } from 'lit/directives/live.js'
import { property, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './tag-input.scss?inline'

/** Detail of the `tag-add` event. */
export interface TagInputAddEventDetail {
  /** The tag about to be added, after `parseTag`. */
  value: string
  /** Whether the tag passed `pattern` and `validator`. */
  valid: boolean
}

/** Detail of the `tag-remove` event. */
export interface TagInputRemoveEventDetail {
  /** The tag about to be removed. */
  value: string
  /** Its position in `value`. */
  index: number
}

/**
 * Normalizes one raw token into a tag, e.g. trims and lowercases an address or extracts `ann@example.com` from
 * `Ann <ann@example.com>`. Return `null` or an empty string to drop the token.
 */
export type TagInputParser = (token: string) => string | null | undefined

/** Validates one tag. Return `true` when valid, `false` or a message when not. */
export type TagInputValidator = (tag: string) => boolean | string

/** Events fired by {@link TagInput}, keyed for `addEventListener`. */
export interface TagInputEventMap {
  'tag-add': CustomEvent<TagInputAddEventDetail>
  'tag-remove': CustomEvent<TagInputRemoveEventDetail>
  input: Event
  change: Event
}

export interface TagInput {
  addEventListener: TypedAddEventListener<TagInput, TagInputEventMap>
  removeEventListener: TypedRemoveEventListener<TagInput, TagInputEventMap>
}

function escapeForCharacterClass(characters: string) {
  return characters.replace(/[\\\]^-]/g, '\\$&')
}

/**
 * A field that turns typed or pasted text into a list of removable tags — recipients, keywords, labels.
 *
 * How text is split into tags is up to you. By default a comma or Enter commits the pending text. `delimiters` lists
 * every character that commits (`delimiters=",; "` also accepts semicolons and spaces), `split-pattern` replaces that
 * with a regular expression (`[\s,;]+`), and pasted text is always split on the same delimiters plus line breaks and
 * tabs, so a column copied from a spreadsheet lands as one tag per line. The `parseTag` property normalizes each token
 * before it is added (trim, lowercase, pull the address out of `Name <address>`), `pattern` / `validator` decide
 * whether a tag is valid, and a cancelable `tag-add` event can veto any tag.
 *
 * Invalid tags are kept and marked (the form is invalid until they are removed) unless `reject-invalid` is set, which
 * leaves the text in the input instead. Duplicates are ignored unless `allow-duplicates` is set.
 *
 * Keyboard: Backspace in the empty input or ArrowLeft at its start moves to the last tag; ArrowLeft/ArrowRight walk
 * the tags; Backspace/Delete remove the focused tag; Enter on a tag puts it back into the input for editing.
 *
 * The value is an array of strings. In markup separate tags with semicolons (`value="a@x.com;b@x.com"`). In a form
 * each tag is submitted as its own entry under `name`, like a multiple `<select>`.
 *
 * @tag c2-tag-input
 *
 * @slot prefix-icon - Icon at the start of the field, before the tags.
 * @slot remove-icon - Replaces the cross of every tag's remove button.
 *
 * @event {CustomEvent<TagInputAddEventDetail>} tag-add - Cancelable. Fired before a tag is added; `preventDefault()` rejects it and keeps the text in the input.
 * @event {CustomEvent<TagInputRemoveEventDetail>} tag-remove - Cancelable. Fired before a tag is removed; `preventDefault()` keeps it.
 * @event {Event} input - Fired after `value` changes through user interaction. Typing in the input does not fire it.
 * @event {Event} change - Fired after `value` changes through user interaction.
 *
 * @csspart field - The bordered box holding the tags and the input.
 * @csspart tag - Every tag.
 * @csspart tag-invalid - A tag that failed validation (alongside `tag`).
 * @csspart tag-label - The text of a tag.
 * @csspart remove-button - The remove button of a tag.
 * @csspart input - The text input after the tags.
 *
 * @cssproperty {pixel} [--c2-tag-input--min-height=36px]
 * @cssproperty {pixel} [--c2-tag-input--gap=6px] - Space between tags, and between the last tag and the input.
 *
 * @cssproperty {border-radius} [--c2-tag-input--border-top-left-radius=6px]
 * @cssproperty {border-radius} [--c2-tag-input--border-top-right-radius=6px]
 * @cssproperty {border-radius} [--c2-tag-input--border-bottom-left-radius=6px]
 * @cssproperty {border-radius} [--c2-tag-input--border-bottom-right-radius=6px]
 *
 * @cssproperty {padding} [--c2-tag-input--padding-top=5px]
 * @cssproperty {padding} [--c2-tag-input--padding-right=10px]
 * @cssproperty {padding} [--c2-tag-input--padding-bottom=5px]
 * @cssproperty {padding} [--c2-tag-input--padding-left=6px]
 *
 * @cssproperty {border} [--c2-tag-input--border-top=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-tag-input--border-right=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-tag-input--border-bottom=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-tag-input--border-left=1px solid #bcbcc6]
 *
 * @cssproperty {color} [--c2-tag-input--color=#18181b]
 * @cssproperty {color} [--c2-tag-input--background=#ffffff]
 * @cssproperty {font-size} [--c2-tag-input--font-size=14px]
 * @cssproperty {font-family} --c2-tag-input--font-family
 * @cssproperty {pixel} [--c2-tag-input--line-height=20px]
 *
 * @cssproperty {color} [--c2-tag-input__placeholder--color=#71717a]
 * @cssproperty {pixel} [--c2-tag-input__input--min-width=80px] - Narrowest the input gets before it wraps to a new line.
 *
 * @cssproperty {border} [--c2-tag-input__hover--border-top=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-tag-input__hover--border-right=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-tag-input__hover--border-bottom=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-tag-input__hover--border-left=1px solid #a1a1aa]
 *
 * @cssproperty {border} [--c2-tag-input__focus--border-top=1px solid #476ef9]
 * @cssproperty {border} [--c2-tag-input__focus--border-right=1px solid #476ef9]
 * @cssproperty {border} [--c2-tag-input__focus--border-bottom=1px solid #476ef9]
 * @cssproperty {border} [--c2-tag-input__focus--border-left=1px solid #476ef9]
 * @cssproperty {outline} [--c2-tag-input__focus--outline=3px solid rgba(71, 110, 249, 0.2)]
 *
 * @cssproperty {border} [--c2-tag-input__error--border-top=1px solid #dc2626]
 * @cssproperty {border} [--c2-tag-input__error--border-right=1px solid #dc2626]
 * @cssproperty {border} [--c2-tag-input__error--border-bottom=1px solid #dc2626]
 * @cssproperty {border} [--c2-tag-input__error--border-left=1px solid #dc2626]
 * @cssproperty {outline} [--c2-tag-input__error__focus--outline=3px solid rgba(220, 38, 38, 0.2)]
 *
 * @cssproperty {border} [--c2-tag-input__read-only--border-top=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-tag-input__read-only--border-right=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-tag-input__read-only--border-bottom=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-tag-input__read-only--border-left=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-tag-input__read-only--background=#fafafa]
 *
 * @cssproperty {opacity} [--c2-tag-input__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-tag-input__icon--size=16px]
 * @cssproperty {color} [--c2-tag-input__icon--color=#71717a]
 *
 * @cssproperty {pixel} [--c2-tag-input__tag--height=24px]
 * @cssproperty {pixel} [--c2-tag-input__tag--gap=2px] - Space between a tag's text and its remove button.
 * @cssproperty {padding} [--c2-tag-input__tag--padding-left=8px]
 * @cssproperty {padding} [--c2-tag-input__tag--padding-right=2px]
 * @cssproperty {border-radius} [--c2-tag-input__tag--border-radius=4px]
 * @cssproperty {border} [--c2-tag-input__tag--border=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-tag-input__tag--background=#f4f4f5]
 * @cssproperty {color} [--c2-tag-input__tag--color=#18181b]
 * @cssproperty {font-size} [--c2-tag-input__tag--font-size=12px]
 * @cssproperty {font-weight} [--c2-tag-input__tag--font-weight=500]
 * @cssproperty {pixel} [--c2-tag-input__tag--max-width=240px] - Longer tags are truncated with an ellipsis.
 * @cssproperty {outline} [--c2-tag-input__tag__focus--outline=2px solid rgba(71, 110, 249, 0.4)]
 * @cssproperty {border} [--c2-tag-input__tag__invalid--border=1px solid #dc2626]
 * @cssproperty {color} [--c2-tag-input__tag__invalid--background=#ffffff]
 * @cssproperty {color} [--c2-tag-input__tag__invalid--color=#dc2626]
 *
 * @cssproperty {pixel} [--c2-tag-input__remove-icon--size=14px]
 * @cssproperty {color} [--c2-tag-input__remove-icon--color=#71717a]
 * @cssproperty {color} [--c2-tag-input__remove-icon__hover--color=#18181b]
 */
@customElement('c2-tag-input')
export class TagInput extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private customValidityMessage = ''
  private defaultValue: string[] = []
  @state() private disabledByForm = false
  @state() private focused = false
  @state() private text = ''
  /** Set when the last commit refused invalid text, which stays in the input; cleared by the next edit. */
  @state() private rejected = false

  @query('.input') private readonly input?: HTMLInputElement | null

  // Data

  /** The tags. In markup, separate them with semicolons. */
  @property({ converter: arrayPropertyConverter }) value: string[] = []

  /** Form field name. Each tag is submitted as its own entry under this name. */
  @property({ type: String }) name = ''

  /** Text shown in the input while there are no tags. */
  @property({ type: String }) placeholder = ''

  /** Accessible name forwarded to the input. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  // Splitting

  /** Every character in this string commits the pending text as a tag when typed, and splits pasted text. Enter always commits. */
  @property({ type: String }) delimiters = ','

  /** Regular expression source that splits text into tags, e.g. `[\s,;]+`. Takes precedence over `delimiters`. */
  @property({ attribute: 'split-pattern' }) splitPattern = ''

  /** Normalizes each token before it becomes a tag. Returning `null` or `''` drops the token. Property only. */
  @property({ attribute: false }) parseTag?: TagInputParser

  /** Commits the pending text when the input loses focus. */
  @property({ type: Boolean, attribute: 'add-on-blur' }) addOnBlur = false

  // Validation

  /** Regular expression every tag must match, anchored like the native `pattern` attribute. */
  @property({ type: String }) pattern = ''

  /** Custom tag validation, run after `pattern`. Return `true`, or `false` / a message for an invalid tag. Property only. */
  @property({ attribute: false }) validator?: TagInputValidator

  /** Refuses invalid tags: their text stays in the input instead of becoming a marked tag. */
  @property({ type: Boolean, attribute: 'reject-invalid' }) rejectInvalid = false

  /** Allows the same tag more than once. */
  @property({ type: Boolean, attribute: 'allow-duplicates' }) allowDuplicates = false

  /** Maximum number of tags; `-1` for no limit. The input is hidden once the limit is reached. */
  @property({ type: Number }) max = -1

  /** Requires at least one tag for the form to be valid. */
  @property({ type: Boolean, reflect: true }) required = false

  // State

  /** Disables the field. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Shows the tags but refuses edits. */
  @property({ type: Boolean, reflect: true, attribute: 'readonly' }) readOnly = false

  /** Marks the field invalid (red border). Invalid tags set it implicitly. */
  @property({ type: Boolean, reflect: true }) error = false

  /** The containing form, when this control is associated with one. */
  get form() {
    return this.internals.form
  }

  /** Labels associated with this form control. */
  get labels() {
    return this.internals.labels
  }

  get validity() {
    return this.internals.validity
  }

  get validationMessage() {
    return this.internals.validationMessage
  }

  get willValidate() {
    return this.internals.willValidate
  }

  /** The text typed in the input that has not become a tag yet. */
  get inputValue() {
    return this.text
  }

  set inputValue(text: string) {
    this.text = text
  }

  /** The tags that fail `pattern` or `validator`. */
  get invalidTags(): string[] {
    return this.value.filter((tag) => this.validate(tag) !== true)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.defaultValue = arrayPropertyConverter.fromAttribute(this.getAttribute('value') ?? '')
  }

  formResetCallback() {
    this.value = [...this.defaultValue]
    this.text = ''
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (state instanceof FormData) this.value = state.getAll(this.name).filter((entry): entry is string => typeof entry === 'string')
    else if (typeof state === 'string') this.value = arrayPropertyConverter.fromAttribute(state)
  }

  /** Checks all current constraints and fires `invalid` on this element when they fail. */
  checkValidity() {
    return this.internals.checkValidity()
  }

  /** Checks all current constraints and asks the browser to show validation feedback. */
  reportValidity() {
    return this.internals.reportValidity()
  }

  /** Sets or clears a custom validation error. */
  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.syncFormState()
  }

  override focus(options?: FocusOptions): void {
    this.input?.focus(options)
  }

  override blur(): void {
    this.input?.blur()
  }

  /**
   * Adds tags as if the user had entered them: each goes through `parseTag`, validation, the duplicate and `max`
   * checks and a `tag-add` event. Returns the tags that were added.
   */
  addTags(tags: string | string[]): string[] {
    const tokens = typeof tags === 'string' ? this.split(tags) : tags
    const { added } = this.commitTokens(tokens)
    return added
  }

  /** Removes the tag at `index` as if the user had removed it. Returns whether it was removed. */
  removeTag(index: number): boolean {
    const tag = this.value[index]
    if (tag === undefined) return false
    const event = new CustomEvent<TagInputRemoveEventDetail>('tag-remove', {
      detail: { value: tag, index },
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    if (!this.dispatchEvent(event)) return false
    this.value = this.value.filter((_, i) => i !== index)
    this.emitValueChange()
    return true
  }

  /** Commits the pending text in the input. */
  commit() {
    this.commitText(this.text, true)
  }

  // Splitting

  private get splitter(): RegExp {
    if (this.splitPattern) {
      try {
        return new RegExp(this.splitPattern)
      } catch {
        // An invalid pattern falls back to the delimiters.
      }
    }
    const delimiters = this.delimiters ?? ''
    return delimiters ? new RegExp(`[${escapeForCharacterClass(delimiters)}]`) : /(?!)/
  }

  /** Splits text on the delimiters, and on line breaks and tabs (pasted text). */
  private split(text: string): string[] {
    return text.split(/[\r\n\t]+/).flatMap((line) => line.split(this.splitter))
  }

  private toTag(token: string): string | null {
    const trimmed = token.trim()
    if (!trimmed) return null
    const parsed = this.parseTag ? this.parseTag(trimmed) : trimmed
    return parsed ? parsed.trim() || null : null
  }

  private validate(tag: string): true | string {
    if (this.pattern) {
      try {
        if (!new RegExp(`^(?:${this.pattern})$`, 'u').test(tag)) return `"${tag}" is not valid.`
      } catch {
        // An invalid pattern is ignored, as the native attribute does.
      }
    }
    const result = this.validator?.(tag) ?? true
    if (result === true) return true
    return typeof result === 'string' && result ? result : `"${tag}" is not valid.`
  }

  private get isFull() {
    return this.max > -1 && this.value.length >= this.max
  }

  /**
   * Turns tokens into tags. Returns the tags added and the tokens refused (rejected invalid tags, vetoed tags and
   * tokens over the limit), which the caller keeps in the input.
   */
  private commitTokens(tokens: string[]): { added: string[]; refused: string[] } {
    const added: string[] = []
    const refused: string[] = []
    const next = [...this.value]
    for (const token of tokens) {
      const tag = this.toTag(token)
      if (tag === null) continue
      if (!this.allowDuplicates && next.includes(tag)) continue
      if (this.max > -1 && next.length >= this.max) {
        refused.push(token.trim())
        continue
      }
      const valid = this.validate(tag) === true
      if (!valid && this.rejectInvalid) {
        refused.push(token.trim())
        continue
      }
      const event = new CustomEvent<TagInputAddEventDetail>('tag-add', { detail: { value: tag, valid }, bubbles: true, composed: true, cancelable: true })
      if (!this.dispatchEvent(event)) {
        refused.push(token.trim())
        continue
      }
      next.push(tag)
      added.push(tag)
    }
    if (added.length) {
      this.value = next
      this.emitValueChange()
    }
    return { added, refused }
  }

  /**
   * Commits every complete piece of `text`. With `final` the trailing piece is committed too; otherwise it stays in the
   * input as the text being typed.
   */
  private commitText(text: string, final: boolean) {
    const pieces = this.split(text)
    const pending = final ? '' : (pieces.pop() ?? '')
    const { refused } = this.commitTokens(pieces)
    this.rejected = refused.length > 0
    this.text = refused.length ? [...refused, pending.trimStart()].filter(Boolean).join(this.joiner) : pending
  }

  /** What joins refused tokens back together in the input. */
  private get joiner() {
    const first = this.splitPattern ? ',' : (this.delimiters ?? '').charAt(0) || ','
    return first === ' ' ? ' ' : `${first} `
  }

  private emitValueChange() {
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true }))
  }

  // Event handlers

  private handleInput(event: Event) {
    // The native `input`/`change` of the inner input are about the pending text, not the value.
    event.stopPropagation()
    const text = (event.target as HTMLInputElement).value
    this.rejected = false
    if (this.split(text).length > 1) this.commitText(text, false)
    else this.text = text
  }

  private handlePaste(event: ClipboardEvent) {
    const pasted = event.clipboardData?.getData('text/plain')
    if (!pasted || this.split(pasted).length < 2 || !this.input) return
    event.preventDefault()
    const { selectionStart, selectionEnd, value } = this.input
    const before = value.slice(0, selectionStart ?? value.length)
    const after = value.slice(selectionEnd ?? value.length)
    // Keep what follows the caret as the pending text; everything before it and the pasted pieces commit.
    this.commitText(`${before}${pasted}\n${after}`, false)
  }

  private handleInputKeydown(event: KeyboardEvent) {
    if (event.isComposing) return
    const input = event.target as HTMLInputElement
    if (event.key === 'Enter') {
      if (!this.text.trim()) return
      event.preventDefault()
      this.commit()
      return
    }
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0
    if ((event.key === 'Backspace' && !input.value) || (event.key === 'ArrowLeft' && atStart)) {
      if (!this.value.length) return
      event.preventDefault()
      this.focusTag(this.value.length - 1)
    }
  }

  private handleTagKeydown(event: KeyboardEvent, index: number) {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        this.focusTag(Math.max(0, index - 1))
        break
      case 'ArrowRight':
        event.preventDefault()
        this.focusTag(index + 1)
        break
      case 'Home':
        event.preventDefault()
        this.focusTag(0)
        break
      case 'End':
        event.preventDefault()
        this.focusTag(this.value.length)
        break
      case 'Backspace':
      case 'Delete':
        event.preventDefault()
        if (this.isEditable && this.removeTag(index)) {
          this.focusTag(event.key === 'Backspace' ? Math.max(0, index - 1) : index, this.value.length === 0)
        }
        break
      case 'Enter':
        event.preventDefault()
        this.editTag(index)
        break
    }
  }

  /** Removes a tag and puts its text into the input. */
  private editTag(index: number) {
    const tag = this.value[index]
    if (tag === undefined || !this.isEditable || this.text.trim()) return
    if (!this.removeTag(index)) return
    this.text = tag
    this.updateComplete.then(() => {
      this.input?.focus()
      this.input?.select()
    })
  }

  private handleRemoveClick(event: Event, index: number) {
    event.stopPropagation()
    if (!this.isEditable) return
    if (this.removeTag(index)) this.updateComplete.then(() => this.input?.focus())
  }

  /** Focuses the tag at `index`, or the input when `index` is past the last tag. */
  private async focusTag(index: number, preferInput = false) {
    await this.updateComplete
    const tags = this.renderRoot.querySelectorAll<HTMLElement>('.tag')
    const tag = preferInput ? undefined : tags[index]
    if (tag) tag.focus()
    else this.input?.focus()
  }

  private handleFieldClick(event: Event) {
    if (event.defaultPrevented || (event.target as Element).closest?.('.tag')) return
    this.input?.focus()
  }

  private handleFocusin() {
    this.focused = true
  }

  private handleFocusout(event: FocusEvent) {
    const next = event.relatedTarget as Node | null
    if (next && this.renderRoot.contains(next)) return
    this.focused = false
    if (this.addOnBlur && this.text.trim() && this.isEditable) this.commit()
  }

  // State

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  private get isEditable() {
    return !this.effectiveDisabled && !this.readOnly
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('value') && !Array.isArray(this.value)) this.value = arrayPropertyConverter.fromAttribute(String(this.value ?? ''))
  }

  protected override updated(): void {
    this.syncFormState()
  }

  private syncFormState() {
    const entries = new FormData()
    for (const tag of this.value) entries.append(this.name, tag)
    const serialized = this.value.join(';')
    this.internals.setFormValue(this.effectiveDisabled || !this.name ? null : entries, serialized)

    if (this.effectiveDisabled) {
      this.internals.setValidity({})
      return
    }
    const invalid = this.value.map((tag) => this.validate(tag)).find((result) => result !== true)
    if (this.customValidityMessage) this.internals.setValidity({ customError: true }, this.customValidityMessage, this.input ?? undefined)
    else if (invalid) this.internals.setValidity({ typeMismatch: true }, invalid, this.input ?? undefined)
    else if (this.required && this.value.length === 0) this.internals.setValidity({ valueMissing: true }, 'Add at least one entry.', this.input ?? undefined)
    else this.internals.setValidity({})
  }

  // Render

  private renderTag(tag: string, index: number) {
    const valid = this.validate(tag) === true
    return html`<li
      class=${classMap({ tag: true, invalid: !valid })}
      part=${valid ? 'tag' : 'tag tag-invalid'}
      tabindex="-1"
      aria-invalid=${valid ? nothing : 'true'}
      @keydown=${(event: KeyboardEvent) => this.handleTagKeydown(event, index)}
      @dblclick=${() => this.editTag(index)}
    >
      <span class="tag-label" part="tag-label" title=${tag}>${tag}</span>
      ${
        this.isEditable
          ? html`<button
              class="remove-button"
              part="remove-button"
              type="button"
              tabindex="-1"
              aria-label="Remove ${tag}"
              @click=${(event: Event) => this.handleRemoveClick(event, index)}
            >
              <slot name="remove-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </slot>
            </button>`
          : nothing
      }
    </li>`
  }

  override render() {
    const invalid = this.error || this.rejected || this.invalidTags.length > 0
    const classes = {
      field: true,
      disabled: this.effectiveDisabled,
      'read-only': this.readOnly,
      error: !this.effectiveDisabled && invalid,
      'focus-within': this.focused,
    }
    const hideInput = this.isFull || this.readOnly
    return html`<div class=${classMap(classes)} part="field" @click=${this.handleFieldClick} @focusin=${this.handleFocusin} @focusout=${this.handleFocusout}>
      <slot name="prefix-icon"></slot>
      ${
        this.value.length
          ? html`<ul class="tags" role="list" aria-label=${ifDefined(this.ariaLabel || undefined)} aria-disabled=${this.effectiveDisabled ? 'true' : nothing}>
              ${repeat(
                this.value,
                (tag, index) => (this.allowDuplicates ? `${index}:${tag}` : tag),
                (tag, index) => this.renderTag(tag, index),
              )}
            </ul>`
          : nothing
      }
      <input
        class="input"
        part="input"
        type="text"
        ?hidden=${hideInput}
        aria-label=${ifDefined(this.ariaLabel || undefined)}
        aria-invalid=${invalid ? 'true' : nothing}
        placeholder=${this.value.length ? nothing : this.placeholder || nothing}
        autocomplete="off"
        ?disabled=${this.effectiveDisabled}
        ?readonly=${this.readOnly}
        .value=${live(this.text)}
        @input=${this.handleInput}
        @change=${(event: Event) => event.stopPropagation()}
        @keydown=${this.handleInputKeydown}
        @paste=${this.handlePaste}
      />
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tag-input': TagInput
  }
}
