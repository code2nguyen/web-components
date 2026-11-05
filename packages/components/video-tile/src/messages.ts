import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Name of a tile with no `name`. */
  participant: 'Participant',
  /** The name of the reader's own tile: `{0}` is their name. */
  you: (name: string) => `${name} (You)`,
  /** The name of a screen share: `{0}` is the name of who shares it. */
  screen: (name: string) => `${name}'s screen`,
  /** Part of the tile's accessible name when the microphone is off. */
  muted: 'muted',
  /** Part of the tile's accessible name when the hand is raised. */
  handRaised: 'hand raised',
  /** Part of the tile's accessible name when the tile is pinned. */
  pinned: 'pinned',
  /** Part of the tile's accessible name for a fair connection. */
  fairConnection: 'unstable connection',
  /** Part of the tile's accessible name for a poor connection. */
  poorConnection: 'poor connection',
  /** The tile's accessible name with its states: `{0}` is the name, `{1}` the states joined with commas. */
  described: (name: string, states: string) => `${name}, ${states}`,
  /** Announced when a hand is raised: `{0}` is the name. */
  raisedHand: (name: string) => `${name} raised a hand`,
}

/** The video tile's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const videoTileMessages = defineMessages('video-tile', en)
