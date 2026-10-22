import { defineMessages } from '@c2n/core/localize.js'

const en = {
  trigger: 'Time range',
  dialog: 'Choose a time range',
  shiftBack: 'Earlier',
  shiftForward: 'Later',
  zoomOut: 'Zoom out',
  refresh: 'Refresh now',
  refreshInterval: 'Auto-refresh',
  refreshOff: 'Off',
  absoluteRange: 'Absolute range',
  from: 'From',
  to: 'To',
  apply: 'Apply range',
  calendar: 'Choose days',
  hint: 'Type now-7d, now/d or a date, or pick two days.',
  invalidTime: 'Not a date, time or now expression',
  endBeforeStart: 'The end must be after the start',
  quickRanges: 'Quick ranges',
  search: 'Search quick ranges',
  noMatch: 'No matching range',
  recent: 'Recently used',
  last: (span: string) => `Last ${span}`,
  today: 'Today so far',
  yesterday: 'Yesterday',
  thisWeek: 'This week so far',
  previousWeek: 'Previous week',
  thisMonth: 'This month so far',
  timeZone: 'Time zone',
  browserZone: (zone: string) => `Browser · ${zone}`,
}

/** The time range picker's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const timeRangePickerMessages = defineMessages('time-range-picker', en)
