import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { DiffLine } from '@c2n/diff-viewer'
import { applyDecisions, reviewHunks, type Review, type ReviewDecision, type ReviewHunk } from './review.js'
import { changeReviewMessages } from './messages.js'
import styles from './change-review.scss?inline'

export { applyDecisions, reviewHunks } from './review.js'
export type { Review, ReviewDecision, ReviewHunk, ReviewRow } from './review.js'
export { changeReviewMessages } from './messages.js'

/** Which side an open hunk keeps in `result`. */
export type ChangeReviewUndecided = 'original' | 'modified'

/** Detail of `review-change`. */
export interface ChangeReviewChangeDetail {
  /** One entry per hunk. */
  decisions: ReviewDecision[]
  /** The text the decisions produce. */
  result: string
  /** The hunk the change is about, or -1 for Accept all, Reject all and Start over. */
  index: number
}

/** Detail of `review-complete`. */
export interface ChangeReviewCompleteDetail {
  decisions: ReviewDecision[]
  result: string
}

/** Events fired by {@link ChangeReview}, keyed for `addEventListener`. */
export interface ChangeReviewEventMap {
  'review-change': CustomEvent<ChangeReviewChangeDetail>
  'review-complete': CustomEvent<ChangeReviewCompleteDetail>
}

export interface ChangeReview {
  addEventListener: TypedAddEventListener<ChangeReview, ChangeReviewEventMap>
  removeEventListener: TypedRemoveEventListener<ChangeReview, ChangeReviewEventMap>
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/**
 * Review proposed edits hunk by hunk — accept or reject each, then take the result — as the AI-edit review of an
 * editor or the "suggested changes" of a code review. Set `original` and `modified`: the element diffs them by line
 * and word (with `@c2n/diff-viewer`'s diff) and groups each run of changed lines into a hunk, with `context`
 * unchanged lines around it.
 *
 * Each hunk shows its removed and added lines with the changed words highlighted, and an Accept / Reject pair. An
 * accepted hunk collapses to its new text, a rejected one to its original text, both with an Undo. The sticky review
 * bar shows the position ("Hunk 2 of 5 · 3 left"), Previous and Next, and Accept all / Reject all, which decide every
 * hunk still open. Once every hunk is decided the bar turns into a summary with Start over and the `actions` slot,
 * where the app puts its own Apply button: the element never writes anything back.
 *
 * `decisions` holds one `'accepted' | 'rejected' | null` per hunk and can be set to restore a review; `result` is the
 * text the decisions produce, an open hunk keeping its `undecided` side. `review-change` fires after every decision
 * and `review-complete` each time the last open hunk is decided.
 *
 * Keyboard, inside the element: Alt+ArrowDown and Alt+ArrowUp move between hunks, Ctrl+Enter (⌘Enter) accepts the
 * current hunk and Ctrl+Backspace (⌘Backspace) rejects it; every shortcut is also a button whose tooltip names it.
 * The host is a `group` named by `label`; each hunk is a group named "Change 2 of 5: 3 lines removed, 4 added", and
 * decisions are announced politely. A text diff with no syntax highlighting; editing inside a hunk is out of scope.
 *
 * @tag c2-change-review
 *
 * @slot actions - Shown in the summary once every hunk is decided, after Start over: the app's Apply button.
 *
 * @event review-change - After a decision, an undo, Accept all, Reject all or Start over; `detail` is `{ decisions, result, index }`.
 * @event review-complete - When the last open hunk is decided; `detail` is `{ decisions, result }`.
 *
 * @csspart header - The label, file name and line counts.
 * @csspart bar - The review bar, or the summary once every hunk is decided.
 * @csspart hunk - Each hunk.
 *
 * @cssproperty {background-color} [--c2-change-review--background-color=#ffffff]
 * @cssproperty {color} [--c2-change-review--color=#18181b]
 * @cssproperty {border} [--c2-change-review--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-change-review--border-radius=8px]
 * @cssproperty {pixel} [--c2-change-review--max-height=none] - Past this height the hunks scroll under the sticky bar.
 * @cssproperty {font-family} [--c2-change-review--font-family=inherit]
 * @cssproperty {font-size} [--c2-change-review--font-size=14px] - Size of the header, bar and hunk titles.
 *
 * @cssproperty {padding} [--c2-change-review__header--padding=10px 14px]
 * @cssproperty {border} [--c2-change-review__header--border-bottom=1px solid #e4e4e7]
 * @cssproperty {font-weight} [--c2-change-review__header--font-weight=600] - Weight of the label.
 * @cssproperty {color} [--c2-change-review__file--color=#71717a] - The file name.
 * @cssproperty {color} [--c2-change-review__stats__added--color=#15803d]
 * @cssproperty {color} [--c2-change-review__stats__removed--color=#dc2626]
 *
 * @cssproperty {background-color} [--c2-change-review__bar--background-color=#fafafa]
 * @cssproperty {border} [--c2-change-review__bar--border-bottom=1px solid #e4e4e7]
 * @cssproperty {padding} [--c2-change-review__bar--padding=8px 12px]
 * @cssproperty {color} [--c2-change-review__meter--color=rgb(2, 101, 220)] - The filled share of the progress meter.
 * @cssproperty {background-color} [--c2-change-review__meter--background-color=#e4e4e7]
 * @cssproperty {background-color} [--c2-change-review__done--background-color=rgba(22, 163, 74, 0.08)] - The summary once every hunk is decided.
 * @cssproperty {background-color} [--c2-change-review__done-icon--background-color=#16a34a]
 *
 * @cssproperty {border} [--c2-change-review__hunk--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-change-review__hunk--border-radius=6px]
 * @cssproperty {color} [--c2-change-review__hunk__current--border-color=rgb(2, 101, 220)] - Outline of the current hunk.
 * @cssproperty {background-color} [--c2-change-review__hunk-head--background-color=#fafafa]
 * @cssproperty {margin} [--c2-change-review__hunk--margin=8px 12px]
 * @cssproperty {color} [--c2-change-review__muted--color=#52525b] - Hunk titles, gap rows and collapsed lines.
 *
 * @cssproperty {font-family} [--c2-change-review__code--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {font-size} [--c2-change-review__code--font-size=12px]
 * @cssproperty {line-height} [--c2-change-review__code--line-height=20px]
 * @cssproperty {background-color} [--c2-change-review__line__added--background-color=rgba(22, 163, 74, 0.12)]
 * @cssproperty {background-color} [--c2-change-review__line__removed--background-color=rgba(220, 38, 38, 0.12)]
 * @cssproperty {background-color} [--c2-change-review__word__added--background-color=rgba(22, 163, 74, 0.3)]
 * @cssproperty {background-color} [--c2-change-review__word__removed--background-color=rgba(220, 38, 38, 0.3)]
 * @cssproperty {color} [--c2-change-review__marker__added--color=#15803d]
 * @cssproperty {color} [--c2-change-review__marker__removed--color=#dc2626]
 * @cssproperty {color} [--c2-change-review__line-number--color=#52525b]
 *
 * @cssproperty {background-color} [--c2-change-review__status__accepted--background-color=rgba(22, 163, 74, 0.14)]
 * @cssproperty {color} [--c2-change-review__status__accepted--color=#166534]
 * @cssproperty {background-color} [--c2-change-review__status__rejected--background-color=rgba(113, 113, 122, 0.14)]
 * @cssproperty {color} [--c2-change-review__status__rejected--color=#52525b]
 *
 * @cssproperty {pixel} [--c2-change-review__button--height=30px]
 * @cssproperty {border-radius} [--c2-change-review__button--border-radius=6px]
 * @cssproperty {border} [--c2-change-review__button--border=1px solid #bcbcc6] - Reject, Reject all, Start over.
 * @cssproperty {color} [--c2-change-review__button--color=#18181b]
 * @cssproperty {background-color} [--c2-change-review__button--background-color=transparent]
 * @cssproperty {background-color} [--c2-change-review__button__hover--background-color=#f4f4f5]
 * @cssproperty {background-color} [--c2-change-review__button__primary--background-color=rgb(2, 101, 220)] - Accept and Accept all.
 * @cssproperty {color} [--c2-change-review__button__primary--color=#ffffff]
 * @cssproperty {background-color} [--c2-change-review__button__primary__hover--background-color=rgb(1, 84, 184)]
 * @cssproperty {color} [--c2-change-review__link--color=rgb(2, 101, 220)] - Undo.
 * @cssproperty {outline} [--c2-change-review__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-change-review')
export class ChangeReview extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The text before the edit. */
  @property() original = ''

  /** The text after the edit. */
  @property() modified = ''

  /** Names the review; shown in the header. */
  @property() label = ''

  /** The file the edit is for, shown in the header after the label. */
  @property({ attribute: 'file-name' }) fileName = ''

  /** Unchanged lines shown on each side of a hunk. */
  @property({ type: Number }) context = 3

  /** Which side an open hunk keeps in `result`: `original` (as if rejected, the default) or `modified`. */
  @property() undecided: ChangeReviewUndecided = 'original'

  /** One decision per hunk: `'accepted'`, `'rejected'` or `null` while open. Set it to restore a review. */
  @property({ attribute: false }) decisions: ReviewDecision[] = []

  /** The hunk the bar points at and the keyboard acts on. */
  private current = 0
  private announcement = ''
  private review: Review = { hunks: [], rows: [], lines: [] }

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, changeReviewMessages)

  constructor() {
    super()
    this.internals.role = 'group'
    this.addEventListener('keydown', this.onKeyDown)
  }

  /** The hunks of the current texts. */
  get hunks(): readonly ReviewHunk[] {
    return this.review.hunks
  }

  /** The text the decisions produce; an open hunk keeps its `undecided` side. */
  get result(): string {
    return applyDecisions(this.review, this.decisions, this.undecided === 'modified' ? 'modified' : 'original')
  }

  /** Accepts a hunk (the current one by default). */
  accept(index = this.current): void {
    this.decide(index, 'accepted')
  }

  /** Rejects a hunk (the current one by default). */
  reject(index = this.current): void {
    this.decide(index, 'rejected')
  }

  /** Opens a decided hunk again. */
  undo(index: number): void {
    if (!this.decisions[index]) return
    this.setDecisions(
      this.decisions.map((decision, i) => (i === index ? null : decision)),
      index,
      this.msg.t('announceUndone', index + 1),
    )
    this.current = index
    void this.focusHunk(index)
  }

  /** Accepts every hunk still open. */
  acceptAll(): void {
    this.decideOpen('accepted')
  }

  /** Rejects every hunk still open. */
  rejectAll(): void {
    this.decideOpen('rejected')
  }

  /** Opens every hunk again. */
  reset(): void {
    if (!this.decisions.some(Boolean)) return
    this.setDecisions(
      this.decisions.map(() => null),
      -1,
      this.msg.t('announceReset'),
    )
    this.current = 0
    void this.focusHunk(0)
  }

  /** Moves to a hunk and focuses it. */
  goTo(index: number): void {
    const count = this.review.hunks.length
    if (!count) return
    this.current = Math.max(0, Math.min(count - 1, index))
    this.requestUpdate()
    void this.focusHunk(this.current)
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('original') || changed.has('modified') || changed.has('context')) {
      this.review = reviewHunks(this.original ?? '', this.modified ?? '', this.context)
      // New texts start a new review, unless the decisions were set with them.
      const textChanged =
        (changed.has('original') && changed.get('original') !== undefined) || (changed.has('modified') && changed.get('modified') !== undefined)
      if (textChanged && !changed.has('decisions')) {
        this.decisions = []
        this.current = 0
      }
    }
    const count = this.review.hunks.length
    const given = Array.isArray(this.decisions) ? this.decisions : []
    const normal = Array.from({ length: count }, (_, i): ReviewDecision => (given[i] === 'accepted' || given[i] === 'rejected' ? given[i] : null))
    if (given.length !== count || normal.some((value, i) => value !== given[i])) this.decisions = normal
    if (this.current >= count) this.current = Math.max(0, count - 1)
    this.internals.ariaLabel = this.label || this.msg.t('review')
  }

  private get open(): number {
    return this.decisions.filter((decision) => decision === null).length
  }

  private counts() {
    return {
      accepted: this.decisions.filter((decision) => decision === 'accepted').length,
      rejected: this.decisions.filter((decision) => decision === 'rejected').length,
    }
  }

  private decide(index: number, decision: 'accepted' | 'rejected'): void {
    if (index < 0 || index >= this.review.hunks.length || this.decisions[index] === decision) return
    const decisions = this.decisions.map((value, i) => (i === index ? decision : value))
    const left = decisions.filter((value) => value === null).length
    this.setDecisions(
      decisions,
      index,
      decision === 'accepted' ? this.msg.t('announceAccepted', index + 1, left) : this.msg.t('announceRejected', index + 1, left),
    )
    // On to the next open hunk, wrapping round; with none left, to the summary.
    const next = this.nextOpen(index)
    if (next >= 0) {
      this.current = next
      void this.focusHunk(next)
    } else void this.focusSummary()
  }

  private decideOpen(decision: 'accepted' | 'rejected'): void {
    if (!this.open) return
    this.setDecisions(
      this.decisions.map((value) => value ?? decision),
      -1,
      '',
    )
    void this.focusSummary()
  }

  private nextOpen(from: number): number {
    const count = this.decisions.length
    for (let step = 1; step <= count; step++) {
      const i = (from + step) % count
      if (this.decisions[i] === null) return i
    }
    return -1
  }

  private setDecisions(decisions: ReviewDecision[], index: number, message: string): void {
    const wasComplete = this.decisions.length > 0 && this.open === 0
    this.decisions = decisions
    const complete = decisions.length > 0 && decisions.every((decision) => decision !== null)
    const { accepted, rejected } = this.counts()
    this.announce(complete && !wasComplete ? this.msg.t('announceDone', accepted, rejected) : message)
    const result = this.result
    this.dispatchEvent(
      new CustomEvent<ChangeReviewChangeDetail>('review-change', { detail: { decisions: [...decisions], result, index }, bubbles: true, composed: true }),
    )
    if (complete && !wasComplete) {
      this.dispatchEvent(
        new CustomEvent<ChangeReviewCompleteDetail>('review-complete', { detail: { decisions: [...decisions], result }, bubbles: true, composed: true }),
      )
    }
  }

  private announce(text: string): void {
    // A repeated message must still be read: clear it first, then write it on the next frame.
    this.announcement = ''
    this.requestUpdate()
    if (text)
      requestAnimationFrame(() => {
        this.announcement = text
        this.requestUpdate()
      })
  }

  private async focusHunk(index: number): Promise<void> {
    await this.updateComplete
    const hunk = this.renderRoot.querySelector<HTMLElement>(`[data-hunk="${index}"]`)
    hunk?.querySelector<HTMLElement>('[data-focus]')?.focus({ preventScroll: true })
    hunk?.scrollIntoView?.({ block: 'nearest' })
  }

  private async focusSummary(): Promise<void> {
    await this.updateComplete
    this.renderRoot.querySelector<HTMLElement>('.start-over')?.focus()
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.review.hunks.length || event.defaultPrevented) return
    const mod = isMac() ? event.metaKey : event.ctrlKey
    if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      this.goTo(this.current + (event.key === 'ArrowDown' ? 1 : -1))
    } else if (mod && !event.altKey && (event.key === 'Enter' || event.key === 'Backspace')) {
      event.preventDefault()
      if (this.decisions[this.current] !== null) return
      if (event.key === 'Enter') this.accept()
      else this.reject()
    }
  }

  private onFocusIn = (event: FocusEvent): void => {
    const hunk = (event.target as HTMLElement).closest?.('[data-hunk]') as HTMLElement | null
    const index = hunk ? Number(hunk.dataset.hunk) : -1
    if (index >= 0 && index !== this.current) {
      this.current = index
      this.requestUpdate()
    }
  }

  private keys(action: 'accept' | 'reject' | 'previous' | 'next'): string {
    const mod = isMac() ? '⌘' : 'Ctrl+'
    return { accept: `${mod}Enter`, reject: `${mod}Backspace`, previous: 'Alt+↑', next: 'Alt+↓' }[action]
  }

  private range(first: number, last: number): string {
    return first >= last ? this.msg.t('line', Math.max(first, 1)) : this.msg.t('lineRange', first, last)
  }

  private renderText(line: DiffLine) {
    if (!line.segments) return line.text
    const added = line.type === 'insert'
    return line.segments.map((segment) => (!segment.changed ? segment.text : added ? html`<ins>${segment.text}</ins>` : html`<del>${segment.text}</del>`))
  }

  private renderLine(line: DiffLine, collapsed = false) {
    const type = collapsed ? 'equal' : line.type
    const sign = type === 'insert' ? '+' : type === 'delete' ? '−' : ''
    // A collapsed accepted line keeps only its new number, a collapsed rejected line only its old one.
    const left = collapsed && line.type === 'insert' ? '' : (line.originalNumber ?? '')
    const right = collapsed && line.type === 'delete' ? '' : (line.modifiedNumber ?? '')
    const said = type === 'insert' ? this.msg.t('added') : type === 'delete' ? this.msg.t('removed') : ''
    return html`<div class="line ${type}">
      <span class="n" aria-hidden="true">${left}</span><span class="n" aria-hidden="true">${right}</span><span class="sign" aria-hidden="true">${sign}</span
      ><span class="text">${said ? html`<span class="visually-hidden">${said} </span>` : nothing}${collapsed ? line.text : this.renderText(line)}</span>
    </div>`
  }

  private renderHunk(hunk: ReviewHunk) {
    const total = this.review.hunks.length
    const index = hunk.index
    const number = index + 1
    const decision = this.decisions[index] ?? null
    const range =
      hunk.removed.length || !hunk.added.length ? this.range(hunk.originalStart, hunk.originalEnd) : this.range(hunk.modifiedStart, hunk.modifiedEnd)
    const title = html`<span class="title">${this.msg.t('changeTitle', number, range)}</span>`
    const label = this.msg.t('changeLabel', number, total, hunk.removed.length, hunk.added.length)
    if (decision) {
      const kept = decision === 'accepted' ? hunk.added : hunk.removed
      return html`<div class="hunk decided ${decision}" part="hunk" role="group" aria-label=${label} data-hunk=${index}>
        <div class="hunk-head">
          <span class="status ${decision}"
            ><span aria-hidden="true">${decision === 'accepted' ? '✓' : '✕'}</span> ${this.msg.t(decision === 'accepted' ? 'accepted' : 'rejected')}</span
          >${title}
          <span class="actions">
            <button type="button" class="link" data-focus aria-label=${this.msg.t('undoChange', number)} @click=${() => this.undo(index)}>
              ${this.msg.t('undo')}
            </button>
          </span>
        </div>
        <div class="code collapsed">
          ${
            kept.length
              ? kept.map((line) => this.renderLine(line, true))
              : html`<div class="none">
                  ${decision === 'accepted' ? this.msg.t('removedLines', hunk.removed.length) : this.msg.t('notAdded', hunk.added.length)}
                </div>`
          }
        </div>
      </div>`
    }
    const current = index === this.current
    return html`<div class="hunk ${current ? 'current' : ''}" part="hunk" role="group" aria-label=${label} data-hunk=${index}>
      <div class="hunk-head">
        ${title}
        <span class="actions">
          <button
            type="button"
            class="button"
            aria-label=${this.msg.t('rejectChange', number)}
            title=${this.msg.t('shortcut', this.msg.t('reject'), this.keys('reject'))}
            @click=${() => this.reject(index)}
          >
            ${this.msg.t('reject')}
          </button>
          <button
            type="button"
            class="button primary"
            data-focus
            aria-label=${this.msg.t('acceptChange', number)}
            title=${this.msg.t('shortcut', this.msg.t('accept'), this.keys('accept'))}
            @click=${() => this.accept(index)}
          >
            ${this.msg.t('accept')}
          </button>
        </span>
      </div>
      <div class="code">
        ${hunk.before.map((line) => this.renderLine(line))}${hunk.removed.map((line) => this.renderLine(line))}${hunk.added.map((line) =>
          this.renderLine(line),
        )}${hunk.after.map((line) => this.renderLine(line))}
      </div>
    </div>`
  }

  private renderBar() {
    const total = this.review.hunks.length
    if (!total) return html`<div class="bar empty" part="bar">${this.msg.t('noChanges')}</div>`
    const open = this.open
    if (!open) {
      const { accepted, rejected } = this.counts()
      return html`<div class="bar done" part="bar">
        <span class="check" aria-hidden="true">✓</span>
        <span class="summary"><b>${this.msg.t('allReviewed', total)}</b><span class="muted">${this.msg.t('summary', accepted, rejected)}</span></span>
        <span class="spacer"></span>
        <button type="button" class="button start-over" @click=${() => this.reset()}>${this.msg.t('startOver')}</button>
        <slot name="actions"></slot>
      </div>`
    }
    const done = total - open
    return html`<div class="bar" part="bar" role="toolbar" aria-label=${this.msg.t('bar')}>
      <span class="progress"
        ><b>${this.msg.t('progress', this.current + 1, total)}</b><span class="muted">· ${this.msg.t('left', open)}</span
        ><span class="meter" aria-hidden="true"><i style="width: ${(done / total) * 100}%"></i></span
      ></span>
      <span class="nav"
        ><button
          type="button"
          class="icon"
          aria-label=${this.msg.t('previous')}
          title=${this.msg.t('shortcut', this.msg.t('previous'), this.keys('previous'))}
          ?disabled=${this.current <= 0}
          @click=${() => this.goTo(this.current - 1)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4" /></svg></button
        ><button
          type="button"
          class="icon"
          aria-label=${this.msg.t('next')}
          title=${this.msg.t('shortcut', this.msg.t('next'), this.keys('next'))}
          ?disabled=${this.current >= total - 1}
          @click=${() => this.goTo(this.current + 1)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></button
      ></span>
      <span class="spacer"></span>
      <button type="button" class="button" @click=${() => this.rejectAll()}>${this.msg.t('rejectAll')}</button>
      <button type="button" class="button primary" @click=${() => this.acceptAll()}>${this.msg.t('acceptAll')}</button>
    </div>`
  }

  override render() {
    const added = this.review.lines.filter((line) => line.type === 'insert').length
    const removed = this.review.lines.filter((line) => line.type === 'delete').length
    return html`<div class="review">
      ${
        this.label || this.fileName
          ? html`<div class="header" part="header">
              ${this.label ? html`<b class="label">${this.label}</b>` : nothing} ${this.fileName ? html`<span class="file">${this.fileName}</span>` : nothing}
              <span class="stats"
                ><span aria-hidden="true"><span class="plus">+${added}</span> <span class="minus">−${removed}</span></span
                ><span class="visually-hidden">${this.msg.t('stats', added, removed)}</span></span
              >
            </div>`
          : nothing
      }
      <div class="body" @focusin=${this.onFocusIn}>
        ${this.renderBar()}
        ${this.review.rows.map((row) =>
          row.kind === 'gap' ? html`<div class="gap" aria-hidden="true">⋯ ${this.msg.t('unchanged', row.count)}</div>` : this.renderHunk(row.hunk),
        )}
      </div>
      <div class="visually-hidden" role="status" aria-live="polite">${this.announcement}</div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-change-review': ChangeReview
  }
}
