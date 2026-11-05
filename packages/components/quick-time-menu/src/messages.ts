import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The trigger's text and the menu's name when the element has no `label`. */
  label: 'Pick a time',
  /** The default presets. */
  laterToday: 'Later today',
  thisEvening: 'This evening',
  tomorrow: 'Tomorrow',
  thisWeekend: 'This weekend',
  nextWeek: 'Next week',
  /** The row that opens the date and time panel. */
  custom: 'Pick a date and time…',
  /** The panel's heading. */
  customHeading: 'Pick a date and time',
  /** The panel's buttons. */
  back: 'Back',
  set: 'Set',
  /** The button that clears the chosen time. */
  clear: 'Clear time',
  /** A row's accessible name: `{0}` is its label, `{1}` the time it resolves to. */
  presetName: (label: string, time: string) => `${label}, ${time}`,
  /** The trigger's accessible name once a time is chosen: `{0}` is the label, `{1}` the time. */
  triggerName: (label: string, time: string) => `${label}: ${time}`,
  /** Announced after a pick: `{0}` is the full date and time. */
  picked: (time: string) => `Set to ${time}`,
  /** Announced after clearing. */
  cleared: 'Time cleared',
  /** The validation message of a `required` menu with no time. */
  valueMissing: 'Choose a time',
}

export const quickTimeMenuMessages = defineMessages('quick-time-menu', en)
