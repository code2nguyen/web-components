import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { getFieldValue } from '@c2n/core/data-helper.js'
import { disabledByAncestor, isComposingKey, redispatchEvent, SlotPresenceController } from '@c2n/core/dom-helper.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { property, arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import type { SelectionChangeEventDetail } from '@c2n/list'
import type { Overlay } from '@c2n/overlay'
import { LocalizeController } from '@c2n/core/localize.js'
import { autocompleteMessages } from './messages'
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

export interface AutocompletePickContext {
  /** A picked item, as held in `selectedItems`. */
  item: unknown
  /** Its position in `selectedItems`. */
  index: number
}

/** Returns anything Lit can render. The result is the label of the pick's `c2-chip`. */
export type AutocompletePickRenderer = (context: AutocompletePickContext) => unknown

export interface AutocompleteCreateRequestEventDetail {
  /** The trimmed query the person asked to create a record from. */
  query: string
}

export interface AutocompleteItemRemoveEventDetail {
  /** The removed pick's key (its label when there is no `itemKey`). */
  value: string
  item: unknown
  /** Its former position in `selectedItems`. */
  index: number
}

/** Events fired by {@link Autocomplete}, keyed for `addEventListener`. */
export interface AutocompleteEventMap {
  'query-change': CustomEvent<{ query: string }>
  'suggestion-select': CustomEvent<AutocompleteSelectEventDetail>
  'create-request': CustomEvent<AutocompleteCreateRequestEventDetail>
  'item-remove': CustomEvent<AutocompleteItemRemoveEventDetail>
  input: InputEvent
  change: Event
}

export interface Autocomplete {
  addEventListener: TypedAddEventListener<Autocomplete, AutocompleteEventMap>
  removeEventListener: TypedRemoveEventListener<Autocomplete, AutocompleteEventMap>
}

/** Default of `--c2-autocomplete__list--min-height`. */
const LIST_MIN_HEIGHT = 96
const IMPLICIT_LABEL_FIELDS = ['label', 'name', 'title', 'value']
/** List key of the "create" row; a NUL never appears in a key the app chose. */
const CREATE_KEY = '\u0000create'
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
 * As a record picker, `multiple` keeps every choice in `selectedItems`, shown as removable `c2-chip`s before the
 * input and submitted as one form entry per pick; picked items leave the suggestions. The chips are out of the Tab
 * order: in an empty input Backspace removes the last pick and Left Arrow moves to the picks, where Left and Right move
 * and Backspace or Delete removes the focused one. `creatable` adds a "Create “query”" row when nothing matches the query exactly: choosing
 * it fires `create-request`, and the app creates the record and hands it back with `pick(record)`. `recent-items`
 * are offered under a "Recent" heading while the query is shorter than `min-query-length`.
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
 * @event {CustomEvent<AutocompleteSelectEventDetail>} suggestion-select - Fired after a row is chosen. The detail contains the selected key (the label when there is no `itemKey`), original item and visible index.
 * @event {InputEvent} input - Re-dispatched from the inner input on every edit; also fired after a suggestion replaces the value.
 * @event {Event} change - Fired after the typed value is committed or a suggestion replaces it.
 * @event {CustomEvent<AutocompleteCreateRequestEventDetail>} create-request - The "create" row of a `creatable` autocomplete was chosen. Create the record, then call `pick(record)`.
 * @event {CustomEvent<AutocompleteItemRemoveEventDetail>} item-remove - A pick of a `multiple` autocomplete was removed with its chip or Backspace; `input` and `change` follow.
 *
 * @csspart pick - The `c2-chip` of each picked item in `multiple` mode.
 * @csspart create-option - The "create" row of a `creatable` autocomplete.
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
 * @cssproperty {border} [--c2-autocomplete__error--border=1px solid #dc2626] - Shown while an enclosing `c2-form-field` shows an error.
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
 * @cssproperty {pixel} [--c2-autocomplete__list--min-height=96px] - Room the suggestions keep (or their own height, if
 * shorter). When the panel cannot fit that plus the header and footer (a phone with its keyboard open), those two hide.
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
 * @cssproperty {pixel} [--c2-autocomplete__picks--gap=4px] - Space between the picks and the input in `multiple` mode, which wraps.
 * @cssproperty {pixel} [--c2-autocomplete__pick--height=24px]
 * @cssproperty {font-size} [--c2-autocomplete__pick--font-size=12px]
 * @cssproperty {pixel} [--c2-autocomplete__input--min-width=80px] - Narrowest the input gets beside the picks before it wraps to a line of its own.
 * @cssproperty {color} [--c2-autocomplete__create--color=rgb(2, 101, 220)] - Text of the "create" row.
 *
 * @internalcomponent c2-overlay
 * @internalcomponent c2-list
 * @internalcomponent c2-list-item
 * @internalcomponent c2-chip
 */
@customElement('c2-autocomplete')
export class Autocomplete extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)
  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  private readonly internals = this.attachInternals()
  /** The built-in status text, labels and validation message in the nearest `lang` (English, or a language the app adds). */
  private readonly msg = new LocalizeController(this, autocompleteMessages)
  private readonly uid = ++autocompleteId
  private defaultValue = ''
  private defaultValueCaptured = false
  private defaultSelectedItems: unknown[] = []
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
  @property({ type: String, reflect: true }) name = ''

  /** Text shown while the input is empty. */
  @property({ type: String }) placeholder = ''

  /** Accessible name forwarded to the combobox input and composed list. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Local items to search. An array in the property, JSON in the attribute; items may have any structure. */
  @property({ converter: jsonPropertyConverter }) suggestions: unknown[] = []

  /** Field used as a result's stable value. An empty value falls back to a primitive item, then to the row's label. */
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

  /**
   * Keeps every choice instead of one: the picks are `selectedItems`, shown as chips, and the form value is one entry
   * per pick. The input only holds the query, which a choice clears unless `selectionBehavior` is `preserve`, so a
   * two-way binding of `value` (`v-model`, an Angular form control) sees the query: read `selectedItems` on `change`.
   */
  @property({ type: Boolean }) multiple = false

  /** The picks of a `multiple` autocomplete. An array in the property, JSON in the attribute; a form reset restores the initial picks. */
  @property({ converter: jsonPropertyConverter, attribute: 'selected-items' }) selectedItems: unknown[] = []

  /** Replaces the label of each pick's chip; the chip itself, its remove button and keyboard stay the component's. */
  @property({ attribute: false }) renderPick: AutocompletePickRenderer | undefined

  /** Adds a "Create “query”" row when no suggestion's label equals the query; choosing it fires `create-request`. */
  @property({ type: Boolean }) creatable = false

  /**
   * Items offered under a "Recent" heading while the input is focused and the query is shorter than
   * `minQueryLength`. An array in the property, JSON in the attribute. The app keeps the list (for example from
   * `suggestion-select`); the component stores nothing.
   */
  @property({ converter: jsonPropertyConverter, attribute: 'recent-items' }) recentItems: unknown[] = []

  @state() private results: unknown[] = []
  @state() private loading = false
  @state() private loadError: unknown
  @state() private focused = false
  @state() private activeIndex = -1
  @state() private disabledByForm = false
  /** The results are `recentItems`, shown under their heading. */
  @state() private showingRecent = false
  /** The panel has too little room for its header and footer; only the list is shown. */
  @state() private compactPanel = false
  /** Height of the header and footer, measured while they are shown (hidden, they measure 0). */
  private panelChromeHeight = 0
  private readonly slotPresence = new SlotPresenceController(this, ['header', 'footer'])
  /** Label and description handed down by an enclosing `c2-form-field`. */
  private readonly field = new FieldContextConsumer(this, { kind: 'text' })
  private panelSpaceObserver: MutationObserver | null = null

  @query('.input') private input?: HTMLInputElement
  @query('c2-overlay') private overlay?: Overlay

  override connectedCallback() {
    super.connectedCallback()
    this.ownerDocument.addEventListener('pointerdown', this.handleDocumentPointerDown, true)
    this.ownerDocument.addEventListener('focusin', this.handleDocumentFocusIn, true)
    this.ownerDocument.addEventListener('keydown', this.handleDocumentKeydown, true)
    if (!this.defaultValueCaptured) {
      this.defaultValue = this.getAttribute('value') ?? this.value
      this.defaultSelectedItems = this.selectedItems
      this.defaultValueCaptured = true
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.ownerDocument.removeEventListener('pointerdown', this.handleDocumentPointerDown, true)
    this.ownerDocument.removeEventListener('focusin', this.handleDocumentFocusIn, true)
    this.ownerDocument.removeEventListener('keydown', this.handleDocumentKeydown, true)
    this.cancelPendingRequest()
    this.stopWatchingPanelSpace()
  }

  formResetCallback() {
    this.value = this.defaultValue
    this.selectedItem = undefined
    if (this.multiple) this.selectedItems = [...this.defaultSelectedItems]
    this.close()
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabledByAncestor(this, disabled)
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
    else if (state instanceof FormData && this.multiple) {
      // Only keys were saved: find the records they belong to, else keep the key itself.
      const known = [...this.selectedItems, ...this.suggestions, ...this.recentItems]
      this.selectedItems = state.getAll(this.name).map((key) => known.find((item) => this.pickKey(item) === key) ?? key)
    }
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

  /**
   * Picks `item` as a choice from the list would: in `multiple` mode it joins `selectedItems` (once), otherwise it
   * becomes `selectedItem`. Unless `selectionBehavior` is `preserve`, the query is cleared (`multiple`) or replaced by
   * the item's key. Fires `input` and `change` when the form value changed, not `suggestion-select`. A
   * `create-request` handler hands the new record back this way.
   */
  pick(item: unknown) {
    if (this.applyPick(item)) {
      this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    }
  }

  /** Records a pick without events; returns whether the form value changed. */
  private applyPick(item: unknown): boolean {
    const replaceValue = this.selectionBehavior !== 'preserve'
    if (this.multiple) {
      const added = !this.isPicked(item)
      if (added) this.selectedItems = [...this.selectedItems, item]
      if (replaceValue) this.value = ''
      return added
    }
    this.selectedItem = item
    if (!replaceValue) return false
    const value = this.pickKey(item)
    const changed = value !== this.value
    this.value = value
    return changed
  }

  /** Runs local matching or the remote data source immediately, bypassing the debounce. */
  async load(query = this.value): Promise<void> {
    this.cancelPendingRequest()
    this.showingRecent = false
    const normalizedQuery = query.trim()
    if (normalizedQuery.length < this.minQueryLength || this.effectiveDisabled || this.readonly) {
      this.results = []
      this.loading = false
      this.loadError = undefined
      const recent = this.focused && normalizedQuery.length < this.minQueryLength ? this.visible(this.recentItems) : []
      if (recent.length && !this.effectiveDisabled && !this.readonly) {
        this.results = recent
        this.showingRecent = true
        this.finishResults()
        return
      }
      this.close()
      return
    }

    if (!this.dataSource) {
      this.loading = false
      this.loadError = undefined
      this.results = this.visible(this.suggestions.filter((item) => this.itemMatches(item, normalizedQuery)))
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
      this.results = this.visible(this.cachedResults)
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

  /**
   * The value a selection reports and, in `replace` mode, writes into the input. Without `itemKey` an object row's
   * list key is its index, which means nothing to the user, so its label stands in.
   */
  private selectionValueOf(item: unknown, index: number): string {
    const key = this.keyOf(item, index)
    if (this.itemKey || item === null || typeof item !== 'object') return key
    return this.labelOf(item) || key
  }

  /** A pick's key: `selectionValueOf` without the row index, so an unlabelled object without `itemKey` has none. */
  private pickKey(item: unknown): string {
    const fieldValue = this.itemKey ? getFieldValue(item, this.itemKey) : undefined
    if (fieldValue !== undefined && fieldValue !== null) return String(fieldValue)
    return item !== null && typeof item === 'object' ? this.labelOf(item) : this.textOf(item)
  }

  private isPicked(item: unknown): boolean {
    const key = this.pickKey(item)
    return this.selectedItems.some((picked) => picked === item || (key !== '' && this.pickKey(picked) === key))
  }

  /** What a list shows of `items`: in `multiple` mode without the picks, then capped at `maxResults`. */
  private visible(items: unknown[]): unknown[] {
    return (this.multiple ? items.filter((item) => !this.isPicked(item)) : items).slice(0, Math.max(0, this.maxResults))
  }

  /** The "create" row follows the results once they settle, unless a result or a pick already has the query as its label. */
  private get showCreate(): boolean {
    const query = this.value.trim().toLocaleLowerCase()
    if (!this.creatable || !query || query.length < this.minQueryLength || this.loading || this.loadError || this.showingRecent) return false
    // Every known record counts, not only the shown page: `results` is capped at `maxResults`. The key counts too, which
    // is what a single-value field shows after a choice.
    const taken = [...this.results, ...(this.dataSource ? this.cachedResults : this.suggestions), ...this.selectedItems, this.selectedItem]
    return !taken.some((item) => item !== undefined && [this.labelOf(item), this.pickKey(item)].some((text) => text.trim().toLocaleLowerCase() === query))
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
    this.open = this.focused && (this.results.length > 0 || this.showEmpty || !!this.loadError || this.showCreate)
  }

  private restoreCachedResults(query: string): boolean {
    if (!this.dataSource || this.cachedDataSource !== this.dataSource || this.cachedQuery !== query) return false
    this.loading = false
    this.loadError = undefined
    this.results = this.visible(this.cachedResults)
    this.finishResults()
    return true
  }

  private scheduleLoad() {
    this.showingRecent = false
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
    if (this.value.trim().length >= this.minQueryLength || this.recentItems.length) this.scheduleLoad()
  }

  private handleBlur = () => {
    this.focused = false
    queueMicrotask(() => {
      if (!this.matches(':focus-within')) this.close()
    })
  }

  private handleFieldClick = () => {
    this.focus()
    if ((this.value.trim().length < this.minQueryLength && !this.recentItems.length) || this.effectiveDisabled || this.readonly) return
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
    // While an IME composes, Enter confirms the candidate and the arrows move through the IME's own list.
    if (isComposingKey(event)) return
    const enabledIndexes = this.results.map((item, index) => ({ item, index })).filter(({ item }) => !this.isDisabled(item))
    if (this.showCreate) enabledIndexes.push({ item: undefined, index: this.results.length })
    if (this.multiple && this.selectedItems.length && !this.value && !this.effectiveDisabled && !this.readonly) {
      if (event.key === 'Backspace') {
        this.removePick(this.selectedItems.length - 1)
        return
      }
      // The picks are out of the Tab order (a field of ten picks would be ten stops before the input); the arrows reach them.
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        this.focusPick(this.selectedItems.length - 1)
        return
      }
    }
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
      if (this.activeIndex === this.results.length) {
        if (this.showCreate) this.requestCreate()
      } else this.selectItem(this.results[this.activeIndex], this.activeIndex)
    }
  }

  private handleListSelection = (event: CustomEvent<SelectionChangeEventDetail>) => {
    const key = event.detail.value[0]
    if (key === CREATE_KEY) {
      this.requestCreate()
      return
    }
    const index = this.results.findIndex((item, itemIndex) => this.keyOf(item, itemIndex) === key)
    if (index >= 0) this.selectItem(this.results[index], index)
  }

  private selectItem(item: unknown, index: number) {
    if (this.isDisabled(item)) return
    const value = this.selectionValueOf(item, index)
    const replaceValue = this.selectionBehavior !== 'preserve'
    if (this.multiple) {
      this.applyPick(item)
      if (replaceValue) this.close()
      else {
        // The query stays, so the remaining matches stay open for the next pick.
        this.results = this.results.filter((result) => result !== item)
        this.finishResults()
      }
    } else {
      if (replaceValue) this.value = value
      this.selectedItem = item
      this.close()
    }
    this.input?.focus()
    this.dispatchEvent(
      new CustomEvent<AutocompleteSelectEventDetail>('suggestion-select', {
        detail: { value, item, index },
        bubbles: true,
        composed: true,
      }),
    )
    if (replaceValue || this.multiple) {
      this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    }
  }

  private requestCreate() {
    const query = this.value.trim()
    this.close()
    this.input?.focus()
    this.dispatchEvent(new CustomEvent<AutocompleteCreateRequestEventDetail>('create-request', { detail: { query }, bubbles: true, composed: true }))
  }

  private focusPick(index: number) {
    const chips = this.renderRoot.querySelectorAll<HTMLElement>('.pick')
    if (index >= 0 && index < chips.length) chips[index].focus()
    else this.input?.focus()
  }

  /** Left and Right move between the picks and back to the input; Backspace or Delete removes the focused pick. */
  private handlePickKeydown(event: KeyboardEvent, index: number) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      this.focusPick(event.key === 'ArrowLeft' ? Math.max(0, index - 1) : index + 1)
    } else if ((event.key === 'Backspace' || event.key === 'Delete') && !this.effectiveDisabled && !this.readonly) {
      event.preventDefault()
      const next = event.key === 'Backspace' ? index - 1 : index
      this.removePick(index, false)
      void this.updateComplete.then(() => this.focusPick(next < 0 && this.selectedItems.length ? 0 : next))
    }
  }

  private removePick(index: number, focusInput = true) {
    const item = this.selectedItems[index]
    this.selectedItems = this.selectedItems.filter((_, itemIndex) => itemIndex !== index)
    if (focusInput) this.input?.focus()
    this.dispatchEvent(
      new CustomEvent<AutocompleteItemRemoveEventDetail>('item-remove', { detail: { value: this.pickKey(item), item, index }, bubbles: true, composed: true }),
    )
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
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
    if (this.open) this.watchPanelSpace()
    else this.stopWatchingPanelSpace()
  }

  // The overlay writes the room left on its side as `--c2-overlay--available-height` each time it positions itself
  // (on open, scroll, resize, and when a mobile keyboard shrinks the viewport), so its style attribute is the signal.
  private watchPanelSpace() {
    const overlay = this.overlay
    if (!overlay || this.panelSpaceObserver) return
    this.panelSpaceObserver = new MutationObserver(this.measurePanelSpace)
    this.panelSpaceObserver.observe(overlay, { attributes: true, attributeFilter: ['style'] })
    this.measurePanelSpace()
  }

  private stopWatchingPanelSpace() {
    this.panelSpaceObserver?.disconnect()
    this.panelSpaceObserver = null
    this.compactPanel = false
  }

  private readonly measurePanelSpace = () => {
    const root = this.renderRoot
    const available = parseFloat(this.overlay?.style.getPropertyValue('--c2-overlay--available-height') ?? '')
    const list = root.querySelector<HTMLElement>('.list')
    if (!Number.isFinite(available) || !list) {
      this.compactPanel = false
      return
    }
    if (!this.compactPanel) {
      this.panelChromeHeight = ['.panel-header', '.panel-footer'].reduce((sum, part) => sum + (root.querySelector<HTMLElement>(part)?.offsetHeight ?? 0), 0)
    }
    // A short list (one row, the loading or empty message) only needs its own height.
    const minHeight = parseFloat(getComputedStyle(this).getPropertyValue('--c2-autocomplete__list--min-height'))
    const listNeeds = Math.min(Number.isFinite(minHeight) ? minHeight : LIST_MIN_HEIGHT, list.scrollHeight)
    this.compactPanel = this.panelChromeHeight > 0 && this.panelChromeHeight + listNeeds > available
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

  private renderCreateRow() {
    const index = this.results.length
    const text = this.msg.t('create', this.value.trim())
    return html`<c2-list-item
      id=${`${this.listboxId}-option-${index}`}
      class="create"
      part="create-option"
      .value=${CREATE_KEY}
      .label=${text}
      @pointerenter=${() => (this.activeIndex = index)}
      >${text}</c2-list-item
    >`
  }

  private renderRows() {
    if (this.loading) return html`<div class="status" role="status"><slot name="loading">${this.msg.t('loading')}</slot></div>`
    if (this.loadError) return html`<div class="status status--error" role="status"><slot name="error">${this.msg.t('loadError')}</slot></div>`
    const create = this.showCreate ? this.renderCreateRow() : nothing
    if (this.results.length === 0)
      return create === nothing ? html`<div class="status" role="status"><slot name="empty">${this.msg.t('empty')}</slot></div>` : create

    const rows = this.results.map((item, index) => this.renderListItem(item, index))
    if (!this.showingRecent && create === nothing) return rows
    return html`${this.showingRecent ? html`<h3>${this.msg.t('recent')}</h3>` : nothing}${rows}${create}`
  }

  private renderPicks() {
    if (!this.multiple) return nothing
    const removable = !this.effectiveDisabled && !this.readonly
    return this.selectedItems.map(
      (item, index) =>
        html`<c2-chip
          class="pick"
          part="pick"
          .value=${this.pickKey(item)}
          tabindex="-1"
          ?removable=${removable}
          @keydown=${(event: KeyboardEvent) => this.handlePickKeydown(event, index)}
          @remove=${(event: Event) => {
            // The chip's own event would reach the page as a stray `remove` from the autocomplete.
            event.stopPropagation()
            this.removePick(index)
          }}
          >${this.renderPick?.({ item, index }) ?? this.labelOf(item)}</c2-chip
        >`,
    )
  }

  private syncFormState() {
    const keys = this.multiple ? this.selectedItems.map((item) => this.pickKey(item)) : []
    if (this.multiple) {
      const entries = new FormData()
      for (const key of keys) entries.append(this.name, key)
      this.internals.setFormValue(this.effectiveDisabled || !this.name ? null : entries, entries)
    } else this.internals.setFormValue(this.effectiveDisabled ? null : this.value, this.value)
    if (this.effectiveDisabled) {
      this.internals.setValidity({})
      return
    }
    if (this.customValidityMessage) this.internals.setValidity({ customError: true }, this.customValidityMessage, this.input)
    else if (this.required && (this.multiple ? !keys.length : !this.value))
      this.internals.setValidity({ valueMissing: true }, this.msg.t('valueMissing'), this.input)
    else this.internals.setValidity({})
  }

  protected override willUpdate(changed: PropertyValues) {
    // Chips only exist in `multiple` mode, so a single-value autocomplete never loads them.
    if (changed.has('multiple') && this.multiple && !customElements.get('c2-chip')) void import('@c2n/chip')
  }

  protected override updated(changed: PropertyValues) {
    // A pick added or removed elsewhere (or new recent items) changes what the open panel should offer.
    if (this.open && this.focused && ((this.multiple && changed.has('selectedItems')) || (this.showingRecent && changed.has('recentItems')))) {
      this.scheduleLoad()
    }
    // New results change how much room the list needs, which need not move the overlay.
    if (this.panelSpaceObserver && (changed.has('results') || changed.has('loading') || changed.has('loadError'))) this.measurePanelSpace()
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
    const selectedValue =
      this.activeIndex === this.results.length && this.showCreate
        ? [CREATE_KEY]
        : this.activeIndex >= 0
          ? [this.keyOf(this.results[this.activeIndex], this.activeIndex)]
          : []
    const label = this.ariaLabel || this.field.label
    const invalid = this.field.invalid && !this.effectiveDisabled
    return html`<div class=${classMap({ field: true, error: invalid, multiple: this.multiple })} @click=${this.handleFieldClick}>
        <slot name="prefix-icon"></slot>
        ${this.renderPicks()}
        <input
          class="input"
          type="text"
          role="combobox"
          autocomplete="off"
          aria-autocomplete="list"
          aria-label=${ifDefined(label || undefined)}
          aria-describedby=${this.field.describedBy()}
          aria-invalid=${invalid ? 'true' : nothing}
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
            ? html`<button class="clear" type="button" aria-label=${this.msg.t('clear')} tabindex="-1" @click=${this.handleClear}>
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
        <div class=${classMap({ panel: true, 'panel--compact': this.compactPanel })}>
          <header class="panel-header" ?hidden=${!this.slotPresence.has('header')}>
            <slot name="header" @slotchange=${this.slotPresence.handleSlotChange}></slot>
          </header>
          <c2-list
            id=${this.listboxId}
            class="list"
            required
            aria-label=${label ? this.msg.t('suggestionsFor', label) : this.msg.t('suggestions')}
            .value=${selectedValue}
            @pointerdown=${(event: PointerEvent) => event.preventDefault()}
            @selection-change=${this.handleListSelection}
            >${this.renderRows()}</c2-list
          >
          <footer class="panel-footer" ?hidden=${!this.slotPresence.has('footer')}>
            <slot name="footer" @slotchange=${this.slotPresence.handleSlotChange}></slot>
          </footer>
        </div>
      </c2-overlay>
      ${this.field.renderDescription()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-autocomplete': Autocomplete
  }
}
