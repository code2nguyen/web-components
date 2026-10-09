/** A semantic tone, or a slot of the categorical palette shared with the charts (`1` to `8`). */
export type StateTimelineTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/**
 * A point in time: milliseconds since the epoch, an ISO 8601 string (`2026-10-08T09:30:00Z`) or a `Date`. A string
 * without a time zone is read in the browser's local time, as `Date.parse` does.
 */
export type StateTimelineTime = number | string | Date

/** How one discrete value is shown: its name in the legend and tooltip, and its colour. */
export interface StateTimelineState {
  /** The value segments carry in `state`. Numbers and booleans are matched by their text (`1` matches `'1'`). */
  value: string | number | boolean
  /** Shown in segments, the legend and the tooltip. Defaults to the value. */
  label?: string
  /** Colour of the state. States without one take the next unused palette slot, in order of appearance. */
  tone?: StateTimelineTone
  /**
   * The normal state (operational, passing, on). It is drawn as a quiet wash with no text, while every other state is
   * a solid, labelled fill, and each band's summary counts the time spent outside it. Mark at most one state.
   */
  baseline?: boolean
}

/** An event drawn as a pin above the bands: a deploy, a failover, an incident. */
export interface StateTimelineMarker {
  time: StateTimelineTime
  label: string
}

/** One stretch of time during which a series held a single state. */
export interface StateTimelineSegment {
  start: StateTimelineTime
  /**
   * Omitted means "until the next segment starts", and for a series' last segment "until the end of the timeline":
   * a list of state changes needs no ends at all.
   */
  end?: StateTimelineTime
  /** The state's value. `null` marks a stretch with no data, drawn as an empty segment. */
  state: string | number | boolean | null
  /** Anything else is carried through to events and `renderTooltip` untouched. */
  [key: string]: unknown
}

/** One band of the timeline: a service, a host, a pipeline. */
export interface StateTimelineSeries {
  /** Stable key, passed back in events. Defaults to the series' index. */
  id?: string
  label: string
  segments: StateTimelineSegment[]
  [key: string]: unknown
}

/** What `segment-click`, `segment-hover` and `renderTooltip` receive about a segment. Times are milliseconds. */
export interface StateTimelineSegmentContext {
  series: StateTimelineSeries
  seriesIndex: number
  /** The segment as it was given. */
  segment: StateTimelineSegment
  segmentIndex: number
  /** The state's value as text, or `null` for a stretch with no data. */
  state: string | null
  /** The state's label, or "No data". */
  label: string
  start: number
  end: number
  /** `end - start`, in milliseconds. */
  duration: number
}

/** One band at a moment: its series and the segment holding that time, if any. */
export interface StateTimelineMomentRow {
  series: StateTimelineSeries
  seriesIndex: number
  segment: StateTimelineSegmentContext | null
}

/** What `renderTooltip` receives: one moment across every band. */
export interface StateTimelineMomentContext {
  /** The moment, in milliseconds. */
  time: number
  rows: StateTimelineMomentRow[]
  /** The segment under the pointer or keyboard focus, when there is one. */
  focus: StateTimelineSegmentContext | null
}

/** Detail of `segment-click`. */
export type StateTimelineSegmentEventDetail = StateTimelineSegmentContext

/** Detail of `segment-hover`: the segment under the pointer, or `null` when the pointer leaves the segments. */
export interface StateTimelineSegmentHoverEventDetail {
  segment: StateTimelineSegmentContext | null
}
