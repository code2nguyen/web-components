import { LitElement, html, nothing, svg, unsafeCSS } from 'lit'
import { state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { classMap } from 'lit/directives/class-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property, arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/avatar'
import { orgChartMessages } from './messages'
import styles from './org-chart.scss?inline'
import type {
  OrgChartExpansionChangeEventDetail,
  OrgChartItemClickEventDetail,
  OrgChartItemRenderer,
  OrgChartNode,
  OrgChartOrientation,
  OrgChartSelectionChangeEventDetail,
} from './org-chart-types'

export type * from './org-chart-types'

/** Events fired by {@link OrgChart}, keyed for `addEventListener`. */
export interface OrgChartEventMap {
  'selection-change': CustomEvent<OrgChartSelectionChangeEventDetail>
  'expansion-change': CustomEvent<OrgChartExpansionChangeEventDetail>
  'item-click': CustomEvent<OrgChartItemClickEventDetail>
}

export interface OrgChart {
  addEventListener: TypedAddEventListener<OrgChart, OrgChartEventMap>
  removeEventListener: TypedRemoveEventListener<OrgChart, OrgChartEventMap>
}

/** Where a node sits in the hierarchy, worked out once per change of `items`. */
interface NodeEntry {
  node: OrgChartNode
  parent: OrgChartNode | undefined
  level: number
  posInSet: number
  setSize: number
  /** Position in the shadow root's ids; the node's own id may hold characters an IDREF cannot. */
  key: number
}

const chevron = svg`<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4-4 4 4" /></svg>`

/**
 * A hierarchy drawn as connected cards: an organization chart, a reporting line or a team structure. Each card
 * shows an avatar, a label and a description, and a manager's card carries a toggle on its connector that
 * collapses or expands the people below it, showing how many there are while they are hidden.
 *
 * The chart is drawn from data:
 *
 * ```ts
 * chart.items = [{ id: 'ana', label: 'Ana Ruiz', description: 'CEO', children: [{ id: 'li', label: 'Li Wei', description: 'CTO' }] }]
 * ```
 *
 * Every node starts expanded; `collapsed-items` lists the ones whose reports are hidden. `orientation="horizontal"`
 * draws reports beside their manager instead of below, which suits deep, narrow hierarchies. The chart grows to
 * its content and scrolls inside the host when it is wider or taller than the space it is given.
 *
 * Set `selectable` to let one card at a time be selected (`value`); `item-click` fires for every card either way,
 * which is where an app opens a profile. `renderItem` replaces the content of every card. It is handed to Lit, so
 * it returns a Lit template or a DOM node, not framework markup such as JSX.
 *
 * The chart is an ARIA tree with one Tab stop, and the arrow keys follow the drawing.
 *
 * ### Keyboard
 *
 * In the vertical layout, Arrow Down expands a collapsed card, then moves to its first report; Arrow Up collapses an
 * expanded card, then moves to its manager. Arrow Left and Right move to the previous and next card on the same
 * row. The horizontal layout turns the same keys a quarter turn: Right goes in, Left goes out, Up and Down move
 * along the column. Home and End jump to the first and last card, and Enter or Space activates the card.
 *
 * @tag c2-org-chart
 *
 * @slot empty - Shown instead of the chart while `items` is empty.
 *
 * @internalcomponent c2-avatar
 *
 * @csspart chart - The element holding every card.
 * @csspart card - Each card.
 * @csspart card-selected - The selected card, in addition to `card`.
 * @csspart avatar - The `c2-avatar` of each card.
 * @csspart label - The label line of each card.
 * @csspart description - The description line of each card.
 * @csspart toggle - The expand and collapse control on a manager's connector.
 * @csspart empty - The wrapper of the `empty` slot.
 *
 * @event {CustomEvent<OrgChartSelectionChangeEventDetail>} selection-change - Fired after the user selects a card in a `selectable` chart. Does not bubble: several components fire `selection-change`, so a listener belongs on the element itself.
 * @event {CustomEvent<OrgChartExpansionChangeEventDetail>} expansion-change - Fired after the user expands or collapses a card. Does not bubble.
 * @event {CustomEvent<OrgChartItemClickEventDetail>} item-click - Fired when a card is clicked or activated with Enter or Space, selectable or not.
 *
 * @cssproperty {padding} [--c2-org-chart--padding=16px] - Space between the host's edge and the chart.
 * @cssproperty {font-family} [--c2-org-chart--font-family=inherit]
 * @cssproperty {pixel} [--c2-org-chart__level--gap=40px] - Distance between a manager's card and the cards of their reports.
 * @cssproperty {pixel} [--c2-org-chart__sibling--gap=16px] - Distance between two cards on the same level.
 * @cssproperty {pixel} [--c2-org-chart__root--gap=48px] - Distance between two charts when `items` holds several roots.
 * @cssproperty {color} [--c2-org-chart__connector--color=#bcbcc6]
 * @cssproperty {pixel} [--c2-org-chart__connector--width=1px] - Thickness of the connecting lines.
 * @cssproperty {border-style} [--c2-org-chart__connector--border-style=solid] - `dashed` or `dotted` for a softer line.
 * @cssproperty {border-radius} [--c2-org-chart__connector--border-radius=0px] - Rounds the corners where a line turns towards the first and last report.
 * @cssproperty {pixel} [--c2-org-chart__card--width=200px]
 * @cssproperty {pixel} [--c2-org-chart__card--min-height=0px]
 * @cssproperty {padding} [--c2-org-chart__card--padding=12px]
 * @cssproperty {flex-direction} [--c2-org-chart__card--flex-direction=row] - `column` stacks the avatar above the text.
 * @cssproperty {align-items} [--c2-org-chart__card--align-items=center]
 * @cssproperty {text-align} [--c2-org-chart__card--text-align=start]
 * @cssproperty {pixel} [--c2-org-chart__card--gap=12px] - Space between the avatar and the text.
 * @cssproperty {color} [--c2-org-chart__card--background-color=#ffffff]
 * @cssproperty {border} [--c2-org-chart__card--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-org-chart__card--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-org-chart__card--box-shadow=none]
 * @cssproperty {color} [--c2-org-chart__card__hover--border-color=#a1a1aa]
 * @cssproperty {color} [--c2-org-chart__card__selected--border-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-org-chart__card__selected--background-color=#ffffff]
 * @cssproperty {box-shadow} [--c2-org-chart__card__selected--box-shadow=0 0 0 1px rgb(2, 101, 220)] - Doubles the border, so the selection does not rest on colour alone.
 * @cssproperty {outline} [--c2-org-chart__card__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-org-chart__card__focus--outline-offset=2px]
 * @cssproperty {opacity} [--c2-org-chart__card__disabled--opacity=0.38]
 * @cssproperty {time} [--c2-org-chart__card--transition-duration=150ms]
 * @cssproperty {display} [--c2-org-chart__avatar--display=flex] - `none` hides the avatars, for a chart of teams rather than people.
 * @cssproperty {pixel} [--c2-org-chart__avatar--size=40px]
 * @cssproperty {color} [--c2-org-chart__label--color=#18181b]
 * @cssproperty {font-size} [--c2-org-chart__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-org-chart__label--font-weight=600]
 * @cssproperty {line-height} [--c2-org-chart__label--line-height=20px]
 * @cssproperty {color} [--c2-org-chart__description--color=#71717a]
 * @cssproperty {font-size} [--c2-org-chart__description--font-size=12px]
 * @cssproperty {line-height} [--c2-org-chart__description--line-height=16px]
 * @cssproperty {pixel} [--c2-org-chart__toggle--size=20px] - Height of the toggle, and its smallest width.
 * @cssproperty {padding} [--c2-org-chart__toggle--padding-inline=4px] - Space either side of the count.
 * @cssproperty {color} [--c2-org-chart__toggle--background-color=#ffffff]
 * @cssproperty {color} [--c2-org-chart__toggle--color=#71717a]
 * @cssproperty {border} [--c2-org-chart__toggle--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-org-chart__toggle--border-radius=999px]
 * @cssproperty {font-size} [--c2-org-chart__toggle--font-size=12px]
 * @cssproperty {font-weight} [--c2-org-chart__toggle--font-weight=500]
 * @cssproperty {color} [--c2-org-chart__toggle__hover--border-color=#a1a1aa]
 * @cssproperty {color} [--c2-org-chart__toggle__hover--color=#18181b]
 * @cssproperty {color} [--c2-org-chart__empty--color=#71717a]
 * @cssproperty {padding} [--c2-org-chart__empty--padding=18px]
 */
@customElement('c2-org-chart')
export class OrgChart extends LitElement {
  static override styles = unsafeCSS(styles)

  // Semantics live on ElementInternals, not host attributes: an attribute the element writes on itself is one the
  // server never rendered, and React reports it as a hydration mismatch. An author-set attribute still wins.
  private readonly internals = this.attachInternals()

  private readonly msg = new LocalizeController(this, orgChartMessages)

  /** The root nodes, each with its reports nested in `children`. Several roots draw several charts side by side. Assign a new array to redraw: a change made inside the current one is not seen. */
  @property({ converter: jsonPropertyConverter }) items: OrgChartNode[] = []

  /** Ids of the nodes whose reports are hidden, as a `;`-separated attribute. Every other node is expanded. */
  @property({ converter: arrayPropertyConverter, attribute: 'collapsed-items' }) collapsedItems: string[] = []

  /** Which way the chart grows from its roots. */
  @property({ type: String }) orientation: OrgChartOrientation = 'vertical'

  /** Lets the user select one card at a time. */
  @property({ type: Boolean }) selectable = false

  /** Id of the selected node. */
  @property({ type: String }) value = ''

  /** Replaces the content of every card. The card frame, its selection and focus styling and the toggle stay. */
  @property({ attribute: false }) renderItem?: OrgChartItemRenderer

  /** The node holding the roving `tabindex`. */
  @state() private focusedId = ''

  #indexed: OrgChartNode[] | undefined
  #map = new Map<string, NodeEntry>()
  /** `collapsedItems` as a set, for the render that is in progress. */
  #collapsed = new Set<string>()
  /** Whether a card held focus when the update started, so a card that disappears hands focus on. */
  #focusWithin = false

  /** Where every node sits, rebuilt whenever `items` is replaced, so the methods work before the first render. */
  get #entries(): Map<string, NodeEntry> {
    if (this.#indexed !== this.items) this.#index()
    return this.#map
  }

  /** Every node, in drawing order, collapsed or not. */
  get allNodes(): OrgChartNode[] {
    return [...this.#entries.values()].map((entry) => entry.node)
  }

  /** The node with the given id, wherever it sits in the hierarchy. */
  getNode(id: string): OrgChartNode | undefined {
    return this.#entries.get(id)?.node
  }

  /** Shows every node. */
  expandAll() {
    this.collapsedItems = []
  }

  /** Hides everything below the roots. */
  collapseAll() {
    this.collapsedItems = this.allNodes.filter(hasChildren).map((node) => node.id)
  }

  /** Expands every manager above a node so its card is drawn, then scrolls the card into view. */
  async reveal(id: string) {
    const ancestors = new Set(this.#ancestors(id).map((node) => node.id))
    if (this.collapsedItems.some((item) => ancestors.has(item))) {
      this.collapsedItems = this.collapsedItems.filter((item) => !ancestors.has(item))
    }
    await this.updateComplete
    this.#cardOf(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  /** Moves keyboard focus to a node's card, expanding its managers first if it is hidden. */
  async focusItem(id: string) {
    if (!this.#entries.has(id)) return
    await this.reveal(id)
    this.#focus(id)
  }

  protected override willUpdate() {
    this.#focusWithin = !!this.shadowRoot?.activeElement
  }

  protected override updated() {
    // An empty chart shows only its `empty` slot: a tree with no items would be announced as an empty tree.
    const empty = !list(this.items).length
    this.internals.role = empty ? null : 'tree'
    this.internals.ariaLabel = empty ? null : this.msg.t('label')
    this.internals.ariaOrientation = empty ? null : this.orientation === 'horizontal' ? 'horizontal' : 'vertical'
    // Collapsing from code (collapseAll, a new collapsed-items) can remove the focused card: focus its manager.
    if (this.#focusWithin && !this.shadowRoot?.activeElement) this.renderRoot.querySelector<HTMLElement>('li.node[tabindex="0"]')?.focus()
  }

  override render() {
    const roots = this.#drawn(this.items)
    if (!roots.length) return html`<div class="empty" part="empty"><slot name="empty"></slot></div>`
    this.#collapsed = new Set(this.collapsedItems)
    const tabStop = this.#tabStop()
    const classes = { 'c2-org-chart': true, horizontal: this.orientation === 'horizontal', vertical: this.orientation !== 'horizontal' }
    return html`<div class=${classMap(classes)} part="chart">
      <ul class="roots" role="none" @keydown=${this.#handleKeydown} @focusin=${this.#handleFocusin} @click=${this.#handleClick}>
        ${repeat(
          roots,
          (node) => node.id,
          (node) => this.#renderNode(node, tabStop),
        )}
      </ul>
    </div>`
  }

  /** The focused card while it is drawn, else its nearest drawn manager, else the first card. */
  #tabStop(): string | undefined {
    const visible = new Set(this.#visible().map((node) => node.id))
    if (visible.has(this.focusedId)) return this.focusedId
    const manager = this.#ancestors(this.focusedId).find((node) => visible.has(node.id))
    return manager?.id ?? visible.values().next().value
  }

  /** The nodes of a list that are drawn: a node whose id an earlier node already took is left out. */
  #drawn(nodes: OrgChartNode[] | undefined): OrgChartNode[] {
    return list(nodes).filter((node) => this.#entries.get(node.id)?.node === node)
  }

  #renderNode(node: OrgChartNode, tabStop: string | undefined): unknown {
    const entry = this.#entries.get(node.id)!
    const branch = hasChildren(node)
    const expanded = !branch || !this.#collapsed.has(node.id)
    const selected = this.selectable && this.value === node.id
    const context = { node, parent: entry.parent, level: entry.level, expanded, selected }
    const cardId = `card-${entry.key}`
    const label = node.label || node.id
    return html`<li
      class="node"
      role="treeitem"
      data-id=${node.id}
      tabindex=${node.id === tabStop ? 0 : -1}
      aria-labelledby=${cardId}
      aria-level=${entry.level + 1}
      aria-setsize=${entry.setSize}
      aria-posinset=${entry.posInSet}
      aria-expanded=${branch ? String(expanded) : nothing}
      aria-selected=${this.selectable ? String(selected) : nothing}
      aria-disabled=${node.disabled ? 'true' : nothing}
    >
      <div class="box">
        <div id=${cardId} class=${classMap({ card: true, selected, disabled: !!node.disabled })} part=${selected ? 'card card-selected' : 'card'}>
          ${
            this.renderItem
              ? this.renderItem(context)
              : html`<c2-avatar class="avatar" part="avatar" name=${label} src=${node.image || nothing} auto-color aria-hidden="true"></c2-avatar>
                  <span class="text">
                    <span class="label" part="label">${label}</span>
                    ${node.description ? html`<span class="description" part="description">${node.description}</span>` : nothing}
                  </span>`
          }
        </div>
        ${
          branch
            ? html`<span
                class=${classMap({ toggle: true, collapsed: !expanded })}
                part="toggle"
                aria-hidden="true"
                title=${expanded ? this.msg.t('collapse') : this.msg.t('expand', node.children!.length)}
                >${expanded ? chevron : node.children!.length}</span
              >`
            : nothing
        }
      </div>
      ${
        branch && expanded
          ? html`<ul class="children" role="group">
              ${repeat(
                this.#drawn(node.children),
                (child) => child.id,
                (child) => this.#renderNode(child, tabStop),
              )}
            </ul>`
          : nothing
      }
    </li>`
  }

  #index() {
    this.#indexed = this.items
    const entries = (this.#map = new Map<string, NodeEntry>())
    let key = 0
    const walk = (nodes: OrgChartNode[], parent: OrgChartNode | undefined, level: number) => {
      list(nodes).forEach((node, index) => {
        if (entries.has(node.id)) {
          console.warn(`c2-org-chart: the id "${node.id}" is used by more than one node; only the first is drawn.`)
          return
        }
        entries.set(node.id, { node, parent, level, posInSet: index + 1, setSize: nodes.length, key: key++ })
        walk(list(node.children), node, level + 1)
      })
    }
    walk(list(this.items), undefined, 0)
  }

  /** The drawn nodes in drawing order: a collapsed node's reports are left out. */
  #visible(): OrgChartNode[] {
    const result: OrgChartNode[] = []
    const collapsed = new Set(this.collapsedItems)
    const walk = (nodes: OrgChartNode[]) => {
      for (const node of nodes) {
        if (this.#entries.get(node.id)?.node !== node) continue
        result.push(node)
        if (!collapsed.has(node.id)) walk(list(node.children))
      }
    }
    walk(list(this.items))
    return result
  }

  #ancestors(id: string): OrgChartNode[] {
    const result: OrgChartNode[] = []
    let parent = this.#entries.get(id)?.parent
    while (parent) {
      result.push(parent)
      parent = this.#entries.get(parent.id)?.parent
    }
    return result
  }

  #itemOf(id: string): HTMLElement | undefined {
    return this.renderRoot.querySelector<HTMLElement>(`li.node[data-id="${CSS.escape(id)}"]`) ?? undefined
  }

  #cardOf(id: string): HTMLElement | undefined {
    return this.#itemOf(id)?.querySelector<HTMLElement>(':scope > .box > .card') ?? undefined
  }

  async #focus(id: string) {
    this.focusedId = id
    await this.updateComplete
    this.#itemOf(id)?.focus()
  }

  #handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement
    const id = target.closest<HTMLElement>('li.node')?.dataset.id
    const node = id ? this.#entries.get(id)?.node : undefined
    if (!node) return
    if (target.closest('.toggle')) this.#toggle(node)
    else if (target.closest('.card')) this.#activate(node)
  }

  #handleFocusin(event: FocusEvent) {
    const item = (event.target as HTMLElement).closest<HTMLElement>('li.node')
    if (item?.dataset.id) this.focusedId = item.dataset.id
  }

  #activate(node: OrgChartNode) {
    this.dispatchEvent(new CustomEvent<OrgChartItemClickEventDetail>('item-click', { detail: { node }, bubbles: true, composed: true }))
    if (!this.selectable || node.disabled || this.value === node.id) return
    this.value = node.id
    this.dispatchEvent(new CustomEvent<OrgChartSelectionChangeEventDetail>('selection-change', { detail: { value: node.id, node }, bubbles: false }))
  }

  #toggle(node: OrgChartNode) {
    const expanded = this.collapsedItems.includes(node.id)
    this.#setExpanded(node, expanded)
  }

  #setExpanded(node: OrgChartNode, expanded: boolean) {
    if (!hasChildren(node) || expanded === !this.collapsedItems.includes(node.id)) return
    this.collapsedItems = expanded ? this.collapsedItems.filter((id) => id !== node.id) : [...this.collapsedItems, node.id]
    // Collapsing a manager hides the card that held focus: hand the Tab stop to the manager instead.
    if (!expanded && this.#ancestors(this.focusedId).includes(node)) this.#focus(node.id)
    this.dispatchEvent(
      new CustomEvent<OrgChartExpansionChangeEventDetail>('expansion-change', {
        detail: { collapsedItems: [...this.collapsedItems], node, expanded },
        bubbles: false,
      }),
    )
  }

  #handleKeydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const item = (event.target as HTMLElement).closest<HTMLElement>('li.node')
    const entry = item?.dataset.id ? this.#entries.get(item.dataset.id) : undefined
    if (!entry || event.target !== item) return
    const { node } = entry
    const horizontal = this.orientation === 'horizontal'
    const rtl = getComputedStyle(this).direction === 'rtl'
    const [back, forward] = rtl ? ['ArrowRight', 'ArrowLeft'] : ['ArrowLeft', 'ArrowRight']
    const inward = horizontal ? forward : 'ArrowDown'
    const outward = horizontal ? back : 'ArrowUp'
    const previous = horizontal ? 'ArrowUp' : back
    const next = horizontal ? 'ArrowDown' : forward
    const visible = this.#visible()
    let target: OrgChartNode | undefined

    switch (event.key) {
      case inward:
        if (!hasChildren(node)) break
        if (this.collapsedItems.includes(node.id)) this.#setExpanded(node, true)
        else target = this.#drawn(node.children)[0]
        break
      case outward:
        if (hasChildren(node) && !this.collapsedItems.includes(node.id)) this.#setExpanded(node, false)
        else target = entry.parent
        break
      case previous:
      case next: {
        // The cards drawn on the same row (or column), across managers, in the order they are drawn.
        const row = visible.filter((other) => this.#entries.get(other.id)?.level === entry.level)
        target = row[row.indexOf(node) + (event.key === next ? 1 : -1)]
        break
      }
      case 'Home':
        target = visible[0]
        break
      case 'End':
        target = visible[visible.length - 1]
        break
      case 'Enter':
      case ' ':
        this.#activate(node)
        break
      default:
        return
    }
    event.preventDefault()
    if (target) this.#focus(target.id)
  }
}

function hasChildren(node: OrgChartNode): boolean {
  return list(node.children).length > 0
}

/** Reads an `items` or `children` value that may not be an array, as JSON from an attribute can be. */
function list(nodes: OrgChartNode[] | undefined): OrgChartNode[] {
  return Array.isArray(nodes) ? nodes : []
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-org-chart': OrgChart
  }
}
