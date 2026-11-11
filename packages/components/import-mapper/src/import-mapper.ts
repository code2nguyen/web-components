import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import { jsonPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/select'
import '@c2n/list-item'
import {
  autoMatch,
  cellText,
  checkValue,
  missingFields,
  parseCsv,
  rowCells,
  toRecord,
  type ImportCellError,
  type ImportField,
  type ImportIssue,
  type ImportMapping,
  type ImportMatcher,
  type ImportSourceRow,
} from './import-model.js'
import { importMapperMessages } from './messages.js'
import styles from './import-mapper.scss?inline'

export { autoMatch, cellText, checkValue, detectDelimiter, matchScore, missingFields, normalizeHeader, parseCsv, MATCH_THRESHOLD } from './import-model.js'
export type { ImportCellError, ImportField, ImportFieldType, ImportIssue, ImportMapping, ImportMatcher, ImportSourceRow } from './import-model.js'
export { importMapperMessages } from './messages.js'

/** What the mapper shows: the column-to-field mapping, or the rows as they will be imported. */
export type ImportMapperView = 'map' | 'preview'

export interface ImportMapperRowsRequest {
  /** Index of the first data row requested (0 is the first row under the header). */
  start: number
  /** How many rows are requested. */
  count: number
}

export interface ImportMapperRowsResult {
  /** The rows from `start`: arrays of cells in column order, or records keyed by header. */
  rows: ImportSourceRow[]
  /** How many data rows the file has. Required on the first response. */
  total?: number
}

/**
 * Rows read on demand, for a file too large to hold in `rows`: the mapper asks for the first rows (for the sample
 * values and the first preview page) and then one page at a time. The headers come from `columns`.
 */
export interface ImportMapperDataSource {
  getRows(request: ImportMapperRowsRequest): Promise<ImportMapperRowsResult>
}

export interface ImportMapperSamplesContext {
  /** Index of the source column. */
  column: number
  /** Its header. */
  header: string
  /** Its first non-empty values, at most `sample-count`. */
  values: string[]
  /** Key of the field it is mapped to, or `null`. */
  field: string | null
}

/** Returns anything Lit can render: a `TemplateResult`, a string, a node. */
export type ImportMapperSamplesRenderer = (context: ImportMapperSamplesContext) => unknown

export interface ImportMapperCellContext {
  /** The cell's text. */
  value: string
  /** The field the cell is imported as. */
  field: ImportField
  /** Index of the data row. */
  row: number
  /** The row's mapped values, keyed by field. */
  record: Record<string, string>
  /** The cell's error message, or `null` when it is valid. The mapper still draws it under the content. */
  error: string | null
}

/** Returns anything Lit can render: a `TemplateResult`, a string, a node. */
export type ImportMapperCellRenderer = (context: ImportMapperCellContext) => unknown

/** Detail of `mapping-change`. */
export interface ImportMapperChangeDetail {
  /** The new mapping, one entry per source column. */
  mapping: ImportMapping
  /** The column the change is about, or -1 for `autoMatch()` and `clearMapping()`. */
  column: number
  /** The field that column now imports as, or `null`. */
  field: string | null
  /** Keys of the required fields no column is mapped to. */
  missing: string[]
}

/** The outcome of `validate()`. */
export interface ImportMapperValidation {
  /** No required field is missing and no checked cell has an error. */
  valid: boolean
  /** Keys of the required fields no column is mapped to. */
  missing: string[]
  /** Every invalid cell of the checked rows. */
  errors: ImportCellError[]
  /** How many rows were checked: every row, or with a `dataSource` the rows loaded so far. */
  checked: number
}

/** Events fired by {@link ImportMapper}, keyed for `addEventListener`. */
export interface ImportMapperEventMap {
  'mapping-change': CustomEvent<ImportMapperChangeDetail>
}

export interface ImportMapper {
  addEventListener: TypedAddEventListener<ImportMapper, ImportMapperEventMap>
  removeEventListener: TypedRemoveEventListener<ImportMapper, ImportMapperEventMap>
}

/** The picker's value for "Don't import": not a value a field key is likely to take. */
const SKIP = '__c2-import-skip__'
/** Rows read for each column's sample values. */
const SAMPLE_SCAN = 50

interface Analysis {
  /** Issues by row, then by column. */
  issues: Map<number, Map<number, ImportIssue>>
  count: number
}

let warnedPartial = false

/** The pickers' own form events stay inside: the mapper is not a form control, `mapping-change` is its event. */
const stop = (event: Event) => event.stopPropagation()

const arrow = svg`<path d="M5 12h14M13 6l6 6-6 6" />`
const check = svg`<path d="M5 12.5l4.5 4.5L19 7.5" />`
const alert = svg`<path d="M12 7.5v5.5M12 16.5v.5" />`

/**
 * The mapping step of a spreadsheet import: each column of the user's file, with its first values, gets a field
 * picker, pre-filled by matching the header to the fields' keys, labels and aliases. A summary lists the required
 * fields and whether a column is mapped to each. Set `view="preview"` to show the rows as they will be imported:
 * one column per mapped field and each invalid cell marked with its message.
 *
 * The file comes in three ways: `csv` (text the mapper parses; the first line is the header), `columns` and `rows`
 * (arrays of cells, or records keyed by header, as a spreadsheet library returns them), or `columns` and a
 * `dataSource` for a file too large to hold in memory. `csv` wins over the other two, and a `dataSource` is used
 * instead of `rows`. The mapper never reads the file itself: `c2-upload` or the app does.
 *
 * `fields` describes the target: each field's `key`, `label`, `required`, `type` (`number`, `integer`, `date`,
 * `email`, `url`, `boolean`), `aliases`, `options`, `pattern`, and a `validate` function for the app's own rules.
 * `mapping` holds one field key (or `null`) per column; set it to restore a mapping, and `manual` to skip matching.
 * A field maps from one column at a time: picking it for a second column takes it from the first.
 *
 * The mapper has no buttons of its own beyond the preview's pager: the app puts its Back, Preview and Import buttons in
 * the `toolbar` or `footer` slot, switches `view`, and reads `mapping`, `missing`, `validate()` and `records()`.
 *
 * Accessibility: the host is a `group` named by `label`; each picker is named after its column ("Import column
 * “E-mail” as"), mapping changes are announced politely, and an invalid cell reads its message after its value.
 *
 * @tag c2-import-mapper
 *
 * @slot toolbar - Above the mapping or the preview: the app's own actions (Preview, Import, Back). Hidden when empty.
 * @slot footer - Below the mapping or the preview. Hidden when empty.
 * @slot empty - Replaces the message shown while there is no file to map.
 * @slot loading - Replaces the message shown while a `dataSource` loads rows.
 * @slot error - Replaces the message shown when a `dataSource` fails.
 *
 * @event mapping-change - After the user picks a field for a column, and after `autoMatch()` or `clearMapping()`; `detail` is `{ mapping, column, field, missing }`.
 *
 * @csspart toolbar - Region wrapping the `toolbar` slot above the mapping or the preview; hidden while the slot is empty.
 * @csspart footer - Region wrapping the `footer` slot below the mapping or the preview; hidden while the slot is empty.
 * @csspart summary - The required fields and the mapping status.
 * @csspart columns - The list of source columns.
 * @csspart column - One source column: its header, samples and picker.
 * @csspart picker - The field picker of a column (a `c2-select`).
 * @csspart preview - The preview: summary, table and pager.
 * @csspart table - The preview table.
 * @csspart pager - The preview's page range and buttons.
 * @csspart state - Container for the `empty`, `loading` or `error` slot, which replaces its built-in message.
 *
 * @cssproperty {background-color} [--c2-import-mapper--background-color=#ffffff]
 * @cssproperty {color} [--c2-import-mapper--color=#18181b]
 * @cssproperty {border} [--c2-import-mapper--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-import-mapper--border-radius=8px]
 * @cssproperty {font-family} [--c2-import-mapper--font-family=inherit]
 * @cssproperty {font-size} [--c2-import-mapper--font-size=14px]
 * @cssproperty {padding} [--c2-import-mapper--padding=16px] - Space inside the border, around every region.
 * @cssproperty {pixel} [--c2-import-mapper--gap=16px] - Space between the regions.
 * @cssproperty {color} [--c2-import-mapper__muted--color=#52525b] - Headings, sample values and hints.
 *
 * @cssproperty {background-color} [--c2-import-mapper__summary--background-color=#fafafa]
 * @cssproperty {border-radius} [--c2-import-mapper__summary--border-radius=6px]
 * @cssproperty {padding} [--c2-import-mapper__summary--padding=10px 12px]
 * @cssproperty {border-radius} [--c2-import-mapper__field--border-radius=999px] - A required field in the summary.
 * @cssproperty {background-color} [--c2-import-mapper__field__mapped--background-color=rgba(22, 163, 74, 0.12)]
 * @cssproperty {color} [--c2-import-mapper__field__mapped--color=#166534]
 * @cssproperty {background-color} [--c2-import-mapper__field__missing--background-color=rgba(220, 38, 38, 0.1)]
 * @cssproperty {color} [--c2-import-mapper__field__missing--color=#b91c1c]
 *
 * @cssproperty {pixel} [--c2-import-mapper__column--min-height=52px]
 * @cssproperty {padding} [--c2-import-mapper__column--padding=8px 0]
 * @cssproperty {border} [--c2-import-mapper__column--border-bottom=1px solid #e4e4e7]
 * @cssproperty {font-weight} [--c2-import-mapper__header--font-weight=500] - A column's header.
 * @cssproperty {font-size} [--c2-import-mapper__sample--font-size=12px]
 * @cssproperty {background-color} [--c2-import-mapper__sample--background-color=#f4f4f5]
 * @cssproperty {border-radius} [--c2-import-mapper__sample--border-radius=4px]
 * @cssproperty {color} [--c2-import-mapper__arrow--color=#a1a1aa]
 * @cssproperty {pixel} [--c2-import-mapper__picker--width=220px]
 * @cssproperty {color} [--c2-import-mapper__column__skipped--color=#71717a] - The header of a column that is not imported.
 * @cssproperty {font-size} [--c2-import-mapper__badge--font-size=12px]
 * @cssproperty {background-color} [--c2-import-mapper__badge--background-color=#edf1fe]
 * @cssproperty {color} [--c2-import-mapper__badge--color=rgb(2, 101, 220)]
 *
 * @cssproperty {pixel} [--c2-import-mapper__table--max-height=420px] - Past this height the preview table scrolls.
 * @cssproperty {background-color} [--c2-import-mapper__table-head--background-color=#fafafa]
 * @cssproperty {font-weight} [--c2-import-mapper__table-head--font-weight=600]
 * @cssproperty {padding} [--c2-import-mapper__cell--padding=8px 12px]
 * @cssproperty {border} [--c2-import-mapper__cell--border-bottom=1px solid #e4e4e7]
 * @cssproperty {background-color} [--c2-import-mapper__cell__invalid--background-color=rgba(220, 38, 38, 0.08)]
 * @cssproperty {color} [--c2-import-mapper__error--color=#b91c1c] - A cell's error message, and the error count.
 * @cssproperty {color} [--c2-import-mapper__valid--color=#15803d] - The summary when no cell has an error.
 *
 * @cssproperty {pixel} [--c2-import-mapper__button--height=30px] - The pager's buttons.
 * @cssproperty {border} [--c2-import-mapper__button--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-import-mapper__button--border-radius=6px]
 * @cssproperty {background-color} [--c2-import-mapper__button--background-color=transparent]
 * @cssproperty {background-color} [--c2-import-mapper__button__hover--background-color=#f4f4f5]
 * @cssproperty {opacity} [--c2-import-mapper__button__disabled--opacity=0.38]
 * @cssproperty {outline} [--c2-import-mapper__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 *
 * @internalcomponent c2-select
 * @internalcomponent c2-list-item
 */
@customElement('c2-import-mapper')
export class ImportMapper extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The fields a column can be imported as. Set as JSON in markup; a field's `validate` function needs the property. */
  @property({ converter: jsonPropertyConverter }) fields: ImportField[] = []

  /**
   * The file's headers, one per column. Leave it empty to read them from `rows`: the first row when rows are arrays,
   * the keys of the first record when they are records. Required with a `dataSource`.
   */
  @property({ converter: jsonPropertyConverter }) columns: string[] = []

  /** The file's data rows: arrays of cells in column order, or records keyed by header. Ignored while `csv` or a `dataSource` is set. */
  @property({ converter: jsonPropertyConverter }) rows: ImportSourceRow[] = []

  /** Delimited text (comma, semicolon, tab or pipe, detected); its first line is the header. Wins over `columns`, `rows` and `dataSource`. */
  @property() csv = ''

  /**
   * One field key per source column, or `null` for a column that is not imported. Filled by matching the headers
   * whenever the file or the fields change, unless it is set at the same time or `manual` is set.
   */
  @property({ converter: jsonPropertyConverter }) mapping: ImportMapping = []

  /** Leave every column unmapped when a file arrives, instead of matching headers to fields. */
  @property({ type: Boolean }) manual = false

  /** `map` (the default) shows the columns and their pickers, `preview` the rows as they will be imported. */
  @property() view: ImportMapperView = 'map'

  /** How many values each column shows as samples. */
  @property({ type: Number, attribute: 'sample-count' }) sampleCount = 3

  /** How many rows a preview page shows. */
  @property({ type: Number, attribute: 'page-size' }) pageSize = 10

  /** The preview page shown, from 0. */
  @property({ type: Number }) page = 0

  /** The preview shows only the rows with an error. With a `dataSource`, only within the loaded page. */
  @property({ type: Boolean, attribute: 'errors-only' }) errorsOnly = false

  /** Names the mapper for assistive technology. */
  @property() label = ''

  /** Rows read on demand, instead of `rows`. The headers come from `columns`. */
  @property({ attribute: false }) dataSource?: ImportMapperDataSource

  /** Scores a header against a field from 0 to 100 (50 and up is a match), replacing the built-in matching. */
  @property({ attribute: false }) matcher?: ImportMatcher

  /** Draws a column's sample values. */
  @property({ attribute: false }) renderSamples?: ImportMapperSamplesRenderer

  /** Draws a preview cell's content; the mapper keeps the cell, its error state and its message. */
  @property({ attribute: false }) renderCell?: ImportMapperCellRenderer

  private sourceColumns: string[] = []
  private sourceRows: string[][] = []
  /** With a `dataSource`: loaded rows by index, and the file's row count. */
  private loaded = new Map<number, string[]>()
  private total = 0
  private status: 'idle' | 'loading' | 'error' = 'idle'
  private request = 0
  private autoColumns = new Set<number>()
  /** Whether the mapping has been applied to a file's columns yet. */
  private mapped = false
  private analysis?: Analysis
  private announcement = ''
  /** The last mapping the element set itself, to tell it from one the app sets. */
  private committed?: ImportMapping

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, importMapperMessages)
  private readonly slots = new SlotPresenceController(this, ['toolbar', 'footer'])

  constructor() {
    super()
    this.internals.role = 'group'
  }

  /** Keys of the required fields no column is mapped to. */
  get missing(): string[] {
    return missingFields(this.fields, this.mapping).map((field) => field.key)
  }

  /** The source headers in use: from `csv`, `columns`, or the first row. */
  get headers(): readonly string[] {
    return this.sourceColumns
  }

  /** How many data rows the file has. */
  get rowCount(): number {
    return this.remote ? this.total : this.sourceRows.length
  }

  /** Matches every unmapped column to a free field, keeping the columns already mapped. */
  autoMatch(): void {
    const before = this.mapping
    const after = autoMatch(this.sourceColumns, this.fields, before, this.matcher)
    after.forEach((key, column) => {
      if (key !== null && before[column] == null) this.autoColumns.add(column)
    })
    this.commit(after, -1, null)
  }

  /** Leaves every column unmapped. */
  clearMapping(): void {
    this.autoColumns.clear()
    this.commit(
      this.sourceColumns.map(() => null),
      -1,
      null,
    )
  }

  /** Asks the `dataSource` again for the rows shown, after an error or a change in the file. */
  reload(): void {
    this.loaded.clear()
    this.analysis = undefined
    void this.load()
  }

  /**
   * Checks the mapped cells: every row, or with a `dataSource` the rows loaded so far. Messages are in the element's
   * language.
   */
  validate(): ImportMapperValidation {
    const analysis = this.analyze()
    const errors: ImportCellError[] = []
    for (const [row, cells] of analysis.issues) {
      for (const [column, issue] of cells) {
        const field = this.mapping[column] as string
        errors.push({ row, column, field, value: this.cellsOf(row)?.[column] ?? '', message: this.message(issue) })
      }
    }
    const missing = this.missing
    return { valid: missing.length === 0 && errors.length === 0, missing, errors, checked: this.checkedRows().length }
  }

  /** The mapped rows, keyed by field: every row, or with a `dataSource` the rows loaded so far. */
  records(): Record<string, string>[] {
    return this.checkedRows().map((row) => toRecord(this.cellsOf(row) ?? [], this.mapping))
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    // A JSON attribute that does not parse leaves its property undefined: read it as empty.
    if (!Array.isArray(this.fields)) this.fields = []
    if (!Array.isArray(this.columns)) this.columns = []
    if (!Array.isArray(this.rows)) this.rows = []
    if (!Array.isArray(this.mapping)) this.mapping = []
    const sourceChanged = changed.has('csv') || changed.has('columns') || changed.has('rows') || changed.has('dataSource')
    if (sourceChanged) this.readSource()
    if (changed.has('dataSource') || (this.remote && (changed.has('columns') || changed.has('csv')))) {
      // Cached rows were split by the old source's headers.
      this.loaded.clear()
      this.total = 0
      this.status = 'idle'
      this.request++
    }
    // A mapping set before the file arrives is kept for it, like one set together with it.
    const pending = sourceChanged && !changed.has('mapping') && !this.mapped && this.mapping.some((key) => key != null)
    if ((sourceChanged || changed.has('fields') || changed.has('matcher')) && !changed.has('mapping') && !pending) {
      const known = new Set(this.fields.map((field) => field.key))
      const kept = sourceChanged ? [] : this.mapping.map((key) => (key !== null && known.has(key) ? key : null))
      const next = this.manual ? this.sourceColumns.map((_, i) => kept[i] ?? null) : autoMatch(this.sourceColumns, this.fields, kept, this.matcher)
      this.autoColumns = new Set(next.flatMap((key, i) => (key !== null && kept[i] == null ? [i] : [])))
      this.mapping = next
    } else if (changed.has('mapping') || pending) {
      // A mapping the app sets replaces the matched one, so no column reads as matched any more.
      if (this.mapping !== this.committed) this.autoColumns.clear()
      // Until a file arrives there is nothing to fit the mapping to, so it is kept as given.
      if (this.sourceColumns.length) this.mapping = this.sourceColumns.map((_, i) => this.mapping?.[i] ?? null)
    }
    if (sourceChanged) this.mapped = this.sourceColumns.length > 0
    if (sourceChanged || changed.has('fields') || changed.has('mapping') || changed.has('errorsOnly')) this.analysis = undefined
    if ((sourceChanged || changed.has('errorsOnly') || changed.has('pageSize')) && !changed.has('page')) this.page = 0
    if (this.remote && (sourceChanged || changed.has('page') || changed.has('pageSize') || changed.has('view'))) {
      void this.load()
    }
  }

  private readSource(): void {
    if (this.csv) {
      const [head = [], ...body] = parseCsv(this.csv)
      this.sourceColumns = head.map((header) => header.trim())
      this.sourceRows = body.map((row) => rowCells(row, this.sourceColumns))
      return
    }
    let columns = (this.columns ?? []).map(String)
    let rows = this.remote ? [] : (this.rows ?? [])
    if (!columns.length && rows.length) {
      const first = rows[0]
      if (Array.isArray(first)) {
        columns = first.map((cell) => cellText(cell).trim())
        rows = rows.slice(1)
      } else if (first) columns = Object.keys(first)
    }
    this.sourceColumns = columns
    this.sourceRows = rows.map((row) => rowCells(row, columns))
  }

  /** Loads the rows the current view needs from the `dataSource`, dropping any answer a newer request superseded. */
  private async load(): Promise<void> {
    const source = this.dataSource
    if (!source || !this.remote) return
    const size = Math.max(1, this.pageSize)
    const start = this.view === 'preview' ? this.page * size : 0
    const count = Math.max(size, this.view === 'preview' ? 0 : this.sampleCount)
    let complete = Boolean(this.total) && start >= this.total
    if (!complete) {
      complete = this.loaded.size > 0
      for (let i = start; i < start + count && (!this.total || i < this.total); i++) complete &&= this.loaded.has(i)
    }
    const id = ++this.request
    if (complete) {
      // The rows are cached: drop any request still in flight for another page.
      if (this.status === 'loading') {
        this.status = 'idle'
        this.requestUpdate()
      }
      return
    }
    this.status = 'loading'
    this.requestUpdate()
    try {
      const result = await source.getRows({ start, count })
      if (id !== this.request || source !== this.dataSource) return
      result.rows.forEach((row, i) => this.loaded.set(start + i, rowCells(row, this.sourceColumns)))
      if (typeof result.total === 'number') this.total = result.total
      else this.total = Math.max(this.total, start + result.rows.length)
      this.status = 'idle'
      this.analysis = undefined
    } catch {
      if (id !== this.request || source !== this.dataSource) return
      this.status = 'error'
    }
    this.requestUpdate()
  }

  /** Rows come from the `dataSource`: one is set and `csv`, which wins over it, is not. */
  private get remote(): boolean {
    return Boolean(this.dataSource) && !this.csv
  }

  private cellsOf(row: number): string[] | undefined {
    return this.remote ? this.loaded.get(row) : this.sourceRows[row]
  }

  /** Indexes of the rows validation covers. */
  private checkedRows(): number[] {
    if (this.remote) return [...this.loaded.keys()].sort((a, b) => a - b)
    return this.sourceRows.map((_, i) => i)
  }

  private analyze(): Analysis {
    if (this.analysis) return this.analysis
    const fields = new Map(this.fields.map((field) => [field.key, field]))
    const issues = new Map<number, Map<number, ImportIssue>>()
    let count = 0
    const mapped = this.mapping.flatMap((key, column) => (key !== null && fields.has(key) ? [{ column, field: fields.get(key)! }] : []))
    if (mapped.length) {
      for (const row of this.checkedRows()) {
        const cells = this.cellsOf(row) ?? []
        const record = toRecord(cells, this.mapping)
        for (const { column, field } of mapped) {
          const issue = checkValue(field, cells[column] ?? '', record)
          if (!issue) continue
          let rowIssues = issues.get(row)
          if (!rowIssues) issues.set(row, (rowIssues = new Map()))
          rowIssues.set(column, issue)
          count++
        }
      }
    }
    if (this.remote && this.total > this.loaded.size && !warnedPartial && count) {
      warnedPartial = true
      console.warn('c2-import-mapper: with a dataSource, rows are checked as they load; validate() and errors-only cover the loaded rows only.')
    }
    this.analysis = { issues, count }
    return this.analysis
  }

  private message(issue: ImportIssue): string {
    switch (issue.kind) {
      case 'custom':
        return issue.message
      case 'options':
        return this.msg.t('errOptions', issue.options.join(', '))
      case 'required':
        return this.msg.t('errRequired')
      case 'number':
        return this.msg.t('errNumber')
      case 'integer':
        return this.msg.t('errInteger')
      case 'date':
        return this.msg.t('errDate')
      case 'email':
        return this.msg.t('errEmail')
      case 'url':
        return this.msg.t('errUrl')
      case 'boolean':
        return this.msg.t('errBoolean')
      case 'pattern':
        return this.msg.t('errPattern')
    }
  }

  private headerName(column: number): string {
    return this.sourceColumns[column] || this.msg.t('untitled', column + 1)
  }

  private fieldName(key: string | null): string {
    const field = this.fields.find((candidate) => candidate.key === key)
    return field?.label || field?.key || key || ''
  }

  private commit(mapping: ImportMapping, column: number, field: string | null): void {
    this.mapping = this.committed = mapping
    this.analysis = undefined
    this.dispatchEvent(
      new CustomEvent<ImportMapperChangeDetail>('mapping-change', {
        detail: { mapping: [...mapping], column, field, missing: this.missing },
        bubbles: true,
        composed: true,
      }),
    )
  }

  private pick(column: number, value: string): void {
    const field = value === SKIP || !value ? null : value
    if ((this.mapping[column] ?? null) === field) return
    const next = [...this.mapping]
    const messages: string[] = []
    if (field !== null) {
      const previous = next.indexOf(field)
      if (previous !== -1 && previous !== column) {
        next[previous] = null
        this.autoColumns.delete(previous)
        messages.push(this.msg.t('announceMoved', this.fieldName(field), this.headerName(previous)))
      }
    }
    next[column] = field
    this.autoColumns.delete(column)
    messages.unshift(
      field ? this.msg.t('announceMapped', this.headerName(column), this.fieldName(field)) : this.msg.t('announceSkipped', this.headerName(column)),
    )
    this.announcement = messages.join(' ')
    this.commit(next, column, field)
  }

  private samplesOf(column: number): string[] {
    const values: string[] = []
    const rows = this.checkedRows()
    for (const row of rows.slice(0, SAMPLE_SCAN)) {
      const value = (this.cellsOf(row)?.[column] ?? '').trim()
      if (value) values.push(value)
      if (values.length >= this.sampleCount) break
    }
    return values
  }

  override render() {
    this.internals.ariaLabel = this.label || this.msg.t('mapper')
    let body: unknown
    if (!this.sourceColumns.length) body = this.renderState('empty', this.msg.t('empty'))
    else if (this.status === 'error') body = this.renderState('error', this.msg.t('loadError'))
    else body = this.view === 'preview' ? this.renderPreview() : this.renderMap()
    return html`
      <div class="toolbar" part="toolbar" ?hidden=${!this.slots.has('toolbar')}>
        <slot name="toolbar" @slotchange=${this.slots.handleSlotChange}></slot>
      </div>
      ${body}
      <div class="footer" part="footer" ?hidden=${!this.slots.has('footer')}>
        <slot name="footer" @slotchange=${this.slots.handleSlotChange}></slot>
      </div>
      <div class="visually-hidden" role="status" aria-live="polite">${this.announcement}</div>
    `
  }

  private renderState(name: 'empty' | 'loading' | 'error', text: string) {
    return html`<div class="state state--${name}" part="state"><slot name=${name}>${text}</slot></div>`
  }

  private renderSummary() {
    const required = this.fields.filter((field) => field.required)
    const mapped = new Set(this.mapping)
    const missing = required.filter((field) => !mapped.has(field.key))
    const used = this.mapping.filter((key) => key !== null).length
    return html`<div class="summary" part="summary">
      ${
        required.length
          ? html`<div class="required">
              <span class="summary__title">${this.msg.t('requiredFields')}</span>
              <ul class="required__list">
                ${required.map((field) => {
                  const ok = mapped.has(field.key)
                  return html`<li class="field ${ok ? 'field--mapped' : 'field--missing'}">
                    <svg class="field__icon" viewBox="0 0 24 24" aria-hidden="true">${ok ? check : alert}</svg>${field.label || field.key}<span
                      class="visually-hidden"
                      >, ${this.msg.t(ok ? 'mapped' : 'notMapped')}</span
                    >
                  </li>`
                })}
              </ul>
            </div>`
          : nothing
      }
      <p class="status">
        <span class=${missing.length ? 'status--missing' : required.length ? 'status--ok' : ''}
          >${
            missing.length
              ? this.msg.t('missingRequired', missing.length, missing.map((field) => field.label || field.key).join(', '))
              : required.length
                ? this.msg.t('allRequiredMapped')
                : nothing
          }</span
        >
        <span class="muted">${this.msg.t('mappedColumns', used, this.sourceColumns.length)}</span>
      </p>
    </div>`
  }

  private renderMap() {
    const loading = this.status === 'loading' && !this.loaded.size
    return html`${this.renderSummary()}
      <div class="map">
        <div class="map__head" aria-hidden="true">
          <span>${this.msg.t('sourceColumn')}</span><span>${this.msg.t('samples')}</span><span></span><span>${this.msg.t('target')}</span>
        </div>
        <ul class="columns" part="columns">
          ${this.sourceColumns.map((_, column) => this.renderColumn(column, loading))}
        </ul>
      </div>`
  }

  private renderColumn(column: number, loading: boolean) {
    const key = this.mapping[column] ?? null
    const header = this.headerName(column)
    const values = loading ? [] : this.samplesOf(column)
    const auto = key !== null && this.autoColumns.has(column)
    return html`<li class="column ${key === null ? 'column--skipped' : ''}" part="column">
      <div class="source">
        <span class="header ${this.sourceColumns[column] ? '' : 'header--untitled'}">${header}</span>
        ${auto ? html`<span class="badge">${this.msg.t('auto')}</span>` : nothing}
        ${key === null ? html`<span class="badge badge--muted">${this.msg.t('notImported')}</span>` : nothing}
      </div>
      <div class="samples">
        ${
          this.renderSamples
            ? this.renderSamples({ column, header, values, field: key })
            : loading
              ? html`<span class="muted">${this.msg.t('loading')}</span>`
              : values.length
                ? values.map((value) => html`<span class="sample" title=${value}>${value}</span>`)
                : html`<span class="muted">${this.msg.t('noSamples')}</span>`
        }
      </div>
      <svg class="arrow" viewBox="0 0 24 24" aria-hidden="true">${arrow}</svg>
      <c2-select
        class="picker"
        part="picker"
        aria-label=${this.msg.t('pickerLabel', header)}
        .value=${[key ?? SKIP]}
        @selection-change=${(event: CustomEvent<{ value: string[] }>) => this.pick(column, event.detail.value[0] ?? SKIP)}
        @input=${stop}
        @change=${stop}
      >
        <c2-list-item value=${SKIP} label=${this.msg.t('skip')}>${this.msg.t('skip')}</c2-list-item>
        ${this.fields.map((field) => {
          const name = field.label || field.key
          const hint = [field.required ? this.msg.t('required') : '', field.description ?? ''].filter(Boolean).join(' · ')
          return html`<c2-list-item value=${field.key} label=${name}>${name}${hint ? html`<span slot="description">${hint}</span>` : nothing}</c2-list-item>`
        })}
      </c2-select>
    </li>`
  }

  private renderPreview() {
    const fields = new Map(this.fields.map((field) => [field.key, field]))
    const mapped = this.mapping.flatMap((key, column) => (key !== null && fields.has(key) ? [{ column, field: fields.get(key)! }] : []))
    // Show the fields in the order the app declared them, not the file's.
    mapped.sort((a, b) => this.fields.indexOf(a.field) - this.fields.indexOf(b.field))
    if (!mapped.length) return html`<div class="preview" part="preview">${this.renderSummary()}${this.renderState('empty', this.msg.t('nothingMapped'))}</div>`
    const analysis = this.analyze()
    const size = Math.max(1, this.pageSize)
    const remote = this.remote
    let rows: number[]
    let total: number
    let page = this.page
    if (remote) {
      const start = page * size
      rows = []
      for (let i = start; i < Math.min(start + size, this.total || start + size); i++) if (this.loaded.has(i)) rows.push(i)
      if (this.errorsOnly) rows = rows.filter((row) => analysis.issues.has(row))
      total = this.total
    } else {
      const all = this.errorsOnly ? [...analysis.issues.keys()].sort((a, b) => a - b) : this.sourceRows.map((_, i) => i)
      total = all.length
      // A page past the end, after a mapping change narrowed `errors-only`, shows the last page.
      page = Math.min(page, Math.max(0, Math.ceil(total / size) - 1))
      rows = all.slice(page * size, page * size + size)
    }
    const checked = this.checkedRows().length
    const loading = remote && this.status === 'loading'
    const pages = Math.max(1, Math.ceil(total / size))
    const first = total ? page * size + 1 : 0
    const last = Math.min(total, page * size + size)
    return html`<div class="preview" part="preview">
      ${this.missing.length ? this.renderSummary() : nothing}
      <p class="status">
        ${
          analysis.count
            ? html`<span class="status--missing">${this.msg.t('errorSummary', checked, analysis.issues.size, analysis.count)}</span>`
            : html`<span class="status--ok">${this.msg.t('noErrors', checked)}</span>`
        }
        ${remote && checked < this.total ? html`<span class="muted">${this.msg.t('loadedOnly', checked)}</span>` : nothing}
      </p>
      ${
        loading
          ? this.renderState('loading', this.msg.t('loading'))
          : rows.length
            ? html`<div class="table-wrap">
                <table part="table" aria-label=${this.msg.t('preview')}>
                  <thead>
                    <tr>
                      <th scope="col" class="row-number">${this.msg.t('rowNumber')}</th>
                      ${mapped.map(({ field }) => html`<th scope="col">${field.label || field.key}</th>`)}
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map((row) => this.renderRow(row, mapped, analysis))}
                  </tbody>
                </table>
              </div>`
            : this.renderState('empty', this.msg.t('noInvalidRows'))
      }
      ${
        total > size || page > 0
          ? html`<div class="pager" part="pager">
              <span class="muted">${this.msg.t('pageRange', first, last, total)}</span>
              <button
                type="button"
                class="page-button"
                aria-label=${this.msg.t('previousPage')}
                title=${this.msg.t('previousPage')}
                ?disabled=${page <= 0 || loading}
                @click=${() => this.goTo(page - 1, 0)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              </button>
              <button
                type="button"
                class="page-button"
                aria-label=${this.msg.t('nextPage')}
                title=${this.msg.t('nextPage')}
                ?disabled=${page >= pages - 1 || loading}
                @click=${() => this.goTo(page + 1, 1)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </div>`
          : nothing
      }
    </div>`
  }

  private renderRow(row: number, mapped: { column: number; field: ImportField }[], analysis: Analysis) {
    const cells = this.cellsOf(row) ?? []
    const issues = analysis.issues.get(row)
    const record = this.renderCell ? toRecord(cells, this.mapping) : {}
    return html`<tr class=${issues ? 'row--invalid' : ''}>
      <th scope="row" class="row-number">${row + 1}</th>
      ${mapped.map(({ column, field }) => {
        const value = cells[column] ?? ''
        const issue = issues?.get(column)
        const error = issue ? this.message(issue) : null
        return html`<td class=${error ? 'cell--invalid' : ''}>
          <span class="value">${this.renderCell ? this.renderCell({ value, field, row, record, error }) : value}</span>
          ${error ? html`<span class="error"><span class="visually-hidden">${this.msg.t('errorPrefix')} </span>${error}</span>` : nothing}
        </td>`
      })}
    </tr>`
  }

  /** Shows a page; when the button pressed turns disabled at either end, focus moves to the other one. */
  private async goTo(page: number, button: 0 | 1): Promise<void> {
    this.page = Math.max(0, page)
    await this.updateComplete
    const buttons = this.renderRoot.querySelectorAll<HTMLButtonElement>('.page-button')
    if (buttons[button]?.disabled && !buttons[1 - button]?.disabled) buttons[1 - button]?.focus()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-import-mapper': ImportMapper
  }
}
