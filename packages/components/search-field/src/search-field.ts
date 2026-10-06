import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { arrayPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { ariaKeyShortcuts, formatShortcut, isEditableTarget, registerShortcuts } from '@c2n/core/shortcut-helper.js'
import '@c2n/overlay'
import styles from './search-field.scss?inline'

/** What started a `search` event. */
export type SearchFieldTrigger = 'input' | 'submit' | 'recent' | 'clear'

export interface SearchFieldSearchDetail {
  /** The query, as typed (not trimmed). */
  value: string
  /** `input` after the debounce, `submit` on Enter, `recent` when a recent search was picked, `clear` when the field was emptied. */
  trigger: SearchFieldTrigger
}

export interface SearchFieldRecentChangeDetail {
  /** The new list of recent searches, most recent first. */
  recent: string[]
}

/** Events fired by {@link SearchField}, keyed for `addEventListener`. */
export interface SearchFieldEventMap {
  input: Event
  change: Event
  search: CustomEvent<SearchFieldSearchDetail>
  clear: Event
  'recent-change': CustomEvent<SearchFieldRecentChangeDetail>
}

export interface SearchField {
  addEventListener: TypedAddEventListener<SearchField, SearchFieldEventMap>
  removeEventListener: TypedRemoveEventListener<SearchField, SearchFieldEventMap>
}

const STORAGE_PREFIX = 'c2n-search-history:'

/**
 * A search box: the query field of GitHub, Linear and Carbon. Typing fires a debounced `search` event (`debounce`
 * milliseconds after the last keystroke, 300 by default), **Enter** fires it at once, and the clear button or
 * **Escape** empties the field and fires it with an empty query. `input` and `change` are re-dispatched from the
 * inner input like any text field, so `v-model` and form bindings work, and the element is form-associated (`name`).
 *
 * `shortcut` focuses the field from anywhere on the page and shows the key as a hint while the field is empty and
 * unfocused: `mod+k` (⌘K / Ctrl+K), `/`, or several alternatives (`/, mod+k`). A single printable key such as `/` only
 * fires while focus is not in another editable field.
 *
 * Recent searches open under the field while it has focus: all of them while it is empty, those containing the query
 * while typing. Arrow keys move through them and Enter (or a click) runs one. Give the list yourself through `recent`,
 * recording each `search` whose `trigger` is `submit` or `recent`, or set `history-key` and the field records the
 * searches committed with Enter or picked from the list, keeps the latest `recent-limit` and persists them in
 * `localStorage`. The panel's Clear button empties the list; both ways fire `recent-change`.
 *
 * `loading` swaps the search icon for a spinner while results are fetched. The host exposes its state as custom
 * states: `:state(focus-within)`, `:state(expanded)`, `:state(loading)` and `:state(disabled)`.
 *
 * @tag c2-search-field
 *
 * @slot search-icon - Replaces the magnifier at the start of the field.
 * @slot clear-icon - Replaces the cross of the clear button.
 * @slot suffix-icon - Icon or control at the end of the field, after the clear button and the shortcut hint (a filter toggle, for instance).
 * @slot recent-icon - Replaces the clock shown before each recent search.
 *
 * @event {InputEvent} input - Re-dispatched from the inner input on every keystroke; also fired when the clear button or a recent search changes the value.
 * @event {Event} change - Re-dispatched from the inner input when the value is committed; also fired when the clear button or a recent search changes the value.
 * @event {CustomEvent<SearchFieldSearchDetail>} search - The query to run: after the debounce while typing, at once on Enter, on a recent search, and with an empty value when cleared. Does not bubble; listen on the element.
 * @event {Event} clear - Fired when the clear button or Escape emptied the field, before `input`, `change` and `search`.
 * @event {CustomEvent<SearchFieldRecentChangeDetail>} recent-change - Fired when the field changed `recent` itself: a search recorded under `history-key`, or the Clear button. Does not bubble.
 *
 * @cssproperty {pixel} [--c2-search-field--min-height=36px]
 * @cssproperty {padding} [--c2-search-field--padding=6px 10px]
 * @cssproperty {pixel} [--c2-search-field--gap=8px] - Space between the icons, the text and the hint.
 * @cssproperty {color} [--c2-search-field--color=#18181b]
 * @cssproperty {color} [--c2-search-field--background=#ffffff]
 * @cssproperty {border} [--c2-search-field--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-search-field--border-radius=6px]
 * @cssproperty {font-size} [--c2-search-field--font-size=14px]
 * @cssproperty {font-family} --c2-search-field--font-family
 * @cssproperty {color} [--c2-search-field__placeholder--color=#71717a]
 * @cssproperty {border} [--c2-search-field__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-search-field__focus--border=1px solid rgb(2, 101, 220)]
 * @cssproperty {color} --c2-search-field__focus--background
 * @cssproperty {outline} [--c2-search-field__focus--outline=none]
 * @cssproperty {opacity} [--c2-search-field__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-search-field__icon--size=16px]
 * @cssproperty {color} [--c2-search-field__icon--color=#71717a]
 * @cssproperty {color} [--c2-search-field__clear-icon--color=#a1a1aa]
 * @cssproperty {color} [--c2-search-field__clear-icon__hover--color=#18181b]
 * @cssproperty {color} [--c2-search-field__spinner--color=rgb(2, 101, 220)]
 *
 * @cssproperty {pixel} [--c2-search-field__shortcut--height=20px]
 * @cssproperty {padding} [--c2-search-field__shortcut--padding=0 6px]
 * @cssproperty {color} [--c2-search-field__shortcut--color=#71717a]
 * @cssproperty {color} [--c2-search-field__shortcut--background=#fafafa]
 * @cssproperty {border} [--c2-search-field__shortcut--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-search-field__shortcut--border-radius=4px]
 * @cssproperty {font-size} [--c2-search-field__shortcut--font-size=12px]
 *
 * @cssproperty {color} [--c2-search-field__panel--background=#ffffff]
 * @cssproperty {border} [--c2-search-field__panel--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-search-field__panel--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-search-field__panel--box-shadow=0 12px 32px rgba(24, 24, 27, 0.14)]
 * @cssproperty {pixel} [--c2-search-field__panel--max-height=320px]
 * @cssproperty {padding} [--c2-search-field__panel--padding=4px]
 * @cssproperty {pixel} [--c2-search-field__panel--offset=6px] - Gap between the field and the panel.
 *
 * @cssproperty {padding} [--c2-search-field__header--padding=6px 8px]
 * @cssproperty {color} [--c2-search-field__header--color=#71717a]
 * @cssproperty {font-size} [--c2-search-field__header--font-size=12px]
 * @cssproperty {font-weight} [--c2-search-field__header--font-weight=500]
 * @cssproperty {color} [--c2-search-field__header-action--color=rgb(2, 101, 220)]
 *
 * @cssproperty {pixel} [--c2-search-field__option--min-height=32px]
 * @cssproperty {padding} [--c2-search-field__option--padding=6px 8px]
 * @cssproperty {pixel} [--c2-search-field__option--gap=8px]
 * @cssproperty {border-radius} [--c2-search-field__option--border-radius=4px]
 * @cssproperty {color} [--c2-search-field__option--color=#18181b]
 * @cssproperty {color} [--c2-search-field__option__active--background=#f4f4f5]
 * @cssproperty {color} [--c2-search-field__option-icon--color=#71717a]
 * @cssproperty {font-weight} [--c2-search-field__highlight--font-weight=600]
 */
@customElement('c2-search-field')
export class SearchField extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  /** The query. Setting the attribute after the user has typed no longer updates it, like a native input. */
  @property({ type: String }) value = ''

  /** Text shown while the field is empty. */
  @property({ type: String }) placeholder = ''

  /** Accessible name of the field. Defaults to "Search" when there is no placeholder either. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Form field name: the query is submitted with the form under this name. */
  @property({ type: String }) name = ''

  /** Disables the field, its shortcut and the recent searches. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Shows a spinner in place of the search icon while results are being fetched. */
  @property({ type: Boolean }) loading = false

  /** Milliseconds of typing pause before `search` fires. `0` fires on every keystroke. */
  @property({ type: Number }) debounce = 300

  /**
   * Keyboard shortcut that focuses the field from anywhere on the page, e.g. `mod+k` or `/` (alternatives separated
   * by commas). Shown as a hint while the field is empty and unfocused.
   */
  @property({ type: String }) shortcut = ''

  /** Recent searches, most recent first. As an attribute, separated by semicolons. */
  @property({ attribute: 'recent', converter: arrayPropertyConverter }) recent: string[] = []

  /** When set, the field records committed searches into `recent` itself and keeps them in `localStorage` under this key. */
  @property({ attribute: 'history-key' }) historyKey = ''

  /** Most recent searches shown, and kept under `history-key`. */
  @property({ type: Number, attribute: 'recent-limit' }) recentLimit = 5

  /** Heading of the recent-searches panel. */
  @property({ attribute: 'recent-label' }) recentLabel = 'Recent searches'

  @state() private focused = false
  @state() private dismissed = false
  @state() private activeIndex = -1
  @state() private disabledByForm = false
  private dirty = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private lastSearch: string | undefined
  private unregisterShortcuts: (() => void) | undefined

  @query('.input') private readonly input?: HTMLInputElement | null
  @query('.field') private readonly field?: HTMLElement | null

  /** The containing form, when this control is associated with one. */
  get form() {
    return this.internals.form
  }

  /** Labels associated with this form control. */
  get labels() {
    return this.internals.labels
  }

  override connectedCallback() {
    super.connectedCallback()
    if (isServer) return
    this.loadHistory()
    this.unregisterShortcuts = registerShortcuts(
      this,
      () => {
        const keys = this.shortcutParts.composed
        return keys && !this.effectiveDisabled ? [{ keys, allowInInputs: true }] : []
      },
      () => this.focusFromShortcut(),
    )
    document.addEventListener('keydown', this.handleDocumentKeydown)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unregisterShortcuts?.()
    this.unregisterShortcuts = undefined
    document.removeEventListener('keydown', this.handleDocumentKeydown)
    clearTimeout(this.timer)
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
    if (!this.value) return
    this.cancelPending()
    this.value = ''
    this.dirty = true
    this.activeIndex = -1
    this.dispatchEvent(new Event('clear', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    this.emitSearch('clear')
  }

  /** Empties the recent searches (and the stored history under `history-key`), firing `recent-change`. */
  clearRecent() {
    this.updateRecent([])
  }

  formResetCallback() {
    this.cancelPending()
    this.dirty = false
    this.value = this.getAttribute('value') ?? ''
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled
  }

  formStateRestoreCallback(restored: string | File | FormData | null) {
    if (typeof restored === 'string') this.value = restored
  }

  /** The recent searches the panel shows for the current query. */
  private get recentMatches(): string[] {
    const query = this.value.trim().toLocaleLowerCase()
    const recent = Array.isArray(this.recent) ? this.recent : []
    const filtered = query ? recent.filter((item) => item.toLocaleLowerCase().includes(query) && item.toLocaleLowerCase() !== query) : recent
    return filtered.slice(0, Math.max(0, this.recentLimit))
  }

  private get open() {
    return this.focused && !this.dismissed && !this.effectiveDisabled && this.recentMatches.length > 0
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  /** `shortcut` split into what the shared shortcut listener accepts and single printable keys handled here. */
  private get shortcutParts() {
    const alternatives = this.shortcut
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    const bare = alternatives.filter((part) => part.length === 1)
    const composed = alternatives.filter((part) => part.length > 1).join(', ')
    return { alternatives, bare, composed }
  }

  private get shortcutHint() {
    const [first] = this.shortcutParts.alternatives
    if (!first) return ''
    if (first.length === 1) return first
    return formatShortcut(first)[0] ?? ''
  }

  private get storageKey() {
    return this.historyKey ? `${STORAGE_PREFIX}${this.historyKey}` : ''
  }

  private loadHistory() {
    if (!this.storageKey) return
    try {
      const stored = JSON.parse(localStorage.getItem(this.storageKey) ?? 'null') as unknown
      if (Array.isArray(stored)) this.recent = stored.filter((item): item is string => typeof item === 'string')
    } catch {
      // Storage unavailable (private mode, sandboxed frame) or a corrupted entry: keep the given list.
    }
  }

  private updateRecent(recent: string[]) {
    this.recent = recent
    this.activeIndex = -1
    if (this.storageKey) {
      try {
        if (recent.length) localStorage.setItem(this.storageKey, JSON.stringify(recent))
        else localStorage.removeItem(this.storageKey)
      } catch {
        // The list still updates for this page.
      }
    }
    this.dispatchEvent(new CustomEvent<SearchFieldRecentChangeDetail>('recent-change', { detail: { recent: [...recent] } }))
  }

  private record(query: string) {
    const value = query.trim()
    if (!this.historyKey || !value) return
    const recent = [value, ...this.recent.filter((item) => item !== value)].slice(0, Math.max(1, this.recentLimit))
    this.updateRecent(recent)
  }

  private cancelPending() {
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private emitSearch(trigger: SearchFieldTrigger, force = false) {
    this.cancelPending()
    if (!force && this.value === this.lastSearch) return
    this.lastSearch = this.value
    this.dispatchEvent(new CustomEvent<SearchFieldSearchDetail>('search', { detail: { value: this.value, trigger } }))
  }

  private scheduleSearch() {
    this.cancelPending()
    if (this.debounce <= 0) {
      this.emitSearch('input')
      return
    }
    this.timer = setTimeout(() => this.emitSearch('input'), this.debounce)
  }

  private pick(item: string) {
    this.value = item
    this.dirty = true
    this.dismissed = true
    this.activeIndex = -1
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    this.emitSearch('recent', true)
    this.record(item)
  }

  private focusFromShortcut() {
    if (this.effectiveDisabled) return
    this.input?.focus()
    this.input?.select()
  }

  private handleDocumentKeydown = (event: KeyboardEvent) => {
    const { bare } = this.shortcutParts
    if (!bare.length || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || this.effectiveDisabled) return
    if (!bare.includes(event.key) || isEditableTarget(event)) return
    event.preventDefault()
    this.focusFromShortcut()
  }

  private handleInput(event: Event) {
    this.dirty = true
    this.value = (event.target as HTMLInputElement).value
    this.dismissed = false
    this.activeIndex = -1
    redispatchEvent(this, event)
    this.scheduleSearch()
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.isComposing) return
    const matches = this.recentMatches
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!matches.length) return
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        if (!this.open) {
          this.dismissed = false
          this.activeIndex = step > 0 ? 0 : matches.length - 1
          return
        }
        this.activeIndex = this.activeIndex < 0 ? (step > 0 ? 0 : matches.length - 1) : (this.activeIndex + step + matches.length) % matches.length
        return
      }
      case 'Enter': {
        event.preventDefault()
        const active = this.open && this.activeIndex >= 0 ? matches[this.activeIndex] : undefined
        if (active !== undefined) {
          this.pick(active)
          return
        }
        this.dismissed = true
        this.activeIndex = -1
        this.emitSearch('submit', true)
        this.record(this.value)
        return
      }
      case 'Escape': {
        if (this.open) {
          event.preventDefault()
          this.dismissed = true
          this.activeIndex = -1
        } else if (this.value) {
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
  }

  private handleFocusout() {
    this.focused = false
    this.activeIndex = -1
  }

  private handleFieldClick(event: Event) {
    if (event.target === this.input || this.effectiveDisabled) return
    this.input?.focus()
  }

  private handleClearClick(event: Event) {
    event.stopPropagation()
    this.clear()
    this.input?.focus()
  }

  protected override willUpdate(changed: PropertyValues) {
    if (changed.has('historyKey') && changed.get('historyKey') !== undefined) this.loadHistory()
    if (this.lastSearch === undefined) this.lastSearch = this.value
  }

  protected override updated(changed: PropertyValues) {
    const states: Record<string, boolean> = {
      'focus-within': this.focused,
      expanded: this.open,
      loading: this.loading,
      disabled: this.effectiveDisabled,
    }
    for (const [name, on] of Object.entries(states)) {
      if (on) this.internals.states.add(name)
      else this.internals.states.delete(name)
    }
    this.internals.setFormValue(this.effectiveDisabled ? null : this.value, this.value)
    if (changed.has('activeIndex') && this.activeIndex >= 0) {
      this.renderRoot.querySelector(`#recent-${this.activeIndex}`)?.scrollIntoView({ block: 'nearest' })
    }
  }

  private renderHighlighted(text: string) {
    const query = this.value.trim()
    const index = query ? text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1
    if (index < 0) return text
    return html`${text.slice(0, index)}<mark>${text.slice(index, index + query.length)}</mark>${text.slice(index + query.length)}`
  }

  private renderLeadingIcon() {
    if (this.loading) return html`<span class="spinner" aria-hidden="true"></span>`
    return html`<span class="icon" aria-hidden="true">
      <slot name="search-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"></circle>
          <path d="m20 20-3.5-3.5"></path>
        </svg>
      </slot>
    </span>`
  }

  private renderClearButton() {
    if (!this.value || this.effectiveDisabled) return nothing
    return html`<button class="clear" type="button" aria-label="Clear search" tabindex="-1" @click=${this.handleClearClick}>
      <slot name="clear-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="m15 9-6 6M9 9l6 6"></path>
        </svg>
      </slot>
    </button>`
  }

  private renderShortcutHint() {
    const hint = this.shortcutHint
    if (!hint || this.value || this.effectiveDisabled) return nothing
    return html`<kbd class="shortcut" aria-hidden="true">${hint}</kbd>`
  }

  private renderPanel() {
    const matches = this.recentMatches
    const open = this.open
    return html`<c2-overlay popover="manual" fit-anchor .anchor=${this.field ?? undefined} .open=${open}>
      <div class="panel" @pointerdown=${(event: Event) => event.preventDefault()}>
        <div class="panel-header">
          <span id="recent-label">${this.recentLabel}</span>
          <button class="panel-action" type="button" tabindex="-1" @click=${() => this.clearRecent()}>Clear</button>
        </div>
        <div id="recent-list" class="list" role="listbox" aria-labelledby="recent-label">
          ${matches.map(
            (item, index) =>
              html`<div
                id=${`recent-${index}`}
                class="option"
                role="option"
                aria-selected=${index === this.activeIndex ? 'true' : 'false'}
                @pointerenter=${() => (this.activeIndex = index)}
                @click=${() => this.pick(item)}
              >
                <span class="option-icon" aria-hidden="true">
                  <slot name="recent-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="9"></circle>
                      <path d="M12 7v5l3 2"></path>
                    </svg>
                  </slot>
                </span>
                <span class="option-text">${this.renderHighlighted(item)}</span>
              </div>`,
          )}
        </div>
      </div>
    </c2-overlay>`
  }

  override render() {
    const hasRecent = this.recentMatches.length > 0 || !!this.historyKey || this.recent.length > 0
    const open = this.open
    const name = this.ariaLabel || (this.placeholder ? undefined : 'Search')
    const shortcuts = this.shortcut && !isServer ? [ariaKeyShortcuts(this.shortcutParts.composed), ...this.shortcutParts.bare].filter(Boolean).join(' ') : ''
    return html`<div class="field" @click=${this.handleFieldClick}>
        ${this.renderLeadingIcon()}
        <input
          class="input"
          type="search"
          role=${ifDefined(hasRecent ? 'combobox' : undefined)}
          autocomplete="off"
          enterkeyhint="search"
          aria-label=${ifDefined(name)}
          aria-autocomplete=${ifDefined(hasRecent ? 'list' : undefined)}
          aria-controls=${ifDefined(hasRecent ? 'recent-list' : undefined)}
          aria-expanded=${ifDefined(hasRecent ? String(open) : undefined)}
          aria-activedescendant=${ifDefined(open && this.activeIndex >= 0 ? `recent-${this.activeIndex}` : undefined)}
          aria-keyshortcuts=${ifDefined(shortcuts || undefined)}
          aria-busy=${this.loading ? 'true' : nothing}
          name=${ifDefined(this.name || undefined)}
          placeholder=${this.placeholder || nothing}
          .value=${live(this.value)}
          ?disabled=${this.effectiveDisabled}
          @input=${this.handleInput}
          @change=${(event: Event) => redispatchEvent(this, event)}
          @keydown=${this.handleKeydown}
          @focusin=${this.handleFocusin}
          @focusout=${this.handleFocusout}
        />
        ${this.renderClearButton()} ${this.renderShortcutHint()}
        <slot name="suffix-icon"></slot>
      </div>
      ${hasRecent ? this.renderPanel() : nothing}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-search-field': SearchField
  }
}
