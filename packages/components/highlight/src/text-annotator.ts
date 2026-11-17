import { html, unsafeCSS } from 'lit'
import { jsonPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { Highlight, type HighlightEventMap } from './highlight.js'
import styles from './text-annotator.scss?inline'

/** A labelled span of the text, as UTF-16 offsets (`text.slice(start, end)`). */
export interface TextAnnotation {
  start: number
  end: number
  /** The `value` of one of the `labels`. */
  label: string
}

/** A label the annotator offers. */
export interface TextAnnotatorLabel {
  value: string
  /** Name in the span's tag; `value` when empty. */
  label?: string
  /** Key that applies the label to the selection, such as `p`. */
  key?: string
}

/** Events fired by {@link TextAnnotator}, keyed for `addEventListener`. */
export interface TextAnnotatorEventMap extends HighlightEventMap {
  'ranges-change': CustomEvent<TextAnnotation[]>
}

export interface TextAnnotator {
  addEventListener: TypedAddEventListener<TextAnnotator, TextAnnotatorEventMap>
  removeEventListener: TypedRemoveEventListener<TextAnnotator, TextAnnotatorEventMap>
}

/**
 * A `c2-highlight` that draws labelled spans (`ranges`) of its text, overlapping ones nested, each followed by a tag
 * naming its label. Selecting text and pressing a label's `key`, or calling `annotate(label)`, adds a span; doing it
 * inside a span with that label removes the span. Labels take the tone colours in order.
 *
 * @tag c2-text-annotator
 *
 * @event {CustomEvent<TextAnnotation[]>} ranges-change - Fired when the user adds or removes a span; `detail` is the new `ranges`. Does not bubble.
 *
 * @csspart span - A labelled span; overlapping spans nest.
 * @csspart tag - The label's name after a span.
 *
 * @cssproperty {color} [--c2-text-annotator__tone-1--color=rgba(59, 130, 246, 0.24)]
 * @cssproperty {color} [--c2-text-annotator__tone-2--color=rgba(234, 179, 8, 0.3)]
 * @cssproperty {color} [--c2-text-annotator__tone-3--color=rgba(34, 197, 94, 0.26)]
 * @cssproperty {color} [--c2-text-annotator__tone-4--color=rgba(236, 72, 153, 0.24)]
 * @cssproperty {color} [--c2-text-annotator__tone-5--color=rgba(168, 85, 247, 0.24)]
 * @cssproperty {color} [--c2-text-annotator__tone-6--color=rgba(249, 115, 22, 0.26)]
 * @cssproperty {border-radius} [--c2-text-annotator__span--border-radius=2px]
 * @cssproperty {text-decoration} [--c2-text-annotator__span--text-decoration=none]
 * @cssproperty {display} [--c2-text-annotator__tag--display=inline-block] - `none` leaves colour alone to tell labels apart.
 * @cssproperty {font-size} [--c2-text-annotator__tag--font-size=0.7em]
 * @cssproperty {font-weight} [--c2-text-annotator__tag--font-weight=600]
 */
@customElement('c2-text-annotator')
export class TextAnnotator extends Highlight {
  static override styles = [Highlight.styles, unsafeCSS(styles)]

  /** The labelled spans. Spans outside the text are skipped. */
  @property({ converter: jsonPropertyConverter }) ranges: TextAnnotation[] = []

  /** The labels, in tone order. */
  @property({ converter: jsonPropertyConverter }) labels: TextAnnotatorLabel[] = []

  /** Shows the spans only: no keys, and `annotate` does nothing. */
  @property({ type: Boolean, reflect: true, attribute: 'readonly' }) readOnly = false

  override connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener('keydown', this.onKey)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    document.removeEventListener('keydown', this.onKey)
  }

  /** Labels the selected text, or removes the span with this label around it. Resolves false with no selection inside. */
  async annotate(label: string): Promise<boolean> {
    // The selection code loads on first use, so a read-only annotator never pays for it.
    return !this.readOnly && this.text !== null && (await import('./text-annotator-edit.js')).annotate(this, this.text, label)
  }

  private readonly onKey = (event: KeyboardEvent) => {
    const target = event.composedPath()[0] as Element
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || target.closest?.('input,textarea,[contenteditable]')) return
    const label = this.labels?.find((l) => l.key?.toLowerCase() === event.key.toLowerCase())
    if (label) void this.annotate(label.value)
  }

  override render() {
    const text = this.text
    if (text === null || (this.serverRendered && !this.hasUpdated)) return super.render()
    const labels = this.labels ?? []
    const tone = (r: TextAnnotation) =>
      Math.max(
        0,
        labels.findIndex((l) => l.value === r.label),
      ) % 6
    // Shortest innermost, so overlapping spans nest the same way in every segment.
    const ranges = (this.ranges ?? [])
      .filter((r) => r.start >= 0 && r.start < r.end && r.end <= text.length)
      .sort((a, b) => a.end - a.start - (b.end - b.start) || a.start - b.start)
    const cuts = [...new Set([0, text.length, ...[...ranges, ...this.found].flatMap((r) => [r.start, r.end])])].sort((a, b) => a - b)
    const parts: unknown[] = []
    for (let c = 1; c < cuts.length; c++) {
      const [start, end] = [cuts[c - 1], cuts[c]]
      let part: unknown = text.slice(start, end)
      const match = this.found.findIndex((m) => m.start <= start && m.end >= end)
      const active = match === this.activeIndex
      if (match >= 0)
        part = html`<mark class="c2-highlight__mark ${active ? 'c2-highlight__mark--active' : ''}" part="mark ${active ? 'active' : ''}">${part}</mark>`
      for (const r of ranges) if (r.start <= start && r.end >= end) part = html`<span class="span" part="span" data-tone=${tone(r)}>${part}</span>`
      parts.push(
        part,
        ranges
          .filter((r) => r.end === end)
          .map((r) => html`<span class="tag" part="tag" data-tone=${tone(r)}>${labels.find((l) => l.value === r.label)?.label || r.label}</span>`),
      )
    }
    return html`<span class="c2-highlight" part="text">${parts}</span>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-text-annotator': TextAnnotator
  }
}
