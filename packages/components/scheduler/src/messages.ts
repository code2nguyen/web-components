import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The grid's accessible name when the scheduler has no `label`. */
  schedule: 'Schedule',
  /** The header of the resource column when `resource-heading` is not set. */
  resources: 'Resources',
  /** The view switch and its options. */
  view: 'View',
  day: 'Day',
  week: 'Week',
  month: 'Month',
  today: 'Today',
  previousDay: 'Previous day',
  nextDay: 'Next day',
  previousWeek: 'Previous week',
  nextWeek: 'Next week',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  /** A group row: `{0}` is the group, `{1}` how many resources it holds. */
  group: (group: string, count: number) => `${group} · ${count}`,
  /** A time range: `{0}` and `{1}` are its two ends. */
  range: (from: string, to: string) => `${from} to ${to}`,
  /** A bar's accessible name: `{0}` is its title, `{1}` the resource, `{2}` its time range. */
  event: (title: string, resource: string, time: string) => `${title}, ${resource}, ${time}`,
  /** Added to a bar's name when it cannot be moved. */
  readonly: 'read-only',
  /** Added to a bar's name when it is `pending` (a request still to approve). */
  pending: 'pending',
  /** The slot under the keyboard cursor over `bands`: `{0}` is the slot, `{1}` their labels. */
  slotBands: (slot: string, labels: string) => `${slot}, ${labels}`,
  /** The header of the summary row when `summary-heading` is not set. */
  summary: 'Summary',
  /** The slot under the keyboard cursor: `{0}` is the resource, `{1}` the time range. */
  slot: (resource: string, time: string) => `${resource}, ${time}`,
  /** A slot under the keyboard cursor that holds bookings (Enter focuses the first): `{0}` is the slot, `{1}` their titles. */
  slotBookings: (slot: string, titles: string) => `${slot}, booked: ${titles}`,
  /** Announced when a bar is moved from the keyboard: `{0}` is its title, `{1}` the resource, `{2}` the new time range. */
  moved: (title: string, resource: string, time: string) => `${title} moved to ${resource}, ${time}`,
  /** Announced when a range is picked to add a booking: `{0}` is the resource, `{1}` the time range. */
  selected: (resource: string, time: string) => `New booking for ${resource}, ${time}`,
  /** Announced when Escape cancels a drag. */
  cancelled: 'Move cancelled',
  /** The line that marks the current time. */
  now: 'Now',
}

export const schedulerMessages = defineMessages('scheduler', en)
