import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { getFieldValue } from '@c2n/core/data-helper.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import { arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import type { SelectionChangeEventDetail } from '@c2n/list'
import type { Overlay } from '@c2n/overlay'
import styles from './autocomplete.scss?inline'

import '@c2n/list'
import '@c2n/list-item'
import '@c2n/overlay'

/** Convenient default shape; `suggestions` and `dataSource` may also contain any other item type. */
export interface AutocompleteSuggestion {
  label: string
  description?: string
}

export interface AutocompleteItemContext {
  /** Original item returned by `suggestions` or `dataSource`. */
  item: unknown
  /** Index after filtering. */
  index: number
  /** Current query, so custom renderers can highlight it. */
  search: string
}

/** Returns anything Lit can render. The result is placed inside a real `c2-list-item`. */
export type AutocompleteItemRenderer = (context: AutocompleteItemContext) => unknown
export type AutocompleteMatcher = (item: unknown, query: string) => boolean
export type AutocompleteDataSource = (query: string, signal: AbortSignal) => unknown[] | Promise<unknown[]>
export type AutocompleteSelectionBehavior = 'preserve' | 'replace'

export interface AutocompleteSelectEventDetail {
  value: string
  item: unknown
  index: number
}

/** Events fired by {@link Autocomplete}, keyed for `addEventListener`. */
export interface AutocompleteEventMap {
  'query-change': CustomEvent<{ query: string }>
  'suggestion-select': CustomEvent<AutocompleteSelectEventDetail>
  input: InputEvent
  change: Event
}

export interface Autocomplete {
  addEventListener: TypedAddEventListener<Autocomplete, AutocompleteEventMap>
  removeEventListener: TypedRemoveEventListener<Autocomplete, AutocompleteEventMap>
}

const IMPLICIT_LABEL_FIELDS = ['label', 'name', 'title', 'value']
let autocompleteId = 0

/**
 * A combobox backed by a composed `c2-list` inside `c2-overlay`. As in `c2-virtual-list`, arbitrary objects use
 * `itemKey`, `labelField`, `descriptionField` and `disabledField`; `renderItem({ item, index, search })` replaces only
 * the row content, so selection, keyboard behaviour and accessibility remain owned by the surrounding
 * `c2-list-item`.
 *
 * Local suggestions are filtered in the browser. `dataSource(query, signal)` delegates matching to a server and is
 * debounced; every superseded request is aborted. The overlay is structurally a header slot, the list, and a footer
 * slot, with loading / empty / error states rendered inside the list surface.
 *
 * @tag c2-autocomplete
 *
 * @slot prefix-icon - Icon or adornment shown before the text input.
 * @slot suffix-icon - Icon or adornment shown after the clear button.
 * @slot clear-icon - Replaces the default cross in the clear button.
 * @slot header - Content above the suggestion list, such as filter chips or a result summary.
 * @slot footer - Content below the suggestion list, such as an “all results” action.
 * @slot loading - Replaces the loading message inside the list.
 * @slot empty - Replaces the empty-result message inside the list.
 * @slot error - Replaces the remote-source error message inside the list.
 *
 * @event {CustomEvent<{ query: string }>} query-change - Fired on every user edit, before local filtering or a remote request.
 * @event {CustomEvent<AutocompleteSelectEventDetail>} suggestion-select - Fired after a row is chosen. The detail contains the selected key, original item and visible index.
 * @event {InputEvent} input - Re-dispatched from the inner input on every edit; also fired after a suggestion replaces the value.
 * @event {Event} change - Fired after the typed value is committed or a suggestion replaces it.
 *
 * @cssproperty {pixel} [--c2-autocomplete--min-height=40px]
 * @cssproperty {padding} [--c2-autocomplete--padding=8px 10px]
 * @cssproperty {pixel} [--c2-autocomplete--gap=8px]
 * @cssproperty {color} [--c2-autocomplete--background=#ffffff]
 * @cssproperty {color} [--c2-autocomplete--color=#18181b]
 * @cssproperty {font-size} [--c2-autocomplete--font-size=14px]
 * @cssproperty {border} [--c2-autocomplete--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-autocomplete--border-radius=8px]
 * @cssproperty {border} [--c2-autocomplete__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-autocomplete__focus--border=1px solid rgb(2, 101, 220)]
 * @cssproperty {outline} [--c2-autocomplete__focus--outline=none]
 * @cssproperty {color} [--c2-autocomplete__placeholder--color=#71717a]
 * @cssproperty {opacity} [--c2-autocomplete__disabled--opacity=0.38]
 * @cssproperty {pixel} [--c2-autocomplete__icon--size=18px]
 * @cssproperty {color} [--c2-autocomplete__icon--color=#71717a]
 * @cssproperty {color} [--c2-autocomplete__panel--background=#ffffff]
 * @cssproperty {border} [--c2-autocomplete__panel--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-autocomplete__panel--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-autocomplete__panel--box-shadow=0 12px 32px rgba(24, 24, 27, 0.14)]
 * @cssproperty {pixel} [--c2-autocomplete__panel--max-height=320px]
 * @cssproperty {padding} [--c2-autocomplete__list--padding=4px]
 * @cssproperty {color} [--c2-autocomplete__header--background=transparent]
 * @cssproperty {color} [--c2-autocomplete__header--color=#71717a]
 * @cssproperty {padding} [--c2-autocomplete__header--padding=10px 12px]
 * @cssproperty {border} [--c2-autocomplete__header--border-bottom=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-autocomplete__footer--background=transparent]
 * @cssproperty {color} [--c2-autocomplete__footer--color=#71717a]
 * @cssproperty {padding} [--c2-autocomplete__footer--padding=10px 12px]
 * @cssproperty {border} [--c2-autocomplete__footer--border-top=1px solid #e4e4e7]
 * @cssproperty {pixel} [--c2-autocomplete__option--min-height=44px]
 * @cssproperty {pixel} [--c2-autocomplete__option--padding-top=8px]
 * @cssproperty {pixel} [--c2-autocomplete__option--padding-right=10px]
 * @cssproperty {pixel} [--c2-autocomplete__option--padding-bottom=8px]
 * @cssproperty {pixel} [--c2-autocomplete__option--padding-left=10px]
 * @cssproperty {pixel} [--c2-autocomplete__option--gap=10px]
 * @cssproperty {border-radius} [--c2-autocomplete__option--border-radius=6px]
 * @cssproperty {color} [--c2-autocomplete__option__active--background=#f4f4f5]
 * @cssproperty {color} [--c2-autocomplete__option__active--color=#18181b]
 * @cssproperty {color} [--c2-autocomplete__description--color=#71717a]
 * @cssproperty {font-size} [--c2-autocomplete__description--font-size=12px]
 * @cssproperty {color} [--c2-autocomplete__highlight--color=rgb(2, 101, 220)]
 * @cssproperty {font-weight} [--c2-autocomplete__highlight--font-weight=600]
 * @cssproperty {color} [--c2-autocomplete__status--color=#71717a]
 * @cssproperty {padding} [--c2-autocomplete__status--padding=14px 12px]
 *
 * @internalcomponent c2-overlay
 * @internalcomponent c2-list
 * @internalcomponent c2-list-item
 */
@customElement('c2-autocomplete')
export class Autocomplete extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)
  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  private readonly internals = this.attachInternals()
  private readonly uid = ++autocompleteId
  private defaultValue = ''
  private defaultValueCaptured = false
  private debounceTimer: ReturnType<typeof setTimeout> | undefined
  private requestController: AbortController | undefined
  private pendingQuery: string | undefined
  private requestSequence = 0
  private cachedDataSource: AutocompleteDataSource | undefined
  private cachedQuery: string | undefined
  private cachedResults: unknown[] = []
  private customValidityMessage = ''

  /** Current input text and form value. A selection replaces it only when `selectionBehavior` is `replace`. */
  @property({ type: String }) value = ''

  /** Input name used for form submission. */
  @property({ type: String }) name = ''

  /** Text shown while the input is empty. */
  @property({ type: String }) placeholder = ''

  /** Accessible name forwarded to the combobox input and composed list. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Local items to search. An array in the property, JSON in the attribute; items may have any structure. */
  @property({ converter: jsonPropertyConverter }) suggestions: unknown[] = []

  /** Field used as a result's stable value. An empty value falls back to a primitive item or its index. */
  @property({ type: String, attribute: 'item-key' }) itemKey = ''

  /** Field used as primary row text. Defaults to `label`, `name`, `title` or `value`. */
  @property({ type: String, attribute: 'label-field' }) labelField = ''

  /** Field used for the optional secondary row line. */
  @property({ type: String, attribute: 'description-field' }) descriptionField = ''

  /** Field whose truthy value makes a row unavailable. */
  @property({ type: String, attribute: 'disabled-field' }) disabledField = ''

  /** Fields used by local matching; a `;`-separated attribute or string array property. Defaults to every scalar field. */
  @property({ converter: arrayPropertyConverter, attribute: 'search-fields' }) searchFields: string[] = []

  /** Custom local matching for arbitrary item structures. */
  @property({ attribute: false }) matcher: AutocompleteMatcher | undefined

  /**
   * Async item provider. It receives the query and an abort signal; server results are not filtered again locally.
   * Reopening an unchanged query reuses its last successful results; call `load()` to force a refresh.
   */
  @property({ attribute: false }) dataSource: AutocompleteDataSource | undefined

  /** Replaces a row's content. The returned content is wrapped in a selectable `c2-list-item`. */
  @property({ attribute: false }) renderItem: AutocompleteItemRenderer | undefined

  /** Whether selection preserves the typed query or replaces it with the selected item's key. */
  @property({ attribute: 'selection-behavior', reflect: true }) selectionBehavior: AutocompleteSelectionBehavior = 'replace'

  /** Delay before calling `dataSource`, in milliseconds. */
  @property({ type: Number }) debounce = 200

  /** Query length required before results are shown or requested. */
  @property({ type: Number, attribute: 'min-query-length' }) minQueryLength = 1

  /** Maximum number of results shown after filtering or loading. */
  @property({ type: Number, attribute: 'max-results' }) maxResults = 20

  /** Keep the result panel open to show an empty state when nothing matches. */
  @property({ type: Boolean, attribute: 'show-empty' }) showEmpty = false

  /** Shows the value without allowing edits or opening suggestions. */
  @property({ type: Boolean, reflect: true }) readonly = false

  /** Disables the control and excludes it from form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Marks the control required for native form validation. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Whether the suggestion panel is open. May also be controlled programmatically. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Original item selected most recently, or `undefined` after the input is edited. */
  @property({ attribute: false }) selectedItem: unknown

  @state() private results: unknown[] = []
  @state() private loading = false
  @state() private loadError: unknown
  @state() private focused = false
  @state() private activeIndex = -1
  @state() private disabledByForm = false
  @state() private hasHeader = false
  @state() private hasFooter = false

  @query('.input') private input?: HTMLInputElement
  @query('c2-overlay') private overlay?: Overlay

  override connectedCallback() {
    super.connectedCallback()
    this.ownerDocument.addEventListener('pointerdown', this.handleDocumentPointerDown, true)
    this.ownerDocument.addEventListener('focusin', this.handleDocumentFocusIn, true)
    this.ownerDocument.addEventListener('keydown', this.handleDocumentKeydown, true)
    if (!this.defaultValueCaptured) {
      this.defaultValue = this.getAttribute('value') ?? this.value
      this.defaultValueCaptured = true
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.ownerDocument.removeEventListener('pointerdown', this.handleDocumentPointerDown, true)
    this.ownerDocument.removeEventListener('focusin', this.handleDocumentFocusIn, true)
    this.ownerDocument.removeEventListener('keydown', this.handleDocumentKeydown, true)
    this.cancelPendingRequest()
  }

  formResetCallback() {
    this.value = this.defaultValue
    this.selectedItem = undefined
    this.close()
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  get form() {
    return this.internals.form
  }

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

  checkValidity() {
    return this.internals.checkValidity()
  }

  reportValidity() {
    return this.internals.reportValidity()
  }

  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.syncFormState()
  }

  /** Focuses the inner text input. */
  override focus(options?: FocusOptions) {
    this.input?.focus(options)
  }

  /** Runs local matching or the remote data source immediately, bypassing the debounce. */
  async load(query = this.value): Promise<void> {
    this.cancelPendingRequest()
    const normalizedQuery = query.trim()
    if (normalizedQuery.length < this.minQueryLength || this.effectiveDisabled || this.readonly) {
      this.results = []
      this.loading = false
      this.loadError = undefined
      this.close()
      return
    }

    if (!this.dataSource) {
      this.loading = false
      this.loadError = undefined
      this.results = this.suggestions.filter((item) => this.itemMatches(item, normalizedQuery)).slice(0, Math.max(0, this.maxResults))
      this.finishResults()
      return
    }

    const dataSource = this.dataSource
    const controller = new AbortController()
    const sequence = ++this.requestSequence
    this.requestController = controller
    this.pendingQuery = normalizedQuery
    this.loading = true
    this.loadError = undefined
    this.results = []
    this.open = this.focused
    try {
      const loaded = await dataSource(normalizedQuery, controller.signal)
      if (controller.signal.aborted || sequence !== this.requestSequence || dataSource !== this.dataSource) return
      this.cachedDataSource = dataSource
      this.cachedQuery = normalizedQuery
      this.cachedResults = loaded
      this.results = this.cachedResults.slice(0, Math.max(0, this.maxResults))
    } catch (error) {
      if (controller.signal.aborted || sequence !== this.requestSequence) return
      this.results = []
      this.loadError = error
    } finally {
      if (!controller.signal.aborted && sequence === this.requestSequence) {
        this.requestController = undefined
        this.pendingQuery = undefined
        this.loading = false
        this.finishResults()
      }
    }
  }

  /** Closes the result panel and clears keyboard highlighting. */
  close() {
    this.open = false
    this.activeIndex = -1
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  private get listboxId() {
    return `c2-autocomplete-listbox-${this.uid}`
  }

  private get activeOptionId() {
    return this.activeIndex >= 0 ? `${this.listboxId}-option-${this.activeIndex}` : undefined
  }

  private textOf(value: unknown): string {
    return value === undefined || value === null ? '' : String(value)
  }

  private keyOf(item: unknown, index: number): string {
    const fieldValue = this.itemKey ? getFieldValue(item, this.itemKey) : undefined
    if (fieldValue !== undefined && fieldValue !== null) return String(fieldValue)
    if (item === null || typeof item !== 'object') return this.textOf(item)
    return String(index)
  }

  private labelOf(item: unknown): string {
    if (this.labelField) return this.textOf(getFieldValue(item, this.labelField))
    if (item === null || typeof item !== 'object') return this.textOf(item)
    const record = item as Record<string, unknown>
    for (const field of IMPLICIT_LABEL_FIELDS) {
      if (record[field] !== undefined) return this.textOf(record[field])
    }
    return ''
  }

  private isDisabled(item: unknown): boolean {
    return this.disabledField ? Boolean(getFieldValue(item, this.disabledField)) : false
  }

  private itemMatches(item: unknown, query: string): boolean {
    const needle = query.toLocaleLowerCase()
    if (this.matcher) return this.matcher(item, needle)
    const fields = this.searchFields.length ? this.searchFields : [this.labelField, this.descriptionField].filter(Boolean)
    if (fields.length) return fields.some((field) => this.textOf(getFieldValue(item, field)).toLocaleLowerCase().includes(needle))
    if (item === null || typeof item !== 'object') return this.textOf(item).toLocaleLowerCase().includes(needle)
    return Object.values(item as Record<string, unknown>).some(
      (fieldValue) => (typeof fieldValue === 'string' || typeof fieldValue === 'number') && String(fieldValue).toLocaleLowerCase().includes(needle),
    )
  }

  private finishResults() {
    this.activeIndex = this.results.findIndex((item) => !this.isDisabled(item))
    this.open = this.focused && (this.results.length > 0 || this.showEmpty || !!this.loadError)
  }

  private restoreCachedResults(query: string): boolean {
    if (!this.dataSource || this.cachedDataSource !== this.dataSource || this.cachedQuery !== query) return false
    this.loading = false
    this.loadError = undefined
    this.results = this.cachedResults.slice(0, Math.max(0, this.maxResults))
    this.finishResults()
    return true
  }

  private scheduleLoad() {
    const normalizedQuery = this.value.trim()
    if (this.pendingQuery === normalizedQuery) {
      this.open = this.focused
      return
    }
    this.cancelPendingRequest()
    if (normalizedQuery.length < this.minQueryLength) {
      void this.load()
      return
    }
    if (this.restoreCachedResults(normalizedQuery)) return
    if (!this.dataSource || this.debounce <= 0) {
      void this.load()
      return
    }
    this.loading = true
    this.results = []
    this.loadError = undefined
    this.open = this.focused
    this.pendingQuery = normalizedQuery
    this.debounceTimer = setTimeout(() => void this.load(), this.debounce)
  }

  private cancelPendingRequest() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = undefined
    this.requestController?.abort()
    this.requestController = undefined
    this.pendingQuery = undefined
  }

  private handleInput = (event: InputEvent) => {
    this.value = (event.currentTarget as HTMLInputElement).value
    this.selectedItem = undefined
    this.dispatchEvent(new CustomEvent('query-change', { detail: { query: this.value }, bubbles: true, composed: true }))
    redispatchEvent(this, event)
    this.scheduleLoad()
  }

  private handleChange = (event: Event) => redispatchEvent(this, event)

  private handleFocus = () => {
    this.focused = true
    if (this.value.trim().length >= this.minQueryLength) this.scheduleLoad()
  }

  private handleBlur = () => {
    this.focused = false
    queueMicrotask(() => {
      if (!this.matches(':focus-within')) this.close()
    })
  }

  private handleFieldClick = () => {
    this.focus()
    if (this.value.trim().length < this.minQueryLength || this.effectiveDisabled || this.readonly) return
    if (!this.loading && this.results.length === 0 && !this.showEmpty && !this.loadError) this.scheduleLoad()
    else {
      if (this.activeIndex < 0) this.activeIndex = this.results.findIndex((item) => !this.isDisabled(item))
      this.open = true
    }
  }

  private handleDocumentPointerDown = (event: PointerEvent) => {
    if (this.open && !event.composedPath().includes(this)) this.close()
  }

  private handleDocumentFocusIn = (event: FocusEvent) => {
    if (this.open && !event.composedPath().includes(this)) this.close()
  }

  private handleDocumentKeydown = (event: KeyboardEvent) => {
    if (this.open && event.key === 'Escape') this.close()
  }

  private handleKeydown = (event: KeyboardEvent) => {
    const enabledIndexes = this.results.map((item, index) => ({ item, index })).filter(({ item }) => !this.isDisabled(item))
    if (event.key === 'Escape' || event.key === 'Tab') {
      this.close()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!this.open) {
        this.scheduleLoad()
        this.open = true
      }
      if (enabledIndexes.length === 0) return
      const current = enabledIndexes.findIndex(({ index }) => index === this.activeIndex)
      const offset = event.key === 'ArrowDown' ? 1 : -1
      const next = current < 0 ? (offset > 0 ? 0 : enabledIndexes.length - 1) : (current + offset + enabledIndexes.length) % enabledIndexes.length
      this.activeIndex = enabledIndexes[next].index
      return
    }
    if (event.key === 'Home' && this.open && enabledIndexes.length) {
      event.preventDefault()
      this.activeIndex = enabledIndexes[0].index
      return
    }
    if (event.key === 'End' && this.open && enabledIndexes.length) {
      event.preventDefault()
      this.activeIndex = enabledIndexes[enabledIndexes.length - 1].index
      return
    }
    if (event.key === 'Enter' && this.open && this.activeIndex >= 0) {
      event.preventDefault()
      this.selectItem(this.results[this.activeIndex], this.activeIndex)
    }
  }

  private handleListSelection = (event: CustomEvent<SelectionChangeEventDetail>) => {
    const key = event.detail.value[0]
    const index = this.results.findIndex((item, itemIndex) => this.keyOf(item, itemIndex) === key)
    if (index >= 0) this.selectItem(this.results[index], index)
  }

  private selectItem(item: unknown, index: number) {
    if (this.isDisabled(item)) return
    const value = this.keyOf(item, index)
    const replaceValue = this.selectionBehavior !== 'preserve'
    if (replaceValue) this.value = value
    this.selectedItem = item
    this.close()
    this.input?.focus()
    this.dispatchEvent(
      new CustomEvent<AutocompleteSelectEventDetail>('suggestion-select', {
        detail: { value, item, index },
        bubbles: true,
        composed: true,
      }),
    )
    if (replaceValue) {
      this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    }
  }

  private handleClear = (event: Event) => {
    event.stopPropagation()
    this.value = ''
    this.selectedItem = undefined
    this.results = []
    this.cancelPendingRequest()
    this.close()
    this.input?.focus()
    this.dispatchEvent(new CustomEvent('query-change', { detail: { query: '' }, bubbles: true, composed: true }))
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  private handleOverlayToggle = (event: Event) => {
    this.open = (event as ToggleEvent).newState === 'open'
    if (!this.open) this.activeIndex = -1
  }

  private slotHasContent(event: Event): boolean {
    return (event.target as HTMLSlotElement).assignedNodes({ flatten: true }).some((node) => node.nodeType === Node.ELEMENT_NODE || !!node.textContent?.trim())
  }

  private renderHighlighted(text: string) {
    const query = this.value.trim()
    if (!query) return text
    const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
    if (index < 0) return text
    return html`${text.slice(0, index)}<mark>${text.slice(index, index + query.length)}</mark>${text.slice(index + query.length)}`
  }

  private renderListItem(item: unknown, index: number) {
    const label = this.labelOf(item)
    const description = this.descriptionField ? this.textOf(getFieldValue(item, this.descriptionField)) : ''
    const customContent = this.renderItem?.({ item, index, search: this.value })
    return html`<c2-list-item
      id=${`${this.listboxId}-option-${index}`}
      data-index=${index}
      .value=${this.keyOf(item, index)}
      .label=${label}
      .data=${item}
      .disabled=${this.isDisabled(item)}
      @pointerenter=${() => {
        if (!this.isDisabled(item)) this.activeIndex = index
      }}
      >${customContent ?? html`${this.renderHighlighted(label)}${description ? html`<span slot="description">${description}</span>` : nothing}`}</c2-list-item
    >`
  }

  private renderRows() {
    if (this.loading) return html`<div class="status" role="status"><slot name="loading">Loading suggestions…</slot></div>`
    if (this.loadError) return html`<div class="status status--error" role="status"><slot name="error">Could not load suggestions.</slot></div>`
    if (this.results.length === 0) return html`<div class="status" role="status"><slot name="empty">No suggestions found.</slot></div>`

    return this.results.map((item, index) => this.renderListItem(item, index))
  }

  private syncFormState() {
    this.internals.setFormValue(this.effectiveDisabled ? null : this.value, this.value)
    if (this.effectiveDisabled) {
      this.internals.setValidity({})
      return
    }
    if (this.customValidityMessage) this.internals.setValidity({ customError: true }, this.customValidityMessage, this.input)
    else if (this.required && !this.value) this.internals.setValidity({ valueMissing: true }, 'Please fill out this field.', this.input)
    else this.internals.setValidity({})
  }

  protected override updated(changed: PropertyValues) {
    if (changed.has('dataSource')) {
      this.cancelPendingRequest()
      this.cachedDataSource = undefined
      this.cachedQuery = undefined
      this.cachedResults = []
      if (this.focused && this.value.trim().length >= this.minQueryLength) this.scheduleLoad()
    }
    if (changed.has('suggestions') && !this.dataSource && this.focused && this.value.trim().length >= this.minQueryLength) void this.load()
    if (changed.has('open') && this.overlay && this.overlay.open !== this.open) this.overlay.open = this.open
    if (changed.has('activeIndex') && this.activeIndex >= 0) {
      this.renderRoot.querySelector<HTMLElement>(`#${this.activeOptionId}`)?.scrollIntoView({ block: 'nearest' })
    }
    this.syncFormState()
  }

  override render() {
    const selectedValue = this.activeIndex >= 0 ? [this.keyOf(this.results[this.activeIndex], this.activeIndex)] : []
    return html`<div class="field" @click=${this.handleFieldClick}>
        <slot name="prefix-icon"></slot>
        <input
          class="input"
          type="text"
          role="combobox"
          autocomplete="off"
          aria-autocomplete="list"
          aria-label=${ifDefined(this.ariaLabel || undefined)}
          aria-controls=${this.listboxId}
          aria-expanded=${this.open ? 'true' : 'false'}
          aria-activedescendant=${ifDefined(this.activeOptionId)}
          aria-busy=${this.loading ? 'true' : 'false'}
          placeholder=${this.placeholder || nothing}
          .value=${live(this.value)}
          ?disabled=${this.effectiveDisabled}
          ?readonly=${this.readonly}
          ?required=${this.required}
          @input=${this.handleInput}
          @change=${this.handleChange}
          @focus=${this.handleFocus}
          @blur=${this.handleBlur}
          @keydown=${this.handleKeydown}
        />
        ${
          this.value && !this.effectiveDisabled && !this.readonly
            ? html`<button class="clear" type="button" aria-label="Clear" tabindex="-1" @click=${this.handleClear}>
                <slot name="clear-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="m6 6 12 12M18 6 6 18"></path>
                  </svg>
                </slot>
              </button>`
            : nothing
        }
        <slot name="suffix-icon"></slot>
      </div>
      <c2-overlay
        popover="manual"
        fit-anchor
        .anchor=${this.renderRoot.querySelector('.field') as HTMLElement | null}
        .open=${this.open}
        @toggle=${this.handleOverlayToggle}
      >
        <div class="panel">
          <header class="panel-header" ?hidden=${!this.hasHeader}>
            <slot name="header" @slotchange=${(event: Event) => (this.hasHeader = this.slotHasContent(event))}></slot>
          </header>
          <c2-list
            id=${this.listboxId}
            class="list"
            required
            aria-label=${ifDefined(this.ariaLabel ? `${this.ariaLabel} suggestions` : 'Suggestions')}
            .value=${selectedValue}
            @pointerdown=${(event: PointerEvent) => event.preventDefault()}
            @selection-change=${this.handleListSelection}
            >${this.renderRows()}</c2-list
          >
          <footer class="panel-footer" ?hidden=${!this.hasFooter}>
            <slot name="footer" @slotchange=${(event: Event) => (this.hasFooter = this.slotHasContent(event))}></slot>
          </footer>
        </div>
      </c2-overlay>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-autocomplete': Autocomplete
  }
}
