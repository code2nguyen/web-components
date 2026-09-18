import { LitElement, html, nothing, unsafeCSS, type TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { repeat } from 'lit/directives/repeat.js'
import { customElement } from '@c2n/core/element-helper.js'
import { jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import type { StepContext, StepNode, StepRenderer, StepStatus, StepsMarker } from './step-types.js'
import { rollupStatus } from './step-icons.js'
import styles from './steps.scss?inline'

import './step.js'

export type { StepContext, StepNode, StepRenderer, StepStatus, StepsMarker } from './step-types.js'
export type { StepToggleEventDetail, StepEventMap } from './step.js'

/** The parent-written half of a `c2-step`, which `c2-steps` assigns on every pass. */
type ManagedStep = HTMLElement & {
  level: number
  position: number
  path: string
  last: boolean
  marker: StepsMarker
  grouped: boolean
  hasChildren: boolean
  toggleAttribute(name: string, force?: boolean): boolean
  collapsed: boolean
  status: StepStatus
}

/**
 * A vertical list of steps: the trace of a task as it runs, or a wizard's progress. Each row is a marker, a label,
 * an optional dimmed `detail` beside it and `trailing` text at the end — a duration, a count, a timestamp.
 *
 * **A step with sub-steps is a group**, and a group is a disclosure: its own row is the summary and its sub-steps
 * are the detail. **Every step is a row, and every row is visible** — a group starts expanded and nothing ever
 * folds one away on its own. The chevron is there for the reader, `collapsed` in the markup starts a stage folded,
 * and the run only ever brings a folded stage *back* into view when it starts running or something in it fails.
 *
 * Author it either way, and mix them freely:
 *
 * - **Declarative** — slot `c2-step` children and nest them for sub-steps.
 * - **Data-driven** — hand it a `steps` array of `{ id, label, detail, trailing, status, children }` and it renders
 *   the tree itself. The array wins when both are present. During a run, `updateStep(id, patch)` changes one step
 *   without rebuilding the array.
 *
 * Everything the markup fills with a slot, the data-driven mode fills with a renderer: `renderMarker` for the
 * `marker` slot, `renderToggle` for `toggle`, `renderLabel` / `renderDetail` / `renderTrailing` for the text, and
 * `renderItem` for that text all at once. Each is handed the node, its depth, its position, its dotted path and
 * the status actually in effect.
 *
 * A parent step that does not author a `status` takes one from its children: the most urgent thing inside wins, so
 * a stage reports that it is running, or that something under it failed, without you setting it.
 *
 * `current` is the shortcut a wizard wants: set it to the index of the active step and every top-level step that
 * has neither an explicit `status` nor sub-steps becomes `success` before it, `current` at it and `pending` after.
 *
 * A step that arrives while the list is already on screen grows into place rather than appearing, and a marker
 * gives one beat as its status settles — which is what a trace being written in front of you should look like.
 * `--c2-step--enter-duration: 0s` turns the first off, and `prefers-reduced-motion` turns both off.
 *
 * The connector rail between markers is drawn by CSS and off by default, because a trace does not want one — give
 * `--c2-step__rail--width` a width and a stepper gets its rail.
 *
 * Numbering follows the tree: `marker="number"` draws a dotted path, so the first child of the third step reads
 * `3.1` rather than a second `1`.
 *
 * @tag c2-steps
 *
 * @slot - The `c2-step` children. Ignored when `steps` is set.
 *
 * @slotcomponent c2-step
 *
 * @event {CustomEvent<StepToggleEventDetail>} step-toggle - Fired by a `c2-step` when a group opens or closes, and bubbling to here. `event.target` is the step; `detail.path` says where it sits.
 *
 * @cssproperty {pixel} [--c2-steps--gap=0px] - Space between rows. A stepper usually wants some; a trace does not.
 * @cssproperty {color} --c2-steps--background
 * @cssproperty {border} --c2-steps--border
 * @cssproperty {border-radius} --c2-steps--border-radius
 * @cssproperty {padding} [--c2-steps--padding-block=0px]
 * @cssproperty {padding} [--c2-steps--padding-inline=0px]
 * @cssproperty {overflow} [--c2-steps--overflow-y=visible] - `auto` with a `max-height` keeps a long run in its own scroller.
 * @cssproperty {max-height} [--c2-steps--max-height=none]
 */
@customElement('c2-steps')
export class Steps extends LitElement {
  static override styles = unsafeCSS(styles)

  /** How each marker is drawn: a status glyph, the step's number, or nothing. */
  @property({ reflect: true }) marker: StepsMarker = 'icon'

  /**
   * Index of the active step, for a wizard. `-1` (the default) leaves every status alone; otherwise a top-level
   * step with neither an explicit `status` nor sub-steps becomes `success` before this index, `current` at it and
   * `pending` after it.
   */
  @property({ type: Number, reflect: true }) current = -1

  /** The steps as data, instead of `c2-step` children. Takes precedence over the slot. */
  @property({ converter: jsonPropertyConverter }) steps: StepNode[] | undefined = undefined

  /** Accessible name for the list. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /**
   * Replaces a row's text when rendering from `steps`, so a step can carry a badge, a link, an avatar — anything
   * Lit renders. It overrides `renderLabel`, `renderDetail` and `renderTrailing`, which are the finer-grained way
   * to do the same thing. The marker and the disclosure are their own columns, not part of the text, so
   * `renderMarker` and `renderToggle` still apply alongside it.
   */
  @property({ attribute: false }) renderItem?: StepRenderer

  /**
   * The step's icon when rendering from `steps` — the data-driven half of the `marker` slot. Return an `<svg>`, an
   * icon element, a letter; anything Lit renders. Without one the marker draws the glyph for the step's status.
   */
  @property({ attribute: false }) renderMarker?: StepRenderer

  /** The step's disclosure affordance when rendering from `steps` — the data-driven half of the `toggle` slot. */
  @property({ attribute: false }) renderToggle?: StepRenderer

  /** Replaces the label when rendering from `steps`. */
  @property({ attribute: false }) renderLabel?: StepRenderer

  /** Replaces the dimmed detail when rendering from `steps`. */
  @property({ attribute: false }) renderDetail?: StepRenderer

  /** Replaces the trailing content when rendering from `steps`. */
  @property({ attribute: false }) renderTrailing?: StepRenderer

  /**
   * The status this element last wrote to each step, which is how it knows whether a step is still its to write.
   *
   * `status` reflects, and a server-rendered step arrives with the default already stamped on it, so the presence
   * of the attribute proves nothing about who put it there. A step is ours while it still holds what we last gave
   * it — the moment a run sets something else on it, it is the run's, for good.
   */
  private readonly written = new WeakMap<Element, StepStatus>()

  /**
   * Steps this element has already laid out. A step it has not seen before is new — but only once the list itself
   * has been drawn: on the first pass every step is new, and a whole trace fading in at once is not an arrival,
   * it is a page loading.
   */
  private readonly known = new WeakSet<Element>()
  private hasSynced = false

  /**
   * A run ticks a step over by setting `status` on it, which is nothing this element renders and so nothing Lit
   * would notice. Watching the attribute is what lets a parent roll the change up and a group open on it.
   */
  private observer?: MutationObserver

  override connectedCallback() {
    super.connectedCallback()
    this.setAttribute('role', 'list')
    this.observer ??= new MutationObserver(() => this.syncSteps())
    this.observer.observe(this, { subtree: true, childList: true, attributes: true, attributeFilter: ['status'] })
  }

  override disconnectedCallback() {
    this.observer?.disconnect()
    super.disconnectedCallback()
  }

  protected override updated() {
    this.syncSteps()
  }

  /**
   * Changes one step of `steps` in place and redraws, without rebuilding the array — what a task runner wants when
   * it ticks a step over hundreds of times. Returns `false` when no step carries that `id`.
   */
  updateStep(id: string, patch: Partial<StepNode>): boolean {
    const find = (nodes: StepNode[]): StepNode | undefined => {
      for (const node of nodes) {
        if (node.id === id) return node
        const hit = node.children?.length ? find(node.children) : undefined
        if (hit) return hit
      }
      return undefined
    }
    const node = this.steps?.length ? find(this.steps) : undefined
    if (!node) return false
    Object.assign(node, patch)
    this.requestUpdate()
    return true
  }

  /** Brings every group back into view. */
  expandAll() {
    this.setCollapsedOfAll(false)
  }

  /** Folds every group away, leaving the top-level stages. */
  collapseAll() {
    this.setCollapsedOfAll(true)
  }

  private setCollapsedOfAll(collapsed: boolean) {
    for (const step of this.allSteps()) if (step.querySelector('c2-step')) (step as ManagedStep).collapsed = collapsed
  }

  /** Every step in the list, wherever it came from. */
  private allSteps(): HTMLElement[] {
    const root: ParentNode = this.steps?.length ? (this.renderRoot as ShadowRoot) : this
    return [...root.querySelectorAll<HTMLElement>('c2-step')]
  }

  /**
   * The nearest `c2-step` descendants of `root`, looking through anything that is not one.
   *
   * A step is rarely a literal child: Astro wraps every island in an `<astro-island>` (which is
   * `display: contents`, so it changes nothing but the tree), and a consumer may wrap rows in a `<div>`. Matching
   * only direct children silently found nothing there, and every step kept its defaults.
   */
  private static collectSteps(root: ParentNode): HTMLElement[] {
    const found: HTMLElement[] = []
    for (const child of root.children) {
      if (child.tagName === 'C2-STEP') found.push(child as HTMLElement)
      else found.push(...Steps.collectSteps(child))
    }
    return found
  }

  /** Top-level steps, whether they came from the slot or from `steps`. */
  private get rootSteps(): HTMLElement[] {
    const slot = this.renderRoot.querySelector<HTMLSlotElement>('slot:not([name])')
    if (!slot) return Steps.collectSteps(this.renderRoot as ShadowRoot)
    return slot.assignedElements().flatMap((element) => (element.tagName === 'C2-STEP' ? [element as HTMLElement] : Steps.collectSteps(element)))
  }

  /**
   * Writes depth, position and presentation onto every step, and gives a parent that authored no `status` the one
   * rolled up from its children — which is why the walk returns the statuses it settled on.
   *
   * Cheap to repeat: each value is a property assignment Lit will no-op when unchanged.
   */
  private syncSteps() {
    // One empty column on every row of a list that has no group anywhere would be a column of nothing.
    const root: ParentNode = this.steps?.length ? (this.renderRoot as ShadowRoot) : this
    const grouped = !!root.querySelector('c2-step c2-step')

    const walk = (steps: HTMLElement[], level: number, parentPath: string): StepStatus[] => {
      return steps.map((step, index) => {
        const element = step as ManagedStep & { hasAttribute(name: string): boolean }
        element.level = level
        element.position = index + 1
        // `3.1` reads as the first child of the third step; a bare `1` there would be a lie.
        element.path = parentPath ? `${parentPath}.${index + 1}` : String(index + 1)
        element.last = index === steps.length - 1
        element.marker = this.marker
        element.grouped = grouped
        if (!this.known.has(element)) {
          this.known.add(element)
          // The step takes it off again when the animation ends.
          if (this.hasSynced) element.toggleAttribute('entering', true)
        }

        const children = Steps.collectSteps(element)
        element.hasChildren = children.length > 0
        const childStatuses = children.length ? walk(children, level + 1, element.path) : []
        if (this.mayWrite(element)) {
          const next = this.deriveStatus(childStatuses, level, index)
          element.status = next
          this.written.set(element, next)
        }
        return element.status
      })
    }
    walk(this.rootSteps, 0, '')
    this.hasSynced = true
  }

  /**
   * Whether this element may still write a step's status. A step it has never written is its to write while the
   * step is `pending` — what "nobody said" looks like, from the markup or from the server. After that it is ours
   * only while it still holds the value we gave it.
   */
  private mayWrite(element: ManagedStep): boolean {
    const last = this.written.get(element)
    return last === undefined ? element.status === 'pending' : element.status === last
  }

  /** A parent takes the most urgent status under it; a leaf takes the wizard's `current`, or nothing happened yet. */
  private deriveStatus(childStatuses: StepStatus[], level: number, index: number): StepStatus {
    if (childStatuses.length) return rollupStatus(childStatuses)
    if (level === 0 && this.current >= 0) return index < this.current ? 'success' : index === this.current ? 'current' : 'pending'
    return 'pending'
  }

  /** The status a data node ends up with, so a renderer is handed what is actually drawn. */
  private statusOf(node: StepNode, level: number, index: number): StepStatus {
    if (node.status) return node.status
    const children = node.children ?? []
    if (children.length) return rollupStatus(children.map((child, childIndex) => this.statusOf(child, level + 1, childIndex)))
    if (level === 0 && this.current >= 0) return index < this.current ? 'success' : index === this.current ? 'current' : 'pending'
    return 'pending'
  }

  private renderNode(node: StepNode, level: number, index: number, parentPath: string): TemplateResult {
    const position = index + 1
    const path = parentPath ? `${parentPath}.${position}` : String(position)
    const context: StepContext = { node, level, position, path, status: this.statusOf(node, level, index) }
    const slot = (name: string, renderer: StepRenderer | undefined) => (renderer ? html`<span slot=${name}>${renderer(context)}</span>` : nothing)
    const children = node.children ?? []
    // A renderer replaces the attribute, rather than competing with it for the same slot.
    return html`<c2-step
      status=${ifDefined(node.status)}
      ?collapsed=${node.collapsed ?? false}
      label=${ifDefined(this.renderItem || this.renderLabel ? undefined : node.label)}
      detail=${ifDefined(this.renderItem || this.renderDetail ? undefined : node.detail)}
      trailing=${ifDefined(this.renderItem || this.renderTrailing ? undefined : node.trailing)}
    >
      ${slot('marker', this.renderMarker)}${slot('toggle', this.renderToggle)}
      ${
        this.renderItem
          ? html`<span slot="label">${this.renderItem(context)}</span>`
          : html`${slot('label', this.renderLabel)}${slot('detail', this.renderDetail)}${slot('trailing', this.renderTrailing)}`
      }
      ${repeat(
        children,
        (child, childIndex) => child.id ?? `${path}.${childIndex + 1}`,
        (child, childIndex) => this.renderNode(child, level + 1, childIndex, path),
      )}
    </c2-step>`
  }

  override render() {
    return this.steps?.length
      ? html`${repeat(
          this.steps,
          (node, index) => node.id ?? String(index + 1),
          (node, index) => this.renderNode(node, 0, index, ''),
        )}`
      : html`<slot @slotchange=${() => this.syncSteps()}></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-steps': Steps
  }
}
