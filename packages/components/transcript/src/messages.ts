import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The accessible name of the transcript region. */
  transcript: 'Transcript',
  /** The name of a speaker group: `{0}` is the speaker, `{1}` the time it starts at. */
  group: (speaker: string, time: string) => `${speaker}, ${time}`,
  /** The accessible name of a timestamp button: `{0}` is the time. */
  playFrom: (time: string) => `Play from ${time}`,
  /** The button that scrolls back to what is playing, shown once the reader scrolls away. */
  jump: 'Jump to current',
  /** Announced when the search moves: `{0}` is the match shown, `{1}` how many there are. */
  matches: (current: number, count: number) => `${current} of ${count} matches`,
  /** Announced when a search finds nothing. */
  noMatches: 'No matches',
}

/** The transcript's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const transcriptMessages = defineMessages('transcript', en)
