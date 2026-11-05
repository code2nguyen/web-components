import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/avatar'
import { transcriptMessages } from './messages.js'
import styles from './transcript.scss?inline'

/** One word of a segment, for word-level sync. Times are in seconds. */
export interface TranscriptWord {
  text: string
  start: number
  end?: number
}

/** A stretch of speech by one speaker. Times are in seconds. */
export interface TranscriptSegment {
  id?: string
  /** The speaker's id: a key of `speakers`, or the name itself. */
  speaker?: string
  start: number
  /** Where the segment ends; the next segment's start when left out. */
  end?: number
  text: string
  /** The words with their own times. When given, they are what is shown, and the word playing is marked. */
  words?: TranscriptWord[]
  /** A speech-to-text partial, drawn muted until the final text replaces it. */
  interim?: boolean
}

/** How a speaker is shown. */
export interface TranscriptSpeaker {
  name: string
  /** An image for the avatar. */
  avatar?: string
  /** A colour for the avatar, instead of the next of the eight `--c2-transcript__speaker-<n>--color`. */
  color?: string
}

export interface TranscriptSeekEventDetail {
  /** Where to play from, in seconds. */
  time: number
  segment: TranscriptSegment
}

export interface TranscriptMatchEventDetail {
  /** How many matches `query` has. */
  count: number
  /** The match shown, from 0; -1 when there is none. */
  index: number
}

/** Events fired by {@link Transcript}, keyed for `addEventListener`. */
export interface TranscriptEventMap {
  'transcript-seek': CustomEvent<TranscriptSeekEventDetail>
  'match-change': CustomEvent<TranscriptMatchEventDetail>
}

export interface Transcript {
  addEventListener: TypedAddEventListener<Transcript, TranscriptEventMap>
  removeEventListener: TypedRemoveEventListener<Transcript, TranscriptEventMap>
}

/** `0:42`, or `1:02:10` past an hour. */
export function formatTranscriptTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

/** Whether `value` is one CSS colour, and nothing more. */
function isColor(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || /[;{}]|url\(/i.test(value)) return false
  return typeof CSS === 'undefined' || typeof CSS.supports !== 'function' || CSS.supports('color', value)
}

/** A character folded for search: lower case, without accents. */
function fold(char: string): string {
  return char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Where `query` occurs in `text`, ignoring case and accents, as [start, end) offsets in `text`. */
function findAll(text: string, query: string): [number, number][] {
  const needle = [...query].map(fold).join('')
  if (!needle.trim()) return []
  let folded = ''
  const origin: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    const piece = fold(text[index])
    for (let char = 0; char < piece.length; char += 1) origin.push(index)
    folded += piece
  }
  origin.push(text.length)
  const found: [number, number][] = []
  for (let at = folded.indexOf(needle); at >= 0; at = folded.indexOf(needle, at + needle.length)) {
    found.push([origin[at], origin[at + needle.length - 1] + 1])
  }
  return found
}

interface Match {
  segment: number
  start: number
  end: number
}

interface Group {
  speaker: string
  segments: number[]
}

/**
 * A transcript: speaker-labelled, timestamped segments, synced to playback. Use it beside a meeting recording, a
 * podcast or a voice agent.
 *
 * `segments` holds the text, each with a `start` (and `end`) in seconds and optionally its `words` with their own
 * times. Consecutive segments by one speaker sit under one header: an avatar, the name and the time. `speakers` maps a
 * speaker id to a name, an avatar and a colour; speakers without a colour take the eight `--c2-transcript__speaker-<n>--color`
 * in the order they first speak, so the first eight speakers never share one. `layout="compact"` drops the avatars and puts a time
 * before every segment, for a narrow side panel.
 *
 * Playback comes from `media` (an `<audio>` or `<video>`), or from `current-time` set by the app. The segment playing
 * is tinted and, with `words`, the word playing is underlined and the words still to come are muted. Clicking a time,
 * a segment or a word fires `transcript-seek`; unless it is cancelled, `media` jumps there. While `follow` is on, the
 * segment playing is kept in view in the scroll box (give the element a height); scrolling away pauses that and shows a
 * "Jump to current" button.
 *
 * `query` marks every match, ignoring case and accents; `nextMatch()` and `previousMatch()` move between them, and
 * `match-change` gives the count for the app's find bar. Segments appended while following keep the view at the bottom,
 * and `interim` segments are drawn muted, for live captions.
 *
 * The segments are one tab stop: the arrow keys move between them, Enter plays from the one focused.
 *
 * @tag c2-transcript
 *
 * @event {CustomEvent<TranscriptSeekEventDetail>} transcript-seek - A time, a segment or a word was clicked. Cancel it to keep `media` where it is.
 * @event {CustomEvent<TranscriptMatchEventDetail>} match-change - The matches of `query`, or the one shown, changed.
 *
 * @csspart scroll - The scroll box.
 * @csspart group - A speaker's run of segments.
 * @csspart speaker - A speaker's name.
 * @csspart time - A timestamp button.
 * @csspart segment - A segment.
 * @csspart jump - The "Jump to current" button.
 *
 * @cssproperty {length} [--c2-transcript--padding=12px] - Space inside the scroll box.
 * @cssproperty {length} [--c2-transcript__group--gap=18px] - Space between speaker groups.
 * @cssproperty {font-size} [--c2-transcript--font-size=14px]
 * @cssproperty {number} [--c2-transcript--line-height=1.55]
 * @cssproperty {color} [--c2-transcript--color=#18181b]
 * @cssproperty {pixel} [--c2-transcript__avatar--size=28px]
 * @cssproperty {font-weight} [--c2-transcript__speaker--font-weight=600]
 * @cssproperty {color} [--c2-transcript__time--color=#71717a]
 * @cssproperty {font-size} [--c2-transcript__time--font-size=12px]
 * @cssproperty {color} [--c2-transcript__time__hover--color=rgb(2, 101, 220)]
 * @cssproperty {padding} [--c2-transcript__segment--padding=2px 6px]
 * @cssproperty {border-radius} [--c2-transcript__segment--border-radius=6px]
 * @cssproperty {color} [--c2-transcript__segment__active--background-color=rgba(2, 101, 220, 0.1)]
 * @cssproperty {color} [--c2-transcript__segment__focus--outline-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-transcript__word__active--decoration-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-transcript__word__upcoming--color=#71717a] - Words of the segment playing that are still to come.
 * @cssproperty {color} [--c2-transcript__interim--color=#71717a]
 * @cssproperty {color} [--c2-transcript__mark--background-color=#fef08a]
 * @cssproperty {color} [--c2-transcript__mark--color=#18181b]
 * @cssproperty {color} [--c2-transcript__mark__current--outline-color=#ca8a04]
 * @cssproperty {color} [--c2-transcript__jump--background-color=#ffffff]
 * @cssproperty {color} [--c2-transcript__jump--color=#18181b]
 * @cssproperty {border} [--c2-transcript__jump--border=1px solid #e4e4e7]
 * @cssproperty {box-shadow} [--c2-transcript__jump--box-shadow=0 2px 8px rgba(0, 0, 0, 0.15)]
 * @cssproperty {color} [--c2-transcript__speaker-1--color=#1d4ed8]
 * @cssproperty {color} [--c2-transcript__speaker-2--color=#b45309]
 * @cssproperty {color} [--c2-transcript__speaker-3--color=#7e22ce]
 * @cssproperty {color} [--c2-transcript__speaker-4--color=#047857]
 * @cssproperty {color} [--c2-transcript__speaker-5--color=#be123c]
 * @cssproperty {color} [--c2-transcript__speaker-6--color=#0e7490]
 * @cssproperty {color} [--c2-transcript__speaker-7--color=#4d7c0f]
 * @cssproperty {color} [--c2-transcript__speaker-8--color=#a21caf]
 */
@customElement('c2-transcript')
export class Transcript extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The segments, in time order. */
  @property({ converter: jsonPropertyConverter }) segments: TranscriptSegment[] = []

  /** Speaker ids mapped to a name, an avatar and a colour. */
  @property({ converter: jsonPropertyConverter }) speakers: Record<string, TranscriptSpeaker> = {}

  /** An `<audio>` or `<video>` to follow and seek. */
  @property({ attribute: false }) media: HTMLMediaElement | null = null

  /** The playing position in seconds, when there is no `media`. */
  @property({ type: Number, attribute: 'current-time' }) currentTime: number | undefined = undefined

  /** Keeps the segment playing in view. */
  @property({ type: Boolean }) follow = true

  /** `default`, or `compact`: a time before every segment and no avatars. */
  @property() layout: 'default' | 'compact' = 'default'

  /** Text to mark, ignoring case and accents. */
  @property() query = ''

  @state() private focusIndex = 0
  @state() private paused = false
  @state() private matchIndex = -1
  @state() private announcement = ''

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, transcriptMessages)
  private groups: Group[] = []
  private colors = new Map<string, number>()
  private found: Match[] = []
  private active = -1
  private activeWord = -1
  private frame = 0
  private programmatic = false
  private programmaticTimer: ReturnType<typeof setTimeout> | undefined
  private settleTimer: ReturnType<typeof setTimeout> | undefined
  private atBottom = true
  private listened: HTMLMediaElement | null = null
  private pendingMatchScroll = false
  private pendingMatchNotify = false

  constructor() {
    super()
    this.internals.role = 'region'
  }

  /** How many matches `query` has. */
  get matchCount(): number {
    return this.found.length
  }

  /** The match shown, from 0; -1 when there is none. */
  get currentMatch(): number {
    return this.matchIndex
  }

  /** Shows the next match, after the last going back to the first. */
  nextMatch(): void {
    this.moveMatch(1)
  }

  /** Shows the previous match, before the first going round to the last. */
  previousMatch(): void {
    this.moveMatch(-1)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (this.hasUpdated) this.listen(this.media)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.listen(null)
    clearTimeout(this.programmaticTimer)
    clearTimeout(this.settleTimer)
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.internals.ariaLabel = this.msg.t('transcript')
    if (!Array.isArray(this.segments)) this.segments = []
    if (changed.has('segments') || changed.has('speakers')) this.group()
    if (changed.has('segments') || changed.has('query')) {
      const previousSegments = (changed.get('segments') as TranscriptSegment[] | undefined) ?? this.segments
      const previous = this.found[this.matchIndex]
      const count = this.found.length
      this.found = this.query
        ? this.segments.flatMap((segment, index) => findAll(this.display(segment).text, this.query).map(([start, end]) => ({ segment: index, start, end })))
        : []
      if (changed.has('query')) {
        this.matchIndex = this.found.length ? 0 : -1
        this.pendingMatchScroll = true
      } else {
        // New segments keep the same match selected, by its segment and place, not by its position in the list.
        const segment = previous ? previousSegments[previous.segment] : undefined
        const kept = this.found.findIndex((match) => this.segments[match.segment] === segment && match.start === previous?.start)
        const index = kept >= 0 ? kept : this.found.length ? Math.min(Math.max(0, this.matchIndex), this.found.length - 1) : -1
        if (this.found.length !== count || index !== this.matchIndex) this.pendingMatchNotify = true
        this.matchIndex = index
      }
    }
    if (changed.has('segments')) {
      // Only an append (live captions) keeps the view at the bottom; a transcript loaded or replaced opens at its start.
      const old = changed.get('segments') as TranscriptSegment[] | undefined
      const first = this.segments[0]
      const appended =
        this.hasUpdated &&
        Array.isArray(old) &&
        old.length > 0 &&
        this.segments.length >= old.length &&
        (first === old[0] || (first?.start === old[0]?.start && first?.text === old[0]?.text))
      const box = this.box
      this.atBottom = appended && (!box || box.scrollTop + box.clientHeight >= box.scrollHeight - 4)
      if (this.focusIndex >= this.segments.length) this.focusIndex = Math.max(0, this.segments.length - 1)
    }
  }

  /** A new playing position alone repaints the marks by hand: it never re-renders the transcript. */
  protected override shouldUpdate(changed: PropertyValues<this>): boolean {
    if (this.hasUpdated && changed.size === 1 && changed.has('currentTime')) {
      this.paint()
      return false
    }
    return true
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('media')) this.listen(this.media)
    this.paint(true)
    if (changed.has('segments') && this.follow && !this.paused && this.atBottom && (this.active < 0 || this.time === undefined)) {
      const box = this.box
      if (box) this.scrollBox(box.scrollHeight, false)
    }
    if (this.pendingMatchScroll) {
      this.pendingMatchScroll = false
      this.pendingMatchNotify = false
      this.showMatch()
    } else if (this.pendingMatchNotify) {
      this.pendingMatchNotify = false
      this.showMatch(false)
    }
  }

  // ------------------------------------------------------------------------------------------------------- structure

  private get box(): HTMLElement | null {
    return this.renderRoot?.querySelector<HTMLElement>('.scroll') ?? null
  }

  private segmentElement(index: number): HTMLElement | null {
    return this.renderRoot?.querySelector<HTMLElement>(`.segment[data-index="${index}"]`) ?? null
  }

  private group(): void {
    this.groups = []
    this.colors = new Map()
    this.segments.forEach((segment, index) => {
      const speaker = segment.speaker ?? ''
      if (!this.colors.has(speaker)) this.colors.set(speaker, this.colors.size % 8)
      const last = this.groups[this.groups.length - 1]
      if (last && last.speaker === speaker) last.segments.push(index)
      else this.groups.push({ speaker, segments: [index] })
    })
  }

  private speaker(id: string): TranscriptSpeaker {
    return this.speakers?.[id] ?? { name: id }
  }

  /** The text a segment shows, and where each word starts in it. */
  private display(segment: TranscriptSegment): { text: string; offsets: number[] } {
    if (!segment.words?.length) return { text: segment.text ?? '', offsets: [] }
    const offsets: number[] = []
    let text = ''
    segment.words.forEach((word, index) => {
      if (index) text += ' '
      offsets.push(text.length)
      text += word.text
    })
    return { text, offsets }
  }

  // ---------------------------------------------------------------------------------------------------------- timing

  private get time(): number | undefined {
    if (this.media) return this.media.currentTime
    return typeof this.currentTime === 'number' && Number.isFinite(this.currentTime) ? this.currentTime : undefined
  }

  private endOf(index: number): number {
    const segment = this.segments[index]
    return segment.end ?? this.segments[index + 1]?.start ?? Infinity
  }

  /** The segment playing at `time`: the last that started, while it lasts. */
  private find(time: number): number {
    let low = 0
    let high = this.segments.length - 1
    let found = -1
    while (low <= high) {
      const middle = (low + high) >> 1
      if (this.segments[middle].start <= time) {
        found = middle
        low = middle + 1
      } else high = middle - 1
    }
    return found >= 0 && time < this.endOf(found) ? found : -1
  }

  private listen(media: HTMLMediaElement | null): void {
    if (this.listened === media) return
    const events = ['play', 'pause', 'ended', 'seeked', 'timeupdate', 'loadedmetadata'] as const
    for (const name of events) this.listened?.removeEventListener(name, this.onMedia)
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.listened = media
    for (const name of events) media?.addEventListener(name, this.onMedia)
    if (media && !media.paused) this.loop()
  }

  private readonly onMedia = (event: Event): void => {
    if (event.type === 'play') this.loop()
    this.paint()
  }

  /** Repaints every frame while the media plays: `timeupdate` comes four times a second, too slow for words. */
  private loop(): void {
    if (this.frame) return
    const step = () => {
      this.frame = 0
      this.paint()
      if (this.listened && !this.listened.paused && !this.listened.ended && this.isConnected) this.frame = requestAnimationFrame(step)
    }
    this.frame = requestAnimationFrame(step)
  }

  /**
   * Marks the segment and word playing, by hand, so playback never re-renders the transcript. After a render, `fresh`
   * puts the marks back from scratch (a node may now hold another segment), and scrolls only if the segment changed.
   */
  private paint(fresh = false): void {
    if (!this.hasUpdated) return
    const time = this.time
    const active = time === undefined ? -1 : this.find(time)
    if (fresh) {
      this.renderRoot.querySelectorAll('.segment.active').forEach((element) => {
        element.classList.remove('active')
        element.removeAttribute('aria-current')
      })
      this.renderRoot.querySelectorAll('.word.spoken, .word.now').forEach((word) => word.classList.remove('spoken', 'now'))
      this.activeWord = -1
      if (active === this.active) {
        const element = this.segmentElement(active)
        element?.classList.add('active')
        element?.setAttribute('aria-current', 'time')
      }
    }
    if (active !== this.active) {
      const before = this.segmentElement(this.active)
      before?.classList.remove('active')
      before?.removeAttribute('aria-current')
      before?.querySelectorAll('.word').forEach((word) => word.classList.remove('spoken', 'now'))
      this.active = active
      this.activeWord = -1
      const element = this.segmentElement(active)
      element?.classList.add('active')
      element?.setAttribute('aria-current', 'time')
      if (element && this.follow && !this.paused) this.reveal(element)
    }
    const segment = this.segments[active]
    if (!segment?.words?.length || time === undefined) return
    let word = -1
    segment.words.forEach((entry, index) => {
      if (entry.start <= time) word = index
    })
    if (word === this.activeWord) return
    this.activeWord = word
    const element = this.segmentElement(active)
    element?.querySelectorAll<HTMLElement>('.word').forEach((span, index) => {
      span.classList.toggle('spoken', index <= word)
      const entry = segment.words![index]
      span.classList.toggle('now', index === word && time < (entry.end ?? Infinity))
    })
  }

  // ---------------------------------------------------------------------------------------------------------- scroll

  private get reducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  /** Scrolls the box (never the page) to `top`, marking the scroll as ours so it does not pause following. */
  private scrollBox(top: number, smooth = true): void {
    const box = this.box
    if (!box || box.scrollHeight <= box.clientHeight + 1) return
    this.programmatic = true
    clearTimeout(this.programmaticTimer)
    this.programmaticTimer = setTimeout(this.onScrollEnd, 1000)
    box.scrollTo({ top, behavior: smooth && !this.reducedMotion ? 'smooth' : 'auto' })
  }

  /** Brings an element into view in the box, a third of the way down. */
  private reveal(element: HTMLElement): void {
    const box = this.box
    if (!box) return
    const top = element.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    this.scrollBox(top - box.clientHeight / 3)
  }

  private visible(element: HTMLElement): boolean {
    const box = this.box!.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    return rect.bottom > box.top && rect.top < box.bottom
  }

  /**
   * The reader's own scrolling pauses following as soon as the segment playing leaves the view. Following comes back
   * only once the scroll has come to rest with it in view: a smooth scroll that merely passes it on the way does not.
   */
  private readonly onScroll = (): void => {
    if (this.programmatic || !this.follow) return
    const element = this.segmentElement(this.active)
    if (element && !this.visible(element)) this.paused = true
    // `scrollend` settles it; this is the fallback where the browser has none.
    clearTimeout(this.settleTimer)
    this.settleTimer = setTimeout(this.settle, 200)
  }

  private readonly onScrollEnd = (): void => {
    this.endProgrammatic()
    this.settle()
  }

  /** Once the box is at rest, follow again only if the segment playing is in view. */
  private readonly settle = (): void => {
    clearTimeout(this.settleTimer)
    if (this.programmatic || !this.follow) return
    const element = this.segmentElement(this.active)
    this.paused = !!element && !this.visible(element)
  }

  /** The reader's own wheel or touch takes over from a scroll we started, and pauses following until it settles. */
  private readonly onUserScroll = {
    handleEvent: () => {
      this.endProgrammatic()
      if (this.follow && this.active >= 0) this.paused = true
    },
    passive: true,
  }

  private endProgrammatic(): void {
    clearTimeout(this.programmaticTimer)
    this.programmatic = false
  }

  private jump(): void {
    this.paused = false
    const element = this.segmentElement(this.active)
    if (element) this.reveal(element)
  }

  // ----------------------------------------------------------------------------------------------------------- seek

  private seek(time: number, index: number): void {
    const segment = this.segments[index]
    if (!segment) return
    const event = new CustomEvent<TranscriptSeekEventDetail>('transcript-seek', { detail: { time, segment }, bubbles: true, composed: true, cancelable: true })
    if (!this.dispatchEvent(event)) return
    this.paused = false
    if (this.media) this.media.currentTime = time
    else this.currentTime = time
    this.paint()
  }

  private onClick(event: MouseEvent): void {
    const path = event.composedPath() as HTMLElement[]
    const time = path.find((node) => node instanceof HTMLElement && node.classList.contains('time'))
    if (time) {
      const index = Number(time.dataset.index)
      this.seek(this.segments[index]?.start ?? 0, index)
      return
    }
    const segment = path.find((node) => node instanceof HTMLElement && node.classList.contains('segment'))
    if (!segment) return
    // A drag to select text is not a seek.
    const selection = (this.shadowRoot as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.() ?? document.getSelection()
    if (selection && !selection.isCollapsed && selection.toString().trim()) return
    const index = Number(segment.dataset.index)
    this.focusIndex = index
    const word = path.find((node) => node instanceof HTMLElement && node.classList.contains('word'))
    const entry = word ? this.segments[index]?.words?.[Number(word.dataset.word)] : undefined
    this.seek(entry?.start ?? this.segments[index].start, index)
  }

  private onKeydown(event: KeyboardEvent): void {
    const segment = (event.composedPath() as HTMLElement[]).find((node) => node instanceof HTMLElement && node.classList.contains('segment'))
    if (!segment) return
    const index = Number(segment.dataset.index)
    const last = this.segments.length - 1
    const target = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: last }[event.key]
    if (target !== undefined) {
      event.preventDefault()
      this.focusIndex = Math.max(0, Math.min(last, target))
      this.updateComplete.then(() => this.segmentElement(this.focusIndex)?.focus())
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.seek(this.segments[index].start, index)
    }
  }

  // ---------------------------------------------------------------------------------------------------------- search

  private moveMatch(step: number): void {
    if (!this.found.length) return
    this.matchIndex = (this.matchIndex + step + this.found.length) % this.found.length
    this.pendingMatchScroll = true
  }

  /** Says where the search stands, and with `reveal`, brings the match shown into view. */
  private showMatch(reveal = true): void {
    const count = this.found.length
    this.announcement = this.query.trim() ? (count ? this.msg.t('matches', this.matchIndex + 1, count) : this.msg.t('noMatches')) : ''
    this.dispatchEvent(
      new CustomEvent<TranscriptMatchEventDetail>('match-change', { detail: { count, index: this.matchIndex }, bubbles: true, composed: true }),
    )
    const mark = this.renderRoot.querySelector<HTMLElement>('mark.current')
    if (!mark || !reveal) return
    // Looking at a match while it plays elsewhere stops following, until "Jump to current".
    if (this.active >= 0 && this.follow) this.paused = true
    this.reveal(mark)
  }

  // ---------------------------------------------------------------------------------------------------------- render

  /** `text` (which starts at `from` in the segment's display text) with its matches marked. */
  private marked(text: string, from: number, segment: number): TemplateResult | string {
    const to = from + text.length
    const pieces: (TemplateResult | string)[] = []
    let at = from
    this.found.forEach((match, index) => {
      if (match.segment !== segment || match.end <= from || match.start >= to) return
      const start = Math.max(match.start, from)
      const end = Math.min(match.end, to)
      if (start > at) pieces.push(text.slice(at - from, start - from))
      pieces.push(html`<mark class=${index === this.matchIndex ? 'current' : ''}>${text.slice(start - from, end - from)}</mark>`)
      at = end
    })
    if (!pieces.length) return text
    if (at < to) pieces.push(text.slice(at - from))
    return html`${pieces}`
  }

  private renderText(segment: TranscriptSegment, index: number) {
    const { text, offsets } = this.display(segment)
    if (!segment.words?.length) return this.marked(text, 0, index)
    return segment.words.map(
      (word, position) => html`${position ? ' ' : ''}<span class="word" data-word=${position}>${this.marked(word.text, offsets[position], index)}</span>`,
    )
  }

  private renderSegment(index: number, prefix: TemplateResult | typeof nothing = nothing) {
    const segment = this.segments[index]
    return html`<p class="segment${segment.interim ? ' interim' : ''}" part="segment" data-index=${index} tabindex=${index === this.focusIndex ? 0 : -1}>
      ${prefix}<span class="text">${this.renderText(segment, index)}</span>
    </p>`
  }

  private renderTime(index: number) {
    const time = formatTranscriptTime(this.segments[index].start)
    return html`<button class="time" part="time" type="button" tabindex="-1" data-index=${index} aria-label=${this.msg.t('playFrom', time)}>${time}</button>`
  }

  /** A speaker's own colour, used only when it parses as one, so speaker data cannot add declarations of its own. */
  private colorStyle(id: string) {
    const custom = this.speaker(id).color
    return styleMap(isColor(custom) ? { '--_speaker': custom } : {})
  }

  private renderGroup(group: Group) {
    const speaker = this.speaker(group.speaker)
    const first = group.segments[0]
    const time = formatTranscriptTime(this.segments[first].start)
    return html`<article
      class="group speaker-${(this.colors.get(group.speaker) ?? 0) + 1}"
      part="group"
      style=${this.colorStyle(group.speaker)}
      aria-label=${speaker.name ? this.msg.t('group', speaker.name, time) : time}
    >
      ${
        speaker.name
          ? html`<c2-avatar class="avatar" name=${speaker.name} src=${speaker.avatar ?? nothing} aria-hidden="true"></c2-avatar>
              <div class="head"><span class="name" part="speaker">${speaker.name}</span>${this.renderTime(first)}</div>`
          : html`<div class="head">${this.renderTime(first)}</div>`
      }
      <div class="segments">${group.segments.map((index) => this.renderSegment(index))}</div>
    </article>`
  }

  private renderCompact() {
    return this.segments.map((segment, index) => {
      const speaker = segment.speaker ?? ''
      const changed = index === 0 || (this.segments[index - 1].speaker ?? '') !== speaker
      const name = this.speaker(speaker).name
      const prefix =
        changed && name
          ? html`<span class="name speaker-${(this.colors.get(speaker) ?? 0) + 1}" part="speaker" style=${this.colorStyle(speaker)}>${name}</span> `
          : nothing
      return html`<div class="row">${this.renderTime(index)}${this.renderSegment(index, prefix)}</div>`
    })
  }

  override render() {
    return html`<div
        class="scroll ${this.layout === 'compact' ? 'compact' : 'default'}"
        part="scroll"
        @scroll=${this.onScroll}
        @scrollend=${this.onScrollEnd}
        @wheel=${this.onUserScroll}
        @touchstart=${this.onUserScroll}
        @click=${this.onClick}
        @keydown=${this.onKeydown}
      >
        ${this.layout === 'compact' ? this.renderCompact() : this.groups.map((group) => this.renderGroup(group))}
      </div>
      ${
        this.paused && this.active >= 0
          ? html`<button class="jump" part="jump" type="button" @click=${this.jump}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10m-4-4 4 4 4-4" /></svg>${this.msg.t('jump')}
            </button>`
          : nothing
      }
      <div class="live" role="status">${this.announcement}</div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-transcript': Transcript
  }
}
