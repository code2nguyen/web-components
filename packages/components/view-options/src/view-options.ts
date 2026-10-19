import { LitElement, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { html, unsafeStatic } from 'lit/static-html.js'
import { query, state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { Overlay } from '@c2n/overlay'
import '@c2n/button'
import '@c2n/button-group'
import '@c2n/chip'
import '@c2n/icon-button'
import '@c2n/list-item'
import '@c2n/overlay'
import '@c2n/select'
import '@c2n/switch'
import { ViewField, VIEW_CHILD_CHANGE } from './view-field'
import { ViewToggle } from './view-toggle'
import { viewOptionsMessages } from './messages'
import type {
  ViewChangeEventDetail,
  ViewDefaultRequestEventDetail,
  ViewField as ViewFieldConfig,
  ViewOptionsValue,
  ViewSort,
  ViewToggle as ViewToggleConfig,
} from './view-options-types'
import styles from './view-options.scss?inline'

/** The part of `c2-select`'s `selection-change` detail this component reads. */
type SelectionChangeEventDetail = { value: string[] }

export { ViewField } from './view-field'
export { ViewToggle } from './view-toggle'
export { viewOptionsMessages } from './messages'
export type * from './view-options-types'

/** Events fired by {@link ViewOptions}, keyed for `addEventListener`. */
export interface ViewOptionsEventMap {
  'view-change': CustomEvent<ViewChangeEventDetail>
  'default-request': CustomEvent<ViewDefaultRequestEventDetail>
  toggle: ToggleEvent
}

export interface ViewOptions {
  addEventListener: TypedAddEventListener<ViewOptions, ViewOptionsEventMap>
  removeEventListener: TypedRemoveEventListener<ViewOptions, ViewOptionsEventMap>
}

type Placement =
  'top' | 'top-start' | 'top-end' | 'right' | 'right-start' | 'right-end' | 'bottom' | 'bottom-start' | 'bottom-end' | 'left' | 'left-start' | 'left-end'

/** Option value standing for "no grouping" in the grouping selects; a field id is never empty, but `''` is not a safe option value. */
const NONE = '\u0000none'
const ICON_TAG = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/
const BUILT_IN_LAYOUTS = ['list', 'board', 'table', 'gallery', 'calendar', 'timeline'] as const
type BuiltInLayout = (typeof BUILT_IN_LAYOUTS)[number]

const svg = (body: string) =>
  html`<svg
    slot="prefix-icon"
    class="glyph"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${unsafeStatic(body)}
  </svg>`

const layoutIcons: Record<BuiltInLayout, ReturnType<typeof svg>> = {
  list: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  board: svg(
    '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>',
  ),
  table: svg('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M3 15h18M9 4v16"/>'),
  gallery: svg(
    '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  ),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  timeline: svg('<path d="M4 6h9M8 12h12M4 18h7"/>'),
}
const displayIcon = svg(
  '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
)
const ascendingIcon = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M12 19V5M6 11l6-6 6 6" />
</svg>`
const descendingIcon = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M12 5v14M6 13l6 6 6-6" />
</svg>`
const removeIcon = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
  <path d="M6 6l12 12M18 6L6 18" />
</svg>`
const addIcon = svg('<path d="M12 5v14M5 12h14"/>')

/** `layouts="list board"` in markup, an array (or the same string) from script. */
const layoutsConverter = {
  fromAttribute: (value: string | null) => (value ? value.trim().split(/\s+/) : []),
  toAttribute: (value: string[]) => (Array.isArray(value) ? value.join(' ') : null),
  fromProperty: (value: unknown) => (typeof value === 'string' ? (value.trim() ? value.trim().split(/\s+/) : []) : value),
}

const isBuiltIn = (layout: string): layout is BuiltInLayout => (BUILT_IN_LAYOUTS as readonly string[]).includes(layout)

function sameView(a: ViewOptionsValue, b: ViewOptionsValue): boolean {
  const canonical = (view: ViewOptionsValue) =>
    JSON.stringify([
      view.layout,
      view.groupBy,
      view.subGroupBy,
      view.orderBy.map((sort) => [sort.field, sort.direction]),
      Object.keys(view.show)
        .sort()
        .map((key) => [key, view.show[key]]),
      [...view.properties].sort(),
    ])
  return canonical(a) === canonical(b)
}

/**
 * The "Display" popover of a collection: which layout it uses, what it is grouped and sub-grouped by, how it is
 * ordered (several levels), which kinds of items it includes and which properties each item shows. The component
 * holds no data and renders no items; it edits one `ViewOptionsValue` and fires `view-change`, and the app applies the
 * value to whatever draws the collection. `orderBy` has the shape of `c2-table`'s `sortModel`, `groupBy` feeds its
 * `group-by` and `properties` its columns' `hidden`.
 *
 * Fields come from `c2-view-field` children or from the `fields` array, which wins when both are present and shares
 * `id`, `label` and `icon` with `c2-filter-builder`'s fields. The Show switches come from `c2-view-toggle` children or
 * the `toggles` array the same way. A section with nothing to offer is left out.
 *
 * The component stores nothing: keep `value` wherever the app keeps settings. With `default-value` set, Reset returns
 * to it and the host matches `:state(changed)` while the value differs (the default trigger shows a dot). On a `board`
 * layout, Grouping and Sub-grouping read Columns and Rows.
 *
 * The trigger is slotted into `trigger`; without one a "Display" button is drawn. The panel is a non-modal dialog on
 * the top layer, positioned by `c2-overlay`: Escape and a click outside close it and focus returns to the trigger.
 *
 * @tag c2-view-options
 *
 * @slot - `c2-view-field` and `c2-view-toggle` elements. They render nothing themselves.
 * @slot trigger - The element that opens the panel. Without one, a "Display" button is drawn.
 * @slot extra - App-specific rows (density, timeline zoom) shown below the Show switches.
 *
 * @event {CustomEvent<ViewChangeEventDetail>} view-change - Fired after the user edits the value. `detail.value` is the whole new value (already in `value`), `detail.changed` the key that changed, or `null` after Reset. Does not bubble.
 * @event {CustomEvent<ViewDefaultRequestEventDetail>} default-request - Fired by "Set as default" with the current value. The app decides who may save it, then sets `default-value`. Does not bubble.
 * @event {ToggleEvent} toggle - Fired after the panel opens or closes; `newState` is `open` or `closed`.
 *
 * @cssproperty {pixel} [--c2-view-options__panel--width=320px] - Width of the panel.
 * @cssproperty {color} [--c2-view-options__panel--background=#ffffff]
 * @cssproperty {border} [--c2-view-options__panel--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-view-options__panel--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-view-options__panel--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {padding} [--c2-view-options__section--padding=12px] - Inner padding of each section.
 * @cssproperty {pixel} [--c2-view-options__section--gap=10px] - Space between the rows of a section.
 * @cssproperty {border} [--c2-view-options__section--border-top=1px solid #e4e4e7] - Line between sections.
 * @cssproperty {color} [--c2-view-options__label--color=#71717a] - Row labels: Grouping, Ordering.
 * @cssproperty {font-size} [--c2-view-options__label--font-size=14px]
 * @cssproperty {pixel} [--c2-view-options__label--width=104px] - Width of the row label column.
 * @cssproperty {color} [--c2-view-options__heading--color=#71717a] - Section headings: Show, Display properties.
 * @cssproperty {font-size} [--c2-view-options__heading--font-size=12px]
 * @cssproperty {font-weight} [--c2-view-options__heading--font-weight=600]
 * @cssproperty {letter-spacing} [--c2-view-options__heading--letter-spacing=0.06em]
 * @cssproperty {text-transform} [--c2-view-options__heading--text-transform=uppercase]
 * @cssproperty {color} [--c2-view-options__footer--background=transparent]
 * @cssproperty {color} [--c2-view-options__changed--color=rgb(2, 101, 220)] - Dot on the default trigger while the value differs from `default-value`.
 *
 * @internalcomponent c2-overlay
 * @internalcomponent c2-button-group
 * @internalcomponent c2-select
 * @internalcomponent c2-switch
 * @internalcomponent c2-chip
 *
 * @slotcomponent c2-view-field
 * @slotcomponent c2-view-toggle
 */
@customElement('c2-view-options')
export class ViewOptions extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The view being edited. JSON as an attribute. Missing keys fall back to the first layout, no grouping, no ordering, each toggle's `checked` and every property field. */
  @property({ converter: jsonPropertyConverter }) value: Partial<ViewOptionsValue> | undefined = undefined

  /** What Reset returns to, and what the value is compared with for `:state(changed)`. JSON as an attribute. Without it there is no Reset. */
  @property({ attribute: 'default-value', converter: jsonPropertyConverter }) defaultValue: Partial<ViewOptionsValue> | undefined = undefined

  /** Fields to offer. JSON as an attribute. Replaces the `c2-view-field` children when set. */
  @property({ converter: jsonPropertyConverter }) fields: ViewFieldConfig[] | undefined = undefined

  /** Switches of the Show section. JSON as an attribute. Replaces the `c2-view-toggle` children when set. */
  @property({ converter: jsonPropertyConverter }) toggles: ViewToggleConfig[] | undefined = undefined

  /** Layout ids, space-separated: `list board table gallery calendar timeline` have an icon and a label; any other id is shown as written. One id (or none) hides the Layout switch. */
  @property({ converter: layoutsConverter }) layouts: string[] = []

  /** How many ordering levels "Add sort" allows. `1` gives a single sort. */
  @property({ type: Number, attribute: 'max-sorts' }) maxSorts = 3

  /** Show "Set as default", which fires `default-request`. */
  @property({ type: Boolean, attribute: 'can-set-default' }) canSetDefault = false

  /** Whether the panel is showing. Set it to open or close the panel from code. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Preferred placement of the panel next to the trigger (floating-ui names). */
  @property() placement: Placement = 'bottom-end'

  @query('#overlay') private overlay?: Overlay
  @query('.panel') private panel?: HTMLElement
  @query('slot[name="trigger"]') private triggerSlot?: HTMLSlotElement
  @query('#default-trigger') private defaultTrigger?: HTMLElement

  @state() private childFields: ViewFieldConfig[] = []
  @state() private childToggles: ViewToggleConfig[] = []
  @state() private hasExtra = false

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, viewOptionsMessages)

  /** Open state at the pointerdown that started a press on the trigger; the popover light-dismisses before the click. */
  private openBeforePress: boolean | undefined = undefined

  /** The fields in use: `fields` when set, otherwise the `c2-view-field` children. */
  get resolvedFields(): ViewFieldConfig[] {
    return (this.fields ?? this.childFields).filter((field) => field && field.id)
  }

  /** The switches in use: `toggles` when set, otherwise the `c2-view-toggle` children. */
  get resolvedToggles(): ViewToggleConfig[] {
    return (this.toggles ?? this.childToggles).filter((toggle) => toggle && toggle.key)
  }

  /** The current value with every missing key filled in: what the panel shows and what `view-change` carries. */
  get view(): ViewOptionsValue {
    return this.normalizeView(this.value)
  }

  /** Whether the value differs from `default-value`. Always false without one. */
  get changed(): boolean {
    return this.defaultValue !== undefined && !sameView(this.view, this.normalizeView(this.defaultValue))
  }

  show(): void {
    this.open = true
  }

  hide(): void {
    this.open = false
  }

  private normalizeView(input: Partial<ViewOptionsValue> | undefined): ViewOptionsValue {
    const source = input ?? {}
    const layouts = this.layouts
    const layout = typeof source.layout === 'string' && source.layout ? source.layout : (layouts[0] ?? 'list')
    const groupBy = typeof source.groupBy === 'string' && source.groupBy ? source.groupBy : null
    const subGroupBy = groupBy && typeof source.subGroupBy === 'string' && source.subGroupBy && source.subGroupBy !== groupBy ? source.subGroupBy : null
    const seen = new Set<string>()
    const orderBy = (Array.isArray(source.orderBy) ? source.orderBy : [])
      .filter((sort): sort is ViewSort => !!sort && typeof sort.field === 'string' && !!sort.field && !seen.has(sort.field) && !!seen.add(sort.field))
      .map((sort) => ({ field: sort.field, direction: sort.direction === 'desc' ? 'desc' : 'asc' }) as ViewSort)
    const show: Record<string, boolean> = { ...(source.show && typeof source.show === 'object' ? source.show : {}) }
    for (const toggle of this.resolvedToggles) if (typeof show[toggle.key] !== 'boolean') show[toggle.key] = !!toggle.checked
    const properties = Array.isArray(source.properties)
      ? source.properties.filter((id): id is string => typeof id === 'string')
      : this.resolvedFields.filter((field) => field.property).map((field) => field.id)
    return { layout, groupBy, subGroupBy, orderBy, show, properties }
  }

  /** Applies one edit, keeps the value consistent and announces it. */
  private commit(changed: keyof ViewOptionsValue | null, next: ViewOptionsValue) {
    if (next.subGroupBy && (!next.groupBy || next.subGroupBy === next.groupBy)) next.subGroupBy = null
    this.value = next
    this.dispatchEvent(new CustomEvent<ViewChangeEventDetail>('view-change', { detail: { value: structuredClone(next), changed } }))
  }

  private edit(changed: keyof ViewOptionsValue, mutate: (view: ViewOptionsValue) => void) {
    const next = structuredClone(this.view)
    mutate(next)
    this.commit(changed, next)
  }

  // ---- children ---------------------------------------------------------------------------------------------------

  private readChildren = () => {
    const fields = [...this.children].filter((child): child is ViewField => child instanceof ViewField).map((child) => child.toConfig())
    const toggles = [...this.children].filter((child): child is ViewToggle => child instanceof ViewToggle).map((child) => child.toConfig())
    // Assigning equal arrays would still schedule an update: the children report on every update of their own.
    if (JSON.stringify(fields) !== JSON.stringify(this.childFields)) this.childFields = fields
    if (JSON.stringify(toggles) !== JSON.stringify(this.childToggles)) this.childToggles = toggles
  }

  private handleExtraSlotChange = (event: Event) => {
    this.hasExtra = (event.target as HTMLSlotElement).assignedNodes({ flatten: true }).length > 0
  }

  // ---- trigger ----------------------------------------------------------------------------------------------------

  private get triggerElement(): HTMLElement | null {
    const assigned = this.triggerSlot?.assignedElements({ flatten: true }) ?? []
    return (assigned.find((element): element is HTMLElement => element instanceof HTMLElement) ?? this.defaultTrigger ?? null) as HTMLElement | null
  }

  private syncAnchor = () => {
    void this.syncTriggerAria()
    // Re-render so the overlay is anchored to the new trigger; the anchor is read at render, not kept as state.
    if (this.hasUpdated) this.requestUpdate()
  }

  /** `aria-haspopup` / `aria-expanded` go on the element with the button role: inside a `c2-*` trigger's shadow root. */
  private async syncTriggerAria() {
    const trigger = this.triggerElement as (HTMLElement & { updateComplete?: Promise<unknown> }) | null
    if (!trigger) return
    if (trigger.updateComplete) await trigger.updateComplete
    const inner = trigger.localName.includes('-') ? trigger.shadowRoot?.querySelector<HTMLElement>('button, a, [role="button"]') : null
    const target = inner ?? trigger
    target.setAttribute('aria-haspopup', 'dialog')
    target.setAttribute('aria-expanded', String(this.open))
  }

  private handleTriggerPointerDown = () => {
    this.openBeforePress = this.open
  }

  private handleTriggerClick = (event: Event) => {
    if (event.defaultPrevented) return
    const wasOpen = this.openBeforePress ?? this.open
    this.openBeforePress = undefined
    this.open = !wasOpen
  }

  // ---- overlay ----------------------------------------------------------------------------------------------------

  private handleOverlayToggle = (event: Event) => {
    if (event.target !== this.overlay) return
    const isOpen = (event as ToggleEvent).newState === 'open'
    this.open = isOpen
    if (isOpen) this.panel?.focus()
    else if (this.focusWasInside()) this.triggerElement?.focus()
    void this.syncTriggerAria()
    redispatchEvent(this, event)
  }

  private focusWasInside(): boolean {
    let active: Element | null = document.activeElement
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
    if (!active || active === document.body || active === document.documentElement) return true
    return active === this || !!this.overlay?.contains(active) || !!this.shadowRoot?.contains(active)
  }

  /** The inner controls fire composed `change`/`input`; they are this component's plumbing, not its events. */
  private stopInnerEvent = (event: Event) => {
    // Only this shadow tree's own controls: a control the app slots into `extra` keeps its events.
    let root = (event.composedPath()[0] as Node | undefined)?.getRootNode()
    while (root instanceof ShadowRoot && root !== this.shadowRoot) root = root.host.getRootNode()
    if (root === this.shadowRoot) event.stopPropagation()
  }

  // ---- handlers -----------------------------------------------------------------------------------------------------

  private handleLayoutChange = (event: CustomEvent<{ value: string }>) => {
    const layout = event.detail.value
    if (layout) this.edit('layout', (view) => (view.layout = layout))
  }

  private picked(event: CustomEvent<SelectionChangeEventDetail>): string | null {
    const value = event.detail.value[0]
    return !value || value === NONE ? null : value
  }

  private handleGroupChange = (event: CustomEvent<SelectionChangeEventDetail>) => {
    const groupBy = this.picked(event)
    this.edit('groupBy', (view) => {
      view.groupBy = groupBy
      if (!groupBy || view.subGroupBy === groupBy) view.subGroupBy = null
    })
  }

  private handleSubGroupChange = (event: CustomEvent<SelectionChangeEventDetail>) => {
    const subGroupBy = this.picked(event)
    this.edit('subGroupBy', (view) => (view.subGroupBy = subGroupBy))
  }

  private handleSortFieldChange(level: number, event: CustomEvent<SelectionChangeEventDetail>) {
    const field = this.picked(event)
    if (field) this.edit('orderBy', (view) => (view.orderBy[level] = { ...view.orderBy[level], field }))
  }

  private toggleDirection(level: number) {
    this.edit('orderBy', (view) => {
      const sort = view.orderBy[level]
      if (sort) sort.direction = sort.direction === 'asc' ? 'desc' : 'asc'
    })
  }

  private async removeSort(level: number) {
    this.edit('orderBy', (view) => view.orderBy.splice(level, 1))
    await this.updateComplete
    this.focusInPanel(`.sort[data-level="${Math.max(0, level - 1)}"] c2-select`, '.add-sort')
  }

  private async addSort() {
    const used = new Set(this.view.orderBy.map((sort) => sort.field))
    const free = this.resolvedFields.find((field) => field.orderable && !used.has(field.id))
    if (!free) return
    this.edit('orderBy', (view) => view.orderBy.push({ field: free.id, direction: 'asc' }))
    await this.updateComplete
    this.focusInPanel(`.sort[data-level="${this.view.orderBy.length - 1}"] c2-select`)
  }

  private focusInPanel(...selectors: string[]) {
    for (const selector of selectors) {
      const element = this.panel?.querySelector<HTMLElement>(selector)
      if (element) {
        element.focus()
        return
      }
    }
    this.panel?.focus()
  }

  private handleToggleChange(key: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked
    this.edit('show', (view) => (view.show[key] = checked))
  }

  private handlePropertyChange(id: string, event: Event) {
    const selected = (event.target as HTMLElement & { selected: boolean }).selected
    const order = this.resolvedFields.map((field) => field.id)
    this.edit('properties', (view) => {
      const set = new Set(view.properties)
      if (selected) set.add(id)
      else set.delete(id)
      // Field order, with ids the panel does not list (set by the app) kept at the end.
      view.properties = [...order.filter((field) => set.has(field)), ...[...set].filter((field) => !order.includes(field))]
    })
  }

  private reset = () => {
    if (this.defaultValue === undefined) return
    this.commit(null, this.normalizeView(this.defaultValue))
  }

  private requestDefault = () => {
    this.dispatchEvent(new CustomEvent<ViewDefaultRequestEventDetail>('default-request', { detail: { value: structuredClone(this.view) } }))
  }

  // ---- lifecycle --------------------------------------------------------------------------------------------------

  override connectedCallback() {
    super.connectedCallback()
    this.addEventListener(VIEW_CHILD_CHANGE, this.readChildren)
    if (!isServer && this.renderRoot.hasChildNodes()) void this.updateComplete.then(() => this.syncTriggerAria())
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener(VIEW_CHILD_CHANGE, this.readChildren)
  }

  protected override willUpdate() {
    // Read the children before the first render, so it does not need a second one when the slot reports them.
    if (!this.hasUpdated) this.readChildren()
  }

  protected override firstUpdated() {
    void this.syncTriggerAria()
  }

  protected override updated(changed: PropertyValues<this>) {
    if (changed.has('value') || changed.has('defaultValue') || changed.has('fields') || changed.has('toggles') || changed.has('layouts')) {
      if (this.changed) this.internals.states.add('changed')
      else this.internals.states.delete('changed')
    }
  }

  // ---- rendering ----------------------------------------------------------------------------------------------------

  private renderIcon(tag: string | undefined, slot: string) {
    if (!tag || !ICON_TAG.test(tag)) return nothing
    const name = unsafeStatic(tag)
    return html`<${name} class="icon" slot=${slot} aria-hidden="true"></${name}>`
  }

  private layoutLabel(layout: string): string {
    return isBuiltIn(layout) ? this.msg.t(layout) : layout
  }

  private renderLayouts(view: ViewOptionsValue) {
    if (this.layouts.length < 2) return nothing
    return html`<div class="section" part="section">
      <c2-button-group
        class="layouts"
        appearance="segmented"
        selection="single"
        stretched
        aria-label=${this.msg.t('layout')}
        .value=${view.layout}
        @change=${this.handleLayoutChange}
      >
        ${this.layouts.map(
          (layout) =>
            html`<c2-button class="layout" value=${layout}>${isBuiltIn(layout) ? layoutIcons[layout] : nothing}${this.layoutLabel(layout)}</c2-button>`,
        )}
      </c2-button-group>
    </div>`
  }

  private renderFieldOptions(fields: ViewFieldConfig[], selected: string | null, none?: string) {
    return html`${none === undefined ? nothing : html`<c2-list-item value=${NONE} ?selected=${!selected}>${none}</c2-list-item>`}${fields.map(
      (field) =>
        html`<c2-list-item value=${field.id} label=${field.label} ?selected=${field.id === selected}
          >${this.renderIcon(field.icon, 'prefix-icon')}${field.label}</c2-list-item
        >`,
    )}`
  }

  private renderGrouping(view: ViewOptionsValue) {
    const groupable = this.resolvedFields.filter((field) => field.groupable)
    const orderable = this.resolvedFields.filter((field) => field.orderable)
    if (!groupable.length && !orderable.length) return nothing
    const board = view.layout === 'board'
    const groupLabel = this.msg.t(board ? 'columns' : 'grouping')
    const subLabel = this.msg.t(board ? 'rows' : 'subGrouping')
    const subFields = groupable.filter((field) => field.id !== view.groupBy)
    return html`<div class="section" part="section">
      ${
        groupable.length
          ? html`<div class="row">
                <span class="label" part="label">${groupLabel}</span>
                <c2-select class="group-by" aria-label=${groupLabel} .value=${[view.groupBy ?? NONE]} @selection-change=${this.handleGroupChange}>
                  ${this.renderFieldOptions(groupable, view.groupBy, this.msg.t('noGrouping'))}
                </c2-select>
              </div>
              ${
                view.groupBy && subFields.length
                  ? html`<div class="row">
                      <span class="label" part="label">${subLabel}</span>
                      <c2-select class="sub-group-by" aria-label=${subLabel} .value=${[view.subGroupBy ?? NONE]} @selection-change=${this.handleSubGroupChange}>
                        ${this.renderFieldOptions(subFields, view.subGroupBy, this.msg.t(board ? 'noRows' : 'noSubGrouping'))}
                      </c2-select>
                    </div>`
                  : nothing
              }`
          : nothing
      }
      ${orderable.length ? this.renderOrdering(view, orderable) : nothing}
    </div>`
  }

  private renderOrdering(view: ViewOptionsValue, orderable: ViewFieldConfig[]) {
    const used = view.orderBy.map((sort) => sort.field)
    const canAdd = view.orderBy.length < Math.max(1, this.maxSorts) && orderable.some((field) => !used.includes(field.id))
    const ascending = this.msg.t('ascending')
    return html`<div class="row top">
      <span class="label" part="label">${this.msg.t('ordering')}</span>
      <div class="sorts" role="group" aria-label=${this.msg.t('ordering')}>
        ${view.orderBy.map(
          // Keyed by position, not field: picking another field for a level must keep its row, and the focus in it.
          (sort, level) => {
            const choices = orderable.filter((field) => field.id === sort.field || !used.includes(field.id))
            return html`<div class="sort" data-level=${level}>
              <c2-select
                class="sort-field"
                aria-label=${this.msg.t('sortField', level + 1)}
                .value=${[sort.field]}
                @selection-change=${(event: CustomEvent<SelectionChangeEventDetail>) => this.handleSortFieldChange(level, event)}
              >
                ${this.renderFieldOptions(choices, sort.field)}
              </c2-select>
              <c2-icon-button
                class="direction"
                toggle
                .selected=${sort.direction === 'asc'}
                aria-label=${ascending}
                tooltip=${ascending}
                @click=${() => this.toggleDirection(level)}
                >${sort.direction === 'asc' ? ascendingIcon : descendingIcon}</c2-icon-button
              >
              ${
                view.orderBy.length > 1
                  ? html`<c2-icon-button class="remove-sort" aria-label=${this.msg.t('removeSort', level + 1)} @click=${() => this.removeSort(level)}
                      >${removeIcon}</c2-icon-button
                    >`
                  : nothing
              }
            </div>`
          },
        )}
        ${canAdd ? html`<c2-button class="add-sort" @click=${this.addSort}>${addIcon}${this.msg.t('addSort')}</c2-button>` : nothing}
      </div>
    </div>`
  }

  private renderToggles(view: ViewOptionsValue) {
    const toggles = this.resolvedToggles
    if (!toggles.length && !this.hasExtra) return html`<slot name="extra" hidden @slotchange=${this.handleExtraSlotChange}></slot>`
    return html`<div class="section" part="section">
      ${
        toggles.length
          ? html`<div class="heading" part="heading">${this.msg.t('show')}</div>
              <div class="toggles">
                ${toggles.map(
                  (toggle) =>
                    html`<c2-switch
                      class="toggle"
                      data-key=${toggle.key}
                      .checked=${!!view.show[toggle.key]}
                      @change=${(event: Event) => this.handleToggleChange(toggle.key, event)}
                      >${toggle.label}</c2-switch
                    >`,
                )}
              </div>`
          : nothing
      }
      <slot name="extra" @slotchange=${this.handleExtraSlotChange}></slot>
    </div>`
  }

  private renderProperties(view: ViewOptionsValue) {
    const fields = this.resolvedFields.filter((field) => field.property)
    if (!fields.length) return nothing
    const heading = this.msg.t('properties')
    return html`<div class="section" part="section">
      <div class="heading" part="heading" id="properties-heading">${heading}</div>
      <div class="chips" role="group" aria-labelledby="properties-heading">
        ${fields.map(
          (field) =>
            html`<c2-chip
              class="property"
              selectable
              value=${field.id}
              .selected=${view.properties.includes(field.id)}
              @change=${(event: Event) => this.handlePropertyChange(field.id, event)}
              >${this.renderIcon(field.icon, 'prefix')}${field.label}</c2-chip
            >`,
        )}
      </div>
    </div>`
  }

  private renderFooter(changed: boolean) {
    const hasReset = this.defaultValue !== undefined
    if (!hasReset && !this.canSetDefault) return nothing
    return html`<div class="footer" part="footer">
      ${hasReset ? html`<c2-button class="reset" ?disabled=${!changed} @click=${this.reset}>${this.msg.t('reset')}</c2-button>` : nothing}
      ${this.canSetDefault ? html`<c2-button class="set-default" ?disabled=${hasReset && !changed} @click=${this.requestDefault}>${this.msg.t('setDefault')}</c2-button>` : nothing}
    </div>`
  }

  override render() {
    const view = this.view
    const changed = this.changed
    return html`<slot name="trigger" @slotchange=${this.syncAnchor} @pointerdown=${this.handleTriggerPointerDown} @click=${this.handleTriggerClick}
        ><c2-button id="default-trigger" class="trigger" part="trigger"
          >${displayIcon}${this.msg.t('display')}${changed ? html`<span slot="suffix-icon" class="changed" part="changed"></span>` : nothing}</c2-button
        ></slot
      >
      <c2-overlay
        id="overlay"
        .anchor=${this.triggerElement ?? undefined}
        .placement=${this.placement}
        .open=${this.open}
        free-width
        @toggle=${this.handleOverlayToggle}
      >
        <div
          class="panel"
          part="panel"
          role="dialog"
          aria-label=${this.msg.t('panel')}
          tabindex="-1"
          @change=${this.stopInnerEvent}
          @input=${this.stopInnerEvent}
        >
          ${this.renderLayouts(view)} ${this.renderGrouping(view)} ${this.renderToggles(view)} ${this.renderProperties(view)} ${this.renderFooter(changed)}
        </div>
      </c2-overlay>
      <slot class="fields" hidden @slotchange=${this.readChildren}></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-view-options': ViewOptions
  }
}
