import { defineMessages } from '@c2n/core/localize.js'

// Its own module rather than `messages.ts`, which every chart imports: only the depth chart loads this text.
const depthEn = {
  bids: 'Bids',
  asks: 'Asks',
  bid: 'Bid',
  ask: 'Ask',
  mid: 'Mid price',
  midLabel: (price: string) => `Mid ${price}`,
  spread: 'Spread',
  bestBid: 'Best bid',
  bestAsk: 'Best ask',
  price: 'Price',
  total: 'Total',
  notional: 'Notional',
  averagePrice: 'Avg fill',
  impact: 'Price impact',
  mirrorBids: 'Bids at same distance',
  mirrorAsks: 'Asks at same distance',
  roleDescription: 'depth chart',
  summary: (spread: string, bids: string, asks: string, range: string) =>
    `Depth chart. Spread ${spread}. Within ${range} of the mid price: bids ${bids}, asks ${asks}. Arrow keys move across price levels, plus and minus zoom, Enter picks a price.`,
  levelAnnouncement: (side: string, price: string, total: string, impact: string) => `${side} ${price}: total ${total}, price impact ${impact}`,
}

/** The depth chart's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const depthMessages = defineMessages('depth-chart', depthEn)
