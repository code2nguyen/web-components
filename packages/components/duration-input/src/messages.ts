import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The placeholder of an empty field. */
  placeholder: 'e.g. 1h 30m',
  /** The preview of how the typed text was read: `{0}` is the duration in words. */
  preview: (duration: string) => `= ${duration}`,
  /** The message for text that cannot be read as a duration. */
  badInput: 'Enter a duration like 1h 30m',
  /** The message for an empty required field. */
  valueMissing: 'Enter a duration',
  /** The message for a duration below `min`: `{0}` is `min` written as a duration. */
  rangeUnderflow: (min: string) => `Enter ${min} or more`,
  /** The message for a duration above `max`: `{0}` is `max` written as a duration. */
  rangeOverflow: (max: string) => `Enter ${max} or less`,
  /**
   * Words read as each unit, separated by spaces, on top of the English ones the field always reads. A translation
   * lists its own (`heure heures h`); the English lists here are what the field already knows.
   */
  weekWords: 'w wk wks week weeks',
  dayWords: 'd day days',
  hourWords: 'h hr hrs hour hours',
  minuteWords: 'm min mins minute minutes',
  secondWords: 's sec secs second seconds',
}

/** The duration input's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const durationInputMessages = defineMessages('duration-input', en)
