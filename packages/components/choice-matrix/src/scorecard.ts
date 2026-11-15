import { html, nothing, unsafeCSS } from 'lit'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { ChoiceMatrix, type ChoiceMatrixColumn, type ChoiceMatrixEventMap, type ChoiceMatrixRow } from './choice-matrix'
import { scorecardMessages } from './scorecard-messages'
import { formatList } from '@c2n/core/locale-helper.js'
import styles from './scorecard.scss?inline'

export { scorecardMessages } from './scorecard-messages'

/** A point of the scale: a column. */
export interface ScorecardColumn extends ChoiceMatrixColumn {
  /** What choosing it earns; the value read as a number by default, else the column's position (the first is 0). */
  points?: number
  /** "Not applicable": a row answered with it counts towards neither total. */
  na?: boolean
  /** A failing answer: a critical criterion answered with it fails the whole scorecard. */
  fail?: boolean
}

/** A criterion: a row. */
export interface ScorecardRow extends ChoiceMatrixRow {
  /** How much the criterion counts: its points and its possible points are multiplied by it. 1 by default. */
  weight?: number
  /** A failing answer here fails the whole scorecard, whatever the total. */
  critical?: boolean
}

/** A verdict for a share of the possible points: the highest band whose `min` (a percentage) the score reaches applies. */
export interface ScorecardBand {
  min: number
  label: string
  /** Its colour in the summary. */
  tone?: 'success' | 'warning' | 'error' | 'neutral'
}

/** Where the scorecard stands. */
export interface ScorecardScore {
  /** Weighted points earned by the answered criteria. */
  points: number
  /** Weighted points possible on the answered criteria, those answered "not applicable" left out. */
  possible: number
  /** `points` as a percentage of `possible`; undefined until a criterion counts. */
  percent: number | undefined
  /** Criteria answered, "not applicable" included. */
  answered: number
  /** Criteria that can be answered. */
  total: number
  /** The values of the critical criteria answered with a failing answer: the scorecard fails when there is one. */
  failed: string[]
  /** The band the percentage reaches, unless the scorecard failed. */
  band: ScorecardBand | undefined
}

/** Events fired by {@link Scorecard}, keyed for `addEventListener`. */
export interface ScorecardEventMap extends ChoiceMatrixEventMap {
  'score-change': CustomEvent<ScorecardScore>
}

export interface Scorecard {
  addEventListener: TypedAddEventListener<Scorecard, ScorecardEventMap>
  removeEventListener: TypedRemoveEventListener<Scorecard, ScorecardEventMap>
}

/**
 * A rated form: criteria in categories, each answered on a scale, weighted, and totalled as you go, as an interview
 * scorecard, a support QA review or a supplier evaluation reads. Some criteria are critical: a failing answer there
 * fails the whole card, whatever the total.
 *
 * Rows are the criteria (`{ value, label, group, weight, critical }`), columns the points of the scale (`{ value,
 * label, points, na, fail }`): `1` to `5`, strong no to strong yes, pass and fail, with an optional "not applicable"
 * column that leaves a row out of the total. A column earns its `points`, else its value read as a number, else its
 * position. Each row's score shows in a column after the scale, each group's subtotal on its header, and the total,
 * the percentage and the verdict of `bands` under the card. `score` is the same at any time, and `score-change` fires
 * with it when the user answers.
 *
 * Everything `c2-choice-matrix` with `type="radio"` does applies: a comment under a criterion goes in its
 * `detail-<row>` slot, cells can show what a level means (`cells`: a rubric), `use-all` answers every criterion at once,
 * and `required` asks for every criterion. A criterion takes one answer whatever `type` says, and a disabled one counts
 * towards nothing.
 *
 * @tag c2-scorecard
 *
 * @event {CustomEvent<ScorecardScore>} score-change - Fired after the user changes an answer, with the new `score`.
 *
 * @csspart score-header - The title of the score column.
 * @csspart row-score - A criterion's score, or a group's subtotal on its header.
 * @csspart summary - The total, the percentage and the verdict under the card.
 * @csspart band - The verdict of `bands` the score reaches.
 * @csspart failed - The verdict when a critical criterion failed, naming it.
 * @csspart critical - The mark beside a critical criterion's label.
 * @csspart weight - A criterion's weight beside its label, when it is not 1.
 *
 * @cssproperty {color} [--c2-scorecard__score--color=#18181b]
 * @cssproperty {font-weight} [--c2-scorecard__score--font-weight=600]
 * @cssproperty {color} [--c2-scorecard__score--background-color=#f4f4f5] - The score column.
 * @cssproperty {padding} [--c2-scorecard__summary--padding=12px]
 * @cssproperty {color} [--c2-scorecard__summary--background-color=#f4f4f5]
 * @cssproperty {font-size} [--c2-scorecard__summary--font-size=14px]
 * @cssproperty {font-size} [--c2-scorecard__total--font-size=20px]
 * @cssproperty {color} [--c2-scorecard__band--color=light-dark(#18181b, #e4e4e7)] - A band with no tone, or the `neutral` one.
 * @cssproperty {color} [--c2-scorecard__band--background-color=light-dark(#e4e4e7, #3f3f46)]
 * @cssproperty {color} [--c2-scorecard__band__success--color=light-dark(#166534, #86efac)]
 * @cssproperty {color} [--c2-scorecard__band__success--background-color=light-dark(#dcfce7, #14361f)]
 * @cssproperty {color} [--c2-scorecard__band__warning--color=light-dark(#854d0e, #fde68a)]
 * @cssproperty {color} [--c2-scorecard__band__warning--background-color=light-dark(#fef9c3, #3d3210)]
 * @cssproperty {color} [--c2-scorecard__band__error--color=light-dark(#991b1b, #fecaca)]
 * @cssproperty {color} [--c2-scorecard__band__error--background-color=light-dark(#fee2e2, #451a1a)] - Also the failed verdict.
 * @cssproperty {color} [--c2-scorecard__critical--color=#dc2626]
 * @cssproperty {color} [--c2-scorecard__weight--color=#71717a]
 */
@customElement('c2-scorecard')
export class Scorecard extends ChoiceMatrix {
  static override styles = [ChoiceMatrix.styles, unsafeCSS(styles)]

  /** The criteria. As an attribute, a JSON array of `{ value, label, description, group, weight, critical, disabled }`. */
  @property({ converter: jsonPropertyConverter }) override rows: ScorecardRow[] = []

  /** The points of the scale. As an attribute, a JSON array of `{ value, label, points, na, fail, disabled }`. */
  @property({ converter: jsonPropertyConverter }) override columns: ScorecardColumn[] = []

  /** Verdicts by percentage, such as `[{"min":80,"label":"Strong yes","tone":"success"},{"min":0,"label":"No"}]`. */
  @property({ converter: jsonPropertyConverter }) bands?: ScorecardBand[]

  override type: 'checkbox' | 'radio' = 'radio'

  private readonly scoreMsg = new LocalizeController(this, scorecardMessages)

  /** The tallies of the last inputs, so a render tallies once whatever reads them. */
  #memo?: { inputs: unknown[]; best: number; score: ScorecardScore; groups: Map<string, ScorecardScore> }
  #formats = new Map<string, Intl.NumberFormat>()

  /** A criterion takes one answer: `type` cannot turn a scorecard into checkboxes. */
  protected override get radio(): boolean {
    return true
  }

  /** Where the scorecard stands now. Disabled criteria are left out. */
  get score(): ScorecardScore {
    return this.#tallies().score
  }

  #tallies() {
    const inputs = [this.value, this.rows, this.columns, this.bands]
    if (this.#memo && this.#memo.inputs.every((input, index) => input === inputs[index])) return this.#memo
    const best = this.#bestOf()
    const rows = (this.rowList as ScorecardRow[]).filter((row) => !row.disabled)
    const groups = new Map<string, ScorecardScore>()
    for (const group of new Set(rows.map((row) => row.group ?? ''))) {
      groups.set(
        group,
        this.#tally(
          rows.filter((row) => (row.group ?? '') === group),
          best,
        ),
      )
    }
    this.#memo = { inputs, best, score: this.#tally(rows, best), groups }
    return this.#memo
  }

  #points(column: ScorecardColumn): number {
    if (typeof column.points === 'number' && Number.isFinite(column.points)) return column.points
    const read = Number(column.value)
    return column.value !== '' && Number.isFinite(read) ? read : this.columnList.indexOf(column)
  }

  #weight(row: ScorecardRow): number {
    return typeof row.weight === 'number' && Number.isFinite(row.weight) && row.weight >= 0 ? row.weight : 1
  }

  /** The most a row's answer can earn: the best point a scale column gives. */
  #bestOf(): number {
    return (this.columnList as ScorecardColumn[]).filter((column) => !column.na).reduce((best, column) => Math.max(best, this.#points(column)), -Infinity)
  }

  #best(): number {
    const best = this.#tallies().best
    return Number.isFinite(best) ? best : 0
  }

  #answer(row: ScorecardRow): ScorecardColumn | undefined {
    const chosen = this.chosen(row.value)[0]
    return (this.columnList as ScorecardColumn[]).find((column) => column.value === chosen)
  }

  #tally(rows: ScorecardRow[], bestOf: number): ScorecardScore {
    const best = Number.isFinite(bestOf) ? bestOf : 0
    let points = 0
    let possible = 0
    let answered = 0
    const failed: string[] = []
    for (const row of rows) {
      const answer = this.#answer(row)
      if (!answer) continue
      answered++
      if (row.critical && answer.fail) failed.push(row.value)
      if (answer.na) continue
      const weight = this.#weight(row)
      points += this.#points(answer) * weight
      possible += best * weight
    }
    const percent = possible > 0 ? (points / possible) * 100 : undefined
    const bands = Array.isArray(this.bands) ? [...this.bands].filter((band) => band && typeof band.min === 'number').sort((a, b) => b.min - a.min) : []
    const band = failed.length || percent === undefined ? undefined : bands.find((item) => percent >= item.min)
    return { points, possible, percent, answered, total: rows.length, failed, band }
  }

  #number(value: number): string {
    const locale = this.scoreMsg.locale
    let format = this.#formats.get(locale)
    if (!format) this.#formats.set(locale, (format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })))
    return format.format(value)
  }

  protected override commit(cells: [ChoiceMatrixRow, ChoiceMatrixColumn][], checked: boolean): void {
    super.commit(cells, checked)
    this.dispatchEvent(new CustomEvent('score-change', { detail: this.score }))
  }

  protected override get defaultLabel(): string {
    return this.scoreMsg.t('label')
  }

  protected override get trailingColumns(): number {
    return 1
  }

  protected override renderRowHeader(row: ScorecardRow, id: string) {
    const weight = this.#weight(row)
    // The marks sit beside the label rather than in it: the label names each answer, the marks only the criterion.
    return html`<th class="row-header" part="row-header" scope="row">
      <span class="row-label" id=${id}>${row.label}</span>${
        weight !== 1
          ? html`<span class="weight" part="weight" aria-hidden="true">${this.scoreMsg.t('weight', this.#number(weight))}</span
              ><span class="hidden-text">${this.scoreMsg.t('weightName', this.#number(weight))}</span>`
          : nothing
      }${row.critical ? html`<span class="hidden-text">${this.scoreMsg.t('separator')}</span><span class="critical" part="critical">${this.scoreMsg.t('critical')}</span>` : nothing}
      ${row.description ? html`<span class="description" part="description">${row.description}</span>` : nothing}
    </th>`
  }

  protected override renderTrailing(kind: 'header' | 'toggle' | 'group' | 'row', row?: ChoiceMatrixRow): unknown {
    if (kind === 'header') return html`<th class="score-header" part="score-header" scope="col">${this.scoreMsg.t('score')}</th>`
    if (kind === 'toggle') return html`<td class="score"></td>`
    if (kind === 'group') {
      // The group's subtotal: the rows under the header that this cell sits on.
      const group = (row as ScorecardRow | undefined)?.group
      const subtotal = group === undefined ? undefined : this.#tallies().groups.get(group)
      return html`<td class="score" part="row-score">${subtotal ? this.#ratio(subtotal) : ''}</td>`
    }
    const criterion = row as ScorecardRow
    const answer = criterion.disabled ? undefined : this.#answer(criterion)
    let text = ''
    if (answer?.na) text = this.scoreMsg.t('notApplicable')
    else if (answer) {
      const weight = this.#weight(criterion)
      text = this.scoreMsg.t('points', this.#number(this.#points(answer) * weight), this.#number(this.#best() * weight))
    }
    return html`<td class="score" part="row-score">${text}</td>`
  }

  #ratio(score: ScorecardScore): string {
    return score.possible > 0 ? this.scoreMsg.t('points', this.#number(score.points), this.#number(score.possible)) : ''
  }

  protected override renderSummary(): unknown {
    const score = this.score
    const failed = new Set(score.failed)
    const labels = (this.rowList as ScorecardRow[]).filter((row) => failed.has(row.value)).map((row) => String(row.label))
    // The total is read out as it changes, the verdict with it.
    return html`<div class="summary" part="summary" role="status">
      <span class="summary-total">
        <span class="summary-label">${this.scoreMsg.t('total')}</span>
        <span class="total">${this.#ratio(score) || this.scoreMsg.t('noScore')}</span>
        ${score.percent === undefined ? nothing : html`<span class="percent">${new Intl.NumberFormat(this.scoreMsg.locale, { style: 'percent', maximumFractionDigits: 0 }).format(score.percent / 100)}</span>`}
      </span>
      <span class="answered">${this.scoreMsg.t('answered', this.#number(score.answered), this.#number(score.total))}</span>
      ${
        labels.length
          ? html`<span class="verdict verdict--error" part="failed"
              >${this.scoreMsg.t('failed', formatList(this.scoreMsg.locale, labels, 'conjunction'))}</span
            >`
          : score.band
            ? html`<span class="verdict verdict--${score.band.tone ?? 'neutral'}" part="band">${score.band.label}</span>`
            : nothing
      }
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-scorecard': Scorecard
  }
}
