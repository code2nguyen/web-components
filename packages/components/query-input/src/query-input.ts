import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { repeat } from 'lit/directives/repeat.js'
import { jsonPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/overlay'
import '@c2n/chip'
import type { Chip } from '@c2n/chip'
import {
  parseQuery,
  quoteQueryValue,
  splitQueryFilters,
  tokenizeQuery,
  unquoteQueryValue,
  type QueryFilter,
  type QueryTerm,
  type QueryToken,
} from './query-syntax.js'
import styles from './query-input.scss?inline'

export * from './query-syntax.js'

/** A value suggested for a field: a plain string, or a value with a label and a description. */
export interface QueryFieldValue {
  /** What is written into the query (quoted when it contains whitespace). */
  value: string
  /** Shown in place of the value in the suggestions. */
  label?: string
  /** Secondary text shown next to the suggestion. */
  description?: string
}

/** A field the query can filter on: offered as a key, and its `values` offered after the colon. */
export interface QueryField {
  /**
   * The key written before the colon, e.g. `service` or `@http.status_code`. An empty key (`''`) is the key-less field:
   * typing `:` offers its `values`, and its chips show the value alone.
   */
  key: string
  /** Shown next to the key in the suggestions. */
  label?: string
  /** Secondary text shown next to the key in the suggestions. */
  description?: string
  /** Values suggested after `key:`. */
  values?: (string | QueryFieldValue)[]
}

/** What the caret is completing: a key, or the value of `key`. */
export interface QueryInputSuggestDetail {
  kind: 'key' | 'value'
  /** The field whose value is being typed (`''` for the key-less field), or `null` while a key is typed. */
  key: string | null
  /** The part of the key or value before the caret, unquoted. */
  prefix: string
}

/** A `key:value` term shown as a chip, and whether it currently takes part in the query. */
export interface QueryInputFilter extends QueryFilter {
  /** Off when the chip was switched off: it stays in the field but is left out of `value`. */
  active: boolean
}

export interface QueryInputSearchDetail {
  /** The query to run: the active chips, then the text. */
  value: string
  /** The terms of `value`, in order. */
  terms: QueryTerm[]
  /** Every chip, switched off ones included. */
  filters: QueryInputFilter[]
  /** `submit` on Enter, `clear` when the field was emptied, `toggle` or `remove` when a chip was switched or removed. */
  trigger: 'submit' | 'clear' | 'toggle' | 'remove'
}

/** Events fired by {@link QueryInput}, keyed for `addEventListener`. */
export interface QueryInputEventMap {
  input: Event
  change: Event
  search: CustomEvent<QueryInputSearchDetail>
  suggest: CustomEvent<QueryInputSuggestDetail>
  clear: Event
}

export interface QueryInput {
  addEventListener: TypedAddEventListener<QueryInput, QueryInputEventMap>
  removeEventListener: TypedRemoveEventListener<QueryInput, QueryInputEventMap>
}

interface Completion extends QueryInputSuggestDetail {
  /** The range of the query a picked suggestion replaces. */
  from: number
  to: number
}

interface Suggestion {
  /** The text inserted for a value, the key for a key. */
  insert: string
  label: string
  description?: string
}

/**
 * A query field in the `key:value` syntax of Datadog, GitHub and Sentry: `service:web -status:>=500 "timed out"`.
 *
 * Each `key:value` term that stands on its own becomes a `c2-chip` in front of the text: click it (or press Enter or
 * Space on it) to switch it off and on, and use its cross (or Backspace / Delete) to remove it. A switched-off chip
 * stays in the field, struck through, but is left out of `value`, the form value and `search`; `filters` lists every
 * chip with its `active` flag. A term becomes a chip when its value is picked from the suggestions, when Enter runs the
 * query, when focus leaves the field, and when `value` is set. Terms joined by `AND`/`OR`, after `NOT` or inside
 * parentheses stay text, since they cannot be switched off alone. **Backspace** at the start of the text puts the last
 * chip back into the text for editing, and **ArrowLeft** there moves to the chips.
 *
 * The text is coloured as it is typed (keys, values, comparators, `AND`/`OR`/`NOT`, negations, free text), and the
 * fields listed in `fields` are offered as the caret moves: their keys while a word is typed, and their `values` right
 * after `key:`. Arrow keys move through the suggestions, **Enter** or **Tab** inserts one, and **Enter** with none
 * active runs the query: `search` fires with the query and its parsed `terms`. **Escape** closes the suggestions, then
 * clears the field.
 *
 * `fields` is JSON as an attribute (`[{"key":"service","values":["web","api"]}]`) or an array as a property. With
 * `fields` set, a key that is not one of them is underlined as unknown, as is an unterminated quote, and the host
 * matches `:state(invalid)`. Values that must be fetched can follow the `suggest` event, which reports the key and
 * prefix the caret is completing whenever they change: update that field's `values` in response.
 *
 * A field whose `key` is `''` is the key-less field: a colon at the start of a word (`:web`) is a term on it, so typing
 * `:` offers its values, and its chip shows the value without key or colon. It is not listed among the keys.
 *
 * The syntax helpers behind it, `tokenizeQuery` and `parseQuery`, are exported for use on the server. `input` and
 * `change` are re-dispatched from the inner input, and the element is form-associated (`name`). The host exposes
 * `:state(focus-within)`, `:state(expanded)`, `:state(invalid)` and `:state(disabled)`.
 *
 * Chips are styled with `--c2-query-input__filter--*`. A term still being typed is drawn on a lighter chip inside the
 * text (`--c2-query-input__term--*`); that highlighting sits under a transparent input, so it changes colours,
 * backgrounds, rings and decorations only: anything that changes the width of a character would misalign the caret.
 * Its room comes from `--c2-query-input--word-spacing`, which the input shares.
 *
 * @tag c2-query-input
 *
 * @slot search-icon - Replaces the magnifier at the start of the field.
 * @slot clear-icon - Replaces the cross of the clear button.
 * @slot suffix-icon - Icon or control at the end of the field, after the clear button (a help link, a run button).
 *
 * @event {Event} input - Re-dispatched from the inner input on every keystroke; also fired when a suggestion, a chip or the clear button changes the value.
 * @event {Event} change - Re-dispatched from the inner input when the value is committed; also fired when a suggestion, a chip or the clear button changes the value.
 * @event {CustomEvent<QueryInputSearchDetail>} search - The query to run, with its parsed `terms` and every chip in `filters`: on Enter, when a chip is switched or removed, and with an empty value when cleared. Does not bubble; listen on the element.
 * @event {CustomEvent<QueryInputSuggestDetail>} suggest - The key or value the caret is completing changed: `kind`, `key` and `prefix`. Update `fields` in response to suggest values fetched on demand. Does not bubble.
 * @event {Event} clear - Fired when the clear button or Escape emptied the field, before `input`, `change` and `search`.
 *
 * @cssproperty {pixel} [--c2-query-input--min-height=36px]
 * @cssproperty {padding} [--c2-query-input--padding=4px 10px]
 * @cssproperty {pixel} [--c2-query-input--gap=8px] - Space between the icons and the query.
 * @cssproperty {color} [--c2-query-input--color=#18181b] - Colour of free text and of the caret.
 * @cssproperty {color} [--c2-query-input--background=#ffffff]
 * @cssproperty {border} [--c2-query-input--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-query-input--border-radius=6px]
 * @cssproperty {font-size} [--c2-query-input--font-size=14px]
 * @cssproperty {font-family} --c2-query-input--font-family - Font of the field and the suggestions; a monospace font suits long queries.
 * @cssproperty {color} [--c2-query-input__placeholder--color=#71717a]
 * @cssproperty {border} [--c2-query-input__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-query-input__focus--border=1px solid rgb(2, 101, 220)]
 * @cssproperty {color} --c2-query-input__focus--background
 * @cssproperty {outline} [--c2-query-input__focus--outline=none]
 * @cssproperty {opacity} [--c2-query-input__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-query-input__selection--background=rgba(2, 101, 220, 0.2)] - Background of selected text.
 *
 * @cssproperty {pixel} [--c2-query-input__icon--size=16px]
 * @cssproperty {color} [--c2-query-input__icon--color=#71717a]
 * @cssproperty {color} [--c2-query-input__clear-icon--color=#a1a1aa]
 * @cssproperty {color} [--c2-query-input__clear-icon__hover--color=#18181b]
 *
 * @cssproperty {pixel} [--c2-query-input__filter--height=24px] - Height of a `key:value` chip.
 * @cssproperty {padding} [--c2-query-input__filter--padding-inline=8px]
 * @cssproperty {border-radius} [--c2-query-input__filter--border-radius=4px]
 * @cssproperty {border} [--c2-query-input__filter--border=1px solid transparent]
 * @cssproperty {color} [--c2-query-input__filter--background=#f4f4f5]
 * @cssproperty {color} [--c2-query-input__filter__hover--background=#e4e4e7]
 * @cssproperty {color} [--c2-query-input__filter__negated--background=rgba(207, 34, 46, 0.1)] - Chip of a negated term (`-key:value`).
 * @cssproperty {border} [--c2-query-input__filter__inactive--border=1px dashed #bcbcc6] - Chip switched off.
 * @cssproperty {color} [--c2-query-input__filter__inactive--background=transparent]
 * @cssproperty {color} [--c2-query-input__filter__inactive--color=#71717a] - Text of a chip switched off, which is also struck through.
 * @cssproperty {border} [--c2-query-input__filter__invalid--border=1px solid #cf222e] - Chip whose key is not one of `fields`.
 * @cssproperty {outline} [--c2-query-input__filter__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-query-input__filter--gap=4px] - Space between the chips and the text.
 * @cssproperty {color} [--c2-query-input__term--background=#f4f4f5] - The chip drawn behind a `key:value` term still in the text.
 * @cssproperty {color} [--c2-query-input__term__negated--background=rgba(207, 34, 46, 0.1)] - The same, for a negated term (`-key:value`).
 * @cssproperty {border-radius} [--c2-query-input__term--border-radius=4px]
 * @cssproperty {pixel} [--c2-query-input__term--outset=2px] - How far the chip reaches around its text. Drawn as a ring, so it never moves the caret; keep it at most half of `word-spacing` plus a space.
 * @cssproperty {pixel} [--c2-query-input--word-spacing=4px] - Extra space between words, which leaves room between the chips. Applied to the input as well, so the caret stays on its letter.
 * @cssproperty {color} [--c2-query-input__key--color=#0550ae] - The field name before the colon.
 * @cssproperty {color} [--c2-query-input__separator--color=#71717a] - The colon between key and value.
 * @cssproperty {color} [--c2-query-input__comparator--color=#b35900] - `>`, `>=`, `<`, `<=` and `=` before a value.
 * @cssproperty {color} [--c2-query-input__value--color=#116329] - The value of a `key:value` term.
 * @cssproperty {color} --c2-query-input__text--color - Free text and quoted phrases; inherits the field colour.
 * @cssproperty {color} [--c2-query-input__operator--color=#6f42c1] - `AND`, `OR` and `NOT`.
 * @cssproperty {color} [--c2-query-input__negation--color=#cf222e] - The `-` or `!` that negates a term.
 * @cssproperty {color} [--c2-query-input__paren--color=#71717a]
 * @cssproperty {color} [--c2-query-input__invalid--color=#cf222e] - Wavy underline of an unknown key or an unterminated quote.
 *
 * @cssproperty {color} [--c2-query-input__panel--background=#ffffff]
 * @cssproperty {border} [--c2-query-input__panel--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-query-input__panel--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-query-input__panel--box-shadow=0 12px 32px rgba(24, 24, 27, 0.14)]
 * @cssproperty {pixel} [--c2-query-input__panel--max-height=320px]
 * @cssproperty {padding} [--c2-query-input__panel--padding=4px]
 * @cssproperty {pixel} [--c2-query-input__panel--offset=6px] - Gap between the field and the suggestions.
 *
 * @cssproperty {padding} [--c2-query-input__header--padding=6px 8px]
 * @cssproperty {color} [--c2-query-input__header--color=#71717a]
 * @cssproperty {font-size} [--c2-query-input__header--font-size=12px]
 * @cssproperty {font-weight} [--c2-query-input__header--font-weight=500]
 *
 * @cssproperty {pixel} [--c2-query-input__option--min-height=32px]
 * @cssproperty {padding} [--c2-query-input__option--padding=6px 8px]
 * @cssproperty {pixel} [--c2-query-input__option--gap=8px]
 * @cssproperty {border-radius} [--c2-query-input__option--border-radius=4px]
 * @cssproperty {color} [--c2-query-input__option--color=#18181b]
 * @cssproperty {color} [--c2-query-input__option__active--background=#f4f4f5]
 * @cssproperty {color} [--c2-query-input__option-description--color=#71717a]
 * @cssproperty {font-size} [--c2-query-input__option-description--font-size=12px]
 * @cssproperty {font-weight} [--c2-query-input__highlight--font-weight=600] - The part of a suggestion that matches what was typed.
 */
@customElement('c2-query-input')
export class QueryInput extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  /** The query. Setting the attribute after the user has typed no longer updates it, like a native input. */
  @property({ type: String }) value = ''

  /** Text shown while the field is empty. */
  @property({ type: String }) placeholder = ''

  /** Accessible name of the field. Defaults to the placeholder, then to "Search query". */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Form field name: the query is submitted with the form under this name. */
  @property({ type: String }) name = ''

  /** Disables the field and its suggestions. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The fields the query can filter on, offered as keys and, after `key:`, their values. JSON as an attribute. */
  @property({ converter: jsonPropertyConverter }) fields: QueryField[] = []

  /** Most suggestions listed at once. */
  @property({ type: Number, attribute: 'suggestion-limit' }) suggestionLimit = 10

  /** Heading of the suggestions while a key is typed. */
  @property({ attribute: 'fields-label' }) fieldsLabel = 'Fields'

  /** The `key:value` chips in front of the text. */
  @state() private chips: QueryInputFilter[] = []
  /** The text after the chips: the inner input's value. */
  @state() private draft = ''
  @state() private focused = false
  @state() private dismissed = false
  @state() private activeIndex = -1
  @state() private caret = 0
  @state() private disabledByForm = false
  private dirty = false
  private lastSuggest = ''
  private wasKeyless = false
  /** The last `value` this element composed from its chips and text; any other value was set from outside. */
  private composed = ''

  @query('.input') private readonly input?: HTMLInputElement | null
  @query('.field') private readonly field?: HTMLElement | null
  @query('.highlight-text') private readonly highlightText?: HTMLElement | null

  /** The containing form, when this control is associated with one. */
  get form() {
    return this.internals.form
  }

  /** Labels associated with this form control. */
  get labels() {
    return this.internals.labels
  }

  /** The terms of the current query. */
  get terms(): QueryTerm[] {
    return parseQuery(this.value, this.syntax)
  }

  /** Every `key:value` chip, in order, with whether it is switched on. */
  get filters(): QueryInputFilter[] {
    return this.chips.map((chip) => ({ ...chip }))
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    // After user input, the value attribute no longer drives the value (until reset), like a native <input>.
    if (name === 'value' && this.dirty) return
    super.attributeChangedCallback(name, oldValue, newValue)
  }

  override focus(options?: FocusOptions) {
    this.input?.focus(options)
  }

  override blur() {
    this.input?.blur()
  }

  /** Selects the whole query. */
  select() {
    this.input?.select()
  }

  /** Empties the field as the clear button does: fires `clear`, `input`, `change` and `search`. */
  clear() {
    if (!this.value && !this.chips.length && !this.draft) return
    this.setParts([], '')
    this.caret = 0
    this.dirty = true
    this.activeIndex = -1
    this.dispatchEvent(new Event('clear', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    this.emitSearch('clear')
  }

  formResetCallback() {
    this.dirty = false
    // Rebuilt from the attribute even when the text matches, so switched-off chips come back on.
    this.composed = '\u0000'
    this.value = this.getAttribute('value') ?? ''
    this.requestUpdate('value', '\u0000')
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled
  }

  formStateRestoreCallback(restored: string | File | FormData | null) {
    if (typeof restored === 'string') this.value = restored
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  private get fieldList(): QueryField[] {
    return Array.isArray(this.fields) ? this.fields : []
  }

  /** Whether a field has the empty key, so `:value` is read as a term on it. */
  private get keyless() {
    return this.fieldList.some((field) => field.key === '')
  }

  private get syntax() {
    return { keyless: this.keyless }
  }

  private get tokens(): QueryToken[] {
    return tokenizeQuery(this.draft, this.syntax)
  }

  /** Replaces the chips and the text, and recomposes `value` from them. */
  private setParts(chips: QueryInputFilter[], draft: string) {
    this.chips = chips
    this.draft = draft
    this.composed = [...chips.filter((chip) => chip.active).map((chip) => chip.text), draft.trim()].filter(Boolean).join(' ')
    this.value = this.composed
  }

  /**
   * Turns the standalone terms of the text into chips (those `accept` takes), keeping the caret on the same character.
   * Returns the caret's new offset.
   */
  private commitFilters(accept?: (start: number, end: number) => boolean, caret = this.caret) {
    const split = splitQueryFilters(this.draft, caret, accept, this.syntax)
    if (!split.filters.length) return caret
    this.setParts([...this.chips, ...split.filters.map((filter) => ({ ...filter, active: true }))], split.rest)
    return split.caret
  }

  private isInvalidKey(key: string) {
    const fields = this.fieldList
    return fields.length > 0 && !fields.some((field) => field.key === key)
  }

  private get invalid() {
    return this.chips.some((chip) => this.isInvalidKey(chip.key)) || this.tokens.some((token) => this.isInvalid(token))
  }

  /** Whether a token is marked invalid: an unknown key while `fields` is set, or an unterminated quote. */
  private isInvalid(token: QueryToken) {
    if (token.unterminated) return true
    return token.type === 'key' && this.isInvalidKey(token.text)
  }

  /** What the caret is completing, or `undefined` where nothing is suggested (inside a quoted phrase, on an operator). */
  private completionAt(caret: number): Completion | undefined {
    const tokens = this.tokens
    const token = tokens.find((candidate) => candidate.type !== 'whitespace' && candidate.start < caret && caret <= candidate.end)
    const keyCompletion = (from: number, to: number): Completion => ({ kind: 'key', key: null, prefix: this.draft.slice(from, caret), from, to })
    if (!token || token.type === 'paren') {
      const next = tokens.find((candidate) => candidate.start === caret && candidate.type !== 'whitespace' && candidate.type !== 'paren')
      // Right before a word: completing it would split it, so suggest nothing.
      return next ? undefined : keyCompletion(caret, caret)
    }
    switch (token.type) {
      case 'text': {
        if (token.text.startsWith('"')) return undefined
        // "-" or "!" typed on its own is the start of a negated term.
        const from = /^[-!]/.test(token.text) ? token.start + 1 : token.start
        return keyCompletion(from, token.end)
      }
      case 'key': {
        const separator = tokens[tokens.indexOf(token) + 1]
        return keyCompletion(token.start, separator?.end ?? token.end)
      }
      case 'separator':
      case 'comparator': {
        const next = tokens[tokens.indexOf(token) + 1]
        const to = next?.type === 'value' && next.start === caret ? next.end : caret
        return { kind: 'value', key: token.key ?? null, prefix: '', from: caret, to }
      }
      case 'value':
        return { kind: 'value', key: token.key ?? null, prefix: unquoteQueryValue(token.text.slice(0, caret - token.start)), from: token.start, to: token.end }
      default:
        return undefined
    }
  }

  private get completion(): Completion | undefined {
    if (!this.focused) return undefined
    const input = this.input
    if (input && input.selectionStart !== input.selectionEnd) return undefined
    return this.completionAt(this.caret)
  }

  private get suggestions(): Suggestion[] {
    const completion = this.completion
    if (!completion) return []
    const prefix = completion.prefix.toLocaleLowerCase()
    const limit = Math.max(0, this.suggestionLimit)
    if (completion.kind === 'key') {
      return this.fieldList
        .filter((field) => field.key !== '')
        .filter((field) => !prefix || field.key.toLocaleLowerCase().includes(prefix) || field.label?.toLocaleLowerCase().includes(prefix))
        .slice(0, limit)
        .map((field) => ({ insert: field.key, label: field.key, description: field.label ?? field.description }))
    }
    const field = this.fieldList.find((candidate) => candidate.key === completion.key)
    return (field?.values ?? [])
      .map((value) => (typeof value === 'string' ? { value } : value))
      .filter((value) => !prefix || value.value.toLocaleLowerCase().includes(prefix) || value.label?.toLocaleLowerCase().includes(prefix))
      .slice(0, limit)
      .map((value) => ({ insert: value.value, label: value.label ?? value.value, description: value.description }))
  }

  private get open() {
    return this.focused && !this.dismissed && !this.effectiveDisabled && this.suggestions.length > 0
  }

  private emitSearch(trigger: QueryInputSearchDetail['trigger']) {
    this.dispatchEvent(
      new CustomEvent<QueryInputSearchDetail>('search', {
        detail: { value: this.value, terms: parseQuery(this.value, this.syntax), filters: this.filters, trigger },
      }),
    )
  }

  private emitValueEvents() {
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  private toggleFilter(index: number, active: boolean) {
    const chips = this.chips.map((chip, at) => (at === index ? { ...chip, active } : chip))
    this.dirty = true
    this.setParts(chips, this.draft)
    this.emitValueEvents()
    this.emitSearch('toggle')
  }

  private async removeFilter(index: number) {
    this.dirty = true
    this.setParts(
      this.chips.filter((_chip, at) => at !== index),
      this.draft,
    )
    this.emitValueEvents()
    this.emitSearch('remove')
    await this.updateComplete
    // Keep keyboard focus in the field: on the chip that took this one's place, or the text.
    const chips = this.chipElements
    ;(chips[Math.min(index, chips.length - 1)] ?? this.input)?.focus()
  }

  /** Puts the last chip back at the start of the text, caret after it, for editing. */
  private async editLastFilter() {
    const chip = this.chips[this.chips.length - 1]
    if (!chip) return
    this.dirty = true
    this.setParts(this.chips.slice(0, -1), this.draft ? `${chip.text} ${this.draft}` : chip.text)
    if (!chip.active) this.emitValueEvents()
    await this.updateComplete
    this.input?.focus()
    this.input?.setSelectionRange(chip.text.length, chip.text.length)
    this.caret = chip.text.length
    this.dismissed = false
  }

  private get chipElements(): Chip[] {
    return [...this.renderRoot.querySelectorAll<Chip>('c2-chip.filter')]
  }

  private handleChipKeydown(event: KeyboardEvent, index: number) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next = index + (event.key === 'ArrowRight' ? 1 : -1)
    if (next < 0) return
    const chip = this.chipElements[next]
    if (chip) {
      chip.focus()
      return
    }
    this.input?.focus()
    this.input?.setSelectionRange(0, 0)
  }

  /** Fires `suggest` when the key or value the caret is completing changed. */
  private emitSuggest() {
    const completion = this.focused && !this.effectiveDisabled ? this.completion : undefined
    const signature = completion ? JSON.stringify([completion.kind, completion.key, completion.prefix]) : ''
    if (signature === this.lastSuggest) return
    this.lastSuggest = signature
    if (!completion) return
    const { kind, key, prefix } = completion
    this.dispatchEvent(new CustomEvent<QueryInputSuggestDetail>('suggest', { detail: { kind, key, prefix } }))
  }

  private async pick(suggestion: Suggestion) {
    const completion = this.completion
    if (!completion) return
    const before = this.draft.slice(0, completion.from)
    let after = this.draft.slice(completion.to)
    let insert: string
    let caret: number
    if (completion.kind === 'key') {
      insert = `${suggestion.insert}:`
      caret = before.length + insert.length
    } else {
      // A value completes the term: leave the caret after a space, ready for the next one.
      insert = quoteQueryValue(suggestion.insert)
      if (!/^\s/.test(after)) after = ` ${after}`
      caret = before.length + insert.length + 1
    }
    this.setParts(this.chips, before + insert + after)
    this.dirty = true
    this.activeIndex = -1
    // After a value the term is complete: it becomes a chip when it stands on its own, and the list closes until the
    // user types again.
    if (completion.kind === 'value') {
      this.dismissed = true
      caret = this.commitFilters((start, end) => start <= completion.from && completion.from <= end, caret)
    }
    this.emitValueEvents()
    await this.updateComplete
    this.input?.focus()
    this.input?.setSelectionRange(caret, caret)
    this.caret = caret
    this.syncScroll()
  }

  private readCaret() {
    const input = this.input
    if (!input) return
    const caret = input.selectionStart ?? input.value.length
    if (caret !== this.caret) {
      // Moving the caret into another term reopens the list for whatever it now completes.
      this.caret = caret
      this.activeIndex = -1
      this.dismissed = false
    }
    this.syncScroll()
  }

  /** Keeps the highlight layer scrolled with the input when the query is wider than the field. */
  private syncScroll() {
    const input = this.input
    const text = this.highlightText
    if (input && text) text.style.transform = input.scrollLeft ? `translateX(${-input.scrollLeft}px)` : ''
  }

  private handleInput(event: Event) {
    const input = event.target as HTMLInputElement
    this.dirty = true
    this.setParts(this.chips, input.value)
    this.caret = input.selectionStart ?? input.value.length
    this.dismissed = false
    this.activeIndex = -1
    redispatchEvent(this, event)
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.isComposing) return
    const suggestions = this.suggestions
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!suggestions.length) return
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        if (!this.open) {
          this.dismissed = false
          this.activeIndex = step > 0 ? 0 : suggestions.length - 1
          return
        }
        this.activeIndex = this.activeIndex < 0 ? (step > 0 ? 0 : suggestions.length - 1) : (this.activeIndex + step + suggestions.length) % suggestions.length
        return
      }
      case 'Tab': {
        // Tab completes what is being typed; on an untouched list it still moves focus on.
        if (!this.open || event.shiftKey || (this.activeIndex < 0 && !this.completion?.prefix)) return
        event.preventDefault()
        void this.pick(suggestions[Math.max(0, this.activeIndex)])
        return
      }
      case 'Enter': {
        event.preventDefault()
        const active = this.open && this.activeIndex >= 0 ? suggestions[this.activeIndex] : undefined
        if (active) {
          void this.pick(active)
          return
        }
        this.dismissed = true
        this.activeIndex = -1
        this.commitText()
        this.emitSearch('submit')
        return
      }
      case 'Backspace':
      case 'ArrowLeft': {
        const input = this.input
        if (!input || input.selectionStart !== 0 || input.selectionEnd !== 0 || !this.chips.length) return
        event.preventDefault()
        if (event.key === 'Backspace') void this.editLastFilter()
        else this.chipElements[this.chipElements.length - 1]?.focus()
        return
      }
      case 'Escape': {
        if (this.open) {
          event.preventDefault()
          this.dismissed = true
          this.activeIndex = -1
        } else if (this.value || this.draft || this.chips.length) {
          event.preventDefault()
          this.clear()
        }
        return
      }
    }
  }

  private handleFocusin() {
    this.focused = true
    this.dismissed = false
    this.readCaret()
  }

  private handleFocusout() {
    this.focused = false
    this.activeIndex = -1
    this.commitText()
  }

  /** Turns every standalone term of the text into a chip, keeping the text's caret in place. */
  private commitText() {
    const input = this.input
    const caret = this.commitFilters(undefined, input?.selectionStart ?? this.draft.length)
    this.caret = Math.min(caret, this.draft.length)
    if (input && this.focused) void this.updateComplete.then(() => input.setSelectionRange(this.caret, this.caret))
  }

  private handleFieldClick(event: Event) {
    if (event.target === this.input || this.effectiveDisabled) return
    // A click on a chip toggles or removes it; it does not move focus to the text.
    if (event.composedPath().some((node) => node instanceof Element && node.localName === 'c2-chip')) return
    this.input?.focus()
  }

  private handleClearClick(event: Event) {
    event.stopPropagation()
    this.clear()
    this.input?.focus()
  }

  protected override willUpdate(changed: PropertyValues) {
    // A value set from outside (attribute, property, form reset) is split into chips and text again, as it is when a
    // key-less field comes or goes, since that changes what `:value` reads as.
    const keylessChanged = changed.has('fields') && this.keyless !== this.wasKeyless
    this.wasKeyless = this.keyless
    if ((changed.has('value') && this.value !== this.composed) || keylessChanged) {
      const split = splitQueryFilters(this.value, this.value.length, undefined, this.syntax)
      this.setParts(
        split.filters.map((filter) => ({ ...filter, active: true })),
        split.rest.trim(),
      )
    }
  }

  protected override updated(changed: PropertyValues) {
    const states: Record<string, boolean> = {
      'focus-within': this.focused,
      expanded: this.open,
      invalid: this.invalid,
      disabled: this.effectiveDisabled,
    }
    for (const [name, on] of Object.entries(states)) {
      if (on) this.internals.states.add(name)
      else this.internals.states.delete(name)
    }
    this.internals.setFormValue(this.effectiveDisabled ? null : this.value, this.value)
    if (changed.has('draft')) this.syncScroll()
    if (changed.has('activeIndex') && this.activeIndex >= 0) {
      this.renderRoot.querySelector(`#suggestion-${this.activeIndex}`)?.scrollIntoView({ block: 'nearest' })
    }
    if (!isServer) this.emitSuggest()
  }

  private renderHighlighted(text: string, prefix: string) {
    const index = prefix ? text.toLocaleLowerCase().indexOf(prefix.toLocaleLowerCase()) : -1
    if (index < 0) return text
    return html`${text.slice(0, index)}<mark>${text.slice(index, index + prefix.length)}</mark>${text.slice(index + prefix.length)}`
  }

  private renderToken(token: QueryToken) {
    return token.type === 'whitespace' ? token.text : html`<span class="token ${token.type} ${this.isInvalid(token) ? 'invalid' : ''}">${token.text}</span>`
  }

  /** The query as coloured tokens, each `key:value` term (with its negation) wrapped in one chip. */
  private renderTokens() {
    const tokens = this.tokens
    const parts: unknown[] = []
    for (let index = 0; index < tokens.length; index++) {
      const start = tokens[index].type === 'negation' && tokens[index + 1]?.type === 'key' ? index + 1 : index
      if (tokens[start].type !== 'key') {
        parts.push(this.renderToken(tokens[index]))
        continue
      }
      let end = start + 1
      while (tokens[end + 1] && ['separator', 'comparator', 'value'].includes(tokens[end + 1].type) && tokens[end + 1].key === tokens[start].key) end++
      const negated = start > index
      parts.push(html`<span class="term ${negated ? 'negated' : ''}">${tokens.slice(index, end + 1).map((token) => this.renderToken(token))}</span>`)
      index = end
    }
    return parts
  }

  private renderFilter(chip: QueryInputFilter, index: number) {
    const comparator = chip.comparator ?? ''
    const classes = ['filter', chip.active ? '' : 'inactive', chip.negated ? 'negated' : '', this.isInvalidKey(chip.key) ? 'invalid' : ''].join(' ')
    return html`<c2-chip
      class=${classes}
      selectable
      removable
      remove-label="Remove filter"
      .selected=${chip.active}
      ?disabled=${this.effectiveDisabled}
      @change=${(event: Event) => {
        event.stopPropagation()
        this.toggleFilter(index, (event.target as Chip).selected)
      }}
      @remove=${(event: Event) => {
        event.stopPropagation()
        void this.removeFilter(index)
      }}
      @keydown=${(event: KeyboardEvent) => this.handleChipKeydown(event, index)}
      >${chip.negated ? html`<span class="filter-negation">-</span>` : nothing}${
        chip.key ? html`<span class="filter-key">${chip.key}</span><span class="filter-separator">:</span>` : nothing
      }${comparator ? html`<span class="filter-comparator">${comparator}</span>` : nothing}<span class="filter-value"
        >${chip.quoted ? `"${chip.value}"` : chip.value}</span
      ></c2-chip
    >`
  }

  private renderClearButton() {
    if ((!this.value && !this.draft && !this.chips.length) || this.effectiveDisabled) return nothing
    return html`<button class="clear" type="button" aria-label="Clear query" tabindex="-1" @click=${this.handleClearClick}>
      <slot name="clear-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="m15 9-6 6M9 9l6 6"></path>
        </svg>
      </slot>
    </button>`
  }

  private renderPanel() {
    const suggestions = this.suggestions
    const completion = this.completion
    const field = completion?.kind === 'value' ? this.fieldList.find((candidate) => candidate.key === completion.key) : undefined
    const heading = completion?.kind === 'value' ? (field?.label ?? completion.key ?? '') : this.fieldsLabel
    return html`<c2-overlay popover="manual" fit-anchor .anchor=${this.field ?? undefined} .open=${this.open}>
      <div class="panel" @pointerdown=${(event: Event) => event.preventDefault()}>
        <div class="panel-header" id="suggestions-label">${heading}</div>
        <div id="suggestions" class="list" role="listbox" aria-labelledby="suggestions-label">
          ${suggestions.map(
            (suggestion, index) =>
              html`<div
                id=${`suggestion-${index}`}
                class="option ${completion?.kind ?? ''}"
                role="option"
                aria-selected=${index === this.activeIndex ? 'true' : 'false'}
                @pointerenter=${() => (this.activeIndex = index)}
                @click=${() => this.pick(suggestion)}
              >
                <span class="option-label">${this.renderHighlighted(suggestion.label, completion?.prefix ?? '')}</span>
                ${suggestion.description ? html`<span class="option-description">${suggestion.description}</span>` : nothing}
              </div>`,
          )}
        </div>
      </div>
    </c2-overlay>`
  }

  override render() {
    const hasFields = this.fieldList.length > 0
    const open = this.open
    const name = this.ariaLabel || this.placeholder || 'Search query'
    return html`<div class="field" @click=${this.handleFieldClick}>
        <span class="icon" aria-hidden="true">
          <slot name="search-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m20 20-3.5-3.5"></path>
            </svg>
          </slot>
        </span>
        <span class="content">
          ${repeat(
            this.chips,
            // Keyed by text (and occurrence), so removing a chip removes its element rather than relabelling a neighbour.
            (chip, index) => `${chip.text}#${this.chips.slice(0, index).filter((other) => other.text === chip.text).length}`,
            (chip, index) => this.renderFilter(chip, index),
          )}
          <span class="editor">
            <span class="highlight" aria-hidden="true"><span class="highlight-text">${this.renderTokens()}</span></span>
            <input
              class="input"
              type="text"
              role=${ifDefined(hasFields ? 'combobox' : undefined)}
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              enterkeyhint="search"
              aria-label=${name}
              aria-autocomplete=${ifDefined(hasFields ? 'list' : undefined)}
              aria-controls=${ifDefined(hasFields ? 'suggestions' : undefined)}
              aria-expanded=${ifDefined(hasFields ? String(open) : undefined)}
              aria-activedescendant=${ifDefined(open && this.activeIndex >= 0 ? `suggestion-${this.activeIndex}` : undefined)}
              aria-invalid=${this.invalid ? 'true' : nothing}
              name=${ifDefined(this.name || undefined)}
              placeholder=${this.chips.length ? nothing : this.placeholder || nothing}
              .value=${live(this.draft)}
              ?disabled=${this.effectiveDisabled}
              @input=${this.handleInput}
              @change=${(event: Event) => redispatchEvent(this, event)}
              @keydown=${this.handleKeydown}
              @keyup=${this.readCaret}
              @pointerup=${this.readCaret}
              @select=${this.readCaret}
              @scroll=${this.syncScroll}
              @focusin=${this.handleFocusin}
              @focusout=${this.handleFocusout}
            />
          </span>
        </span>
        ${this.renderClearButton()}
        <slot name="suffix-icon"></slot>
      </div>
      ${hasFields ? this.renderPanel() : nothing}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-query-input': QueryInput
  }
}
