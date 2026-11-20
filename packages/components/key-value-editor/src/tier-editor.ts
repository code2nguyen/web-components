import { html, nothing, unsafeCSS } from 'lit'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { repeat } from 'lit/directives/repeat.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { KeyValueEditor, type KeyValueEditorEventMap, type KeyValueEntry } from './key-value-editor.js'
import { tierEditorMessages } from './tier-editor-messages.js'
import { parseNumber, quoteTiers, type TierEditorPricing, type TierEditorQuote, type TierEditorTier } from './tiers.js'
import styles from './tier-editor.scss?inline'

export { parseNumber, quoteTiers, rateOf, type TierEditorPricing, type TierEditorQuote, type TierEditorTerm, type TierEditorTier } from './tiers.js'

/** What `renderPreview` receives. */
export interface TierEditorPreviewContext {
  quote: TierEditorQuote
  tiers: TierEditorTier[]
  /** Formats a number in the editor's language, as the built-in preview does. */
  format: (value: number) => string
  /** Formats the total with `total-format`, as the built-in preview does. */
  formatTotal: (value: number) => string
}

/** Draws the line under the tiers while `quantity` is set, in place of the built-in "At 1,200: … = 58". */
export type TierEditorPreviewRenderer = (context: TierEditorPreviewContext) => unknown

/** Events fired by {@link TierEditor}, keyed for `addEventListener`: the key-value editor's. */
export type TierEditorEventMap = KeyValueEditorEventMap

export interface TierEditor {
  addEventListener: TypedAddEventListener<TierEditor, TierEditorEventMap>
  removeEventListener: TypedRemoveEventListener<TierEditor, TierEditorEventMap>
}

/**
 * Contiguous numeric tiers edited as rows, for tiered pricing (Stripe, Chargebee), commission accelerators, grading
 * schemes and thresholds. Each row is a tier: its first value (read-only, the bound of the tier before plus `step`), its
 * upper bound and its rate. The last tier may leave its bound empty to cover everything above. A tier's range follows
 * from the one before, so tiers cannot leave a gap; a bound that does not rise above the one before, or that is not a
 * number, is flagged under its row, and so is an empty bound on any tier but the last.
 *
 * It is [`c2-key-value-editor`](/web-components/components/key-value-editor) with its rows fixed to tiers: the key is
 * the bound and the value the rate. **Add tier** inserts a tier above the open last one, Enter moves from a bound to
 * its rate and on to the next tier, Backspace in an empty tier removes it, and several lines copied from a spreadsheet
 * (bound and rate, or from, to and rate, separated by tabs) paste as tiers. `mode="view"`, `lock-keys`, `disabled`,
 * `required`, the slots and the events work as there; `masked` and `key-pattern` do not apply.
 *
 * `quantity` adds a live preview under the tiers: what that quantity comes to with `pricing="graduated"` (each tier's
 * rate on the part of the quantity inside it) or `pricing="volume"` (the rate of the tier it falls in, on all of it),
 * with the tiers it reaches highlighted. A rate written as a percentage (`5%`) counts as a factor; a rate that is not a
 * number (a grade) shows as the value of the tier the quantity falls in. `total-format` formats the total (a currency)
 * and `renderPreview` replaces the line. `quoteTiers()` computes the same quote anywhere.
 *
 * `tiers` reads and sets the rows as numbers (`[{ "upTo": 1000, "value": 0.05 }, { "upTo": null, "value": 0.03 }]`);
 * `entries` holds the same rows as text, and whichever of the two is set last wins. The form submits the tiers as that
 * JSON under `name`.
 *
 * @tag c2-tier-editor
 *
 * @csspart preview - The line under the tiers while `quantity` is set: it holds the built-in quote, or what `renderPreview` returns.
 *
 * @cssproperty {length} [--c2-tier-editor--from-width=minmax(0, 1fr)] - Grid track of the "From" column.
 * @cssproperty {length} [--c2-tier-editor--bound-width=minmax(0, 1fr)] - Grid track of the bound column.
 * @cssproperty {length} [--c2-tier-editor--rate-width=minmax(0, 1fr)] - Grid track of the rate column.
 * @cssproperty {color} [--c2-tier-editor__from--background=#fafafa] - Background of a tier's first value.
 * @cssproperty {color} [--c2-tier-editor__from--color=#71717a]
 * @cssproperty {color} [--c2-tier-editor__from__used--background=#edf1fe] - A tier the preview's quantity passes through (graduated).
 * @cssproperty {color} [--c2-tier-editor__from__used--color=#18181b]
 * @cssproperty {color} [--c2-tier-editor__from__match--background=#edf1fe] - The tier the preview's quantity falls in.
 * @cssproperty {color} [--c2-tier-editor__from__match--color=#18181b]
 * @cssproperty {border} [--c2-tier-editor__from__match--border=1px solid rgb(2, 101, 220)]
 * @cssproperty {font-weight} [--c2-tier-editor__from__match--font-weight=600]
 * @cssproperty {padding} [--c2-tier-editor__preview--padding=8px 12px]
 * @cssproperty {border} [--c2-tier-editor__preview--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-tier-editor__preview--border-radius=6px]
 * @cssproperty {color} [--c2-tier-editor__preview--background=#fafafa]
 * @cssproperty {color} [--c2-tier-editor__preview--color=#18181b]
 * @cssproperty {font-size} [--c2-tier-editor__preview--font-size=13px]
 * @cssproperty {color} [--c2-tier-editor__breakdown--color=#71717a] - The tiers' shares in the preview.
 * @cssproperty {font-weight} [--c2-tier-editor__total--font-weight=600] - The preview's total.
 */
@customElement('c2-tier-editor')
export class TierEditor extends KeyValueEditor {
  static override styles = [KeyValueEditor.styles, unsafeCSS(styles)]

  /** How `quantity` is priced: `graduated` (default) or `volume`. */
  @property({ type: String }) pricing: TierEditorPricing = 'graduated'

  /** The first value of the first tier. */
  @property({ type: Number }) start = 0

  /** The gap between a bound and the first value of the next tier: `1` for whole units (1–1,000, then 1,001–5,000), `0` (default) for a continuous scale (0–1,000, then 1,000–5,000). */
  @property({ type: Number }) step = 0

  /** A quantity to preview: what it comes to over the tiers shows under them, and the tiers it reaches are highlighted. */
  @property({ type: Number }) quantity?: number

  /** `Intl.NumberFormat` options for the preview's total, e.g. `{"style":"currency","currency":"USD"}`. */
  @property({ attribute: 'total-format', converter: jsonPropertyConverter }) totalFormat?: Intl.NumberFormatOptions

  /** Draws the preview line in place of the built-in quote. */
  @property({ attribute: false }) renderPreview?: TierEditorPreviewRenderer

  private readonly tierMsg = new LocalizeController(this, tierEditorMessages)
  private numberFormat: { key: string; format: Intl.NumberFormat } | null = null
  private separators: { locale: string; group: string; decimal: string } | null = null
  private layoutCache: { key: unknown[]; result: { from: number[]; errors: Map<number, string> } } | null = null
  /** What every row draws from, worked out once per render: each row's first value, its tier and the preview's quote. */
  private view: { from: number[]; tierOf: number[]; quote: TierEditorQuote | null } = { from: [], tierOf: [], quote: null }
  private totalNumberFormat: { key: string; format: Intl.NumberFormat } | null = null

  constructor() {
    super()
    // Text properties of the key-value editor fall back to the tier messages while left empty; the placeholders show
    // none unless set.
    this.keyPlaceholder = ''
    this.valuePlaceholder = ''
  }

  /**
   * The tiers that are filled in, as numbers: `{ from, upTo, value }`. Setting it replaces the rows (`entries`, which
   * holds the same rows as text); `from` is ignored. When both are given, the one set last wins.
   */
  @property({ attribute: 'tiers', converter: jsonPropertyConverter })
  get tiers(): TierEditorTier[] {
    const froms = this.layout(this.realRows).from
    return this.realRows.flatMap((entry, index) => {
      if (!this.isFilled(entry)) return []
      const bound = String(entry.key ?? '').trim()
      return [{ from: froms[index], upTo: bound === '' ? null : (this.parse(bound) ?? NaN), value: this.rateValue(String(entry.value ?? '')) }]
    })
  }

  set tiers(tiers: TierEditorTier[] | string | null | undefined) {
    const list = typeof tiers === 'string' ? jsonPropertyConverter.fromProperty(tiers) : tiers
    if (!Array.isArray(list)) return
    this.entries = list
      .filter((tier): tier is TierEditorTier => tier !== null && typeof tier === 'object')
      .map(({ upTo, value }) => ({
        key: upTo === null || upTo === undefined ? '' : String(upTo),
        value: value === null || value === undefined ? '' : String(value),
      }))
  }

  /** What `quantity` comes to over the tiers, with this editor's `pricing`, `start` and `step`. */
  quote(quantity: number): TierEditorQuote {
    return quoteTiers(this.tiers, quantity, { pricing: this.pricing, start: this.firstValue, step: this.gap })
  }

  /** Adds a tier above the open last one, which stays last, and focuses its bound. */
  override async addEntry(entry: KeyValueEntry = { key: '', value: '' }): Promise<void> {
    const rows = this.realRows
    const last = rows[rows.length - 1]
    if (!last || String(last.key ?? '').trim() !== '' || !this.isFilled(last)) return super.addEntry(entry)
    const at = rows.length - 1
    this.commitRows([...rows.slice(0, at), { ...entry }, last])
    await this.updateComplete
    this.focusField(at, entry.key ? 'value' : 'key')
  }

  override formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state !== 'string') return
    try {
      this.tiers = state ? JSON.parse(state) : []
    } catch {
      // Not a state this editor saved.
    }
  }

  private get firstValue(): number {
    return Number.isFinite(this.start) ? this.start : 0
  }

  private get gap(): number {
    return Number.isFinite(this.step) && this.step > 0 ? this.step : 0
  }

  /**
   * A bound or a rate typed as a number: digits with a dot for decimals, or written the way the editor's language
   * writes numbers (`5,000` in English, `0,04` in French). `null` when it is neither.
   */
  private parse(text: string): number | null {
    const compact = text.replace(/[\s\u00a0\u202f_]/g, '')
    const plain = parseNumber(compact)
    if (plain !== null || compact === '') return plain
    const locale = this.tierMsg.locale
    if (this.separators?.locale !== locale) {
      const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
      this.separators = {
        locale,
        group: parts.find((part) => part.type === 'group')?.value ?? ',',
        decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
      }
    }
    const { group, decimal } = this.separators
    const grouping = /\s/.test(group) ? '' : group
    return parseNumber((grouping ? compact.split(grouping).join('') : compact).replace(decimal, '.'))
  }

  /** A rate as `tiers` holds it: a number, a percentage with a dot for decimals, or the text as typed. */
  private rateValue(text: string): number | string {
    const percent = /^(.*)%$/.exec(text.trim())
    const number = this.parse(percent ? percent[1] : text)
    if (number === null) return text
    return percent ? `${number}%` : number
  }

  /**
   * Each row's first value and refusal, by index. A blank row (no bound, no rate) is skipped: it neither starts a tier
   * nor is refused, so a tier just added shows no error before it is typed into. Worked out once per set of rows.
   */
  private layout(rows: readonly KeyValueEntry[]): { from: number[]; errors: Map<number, string> } {
    const key = [this.entries, rows.length, this.firstValue, this.gap, this.tierMsg.locale]
    if (this.layoutCache && key.every((part, index) => Object.is(part, this.layoutCache!.key[index]))) return this.layoutCache.result
    const result = this.computeLayout(rows)
    this.layoutCache = { key, result }
    return result
  }

  private computeLayout(rows: readonly KeyValueEntry[]): { from: number[]; errors: Map<number, string> } {
    const from: number[] = []
    const errors = new Map<number, string>()
    const filled = rows.flatMap((entry, index) => (this.isFilled(entry) ? [index] : []))
    const lastFilled = filled[filled.length - 1]
    let lower = this.firstValue - this.gap
    rows.forEach((entry, index) => {
      from[index] = lower + this.gap
      if (!this.isFilled(entry)) return
      const text = String(entry.key ?? '').trim()
      if (text === '') {
        if (index !== lastFilled) errors.set(index, this.tierMsg.t('openNotLast'))
        return
      }
      const bound = this.parse(text)
      if (bound === null) errors.set(index, this.tierMsg.t('notNumber'))
      // With a step, a tier must reach at least its own first value; on a continuous scale, rise above the bound before.
      else if (this.gap > 0 && bound < from[index]) errors.set(index, this.tierMsg.t('notBelow', this.format(from[index])))
      else if (this.gap === 0 && !(bound > lower)) errors.set(index, this.tierMsg.t('notAbove', this.format(lower)))
      else lower = bound
    })
    return { from, errors }
  }

  protected override keyErrors(rows: readonly KeyValueEntry[]): Map<number, string> {
    return this.layout(rows).errors
  }

  /** The tier editor's refusals are messages already. */
  protected override keyErrorMessage(error: string): string {
    return error
  }

  /** A tier is filled in once it has a bound or a rate. */
  protected override isFilled(entry: KeyValueEntry): boolean {
    return String(entry.key ?? '').trim() !== '' || String(entry.value ?? '').trim() !== ''
  }

  /**
   * The tiers as JSON (`[{ "upTo": 1000, "value": 0.05 }, …]`); nothing while no tier is filled in. A bound that is not
   * a number is sent as typed, so a refused bound never reads as an open tier.
   */
  protected override formValue(): string {
    const tiers = this.realRows.flatMap((entry) => {
      if (!this.isFilled(entry)) return []
      const bound = String(entry.key ?? '').trim()
      return [{ upTo: bound === '' ? null : (this.parse(bound) ?? bound), value: this.rateValue(String(entry.value ?? '')) }]
    })
    return tiers.length ? JSON.stringify(tiers) : ''
  }

  protected override valueMissingMessage(): string {
    return this.tierMsg.t('valueMissing')
  }

  protected override addButtonLabel(): string {
    return this.addLabel || this.tierMsg.t('addTier')
  }

  protected override emptyLabel(): string {
    return this.tierMsg.t('empty')
  }

  private get boundColumn(): string {
    return this.keyLabel || this.tierMsg.t('upTo')
  }

  private get rateColumn(): string {
    return this.valueLabel || this.tierMsg.t('rate')
  }

  /** A number in the editor's language. */
  private format(value: number): string {
    const locale = this.tierMsg.locale
    if (this.numberFormat?.key !== locale) this.numberFormat = { key: locale, format: new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }) }
    return this.numberFormat.format.format(value)
  }

  /** The preview's total, with `total-format`. */
  private formatTotal = (value: number): string => {
    const key = `${this.tierMsg.locale} ${JSON.stringify(this.totalFormat ?? null)}`
    if (this.totalNumberFormat?.key !== key) {
      let format: Intl.NumberFormat
      try {
        format = new Intl.NumberFormat(this.tierMsg.locale, this.totalFormat ?? { maximumFractionDigits: 6 })
      } catch {
        format = new Intl.NumberFormat(this.tierMsg.locale, { maximumFractionDigits: 6 })
      }
      this.totalNumberFormat = { key, format }
    }
    return this.totalNumberFormat.format.format(value)
  }

  private formatNumber = (value: number) => this.format(value)

  /** A rate as typed, or formatted when it was given as a number. */
  private rateText(value: number | string): string {
    return typeof value === 'number' ? this.format(value) : value
  }

  override render() {
    const rows = this.rows
    const { from, errors } = this.layout(rows)
    let tier = 0
    const tierOf = rows.map((row) => (this.isFilled(row) ? tier++ : -1))
    const quantity = this.quantity
    // The preview waits for valid tiers: a quote over a refused bound would be wrong.
    const quote = typeof quantity === 'number' && Number.isFinite(quantity) && errors.size === 0 ? this.quote(quantity) : null
    this.view = { from, tierOf, quote }
    return super.render()
  }

  /** Copied spreadsheet lines (bound and rate, or from, to and rate, separated by tabs) paste as tiers. */
  protected override async handlePaste(event: ClipboardEvent, index: number, field: 'key' | 'value') {
    if (!this.editable || this.lockKeys) return
    const text = event.clipboardData?.getData('text/plain') ?? ''
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
    if (!lines.length || !lines.every((line) => line.includes('\t')) || (lines.length < 2 && field === 'value')) return
    event.preventDefault()
    const pasted = lines.map((line) => {
      const cells = line.split('\t').map((cell) => cell.trim())
      return { key: cells[cells.length - 2] ?? '', value: cells[cells.length - 1] ?? '' }
    })
    const rows = [...this.rows]
    const current = rows[index]
    const blank = current !== undefined && !this.isFilled(current)
    // Pasted into the open last tier, the new tiers go above it so it stays last.
    const openLast = !blank && current !== undefined && index === rows.length - 1 && String(current.key ?? '').trim() === ''
    const at = blank || openLast ? index : index + 1
    rows.splice(at, blank ? 1 : 0, ...pasted)
    this.fieldDirty = false
    this.commitRows(rows.filter((row) => this.isFilled(row)))
    await this.updateComplete
    this.focusField(Math.min(at + pasted.length - 1, this.rows.length - 1), 'value')
  }

  protected override renderHeader() {
    return html`<div class="header" aria-hidden="true">
      <span>${this.tierMsg.t('from')}</span>
      <span>${this.boundColumn}</span>
      <span>${this.rateColumn}</span>
    </div>`
  }

  protected override renderRow(entry: KeyValueEntry, index: number, error: string | undefined) {
    const id = this.idOf(entry)
    const number = index + 1
    const errorId = `error-${id}`
    const { quote } = this.view
    const from = this.format(this.view.from[index] ?? this.firstValue)
    const bound = String(entry.key ?? '')
    const value = String(entry.value ?? '')
    const last = index === this.view.from.length - 1
    const locked = this.isKeyLocked(entry)
    const tierIndex = this.view.tierOf[index] ?? -1
    const used = quote !== null && tierIndex !== -1 && quote.terms.some((term) => term.tier === tierIndex)
    const match = quote !== null && tierIndex !== -1 && quote.tier === tierIndex
    const fieldInvalid = this.formField.invalid && !this.isDisabled
    const boundCell = locked
      ? html`<span class="key locked" aria-invalid=${error ? 'true' : nothing} aria-describedby=${ifDefined(error ? errorId : undefined)} title=${bound}
          >${bound.trim() === '' ? this.tierMsg.t('noLimit') : bound}</span
        >`
      : html`<input
          class="key"
          type="text"
          inputmode="decimal"
          enterkeyhint="next"
          aria-label=${this.tierMsg.t('boundField', this.boundColumn, number, from)}
          aria-invalid=${error || fieldInvalid ? 'true' : nothing}
          aria-describedby=${ifDefined(error ? errorId : undefined)}
          placeholder=${this.keyPlaceholder || (last ? this.tierMsg.t('noLimit') : nothing)}
          autocomplete="off"
          spellcheck="false"
          ?disabled=${this.isDisabled}
          .value=${live(bound)}
          @input=${(event: Event) => this.handleInput(event, index, 'key')}
          @change=${this.handleChange}
          @keydown=${(event: KeyboardEvent) => this.handleKeydown(event, index, 'key')}
          @paste=${(event: ClipboardEvent) => this.handlePaste(event, index, 'key')}
        />`
    return html`<div class="row ${classMap({ invalid: error !== undefined, used: used && !match, match })}">
      <span class="from" aria-hidden="true">${from}</span>
      ${boundCell}
      <span class="value-box">
        <input
          class="value"
          type="text"
          enterkeyhint="next"
          aria-label=${this.tierMsg.t('rateField', this.rateColumn, number)}
          aria-invalid=${fieldInvalid ? 'true' : nothing}
          placeholder=${this.valuePlaceholder || nothing}
          autocomplete="off"
          spellcheck="false"
          ?disabled=${this.isDisabled}
          .value=${live(value)}
          @input=${(event: Event) => this.handleInput(event, index, 'value')}
          @change=${this.handleChange}
          @keydown=${(event: KeyboardEvent) => this.handleKeydown(event, index, 'value')}
          @paste=${(event: ClipboardEvent) => this.handlePaste(event, index, 'value')}
        />
      </span>
      ${
        locked
          ? nothing
          : html`<button
              class="button remove"
              type="button"
              aria-label=${this.tierMsg.t('removeTier', number)}
              ?disabled=${this.isDisabled}
              @click=${() => this.handleRemove(index)}
            >
              ${
                this.removeIcon.assigned
                  ? this.removeIcon.copy(String(id))
                  : html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>`
              }
            </button>`
      }
      ${error ? html`<span class="error" id=${errorId}>${error}</span>` : nothing}
    </div>`
  }

  /** View mode: each filled tier as its range and its rate. */
  protected override renderView() {
    const tiers = this.tiers
    if (tiers.length === 0) return this.renderEmpty()
    return html`<dl class="list">
      ${repeat(
        tiers,
        (_tier, index) => index,
        (tier) =>
          html`<div class="item">
            <dt class="item-key range">
              <span>${this.format(tier.from ?? this.firstValue)}</span>
              <span
                ><span class="visually-hidden">${this.tierMsg.t('to')} </span>${tier.upTo === null ? this.tierMsg.t('noLimit') : this.format(tier.upTo)}</span
              >
            </dt>
            <dd class="item-value"><span class="text">${this.rateText(tier.value)}</span></dd>
          </div>`,
      )}
    </dl>`
  }

  protected override renderBelowRows(): unknown {
    const { quote } = this.view
    if (!quote) return nothing
    const tiers = this.tiers
    const content = this.renderPreview
      ? this.renderPreview({ quote, tiers, format: this.formatNumber, formatTotal: this.formatTotal })
      : this.renderQuote(quote)
    return html`<div class="preview" part="preview">${content}</div>`
  }

  private renderQuote(quote: TierEditorQuote) {
    const quantity = this.format(quote.quantity)
    if (quote.tier === -1) return html`<span>${this.tierMsg.t('noTier', quantity)}</span>`
    const at = html`<span>${this.tierMsg.t('previewAt', quantity)}</span>`
    if (quote.total === null) {
      const tier = quote.terms[quote.terms.length - 1] ?? { tier: quote.tier, value: this.tiers[quote.tier]?.value ?? '' }
      return html`${at}<span class="total">${this.tierMsg.t('tierValue', tier.tier + 1, this.rateText(tier.value))}</span>`
    }
    const breakdown = quote.terms.map((term) => this.tierMsg.t('term', this.format(term.units), this.rateText(term.value))).join(' + ')
    return html`${at}<span class="breakdown">${breakdown}</span><span class="total">${this.tierMsg.t('total', this.formatTotal(quote.total))}</span>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tier-editor': TierEditor
  }
}
