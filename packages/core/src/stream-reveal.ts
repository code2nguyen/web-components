import type { ReactiveController, ReactiveControllerHost } from 'lit'

/** Unit the text is released in: whole words (with the spacing and punctuation after them) or single graphemes. */
export type RevealSegment = 'word' | 'grapheme'

export interface StreamRevealOptions {
  /** Longest the display may trail the received text while streaming, in milliseconds. */
  maxLag?: number
  /** Time to release the remaining backlog once the stream has ended, in milliseconds. */
  flushDuration?: number
  /** Lowest release rate in segments per second, so a short backlog does not crawl. */
  floorRate?: number
  segment?: RevealSegment
  /** Called after every change of the revealed length, once per animation frame at most. */
  onReveal?: (revealed: number) => void
  /** Called once per stream when it has ended and the display has caught up. */
  onRevealEnd?: () => void
}

export const DEFAULT_MAX_LAG = 600
export const DEFAULT_FLUSH_DURATION = 300
export const DEFAULT_FLOOR_RATE = 30
/** A trailing word at least this long is released while it grows (a URL, a hash) instead of being held back. */
const HELD_WORD_LIMIT = 48

/** The part of `Intl.Segmenter` used here; the shared compiler `lib` predates its type declarations. */
interface Segmenter {
  segment(input: string): Iterable<{ segment: string; index: number; isWordLike?: boolean }>
}
type SegmenterConstructor = new (locale: undefined, options: { granularity: RevealSegment }) => Segmenter

const segmenters = new Map<RevealSegment, Segmenter | null>()

function getSegmenter(kind: RevealSegment): Segmenter | null {
  if (!segmenters.has(kind)) {
    const Ctor = typeof Intl !== 'undefined' ? (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter : undefined
    segmenters.set(kind, Ctor ? new Ctor(undefined, { granularity: kind }) : null)
  }
  return segmenters.get(kind) ?? null
}

/**
 * End offsets (exclusive, relative to `text`) of the release units in `text`. A word unit carries the spacing and
 * punctuation that follow it, so a released word never leaves a dangling space before the next one arrives.
 */
export function segmentEnds(text: string, kind: RevealSegment): number[] {
  const ends: number[] = []
  const segmenter = getSegmenter(kind)
  if (!segmenter) {
    const pattern = kind === 'word' ? /\S+\s*|\s+/gu : /[\s\S]/gu
    for (const match of text.matchAll(pattern)) ends.push(match.index + match[0].length)
    return ends
  }
  for (const part of segmenter.segment(text)) {
    const end = part.index + part.segment.length
    if (kind === 'grapheme' || part.isWordLike || ends.length === 0) ends.push(end)
    else ends[ends.length - 1] = end
  }
  return ends
}

/** Parses a CSS time (`600ms`, `0.3s`) into milliseconds, or returns `fallback` for anything else. */
export function parseCssTime(value: string | null | undefined, fallback: number): number {
  const match = /^\s*(-?[\d.]+)(ms|s)\s*$/.exec(value ?? '')
  if (!match) return fallback
  const amount = Number(match[1]) * (match[2] === 's' ? 1000 : 1)
  return Number.isFinite(amount) && amount >= 0 ? amount : fallback
}

/**
 * Paces text that arrives in bursts (an LLM response, a log tail) into a steady reveal. Every chunk gets a deadline,
 * `maxLag` after it arrived, and each animation frame releases segments at the rate that meets the tightest pending
 * deadline (never slower than `floorRate`), so the display never trails the received text by more than `maxLag`. Once
 * the stream ends, every deadline moves up to `flushDuration` from then. In `instant` mode, or while the document is hidden,
 * everything received is revealed at once.
 *
 * The host reads {@link revealed} (an offset into {@link text}, always on a segment boundary) when it renders.
 */
export class StreamRevealController implements ReactiveController {
  maxLag: number
  flushDuration: number
  floorRate: number
  segment: RevealSegment
  /** When false, every change is revealed immediately. */
  smooth = true

  /** Incremented whenever the text is replaced rather than extended, so a renderer knows to start over. */
  epoch = 0

  private _text = ''
  private _revealed = 0
  private _streaming = false
  private budget = 0
  private lastFrame = 0
  private frame = 0
  /** Pending chunks: offset where each ends and the time by which it must be revealed. */
  private arrivals: { end: number; deadline: number }[] = []
  private endNotified = true
  private connected = false

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly options: StreamRevealOptions = {},
  ) {
    this.maxLag = options.maxLag ?? DEFAULT_MAX_LAG
    this.flushDuration = options.flushDuration ?? DEFAULT_FLUSH_DURATION
    this.floorRate = options.floorRate ?? DEFAULT_FLOOR_RATE
    this.segment = options.segment ?? 'word'
    host.addController(this)
  }

  /** Everything received so far, revealed or not. */
  get text(): string {
    return this._text
  }

  /** Length of the revealed prefix of {@link text}. */
  get revealed(): number {
    return this._revealed
  }

  get streaming(): boolean {
    return this._streaming
  }

  /** True while the display trails the received text. */
  get pending(): boolean {
    return this._revealed < this._text.length
  }

  hostConnected(): void {
    this.connected = true
    this.schedule()
  }

  hostDisconnected(): void {
    this.connected = false
    this.cancel()
  }

  /** Marks the start of a stream. Text received from now on is paced. */
  start(): void {
    if (this._streaming) return
    this._streaming = true
    this.endNotified = false
    this.schedule()
  }

  /** Marks the end of the stream: the backlog is flushed, then `onRevealEnd` runs. */
  end(): void {
    if (!this._streaming && this.endNotified) return
    this._streaming = false
    this.endNotified = false
    const deadline = this.now() + this.flushDuration
    for (const arrival of this.arrivals) arrival.deadline = Math.min(arrival.deadline, deadline)
    if (!this.smooth || !this.pending) this.revealAll()
    else this.schedule()
  }

  push(chunk: string): void {
    if (!chunk) return
    this._text += chunk
    this.arrivals.push({ end: this._text.length, deadline: this.now() + (this._streaming ? this.maxLag : this.flushDuration) })
    if (!this.smooth || (!this._streaming && this.endNotified)) this.revealAll()
    else this.schedule()
  }

  /**
   * Replaces the received text. A value that extends the current one is treated as an append; anything else restarts
   * the reveal from the beginning (or reveals it whole when no stream is running).
   */
  set(text: string): void {
    if (text === this._text) return
    if (text.startsWith(this._text)) {
      this.push(text.slice(this._text.length))
      return
    }
    this._text = text
    this._revealed = 0
    this.budget = 0
    this.epoch++
    this.arrivals = [{ end: text.length, deadline: this.now() + this.maxLag }]
    if (!this.smooth || !this._streaming) this.revealAll()
    else {
      this.notify()
      this.schedule()
    }
  }

  /** Clears the text and the reveal, keeping the streaming state. */
  reset(): void {
    this.cancel()
    this._text = ''
    this._revealed = 0
    this.budget = 0
    this.epoch++
    this.arrivals = []
    this.notify()
  }

  /** Reveals everything received so far, now. */
  revealAll(): void {
    this.cancel()
    this.budget = 0
    this.arrivals = []
    if (this._revealed !== this._text.length) {
      this._revealed = this._text.length
      this.notify()
    }
    this.checkEnd()
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  }

  private schedule(): void {
    if (this.frame || !this.connected || typeof requestAnimationFrame === 'undefined') return
    if (!this.pending) {
      this.checkEnd()
      return
    }
    this.lastFrame = this.now()
    this.frame = requestAnimationFrame(this.tick)
  }

  private cancel(): void {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  private readonly tick = (time: number): void => {
    this.frame = 0
    const delta = Math.max(0, Math.min(time - this.lastFrame, 1000))
    this.lastFrame = time
    if (!this.smooth || (typeof document !== 'undefined' && document.hidden)) {
      this.revealAll()
      return
    }
    while (this.arrivals.length > 0 && this.arrivals[0].end <= this._revealed) this.arrivals.shift()
    const backlog = this._text.slice(this._revealed)
    const ends = segmentEnds(backlog, this.segment)
    // While streaming, the last word may still be growing: it is not released by the steady rate, so a word does not
    // appear in pieces, unless it is long enough to be a URL or a hash. Its deadline still forces it out on a stall.
    let releasable = ends.length
    if (this._streaming && this.segment === 'word' && releasable > 0 && !/\s$/u.test(backlog)) {
      const tail = backlog.length - (releasable > 1 ? ends[releasable - 2] : 0)
      if (tail < HELD_WORD_LIMIT) releasable--
    }
    // Each pending chunk must be revealed by its deadline: release at the rate that meets the tightest one, and force
    // out any chunk whose deadline has passed.
    let rate = this.floorRate
    let forced = 0
    for (const arrival of this.arrivals) {
      const covering = ends.findIndex((end) => end >= arrival.end - this._revealed) + 1 || ends.length
      const left = arrival.deadline - time
      if (left <= 0) forced = Math.max(forced, covering)
      else rate = Math.max(rate, Math.min(covering, releasable) / (left / 1000))
    }
    this.budget = Math.min(this.budget + (rate * delta) / 1000, releasable)
    const count = Math.min(Math.max(Math.floor(this.budget), forced), ends.length)
    if (count > 0) {
      this.budget = Math.max(0, this.budget - count)
      this._revealed += ends[count - 1]
      this.notify()
    }
    this.schedule()
  }

  private notify(): void {
    this.options.onReveal?.(this._revealed)
    this.host.requestUpdate()
  }

  private checkEnd(): void {
    if (this._streaming || this.endNotified || this.pending) return
    this.endNotified = true
    this.options.onRevealEnd?.()
  }
}
