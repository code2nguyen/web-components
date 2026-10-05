import { LitElement, html, isServer, nothing, svg, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property, jsonPropertyConverter, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './gantt.scss?inline'
import {
  createFormatters,
  fromDay,
  isoDay,
  linkPath,
  normalizeTasks,
  resolveWeekStart,
  resolveWeekend,
  scaleTicks,
  toDay,
  viewRange,
  visibleRows,
  type GanttFormatters,
  type GanttModel,
  type GanttRange,
  type GanttRow,
} from './gantt-model.js'
import { GANTT_TASK_CHANGE_EVENT, GANTT_TASK_TAG, type GanttTask } from './gantt-task.js'
import type {
  GanttGroupToggleEventDetail,
  GanttLabelContext,
  GanttLayout,
  GanttScale,
  GanttSelectionChangeEventDetail,
  GanttTaskConfig,
  GanttTaskEventDetail,
  GanttTaskHoverEventDetail,
  GanttTooltipContext,
} from './gantt-types.js'

import './gantt-task.js'

export type * from './gantt-types.js'
export { GanttTask } from './gantt-task.js'

/** Events fired by `c2-gantt`. */
export interface GanttEventMap {
  'task-click': CustomEvent<GanttTaskEventDetail>
  'selection-change': CustomEvent<GanttSelectionChangeEventDetail>
  'group-toggle': CustomEvent<GanttGroupToggleEventDetail>
  'task-hover': CustomEvent<GanttTaskHoverEventDetail>
}

export interface Gantt {
  addEventListener: TypedAddEventListener<Gantt, GanttEventMap>
  removeEventListener: TypedRemoveEventListener<Gantt, GanttEventMap>
}

/** Column width and row height before the stylesheet has been measured (and on a server): the `$theme` defaults. */
const DEFAULT_COLUMN: Record<GanttScale, number> = { day: 28, week: 16, month: 5 }
const DEFAULT_ROW = 32
const DEFAULT_COMPACT_ROW = 44
/** Below this host width, `layout="auto"` drops the task list. */
const COMPACT_BELOW = 560
/** Height of the label line above each bar in the compact layout; matches `--_label-line` in the stylesheet. */
const LABEL_LINE = 16
const MILESTONE_HALF = 7
/** Gap between the tooltip and its row, and between the tooltip and the edges it is kept inside. */
const TOOLTIP_GAP = 4

const chevron = html`<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
  <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
</svg>`

/**
 * A read-only project timeline: tasks as bars on a day, week or month scale, with progress, groups that span
 * their children, milestones, finish-to-start dependency arrows and a line for today. A task list sits on the
 * left and stays put while the timeline scrolls sideways; below 560px of width it gives way to a compact layout
 * with each label above its bar.
 *
 * Tasks come in one of two ways. Give `tasks` an array (or a JSON attribute) for data from an API, or write
 * `c2-gantt-task` elements inside the chart, nested to form groups, for markup. When `tasks` holds an array it
 * wins and the children are ignored.
 *
 * Dates are calendar days (`YYYY-MM-DD`), and `end` is inclusive. Weeks start on the locale's first day of the
 * week (`locale`, the page's `lang`, or the browser's language) unless `week-start` says otherwise, and the
 * locale's weekend is shaded.
 *
 * The chart is a tree grid: each row is focusable, ↑ and ↓ move between rows, → and ← open and close groups,
 * Enter selects. Each row's accessible name gives the task's dates, length, progress and predecessors.
 *
 * @tag c2-gantt
 *
 * @slotcomponent c2-gantt-task
 *
 * @slot empty - Shown when there are no tasks. Defaults to "No tasks to show".
 * @slot list-header - Heading of the task list column. Defaults to "Task".
 * @slot duration-header - Heading of the duration column. Defaults to "Days".
 *
 * @event {CustomEvent<GanttTaskEventDetail>} task-click - Fired when a bar or a row is clicked, or Enter is pressed on a row, before the selection changes. Cancel it to keep the selection as it is. Bubbles.
 * @event {CustomEvent<GanttSelectionChangeEventDetail>} selection-change - Fired after the user selects a task. `detail.value` is its id. Does not bubble.
 * @event {CustomEvent<GanttGroupToggleEventDetail>} group-toggle - Fired after the user opens or closes a group. `collapsed` already holds the new state. Does not bubble.
 * @event {CustomEvent<GanttTaskHoverEventDetail>} task-hover - Fired when the pointer moves onto a bar, or off the bars (with nulls). Does not bubble.
 *
 * @csspart base - The chart's frame.
 * @csspart scroller - The scrolling area holding the list and the timeline.
 * @csspart empty - Region wrapping the `empty` slot, shown only while there are no tasks. It styles the fallback text; assigned content keeps its own styles.
 * @csspart row - A row of the task list.
 * @csspart bar - A task's bar.
 * @csspart progress - The completed share of a bar.
 * @csspart milestone - A milestone's diamond.
 * @csspart summary - A group's summary bar.
 * @csspart link - A dependency arrow.
 * @csspart today - The line for today.
 * @csspart tooltip - The tooltip.
 *
 * @cssproperty {color} [--c2-gantt--background=#ffffff] - Surface of the chart; bar tints are mixed against it.
 * @cssproperty {color} [--c2-gantt--color=#18181b]
 * @cssproperty {font-family} [--c2-gantt--font-family=inherit]
 * @cssproperty {font-size} [--c2-gantt--font-size=12px]
 * @cssproperty {border} [--c2-gantt--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-gantt--border-radius=8px]
 * @cssproperty {pixel} [--c2-gantt--max-height=none] - Caps the height; the chart then scrolls vertically too, with the header pinned.
 * @cssproperty {color} [--c2-gantt__header--background=#fafafa]
 * @cssproperty {color} [--c2-gantt__header--color=#71717a]
 * @cssproperty {pixel} [--c2-gantt__header--height=48px] - Both tiers of the scale together.
 * @cssproperty {color} [--c2-gantt__header__major--color=#18181b] - Month or year labels.
 * @cssproperty {font-weight} [--c2-gantt__header__major--font-weight=600]
 * @cssproperty {color} [--c2-gantt__header__today--color=rgb(2, 101, 220)] - Today's day number on the day scale.
 * @cssproperty {pixel} [--c2-gantt__list--width=260px]
 * @cssproperty {border} [--c2-gantt__list--border-right=1px solid #e4e4e7]
 * @cssproperty {pixel} [--c2-gantt__list--indent=16px] - Indent per nesting level.
 * @cssproperty {font-weight} [--c2-gantt__list__group--font-weight=600]
 * @cssproperty {color} [--c2-gantt__list__duration--color=#71717a]
 * @cssproperty {pixel} [--c2-gantt__row--height=32px]
 * @cssproperty {pixel} [--c2-gantt__row-compact--height=44px] - Row height of the compact layout, which adds a label line.
 * @cssproperty {border} [--c2-gantt__row--border-bottom=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-gantt__row__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-gantt__row__selected--background=rgba(2, 101, 220, 0.08)]
 * @cssproperty {outline} [--c2-gantt__row__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {color} [--c2-gantt__grid-line--color=#e4e4e7]
 * @cssproperty {color} [--c2-gantt__weekend--background=#fafafa]
 * @cssproperty {pixel} [--c2-gantt__column-day--width=28px] - Width of one day on the day scale.
 * @cssproperty {pixel} [--c2-gantt__column-week--width=16px] - Width of one day on the week scale.
 * @cssproperty {pixel} [--c2-gantt__column-month--width=5px] - Width of one day on the month scale.
 * @cssproperty {pixel} [--c2-gantt__bar--height=20px]
 * @cssproperty {pixel} [--c2-gantt__bar-compact--height=14px]
 * @cssproperty {color} [--c2-gantt__bar--color=rgb(2, 101, 220)] - Hue of a bar without a `tone`; its fill, border and progress are mixed from it.
 * @cssproperty {percentage} [--c2-gantt__bar--background-mix=16%]
 * @cssproperty {percentage} [--c2-gantt__bar--border-mix=45%]
 * @cssproperty {border-radius} [--c2-gantt__bar--border-radius=6px]
 * @cssproperty {font-weight} [--c2-gantt__bar--font-weight=500]
 * @cssproperty {pixel} [--c2-gantt__bar__selected--outline-width=2px]
 * @cssproperty {percentage} [--c2-gantt__progress--background-mix=36%]
 * @cssproperty {color} [--c2-gantt__label--color=#71717a] - Labels drawn beside a bar too short to hold them.
 * @cssproperty {color} [--c2-gantt__summary--color=#18181b]
 * @cssproperty {pixel} [--c2-gantt__summary--height=6px]
 * @cssproperty {pixel} [--c2-gantt__milestone--size=12px]
 * @cssproperty {color} [--c2-gantt__milestone--color=#18181b]
 * @cssproperty {color} [--c2-gantt__link--color=#a1a1aa]
 * @cssproperty {color} [--c2-gantt__link__active--color=rgb(2, 101, 220)] - Links of the selected or hovered task.
 * @cssproperty {pixel} [--c2-gantt__link--width=1.25px]
 * @cssproperty {color} [--c2-gantt__today--color=#dc2626]
 * @cssproperty {pixel} [--c2-gantt__today--width=2px]
 * @cssproperty {color} [--c2-gantt__tooltip--background=#ffffff]
 * @cssproperty {color} [--c2-gantt__tooltip--color=#18181b]
 * @cssproperty {color} [--c2-gantt__tooltip--muted-color=#71717a]
 * @cssproperty {border} [--c2-gantt__tooltip--border=1px solid #d4d4d8]
 * @cssproperty {border-radius} [--c2-gantt__tooltip--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-gantt__tooltip--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {pixel} [--c2-gantt__tooltip--width=240px]
 * @cssproperty {color} [--c2-gantt__tone-success--color=#15803d]
 * @cssproperty {color} [--c2-gantt__tone-warning--color=#a16207]
 * @cssproperty {color} [--c2-gantt__tone-danger--color=#dc2626]
 * @cssproperty {color} [--c2-gantt__tone-neutral--color=#71717a]
 * @cssproperty {color} [--c2-gantt__series-1--color=#0265dc] - `tone: 1`; the eight slots match the chart palette.
 * @cssproperty {color} [--c2-gantt__series-2--color=#ea580c]
 * @cssproperty {color} [--c2-gantt__series-3--color=#0f766e]
 * @cssproperty {color} [--c2-gantt__series-4--color=#db2777]
 * @cssproperty {color} [--c2-gantt__series-5--color=#a16207]
 * @cssproperty {color} [--c2-gantt__series-6--color=#7c3aed]
 * @cssproperty {color} [--c2-gantt__series-7--color=#0891b2]
 * @cssproperty {color} [--c2-gantt__series-8--color=#52525b]
 * @cssproperty {color} [--c2-gantt__skeleton--background=#f4f4f5]
 * @cssproperty {color} [--c2-gantt__empty--color=#71717a]
 * @cssproperty {padding} [--c2-gantt__empty--padding=32px 16px]
 */
@customElement('c2-gantt')
export class Gantt extends LitElement {
  static override styles = unsafeCSS(styles)

  // Semantics live on ElementInternals, not host attributes: an attribute the element writes on itself is one the
  // server never rendered, and React reports it as a hydration mismatch. An author-set attribute still wins.
  private readonly internals = this.attachInternals()

  /**
   * The tasks, as an array or a JSON attribute. `null` (the default) reads the `c2-gantt-task` children instead;
   * an array wins over them. Assign a new array to change the data.
   */
  @property({ converter: jsonPropertyConverter }) tasks: GanttTaskConfig[] | null = null

  /** Zoom level: `day`, `week` or `month`. */
  @property({ reflect: true }) scale: GanttScale = 'week'

  /** First visible day, `YYYY-MM-DD`. Defaults to the tasks' first day, snapped to the scale. */
  @property() start?: string

  /** Last visible day, `YYYY-MM-DD`. Defaults to the tasks' last day, snapped to the scale. */
  @property() end?: string

  /** Where the today line goes: absent for the current date, a `YYYY-MM-DD` day to pin it, `false` to hide it. */
  @property() today?: string

  /** Id of the selected task. */
  @property() selected: string | null = null

  /** Ids of the closed groups, separated by `;` in the attribute. */
  @property({ converter: arrayPropertyConverter }) collapsed: string[] = []

  /** Leaves the task list out and labels the bars instead. The rows stay available to assistive technology. */
  @property({ type: Boolean, attribute: 'hide-list', reflect: true }) hideList = false

  /** `split` keeps the task list, `compact` puts each label above its bar, `auto` picks compact below 560px. */
  @property({ reflect: true }) layout: GanttLayout = 'auto'

  /** Language of the dates and of the default week start. Defaults to the page's `lang`, then the browser's. */
  @property() locale?: string

  /** First day of the week: `locale`, `monday` … `sunday`, or an ISO number (1 is Monday, 7 is Sunday). */
  @property({ attribute: 'week-start' }) weekStart = 'locale'

  /** ISO weekdays to shade, such as `6 7`. Absent follows the locale; an empty value shades nothing. */
  @property() weekend?: string

  /** Shows placeholder rows while the tasks load. */
  @property({ type: Boolean, reflect: true }) loading = false

  /** Accessible name of the chart. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Replaces the tooltip's contents. Return anything Lit renders, or `null` for no tooltip. Property only. */
  @property({ attribute: false }) renderTooltip?: (context: GanttTooltipContext) => unknown

  /** Replaces a task's text in the list. Property only. */
  @property({ attribute: false }) renderLabel?: (context: GanttLabelContext) => unknown

  @state() private hostWidth = 0
  @state() private measuredColumn = 0
  @state() private measuredRow = 0
  @state() private hoverId: string | null = null
  @state() private focusId: string | null = null
  /** The tooltip follows the focus only while the keyboard is driving. */
  @state() private keyboardFocus = false

  #model: GanttModel = normalizeTasks([])
  #modelSource: 'data' | 'markup' | null = null
  #markupDirty = true
  #elements = new Map<string, GanttTask>()
  #lastProblems = ''
  #warnedBothModes = false
  #initialScroll = false
  #formatters?: { locale: string; value: GanttFormatters }
  #observer?: MutationObserver
  #resizeObserver?: ResizeObserver
  #measureFrame = 0
  #tooltipFrame = 0
  /**
   * Upgrading over server-rendered markup. The server cannot read the task children, so it rendered an empty frame;
   * the first client render must match it or Lit's hydration throws, and the timeline fills in on the update after.
   */
  #hydrating = false

  override connectedCallback(): void {
    if (!isServer && !this.hasUpdated && this.shadowRoot?.hasChildNodes()) this.#hydrating = true
    super.connectedCallback()
    this.internals.role = 'treegrid'
    this.addEventListener(GANTT_TASK_CHANGE_EVENT, this.#onTaskChange)
    if (isServer) return
    this.#observer ??= new MutationObserver(() => this.#markChildrenDirty())
    this.#observer.observe(this, { childList: true, subtree: true, characterData: true })
    // Measure on the next frame, not in the callback: switching to the compact layout changes the probe's row height,
    // which would resize an observed element inside the same delivery and raise "ResizeObserver loop completed".
    this.#resizeObserver ??= new ResizeObserver(() => {
      cancelAnimationFrame(this.#measureFrame)
      this.#measureFrame = requestAnimationFrame(() => this.#measure())
    })
    this.#resizeObserver.observe(this)
    // Scroll events do not cross the shadow boundary, so the chart's own scroller repositions through its listener.
    addEventListener('scroll', this.#schedulePlaceTooltip, { capture: true, passive: true })
    addEventListener('resize', this.#schedulePlaceTooltip, { passive: true })
  }

  override disconnectedCallback(): void {
    this.removeEventListener(GANTT_TASK_CHANGE_EVENT, this.#onTaskChange)
    this.#observer?.disconnect()
    this.#resizeObserver?.disconnect()
    cancelAnimationFrame(this.#measureFrame)
    this.#probeObserved = false
    cancelAnimationFrame(this.#tooltipFrame)
    removeEventListener('scroll', this.#schedulePlaceTooltip, { capture: true })
    removeEventListener('resize', this.#schedulePlaceTooltip)
    super.disconnectedCallback()
  }

  #onTaskChange = (event: Event) => {
    event.stopPropagation()
    this.#markChildrenDirty()
  }

  #markChildrenDirty() {
    this.#markupDirty = true
    this.requestUpdate()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (Array.isArray(this.tasks)) {
      if (changed.has('tasks') || this.#modelSource !== 'data') this.#setModel(this.tasks, 'data')
      if (this.#markupDirty && !this.#warnedBothModes && !isServer && this.querySelector(GANTT_TASK_TAG)) {
        this.#warnedBothModes = true
        console.warn('c2-gantt: `tasks` holds an array, so the c2-gantt-task children are ignored. Set `tasks` to null to read them.')
      }
    } else if (this.#markupDirty || this.#modelSource !== 'markup') {
      this.#setModel(this.#collectMarkup(), 'markup')
    }
    this.#markupDirty = false
    this.internals.ariaBusy = this.loading ? 'true' : null
  }

  protected override updated(): void {
    if (this.#hydrating) {
      this.#hydrating = false
      void this.updateComplete.then(() => this.requestUpdate())
      // This pass rendered the server's empty frame: the one-time scroll and the probe wait for the timeline.
      return
    }
    // Measuring happens in the ResizeObserver callback, which runs after layout and outside this update; reading
    // and setting state here would schedule a second update every time.
    this.#observeProbe()
    this.#placeTooltip()
    if (!this.#initialScroll && this.#model.rows.length && !this.loading) {
      this.#initialScroll = true
      this.#scrollToDay(this.selected ? this.#model.byId.get(this.selected)?.start : this.#todayDay())
    }
  }

  /** Builds `GanttTaskConfig`s from the child elements: nesting makes the parent, wrappers are looked through. */
  #collectMarkup(): GanttTaskConfig[] {
    this.#elements.clear()
    if (isServer) return []
    const tasks: GanttTaskConfig[] = []
    const walk = (root: Element, parent?: string) => {
      for (const child of root.children) {
        if (child.localName === GANTT_TASK_TAG && typeof (child as GanttTask).toTask === 'function') {
          const element = child as GanttTask
          const task = element.toTask(parent)
          tasks.push(task)
          this.#elements.set(task.id, element)
          walk(element, task.id)
        } else if (child.localName !== 'c2-gantt') walk(child, parent)
      }
    }
    walk(this)
    return tasks
  }

  #setModel(tasks: readonly GanttTaskConfig[], source: 'data' | 'markup') {
    this.#model = normalizeTasks(tasks)
    this.#modelSource = source
    if (source === 'data') this.#elements.clear()
    const problems = this.#model.problems.join('\n- ')
    if (problems && problems !== this.#lastProblems) console.warn(`c2-gantt: some tasks were skipped or repaired:\n- ${problems}`)
    this.#lastProblems = problems
  }

  #probeObserved = false
  #observeProbe() {
    const probe = this.renderRoot.querySelector('.probe')
    if (!probe || this.#probeObserved || !this.#resizeObserver) return
    this.#probeObserved = true
    this.#resizeObserver.observe(probe)
  }

  /** Resolves the CSS column width and row height to pixels, and tracks the host width for `layout="auto"`. */
  #measure() {
    if (isServer) return
    const width = this.getBoundingClientRect().width
    if (width !== this.hostWidth) this.hostWidth = width
    const probe = this.renderRoot.querySelector('.probe')
    if (!probe) return
    const rect = probe.getBoundingClientRect()
    if (rect.width > 0 && rect.width !== this.measuredColumn) this.measuredColumn = rect.width
    if (rect.height > 0 && rect.height !== this.measuredRow) this.measuredRow = rect.height
  }

  get #compact(): boolean {
    return this.layout === 'compact' || (this.layout === 'auto' && this.hostWidth > 0 && this.hostWidth < COMPACT_BELOW)
  }

  get #scale(): GanttScale {
    return this.scale === 'day' || this.scale === 'month' ? this.scale : 'week'
  }

  get #column(): number {
    return this.measuredColumn || DEFAULT_COLUMN[this.#scale]
  }

  get #rowHeight(): number {
    return this.measuredRow || (this.#compact ? DEFAULT_COMPACT_ROW : DEFAULT_ROW)
  }

  get #locale(): string {
    if (this.locale) return this.locale
    if (isServer) return 'en'
    return this.closest('[lang]')?.getAttribute('lang') || navigator.language || 'en'
  }

  get #format(): GanttFormatters {
    const locale = this.#locale
    if (this.#formatters?.locale !== locale) this.#formatters = { locale, value: createFormatters(locale) }
    return this.#formatters.value
  }

  #todayDay(): number | null {
    const value = this.today?.trim().toLowerCase()
    if (value === 'false' || value === 'none' || value === '0') return null
    return toDay(this.today) ?? toDay(new Date())
  }

  #range(): GanttRange {
    return viewRange(this.#model.rows, this.#scale, resolveWeekStart(this.weekStart, this.#locale), toDay(this.start), toDay(this.end))
  }

  #visible(): GanttRow[] {
    return visibleRows(this.#model.rows, new Set(this.collapsed))
  }

  /* ---------------------------------------------------------------- interaction */

  #detail(id: string): GanttTaskEventDetail {
    const element = this.#elements.get(id)
    return { id, task: this.#model.byId.get(id)!.task, ...(element ? { element } : {}) }
  }

  /** A click or Enter on a task: `task-click`, then the selection unless that was cancelled. */
  #activate(id: string) {
    if (!this.#model.byId.has(id)) return
    const click = new CustomEvent('task-click', { detail: this.#detail(id), bubbles: true, composed: true, cancelable: true })
    if (!this.dispatchEvent(click) || this.selected === id) return
    this.selected = id
    const { task, element } = this.#detail(id)
    this.dispatchEvent(new CustomEvent('selection-change', { detail: { value: id, task, ...(element ? { element } : {}) } }))
  }

  #toggle(id: string, expanded?: boolean) {
    const row = this.#model.byId.get(id)
    if (!row?.group) return
    const isCollapsed = this.collapsed.includes(id)
    const nextExpanded = expanded ?? isCollapsed
    if (nextExpanded === !isCollapsed) return
    this.collapsed = nextExpanded ? this.collapsed.filter((value) => value !== id) : [...this.collapsed, id]
    // Focus never stays on a row that just disappeared.
    if (!nextExpanded && this.focusId && this.#isDescendant(this.focusId, id)) this.focusId = id
    this.dispatchEvent(new CustomEvent('group-toggle', { detail: { id, expanded: nextExpanded } }))
  }

  #isDescendant(id: string, ancestor: string): boolean {
    let cursor = this.#model.byId.get(id)?.parentId ?? null
    while (cursor !== null) {
      if (cursor === ancestor) return true
      cursor = this.#model.byId.get(cursor)?.parentId ?? null
    }
    return false
  }

  async #focusRow(id: string) {
    this.focusId = id
    await this.updateComplete
    this.renderRoot.querySelector<HTMLElement>(`.row[data-id="${CSS.escape(id)}"]`)?.focus()
    this.#scrollRowIntoView(id)
  }

  #scrollRowIntoView(id: string) {
    const row = this.#model.byId.get(id)
    const scroller = this.renderRoot.querySelector<HTMLElement>('.scroller')
    if (!row || !scroller) return
    const { start } = this.#range()
    const list = this.renderRoot.querySelector<HTMLElement>('.list')
    const listWidth = this.hideList || this.#compact ? 0 : (list?.offsetWidth ?? 0)
    const x = listWidth + (row.start - start) * this.#column
    const width = (row.end - row.start + 1) * this.#column
    const left = scroller.scrollLeft + listWidth
    const right = scroller.scrollLeft + scroller.clientWidth
    if (x < left) scroller.scrollLeft = x - listWidth - 16
    else if (x + width > right) scroller.scrollLeft = Math.min(x - listWidth - 16, x + width - scroller.clientWidth + 16)
  }

  #scrollToDay(day: number | null | undefined) {
    const scroller = this.renderRoot.querySelector<HTMLElement>('.scroller')
    if (day === null || day === undefined || !scroller || scroller.scrollWidth <= scroller.clientWidth) return
    const { start, end } = this.#range()
    if (day < start || day > end) return
    const list = this.renderRoot.querySelector<HTMLElement>('.list')
    const listWidth = this.hideList || this.#compact ? 0 : (list?.offsetWidth ?? 0)
    const visible = scroller.clientWidth - listWidth
    scroller.scrollLeft = Math.max(0, (day - start) * this.#column - visible / 3)
  }

  #onListClick = (event: MouseEvent) => {
    const target = event.target as Element
    const row = target.closest<HTMLElement>('.row')
    if (!row?.dataset.id) return
    this.keyboardFocus = false
    if (target.closest('.toggle')) {
      this.#toggle(row.dataset.id)
      void this.#focusRow(row.dataset.id)
      return
    }
    this.#activate(row.dataset.id)
    void this.#focusRow(row.dataset.id)
  }

  #onTimelineClick = (event: MouseEvent) => {
    const id = (event.target as Element).closest<HTMLElement>('[data-id]')?.dataset.id
    if (!id) return
    this.keyboardFocus = false
    this.#activate(id)
    void this.#focusRow(id)
  }

  #onTimelineOver = (event: PointerEvent) => {
    const id = (event.target as Element).closest<HTMLElement>('[data-id]')?.dataset.id ?? null
    this.#setHover(id)
  }

  #onTimelineLeave = () => this.#setHover(null)

  #setHover(id: string | null) {
    if (id === this.hoverId) return
    this.hoverId = id
    this.dispatchEvent(new CustomEvent('task-hover', { detail: { id, task: id ? (this.#model.byId.get(id)?.task ?? null) : null } }))
  }

  #onKeydown = (event: KeyboardEvent) => {
    const rows = this.#visible()
    const current = rows.findIndex((row) => row.id === this.#currentFocus(rows))
    const row = rows[current]
    if (!row) return
    let next: GanttRow | undefined
    switch (event.key) {
      case 'ArrowDown':
        next = rows[Math.min(rows.length - 1, current + 1)]
        break
      case 'ArrowUp':
        next = rows[Math.max(0, current - 1)]
        break
      case 'Home':
        next = rows[0]
        break
      case 'End':
        next = rows[rows.length - 1]
        break
      case 'ArrowRight':
        if (row.group && this.collapsed.includes(row.id)) this.#toggle(row.id, true)
        else if (row.group) next = rows[current + 1]
        break
      case 'ArrowLeft':
        if (row.group && !this.collapsed.includes(row.id)) this.#toggle(row.id, false)
        else if (row.parentId) next = this.#model.byId.get(row.parentId)
        break
      case 'Enter':
      case ' ':
        this.#activate(row.id)
        break
      default:
        return
    }
    event.preventDefault()
    this.keyboardFocus = true
    if (next) void this.#focusRow(next.id)
  }

  #onFocusOut = (event: FocusEvent) => {
    if (!(event.relatedTarget instanceof Node && this.renderRoot.contains(event.relatedTarget))) this.keyboardFocus = false
  }

  /** The row holding the roving tabindex: the focused one, else the selected one, else the first. */
  #currentFocus(rows: readonly GanttRow[]): string | null {
    const ids = new Set(rows.map((row) => row.id))
    if (this.focusId && ids.has(this.focusId)) return this.focusId
    if (this.selected && ids.has(this.selected)) return this.selected
    return rows[0]?.id ?? null
  }

  /* ---------------------------------------------------------------- rendering */

  #days(row: GanttRow): number {
    return row.end - row.start + 1
  }

  #describe(row: GanttRow): string {
    const format = this.#format
    const date = (day: number) => format.date.format(fromDay(day))
    const days = this.#days(row)
    const parts = [row.label]
    if (row.milestone) parts.push(`milestone, ${date(row.start)}`)
    else parts.push(`${date(row.start)} to ${date(row.end)}`, `${days} ${days === 1 ? 'day' : 'days'}`)
    if (!row.group && !row.milestone && row.progress > 0) parts.push(`${Math.round(row.progress * 100)}% complete`)
    const after = row.dependencies.map((id) => this.#model.byId.get(id)?.label).filter(Boolean)
    if (after.length) parts.push(`after ${after.join(', ')}`)
    return parts.join(', ')
  }

  #renderList(rows: readonly GanttRow[]) {
    const focus = this.#currentFocus(rows)
    return html`<div class="list" role="rowgroup" @click=${this.#onListClick} @keydown=${this.#onKeydown} @focusout=${this.#onFocusOut}>
      ${repeat(
        rows,
        (row) => row.id,
        (row) => {
          const label = this.renderLabel ? this.renderLabel({ id: row.id, task: row.task, depth: row.depth, group: row.group }) : row.label
          return html`<div
            class=${classMap({ row: true, group: row.group, selected: row.id === this.selected })}
            part="row"
            role="row"
            data-id=${row.id}
            tabindex=${row.id === focus ? 0 : -1}
            aria-level=${row.depth + 1}
            aria-expanded=${row.group ? String(!this.collapsed.includes(row.id)) : nothing}
            aria-selected=${String(row.id === this.selected)}
            aria-label=${this.#describe(row)}
            style=${styleMap({ '--_depth': String(row.depth) })}
            @pointerenter=${() => this.#setHover(row.id)}
            @pointerleave=${() => this.#setHover(null)}
          >
            <div class="cell-name" role="gridcell">
              ${row.group ? html`<span class="toggle" aria-hidden="true">${chevron}</span>` : html`<span class="toggle" aria-hidden="true"></span>`}
              <span class="label">${label}</span>
            </div>
            <div class="cell-days" role="gridcell">${row.milestone ? '◆' : this.#days(row)}</div>
          </div>`
        },
      )}
    </div>`
  }

  #renderScale(range: GanttRange, width: number) {
    const column = this.#column
    const format = this.#format
    const ticks = scaleTicks(range, this.#scale, resolveWeekStart(this.weekStart, this.#locale), [], format)
    const today = this.#todayDay()
    const x = (day: number) => (day - range.start) * column
    return html`<div class="scale" style=${styleMap({ width: `${width}px` })}>
      ${ticks.major.map((tick) => {
        const tickWidth = (tick.end - tick.start + 1) * column
        return html`<div class="tick major" style=${styleMap({ left: `${x(tick.start)}px`, width: `${tickWidth}px` })}>
          ${tickWidth > tick.label.length * 7.5 + 16 ? tick.label : tick.short}
        </div>`
      })}
      ${ticks.minor.map((tick) => {
        const tickWidth = (tick.end - tick.start + 1) * column
        const isToday = this.#scale === 'day' && today === tick.start
        return html`<div
          class=${classMap({ tick: true, minor: true, today: isToday })}
          style=${styleMap({ left: `${x(tick.start)}px`, width: `${tickWidth}px` })}
        >
          ${tickWidth > tick.label.length * 7 + 8 ? tick.label : tickWidth > tick.short.length * 7 + 4 ? tick.short : ''}
        </div>`
      })}
    </div>`
  }

  #renderTimeline(rows: readonly GanttRow[], range: GanttRange, width: number) {
    const column = this.#column
    const rowHeight = this.#rowHeight
    const compact = this.#compact
    const height = rows.length * rowHeight
    const format = this.#format
    const locale = this.#locale
    const ticks = scaleTicks(range, this.#scale, resolveWeekStart(this.weekStart, locale), resolveWeekend(this.weekend, locale), format)
    const x = (day: number) => (day - range.start) * column
    const index = new Map(rows.map((row, i) => [row.id, i]))
    const centre = (i: number) => i * rowHeight + (compact ? LABEL_LINE + (rowHeight - LABEL_LINE) / 2 : rowHeight / 2)
    const today = this.#todayDay()
    const active = this.hoverId ?? this.selected
    const charWidth = 6.6
    const shortDate = (day: number) => `${format.day.format(fromDay(day))} ${format.month.format(fromDay(day))}`

    const links: TemplateResult[] = []
    for (const row of rows) {
      for (const id of row.dependencies) {
        const from = this.#model.byId.get(id)
        if (!from || !index.has(id)) continue
        const x1 = from.milestone ? x(from.start) + column / 2 + MILESTONE_HALF : x(from.end + 1)
        const x2 = row.milestone ? x(row.start) + column / 2 - MILESTONE_HALF - 1 : x(row.start)
        const y1 = centre(index.get(id)!)
        const y2 = centre(index.get(row.id)!)
        const on = active === row.id || active === id
        links.push(
          svg`<path part="link" class=${on ? 'active' : ''} d=${linkPath(x1, y1, x2 - 1, y2, rowHeight)}></path>
            <path class=${on ? 'head active' : 'head'} d=${`M${x2 - 6} ${y2 - 4}L${x2} ${y2}L${x2 - 6} ${y2 + 4}Z`}></path>`,
        )
      }
    }

    const tipId = this.hoverId ?? (this.keyboardFocus ? this.focusId : null)

    return html`<div
        class="timeline"
        aria-hidden="true"
        style=${styleMap({ width: `${width}px`, height: `${height}px` })}
        @click=${this.#onTimelineClick}
        @pointerover=${this.#onTimelineOver}
        @pointerleave=${this.#onTimelineLeave}
      >
        ${ticks.weekend.map((day) => html`<div class="weekend" style=${styleMap({ left: `${x(day)}px`, width: `${column}px` })}></div>`)}
        ${ticks.minor.map((tick) => html`<div class="line" style=${styleMap({ left: `${x(tick.start)}px` })}></div>`)}
        ${repeat(
          rows,
          (row) => row.id,
          (row) => {
            const left = x(row.start)
            const barWidth = this.#days(row) * column
            const toneClass = row.tone !== undefined && row.tone !== 'primary' ? `tone-${row.tone}` : ''
            const selected = row.id === this.selected
            let mark: TemplateResult
            let beside: TemplateResult | typeof nothing = nothing
            if (row.group) {
              mark = html`<div class="summary" part="summary" data-id=${row.id} style=${styleMap({ left: `${left}px`, width: `${barWidth}px` })}></div>`
              if (this.hideList && !compact) beside = html`<div class="outside" style=${styleMap({ left: `${left + barWidth + 8}px` })}>${row.label}</div>`
            } else if (row.milestone) {
              const at = left + column / 2
              mark = html`<div
                class=${classMap({ milestone: true, selected, [toneClass]: !!toneClass })}
                part="milestone"
                data-id=${row.id}
                style=${styleMap({ left: `${at}px` })}
              ></div>`
              if (!compact) {
                const text = `${row.label} · ${shortDate(row.start)}`
                const pos = at + 14 + text.length * charWidth > width ? { right: `${width - at + 14}px` } : { left: `${at + 14}px` }
                beside = html`<div class="outside" style=${styleMap(pos)}>${text}</div>`
              }
            } else {
              const fits = !compact && row.label.length * charWidth + 18 <= barWidth
              mark = html`<div
                class=${classMap({ bar: true, selected, hover: row.id === this.hoverId, [toneClass]: !!toneClass })}
                part="bar"
                data-id=${row.id}
                style=${styleMap({ left: `${left}px`, width: `${barWidth}px` })}
              >
                <div class="progress" part="progress" style=${styleMap({ width: `${Math.round(row.progress * 100)}%` })}></div>
                ${fits ? html`<span class="bar-label">${row.label}</span>` : nothing}
              </div>`
              if (!fits && !compact) {
                const after = left + barWidth + 8
                const pos = after + row.label.length * charWidth > width ? { right: `${width - left + 8}px` } : { left: `${after}px` }
                beside = html`<div class="outside" style=${styleMap(pos)}>${row.label}</div>`
              }
            }
            const above = compact
              ? html`<div
                  class="above"
                  style=${styleMap({ left: `${Math.max(4, Math.min(left, width - 180))}px`, maxWidth: `${Math.max(60, width - Math.max(4, Math.min(left, width - 180)) - 4)}px` })}
                >
                  ${row.label}<span class="dates">${row.milestone ? shortDate(row.start) : `${shortDate(row.start)} – ${shortDate(row.end)}`}</span>
                </div>`
              : nothing
            return html`<div class=${classMap({ track: true, selected, hover: row.id === this.hoverId })}>${above}${mark}${beside}</div>`
          },
        )}
        <svg class="links" width=${width} height=${height}>${links}</svg>
        ${
          today !== null && today >= range.start && today <= range.end
            ? html`<div class="today" part="today" style=${styleMap({ left: `${x(today) + column / 2}px` })}></div>`
            : nothing
        }
      </div>
      ${tipId && index.has(tipId) ? this.#renderTooltipFor(this.#model.byId.get(tipId)!) : nothing}`
  }

  #renderTooltipFor(row: GanttRow) {
    const context: GanttTooltipContext = {
      id: row.id,
      task: row.task,
      start: isoDay(row.start),
      end: isoDay(row.end),
      days: this.#days(row),
      progress: row.progress,
      milestone: row.milestone,
      group: row.group,
      dependencies: row.dependencies.map((id) => this.#model.byId.get(id)!.task),
    }
    const content = this.renderTooltip ? this.renderTooltip(context) : this.#defaultTooltip(row)
    if (content === null || content === undefined || content === nothing) return nothing
    // A top-layer popover, so neither the chart's scroller nor its rounded frame clips it; `#placeTooltip` positions it.
    return html`<div class="tooltip" part="tooltip" popover="manual" data-for=${row.id}>${content}</div>`
  }

  /**
   * Shows the tooltip and puts it under its row (above when the viewport has no room below), starting a little into
   * the bar and kept inside the visible part of the timeline. Fixed coordinates: the popover lives in the top layer.
   */
  #placeTooltip() {
    // Hover and keyboard focus are the only ways in, so no tooltip state means nothing to query.
    if (isServer || !(this.hoverId ?? (this.keyboardFocus ? this.focusId : null))) return
    const tip = this.renderRoot.querySelector<HTMLElement>('.tooltip')
    const id = tip?.dataset.for
    const mark = id ? this.renderRoot.querySelector<HTMLElement>(`.timeline [data-id="${CSS.escape(id)}"]`) : null
    const track = mark?.closest<HTMLElement>('.track')
    const scroller = this.renderRoot.querySelector<HTMLElement>('.scroller')
    // Without the popover API the tooltip stays hidden by the stylesheet, and `:popover-open` would not even parse.
    if (!tip || !mark || !track || !scroller || typeof tip.showPopover !== 'function') return
    if (!tip.matches(':popover-open')) {
      try {
        tip.showPopover()
      } catch {
        return
      }
    }
    const bar = mark.getBoundingClientRect()
    const row = track.getBoundingClientRect()
    const view = scroller.getBoundingClientRect()
    const list = this.renderRoot.querySelector<HTMLElement>('.list')
    const listWidth = this.hideList || this.#compact ? 0 : (list?.offsetWidth ?? 0)
    const { width, height } = tip.getBoundingClientRect()
    const maxLeft = Math.min(innerWidth, view.left + scroller.clientWidth) - width - TOOLTIP_GAP
    // When the visible timeline is narrower than the tooltip, it overlaps the list rather than run past the right edge.
    const minLeft = Math.max(TOOLTIP_GAP, Math.min(view.left + listWidth + TOOLTIP_GAP, maxLeft))
    const left = Math.max(minLeft, Math.min(bar.left + Math.min(bar.width, 40), maxLeft))
    const roomBelow = innerHeight - row.bottom
    const top = roomBelow >= height + TOOLTIP_GAP || roomBelow >= row.top ? row.bottom + TOOLTIP_GAP : row.top - height - TOOLTIP_GAP
    tip.style.left = `${Math.round(left)}px`
    tip.style.top = `${Math.round(top)}px`
  }

  /** Scroll and resize fire in bursts; one placement per frame is enough. */
  #schedulePlaceTooltip = () => {
    cancelAnimationFrame(this.#tooltipFrame)
    this.#tooltipFrame = requestAnimationFrame(() => this.#placeTooltip())
  }

  #defaultTooltip(row: GanttRow) {
    const format = this.#format
    const date = (day: number) => format.date.format(fromDay(day))
    const after = row.dependencies.map((id) => this.#model.byId.get(id)?.label).filter(Boolean)
    const days = this.#days(row)
    return html`<div class="tooltip-title">${row.label}</div>
      <dl>
        ${
          row.milestone
            ? html`<dt>Date</dt>
                <dd>${date(row.start)}</dd>`
            : html`<dt>Dates</dt>
                <dd>${date(row.start)} – ${date(row.end)}</dd>
                <dt>Length</dt>
                <dd>${days} ${days === 1 ? 'day' : 'days'}</dd>`
        }
        ${
          after.length
            ? html`<dt>After</dt>
                <dd>${after.join(', ')}</dd>`
            : nothing
        }
        ${
          !row.group && !row.milestone
            ? html`<dt>Done</dt>
                <dd>${Math.round(row.progress * 100)}%</dd>`
            : nothing
        }
      </dl>`
  }

  #renderSkeleton() {
    const widths: Array<[number, number, number]> = [
      [110, 30, 120],
      [80, 110, 70],
      [130, 60, 150],
      [95, 140, 90],
      [70, 190, 60],
    ]
    return html`<div class="skeleton" aria-hidden="true">
      ${widths.map(
        ([label, offset, bar]) =>
          html`<div class="skeleton-row">
            <span style=${styleMap({ width: `${label}px` })}></span><span style=${styleMap({ width: `${bar}px`, marginLeft: `${offset}px` })}></span>
          </div>`,
      )}
    </div>`
  }

  override render() {
    const compact = this.#compact
    const classes = { gantt: true, [`scale-${this.#scale}`]: true, compact, 'no-list': this.hideList || compact }
    let body: unknown
    if (this.loading) body = this.#renderSkeleton()
    // A server cannot read the children, so markup mode renders an empty frame there and fills in on upgrade, after
    // the hydrating render has matched that frame.
    else if ((isServer || this.#hydrating) && this.#modelSource === 'markup') body = nothing
    else if (!this.#model.rows.length) body = html`<div class="empty" part="empty"><slot name="empty">No tasks to show</slot></div>`
    else {
      const rows = this.#visible()
      const range = this.#range()
      const width = (range.end - range.start + 1) * this.#column
      body = html`<div class="scroller" part="scroller" @scroll=${this.#schedulePlaceTooltip}>
        <div class="content" style=${styleMap({ width: `calc(var(--_list) + ${width}px)` })}>
          <div class="head" aria-hidden="true">
            <div class="corner">
              <span class="corner-name"><slot name="list-header">Task</slot></span>
              <span class="corner-days"><slot name="duration-header">Days</slot></span>
            </div>
            ${this.#renderScale(range, width)}
          </div>
          <div class="body">${this.#renderList(rows)} ${this.#renderTimeline(rows, range, width)}</div>
        </div>
      </div>`
    }
    return html`<div class=${classMap(classes)} part="base">
      <div class="probe" aria-hidden="true"></div>
      ${body}
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-gantt': Gantt
  }
}
