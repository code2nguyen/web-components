import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { customElement } from '@c2n/core/element-helper.js'
import { isServer } from 'lit-html/is-server.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/checkbox'
import '@c2n/spinner'
import styles from './tree-item.scss?inline'
import type { TreeNode } from './tree-types'

/** Fired when an item joins, leaves or changes identity, so its `c2-tree` can resync. */
export const TREE_ITEM_CHANGE_EVENT = 'c2-tree-item-change'
/** Fired when the disclosure toggle is activated. */
export const TREE_ITEM_TOGGLE_EVENT = 'c2-tree-item-toggle'
/** Fired when the row's checkbox is ticked or cleared. */
export const TREE_ITEM_CHECK_EVENT = 'c2-tree-item-check'

/** Events fired by {@link TreeItem}, keyed for `addEventListener`. */
export interface TreeItemEventMap {
  'c2-tree-item-change': CustomEvent<void>
  'c2-tree-item-toggle': CustomEvent<void>
  'c2-tree-item-check': CustomEvent<boolean>
}

export interface TreeItem {
  addEventListener: TypedAddEventListener<TreeItem, TreeItemEventMap>
  removeEventListener: TypedRemoveEventListener<TreeItem, TreeItemEventMap>
}

/**
 * One row of a {@link https://github.com/code2nguyen/web-components | `c2-tree`}.
 *
 * Nest items to build the hierarchy — a branch's children are its own `c2-tree-item` element children:
 *
 * ```html
 * <c2-tree>
 *   <c2-tree-item value="src" label="src">
 *     <c2-tree-item value="app.ts" label="app.ts"></c2-tree-item>
 *   </c2-tree-item>
 * </c2-tree>
 * ```
 *
 * The item draws a row and nothing else: `expanded`, `selected`, `indeterminate`, `level` and the roving
 * `tabindex` are all written by the parent `c2-tree`, which owns the tree's state. Setting them by hand works
 * but is overwritten on the tree's next sync — drive the tree's `value` and `expanded-items` instead.
 *
 * The children slot is only rendered while the row is expanded, so a collapsed subtree is not laid out and
 * stays out of the accessibility tree. The child elements themselves still exist in the DOM.
 *
 * @tag c2-tree-item
 *
 * @slot - The nested `c2-tree-item` children of this row.
 * @slot label - Rich label content, replacing the `label` attribute.
 * @slot icon - Icon shown between the disclosure toggle and the label.
 * @slot actions - Trailing content, revealed on hover and focus by default.
 * @slot toggle-icon - Replaces the default chevron. It is rotated by the component, so supply the collapsed orientation.
 *
 * @csspart row - The clickable row, excluding any nested children.
 * @csspart toggle - The disclosure toggle.
 * @csspart label - Text box containing the `label` slot or label-property fallback.
 * @csspart actions - Trailing box wrapping the assigned `actions` slot.
 * @csspart group - The container holding the nested children.
 * @csspart checkbox - The selection checkbox rendered when checkbox selection is enabled.
 *
 * @cssproperty {pixel} [--c2-tree-item__row--min-height=28px] - Height of a row.
 * @cssproperty {pixel} [--c2-tree-item__row--indent=16px] - Extra inset added per level of depth.
 * @cssproperty {padding} [--c2-tree-item__row--padding-top=0px] - Space above the row's content. `row--min-height` is a floor, so this only grows the row once content plus padding passes it.
 * @cssproperty {padding} [--c2-tree-item__row--padding-bottom=0px] - Space below the row's content. See `row--padding-top` for how it interacts with `row--min-height`.
 * @cssproperty {padding} [--c2-tree-item__row--padding-inline-start=8px] - Inset of a root-level row.
 * @cssproperty {padding} [--c2-tree-item__row--padding-inline-end=8px] - Space after the trailing actions.
 * @cssproperty {pixel} [--c2-tree-item__row--gap=6px] - Space between toggle, checkbox, icon, label and actions.
 * @cssproperty {border-radius} [--c2-tree-item__row--border-radius=4px] - Corner radius of the row highlight. Set `0` for edge-to-edge bands.
 * @cssproperty {color} [--c2-tree-item--color=#18181b] - Label colour.
 * @cssproperty {color} [--c2-tree-item--background=transparent] - Row background at rest.
 * @cssproperty {font-size} [--c2-tree-item--font-size=14px] - Label size.
 * @cssproperty {font-weight} --c2-tree-item--font-weight - Label weight.
 * @cssproperty {font-family} --c2-tree-item--font-family - Label family.
 * @cssproperty {pixel} [--c2-tree-item--line-height=20px] - Label line height.
 * @cssproperty {color} --c2-tree-item__hover--color - Label colour while hovered. Defaults to the resting colour.
 * @cssproperty {color} [--c2-tree-item__hover--background=#f4f4f5] - Row background while hovered.
 * @cssproperty {color} [--c2-tree-item__selected--color=rgb(2, 101, 220)] - Label colour while selected.
 * @cssproperty {color} [--c2-tree-item__selected--background=#edf1fe] - Row background while selected.
 * @cssproperty {color} [--c2-tree-item__selected__hover--background=#e2e9fd] - Row background while selected and hovered.
 * @cssproperty {outline} [--c2-tree-item__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring.
 * @cssproperty {pixel} [--c2-tree-item__focus--outline-offset=-2px] - Focus ring inset.
 * @cssproperty {opacity} [--c2-tree-item__disabled--opacity=0.38] - Opacity of a disabled row.
 * @cssproperty {pixel} [--c2-tree-item__toggle--size=16px] - Size of the disclosure toggle.
 * @cssproperty {color} [--c2-tree-item__toggle--color=#71717a] - Colour of the disclosure toggle.
 * @cssproperty {angle} [--c2-tree-item__toggle--rotate=90deg] - Toggle rotation while expanded.
 * @cssproperty {angle} [--c2-tree-item__toggle--rotate-collapsed=0deg] - Toggle rotation while collapsed.
 * @cssproperty {time} [--c2-tree-item__toggle--transition-duration=150ms] - Length of the toggle rotation.
 * @cssproperty {pixel} [--c2-tree-item__icon--size=16px] - Size of slotted icons.
 * @cssproperty {color} --c2-tree-item__icon--color - Colour of slotted icons.
 * @cssproperty {color} [--c2-tree-item__guide--color=#e4e4e7] - Colour of the indent guides.
 * @cssproperty {pixel} [--c2-tree-item__guide--width=1px] - Thickness of the indent guides.
 * @cssproperty {pixel} [--c2-tree-item__actions--gap=2px] - Space between trailing actions.
 * @cssproperty {opacity} [--c2-tree-item__actions--opacity=0] - Opacity of the trailing actions at rest. Set `1` to always show them.
 * @cssproperty {opacity} [--c2-tree-item__actions__hover--opacity=1] - Opacity of the trailing actions while the row is hovered or focused.
 * @cssproperty {pixel} [--c2-tree-item__checkbox--margin-inline-end=2px] - Space after the selection checkbox.
 */
@customElement('c2-tree-item')
export class TreeItem extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Identity of the row. Selection and expansion are tracked by this value, so it must be unique in the tree. */
  @property({ type: String, reflect: true }) value = ''

  /** Text of the row. Ignored when the `label` slot is filled; falls back to `value` when empty. */
  @property({ type: String }) label = ''

  /** Blocks selection and expansion, and takes the row out of checkbox propagation. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Marks a branch whose children load on demand: the toggle shows before any child exists. */
  @property({ type: Boolean, reflect: true, attribute: 'has-children' }) hasChildren = false

  /** Turns the row into a link. The whole row becomes the click target; the toggle still only expands. */
  @property({ type: String }) href = ''

  /** Browsing context for `href`, e.g. `_blank`. A `_blank` row gets `rel="noopener noreferrer"`. */
  @property({ type: String }) target?: string

  /** Arbitrary payload handed back on the tree's events. */
  @property({ attribute: false }) data?: unknown

  /** Whether the children are shown. Written by the parent `c2-tree`. */
  @property({ type: Boolean, reflect: true }) expanded = false

  /** Whether the row is selected. Written by the parent `c2-tree`. */
  @property({ type: Boolean, reflect: true }) selected = false

  /** Whether only part of the subtree is selected. Derived and written by the parent `c2-tree`. */
  @property({ type: Boolean, reflect: true }) indeterminate = false

  /** Whether the children are being fetched. Written by the parent `c2-tree`. */
  @property({ type: Boolean, reflect: true }) loading = false

  /** Depth of the row, `0` at the root. Written by the parent `c2-tree`. */
  @property({ attribute: false }) level = 0

  /** Whether the parent `c2-tree` renders a selection checkbox. Written by the parent `c2-tree`. */
  @property({ attribute: false }) checkboxSelection = false

  /**
   * Whether to draw the indent guides. Written by the parent `c2-tree`, and reflected because the rules are
   * drawn in CSS and the stylesheet has to see it.
   */
  @property({ type: Boolean, reflect: true, attribute: 'children-outline' }) childrenOutline = false

  /** Number of siblings in this row's group, for `aria-setsize`. Written by the parent `c2-tree`. */
  @property({ attribute: false }) setSize = 1

  /** 1-based index of this row among its siblings, for `aria-posinset`. Written by the parent `c2-tree`. */
  @property({ attribute: false }) posInSet = 1

  /** Whether the parent `c2-tree` tracks selection at all, so a leaf knows whether to claim `aria-selected`. */
  @property({ attribute: false }) selectable = true

  @query('slot[name="label"]') private labelSlot?: HTMLSlotElement

  /** Cached so the accessible name is not recomputed from slotted nodes on every sync. */
  #resolvedLabel = ''

  /** The row as a {@link TreeNode}, so both authoring modes produce the same event details and renderer input. */
  get node(): TreeNode {
    // `children` is deliberately left off: synthesizing it would walk the whole subtree on every dispatch, and
    // the declarative and data-driven shapes would still differ. Read the DOM when the subtree is needed.
    return { value: this.value, label: this.label || undefined, disabled: this.disabled, hasChildren: this.isBranch, data: this.data }
  }

  /** The nested rows, in document order. */
  get childItems(): TreeItem[] {
    // There is no light DOM to walk while the page is being server-rendered.
    if (isServer || !this.children) return []
    return [...this.children].filter((child): child is TreeItem => child instanceof TreeItem)
  }

  /** Whether the row can be expanded — it already has children, or declares that it will load some. */
  get isBranch(): boolean {
    return this.hasChildren || this.childItems.length > 0
  }

  /** The accessible name of the row, resolved from the `label` slot, the `label` attribute or `value`. */
  get resolvedLabel(): string {
    return this.#resolvedLabel || this.label || this.value
  }

  override connectedCallback() {
    super.connectedCallback()
    this.#notify()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.#notify()
  }

  /**
   * Asks the parent tree to resync. Only identity changes qualify: the tree writes `expanded`, `selected`,
   * `level` and friends on every pass, so notifying on those would loop.
   */
  #notify() {
    this.dispatchEvent(new CustomEvent(TREE_ITEM_CHANGE_EVENT, { bubbles: true, composed: true }))
  }

  override willUpdate(changed: PropertyValues<this>) {
    if (!this.hasUpdated) return
    if (changed.has('value') || changed.has('disabled') || changed.has('hasChildren')) this.#notify()
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('level')) this.style.setProperty('--level', String(this.level))
    this.#syncAria()
  }

  override firstUpdated() {
    this.#readLabelSlot()
  }

  /**
   * ARIA is written imperatively on the host: `role="treeitem"` has to sit on the element the tree moves focus
   * to, and the `role="group"` holding the children must be a descendant of it.
   */
  #syncAria() {
    this.setAttribute('role', 'treeitem')
    this.setAttribute('aria-level', String(this.level + 1))
    this.setAttribute('aria-setsize', String(this.setSize))
    this.setAttribute('aria-posinset', String(this.posInSet))

    if (this.isBranch) this.setAttribute('aria-expanded', String(this.expanded))
    else this.removeAttribute('aria-expanded')

    if (this.selectable) this.setAttribute('aria-selected', String(this.selected))
    else this.removeAttribute('aria-selected')

    if (this.disabled) this.setAttribute('aria-disabled', 'true')
    else this.removeAttribute('aria-disabled')

    // A treeitem takes its name from its contents, and the children group *is* content — without this a branch
    // announces its whole subtree. `aria-labelledby` cannot help: IDREFs do not cross the shadow boundary the
    // label lives behind.
    this.setAttribute('aria-label', this.resolvedLabel)
  }

  #readLabelSlot() {
    const assigned = this.labelSlot?.assignedNodes({ flatten: true }) ?? []
    this.#resolvedLabel = assigned
      .map((node) => node.textContent ?? '')
      .join('')
      .trim()
    this.#syncAria()
  }

  #handleToggle(event: Event) {
    // The toggle lives in this shadow root, so a click on it retargets to the host and the tree could not tell
    // it apart from a click on the row. Claim it here and announce it explicitly instead. `preventDefault` keeps
    // a linked row from navigating when all the user did was open the branch.
    event.stopPropagation()
    event.preventDefault()
    if (this.disabled) return
    this.dispatchEvent(new CustomEvent(TREE_ITEM_TOGGLE_EVENT, { bubbles: true, composed: true }))
  }

  #handleCheckboxChange(event: Event) {
    // `c2-checkbox` re-dispatches the inner input's native `change`, which does not compose, so it would never
    // leave this shadow root. Re-announce it as a composed event the tree can hear.
    event.stopPropagation()
    const checked = (event.target as HTMLInputElement).checked
    this.dispatchEvent(new CustomEvent(TREE_ITEM_CHECK_EVENT, { detail: checked, bubbles: true, composed: true }))
  }

  override render() {
    const branch = this.isBranch
    const content = html`
      ${
        this.loading
          ? html`<c2-spinner class="spinner" part="toggle" aria-hidden="true"></c2-spinner>`
          : html`<span class="toggle ${classMap({ 'is-leaf': !branch })}" part="toggle" aria-hidden="true" @click=${this.#handleToggle}>
              <slot name="toggle-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </slot>
            </span>`
      }
      ${
        this.checkboxSelection
          ? html`<c2-checkbox
              class="checkbox"
              part="checkbox"
              tabindex="-1"
              aria-label=${this.resolvedLabel}
              .checked=${this.selected}
              .indeterminate=${this.indeterminate}
              ?disabled=${this.disabled}
              @click=${(event: Event) => {
                event.stopPropagation()
                // Only a linked row needs this; on a plain row it would block the checkbox's own toggle.
                if (this.href) event.preventDefault()
              }}
              @change=${this.#handleCheckboxChange}
            ></c2-checkbox>`
          : nothing
      }
      <slot name="icon"></slot>
      <span class="label" part="label">
        <slot name="label" @slotchange=${this.#readLabelSlot}>${this.label || this.value}</slot>
      </span>
      <span class="actions" part="actions"><slot name="actions"></slot></span>
    `

    // The link wraps the whole row so the click target matches the highlight, which is what a navigation tree
    // wants. `tabindex="-1"` keeps the tree's roving tabindex on the host, exactly as `c2-list-item` does.
    const row =
      this.href && !this.disabled
        ? html`<a
            class="row"
            part="row"
            href=${this.href}
            target=${ifDefined(this.target || undefined)}
            rel=${this.target === '_blank' ? 'noopener noreferrer' : nothing}
            tabindex="-1"
            >${content}</a
          >`
        : html`<div class="row" part="row">${content}</div>`

    return html`
      ${row} ${this.expanded ? html`<div class="group" part="group" role="group"><slot @slotchange=${this.#handleChildSlotChange}></slot></div>` : nothing}
    `
  }

  #handleChildSlotChange = () => {
    this.#notify()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tree-item': TreeItem
  }
}
