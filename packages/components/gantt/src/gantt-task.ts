import { LitElement, css, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { GanttTaskConfig, GanttTone } from './gantt-types.js'

/** Fired at the parent chart whenever a task definition changes. Not public API. */
export const GANTT_TASK_CHANGE_EVENT = 'c2-gantt-task-change'

export const GANTT_TASK_TAG = 'c2-gantt-task'

let generated = 0

/** Elements whose text is never a label: a framework's bootstrap script inside an island, a style block. */
const IGNORED_TEXT = new Set(['script', 'style', 'template'])

/**
 * One task of a `c2-gantt`, declared in markup. The element renders nothing: it is a definition the chart reads,
 * the way `c2-chart-series` is for a chart. A task nested inside another task is that task's child, so the
 * markup is the tree:
 *
 * ```html
 * <c2-gantt>
 *   <c2-gantt-task task-id="design" label="Design">
 *     <c2-gantt-task task-id="ia" start="2026-09-28" end="2026-10-02">Information architecture</c2-gantt-task>
 *     <c2-gantt-task start="2026-10-05" end="2026-10-16" dependencies="ia">Visual design</c2-gantt-task>
 *   </c2-gantt-task>
 * </c2-gantt>
 * ```
 *
 * The label is the `label` attribute, or the element's own text when there is none. Wrapper elements between
 * tasks (an Astro island, a template's container) are looked through.
 *
 * @tag c2-gantt-task
 */
@customElement('c2-gantt-task')
export class GanttTask extends LitElement {
  static override styles = css`
    :host {
      display: none;
    }
  `

  /** Id other tasks name in `dependencies`. Falls back to the element's `id`, then to a generated key. */
  @property({ attribute: 'task-id' }) taskId?: string

  /** Text in the task list, the bar and the tooltip. Falls back to the element's own text. */
  @property() label?: string

  /** First day, `YYYY-MM-DD`. Ignored on a task with children, whose span is theirs. */
  @property() start?: string

  /** Last day, `YYYY-MM-DD`, inclusive. Omitted means a one-day task. */
  @property() end?: string

  /** Share of the work done, from 0 to 1. */
  @property({ type: Number }) progress?: number

  /** Draws the task as a diamond on its `start` day. */
  @property({ type: Boolean }) milestone = false

  /** Ids of the tasks that must finish first, separated by spaces. */
  @property() dependencies?: string

  /** `primary`, `success`, `warning`, `danger`, `neutral`, or a palette slot from `1` to `8`. */
  @property() tone?: string

  readonly #fallbackId = `c2-gantt-task-${++generated}`

  /** The id the chart knows this task by. */
  get resolvedId(): string {
    return this.taskId || this.id || this.#fallbackId
  }

  /** This element's own text, leaving out the text of nested tasks. */
  get #ownText(): string {
    let text = ''
    for (const node of this.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? ''
      else if (node instanceof Element && !IGNORED_TEXT.has(node.localName) && !node.matches(GANTT_TASK_TAG) && !node.querySelector(GANTT_TASK_TAG))
        text += node.textContent ?? ''
    }
    return text.replace(/\s+/g, ' ').trim()
  }

  /** A plain snapshot of this definition, so the chart never holds on to the element. */
  toTask(parent?: string): GanttTaskConfig {
    const tone = this.tone && /^[1-8]$/.test(this.tone) ? (Number(this.tone) as GanttTone) : (this.tone as GanttTone | undefined)
    return {
      id: this.resolvedId,
      label: this.label ?? this.#ownText,
      start: this.start,
      end: this.end,
      progress: this.progress,
      milestone: this.milestone,
      dependencies: this.dependencies,
      tone,
      parent,
    }
  }

  protected override updated(_changed: PropertyValues): void {
    // Composed so it reaches a chart that wraps its children in a shadow root of its own; the chart stops it.
    this.dispatchEvent(new CustomEvent(GANTT_TASK_CHANGE_EVENT, { bubbles: true, composed: true }))
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-gantt-task': GanttTask
  }
}
