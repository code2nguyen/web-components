import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The grid's accessible name: `{0}` is the number of participants. */
  participants: (count: number) => `Participants (${count})`,
  /** The text of the tile that stands for the folded participants: `{0}` is how many. */
  more: (count: number) => `+${count} more`,
  /** The accessible name of that tile, a button: `{0}` is how many. */
  showMore: (count: number) => `Show ${count} more participants`,
}

/** The video grid's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const videoGridMessages = defineMessages('video-grid', en)
