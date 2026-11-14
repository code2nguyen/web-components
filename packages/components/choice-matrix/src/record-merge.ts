import { html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { customElement } from '@c2n/core/element-helper.js'
import { ChoiceMatrix, type ChoiceMatrixCellContext, type ChoiceMatrixColumn, type ChoiceMatrixRow } from './choice-matrix'
import styles from './record-merge.scss?inline'
import { recordMergeMessages } from './record-merge-messages'

export { recordMergeMessages } from './record-merge-messages'

// `Intl.ListFormat` is ES2021, above the library's ES2020 typings; every engine the components support has it.
const ListFormat = (Intl as unknown as { ListFormat?: new (locale: string, options: { type: 'unit'; style: 'short' }) => { format(items: string[]): string } })
  .ListFormat

/** One of the records being merged: a column. */
export interface RecordMergeRecord {
  id: string
  /** The column title, such as the record's name and where it came from. */
  label: string
  /** Its fields, by key. */
  values: Record<string, unknown>
}

/** One field of the records: a row. */
export interface RecordMergeField {
  key: string
  label: string
  description?: string
  /** Fields with the same group are listed together under a header row with that title. */
  group?: string
  /** The field can't be chosen: the surviving record's value is kept. */
  disabled?: boolean
}

/** What `formatValue` is handed to write a value in a cell and in the result. */
export interface RecordMergeValueContext {
  field: RecordMergeField
  value: unknown
}

/**
 * Two or three duplicate records side by side, one row per field, to pick the value each field keeps, as the duplicate
 * merge of a CRM reads. Each record is a column whose cells show its values; choosing a cell picks that record's value
 * for the field, and "Use all" under a column takes every field from that record.
 *
 * `records` are `{ id, label, values }`. `fields` (`{ key, label, group, description }`) list the rows in order; left
 * out, every key of the records is a row. Every field starts on the `primary` record (the first by default), so the
 * merge only asks for what changes; a field still on it by default follows a change of `primary`. `merged` is the surviving record: the primary's values with each field taken from
 * the record chosen for it. `preview` adds a column with the result of each field. `value` is a `c2-choice-matrix`
 * value, the record id chosen for each field key, and a form receives `name[field]=record` for each (a key holding `[`
 * or `]` nests in a server that parses brackets, so keep field keys plain).
 *
 * Everything `c2-choice-matrix` with `type="radio"` does applies: the arrow keys move along a field's row, a disabled
 * field keeps the primary's value, and `required` asks for every field to be chosen.
 *
 * @tag c2-record-merge
 *
 * @csspart result - A cell of the result column (`preview`).
 * @csspart result-header - The title of the result column.
 * @csspart empty - The word shown for a field a record has no value in.
 *
 * @cssproperty {color} [--c2-record-merge__result--background-color=#f4f4f5] - The result column (`preview`).
 * @cssproperty {color} [--c2-record-merge__result--color=#18181b]
 * @cssproperty {font-weight} [--c2-record-merge__result--font-weight=500]
 * @cssproperty {color} [--c2-record-merge__empty--color=#63636b] - The word shown for a field with no value.
 */
@customElement('c2-record-merge')
export class RecordMerge extends ChoiceMatrix {
  static override styles = [ChoiceMatrix.styles, unsafeCSS(styles)]

  /** The records to merge, one column each. As an attribute, a JSON array of `{ id, label, values }`. */
  @property({ converter: jsonPropertyConverter }) records: RecordMergeRecord[] = []

  /** The fields to compare, one row each, in order. Left out, every key of the records is a row. As an attribute, JSON. */
  @property({ converter: jsonPropertyConverter }) fields?: RecordMergeField[]

  /** The id of the record that survives: every field starts on it. The first record when empty. */
  @property() primary = ''

  /** Adds a column after the records with the value each field ends up with. */
  @property({ type: Boolean }) preview = false

  /** Writes a value in a cell and in the result; by default text, a list joined by commas, an object as JSON. */
  @property({ attribute: false }) formatValue?: (context: RecordMergeValueContext) => unknown

  override type: 'checkbox' | 'radio' = 'radio'
  override useAll = true

  private readonly mergeMsg = new LocalizeController(this, recordMergeMessages)

  /** The records with an id, by id; the fields, in order and by key. Rebuilt when `records` or `fields` change. */
  #recordList: RecordMergeRecord[] = []
  #recordById = new Map<string, RecordMergeRecord>()
  #fieldList: RecordMergeField[] = []
  #fieldByKey = new Map<string, RecordMergeField>()
  /** Fields the merge put on the primary record rather than the user: they follow `primary` when it changes. */
  #onPrimary = new Set<string>()

  /** The surviving record: the primary's values, with each field taken from the record chosen for it. */
  get merged(): Record<string, unknown> {
    this.#index()
    const primary = this.#primary()
    const merged: Record<string, unknown> = { ...primary?.values }
    for (const field of this.#fieldList) {
      const record = this.#chosenRecord(field) ?? primary
      if (record && Object.prototype.hasOwnProperty.call(record.values ?? {}, field.key)) merged[field.key] = record.values[field.key]
      else delete merged[field.key]
    }
    return merged
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed)
    if (changed.has('records') || changed.has('fields')) {
      this.#index()
      this.columns = this.#recordList.map((record) => ({ value: record.id, label: record.label }))
      this.rows = this.#fieldList.map((field) => ({
        value: field.key,
        label: field.label,
        description: field.description,
        group: field.group,
        disabled: field.disabled,
      }))
    }
    // A change of primary moves the fields that were only on it by default; the user's choices stay.
    if (changed.has('primary') && changed.get('primary') !== undefined && this.#onPrimary.size) {
      const value = this.copy(this.value ?? {})
      for (const key of this.#onPrimary) delete value[key]
      this.value = value
    }
    if (changed.has('records') || changed.has('fields') || changed.has('primary') || changed.has('value')) this.#fillFromPrimary()
  }

  /** The user chose: those fields are theirs now, and no longer follow `primary`. */
  protected override commit(cells: [ChoiceMatrixRow, ChoiceMatrixColumn][], checked: boolean): void {
    for (const [row] of cells) this.#onPrimary.delete(row.value)
    super.commit(cells, checked)
  }

  /** Every field without a record chosen starts on the primary one, so only what differs needs a click; a form reset and a new `value` keep that. */
  #fillFromPrimary() {
    const primary = this.#primary()
    if (!primary) return
    const value = this.value ?? {}
    const missing = this.#fieldList.filter((field) => {
      const chosen = value[field.key]
      return !(typeof chosen === 'string' && this.#recordById.has(chosen))
    })
    if (!missing.length) return
    const next = this.copy(value)
    for (const field of missing) {
      next[field.key] = primary.id
      this.#onPrimary.add(field.key)
    }
    this.value = next
  }

  /** Each cell shows its record's value for the field; a `renderCell` set by the app still wins. */
  protected override cellContent(context: ChoiceMatrixCellContext): unknown {
    if (this.renderCell) return this.renderCell(context)
    return this.#display(this.#fieldOf(context.row), this.#recordById.get(context.column.value)?.values)
  }

  protected override get defaultLabel(): string {
    return this.mergeMsg.t('label')
  }

  protected override renderTrailing(kind: 'header' | 'toggle' | 'group' | 'row', row?: ChoiceMatrixRow): unknown {
    if (!this.preview) return nothing
    if (kind === 'header') return html`<th class="result-header" part="result-header" scope="col">${this.mergeMsg.t('result')}</th>`
    if (kind !== 'row' || !row) return html`<td class="result-gap"></td>`
    const field = this.#fieldOf(row)
    const record = this.#chosenRecord(field) ?? this.#primary()
    return html`<td class="result" part="result">${this.#display(field, record?.values)}</td>`
  }

  /** A field's value in a record as a cell shows it: the app's `formatValue`, else text; "Empty" when there is none. */
  #display(field: RecordMergeField, values: Record<string, unknown> | undefined): unknown {
    const value = values?.[field.key]
    if (this.formatValue) return this.formatValue({ field, value })
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) {
      return html`<span class="empty" part="empty">${this.mergeMsg.t('emptyValue')}</span>`
    }
    // A list reads as one in the page's language.
    if (Array.isArray(value))
      return ListFormat ? new ListFormat(this.mergeMsg.locale, { type: 'unit', style: 'short' }).format(value.map(String)) : value.join(', ')
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
  }

  /** Builds the lookups `records` and `fields` need; kept while they are the same arrays. */
  #indexed: unknown[] = []
  #index() {
    if (this.#indexed[0] === this.records && this.#indexed[1] === this.fields) return
    this.#indexed = [this.records, this.fields]
    this.#recordList = Array.isArray(this.records) ? this.records.filter((record) => record && typeof record.id === 'string') : []
    this.#recordById = new Map(this.#recordList.map((record) => [record.id, record]))
    this.#fieldList = Array.isArray(this.fields)
      ? this.fields.filter((field) => field && typeof field.key === 'string')
      : [...new Set(this.#recordList.flatMap((record) => Object.keys(record.values ?? {})))].map((key) => ({ key, label: key }))
    this.#fieldByKey = new Map(this.#fieldList.map((field) => [field.key, field]))
  }

  #primary(): RecordMergeRecord | undefined {
    return this.#recordById.get(this.primary) ?? this.#recordList[0]
  }

  #fieldOf(row: ChoiceMatrixRow): RecordMergeField {
    return this.#fieldByKey.get(row.value) ?? { key: row.value, label: row.label }
  }

  #chosenRecord(field: RecordMergeField): RecordMergeRecord | undefined {
    const chosen = this.value?.[field.key]
    return this.#recordById.get(Array.isArray(chosen) ? chosen[0] : (chosen ?? ''))
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-record-merge': RecordMerge
  }
}
