import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Visible heading and accessible name when the book has no `label`. */
  label: 'Order book',
  /** Caption of the sell side. */
  asks: 'Asks',
  /** Caption of the buy side. */
  bids: 'Bids',
  /** Price column header. */
  price: 'Price',
  /** Price column header with the quote asset (`quote`), e.g. "Price (USD)". */
  priceIn: (quote: string) => `Price (${quote})`,
  /** Size column header. */
  size: 'Size',
  /** Size column header with the base asset (`base`), e.g. "Size (BTC)". */
  sizeIn: (base: string) => `Size (${base})`,
  /** Cumulative size column header. */
  total: 'Total',
  /** Price column header of the buy side, side by side. */
  bid: 'Bid',
  /** Price column header of the sell side, side by side. */
  ask: 'Ask',
  /** Accessible name of the price grouping picker. */
  grouping: 'Price grouping',
  /** The spread row: the gap between the best ask and the best bid, then that gap as a percentage of the mid price. */
  spread: (value: string, percent: string) => `Spread ${value} (${percent})`,
  /** Accessible name of the mid price in the spread row. */
  mid: 'Mid price',
  /** Accessible name of the last trade price in the spread row. */
  last: 'Last price',
  /** Read after a price the user has an order at (the dot). */
  own: 'your order',
  /** Shown while `loading` and the book is empty. */
  loading: 'Waiting for the book…',
  /** Shown when the book is empty. */
  empty: 'No orders',
}

/** The order book's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const orderBookMessages = defineMessages('order-book', en)
