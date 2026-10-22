import { LitElement, html, nothing, svg, unsafeCSS, isServer, type PropertyValues, type TemplateResult } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { property, arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import type { Tree } from '@c2n/tree'
import type { TreeItem } from '@c2n/tree/tree-item.js'
import type { TreeChildrenLoader, TreeItemContext, TreeNode, TreeSelectionChangeEventDetail, TreeSelectionPropagation } from '@c2n/tree/tree-types.js'
import { treeSelectMessages } from './messages'
import styles from './tree-select.scss?inline'

import '@c2n/overlay'
import '@c2n/tree'

/** Which of the ticked rows `value` holds when checkboxes propagate through the tree. */
export type TreeSelectValueDisplay = 'parent' | 'leaves' | 'all'

/** Detail of `c2-tree-select`'s `selection-change` event. */
export interface TreeSelectSelectionChangeEventDetail {
  /** The new `value`. */
  value: string[]
  /** The nodes `value` names, in tree order. */
  nodes: TreeNode[]
}

/** Events fired by {@link TreeSelect}, keyed for `addEventListener`. */
export interface TreeSelectEventMap {
  'selection-change': CustomEvent<TreeSelectSelectionChangeEventDetail>
  input: Event
  change: Event
}

export interface TreeSelect {
  addEventListener: TypedAddEventListener<TreeSelect, TreeSelectEventMap>
  removeEventListener: TypedRemoveEventListener<TreeSelect, TreeSelectEventMap>
}

/** One row of the tree as the select reads it: from the rendered rows when there are any, else from `items`. */
interface Entry {
  value: string
  label: string
  node: TreeNode
  disabled: boolean
  branch: boolean
  parent?: Entry
  children: Entry[]
}

/**
 * A dropdown for picking from a hierarchy: a form-associated trigger and a `c2-tree` inside a `c2-overlay` popover.
 * Everything the tree does (expansion, keyboard, checkboxes and their propagation, lazy branches) is the tree's own;
 * the select adds the trigger, the form value, search, and how the selection reads back.
 *
 * Give it rows as data through `items` (the tree's `TreeNode` shape), or nest `c2-tree-item` elements in it, which
 * are slotted into the tree. The select has no intrinsic width: give the host a `width` and the trigger fills it.
 *
 * - **Single** (default): a pick closes the dropdown. Picking the selected row again keeps it. `leaf-only` lets only
 *   rows without children be picked; a branch row then expands and collapses instead.
 * - **Multiple** (`multiple`): a row click toggles that row and the dropdown stays open, with a footer to clear or
 *   close it. `checkbox-selection` adds the tree's checkboxes, ticking a branch ticks its descendants as
 *   `selection-propagation` says, and `value-display` picks which ticked rows `value` holds. The trigger shows the
 *   values as chips, up to `max-chips` and then a `+n` count.
 * - **Search** (`searchable`): a field at the top of the dropdown filters the rows to the matches and their ancestors,
 *   which it expands; the matched text is marked when the rows come from `items`.
 *
 * Keyboard: Enter, Space, ArrowDown or ArrowUp on the trigger opens the dropdown and moves focus to the selected row
 * (else the first), or to the search field. The tree then takes arrows, Home/End, typeahead, Enter and Space. In the
 * search field, ArrowDown moves to the first match and Enter picks it. Escape closes the dropdown and returns focus to
 * the trigger; Tab leaves and closes it. Backspace on the trigger removes the last value of a multiple select, and
 * clears a `clearable` single one.
 *
 * `item-expand` and `item-load-error` from the inner tree reach the select's listeners as they are, so a lazy tree
 * (`loadChildren`, or `item-expand` in markup) works the same way as on `c2-tree`.
 *
 * @tag c2-tree-select
 *
 * @slot - The rows, as `c2-tree-item` elements, when the tree is authored in markup instead of through `items`.
 *
 * @event {CustomEvent<TreeSelectSelectionChangeEventDetail>} selection-change - Fired after the user changes the selection. `detail.value` is the new `value`, `detail.nodes` the nodes it names. Does not bubble: several components fire `selection-change`, so a listener belongs on the element itself.
 * @event {Event} input - Fired with `selection-change`, after `value` is updated, so `v-model`, `ngModel` and other form bindings work.
 * @event {Event} change - Fired with `input`: the select commits on every pick.
 *
 * @csspart field - The trigger box holding the chips, the trigger button, the clear button and the chevron.
 * @csspart panel - The dropdown surface.
 *
 * @cssproperty {pixel} [--c2-tree-select__button--min-height=36px] - Minimum height of the trigger.
 * @cssproperty {padding} [--c2-tree-select__button--padding=5px 10px 5px 12px] - Space inside the trigger.
 * @cssproperty {pixel} [--c2-tree-select__button--gap=8px] - Space between the chips, the text, the clear button and the chevron.
 * @cssproperty {color} [--c2-tree-select__button--background=#ffffff] - Background of the trigger.
 * @cssproperty {color} [--c2-tree-select__button--color=#18181b] - Text colour of the trigger.
 * @cssproperty {font-size} [--c2-tree-select__button--font-size=14px] - Font size of the trigger and the dropdown.
 * @cssproperty {font-weight} --c2-tree-select__button--font-weight - Font weight of the trigger text.
 * @cssproperty {font-family} --c2-tree-select__button--font-family - Font family of the trigger and the dropdown.
 * @cssproperty {border} [--c2-tree-select__button--border-top=1px solid #bcbcc6] - Top border of the trigger.
 * @cssproperty {border} [--c2-tree-select__button--border-right=1px solid #bcbcc6] - Right border of the trigger.
 * @cssproperty {border} [--c2-tree-select__button--border-bottom=1px solid #bcbcc6] - Bottom border of the trigger.
 * @cssproperty {border} [--c2-tree-select__button--border-left=1px solid #bcbcc6] - Left border of the trigger.
 * @cssproperty {border-radius} [--c2-tree-select__button--border-top-left-radius=6px] - Top-left corner of the trigger.
 * @cssproperty {border-radius} [--c2-tree-select__button--border-top-right-radius=6px] - Top-right corner of the trigger.
 * @cssproperty {border-radius} [--c2-tree-select__button--border-bottom-left-radius=6px] - Bottom-left corner of the trigger.
 * @cssproperty {border-radius} [--c2-tree-select__button--border-bottom-right-radius=6px] - Bottom-right corner of the trigger.
 * @cssproperty {border} [--c2-tree-select__button__hover--border-top=1px solid #a1a1aa] - Top border of the trigger under the pointer.
 * @cssproperty {border} [--c2-tree-select__button__hover--border-right=1px solid #a1a1aa] - Right border of the trigger under the pointer.
 * @cssproperty {border} [--c2-tree-select__button__hover--border-bottom=1px solid #a1a1aa] - Bottom border of the trigger under the pointer.
 * @cssproperty {border} [--c2-tree-select__button__hover--border-left=1px solid #a1a1aa] - Left border of the trigger under the pointer.
 * @cssproperty {color} [--c2-tree-select__button__hover--background=#fafafa] - Background of the trigger under the pointer.
 * @cssproperty {border} [--c2-tree-select__button__open--border-top=1px solid #476ef9] - Top border while the dropdown is open.
 * @cssproperty {border} [--c2-tree-select__button__open--border-right=1px solid #476ef9] - Right border while the dropdown is open.
 * @cssproperty {border} [--c2-tree-select__button__open--border-bottom=1px solid #476ef9] - Bottom border while the dropdown is open.
 * @cssproperty {border} [--c2-tree-select__button__open--border-left=1px solid #476ef9] - Left border while the dropdown is open.
 * @cssproperty {border} [--c2-tree-select__button__error--border-top=1px solid #dc2626] - Top border while an enclosing `c2-form-field` shows an error.
 * @cssproperty {border} [--c2-tree-select__button__error--border-right=1px solid #dc2626] - Right border while an enclosing `c2-form-field` shows an error.
 * @cssproperty {border} [--c2-tree-select__button__error--border-bottom=1px solid #dc2626] - Bottom border while an enclosing `c2-form-field` shows an error.
 * @cssproperty {border} [--c2-tree-select__button__error--border-left=1px solid #dc2626] - Left border while an enclosing `c2-form-field` shows an error.
 * @cssproperty {outline} [--c2-tree-select__button__focus--outline=2px solid rgba(71, 110, 249, 0.4)] - Keyboard focus ring of the trigger.
 * @cssproperty {pixel} [--c2-tree-select__button__focus--outline-offset=0px] - Gap between the trigger and its focus ring.
 * @cssproperty {opacity} [--c2-tree-select__button__disabled--opacity=0.38] - Opacity of a disabled select.
 * @cssproperty {pixel} [--c2-tree-select__button__icon--size=16px] - Size of the chevron and the clear icon.
 * @cssproperty {color} [--c2-tree-select__button__icon--color=#71717a] - Colour of the chevron and the clear icon.
 *
 * @cssproperty {color} [--c2-tree-select__placeholder--color=#71717a] - Colour of the placeholder.
 * @cssproperty {color} [--c2-tree-select__path--color=#71717a] - Colour of the ancestors `show-path` writes before the label.
 *
 * @cssproperty {pixel} [--c2-tree-select__chip--height=24px] - Height of a chip.
 * @cssproperty {padding} [--c2-tree-select__chip--padding=0 2px 0 8px] - Space inside a chip.
 * @cssproperty {color} [--c2-tree-select__chip--background=#f4f4f5] - Background of a chip.
 * @cssproperty {color} [--c2-tree-select__chip--color=#18181b] - Text colour of a chip.
 * @cssproperty {font-size} [--c2-tree-select__chip--font-size=12px] - Font size of a chip.
 * @cssproperty {border-radius} [--c2-tree-select__chip--border-radius=4px] - Corner radius of a chip.
 * @cssproperty {color} [--c2-tree-select__chip__remove--color=#71717a] - Colour of a chip's remove icon.
 * @cssproperty {color} [--c2-tree-select__chip__more--background=#edf1fe] - Background of the `+n` count.
 * @cssproperty {color} [--c2-tree-select__chip__more--color=#0154b8] - Text colour of the `+n` count.
 *
 * @cssproperty {color} [--c2-tree-select__list--background=#ffffff] - Background of the dropdown.
 * @cssproperty {border} [--c2-tree-select__list--border-top=1px solid #e4e4e7] - Top border of the dropdown.
 * @cssproperty {border} [--c2-tree-select__list--border-right=1px solid #e4e4e7] - Right border of the dropdown.
 * @cssproperty {border} [--c2-tree-select__list--border-bottom=1px solid #e4e4e7] - Bottom border of the dropdown.
 * @cssproperty {border} [--c2-tree-select__list--border-left=1px solid #e4e4e7] - Left border of the dropdown.
 * @cssproperty {border-radius} [--c2-tree-select__list--border-top-left-radius=8px] - Top-left corner of the dropdown.
 * @cssproperty {border-radius} [--c2-tree-select__list--border-top-right-radius=8px] - Top-right corner of the dropdown.
 * @cssproperty {border-radius} [--c2-tree-select__list--border-bottom-left-radius=8px] - Bottom-left corner of the dropdown.
 * @cssproperty {border-radius} [--c2-tree-select__list--border-bottom-right-radius=8px] - Bottom-right corner of the dropdown.
 * @cssproperty {box-shadow} [--c2-tree-select__list--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)] - Shadow of the dropdown.
 * @cssproperty {padding} [--c2-tree-select__list--padding=4px] - Space around the tree inside the dropdown.
 * @cssproperty {pixel} [--c2-tree-select__list--min-width=auto] - Floor for the dropdown's width; it is never narrower than the trigger.
 * @cssproperty {pixel} [--c2-tree-select__list--max-height=320px] - The rows scroll past this height.
 *
 * @cssproperty {pixel} [--c2-tree-select__search--height=40px] - Height of the search field.
 * @cssproperty {color} [--c2-tree-select__search--color=#18181b] - Text colour of the search field.
 * @cssproperty {border} [--c2-tree-select__search--border-bottom=1px solid #e4e4e7] - Rule under the search field.
 * @cssproperty {color} [--c2-tree-select__search__icon--color=#71717a] - Colour of the search and clear icons.
 * @cssproperty {color} [--c2-tree-select__match--background=rgba(250, 204, 21, 0.4)] - Background of the matched text in a row.
 * @cssproperty {font-weight} [--c2-tree-select__match--font-weight=600] - Weight of the matched text in a row.
 * @cssproperty {color} [--c2-tree-select__status--color=#71717a] - Colour of the match count and the empty messages.
 *
 * @cssproperty {color} [--c2-tree-select__footer--background=#fafafa] - Background of the multiple-selection footer.
 * @cssproperty {border} [--c2-tree-select__footer--border-top=1px solid #e4e4e7] - Rule above the footer.
 * @cssproperty {color} [--c2-tree-select__footer--color=#52525b] - Colour of the selection count.
 * @cssproperty {color} [--c2-tree-select__footer__clear--color=#0265dc] - Text colour of the Clear button.
 * @cssproperty {color} [--c2-tree-select__footer__done--background=#0265dc] - Background of the Done button.
 * @cssproperty {color} [--c2-tree-select__footer__done--color=#ffffff] - Text colour of the Done button.
 *
 * @internalcomponent c2-tree
 * @internalcomponent c2-overlay
 *
 * @slotcomponent c2-tree-item
 */
@customElement('c2-tree-select')
export class TreeSelect extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, treeSelectMessages)
  /** Label and description handed down by an enclosing `c2-form-field`. */
  private readonly field = new FieldContextConsumer(this, { kind: 'choice' })

  /** Rows to pick from. Leave empty and nest `c2-tree-item` elements instead to author the tree in markup. */
  @property({ converter: jsonPropertyConverter }) items: TreeNode[] = []

  /** Selected values. Written as `value="a;b"` in markup, read as `['a', 'b']` from the property. */
  @property({ converter: arrayPropertyConverter, reflect: true }) value: string[] = []

  /** Whether the dropdown is showing. Set it to open or close the dropdown programmatically. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Allow several rows to be selected; the dropdown stays open after a pick and the trigger shows chips. */
  @property({ type: Boolean }) multiple = false

  /** Shows a checkbox on every row. Implies `multiple`. */
  @property({ type: Boolean, attribute: 'checkbox-selection' }) checkboxSelection = false

  /** How a checkbox tick travels between a row and its relatives. */
  @property({ type: String, attribute: 'selection-propagation' }) selectionPropagation: TreeSelectionPropagation = 'both'

  /**
   * Which ticked rows `value` holds while checkboxes propagate: `parent` holds a fully ticked branch instead of its
   * descendants, `leaves` only the rows without children, `all` every ticked row.
   */
  @property({ type: String, attribute: 'value-display' }) valueDisplay: TreeSelectValueDisplay = 'parent'

  /** Only rows without children can be picked; clicking a branch row expands or collapses it. */
  @property({ type: Boolean, attribute: 'leaf-only' }) leafOnly = false

  /** Adds a search field at the top of the dropdown that filters the rows. */
  @property({ type: Boolean }) searchable = false

  /** Adds a button to the trigger that clears the selection. */
  @property({ type: Boolean }) clearable = false

  /** Writes the selected row's ancestors before its label in the trigger (`Engineering / Platform`). Single selection only. */
  @property({ type: Boolean, attribute: 'show-path' }) showPath = false

  /** How many chips a multiple select shows before a `+n` count. `0` shows a count of the selection instead. */
  @property({ type: Number, attribute: 'max-chips' }) maxChips = 3

  /** Text shown in the trigger while nothing is selected. */
  @property({ type: String }) placeholder = ''

  /** Text of the search field while it is empty. Defaults to a built-in "Search". */
  @property({ type: String, attribute: 'search-placeholder' }) searchPlaceholder = ''

  /** Shows the current value but never opens the dropdown. */
  @property({ type: Boolean, reflect: true }) readonly = false

  /** Dims the trigger and ignores interaction. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Keep at least one row selected: the form reports a missing value while nothing is. */
  @property({ type: Boolean }) required = false

  /** Name used when the select participates in a form. */
  @property({ type: String, reflect: true }) name = ''

  /** Make the dropdown exactly as wide as the trigger instead of at least as wide. */
  @property({ type: Boolean, attribute: 'fit-size' }) fitSize = false

  /** Accessible name of the trigger and the tree. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Mirrors the host's `aria-labelledby` so the trigger re-renders when a label claims the element. */
  @property({ attribute: 'aria-labelledby' }) ariaLabelledByAttr: string | null = null

  /** Resolves the children of a branch the first time it is expanded; see `c2-tree`'s `loadChildren`. */
  @property({ attribute: false }) loadChildren?: TreeChildrenLoader

  @query('#button') public button!: HTMLButtonElement
  @query('#menu-overlay') public menu!: HTMLElement
  @query('c2-tree') private tree?: Tree
  @query('.search-input') private searchInput?: HTMLInputElement

  @state() private disabledByForm = false
  @state() private labelText = ''
  @state() private searchQuery = ''
  @state() private matchCount = 0
  /** Whether light-DOM rows are present, which switches the tree to the markup mode. */
  @state() private hasMarkupRows = false
  /** Bumped whenever the tree's rows may have changed, so the trigger re-reads their labels. */
  @state() private rowsVersion = 0

  private customValidityMessage = ''
  private defaultValue: string[] = []
  private defaultValueCaptured = false
  /** Expansion before a search took over, given back when the search clears. */
  private expandedBeforeSearch?: string[]
  private labelRenderer?: (context: TreeItemContext) => unknown
  /** Set by a plain click or Enter on a row of a multiple select without checkboxes, which then toggles that row. */
  private plainActivation = false
  private openAtPointerDown = false
  private pointerOnTrigger = false
  private restoringFocus = false
  private spacePressedInTree = false
  private rowObserver?: MutationObserver

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

  /** The nodes `value` names, in tree order. Values the tree does not hold (a lazy branch not loaded yet) are left out. */
  get selectedNodes(): TreeNode[] {
    const index = this.#index()
    return this.value.map((value) => index.get(value)?.node).filter((node): node is TreeNode => !!node)
  }

  override connectedCallback() {
    super.connectedCallback()
    this.addEventListener('click', this.handleHostActivation)
    queueMicrotask(() => this.isConnected && this.syncLabelText())
    if (!this.defaultValueCaptured) {
      this.defaultValue = arrayPropertyConverter.fromAttribute(this.getAttribute('value') ?? '')
      this.defaultValueCaptured = true
    }
    if (!isServer) {
      this.rowObserver ??= new MutationObserver(() => this.syncRows())
      this.rowObserver.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['label', 'value'] })
      this.syncRows()
    }
  }

  override disconnectedCallback() {
    this.removeEventListener('click', this.handleHostActivation)
    this.rowObserver?.disconnect()
    super.disconnectedCallback()
  }

  formResetCallback() {
    this.value = [...this.defaultValue]
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = arrayPropertyConverter.fromAttribute(state)
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

  /** Opens (`true`), closes (`false`) or flips the dropdown. Does nothing while disabled or read-only. */
  toggle(force?: boolean): void {
    if (!this.menu) return
    const isOpen = this.menu.matches(':popover-open')
    if (this.readonly || this.effectiveDisabled) {
      if (isOpen) this.menu.hidePopover()
      return
    }
    const next = force ?? !isOpen
    if (next && !isOpen) this.menu.showPopover()
    else if (!next && isOpen) this.menu.hidePopover()
  }

  /** Clears the selection, as the clear button does. */
  clear(): void {
    this.commit([])
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  private get isMultiple() {
    return this.multiple || this.checkboxSelection
  }

  /** Whether `value` is a projection of the ticked rows rather than the ticked rows themselves. */
  private get projectsValue() {
    return this.checkboxSelection && this.selectionPropagation !== 'none' && this.valueDisplay !== 'all'
  }

  private syncRows = (): void => {
    this.hasMarkupRows = [...this.children].some((child) => !child.hasAttribute('slot'))
    this.rowsVersion += 1
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The rows as the select reads them

  /**
   * Every row by value, in tree order. Read from the tree's rendered rows once there are any, which also covers
   * markup rows and children a lazy branch loaded; from `items` before the tree has rendered (and on the server).
   */
  #index(): Map<string, Entry> {
    const index = new Map<string, Entry>()
    // Event details hand back the caller's own node (its `data`, its `children`), not the one a row synthesizes. The
    // tree's `items` rather than this element's, so children a lazy branch loaded are found too.
    const authored = new Map<string, TreeNode>()
    const collect = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        authored.set(node.value, node)
        collect(node.children ?? [])
      }
    }
    if (!this.hasMarkupRows) collect(this.tree?.items ?? [])
    const fromRows = (rows: TreeItem[], parent?: Entry) => {
      for (const row of rows) {
        const node = authored.get(row.value) ?? row.node
        const entry: Entry = { value: row.value, label: row.resolvedLabel, node, disabled: row.disabled, branch: row.isBranch, parent, children: [] }
        index.set(entry.value, entry)
        parent?.children.push(entry)
        fromRows(row.childItems, entry)
      }
    }
    const fromNodes = (nodes: TreeNode[], parent?: Entry) => {
      for (const node of nodes) {
        const branch = (node.children?.length ?? 0) > 0 || !!node.hasChildren
        const entry: Entry = { value: node.value, label: node.label ?? node.value, node, disabled: !!node.disabled, branch, parent, children: [] }
        index.set(entry.value, entry)
        parent?.children.push(entry)
        fromNodes(node.children ?? [], entry)
      }
    }
    const rows = isServer ? [] : (this.tree?.rootItems ?? [])
    if (rows.length > 0) fromRows(rows)
    else if (Array.isArray(this.items)) fromNodes(this.items)
    return index
  }

  #ancestors(entry: Entry): Entry[] {
    const result: Entry[] = []
    for (let parent = entry.parent; parent; parent = parent.parent) result.unshift(parent)
    return result
  }

  #descendants(entry: Entry): Entry[] {
    return entry.children.flatMap((child) => [child, ...this.#descendants(child)])
  }

  /** In tree order, with values the tree does not hold kept at the end. */
  #ordered(values: Iterable<string>, index: Map<string, Entry>): string[] {
    const set = new Set(values)
    return [...[...index.keys()].filter((value) => set.has(value)), ...[...set].filter((value) => !index.has(value))]
  }

  /** The rows the tree should show ticked for `value`. */
  #treeValue(index: Map<string, Entry>): string[] {
    if (!this.projectsValue) return this.value
    const ticked = new Set(this.value)
    const down = this.selectionPropagation === 'descendants' || this.selectionPropagation === 'both'
    const up = this.selectionPropagation === 'parents' || this.selectionPropagation === 'both'
    if (down) {
      for (const value of this.value) {
        const entry = index.get(value)
        if (entry) for (const row of this.#descendants(entry)) if (!row.disabled) ticked.add(row.value)
      }
    }
    if (up) {
      // Deepest branches first, so a grandparent sees its parent already settled.
      for (const entry of [...index.values()].reverse()) {
        if (entry.children.length === 0) continue
        const rows = this.#descendants(entry).filter((row) => !row.disabled)
        if (rows.length > 0 && rows.every((row) => ticked.has(row.value))) ticked.add(entry.value)
      }
    }
    return this.#ordered(ticked, index)
  }

  /** The `value` for the rows the tree shows ticked. */
  #valueOf(ticked: string[], index: Map<string, Entry>): string[] {
    if (!this.projectsValue) return ticked
    const set = new Set(ticked)
    if (this.valueDisplay === 'leaves') return ticked.filter((value) => !index.get(value)?.children.length)
    return ticked.filter((value) => {
      const entry = index.get(value)
      return !entry || !this.#ancestors(entry).some((ancestor) => set.has(ancestor.value))
    })
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Selection

  private commit(next: string[]) {
    const index = this.#index()
    if (next.length === this.value.length && next.every((value, at) => value === this.value[at])) {
      // The tree may have changed its own copy (a re-pick it cleared, a branch in `leaf-only`): give it ours back.
      if (this.tree) this.tree.value = this.#treeValue(index)
      return
    }
    this.value = next
    this.dispatchEvent(
      new CustomEvent<TreeSelectSelectionChangeEventDetail>('selection-change', {
        detail: { value: next, nodes: next.map((value) => index.get(value)?.node).filter((node): node is TreeNode => !!node) },
        bubbles: false,
        composed: true,
      }),
    )
    // Every framework's two-way binding listens for these rather than a component-specific name.
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  private handleTreeSelection(event: CustomEvent<TreeSelectionChangeEventDetail>) {
    // The tree's event is composed, so it would also reach this host's own listeners with the tree's detail.
    event.stopPropagation()
    const index = this.#index()
    const ticked = event.detail.value
    const plain = this.plainActivation
    this.plainActivation = false

    if (!this.isMultiple) {
      const picked = ticked[0]
      // Picking the selected row again clears it in a tree; in a select it keeps it.
      if (picked === undefined) {
        this.commit(this.value)
        this.toggle(false)
        return
      }
      if (this.leafOnly && index.get(picked)?.branch) {
        this.commit(this.value)
        return
      }
      this.commit([picked])
      this.toggle(false)
      return
    }

    if (this.checkboxSelection) {
      this.commit(this.#valueOf(ticked, index))
      return
    }

    // Without checkboxes a plain click replaces the selection in a tree; a select toggles the row instead.
    let next = ticked
    if (plain && ticked.length === 1) {
      const row = ticked[0]!
      next = this.value.includes(row) ? this.value.filter((value) => value !== row) : this.#ordered([...this.value, row], index)
    }
    if (this.leafOnly) next = next.filter((value) => !index.get(value)?.branch)
    this.commit(next)
  }

  private handleTreeClickCapture = {
    handleEvent: (event: MouseEvent) => {
      this.plainActivation = !(event.ctrlKey || event.metaKey || event.shiftKey)
    },
    capture: true,
  }

  private handleTreeKeydownCapture = {
    handleEvent: (event: KeyboardEvent) => {
      this.plainActivation = event.key === 'Enter'
      this.spacePressedInTree = event.key === ' '
    },
    capture: true,
  }

  private removeValue(value: string) {
    this.commit(this.value.filter((entry) => entry !== value))
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Search

  private handleSearchInput(event: InputEvent) {
    this.searchQuery = (event.target as HTMLInputElement).value
    this.applyFilter()
  }

  private clearSearch() {
    this.searchQuery = ''
    this.applyFilter()
    this.searchInput?.focus()
  }

  /**
   * Hides every row that neither matches nor leads to a match, and expands the ancestors of the matches. The tree
   * drops a `hidden` row from its keyboard order, so the arrows only walk what is shown.
   */
  private applyFilter() {
    const tree = this.tree
    if (!tree) return
    const needle = this.searchQuery.trim().toLowerCase()
    const rows = tree.allItems
    if (!needle) {
      for (const row of rows) row.hidden = false
      if (this.expandedBeforeSearch) tree.expandedItems = this.expandedBeforeSearch
      this.expandedBeforeSearch = undefined
      this.labelRenderer = undefined
      this.matchCount = 0
      tree.requestUpdate()
      return
    }
    this.expandedBeforeSearch ??= tree.expandedItems
    const shown = new Set<TreeItem>()
    const expand = new Set<string>()
    let matches = 0
    for (const row of rows) {
      if (!row.resolvedLabel.toLowerCase().includes(needle)) continue
      matches += 1
      shown.add(row)
      // The descendants of a matching branch stay reachable under it, collapsed.
      for (const descendant of row.querySelectorAll('c2-tree-item')) shown.add(descendant as TreeItem)
      for (let parent = row.parentElement; parent && parent.localName === 'c2-tree-item'; parent = parent.parentElement) {
        shown.add(parent as TreeItem)
        expand.add((parent as TreeItem).value)
      }
    }
    for (const row of rows) row.hidden = !shown.has(row)
    tree.expandedItems = [...expand]
    this.matchCount = matches
    // Marks are drawn through the tree's label renderer, which only exists for rows that come from `items`.
    this.labelRenderer = this.hasMarkupRows ? undefined : ({ node }) => highlight(node.label ?? node.value, needle)
    tree.requestUpdate()
  }

  /** The first row a search would pick: shown, enabled, and pickable under `leaf-only`. */
  private firstMatch(): TreeItem | undefined {
    const needle = this.searchQuery.trim().toLowerCase()
    return this.tree?.visibleItems.find(
      (row) => !row.disabled && (!this.leafOnly || !row.isBranch) && (!needle || row.resolvedLabel.toLowerCase().includes(needle)),
    )
  }

  private handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const first = this.tree?.visibleItems.find((row) => !row.disabled)
      if (first) this.tree?.focusItem(first.value)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const match = this.firstMatch()
      if (!match) return
      if (!this.isMultiple) {
        this.commit([match.value])
        this.toggle(false)
        return
      }
      const index = this.#index()
      const ticked = new Set(this.#treeValue(index))
      if (ticked.has(match.value)) ticked.delete(match.value)
      else ticked.add(match.value)
      // Through the tree's checkbox propagation, so a branch ticks the way clicking its checkbox would.
      this.commit(this.checkboxSelection ? this.#valueOf(this.#propagate(match.value, ticked.has(match.value), index), index) : this.#ordered(ticked, index))
    }
  }

  /** What clicking `value`'s checkbox would leave ticked. */
  #propagate(value: string, checked: boolean, index: Map<string, Entry>): string[] {
    const ticked = new Set(this.#treeValue(index))
    const entry = index.get(value)
    if (!entry) return [...ticked]
    const down = this.selectionPropagation === 'descendants' || this.selectionPropagation === 'both'
    const up = this.selectionPropagation === 'parents' || this.selectionPropagation === 'both'
    for (const row of [entry, ...(down ? this.#descendants(entry) : [])]) {
      if (row.disabled) continue
      if (checked) ticked.add(row.value)
      else ticked.delete(row.value)
    }
    if (up) {
      for (const ancestor of this.#ancestors(entry).reverse()) {
        const rows = this.#descendants(ancestor).filter((row) => !row.disabled)
        if (rows.length > 0 && rows.every((row) => ticked.has(row.value))) ticked.add(ancestor.value)
        else ticked.delete(ancestor.value)
      }
    }
    return this.#ordered(ticked, index)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Opening, closing and focus

  /** WebKit associates form labels but does not focus a form-associated custom element when its label activates it. */
  private handleHostActivation = (event: MouseEvent): void => {
    if (event.composedPath()[0] === this && !this.effectiveDisabled) this.button?.focus()
  }

  private handleFieldPointerDown() {
    // Light dismiss closes the dropdown on pointerup, before the click: remember whether this press found it open.
    this.openAtPointerDown = this.open
  }

  /** A click on the chips or the chevron opens the dropdown, as a click on the trigger text does. */
  private handleFieldClick(event: MouseEvent) {
    const target = event.composedPath()[0]
    if (target instanceof Element && target.closest('button')) return
    if (this.effectiveDisabled || this.readonly) return
    this.button.focus()
    if (!this.openAtPointerDown) this.toggle(true)
  }

  private handleTriggerPointerDown() {
    this.pointerOnTrigger = true
    window.addEventListener('pointerup', () => (this.pointerOnTrigger = false), { once: true })
  }

  private handleTriggerKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      this.toggle(true)
      return
    }
    if (event.key === 'Backspace' && !this.readonly && this.value.length > 0 && (this.isMultiple || this.clearable)) {
      event.preventDefault()
      this.removeValue(this.value[this.value.length - 1]!)
    }
  }

  private handleOverlayToggle(event: Event) {
    this.open = (event as ToggleEvent).newState === 'open'
    if (this.open) {
      if (this.focusIsOnTrigger()) void this.focusInside()
      return
    }
    if (this.searchQuery) {
      this.searchQuery = ''
      this.applyFilter()
    }
  }

  /** On open, focus goes to the search field, else to the selected row (expanding its ancestors), else the first row. */
  private async focusInside() {
    await this.updateComplete
    if (this.searchable) {
      this.searchInput?.focus()
      return
    }
    const tree = this.tree
    if (!tree) return
    await tree.updateComplete
    const index = this.#index()
    const selected = this.#treeValue(index).find((value) => index.has(value))
    const target = selected ?? tree.visibleItems.find((row) => !row.disabled)?.value
    if (target !== undefined) tree.focusItem(target)
  }

  /**
   * Runs before the dropdown hides, while a row can still hold focus. A slotted row is light DOM, which the browser
   * does not count as inside the popover, so it would not hand focus back to the trigger: focus moves back here.
   * Focus that already left (Tab, a click elsewhere) is not taken back.
   */
  private handleOverlayBeforeToggle(event: Event) {
    if ((event as ToggleEvent).newState !== 'closed' || !this.focusIsInside()) return
    this.restoringFocus = true
    this.button.focus({ preventScroll: true })
    this.restoringFocus = false
    // Space picks on keydown and its keyup then lands on the trigger, which Firefox reads as a click that reopens it.
    if (this.spacePressedInTree) {
      this.button.addEventListener('keyup', this.swallowSpaceKeyup)
      this.button.addEventListener('keydown', this.clearSpaceGuard)
    }
    this.spacePressedInTree = false
  }

  private swallowSpaceKeyup = (event: KeyboardEvent): void => {
    if (event.key === ' ') event.preventDefault()
    this.clearSpaceGuard()
  }

  private clearSpaceGuard = (): void => {
    this.button.removeEventListener('keyup', this.swallowSpaceKeyup)
    this.button.removeEventListener('keydown', this.clearSpaceGuard)
  }

  /** Closes the dropdown when focus leaves it for something else: Tab and Shift+Tab out of it. */
  private handleOverlayFocusOut(event: FocusEvent) {
    const next = event.relatedTarget as Node | null
    if (this.restoringFocus || !next || this.menu.contains(next) || (next !== this && this.contains(next))) return
    // A press on the trigger moves focus to it before its click closes the dropdown: closing here would reopen it.
    if (next === this.button && this.pointerOnTrigger) return
    this.toggle(false)
  }

  private get activeInTree(): Element | null {
    return (this.getRootNode() as Document | ShadowRoot).activeElement
  }

  private focusIsOnTrigger(): boolean {
    return this.activeInTree === this && this.shadowRoot?.activeElement === this.button
  }

  private focusIsInside(): boolean {
    const active = this.activeInTree
    if (!active) return false
    if (active !== this) return this.contains(active)
    const inner = this.shadowRoot?.activeElement
    return !!inner && !!this.menu && this.menu.contains(inner)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Lifecycle

  protected override willUpdate(changed: PropertyValues<this>): void {
    // Frameworks (and Astro islands) may hand the attribute's string straight to the property.
    if (changed.has('value') && typeof this.value === 'string') this.value = arrayPropertyConverter.fromAttribute(this.value)
    if (changed.has('items') && !Array.isArray(this.items)) this.items = []
  }

  protected override firstUpdated(): void {
    // The trigger reads its labels from the tree's rows once they exist.
    void this.tree?.updateComplete.then(() => this.syncRows())
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (this.field.invalid && !this.effectiveDisabled) this.internals.states.add('error')
    else this.internals.states.delete('error')
    if (changed.has('ariaLabelledByAttr')) this.syncLabelText()
    if (changed.has('open') || changed.has('readonly') || changed.has('disabled') || (changed as Map<PropertyKey, unknown>).has('disabledByForm'))
      this.toggle(this.open)
    if (changed.has('items')) void this.tree?.updateComplete.then(() => this.syncRows())
    this.syncFormState()
  }

  private syncFormState() {
    if (this.isMultiple && this.name) {
      const formData = new FormData()
      for (const value of this.value) formData.append(this.name, value)
      this.internals.setFormValue(formData, this.value.join(';'))
    } else {
      this.internals.setFormValue(this.value[0] || null, this.value.join(';'))
    }
    const missing = this.required && this.value.length === 0
    const flags = this.customValidityMessage ? { customError: true } : missing ? { valueMissing: true } : {}
    const message = this.customValidityMessage || (missing ? this.msg.t('valueMissing') : '')
    this.internals.setValidity(flags, message, this.button ?? undefined)
  }

  private get triggerLabel(): string {
    return this.ariaLabel || this.labelText || this.field.label
  }

  /** Reads the text of whatever labels the host: `aria-labelledby` first, then any associated `<label>`. */
  private syncLabelText(): void {
    const root = this.getRootNode() as Document | ShadowRoot
    const ids = (this.ariaLabelledByAttr ?? '').split(/\s+/).filter(Boolean)
    const fromIds = ids.map((id) => root.getElementById?.(id)?.textContent?.trim()).filter(Boolean)
    this.labelText =
      fromIds.length > 0
        ? fromIds.join(' ')
        : [...this.internals.labels]
            .map((label) => label.textContent?.trim())
            .filter(Boolean)
            .join(' ')
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Rendering

  private renderTriggerText(index: Map<string, Entry>, labels: string[]) {
    if (labels.length === 0) return html`<span class="text placeholder">${this.placeholder}</span>`
    if (this.isMultiple) {
      // The chips sit outside the button, so the button carries the selection as text for assistive technology.
      if (this.maxChips === 0) return html`<span class="text">${this.msg.t('selected', labels.length)}</span>`
      return html`<span class="text visually-hidden">${labels.join(', ')}</span>`
    }
    const entry = index.get(this.value[0]!)
    const path = this.showPath && entry ? this.#ancestors(entry).map((ancestor) => ancestor.label) : []
    return html`<span class="text">${path.length ? html`<span class="path">${path.join(' / ')} / </span>` : nothing}${labels[0]}</span>`
  }

  private renderChips(labels: string[]) {
    if (!this.isMultiple || this.maxChips === 0 || labels.length === 0) return nothing
    const shown = this.maxChips > 0 ? this.value.slice(0, this.maxChips) : this.value
    const more = this.value.length - shown.length
    const removable = !this.readonly && !this.effectiveDisabled
    return html`<span class="chips">
      ${shown.map(
        (value, at) =>
          html`<span class="chip"
            ><span class="chip-label">${labels[at]}</span>${
              removable
                ? html`<button
                    type="button"
                    class="chip-remove"
                    tabindex="-1"
                    aria-label=${this.msg.t('remove', labels[at]!)}
                    @click=${() => this.removeValue(value)}
                  >
                    ${closeIcon()}
                  </button>`
                : nothing
            }</span
          >`,
      )}
      ${more > 0 ? html`<span class="chip more">+${more}</span>` : nothing}
    </span>`
  }

  private renderSearch() {
    if (!this.searchable) return nothing
    return html`<div class="search">
      ${svg`<svg class="search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="4.5"></circle><path d="M10.5 10.5L14 14"></path></svg>`}
      <input
        class="search-input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        .value=${this.searchQuery}
        placeholder=${this.searchPlaceholder || this.msg.t('search')}
        aria-label=${this.searchPlaceholder || this.msg.t('search')}
        aria-controls="tree"
        @input=${this.handleSearchInput}
        @keydown=${this.handleSearchKeydown}
      />
      ${
        this.searchQuery
          ? html`<button type="button" class="search-clear" aria-label=${this.msg.t('clearSearch')} @click=${this.clearSearch}>${closeIcon()}</button>`
          : nothing
      }
    </div>`
  }

  private renderBody() {
    const empty = !this.hasMarkupRows && (!Array.isArray(this.items) || this.items.length === 0)
    const query = this.searchQuery.trim()
    const noMatch = !!query && this.matchCount === 0
    return html`
      ${empty ? html`<div class="message">${this.msg.t('empty')}</div>` : nothing}
      ${noMatch ? html`<div class="message" role="status">${this.msg.t('noMatch', query)}</div>` : nothing}
      <div class="scroll" ?hidden=${empty || noMatch}>
        <c2-tree
          id="tree"
          aria-label=${this.triggerLabel || nothing}
          .items=${this.hasMarkupRows ? [] : this.items}
          .value=${this.#treeValue(this.#index())}
          .loadChildren=${this.loadChildren}
          .renderLabel=${this.labelRenderer}
          selection=${this.isMultiple ? 'multiple' : 'single'}
          ?checkbox-selection=${this.checkboxSelection}
          selection-propagation=${this.selectionPropagation}
          ?expand-on-click=${this.leafOnly}
          ?disabled=${this.effectiveDisabled}
          @click=${this.handleTreeClickCapture}
          @keydown=${this.handleTreeKeydownCapture}
          @selection-change=${this.handleTreeSelection}
          @expansion-change=${this.syncRows}
        >
          ${this.hasMarkupRows ? html`<slot></slot>` : nothing}
        </c2-tree>
      </div>
      ${query && !noMatch ? html`<div class="status" role="status">${this.msg.t('matches', this.matchCount)}</div>` : nothing}
    `
  }

  private renderFooter() {
    if (!this.isMultiple) return nothing
    return html`<div class="footer">
      <span class="count">${this.msg.t('selected', this.value.length)}</span>
      <span class="actions">
        <button type="button" class="footer-clear" ?disabled=${this.value.length === 0} @click=${this.clear}>${this.msg.t('clear')}</button>
        <button type="button" class="footer-done" @click=${() => this.toggle(false)}>${this.msg.t('done')}</button>
      </span>
    </div>`
  }

  override render() {
    // Read so a change to the rows re-renders the trigger's labels.
    void this.rowsVersion
    const index = this.#index()
    const labels = this.value.map((value) => index.get(value)?.label ?? value)
    const interactive = !this.readonly && !this.effectiveDisabled
    const showClear = this.clearable && interactive && this.value.length > 0
    return html`<div class="c2-tree-select">
      <div
        id="field"
        part="field"
        class=${classMap({ field: true, 'has-chips': this.isMultiple && this.maxChips !== 0 && labels.length > 0 })}
        @pointerdown=${this.handleFieldPointerDown}
        @click=${this.handleFieldClick}
      >
        ${this.renderChips(labels)}
        <button
          type="button"
          id="button"
          class="button"
          aria-label=${this.triggerLabel || nothing}
          aria-describedby=${this.field.describedBy()}
          aria-invalid=${this.field.invalid ? 'true' : nothing}
          aria-haspopup="tree"
          aria-expanded=${this.open ? 'true' : 'false'}
          popovertarget=${interactive ? 'menu-overlay' : nothing}
          ?disabled=${this.effectiveDisabled}
          @pointerdown=${this.handleTriggerPointerDown}
          @keydown=${this.handleTriggerKeydown}
        >
          ${this.renderTriggerText(index, labels)}
        </button>
        ${showClear ? html`<button type="button" class="clear" tabindex="-1" aria-label=${this.msg.t('clearSelection')} @click=${this.clear}>${closeIcon()}</button>` : nothing}
        ${svg`<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>`}
      </div>
      <c2-overlay
        id="menu-overlay"
        popover
        anchor="field"
        ?fit-anchor=${this.fitSize}
        @beforetoggle=${this.handleOverlayBeforeToggle}
        @toggle=${this.handleOverlayToggle}
        @focusout=${this.handleOverlayFocusOut}
      >
        <div class="panel" part="panel">${this.renderSearch()} ${this.renderBody()} ${this.renderFooter()}</div>
      </c2-overlay>
      ${this.field.renderDescription()}
    </div>`
  }
}

function closeIcon(): TemplateResult {
  return html`${svg`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M5 5l6 6M11 5l-6 6"></path></svg>`}`
}

/**
 * The label with the first match marked. It renders inside the tree's shadow root, out of reach of this element's
 * stylesheet, so the mark is styled inline from the select's variables, which inherit into it.
 */
function highlight(label: string, needle: string): unknown {
  const at = label.toLowerCase().indexOf(needle)
  if (at < 0) return label
  return html`${label.slice(0, at)}<mark
      style="background: var(--c2-tree-select__match--background, rgba(250, 204, 21, 0.4)); color: inherit; font-weight: var(--c2-tree-select__match--font-weight, 600); border-radius: 2px"
      >${label.slice(at, at + needle.length)}</mark
    >${label.slice(at + needle.length)}`
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tree-select': TreeSelect
  }
}
