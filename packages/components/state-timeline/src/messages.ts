import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the timeline when it has no `aria-label`. */
  label: 'State timeline',
  /** The state of a stretch with no data. */
  noData: 'No data',
  /** A segment's accessible name: its state, its time range and its duration. */
  segment: (state: string, range: string, duration: string) => `${state}, ${range}, ${duration}`,
  /** A segment's accessible name prefixed with its series' label. */
  inSeries: (series: string, segment: string) => `${series}: ${segment}`,
  /** Read after a band's label: its current state. */
  now: (state: string) => `now ${state}`,
  /** Read after a band's label: its time outside the baseline state. */
  outside: (duration: string, baseline: string) => `${duration} outside ${baseline}`,
  /** The duration above when the band never left the baseline. */
  noTime: 'no time',
  /** Tooltip: how long the hovered exception still lasts. */
  left: (duration: string) => `${duration} left`,
}

/** The state timeline's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const stateTimelineMessages = defineMessages('state-timeline', en)
