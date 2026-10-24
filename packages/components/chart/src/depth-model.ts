/**
 * The order-book model behind `c2-depth-chart`: parsing raw price levels, summing them outward from the touch, and
 * the questions the chart asks of the result (how deep a side is at a price, what a market order that far would fill
 * at). DOM-free, so the arithmetic is tested on its own.
 */

/**
 * One resting price level as an exchange feed sends it: a `[price, size]` pair, or a `{ price, size }` row. Either
 * value may be a numeric string, which is how Binance, Coinbase and Kraken send them, to keep their decimals exact.
 */
export type DepthLevelInput = readonly [number | string, number | string] | { readonly price: number | string; readonly size: number | string }

/** One side of the book. */
export type DepthSide = 'bid' | 'ask'

/** One price level after summing: its own size, and the running totals from the best price out to it. */
export interface DepthLevel {
  price: number
  size: number
  /** Size of this level and every better one: what a market order must take to reach this price. */
  cumulative: number
  /** `price × size` summed the same way, in the quote currency. */
  notional: number
}

/** A parsed, summed order book. */
export interface DepthBook {
  /** Best (highest) bid first. */
  bids: DepthLevel[]
  /** Best (lowest) ask first. */
  asks: DepthLevel[]
  bestBid?: number
  bestAsk?: number
  /** The centre of the chart: the explicit `mid` when given, else the midpoint of the best bid and ask. */
  mid: number
  /** The most decimals any input price carried, which is how prices are printed. */
  priceDecimals: number
  /** The most decimals any input size carried. */
  sizeDecimals: number
}

/** What a market order that fills down (or up) to a price would do, as the tooltip and `price-select` report it. */
export interface DepthReadout {
  price: number
  side: DepthSide
  /** Size resting between the best price and `price`, in the base currency. */
  cumulative: number
  /** The same in the quote currency. */
  notional: number
  /** The volume-weighted price that order would fill at. */
  averagePrice: number
  /** How far that fill is from the mid price, as a signed fraction: negative selling into bids, positive buying asks. */
  impact: number
}

/** One x position the chart draws: a price level, the window edge a side extends to, or the mid price between the sides. */
export interface DepthPoint {
  price: number
  side: DepthSide | 'mid'
  /** The deepest level reached at this price; absent on the mid point. */
  level?: DepthLevel
}

/** The engine-ready series for a window: x ascending, a bid and an ask column with gaps on the other side. */
export interface DepthSeries {
  points: DepthPoint[]
  x: number[]
  bids: (number | null)[]
  asks: (number | null)[]
}

const MAX_DECIMALS = 8

function decimalsOf(value: number | string): number {
  const text = typeof value === 'string' ? value.trim() : String(value)
  if (/e/i.test(text)) {
    // `1e-7`: the exponent says how many places there are.
    const [mantissa, exponent] = text.toLowerCase().split('e')
    return Math.min(MAX_DECIMALS, Math.max(0, decimalsOf(mantissa) - Number(exponent)))
  }
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : Math.min(MAX_DECIMALS, text.length - dot - 1)
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return Number.NaN
}

/** Reads one side: drops levels without a finite price or a positive size, sums duplicate prices, sorts best first. */
function readSide(input: readonly DepthLevelInput[] | undefined, side: DepthSide, decimals: { price: number; size: number }): DepthLevel[] {
  if (!Array.isArray(input)) return []
  const sizes = new Map<number, number>()
  for (const entry of input as readonly DepthLevelInput[]) {
    if (!entry || typeof entry !== 'object') continue
    const rawPrice = Array.isArray(entry) ? entry[0] : (entry as { price: number | string }).price
    const rawSize = Array.isArray(entry) ? entry[1] : (entry as { size: number | string }).size
    const price = toNumber(rawPrice)
    const size = toNumber(rawSize)
    // A size of 0 is how a diff feed deletes a level; a snapshot can carry it too.
    if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) continue
    sizes.set(price, (sizes.get(price) ?? 0) + size)
    decimals.price = Math.max(decimals.price, decimalsOf(rawPrice as number | string))
    decimals.size = Math.max(decimals.size, decimalsOf(rawSize as number | string))
  }
  const prices = [...sizes.keys()].sort((a, b) => (side === 'bid' ? b - a : a - b))
  let cumulative = 0
  let notional = 0
  return prices.map((price) => {
    const size = sizes.get(price) as number
    cumulative += size
    notional += size * price
    return { price, size, cumulative, notional }
  })
}

/** Parses and sums both sides. `mid` overrides the derived centre (an index or mark price). */
export function buildDepthBook(bids: readonly DepthLevelInput[] | undefined, asks: readonly DepthLevelInput[] | undefined, mid?: number): DepthBook {
  const decimals = { price: 0, size: 0 }
  const bidLevels = readSide(bids, 'bid', decimals)
  const askLevels = readSide(asks, 'ask', decimals)
  const bestBid = bidLevels[0]?.price
  const bestAsk = askLevels[0]?.price
  let centre = typeof mid === 'number' && Number.isFinite(mid) && mid > 0 ? mid : Number.NaN
  if (Number.isNaN(centre)) {
    if (bestBid !== undefined && bestAsk !== undefined) centre = (bestBid + bestAsk) / 2
    else centre = bestBid ?? bestAsk ?? 0
  }
  return { bids: bidLevels, asks: askLevels, bestBid, bestAsk, mid: centre, priceDecimals: decimals.price, sizeDecimals: decimals.size }
}

/**
 * The deepest level a market order reaches at `price`: on the bid side the last level at or above it, on the ask side
 * the last at or below it. `undefined` when the price is better than the best level.
 */
export function depthAt(book: DepthBook, side: DepthSide, price: number): DepthLevel | undefined {
  const levels = side === 'bid' ? book.bids : book.asks
  const reached = side === 'bid' ? (level: DepthLevel) => level.price >= price : (level: DepthLevel) => level.price <= price
  // Levels are sorted outward from the touch, so the reached ones are a prefix: binary search for its end.
  let low = 0
  let high = levels.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (reached(levels[middle])) low = middle + 1
    else high = middle
  }
  return low > 0 ? levels[low - 1] : undefined
}

/** The price window the chart shows: `range` either side of the mid price. */
export function depthWindow(book: DepthBook, range: number): { min: number; max: number } {
  const half = Number.isFinite(range) && range > 0 ? range : 0.02
  return { min: book.mid * (1 - half), max: book.mid * (1 + half) }
}

/**
 * The points drawn for a window, x ascending: the bid edge, the bid levels inside the window, the mid price (a zero
 * on both sides, so each curve drops to the baseline at its best price and the spread reads as a gap; with an explicit
 * `mid` past a side's best price, that side starts at the depth already behind it), the ask levels
 * and the ask edge. Each side is extended flat to the window edge, so a thin book does not stop mid-chart.
 */
export function depthSeries(book: DepthBook, window: { min: number; max: number }, unit: 'base' | 'quote'): DepthSeries {
  const valueOf = (level: DepthLevel) => (unit === 'quote' ? level.notional : level.cumulative)
  // An explicit `mid` inside a side (a mark price beyond the touch) leaves that side's best levels past it. They are not
  // drawn as steps, but the depth they hold starts that side's curve at the mid price, so the totals still add up.
  const bidsPastMid = depthAt(book, 'bid', book.mid)
  const asksPastMid = depthAt(book, 'ask', book.mid)
  const atMid = (level: DepthLevel | undefined) => (level ? valueOf(level) : 0)
  const points: DepthPoint[] = []

  const bids = book.bids.filter((level) => level.price >= window.min && level.price < book.mid)
  const deepestBid = bids[bids.length - 1]
  if (deepestBid && deepestBid.price > window.min) points.push({ price: window.min, side: 'bid', level: deepestBid })
  for (let index = bids.length - 1; index >= 0; index -= 1) points.push({ price: bids[index].price, side: 'bid', level: bids[index] })

  if (book.bids.length > 0 || book.asks.length > 0) points.push({ price: book.mid, side: 'mid' })

  const asks = book.asks.filter((level) => level.price <= window.max && level.price > book.mid)
  for (const level of asks) points.push({ price: level.price, side: 'ask', level })
  const deepestAsk = asks[asks.length - 1]
  if (deepestAsk && deepestAsk.price < window.max) points.push({ price: window.max, side: 'ask', level: deepestAsk })

  return {
    points,
    x: points.map((point) => point.price),
    bids: points.map((point) => (point.side === 'bid' && point.level ? valueOf(point.level) : point.side === 'mid' ? atMid(bidsPastMid) : null)),
    asks: points.map((point) => (point.side === 'ask' && point.level ? valueOf(point.level) : point.side === 'mid' ? atMid(asksPastMid) : null)),
  }
}

/** What a market order reaching `level` would fill at, against the mid price. */
export function depthReadout(book: DepthBook, side: DepthSide, price: number, level: DepthLevel): DepthReadout {
  const averagePrice = level.notional / level.cumulative
  return {
    price,
    side,
    cumulative: level.cumulative,
    notional: level.notional,
    averagePrice,
    impact: book.mid > 0 ? (averagePrice - book.mid) / book.mid : 0,
  }
}

/** The readout at the same distance from the mid price on the other side, or `undefined` when that side is empty there. */
export function mirrorReadout(book: DepthBook, side: DepthSide, price: number): DepthReadout | undefined {
  const other: DepthSide = side === 'bid' ? 'ask' : 'bid'
  const mirrored = 2 * book.mid - price
  const level = depthAt(book, other, mirrored)
  return level ? depthReadout(book, other, mirrored, level) : undefined
}
