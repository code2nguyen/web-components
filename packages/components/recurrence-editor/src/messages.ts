import { defineMessages } from '@c2n/core/localize.js'

const plural = (n: number, one: string, other: string) => (n === 1 ? one : other)
const ORDINALS: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third', '4': 'fourth', '-1': 'last' }

const en = {
  /** The accessible name of the editor when nothing else names it. */
  group: 'Recurrence',
  /** The label before the frequency select. */
  repeatLabel: 'Repeat',
  /** The label before the interval. */
  everyLabel: 'Every',
  /** The label before the weekdays, or the day of the month. */
  onLabel: 'On',
  /** The label before the month of a yearly rule. */
  inLabel: 'In',
  /** The label before the time of day. */
  atLabel: 'At',
  /** The label before the end of the rule. */
  endsLabel: 'Ends',
  /** The label of the next occurrences. */
  nextLabel: 'Next',

  /** The frequency options. */
  frequencyNone: 'Does not repeat',
  frequencyMinutely: 'By the minute',
  frequencyHourly: 'Hourly',
  frequencyDaily: 'Daily',
  frequencyWeekly: 'Weekly',
  frequencyMonthly: 'Monthly',
  frequencyYearly: 'Yearly',

  /** The unit after the interval: `{0}` is the interval. */
  unitMinutely: (n: number) => plural(n, 'minute', 'minutes'),
  unitHourly: (n: number) => plural(n, 'hour', 'hours'),
  unitDaily: (n: number) => plural(n, 'day', 'days'),
  unitWeekly: (n: number) => plural(n, 'week', 'weeks'),
  unitMonthly: (n: number) => plural(n, 'month', 'months'),
  unitYearly: (n: number) => plural(n, 'year', 'years'),

  /** The options of how a monthly or yearly rule picks its day. */
  modeDay: 'Day of the month',
  modeWeekday: 'Weekday of the month',
  modeLastDay: 'Last day of the month',
  /** An ordinal of "the third Tuesday": `{0}` is 1 to 4, or -1 for the last. */
  ordinal: (n: number) => ORDINALS[String(n)] ?? String(n),
  /** The accessible names of the inner controls. */
  intervalName: 'Interval',
  weekdaysName: 'Days of the week',
  modeName: 'Repeat on',
  dayName: 'Day of the month',
  ordinalName: 'Which week',
  weekdayName: 'Weekday',
  monthName: 'Month',
  timeName: 'Time of day',
  minuteName: 'Minute past the hour',
  endName: 'End',
  untilName: 'End date',
  countName: 'Number of occurrences',
  /** The unit after the minute of an hourly rule. */
  minuteUnit: 'past the hour',

  /** The validation message of a required editor left on "Does not repeat". */
  valueMissing: 'Choose how often it repeats',
  /** The end options. */
  endNever: 'Never',
  endUntil: 'On date',
  endCount: 'After',
  /** The unit after the number of occurrences: `{0}` is the number. */
  countUnit: (n: number) => plural(n, 'occurrence', 'occurrences'),

  /** The summary of a rule. `{0}` is the interval. */
  summaryNone: 'Does not repeat',
  summaryMinutely: (n: number) => plural(n, 'Every minute', `Every ${n} minutes`),
  summaryHourly: (n: number) => plural(n, 'Every hour', `Every ${n} hours`),
  summaryDaily: (n: number) => plural(n, 'Every day', `Every ${n} days`),
  summaryWeekly: (n: number) => plural(n, 'Every week', `Every ${n} weeks`),
  summaryMonthly: (n: number) => plural(n, 'Every month', `Every ${n} months`),
  summaryYearly: (n: number) => plural(n, 'Every year', `Every ${n} years`),
  /** The summary of a weekly rule on Monday to Friday. */
  summaryWeekdays: 'Every weekday',
  /** Where a weekly rule falls: `{0}` is the list of weekdays ("Monday and Wednesday"). */
  summaryOnDays: (days: string) => `on ${days}`,
  /** Where a monthly rule falls: `{0}` is the day of the month. */
  summaryOnDay: (day: number) => `on day ${day}`,
  /** A monthly rule on the last day. */
  summaryOnLastDay: 'on the last day',
  /** A monthly rule on the nth weekday: `{0}` is the ordinal ("third"), `{1}` the weekday. */
  summaryOnNth: (ordinal: string, weekday: string) => `on the ${ordinal} ${weekday}`,
  /** A yearly rule on a date: `{0}` is the day and month ("15 March"). */
  summaryOnDate: (date: string) => `on ${date}`,
  /** A yearly rule on the last day of a month: `{0}` is the month. */
  summaryOnLastDayOf: (month: string) => `on the last day of ${month}`,
  /** A yearly rule on the nth weekday of a month: `{0}` is the ordinal, `{1}` the weekday, `{2}` the month. */
  summaryOnNthOf: (ordinal: string, weekday: string, month: string) => `on the ${ordinal} ${weekday} of ${month}`,
  /** The time of day: `{0}` is the time ("09:00"). */
  summaryAt: (time: string) => `at ${time}`,
  /** The minute of an hourly rule: `{0}` is the minute. */
  summaryAtMinute: (minute: number) => `at ${minute} ${plural(minute, 'minute', 'minutes')} past the hour`,
  /** An end after a number of occurrences: `{0}` is the number. */
  summaryCount: (n: number) => plural(n, 'once', `${n} times`),
  /** An end on a date: `{0}` is the date. */
  summaryUntil: (date: string) => `until ${date}`,
  /** The rule and its end: `{0}` is the rule, `{1}` the end. */
  summaryWithEnd: (rule: string, end: string) => `${rule}, ${end}`,
  /** Said instead of the next occurrences when there are none. */
  noOccurrences: 'No more occurrences',
  /** The accessible name of the list of next occurrences. */
  occurrencesName: 'Next occurrences',
}

/** The recurrence editor's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const recurrenceEditorMessages = defineMessages('recurrence-editor', en)
