import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The accessible name of the terminal, used when it has no `heading`. */
  terminal: 'Terminal',
  /** The accessible name of the command line, used when `label` is empty. */
  command: 'Command',
  /** The title bar hint for Ctrl+L. */
  clearHint: 'clear',
  /** The title bar hint for Ctrl+C. */
  cancelHint: 'cancel',
  /** Shown while a command runs: `{0}` is the command's name. */
  running: (name: string) => `Running ${name}…`,
  /** Shown after the running line. */
  stopHint: 'Ctrl+C to stop',
  /** `help`'s description of the built-in `clear`. */
  helpClear: 'Clear the screen (Ctrl+L)',
  /** `help`'s description of the built-in `help`. */
  helpHelp: 'Show this list',
  /** Announced in place of a command's output when it is long: `{0}` is its number of lines. */
  outputSummary: (lines: number) => `Output: ${lines} lines`,
  /** Announced when a command is cancelled with Ctrl+C. */
  cancelled: 'Cancelled',
  /** Announced when Tab finds several completions: `{0}` is how many. */
  completions: (count: number) => `${count} completions`,
  /** Announced after Ctrl+L or `clear`. */
  cleared: 'Screen cleared',
}

/** The terminal's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const terminalMessages = defineMessages('terminal', en)
