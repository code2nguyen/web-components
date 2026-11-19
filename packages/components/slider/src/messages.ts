import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible names of the two thumbs in range mode. */
  start: 'Minimum',
  end: 'Maximum',
  /** A thumb's accessible name when the slider has a name: `{0}` is the slider's, `{1}` the thumb's ("Price, Minimum"). */
  thumb: (name: string, thumb: string) => `${name}, ${thumb}`,
}

/** The slider's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const sliderMessages = defineMessages('slider', en)
