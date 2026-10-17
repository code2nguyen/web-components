import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { diffLines, diffStats, foldLines, type DiffLine, type DiffRow, type DiffSegment, type DiffStats } from './diff.js'
import { diffViewerMessages } from './messages.js'
import styles from './diff-viewer.scss?inline'

export { diffLines, diffStats, diffWords, foldLines, splitLines } from './diff.js'
export type { DiffLine, DiffLineType, DiffRow, DiffSegment, DiffStats } from './diff.js'
export { diffViewerMessages } from './messages.js'

/** How the two texts are laid out: one column of removed and added lines, or the two texts side by side. */
export type DiffViewerMode = 'unified' | 'split'

/** Detail of `fold-expand`: where the opened run starts in each text, and how many lines it held. */
export interface DiffFoldExpandDetail {
  originalStart: number
  modifiedStart: number
  count: number
}

/** Events fired by {@link DiffViewer}, keyed for `addEventListener`. */
export interface DiffViewerEventMap {
  'fold-expand': CustomEvent<DiffFoldExpandDetail>
}

export interface DiffViewer {
  addEventListener: TypedAddEventListener<DiffViewer, DiffViewerEventMap>
  removeEventListener: TypedRemoveEventListener<DiffViewer, DiffViewerEventMap>
}

/** Split layout below this width when `--c2-diff-viewer--split-min-width` is not set. */
const SPLIT_MIN_WIDTH = 600

type FoldRow = Extract<DiffRow, { kind: 'fold' }>
type LineKind = 'added' | 'removed' | 'unchanged'

/** A split row: the original line on the left, the modified line on the right; either side may be empty. */
type SplitRow = { kind: 'pair'; left?: DiffLine; right?: DiffLine } | FoldRow

/**
 * Read-only line diff of two texts, for reviewing a change before it is applied: a configuration, a generated file,
 * a document revision. The diff is computed in the element (Myers' algorithm on lines, then on the words of each
 * changed line pair), so the app only sets `original` and `modified`.
 *
 * `mode="unified"` (the default) draws one column, removed lines before added ones; `mode="split"` puts the two texts
 * side by side and falls back to unified while the element is narrower than `--c2-diff-viewer--split-min-width`.
 * Unchanged runs longer than the `context` kept around each change fold into an "N unchanged lines" row that opens
 * on click (`fold-expand`); `expandAll()` opens them all. `line-numbers` adds the original and modified line
 * numbers, and `original-label` / `modified-label` add a header naming each side, with the counts of added and
 * removed lines.
 *
 * The host is a `figure` named by `label`; each changed line tells screen readers whether it was added or removed,
 * and a hidden caption gives the counts. The counts are also the `stats` property and the custom state
 * `c2-diff-viewer:state(changed)`; `:state(split)` is set while the side-by-side layout is drawn. There is no syntax
 * highlighting and no editing. The diff itself is exported as `diffLines(original, modified)`.
 *
 * @tag c2-diff-viewer
 *
 * @event {CustomEvent<DiffFoldExpandDetail>} fold-expand - Fired when the reader opens a folded run of unchanged lines; `detail` holds the run's first line number in each text (`originalStart`, `modifiedStart`) and its line `count`. Does not bubble.
 *
 * @csspart header - Header row above the lines, shown when `original-label` or `modified-label` is set.
 * @csspart original-label - Name of the original text in the header.
 * @csspart modified-label - Name of the modified text in the header.
 * @csspart stats - Counts of added and removed lines in the header.
 * @csspart body - Scrolling area holding the table of lines.
 * @csspart line - Every row of lines (not the fold rows).
 * @csspart line-number - Every line-number cell.
 * @csspart marker - The cell before each line's text, holding `+` or `−` on a changed line.
 * @csspart content - Every cell holding a line's text.
 * @csspart word - A run of changed words inside a changed line.
 * @csspart fold - The button standing for a run of folded unchanged lines.
 * @csspart no-newline - Note after a last line that ends without a line break.
 * @csspart empty - "No changes" message shown when both texts are identical.
 *
 * @cssproperty {background-color} [--c2-diff-viewer--background-color=#ffffff]
 * @cssproperty {color} [--c2-diff-viewer--color=#18181b]
 * @cssproperty {border} [--c2-diff-viewer--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-diff-viewer--border-radius=8px]
 * @cssproperty {max-height} [--c2-diff-viewer--max-height=none] - The lines scroll past this height.
 * @cssproperty {pixel} [--c2-diff-viewer--split-min-width=600px] - Below this width, in pixels, `mode="split"` draws the unified layout. Read by script when the element resizes.
 *
 * @cssproperty {font-family} [--c2-diff-viewer__code--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {font-size} [--c2-diff-viewer__code--font-size=13px]
 * @cssproperty {line-height} [--c2-diff-viewer__code--line-height=1.5]
 * @cssproperty {tab-size} [--c2-diff-viewer__code--tab-size=2]
 * @cssproperty {white-space} [--c2-diff-viewer__code--white-space=pre-wrap] - `pre` keeps long lines on one line and scrolls them sideways.
 *
 * @cssproperty {background-color} [--c2-diff-viewer__header--background-color=#fafafa]
 * @cssproperty {color} [--c2-diff-viewer__header--color=#18181b]
 * @cssproperty {border} [--c2-diff-viewer__header--border-bottom=1px solid #e4e4e7]
 * @cssproperty {padding} [--c2-diff-viewer__header--padding=8px 12px]
 * @cssproperty {font-size} [--c2-diff-viewer__header--font-size=12px]
 * @cssproperty {font-weight} [--c2-diff-viewer__header--font-weight=600]
 * @cssproperty {color} [--c2-diff-viewer__stats__added--color=#15803d]
 * @cssproperty {color} [--c2-diff-viewer__stats__removed--color=#dc2626]
 *
 * @cssproperty {border} [--c2-diff-viewer__divider--border=1px solid #e4e4e7] - Line between the two sides of the split layout.
 * @cssproperty {padding} [--c2-diff-viewer__line--padding=0 12px 0 4px]
 * @cssproperty {background-color} [--c2-diff-viewer__line__added--background-color=rgba(22, 163, 74, 0.12)]
 * @cssproperty {background-color} [--c2-diff-viewer__line__removed--background-color=rgba(220, 38, 38, 0.12)]
 * @cssproperty {background-color} [--c2-diff-viewer__line__empty--background-color=#fafafa] - Blank side of a split row whose line exists on the other side only.
 * @cssproperty {background-color} [--c2-diff-viewer__word__added--background-color=rgba(22, 163, 74, 0.3)]
 * @cssproperty {background-color} [--c2-diff-viewer__word__removed--background-color=rgba(220, 38, 38, 0.3)]
 * @cssproperty {border-radius} [--c2-diff-viewer__word--border-radius=2px]
 *
 * @cssproperty {color} [--c2-diff-viewer__line-number--color=#71717a]
 * @cssproperty {pixel} [--c2-diff-viewer__line-number--width=5ch]
 * @cssproperty {padding} [--c2-diff-viewer__line-number--padding=0 8px]
 * @cssproperty {color} [--c2-diff-viewer__line-number__added--color=#18181b]
 * @cssproperty {color} [--c2-diff-viewer__line-number__removed--color=#18181b]
 * @cssproperty {background-color} [--c2-diff-viewer__line-number__added--background-color=rgba(22, 163, 74, 0.2)]
 * @cssproperty {background-color} [--c2-diff-viewer__line-number__removed--background-color=rgba(220, 38, 38, 0.2)]
 *
 * @cssproperty {pixel} [--c2-diff-viewer__marker--width=2.5ch]
 * @cssproperty {color} [--c2-diff-viewer__marker__added--color=#15803d]
 * @cssproperty {color} [--c2-diff-viewer__marker__removed--color=#dc2626]
 *
 * @cssproperty {background-color} [--c2-diff-viewer__fold--background-color=#fafafa]
 * @cssproperty {color} [--c2-diff-viewer__fold--color=#71717a]
 * @cssproperty {color} [--c2-diff-viewer__fold__hover--color=rgb(2, 101, 220)]
 * @cssproperty {outline} [--c2-diff-viewer__fold__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {padding} [--c2-diff-viewer__fold--padding=4px 12px]
 *
 * @cssproperty {color} [--c2-diff-viewer__no-newline--color=#71717a]
 * @cssproperty {color} [--c2-diff-viewer__empty--color=#71717a]
 * @cssproperty {padding} [--c2-diff-viewer__empty--padding=8px 12px]
 */
@customElement('c2-diff-viewer')
export class DiffViewer extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, diffViewerMessages)

  /** The text before the change. */
  @property() original = ''

  /** The text after the change. */
  @property() modified = ''

  /**
   * `unified` draws removed and added lines in one column; `split` draws the original on the left and the modified
   * text on the right, and draws `unified` while the element is narrower than `--c2-diff-viewer--split-min-width`.
   */
  @property({ reflect: true }) mode: DiffViewerMode = 'unified'

  /**
   * Unchanged lines kept above and below each change; longer unchanged runs fold into a row that opens on click. A
   * negative number shows every line.
   */
  @property({ type: Number }) context = 3

  /** Shows the original and modified line numbers beside each line. */
  @property({ type: Boolean, reflect: true, attribute: 'line-numbers' }) lineNumbers = false

  /** Name of the original text, shown in the header (a file name, "Current", "v12"). */
  @property({ attribute: 'original-label' }) originalLabel = ''

  /** Name of the modified text, shown in the header. */
  @property({ attribute: 'modified-label' }) modifiedLabel = ''

  /** Accessible name of the diff. Defaults to "Changes". */
  @property() label = ''

  /** Keys of the folds the reader opened; cleared when either text changes. */
  @state() private expanded: ReadonlySet<number> = new Set<number>()
  /** The element is narrower than the split layout allows. */
  @state() private narrow = false
  /** The body scrolls, so it takes keyboard focus. */
  @state() private scrollable = false

  private lines: DiffLine[] = []
  private counts: DiffStats = { additions: 0, deletions: 0 }
  private resizeObserver?: ResizeObserver
  private measureFrame = 0

  constructor() {
    super()
    this.internals.role = 'figure'
  }

  /** Lines added and removed. */
  get stats(): DiffStats {
    return { ...this.counts }
  }

  /** Every line of the diff in reading order, folded lines included. Read-only. */
  get diff(): readonly DiffLine[] {
    return this.lines
  }

  /** Opens every folded run of unchanged lines. Fires no `fold-expand`. */
  expandAll(): void {
    const keys = new Set(this.expanded)
    for (const row of foldLines(this.lines, this.context, this.expanded)) if (row.kind === 'fold') keys.add(row.key)
    this.expanded = keys
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (isServer) return
    // Measured on the next frame: the layout it switches would otherwise resize the observed elements inside the
    // observer's own callback, which browsers report as a "ResizeObserver loop" error.
    this.resizeObserver ??= new ResizeObserver(() => {
      cancelAnimationFrame(this.measureFrame)
      this.measureFrame = requestAnimationFrame(() => this.measure())
    })
    this.resizeObserver.observe(this)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    cancelAnimationFrame(this.measureFrame)
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed)
    if (changed.has('original') || changed.has('modified') || !this.hasUpdated) {
      this.lines = diffLines(this.original ?? '', this.modified ?? '')
      this.counts = diffStats(this.lines)
      if (this.hasUpdated && this.expanded.size) this.expanded = new Set()
    }
    this.internals.ariaLabel = this.label || this.msg.t('label')
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed)
    if (this.counts.additions + this.counts.deletions > 0) this.internals.states.add('changed')
    else this.internals.states.delete('changed')
    if (this.split) this.internals.states.add('split')
    else this.internals.states.delete('split')
    // A new body or table is measured by the observer's first callback; a resized table re-checks the scrolling.
    const body = this.renderRoot.querySelector('.body')
    const table = this.renderRoot.querySelector('table')
    if (body) this.resizeObserver?.observe(body)
    if (table) this.resizeObserver?.observe(table)
  }

  /** Reads the width threshold and whether the body scrolls; both only change with layout. */
  private measure(): void {
    const width = this.getBoundingClientRect().width
    const configured = parseFloat(getComputedStyle(this).getPropertyValue('--c2-diff-viewer--split-min-width'))
    const minimum = Number.isFinite(configured) ? configured : SPLIT_MIN_WIDTH
    const narrow = width > 0 && width < minimum
    if (narrow !== this.narrow) this.narrow = narrow
    const body = this.renderRoot.querySelector<HTMLElement>('.body')
    const scrollable = !!body && (body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1)
    if (scrollable !== this.scrollable) this.scrollable = scrollable
  }

  /** The split layout is drawn: asked for, and wide enough. */
  private get split(): boolean {
    return this.mode === 'split' && !this.narrow
  }

  private expand(row: FoldRow): void {
    this.expanded = new Set([...this.expanded, row.key])
    const first = row.lines[0]
    this.dispatchEvent(
      new CustomEvent<DiffFoldExpandDetail>('fold-expand', {
        detail: { originalStart: first.originalNumber ?? 0, modifiedStart: first.modifiedNumber ?? 0, count: row.lines.length },
      }),
    )
  }

  override render() {
    const rows = foldLines(this.lines, this.context, this.expanded)
    const identical = this.counts.additions + this.counts.deletions === 0
    const split = this.split
    const label = this.label || this.msg.t('label')
    return html`<div class="c2-diff-viewer ${split ? 'is-split' : 'is-unified'} ${this.lineNumbers ? 'has-line-numbers' : ''}">
      ${this.renderHeader(split)} ${identical ? html`<p class="empty" part="empty">${this.msg.t('noChanges')}</p>` : nothing}
      ${
        rows.length
          ? html`<div
              class="body"
              part="body"
              tabindex=${this.scrollable ? 0 : nothing}
              role=${this.scrollable ? 'group' : nothing}
              aria-label=${this.scrollable ? label : nothing}
            >
              <table>
                <caption class="visually-hidden">
                  ${this.msg.t('summary', this.counts.additions, this.counts.deletions)}
                </caption>
                ${split ? this.renderSplit(rows) : this.renderUnified(rows)}
              </table>
            </div>`
          : nothing
      }
    </div>`
  }

  private renderHeader(split: boolean) {
    if (!this.originalLabel && !this.modifiedLabel) return nothing
    const stats = html`<span class="stats" part="stats" aria-hidden="true"
      ><span class="stats-added">+${this.counts.additions}</span> <span class="stats-removed">−${this.counts.deletions}</span></span
    >`
    const original = this.originalLabel ? html`<span class="label" part="original-label">${this.originalLabel}</span>` : nothing
    const modified = this.modifiedLabel ? html`<span class="label" part="modified-label">${this.modifiedLabel}</span>` : nothing
    if (split) {
      return html`<div class="header" part="header">
        <span class="header-side">${original}</span>
        <span class="header-side">${modified}${stats}</span>
      </div>`
    }
    return html`<div class="header" part="header">
      <span class="header-side">
        ${original}${this.originalLabel && this.modifiedLabel ? html`<span class="arrow" aria-hidden="true">→</span>` : nothing}${modified}${stats}
      </span>
    </div>`
  }

  private renderUnified(rows: DiffRow[]) {
    const numbers = this.lineNumbers
    return html`<colgroup>
        ${
          numbers
            ? html`<col class="col-number" />
                <col class="col-number" />`
            : nothing
        }
        <col class="col-marker" />
        <col />
      </colgroup>
      <thead class="visually-hidden">
        <tr>
          ${
            numbers
              ? html`<th scope="col">${this.msg.t('originalLine')}</th>
                  <th scope="col">${this.msg.t('modifiedLine')}</th>`
              : nothing
          }
          <th scope="col">${this.msg.t('change')}</th>
          <th scope="col">${this.msg.t('text')}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => {
          if (row.kind === 'fold') return this.renderFold(row, numbers ? 4 : 2)
          const line = row.line
          const kind = lineKind(line)
          return html`<tr class="line ${kind}" part="line">
            ${numbers ? html`${this.renderNumber(line.originalNumber, kind)}${this.renderNumber(line.modifiedNumber, kind)}` : nothing}${this.renderMarker(
              kind,
            )}${this.renderContent(line, kind)}
          </tr>`
        })}
      </tbody>`
  }

  private renderSplit(rows: DiffRow[]) {
    const numbers = this.lineNumbers
    return html`<colgroup>
        ${numbers ? html`<col class="col-number" />` : nothing}
        <col class="col-marker" />
        <col class="col-side" />
        ${numbers ? html`<col class="col-number" />` : nothing}
        <col class="col-marker" />
        <col class="col-side" />
      </colgroup>
      <thead class="visually-hidden">
        <tr>
          ${numbers ? html`<th scope="col">${this.msg.t('originalLine')}</th>` : nothing}
          <th scope="col">${this.msg.t('change')}</th>
          <th scope="col">${this.originalLabel || this.msg.t('original')}</th>
          ${numbers ? html`<th scope="col">${this.msg.t('modifiedLine')}</th>` : nothing}
          <th scope="col">${this.msg.t('change')}</th>
          <th scope="col">${this.modifiedLabel || this.msg.t('modified')}</th>
        </tr>
      </thead>
      <tbody>
        ${pairRows(rows).map((row) => {
          if (row.kind === 'fold') return this.renderFold(row, numbers ? 6 : 4)
          return html`<tr class="line" part="line">
            ${this.renderSide(row.left, row.left?.originalNumber)}${this.renderSide(row.right, row.right?.modifiedNumber)}
          </tr>`
        })}
      </tbody>`
  }

  private renderSide(line: DiffLine | undefined, number: number | undefined) {
    if (!line) {
      return html`${this.lineNumbers ? html`<td class="number empty-side" part="line-number"></td>` : nothing}
        <td class="marker empty-side" part="marker"></td>
        <td class="content empty-side" part="content"></td>`
    }
    const kind = lineKind(line)
    return html`${this.lineNumbers ? this.renderNumber(number, kind) : nothing}${this.renderMarker(kind)}${this.renderContent(line, kind)}`
  }

  private renderNumber(number: number | undefined, kind: LineKind) {
    return html`<td class="number ${kind}" part="line-number">${number ?? nothing}</td>`
  }

  private renderMarker(kind: LineKind) {
    if (kind === 'unchanged') return html`<td class="marker" part="marker"></td>`
    return html`<td class="marker ${kind}" part="marker">
      <span aria-hidden="true">${kind === 'added' ? '+' : '−'}</span><span class="visually-hidden">${this.msg.t(kind)}</span>
    </td>`
  }

  private renderContent(line: DiffLine, kind: LineKind) {
    const text: unknown = line.segments ? line.segments.map((segment) => renderSegment(segment, kind)) : line.text
    const note = line.noNewline ? html`<span class="no-newline" part="no-newline">${this.msg.t('noNewline')}</span>` : nothing
    return html`<td class="content ${kind}" part="content">${text}${note}</td>`
  }

  private renderFold(row: FoldRow, columns: number): TemplateResult {
    return html`<tr class="fold-row">
      <td colspan=${columns}>
        <button type="button" class="fold" part="fold" @click=${() => this.expand(row)}>
          <svg class="fold-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 1.5v5M8 14.5v-5M5.5 4 8 1.5 10.5 4M5.5 12 8 14.5 10.5 12"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            /></svg
          >${this.msg.t('expand', row.lines.length)}
        </button>
      </td>
    </tr>`
  }
}

function lineKind(line: DiffLine): LineKind {
  return line.type === 'insert' ? 'added' : line.type === 'delete' ? 'removed' : 'unchanged'
}

function renderSegment(segment: DiffSegment, kind: LineKind) {
  return segment.changed ? html`<span class="word ${kind}" part="word">${segment.text}</span>` : segment.text
}

/** Lines up a unified row list side by side: each change's removed lines face its added lines, row by row. */
function pairRows(rows: DiffRow[]): SplitRow[] {
  const out: SplitRow[] = []
  let i = 0
  while (i < rows.length) {
    const row = rows[i]
    if (row.kind === 'fold') {
      out.push(row)
      i++
      continue
    }
    if (row.line.type === 'equal') {
      out.push({ kind: 'pair', left: row.line, right: row.line })
      i++
      continue
    }
    const removed: DiffLine[] = []
    const added: DiffLine[] = []
    while (i < rows.length) {
      const next = rows[i]
      if (next.kind !== 'line' || next.line.type === 'equal') break
      if (next.line.type === 'delete') removed.push(next.line)
      else added.push(next.line)
      i++
    }
    for (let r = 0; r < Math.max(removed.length, added.length); r++) out.push({ kind: 'pair', left: removed[r], right: added[r] })
  }
  return out
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-diff-viewer': DiffViewer
  }
}
