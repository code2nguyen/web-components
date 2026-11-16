import { defineMessages } from '@c2n/core/localize.js'

/**
 * The accessible name of the arrow `c2-delta` draws, which says both the direction and whether it is good, so the
 * colour is never the only sign of it.
 */
const en = {
  /** A rise that is good: revenue up, or anything up with `better="higher"`. */
  increaseBetter: 'Increase, better',
  /** A rise that is bad: cost or latency up, with `better="lower"`. */
  increaseWorse: 'Increase, worse',
  /** A fall that is good: cost or latency down, with `better="lower"`. */
  decreaseBetter: 'Decrease, better',
  /** A fall that is bad: revenue down. */
  decreaseWorse: 'Decrease, worse',
}

export const formatNumberMessages = defineMessages('format-number', en)
