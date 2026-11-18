// The interaction of `paint`: pointer strokes, the keyboard cursor and `copyDay()`. The planner loads this module the
// first time `paint` is set (or `copyDay()` is called), so a planner that is never painted pays only for drawing the
// ranges.
import type { WeekPlanner, WeekPlannerDay, WeekPlannerRange, WeekPlannerRangesChangeDetail } from './week-planner.js'
import { DAYS, cellEnd, cellStart, clamp, columnAt, paintSpans, rangeOf, scheduleOf, valueAt, type Paint } from './week-time.js'

/** What the painter reads from the planner as last rendered. */
export interface PaintLayout {
  /** The weekday (`Date#getDay`) of each day column, in order. */
  columns: { weekday: number }[]
  firstHour: number
  lastHour: number
  snap: number
  /** Minutes since midnight at a pointer's height in a day column, snapped down to `snap`. */
  minutesAt(day: Element, clientY: number): number
}

/** A cell of the grid: a day column and the minute it starts at. */
export interface PaintCell {
  column: number
  from: number
}

/**
 * How long a fired change is awaited in `ranges`, in milliseconds: an app that rejects a change never assigns it, and
 * the planner then goes back to what `ranges` holds.
 */
const PENDING_MS = 1000

// The ranges of a painted schedule, from Monday to Sunday.
function rangesOf(paint: Paint): WeekPlannerRange[] {
  return [1, 2, 3, 4, 5, 6, 0].flatMap((weekday) => paint[weekday].map((span) => rangeOf(span, weekday)))
}

export function createPainter(host: WeekPlanner, layout: () => PaintLayout) {
  let stroke: { pointerId: number; base: Paint; start: PaintCell; end: PaintCell; erase: boolean } | undefined
  // Whether Shift+Arrow clears rather than paints, decided by the cell the run started on.
  let erasing: boolean | undefined
  // The changes fired and not yet seen back in `ranges`: `from` is what `ranges` held before the first, `awaiting` each
  // one's ranges as JSON and `after` the last one's schedule. The next change builds on `after` until the app has
  // applied the last change, so keys pressed (or a stroke made) faster than the app updates `ranges` lose no step.
  let pending: { from: WeekPlannerRange[]; awaiting: string[]; after: Paint; at: number } | undefined
  const doc = host.ownerDocument
  // The schedule the next change builds on.
  const base = (): Paint => {
    const { ranges } = host
    if (pending && performance.now() - pending.at < PENDING_MS) {
      if (ranges === pending.from) return pending.after
      // The app has applied an earlier change but not the last one yet.
      const applied = pending.awaiting.indexOf(JSON.stringify(rangesOf(scheduleOf(ranges))))
      if (applied >= 0 && applied < pending.awaiting.length - 1) return pending.after
    }
    pending = undefined
    return scheduleOf(ranges)
  }
  // A removed `paint-value` attribute leaves null, a framework may leave undefined: both paint ranges without a value.
  const brush = () => host.paintValue ?? ''
  const isPainted = (paint: Paint, cell: PaintCell) => valueAt(paint[layout().columns[cell.column]?.weekday ?? 0], cell.from) === brush()

  // The schedule with the rectangle between two cells (inclusive) painted with `paint-value` or cleared.
  const paintRect = (paint: Paint, a: PaintCell, b: PaintCell, erase: boolean) => {
    const { columns, snap } = layout()
    const weekdays = columns.slice(Math.min(a.column, b.column), Math.max(a.column, b.column) + 1).map((column) => column.weekday)
    return paintSpans(paint, weekdays, Math.min(a.from, b.from), cellEnd(Math.max(a.from, b.from), snap), erase ? null : brush())
  }

  const fire = (before: Paint, after: Paint) => {
    const ranges = rangesOf(after)
    const json = JSON.stringify(ranges)
    if (json === JSON.stringify(rangesOf(before))) return
    pending = { from: pending?.from ?? host.ranges, awaiting: [...(pending?.awaiting ?? []), json], after, at: performance.now() }
    host.dispatchEvent(new CustomEvent<WeekPlannerRangesChangeDetail>('ranges-change', { detail: { ranges }, bubbles: true, composed: true }))
  }

  const cellAt = (event: PointerEvent): PaintCell => {
    const days = [...host.renderRoot.querySelectorAll<HTMLElement>('.day')]
    const column = columnAt(days, event.clientX)
    return { column, from: layout().minutesAt(days[column], event.clientY) }
  }

  const prevent = (event: Event) => event.preventDefault()
  const follow = (event: PointerEvent) => {
    if (!stroke || event.pointerId !== stroke.pointerId) return
    const end = cellAt(event)
    if (end.column === stroke.end.column && end.from === stroke.end.from) return
    stroke.end = end
    painter.preview = paintRect(stroke.base, stroke.start, end, stroke.erase)
    host.requestUpdate()
  }
  const release = (event: PointerEvent) => {
    if (!stroke || event.pointerId !== stroke.pointerId) return
    const { base: before, start, erase } = stroke
    // The release point ends the stroke: an engine may coalesce or drop the last move before it.
    const end = event.type === 'pointerup' ? cellAt(event) : stroke.end
    painter.stop()
    // Applied to the schedule the stroke showed its preview on.
    if (event.type === 'pointerup') fire(before, paintRect(before, start, end, erase))
  }
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    painter.stop()
  }
  const listeners = [
    ['pointermove', follow],
    ['pointerup', release],
    ['pointercancel', release],
    // A native drag or text selection started under the pointer would cancel it (WebKit drags selected text).
    ['dragstart', prevent],
    ['selectstart', prevent],
    ['keydown', escape],
  ] as [string, EventListener][]

  const painter = {
    /** The schedule a stroke in progress would make, drawn in place of `ranges`. */
    preview: undefined as Paint | undefined,
    /** The keyboard's cursor cell, once it has moved. */
    cursor: undefined as PaintCell | undefined,

    /** A press on a day column starts a stroke; the document follows the pointer until it is released. */
    start(event: PointerEvent) {
      if (event.button !== 0 || !event.isPrimary || stroke) return
      const start = cellAt(event)
      const before = base()
      const erase = isPainted(before, start)
      stroke = { pointerId: event.pointerId, base: before, start, end: start, erase }
      painter.preview = paintRect(before, start, start, erase)
      for (const [type, listener] of listeners) doc.addEventListener(type, listener, true)
      doc.getSelection()?.removeAllRanges()
      host.requestUpdate()
    },

    /** Ends a stroke without a change. */
    stop() {
      stroke = undefined
      painter.preview = undefined
      for (const [type, listener] of listeners) doc.removeEventListener(type, listener, true)
      host.requestUpdate()
    },

    /** Arrows move the cursor; Space or Enter paints or clears its cell; Shift+Arrow paints the cells it crosses. */
    key(event: KeyboardEvent, cell: PaintCell) {
      const { key } = event
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const before = base()
      if (key === ' ' || key === 'Enter') {
        event.preventDefault()
        // A held key would toggle the cell back and forth.
        if (event.repeat) return
        erasing = isPainted(before, cell)
        fire(before, paintRect(before, cell, cell, erasing))
        return
      }
      const { columns, firstHour, lastHour, snap } = layout()
      const step = ({ ArrowUp: [0, -snap], ArrowDown: [0, snap], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, number[]>)[key]
      if (!step) return
      event.preventDefault()
      const next = {
        column: clamp(cell.column + step[0], 0, columns.length - 1),
        from: cellStart(cell.from + step[1], snap, firstHour, lastHour),
      }
      if (event.shiftKey) {
        erasing ??= isPainted(before, cell)
        fire(before, paintRect(before, cell, next, erasing))
      } else erasing = undefined
      painter.cursor = next
      host.requestUpdate()
      // On a narrow strip the cursor's day may be scrolled out of view.
      void host.updateComplete.then(() => host.renderRoot.querySelector('.cursor')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
    },

    copyDay(source: WeekPlannerDay, targets: WeekPlannerDay[]) {
      const index = DAYS.indexOf(source)
      if (index < 0) return
      const before = base()
      const spans = before[index]
      fire(
        before,
        before.map((day, weekday) => (targets.includes(DAYS[weekday]) ? spans : day)),
      )
    },
  }
  return painter
}

export type Painter = ReturnType<typeof createPainter>
