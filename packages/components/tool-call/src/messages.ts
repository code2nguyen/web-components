import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Shown in place of the tool's name when it has none. */
  tool: 'Tool',
  /** The state's word in the header. */
  pending: 'Pending',
  running: 'Running',
  success: 'Completed',
  error: 'Failed',
  cancelled: 'Cancelled',
  /** Headings of the two sections opening the card shows. */
  input: 'Input',
  output: 'Output',
  /** Heading of the output section of a failed call. */
  errorLabel: 'Error',
}

/** The tool call's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const toolCallMessages = defineMessages('tool-call', en)
