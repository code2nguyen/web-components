import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Shown when there are no tasks (the `empty` slot's default). */
  empty: 'No tasks to show',
  /** Headings of the task list and duration columns (the `list-header` and `duration-header` slots' defaults). */
  task: 'Task',
  duration: 'Days',
  /** A duration in days. */
  days: (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`,
  /** Parts of a row's accessible name, joined by commas after the task's label. */
  describeMilestone: (date: string) => `milestone, ${date}`,
  describeRange: (start: string, end: string) => `${start} to ${end}`,
  describeProgress: (percent: string) => `${percent} complete`,
  describeAfter: (tasks: string) => `after ${tasks}`,
  /** Terms of the default tooltip. */
  date: 'Date',
  dates: 'Dates',
  length: 'Length',
  after: 'After',
  done: 'Done',
}

/** The gantt chart's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const ganttMessages = defineMessages('gantt', en)
