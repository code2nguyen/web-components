import { LitElement, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { html, unsafeStatic } from 'lit/static-html.js'
import { state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import { live } from 'lit/directives/live.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/avatar'
import '@c2n/button'
import '@c2n/chip'
import '@c2n/command'
import '@c2n/date-input'
import '@c2n/list'
import '@c2n/list-item'
import '@c2n/number-input'
import '@c2n/overlay'
import '@c2n/sheet'
import '@c2n/text-field'
import type { Overlay } from '@c2n/overlay'
import type { Command, CommandSelectEventDetail } from '@c2n/command'
import type { SelectionChangeEventDetail } from '@c2n/list'
import type {
  FilterBuilderLabels,
  FilterChangeEventDetail,
  FilterField,
  FilterGroup,
  FilterNode,
  FilterOption,
  FilterRelativeDate,
  FilterRule,
  FilterValue,
} from './filter-types.js'
import {
  DEFAULT_LABELS,
  defaultOperator,
  initials,
  isChoiceField,
  isComplete,
  isGroup,
  isRelative,
  isValueless,
  matches,
  normalizeTree,
  operatorLabel,
  operatorsOf,
  ruleValues,
  toggleOption,
  valueText,
  withOperator,
} from './filter-model.js'
import styles from './filter-builder.scss?inline'

export * from './filter-types.js'

/** Events fired by {@link FilterBuilder}, keyed for `addEventListener`. */
export interface FilterBuilderEventMap {
  'filter-change': CustomEvent<FilterChangeEventDetail>
}

export interface FilterBuilder {
  addEventListener: TypedAddEventListener<FilterBuilder, FilterBuilderEventMap>
  removeEventListener: TypedRemoveEventListener<FilterBuilder, FilterBuilderEventMap>
}

type EditorMode = 'fields' | 'operator' | 'value'

interface Editing {
  /** Index in the working list, or -1 while picking a field for a new condition. */
  index: number
  mode: EditorMode
}

const ICON_TAG = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/
const VALUE_SEPARATOR = '\u0000'
const LOAD_DEBOUNCE = 200

const plusIcon = html`<svg slot="prefix-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
  <path d="M12 5v14M5 12h14" />
</svg>`
const checkIcon = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M20 6 9 17l-5-5" />
</svg>`
const filterIcon = html`<svg
  slot="prefix-icon"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M3 5h18l-7 9v5l-4 2v-7z" />
</svg>`
const backIcon = html`<svg
  slot="prefix-icon"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="m15 18-6-6 6-6" />
</svg>`

/**
 * A filter bar: one chip per condition, read as a sentence (`Status | is any of | Active, Paused`), an add-filter
 * picker, and an editor for each part of a condition. The model of Linear, Airtable and Polaris IndexFilters. Pair it
 * with `c2-table` or any list.
 *
 * Describe what can be filtered with `fields` (a property, or JSON in the attribute): each field has an `id`, a
 * `label`, a `type` (`enum`, `person`, `multi`, `text`, `number`, `date`, `boolean` or `custom`) and, for the choice
 * types, `options` or an async `loadOptions(query, signal)`. The type picks the operators and the value editor. An
 * option carries its look as data — `icon` (the tag of an icon element such as `c2-feather-flag`), `color` (a dot),
 * `avatar` (an image; `person` fields fall back to initials), `description` and `count` — and `renderOption`,
 * `renderValue` and `renderEditor` on a field replace a row, the chip's value or the whole editor.
 *
 * The component filters nothing itself. `value` is a plain JSON tree, `{ op: 'and', rules: [{ field, operator, value }] }`,
 * holding option values only, never labels or colours, so it can be stored as a saved view. Every change fires
 * `filter-change` with the new tree. A condition still being written (a field picked, no value yet) is shown as a
 * dashed chip but kept out of the tree, and dropped when its editor closes empty. A nested group in a tree it is given
 * shows as one removable chip.
 *
 * Picking a field opens its value editor straight away. Typing in the field picker also matches the options of
 * every choice field, so "Ana" offers "Assignee is Ana Ng" in one step. On `enum` and `person` fields the operator
 * follows the number of values: one value is `is` (`eq`), several are `is any of` (`in`). Below `compact-below`
 * pixels of width, the bar becomes a "Filters" button and a scrolling row of chips; the button opens a bottom sheet
 * listing the conditions, each editable in place.
 *
 * @tag c2-filter-builder
 *
 * @slot end - Content at the end of the bar, such as a `c2-search-field`.
 *
 * @event {CustomEvent<FilterChangeEventDetail>} filter-change - The tree changed: a condition was added, edited or removed. `detail.value` is the new tree (also in `value`). Does not bubble.
 *
 * @csspart bar - The row holding the chips, the add button, the clear button and the `end` slot.
 * @csspart chips - The wrapping (or, when compact, scrolling) row of chips and buttons.
 * @csspart chip - Each condition chip (a `c2-chip`).
 * @csspart add-button - The "Filter" button that opens the field picker.
 * @csspart clear-button - The "Clear" button shown while there are conditions.
 * @csspart popover - The surface of the field, operator and value editors.
 * @csspart sheet - The `c2-sheet` of the compact layout.
 *
 * @cssproperty {pixel} [--c2-filter-builder--gap=6px] - Space between chips and buttons.
 * @cssproperty {pixel} [--c2-filter-builder__chip--height=28px]
 * @cssproperty {border} [--c2-filter-builder__chip--border=1px solid #d4d4d8]
 * @cssproperty {border-radius} [--c2-filter-builder__chip--border-radius=999px]
 * @cssproperty {color} [--c2-filter-builder__chip--background-color=#ffffff]
 * @cssproperty {pixel} [--c2-filter-builder__chip--font-size=14px]
 * @cssproperty {border} [--c2-filter-builder__chip__draft--border=1px dashed #a1a1aa] - Border of a condition that has no value yet.
 * @cssproperty {color} [--c2-filter-builder__field--color=#71717a] - Text colour of the field part.
 * @cssproperty {color} [--c2-filter-builder__operator--color=#71717a] - Text colour of the operator part.
 * @cssproperty {color} [--c2-filter-builder__value--color=#18181b] - Text colour of the value part.
 * @cssproperty {font-weight} [--c2-filter-builder__value--font-weight=500]
 * @cssproperty {pixel} [--c2-filter-builder__icon--size=16px] - Size of field and option icons.
 * @cssproperty {pixel} [--c2-filter-builder__dot--size=8px] - Size of an option's colour dot.
 * @cssproperty {pixel} [--c2-filter-builder__avatar--size=18px] - Size of a person's avatar.
 * @cssproperty {border} [--c2-filter-builder__add-button--border=1px dashed #a1a1aa]
 * @cssproperty {color} [--c2-filter-builder__add-button--color=#71717a]
 * @cssproperty {border-radius} [--c2-filter-builder__add-button--border-radius=999px]
 * @cssproperty {color} [--c2-filter-builder__clear-button--color=#71717a]
 * @cssproperty {pixel} [--c2-filter-builder__popover--width=280px]
 * @cssproperty {color} [--c2-filter-builder__popover--background-color=#ffffff]
 * @cssproperty {border} [--c2-filter-builder__popover--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-filter-builder__popover--border-radius=8px]
 * @cssproperty {shadow} [--c2-filter-builder__popover--box-shadow=0 10px 30px rgba(24, 24, 27, 0.12), 0 2px 6px rgba(24, 24, 27, 0.08)]
 * @cssproperty {pixel} [--c2-filter-builder__popover--max-height=360px] - Height cap of a list of options; the list scrolls past it.
 * @cssproperty {color} [--c2-filter-builder__muted--color=#71717a] - Headings, counts and hints in the editors.
 * @cssproperty {color} [--c2-filter-builder__check--color=#0265dc] - Check mark of a selected option.
 *
 * @internalcomponent c2-chip
 * @internalcomponent c2-chip-part
 * @internalcomponent c2-command
 * @internalcomponent c2-overlay
 * @internalcomponent c2-sheet
 */
@customElement('c2-filter-builder')
export class FilterBuilder extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  /** What can be filtered. A property, or JSON in the attribute (without the render and load callbacks). */
  @property({ converter: jsonPropertyConverter }) fields: FilterField[] = []

  /** The filter tree. Holds option values only. Set it to restore a saved view; read it, or listen to `filter-change`. */
  @property({ converter: jsonPropertyConverter }) value: FilterGroup = { op: 'and', rules: [] }

  /** Interface text, for translation. Partial: missing entries keep the English default. */
  @property({ attribute: false }) labels: Partial<FilterBuilderLabels> = {}

  /** Disables adding, editing and removing conditions. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Width in pixels below which the bar switches to the compact layout. `0` never switches. */
  @property({ type: Number, attribute: 'compact-below' }) compactBelow = 480

  /** Locale of dates and numbers in the chips. Defaults to the browser's. */
  @property() locale: string | undefined = undefined

  /** The conditions on screen, including one still being written. `value` holds the complete ones. */
  @state() private nodes: FilterNode[] = []
  @state() private editing: Editing | null = null
  @state() private query = ''
  @state() private loaded: FilterOption[] | null = null
  @state() private loading = false
  @state() private compact = false
  @state() private sheetRule: number | null = null

  /** Options seen so far, per field: static, loaded or resolved. Labels a value whose field loads its options. */
  private known = new Map<string, Map<string, FilterOption>>()
  private lastEmitted = ''
  private anchor: HTMLElement | null = null
  private loadController: AbortController | null = null
  private loadTimer = 0
  private resizeObserver?: ResizeObserver
  private resolving = new Set<string>()
  /** Set while the popover is hidden only to move it to another anchor. */
  private moving = false

  constructor() {
    super()
    this.internals.role = 'group'
  }

  private get text(): FilterBuilderLabels {
    const labels = this.labels ?? {}
    return {
      ...DEFAULT_LABELS,
      ...labels,
      units: { ...DEFAULT_LABELS.units, ...labels.units },
      operators: { ...DEFAULT_LABELS.operators, ...labels.operators },
    }
  }

  override connectedCallback() {
    super.connectedCallback()
    if (typeof ResizeObserver === 'undefined') return
    this.resizeObserver ??= new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      this.compact = this.compactBelow > 0 && width > 0 && width < this.compactBelow
    })
    this.resizeObserver.observe(this)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    this.loadController?.abort()
    window.clearTimeout(this.loadTimer)
  }

  override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('value')) {
      const tree = normalizeTree(this.value)
      if (JSON.stringify(tree) !== this.lastEmitted) {
        this.nodes = tree.rules
        this.lastEmitted = JSON.stringify(tree)
      }
    }
    if (changed.has('fields')) {
      for (const field of this.fields ?? []) {
        if (field.options) for (const option of field.options) this.remember(field.id, option)
      }
    }
    if (changed.has('labels') || !this.hasUpdated) this.internals.ariaLabel = this.text.filters
  }

  override updated() {
    this.resolveUnknown()
  }

  // ---- model ----------------------------------------------------------------------------------------------------

  private fieldOf(id: string): FilterField | undefined {
    return (this.fields ?? []).find((field) => field.id === id)
  }

  private remember(fieldId: string, option: FilterOption) {
    let options = this.known.get(fieldId)
    if (!options) this.known.set(fieldId, (options = new Map()))
    options.set(option.value, option)
  }

  private optionsOf(field: FilterField, rule: FilterRule): FilterOption[] {
    const known = this.known.get(field.id)
    return ruleValues(rule).map((value) => known?.get(value) ?? { value, label: value })
  }

  /** Asks `resolveOptions` for the labels of stored values no option list has described yet. */
  private resolveUnknown() {
    for (const node of this.nodes) {
      if (isGroup(node)) continue
      const field = this.fieldOf(node.field)
      if (!field?.resolveOptions) continue
      const known = this.known.get(field.id)
      const missing = ruleValues(node).filter((value) => !known?.has(value) && !this.resolving.has(`${field.id}${VALUE_SEPARATOR}${value}`))
      if (!missing.length) continue
      for (const value of missing) this.resolving.add(`${field.id}${VALUE_SEPARATOR}${value}`)
      field
        .resolveOptions(missing, new AbortController().signal)
        .then((options) => {
          for (const option of options) this.remember(field.id, option)
          this.requestUpdate()
        })
        .catch(() => undefined)
    }
  }

  /** The tree of complete conditions; fires `filter-change` when it differs from the last one. */
  private commit(nodes: FilterNode[]) {
    this.nodes = nodes
    const labels = this.text
    const rules = nodes.filter((node) => isGroup(node) || isComplete(this.fieldOf(node.field), node, labels))
    const tree: FilterGroup = { op: normalizeTree(this.value).op, rules }
    const json = JSON.stringify(tree)
    if (json === this.lastEmitted) return
    this.lastEmitted = json
    this.value = tree
    this.dispatchEvent(new CustomEvent<FilterChangeEventDetail>('filter-change', { detail: { value: tree } }))
  }

  private updateRule(index: number, rule: FilterRule) {
    const nodes = [...this.nodes]
    nodes[index] = rule
    this.commit(nodes)
  }

  private removeRule(index: number) {
    this.commit(this.nodes.filter((_, i) => i !== index))
  }

  /** Drops conditions left without a value when their editor closes. */
  private dropIncomplete() {
    const labels = this.text
    const nodes = this.nodes.filter((node) => isGroup(node) || isComplete(this.fieldOf(node.field), node, labels))
    if (nodes.length !== this.nodes.length) this.commit(nodes)
  }

  // ---- editor state ---------------------------------------------------------------------------------------------

  private get overlay(): Overlay | null {
    return this.renderRoot.querySelector<Overlay>('#editor')
  }

  private async open(editing: Editing, anchor: HTMLElement | null) {
    if (this.disabled) return
    this.editing = editing
    this.query = ''
    this.loaded = null
    this.startLoad('')
    if (this.compact && this.sheetOpen) return
    this.anchor = anchor
    await this.updateComplete
    const overlay = this.overlay
    if (!overlay) return
    overlay.anchor = anchor ?? undefined
    if (!overlay.matches(':popover-open')) overlay.showPopover()
    await overlay.updateComplete
    this.focusEditor()
  }

  private focusEditor() {
    const root = this.compact && this.sheetOpen ? this.renderRoot.querySelector('.sheet-editor') : this.overlay
    const target =
      root?.querySelector<HTMLElement>('[data-autofocus]') ??
      root?.querySelector<HTMLElement>('c2-command, c2-list, c2-text-field, c2-number-input, c2-date-input')
    target?.focus()
  }

  private close() {
    const overlay = this.overlay
    if (overlay?.matches(':popover-open')) overlay.hidePopover()
    else this.handleEditorClosed()
  }

  // `beforetoggle` rather than `toggle`: `toggle` is queued, so a close followed at once by a reopen (a click on
  // another part) would arrive after the reopen and wipe the new editor.
  private handleOverlayBeforeToggle = (event: Event) => {
    if ((event as ToggleEvent).newState === 'closed' && !this.moving) this.handleEditorClosed()
  }

  private handleEditorClosed() {
    const editing = this.editing
    // Escape or Enter leave focus in the editor; a click elsewhere has already moved it, and keeps it there.
    const active = this.shadowRoot?.activeElement
    const focusInside = !!active && !!this.overlay?.contains(active)
    this.editing = null
    this.loadController?.abort()
    this.dropIncomplete()
    // Give focus back to the chip that opened the editor, or to the add button for a condition that was dropped.
    const anchor = this.anchor
    this.anchor = null
    if (!editing || this.compact || !focusInside) return
    void this.updateComplete.then(() => {
      if (anchor?.isConnected) anchor.focus()
      else this.renderRoot.querySelector<HTMLElement>('.add')?.focus()
    })
  }

  private chipPart(index: number, name: string): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>(`c2-chip[data-index="${index}"] c2-chip-part[name="${name}"]`)
  }

  // ---- async options --------------------------------------------------------------------------------------------

  private startLoad(query: string) {
    window.clearTimeout(this.loadTimer)
    this.loadController?.abort()
    const field = this.editingField
    if (!field?.loadOptions || this.editing?.mode !== 'value') {
      this.loading = false
      return
    }
    this.loading = true
    const controller = (this.loadController = new AbortController())
    this.loadTimer = window.setTimeout(
      () => {
        field.loadOptions!(query, controller.signal)
          .then((options) => {
            if (controller.signal.aborted) return
            for (const option of options) this.remember(field.id, option)
            this.loaded = options
            this.loading = false
          })
          .catch(() => {
            if (controller.signal.aborted) return
            this.loaded = []
            this.loading = false
          })
      },
      query ? LOAD_DEBOUNCE : 0,
    )
  }

  private get editingRule(): FilterRule | undefined {
    const index = this.editing?.index ?? -1
    const node = index >= 0 ? this.nodes[index] : undefined
    return node && !isGroup(node) ? node : undefined
  }

  private get editingField(): FilterField | undefined {
    const rule = this.editingRule
    return rule ? this.fieldOf(rule.field) : undefined
  }

  // ---- event handlers -------------------------------------------------------------------------------------------

  private handleAdd = (event: Event) => {
    this.open({ index: -1, mode: 'fields' }, event.currentTarget as HTMLElement)
  }

  private handleClear = () => {
    this.commit([])
    this.renderRoot.querySelector<HTMLElement>('.add')?.focus()
  }

  private handlePartClick(index: number, event: CustomEvent<{ name: string }>) {
    const mode = event.detail.name === 'operator' ? 'operator' : 'value'
    this.open({ index, mode }, event.target as HTMLElement)
  }

  private handleRemove(index: number) {
    this.removeRule(index)
    // Focus the chip that took its place, the one before it, or the add button.
    void this.updateComplete.then(() => {
      const count = this.nodes.length
      const chip = count ? this.renderRoot.querySelector<HTMLElement>(`c2-chip[data-index="${Math.min(index, count - 1)}"]`) : null
      const target =
        chip?.querySelector<HTMLElement>('c2-chip-part[interactive]') ?? chip ?? this.renderRoot.querySelector<HTMLElement>('.add, .filters-button')
      target?.focus()
    })
  }

  private handleQuery = (event: Event) => {
    this.query = (event.currentTarget as Command).query
    if (this.editing?.mode === 'value') this.startLoad(this.query)
  }

  private handleFieldPick = async (event: CustomEvent<CommandSelectEventDetail>) => {
    const [fieldId, optionValue] = event.detail.value.split(VALUE_SEPARATOR)
    const field = this.fieldOf(fieldId)
    if (!field) return
    const labels = this.text
    if (optionValue !== undefined) {
      // A value picked straight from the field search: add it to an `is`/`is any of` condition on that field, or start one.
      const index = this.nodes.findIndex((node) => !isGroup(node) && node.field === field.id && ['eq', 'in', 'has_any'].includes(node.operator))
      if (index >= 0) {
        const rule = this.nodes[index] as FilterRule
        if (!ruleValues(rule).includes(optionValue)) this.updateRule(index, toggleOption(field, rule, optionValue))
      } else {
        const operator = field.type === 'multi' ? 'has_any' : defaultOperator(field, labels)
        this.commit([...this.nodes, toggleOption(field, { field: field.id, operator }, optionValue)])
      }
      this.close()
      return
    }
    const operator = defaultOperator(field, labels)
    const rule: FilterRule = { field: field.id, operator }
    const index = this.nodes.length
    this.commit([...this.nodes, rule])
    if (isValueless(field, operator, labels)) {
      this.close()
      return
    }
    if (this.compact && this.sheetOpen) {
      this.sheetRule = index
      this.open({ index, mode: 'value' }, null)
      return
    }
    await this.moveEditor({ index, mode: 'value' })
  }

  private handleOperatorPick = async (event: CustomEvent<SelectionChangeEventDetail>) => {
    const index = this.editing?.index ?? -1
    const rule = this.editingRule
    const field = this.editingField
    const operator = event.detail.value[0]
    if (!rule || !field || !operator) return
    const labels = this.text
    const next = withOperator(field, rule, operator, labels)
    this.updateRule(index, next)
    // A relative date gets a default amount, which the user still wants to see and change.
    const needsEditor = operator === 'last' && !isRelative(rule.value)
    if (isValueless(field, operator, labels) || (isComplete(field, next, labels) && !needsEditor)) {
      if (this.compact && this.sheetOpen) return
      this.close()
      return
    }
    // The new operator needs a value: move on to the value editor.
    if (this.compact && this.sheetOpen) {
      this.editing = { index, mode: 'value' }
      return
    }
    await this.moveEditor({ index, mode: 'value' })
  }

  /** Switches the open popover to another editor, anchored on that condition's value part. */
  private async moveEditor(editing: Editing) {
    await this.updateComplete
    this.editing = editing
    this.query = ''
    this.loaded = null
    this.startLoad('')
    await this.updateComplete
    const anchor = this.chipPart(editing.index, 'value')
    const overlay = this.overlay
    if (overlay && anchor) {
      this.anchor = anchor
      overlay.anchor = anchor
      // Hide and show again so the popover is positioned on the new anchor, without closing the editor.
      this.moving = true
      overlay.hidePopover()
      this.moving = false
      overlay.showPopover()
    }
    await this.updateComplete
    this.focusEditor()
  }

  private handleOptionPick = (event: CustomEvent<CommandSelectEventDetail>) => {
    const index = this.editing?.index ?? -1
    const rule = this.editingRule
    const field = this.editingField
    if (!rule || !field) return
    this.updateRule(index, toggleOption(field, rule, event.detail.value))
  }

  private setValue(value: FilterValue | undefined) {
    const index = this.editing?.index ?? -1
    const rule = this.editingRule
    if (!rule) return
    const next: FilterRule = { field: rule.field, operator: rule.operator }
    if (value !== undefined) next.value = value
    this.updateRule(index, next)
  }

  private handleEditorKeyDown = (event: KeyboardEvent) => {
    // Enter in a text, number or date field commits and closes; the list editors handle Enter themselves.
    if (event.key !== 'Enter') return
    const target = event.composedPath()[0] as HTMLElement
    if (target.localName !== 'input') return
    if (this.editingField && isChoiceField(this.editingField)) return
    event.preventDefault()
    if (this.compact && this.sheetOpen) this.sheetBack()
    else this.close()
  }

  // ---- compact sheet --------------------------------------------------------------------------------------------

  @state() private sheetOpen = false

  private openSheet = () => {
    this.sheetOpen = true
    this.sheetRule = null
    this.editing = null
  }

  private handleSheetClose = () => {
    this.sheetOpen = false
    this.sheetRule = null
    this.editing = null
    this.dropIncomplete()
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>('.filters-button')?.focus())
  }

  private sheetEdit(index: number) {
    this.sheetRule = index
    this.open({ index, mode: 'value' }, null)
    void this.updateComplete.then(() => this.focusEditor())
  }

  private sheetAdd = () => {
    this.sheetRule = -1
    this.open({ index: -1, mode: 'fields' }, null)
    void this.updateComplete.then(() => this.focusEditor())
  }

  private sheetBack = () => {
    this.sheetRule = null
    this.editing = null
    this.dropIncomplete()
  }

  // ---- rendering: shared pieces ---------------------------------------------------------------------------------

  private renderIcon(tag: string | undefined, slot?: string) {
    if (!tag || !ICON_TAG.test(tag)) return nothing
    const name = unsafeStatic(tag)
    return html`<${name} class="icon" slot=${slot ?? nothing} aria-hidden="true"></${name}>`
  }

  /** The dot, icon or avatar of an option. */
  private renderVisual(field: FilterField, option: FilterOption, slot?: string) {
    if (option.avatar || field.type === 'person') {
      return html`<c2-avatar
        class="avatar"
        slot=${slot ?? nothing}
        name=${option.label}
        initials=${initials(option.label)}
        src=${option.avatar ?? nothing}
        aria-hidden="true"
      ></c2-avatar>`
    }
    if (option.icon) return this.renderIcon(option.icon, slot)
    if (option.color) return html`<span class="dot" slot=${slot ?? nothing} style=${styleMap({ '--dot-color': option.color })} aria-hidden="true"></span>`
    return nothing
  }

  private renderValueContent(field: FilterField, rule: FilterRule) {
    const options = this.optionsOf(field, rule)
    if (field.renderValue) return field.renderValue({ field, rule, options })
    const text = valueText(field, rule, options, this.text, this.locale)
    if (!isChoiceField(field) || !options.length) return text
    const visuals = options.slice(0, 3).map((option) => this.renderVisual(field, option))
    return html`<span class="visuals" slot="prefix">${visuals}</span>${text}`
  }

  private renderChip(node: FilterNode, index: number) {
    const labels = this.text
    if (isGroup(node)) {
      const count = node.rules.length
      return html`<c2-chip
        class="chip"
        part="chip"
        data-index=${index}
        removable
        ?disabled=${this.disabled}
        remove-label=${labels.remove}
        @remove=${() => this.handleRemove(index)}
      >
        <c2-chip-part name="field" class="field">${labels.conditions.replace('{count}', String(count))}</c2-chip-part>
        <c2-chip-part name="operator" class="operator">${node.op === 'or' ? labels.any : labels.all}</c2-chip-part>
      </c2-chip>`
    }
    const field = this.fieldOf(node.field)
    const editing = this.editing?.index === index ? this.editing.mode : null
    if (!field) {
      return html`<c2-chip
        class="chip"
        part="chip"
        data-index=${index}
        removable
        ?disabled=${this.disabled}
        remove-label=${labels.remove}
        @remove=${() => this.handleRemove(index)}
      >
        <c2-chip-part name="field" class="field">${node.field}</c2-chip-part>
        <c2-chip-part name="operator" class="operator">${labels.operators[node.operator] ?? node.operator}</c2-chip-part>
        ${node.value === undefined ? nothing : html`<c2-chip-part name="value" class="value">${JSON.stringify(node.value)}</c2-chip-part>`}
      </c2-chip>`
    }
    const valueless = isValueless(field, node.operator, labels)
    const complete = isComplete(field, node, labels)
    const operator = operatorLabel(field, node.operator, labels)
    const options = this.optionsOf(field, node)
    const valueLabel = valueText(field, node, options, labels, this.locale)
    return html`<c2-chip
      class=${complete ? 'chip' : 'chip draft'}
      part="chip"
      data-index=${index}
      removable
      ?disabled=${this.disabled}
      remove-label=${labels.remove}
      @remove=${() => this.handleRemove(index)}
      @part-click=${(event: CustomEvent<{ name: string }>) => this.handlePartClick(index, event)}
    >
      <c2-chip-part name="field" class="field">${this.renderIcon(field.icon, 'prefix')}${field.label}</c2-chip-part>
      <c2-chip-part
        name="operator"
        class="operator"
        interactive
        haspopup="listbox"
        label=${`${field.label}: ${operator}`}
        .expanded=${editing === 'operator'}
        ?disabled=${this.disabled}
        >${operator}</c2-chip-part
      >
      ${
        valueless
          ? nothing
          : html`<c2-chip-part
              name="value"
              class="value"
              interactive
              haspopup=${isChoiceField(field) ? 'listbox' : 'dialog'}
              label=${`${field.label} ${operator}: ${valueLabel || '…'}`}
              .expanded=${editing === 'value'}
              ?disabled=${this.disabled}
              >${complete ? this.renderValueContent(field, node) : '…'}</c2-chip-part
            >`
      }
    </c2-chip>`
  }

  // ---- rendering: editors ---------------------------------------------------------------------------------------

  private renderEditor() {
    const editing = this.editing
    if (!editing) return nothing
    if (editing.mode === 'fields') return this.renderFieldPicker()
    const rule = this.editingRule
    const field = this.editingField
    if (!rule || !field) return nothing
    if (editing.mode === 'operator') return this.renderOperatorPicker(field, rule)
    return this.renderValueEditor(field, rule)
  }

  private renderFieldPicker() {
    const labels = this.text
    const fields = (this.fields ?? []).filter((field) => matches(this.query, field.label, field.id))
    const values = this.query.trim()
      ? (this.fields ?? []).flatMap((field) =>
          isChoiceField(field) && field.options
            ? field.options.filter((option) => matches(this.query, option.label, option.keywords)).map((option) => ({ field, option }))
            : [],
        )
      : []
    return html`<c2-command
      class="command"
      manual-filter
      placeholder=${labels.searchFields}
      label=${labels.searchFields}
      @input=${this.handleQuery}
      @command-select=${this.handleFieldPick}
    >
      ${
        fields.length
          ? html`<c2-command-group heading=${labels.fields}>
              ${repeat(
                fields,
                (field) => field.id,
                (field) => html`<c2-command-item value=${field.id}>${this.renderIcon(field.icon, 'prefix-icon')}${field.label}</c2-command-item>`,
              )}
            </c2-command-group>`
          : nothing
      }
      ${
        values.length
          ? html`<c2-command-group heading=${labels.values}>
              ${values
                .slice(0, 20)
                .map(
                  ({ field, option }) =>
                    html`<c2-command-item value=${`${field.id}${VALUE_SEPARATOR}${option.value}`}
                      >${this.renderVisual(field, option, 'prefix-icon')}${option.label}<span slot="suffix-icon" class="meta"
                        >${field.label}</span
                      ></c2-command-item
                    >`,
                )}
            </c2-command-group>`
          : nothing
      }
      <span slot="empty">${labels.noResults}</span>
    </c2-command>`
  }

  private renderOperatorPicker(field: FilterField, rule: FilterRule) {
    const labels = this.text
    // On choice fields `in`/`not_in` are the plural of `eq`/`neq`, so they highlight the same row.
    const current = rule.operator === 'in' ? 'eq' : rule.operator === 'not_in' ? 'neq' : rule.operator
    return html`<c2-list class="operators" aria-label=${field.label} .value=${[current]} @selection-change=${this.handleOperatorPick}>
      ${operatorsOf(field, labels).map((entry) => html`<c2-list-item value=${entry.id}>${entry.label}</c2-list-item>`)}
    </c2-list>`
  }

  private renderValueEditor(field: FilterField, rule: FilterRule) {
    const labels = this.text
    if (field.renderEditor) {
      return field.renderEditor({
        field,
        rule,
        commit: (value) => this.setValue(value),
        close: () => (this.compact && this.sheetOpen ? this.sheetBack() : this.close()),
      })
    }
    if (isChoiceField(field)) return this.renderOptionList(field, rule)
    const value = rule.value
    const label = `${field.label} ${operatorLabel(field, rule.operator, labels)}`
    if (field.type === 'text') {
      return html`<div class="form" @keydown=${this.handleEditorKeyDown}>
        <c2-text-field
          data-autofocus
          aria-label=${label}
          placeholder=${field.placeholder ?? ''}
          .value=${typeof value === 'string' ? value : ''}
          @input=${(event: Event) => this.setValue((event.currentTarget as HTMLInputElement).value || undefined)}
        ></c2-text-field>
      </div>`
    }
    if (field.type === 'number') return this.renderRange(rule, label, 'number', field)
    if (field.type === 'date') {
      if (rule.operator === 'last') return this.renderRelative(rule, label)
      return this.renderRange(rule, label, 'date', field)
    }
    return nothing
  }

  private renderOptionList(field: FilterField, rule: FilterRule) {
    const labels = this.text
    const selected = new Set(ruleValues(rule))
    const source = field.loadOptions ? (this.loaded ?? []) : (field.options ?? [])
    const options = field.loadOptions ? source : source.filter((option) => matches(this.query, option.label, option.keywords, option.description))
    return html`<c2-command
      class="command"
      manual-filter
      placeholder=${field.placeholder ?? labels.searchValues}
      label=${`${field.label} ${operatorLabel(field, rule.operator, labels)}`}
      @input=${this.handleQuery}
      @command-select=${this.handleOptionPick}
    >
      ${this.loading ? html`<span slot="suffix" class="meta">${labels.loading}</span>` : nothing}
      ${repeat(
        options,
        (option) => option.value,
        (option) => {
          const isSelected = selected.has(option.value)
          const custom = field.renderOption?.({ field, option, selected: isSelected, query: this.query })
          return html`<c2-command-item value=${option.value} keywords=${option.keywords ?? nothing} aria-checked=${String(isSelected)}>
            <span slot="prefix-icon" class=${isSelected ? 'check is-selected' : 'check'}>${checkIcon}</span>
            ${
              custom ??
              html`<span class="option">${this.renderVisual(field, option)}<span class="option-label">${option.label}</span></span
                >${option.description ? html`<span slot="description">${option.description}</span>` : nothing}`
            }
            ${option.count === undefined ? nothing : html`<span slot="suffix-icon" class="meta count">${option.count.toLocaleString(this.locale)}</span>`}
          </c2-command-item>`
        },
      )}
      <span slot="empty">${this.loading ? labels.loading : labels.noResults}</span>
    </c2-command>`
  }

  private renderRange(rule: FilterRule, label: string, kind: 'number' | 'date', field: FilterField) {
    const labels = this.text
    const between = rule.operator === 'between'
    const values: (FilterValue | undefined)[] = between ? (Array.isArray(rule.value) ? rule.value : [null, null]) : [rule.value]
    const parse = (input: string): FilterValue | null => (input === '' ? null : kind === 'number' ? Number(input) : input)
    const set = (position: number, input: string) => {
      const parsed = parse(input)
      if (!between) {
        this.setValue(parsed === null ? undefined : parsed)
        return
      }
      const next = [values[0] ?? null, values[1] ?? null]
      next[position] = parsed
      this.setValue(next as FilterValue)
    }
    const control = (position: number, ariaLabel: string) => {
      const current = values[position]
      const text = current === null || current === undefined ? '' : String(current)
      return kind === 'number'
        ? html`<c2-number-input
            ?data-autofocus=${position === 0}
            aria-label=${ariaLabel}
            .value=${text}
            min=${field.min ?? nothing}
            max=${field.max ?? nothing}
            step=${field.step ?? nothing}
            @input=${(event: Event) => set(position, (event.currentTarget as HTMLInputElement).value)}
            >${field.unit ? html`<span slot="suffix">${field.unit}</span>` : nothing}</c2-number-input
          >`
        : html`<c2-date-input
            ?data-autofocus=${position === 0}
            aria-label=${ariaLabel}
            .value=${text}
            @input=${(event: Event) => set(position, (event.currentTarget as HTMLInputElement).value)}
          ></c2-date-input>`
    }
    return html`<div class="form" @keydown=${this.handleEditorKeyDown}>
      ${control(0, label)} ${between ? html`<span class="meta">${labels.and}</span>${control(1, `${label} (${labels.and})`)}` : nothing}
    </div>`
  }

  private renderRelative(rule: FilterRule, label: string) {
    const labels = this.text
    const value: FilterRelativeDate = isRelative(rule.value) ? rule.value : { amount: 7, unit: 'day' }
    const presets: FilterRelativeDate[] = [
      { amount: 1, unit: 'day' },
      { amount: 7, unit: 'day' },
      { amount: 30, unit: 'day' },
      { amount: 3, unit: 'month' },
    ]
    const unitName = (relative: FilterRelativeDate) => (relative.amount === 1 ? labels.units[relative.unit].one : labels.units[relative.unit].other)
    const units: FilterRelativeDate['unit'][] = ['day', 'week', 'month']
    return html`<div class="form relative" @keydown=${this.handleEditorKeyDown}>
      <div class="presets" role="group" aria-label=${label}>
        ${presets.map(
          (preset) =>
            html`<c2-chip
              selectable
              .selected=${live(preset.amount === value.amount && preset.unit === value.unit)}
              @change=${() => this.setValue({ ...preset })}
              >${preset.amount} ${unitName(preset)}</c2-chip
            >`,
        )}
      </div>
      <div class="custom">
        <c2-number-input
          data-autofocus
          aria-label=${label}
          min="1"
          .value=${String(value.amount)}
          @input=${(event: Event) => {
            const amount = Number((event.currentTarget as HTMLInputElement).value)
            if (amount > 0) this.setValue({ amount, unit: value.unit })
          }}
        ></c2-number-input>
        <c2-list
          class="units"
          aria-label=${label}
          .value=${[value.unit]}
          @selection-change=${(event: CustomEvent<SelectionChangeEventDetail>) => {
            const unit = event.detail.value[0] as FilterRelativeDate['unit'] | undefined
            if (unit) this.setValue({ amount: value.amount, unit })
          }}
        >
          ${units.map((unit) => html`<c2-list-item value=${unit}>${unitName({ amount: value.amount, unit })}</c2-list-item>`)}
        </c2-list>
      </div>
    </div>`
  }

  // ---- rendering: compact sheet ---------------------------------------------------------------------------------

  private renderSheet() {
    const labels = this.text
    const rule = this.sheetRule
    const editing = this.editing
    let body: unknown
    if (rule !== null && editing) {
      const node = editing.index >= 0 ? this.nodes[editing.index] : undefined
      const field = node && !isGroup(node) ? this.fieldOf(node.field) : undefined
      body = html`<div class="sheet-editor">
        <c2-button class="back" @click=${this.sheetBack}>${backIcon}${field?.label ?? labels.addFilter}</c2-button>
        ${
          field && node && !isGroup(node) && editing.mode !== 'fields'
            ? html`${this.renderOperatorPicker(field, node)}${isValueless(field, node.operator, labels) ? nothing : this.renderValueEditor(field, node)}`
            : this.renderEditor()
        }
      </div>`
    } else {
      body = html`<c2-list class="sheet-rules" aria-label=${labels.filters}>
          ${this.nodes.map((node, index) => {
            if (isGroup(node))
              return html`<c2-list-item value=${String(index)} disabled>${labels.conditions.replace('{count}', String(node.rules.length))}</c2-list-item>`
            const field = this.fieldOf(node.field)
            if (!field) return nothing
            const options = this.optionsOf(field, node)
            return html`<c2-list-item value=${String(index)} @click=${() => this.sheetEdit(index)}>
              ${field.label}
              <span slot="description">${operatorLabel(field, node.operator, labels)} ${valueText(field, node, options, labels, this.locale)}</span>
              <c2-button
                slot="suffix-icon"
                class="row-remove"
                aria-label=${`${labels.remove} ${field.label}`}
                @click=${(event: Event) => {
                  // The row opens the editor on click; the remove button is its own control.
                  event.stopPropagation()
                  this.removeRule(index)
                }}
                >×</c2-button
              >
            </c2-list-item>`
          })}
        </c2-list>
        <c2-button class="add" part="add-button" @click=${this.sheetAdd}>${plusIcon}${labels.addFilter}</c2-button>`
    }
    return html`<c2-sheet class="sheet" part="sheet" side="bottom" ?open=${this.sheetOpen} @close=${this.handleSheetClose}>
      <span slot="title">${labels.filters}</span>
      ${this.sheetOpen ? body : nothing}
      <div slot="footer" class="sheet-footer">
        ${this.nodes.length ? html`<c2-button class="clear" @click=${() => this.commit([])}>${labels.clear}</c2-button>` : nothing}
        <c2-button class="done" @click=${() => this.renderRoot.querySelector<HTMLElement & { close(value?: string): void }>('c2-sheet')?.close('done')}
          >${labels.done}</c2-button
        >
      </div>
    </c2-sheet>`
  }

  override render() {
    const labels = this.text
    const count = this.nodes.length
    return html`<div class=${this.compact ? 'bar is-compact' : 'bar'} part="bar">
        ${
          this.compact
            ? html`<c2-button class="filters-button" ?disabled=${this.disabled} @click=${this.openSheet}
                >${filterIcon}${labels.filters}${count ? html`<span class="count-badge">${count}</span>` : nothing}</c2-button
              >`
            : nothing
        }
        <div class="chips" part="chips">
          ${repeat(
            this.nodes,
            (_, index) => index,
            (node, index) => this.renderChip(node, index),
          )}
          ${
            this.compact
              ? nothing
              : html`<c2-button class="add" part="add-button" ?disabled=${this.disabled} aria-haspopup="dialog" @click=${this.handleAdd}
                    >${plusIcon}${labels.addFilter}</c2-button
                  >${count ? html`<c2-button class="clear" part="clear-button" ?disabled=${this.disabled} @click=${this.handleClear}>${labels.clear}</c2-button>` : nothing}`
          }
        </div>
        <slot name="end"></slot>
      </div>
      <c2-overlay id="editor" placement="bottom-start" free-width @beforetoggle=${this.handleOverlayBeforeToggle}>
        <div class="popover" part="popover">${this.compact && this.sheetOpen ? nothing : this.renderEditor()}</div>
      </c2-overlay>
      ${this.compact ? this.renderSheet() : nothing}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-filter-builder': FilterBuilder
  }
}
