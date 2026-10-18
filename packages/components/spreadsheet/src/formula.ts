/**
 * The formula engine behind `c2-spreadsheet`: cell addresses, a tokenizer, a recursive-descent parser, an
 * evaluator and the sheet model that keeps computed values and the dependency graph between cells.
 *
 * It has no DOM and no dependencies, and never calls `eval`. Formulas are parsed once when a cell's input changes;
 * a change recalculates only the cells that read the changed cell, directly or through other cells.
 */

/** A cell's raw input, as `data` holds it. A string starting with `=` is a formula. */
export type CellInput = string | number | boolean | null

/** The error values a cell can show. */
export type CellErrorCode = '#DIV/0!' | '#REF!' | '#NAME?' | '#VALUE!' | '#NUM!' | '#CIRC!' | '#ERROR!'

/** An error value: the code shown in the cell and a sentence saying what went wrong. */
export class CellError {
  readonly error: CellErrorCode
  readonly message: string

  constructor(error: CellErrorCode, message: string) {
    this.error = error
    this.message = message
  }

  toString(): string {
    return this.error
  }
}

/** A computed cell value. An empty cell is `null`. */
export type CellValue = number | string | boolean | null | CellError

/** A function argument: one value, or the values of a range in row order. */
export type FormulaArgument = CellValue | CellValue[]

/** A formula function. Errors in the arguments are passed through as `CellError` values. */
export type SpreadsheetFunction = (args: FormulaArgument[]) => CellValue

/** How a typed literal asked to be shown: `10%` stays a percentage and `$12` a currency amount. */
export type FormatHint = 'percent' | 'currency'

export const isCellError = (value: unknown): value is CellError => value instanceof CellError

// ---------------------------------------------------------------------------------------------------------------
// Addresses

export interface CellPosition {
  row: number
  column: number
}

/** `0` → `A`, `25` → `Z`, `26` → `AA`. */
export function columnName(index: number): string {
  let name = ''
  let n = index + 1
  while (n > 0) {
    const rest = (n - 1) % 26
    name = String.fromCharCode(65 + rest) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

/** `A` → `0`, `AA` → `26`. */
export function columnIndex(name: string): number {
  let n = 0
  for (const char of name.toUpperCase()) n = n * 26 + char.charCodeAt(0) - 64
  return n - 1
}

/** `{ row: 2, column: 3 }` → `D3`. */
export function cellRef(row: number, column: number): string {
  return columnName(column) + (row + 1)
}

/** `D3`, `$D$3` → `{ row: 2, column: 3 }`, or `undefined` for anything else. */
export function parseCellRef(ref: string): CellPosition | undefined {
  const match = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref.trim())
  if (!match || +match[2] < 1) return undefined
  return { row: +match[2] - 1, column: columnIndex(match[1]) }
}

export interface CellRange {
  start: CellPosition
  end: CellPosition
}

/** `B2:A1` → the normalised range `A1:B2`; a single reference is a one-cell range. */
export function parseRange(range: string): CellRange | undefined {
  const [first, second, extra] = range.split(':')
  if (extra !== undefined) return undefined
  const a = parseCellRef(first)
  const b = second === undefined ? a : parseCellRef(second)
  if (!a || !b) return undefined
  return {
    start: { row: Math.min(a.row, b.row), column: Math.min(a.column, b.column) },
    end: { row: Math.max(a.row, b.row), column: Math.max(a.column, b.column) },
  }
}

/** The address of a range, `A1` for a single cell. */
export function rangeRef(range: CellRange): string {
  const start = cellRef(range.start.row, range.start.column)
  const end = cellRef(range.end.row, range.end.column)
  return start === end ? start : `${start}:${end}`
}

// ---------------------------------------------------------------------------------------------------------------
// Literals

/**
 * Reads a typed input that is not a formula. Numbers accept a sign, thousands commas, a leading `$` and a trailing
 * `%`; `TRUE` and `FALSE` are booleans; a leading `'` forces the rest to stay text.
 */
export function parseLiteral(input: string): { value: CellValue; hint?: FormatHint } {
  const text = input.trim()
  if (text === '') return { value: null }
  if (text.startsWith("'")) return { value: text.slice(1) }
  if (/^true$/i.test(text)) return { value: true }
  if (/^false$/i.test(text)) return { value: false }
  const match = /^([-+])?(\$)?(\d{1,3}(?:,\d{3})+(?:\.\d*)?|\d+\.?\d*|\.\d+)(?:[eE]([-+]?\d+))?(%)?$/.exec(text)
  if (!match) return { value: text }
  let value = parseFloat(match[3].replace(/,/g, '') + (match[4] ? `e${match[4]}` : ''))
  if (match[1] === '-') value = -value
  if (match[5]) return { value: value / 100, hint: 'percent' }
  return match[2] ? { value, hint: 'currency' } : { value }
}

// ---------------------------------------------------------------------------------------------------------------
// Tokenizer and parser

type Token = { type: 'number'; value: number } | { type: 'string' | 'ref' | 'name' | 'op' | 'error'; value: string }

export type FormulaNode =
  | { kind: 'literal'; value: number | string | boolean }
  | { kind: 'ref'; row: number; column: number }
  | { kind: 'range'; start: CellPosition; end: CellPosition }
  | { kind: 'name'; name: string }
  /** `#REF!` written in place of a reference that was deleted or moved off the sheet. */
  | { kind: 'error'; error: '#REF!' }
  | { kind: 'negate' | 'percent'; operand: FormulaNode }
  | { kind: 'binary'; operator: string; left: FormulaNode; right: FormulaNode }
  | { kind: 'call'; name: string; args: FormulaNode[] }

const syntaxError = (message: string) => new CellError('#ERROR!', message)

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const rest = source.slice(index)
    let match: RegExpExecArray | null
    if ((match = /^\s+/.exec(rest))) {
      // whitespace
    } else if ((match = /^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(rest))) {
      tokens.push({ type: 'number', value: parseFloat(match[0]) })
    } else if ((match = /^"((?:[^"]|"")*)"/.exec(rest))) {
      tokens.push({ type: 'string', value: match[1].replace(/""/g, '"') })
    } else if ((match = /^\$?[A-Za-z]{1,3}\$?\d+(?![A-Za-z0-9_.(])/.exec(rest))) {
      tokens.push({ type: 'ref', value: match[0] })
    } else if ((match = /^#REF!/i.exec(rest))) {
      tokens.push({ type: 'error', value: '#REF!' })
    } else if ((match = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest))) {
      tokens.push({ type: 'name', value: match[0].toUpperCase() })
    } else if ((match = /^(?:<>|<=|>=|[-+*/^&=<>(),:%])/.exec(rest))) {
      tokens.push({ type: 'op', value: match[0] })
    } else {
      throw syntaxError(`Unexpected character "${rest[0]}"`)
    }
    index += match[0].length
  }
  return tokens
}

const COMPARISON = ['=', '<>', '<', '>', '<=', '>=']

/** Parses a formula body (without its leading `=`). Throws a `#ERROR!` `CellError` for a syntax error. */
export function parseFormula(source: string): FormulaNode {
  const tokens = tokenize(source)
  let position = 0
  const isOp = (...ops: string[]) => {
    const token = tokens[position]
    return token?.type === 'op' && ops.includes(token.value)
  }
  const expect = (op: string) => {
    if (!isOp(op)) throw syntaxError(`Expected "${op}"`)
    position++
  }
  const binary = (next: () => FormulaNode, ops: string[]) => (): FormulaNode => {
    let left = next()
    while (isOp(...ops)) {
      const operator = String(tokens[position++].value)
      left = { kind: 'binary', operator, left, right: next() }
    }
    return left
  }

  const primary = (): FormulaNode => {
    const token = tokens[position++]
    if (!token) throw syntaxError('The formula ends too early')
    switch (token.type) {
      case 'number':
      case 'string':
        return { kind: 'literal', value: token.value }
      case 'error':
        return { kind: 'error', error: '#REF!' }
      case 'ref': {
        const start = parseCellRef(token.value)!
        if (!isOp(':')) return { kind: 'ref', ...start }
        position++
        const next = tokens[position++]
        if (next?.type !== 'ref') throw syntaxError('A range needs a cell reference on both sides of ":"')
        const end = parseCellRef(next.value)!
        return {
          kind: 'range',
          start: { row: Math.min(start.row, end.row), column: Math.min(start.column, end.column) },
          end: { row: Math.max(start.row, end.row), column: Math.max(start.column, end.column) },
        }
      }
      case 'name': {
        if (isOp('(')) {
          position++
          const args: FormulaNode[] = []
          if (!isOp(')')) {
            args.push(expression())
            while (isOp(',')) {
              position++
              args.push(expression())
            }
          }
          expect(')')
          return { kind: 'call', name: token.value, args }
        }
        if (token.value === 'TRUE' || token.value === 'FALSE') return { kind: 'literal', value: token.value === 'TRUE' }
        return { kind: 'name', name: token.value }
      }
      case 'op':
        if (token.value === '(') {
          const inner = expression()
          expect(')')
          return inner
        }
        throw syntaxError(`Unexpected "${token.value}"`)
    }
  }
  const postfix = (): FormulaNode => {
    let node = primary()
    while (isOp('%')) {
      position++
      node = { kind: 'percent', operand: node }
    }
    return node
  }
  const unary = (): FormulaNode => {
    if (isOp('-')) {
      position++
      return { kind: 'negate', operand: unary() }
    }
    if (isOp('+')) {
      position++
      return unary()
    }
    return postfix()
  }
  const power = binary(unary, ['^'])
  const product = binary(power, ['*', '/'])
  const sum = binary(product, ['+', '-'])
  const concat = binary(sum, ['&'])
  const expression = binary(concat, COMPARISON)

  const tree = expression()
  if (position < tokens.length) throw syntaxError(`Unexpected "${tokens[position].value}"`)
  return tree
}

/** Every cell a formula reads, ranges expanded, as `A1`-style keys. */
export function formulaReferences(node: FormulaNode): Set<string> {
  const refs = new Set<string>()
  const walk = (n: FormulaNode): void => {
    switch (n.kind) {
      case 'ref':
        refs.add(cellRef(n.row, n.column))
        break
      case 'range':
        for (let row = n.start.row; row <= n.end.row; row++) for (let column = n.start.column; column <= n.end.column; column++) refs.add(cellRef(row, column))
        break
      case 'negate':
      case 'percent':
        walk(n.operand)
        break
      case 'binary':
        walk(n.left)
        walk(n.right)
        break
      case 'call':
        n.args.forEach(walk)
        break
    }
  }
  walk(node)
  return refs
}

/**
 * Moves the relative references of a formula by `rows` and `columns`, as pasting it elsewhere does: `=B2*C2`
 * pasted one row down becomes `=B3*C3`. A `$` pins the column or row after it. A reference moved off the sheet
 * becomes `#REF!`. Text inside double quotes is left alone.
 */
export function shiftFormula(formula: string, rows: number, columns: number): string {
  return formula.replace(
    /"(?:[^"]|"")*"|(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_.(])/g,
    (whole, columnPin: string, column: string, rowPin: string, row: string) => {
      if (whole.startsWith('"')) return whole
      const newColumn = columnPin ? columnIndex(column) : columnIndex(column) + columns
      const newRow = rowPin ? +row - 1 : +row - 1 + rows
      if (newColumn < 0 || newRow < 0) return '#REF!'
      return `${columnPin}${columnName(newColumn)}${rowPin}${newRow + 1}`
    },
  )
}

/**
 * Rewrites a formula for `count` rows or columns inserted at index `at`, as Sheets and Excel do: every reference at
 * or past `at` moves by `count`, pinned or not, so it still names the same cell. A range spanning the insertion
 * grows to take in the new rows or columns. Text inside double quotes is left alone.
 */
export function insertIntoFormula(formula: string, axis: 'row' | 'column', at: number, count: number): string {
  return formula.replace(
    /"(?:[^"]|"")*"|(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_.(])/g,
    (whole, columnPin: string, column: string, rowPin: string, row: string) => {
      if (whole.startsWith('"')) return whole
      let newColumn = columnIndex(column)
      let newRow = +row - 1
      if (axis === 'column' && newColumn >= at) newColumn += count
      if (axis === 'row' && newRow >= at) newRow += count
      return `${columnPin}${columnName(newColumn)}${rowPin}${newRow + 1}`
    },
  )
}

/**
 * Rewrites a formula for `count` rows or columns deleted from index `at`, as Sheets and Excel do: references past
 * the deleted ones move back, a reference to a deleted cell becomes `#REF!`, and a range that loses some of its
 * rows or columns shrinks (`=SUM(B1:B5)` becomes `=SUM(B1:B4)` when row 3 goes). A range whose cells are all deleted
 * becomes `#REF!`. Text inside double quotes is left alone.
 */
export function deleteFromFormula(formula: string, axis: 'row' | 'column', at: number, count: number): string {
  const end = at + count
  const index = (ref: RefParts) => (axis === 'row' ? ref.row : ref.column)
  const withIndex = (ref: RefParts, value: number): RefParts => (axis === 'row' ? { ...ref, row: value } : { ...ref, column: value })
  return formula.replace(
    /"(?:[^"]|"")*"|(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?(?![A-Za-z0-9_.(])/g,
    (whole, first: string | undefined, second: string | undefined) => {
      if (!first) return whole
      const a = splitRef(first)
      if (!second) {
        const i = index(a)
        if (i >= at && i < end) return '#REF!'
        return joinRef(i >= end ? withIndex(a, i - count) : a)
      }
      const b = splitRef(second)
      // The endpoints may be written either way round (`B5:B1`); `low` is the one nearer the top or the left.
      const [low, high] = index(a) <= index(b) ? [a, b] : [b, a]
      const lo = index(low)
      const hi = index(high)
      if (lo >= at && hi < end) return '#REF!'
      const newLow = lo < at ? lo : lo >= end ? lo - count : at
      const newHigh = hi < at ? hi : hi >= end ? hi - count : at - 1
      const moved = [withIndex(low, newLow), withIndex(high, newHigh)]
      return low === a ? `${joinRef(moved[0])}:${joinRef(moved[1])}` : `${joinRef(moved[1])}:${joinRef(moved[0])}`
    },
  )
}

interface RefParts {
  columnPin: string
  column: number
  rowPin: string
  row: number
}

function splitRef(ref: string): RefParts {
  const [, columnPin, column, rowPin, row] = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(ref)!
  return { columnPin, column: columnIndex(column), rowPin, row: +row - 1 }
}

function joinRef({ columnPin, column, rowPin, row }: RefParts): string {
  return `${columnPin}${columnName(column)}${rowPin}${row + 1}`
}

// ---------------------------------------------------------------------------------------------------------------
// Values and functions

/** A value as a number, or a `#VALUE!` error. Empty is 0, booleans are 1 and 0. */
export function toNumber(value: FormulaArgument): number | CellError {
  if (Array.isArray(value)) return new CellError('#VALUE!', 'Expected one value, got a range')
  if (isCellError(value)) return value
  if (value === null || value === '') return 0
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  const parsed = parseLiteral(value)
  return typeof parsed.value === 'number' ? parsed.value : new CellError('#VALUE!', `"${value}" is not a number`)
}

/** A value as text: empty is `""`, booleans are `TRUE` and `FALSE`. */
export function toText(value: CellValue): string {
  if (value === null) return ''
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value)
}

const single = (value: FormulaArgument | undefined): CellValue => {
  if (value === undefined) return null
  return Array.isArray(value) ? new CellError('#VALUE!', 'Expected one value, got a range') : value
}

/** Every argument value, ranges flattened, each flagged with whether it came from a range. */
function flatten(args: FormulaArgument[]): { value: CellValue; fromRange: boolean }[] {
  return args.flatMap((arg): { value: CellValue; fromRange: boolean }[] =>
    Array.isArray(arg) ? arg.map((value) => ({ value, fromRange: true })) : [{ value: arg, fromRange: false }],
  )
}

/**
 * The numbers among the arguments, as `SUM` reads them: text and booleans inside a range are skipped, while a
 * direct argument must convert. The first error wins.
 */
function numbers(args: FormulaArgument[]): number[] | CellError {
  const result: number[] = []
  for (const { value, fromRange } of flatten(args)) {
    if (isCellError(value)) return value
    if (fromRange) {
      if (typeof value === 'number') result.push(value)
      continue
    }
    const n = toNumber(value)
    if (isCellError(n)) return n
    result.push(n)
  }
  return result
}

const firstError = (args: FormulaArgument[]) => flatten(args).find(({ value }) => isCellError(value))?.value as CellError | undefined

function numeric(arg: FormulaArgument | undefined, apply: (n: number) => CellValue): CellValue {
  const n = toNumber(single(arg))
  return isCellError(n) ? n : apply(n)
}

function textual(arg: FormulaArgument | undefined, apply: (s: string) => CellValue): CellValue {
  const value = single(arg)
  return isCellError(value) ? value : apply(toText(value))
}

/** `SUMIF` criteria: `"Food"`, `">100"`, `"<>0"`. Text compares case-insensitively. */
function matchesCriterion(value: CellValue, criterion: CellValue): boolean {
  const [, op = '=', target = ''] = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(toText(criterion)) ?? []
  const targetNumber = parseLiteral(target).value
  const numericCompare = typeof value === 'number' && typeof targetNumber === 'number'
  const a = numericCompare ? value : toText(value).toLowerCase()
  const b = numericCompare ? (targetNumber as number) : target.toLowerCase()
  return compare(a, b, op)
}

function compare(a: number | string | boolean, b: number | string | boolean, operator: string): boolean {
  switch (operator) {
    case '=':
      return a === b
    case '<>':
      return a !== b
    case '<':
      return a < b
    case '>':
      return a > b
    case '<=':
      return a <= b
    default:
      return a >= b
  }
}

const sum = (values: number[]) => values.reduce((total, n) => total + n, 0)

/** The functions every sheet knows. `IF` and `IFERROR` are evaluated lazily by the evaluator itself. */
export const builtinFunctions: Record<string, SpreadsheetFunction> = {
  SUM: (args) => {
    const n = numbers(args)
    return isCellError(n) ? n : sum(n)
  },
  AVERAGE: (args) => {
    const n = numbers(args)
    if (isCellError(n)) return n
    return n.length ? sum(n) / n.length : new CellError('#DIV/0!', 'AVERAGE has no numbers to average')
  },
  MIN: (args) => {
    const n = numbers(args)
    return isCellError(n) ? n : n.length ? Math.min(...n) : 0
  },
  MAX: (args) => {
    const n = numbers(args)
    return isCellError(n) ? n : n.length ? Math.max(...n) : 0
  },
  COUNT: (args) => flatten(args).filter(({ value }) => typeof value === 'number').length,
  COUNTA: (args) => flatten(args).filter(({ value }) => value !== null && value !== '').length,
  ROUND: (args) => {
    const digits = toNumber(single(args[1] ?? 0))
    if (isCellError(digits)) return digits
    return numeric(args[0], (n) => {
      // Shift through the decimal exponent rather than multiplying, so 2.345 rounds to 2.35 and not 2.34.
      const places = Math.trunc(digits)
      const shifted = Number(`${Math.abs(n)}e${places}`)
      const rounded = Number.isFinite(shifted) ? Number(`${Math.round(shifted)}e${-places}`) : NaN
      const result = Number.isNaN(rounded) ? Math.round(Math.abs(n) * 10 ** places) / 10 ** places : rounded
      return Math.sign(n) * result
    })
  },
  ABS: (args) => numeric(args[0], Math.abs),
  AND: (args) => {
    const error = firstError(args)
    if (error) return error
    return flatten(args).every(({ value }) => Boolean(toNumber(value)))
  },
  OR: (args) => {
    const error = firstError(args)
    if (error) return error
    return flatten(args).some(({ value }) => Boolean(toNumber(value)))
  },
  NOT: (args) => numeric(args[0], (n) => !n),
  CONCAT: (args) =>
    firstError(args) ??
    flatten(args)
      .map(({ value }) => toText(value))
      .join(''),
  LEN: (args) => textual(args[0], (s) => s.length),
  UPPER: (args) => textual(args[0], (s) => s.toUpperCase()),
  LOWER: (args) => textual(args[0], (s) => s.toLowerCase()),
  TRIM: (args) => textual(args[0], (s) => s.trim().replace(/\s+/g, ' ')),
  TODAY: () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  },
  SUMIF: (args) => {
    const [range, criterion, sumRange] = args
    if (!Array.isArray(range)) return new CellError('#VALUE!', 'SUMIF needs a range as its first argument')
    const criterionValue = single(criterion)
    if (isCellError(criterionValue)) return criterionValue
    const values = Array.isArray(sumRange) ? sumRange : range
    let total = 0
    for (let i = 0; i < range.length; i++) {
      if (!matchesCriterion(range[i], criterionValue)) continue
      const value = values[i]
      if (isCellError(value)) return value
      if (typeof value === 'number') total += value
    }
    return total
  },
}

// ---------------------------------------------------------------------------------------------------------------
// Sheet model

interface CellRecord {
  input: string
  formula?: FormulaNode | CellError
  literal?: CellValue
  hint?: FormatHint
}

/**
 * One sheet's inputs, computed values and dependency graph.
 *
 * Values are computed lazily and cached. `setInput` drops the cached value of the edited cell and of every cell
 * that reads it, directly or indirectly, so the next read recalculates only those.
 */
export class SheetModel {
  private rowCount: number
  private columnCount: number
  private extraFunctions: Record<string, SpreadsheetFunction>
  private readonly cells = new Map<string, CellRecord>()
  /** Cell → the cells its formula reads. */
  private readonly reads = new Map<string, Set<string>>()
  /** Cell → the formula cells that read it. */
  private readonly readers = new Map<string, Set<string>>()
  private readonly values = new Map<string, CellValue>()
  private readonly evaluating = new Set<string>()

  constructor(rows: number, columns: number, functions: Record<string, SpreadsheetFunction> = {}) {
    this.rowCount = rows
    this.columnCount = columns
    this.extraFunctions = normaliseFunctions(functions)
  }

  get rows(): number {
    return this.rowCount
  }

  get columns(): number {
    return this.columnCount
  }

  /** Changes the sheet size. References past the new edge become `#REF!`. */
  resize(rows: number, columns: number): void {
    if (rows === this.rowCount && columns === this.columnCount) return
    this.rowCount = rows
    this.columnCount = columns
    this.values.clear()
  }

  /** Replaces the extra functions and recalculates everything. */
  setFunctions(functions: Record<string, SpreadsheetFunction> = {}): void {
    this.extraFunctions = normaliseFunctions(functions)
    this.values.clear()
  }

  /** Replaces every input. */
  load(inputs: Iterable<[string, string]>): void {
    this.cells.clear()
    this.reads.clear()
    this.readers.clear()
    this.values.clear()
    for (const [key, input] of inputs) this.write(key, input)
  }

  /** The raw input of a cell, `''` when empty. */
  getInput(key: string): string {
    return this.cells.get(key)?.input ?? ''
  }

  /** The format a typed literal asked for (`10%`, `$12`). */
  getFormatHint(key: string): FormatHint | undefined {
    return this.cells.get(key)?.hint
  }

  /** Whether the cell holds a formula. */
  isFormula(key: string): boolean {
    return this.cells.get(key)?.formula !== undefined
  }

  /** The keys of every non-empty cell. */
  keys(): IterableIterator<string> {
    return this.cells.keys()
  }

  /**
   * Writes one cell's input. Returns the keys whose computed value may have changed: the cell itself and every
   * cell that depends on it.
   */
  setInput(key: string, input: string): string[] {
    this.write(key, input)
    const changed = new Set<string>([key])
    const queue = [key]
    while (queue.length) {
      const next = queue.pop()!
      for (const reader of this.readers.get(next) ?? []) {
        if (changed.has(reader)) continue
        changed.add(reader)
        queue.push(reader)
      }
    }
    for (const changedKey of changed) this.values.delete(changedKey)
    return [...changed]
  }

  /** What a formula would give, written in no cell: the preview of one being typed. Never cached. */
  preview(input: string): CellValue {
    if (!input.startsWith('=') || input.length < 2) return null
    try {
      return settle(this.evaluate(parseFormula(input.slice(1))))
    } catch (error) {
      return isCellError(error) ? error : syntaxError(String(error))
    }
  }

  /** The computed value of a cell. */
  getValue(key: string): CellValue {
    const cached = this.values.get(key)
    if (cached !== undefined || this.values.has(key)) return cached ?? null
    const position = parseCellRef(key)
    if (!position || position.row >= this.rowCount || position.column >= this.columnCount) return new CellError('#REF!', `${key} is outside the sheet`)
    const record = this.cells.get(key)
    if (!record) return null
    if (record.formula === undefined) return record.literal ?? null
    if (this.evaluating.has(key)) return new CellError('#CIRC!', `${key} refers to itself through its own formula`)

    let value: CellValue
    if (isCellError(record.formula)) value = record.formula
    else {
      this.evaluating.add(key)
      try {
        value = settle(this.evaluate(record.formula))
      } finally {
        this.evaluating.delete(key)
      }
    }
    this.values.set(key, value)
    return value
  }

  private write(key: string, input: string): void {
    for (const read of this.reads.get(key) ?? []) this.readers.get(read)?.delete(key)
    this.reads.delete(key)
    if (input === '') {
      this.cells.delete(key)
      return
    }
    if (input.startsWith('=') && input.length > 1) {
      let formula: FormulaNode | CellError
      try {
        formula = parseFormula(input.slice(1))
      } catch (error) {
        formula = isCellError(error) ? error : syntaxError(String(error))
      }
      this.cells.set(key, { input, formula })
      if (!isCellError(formula)) {
        const refs = formulaReferences(formula)
        this.reads.set(key, refs)
        for (const ref of refs) {
          let set = this.readers.get(ref)
          if (!set) this.readers.set(ref, (set = new Set()))
          set.add(key)
        }
      }
      return
    }
    const { value, hint } = parseLiteral(input)
    this.cells.set(key, { input, literal: value, hint })
  }

  private cell(row: number, column: number): CellValue {
    if (row >= this.rowCount || column >= this.columnCount) return new CellError('#REF!', `${cellRef(row, column)} is outside the sheet`)
    return this.getValue(cellRef(row, column))
  }

  private evaluate(node: FormulaNode): FormulaArgument {
    switch (node.kind) {
      case 'literal':
        return node.value
      case 'ref':
        return this.cell(node.row, node.column)
      case 'range': {
        const values: CellValue[] = []
        for (let row = node.start.row; row <= node.end.row; row++)
          for (let column = node.start.column; column <= node.end.column; column++) values.push(this.cell(row, column))
        return values
      }
      case 'name':
        return new CellError('#NAME?', `Unknown name ${node.name}`)
      case 'error':
        return new CellError('#REF!', 'The formula refers to a cell that was deleted or moved off the sheet')
      case 'negate': {
        const n = toNumber(this.evaluate(node.operand))
        return isCellError(n) ? n : -n
      }
      case 'percent': {
        const n = toNumber(this.evaluate(node.operand))
        return isCellError(n) ? n : n / 100
      }
      case 'call':
        return this.call(node.name, node.args)
      case 'binary':
        return this.binary(node.operator, single(this.evaluate(node.left)), single(this.evaluate(node.right)))
    }
  }

  private call(name: string, args: FormulaNode[]): CellValue {
    if (name === 'IF') {
      const condition = toNumber(single(args[0] ? this.evaluate(args[0]) : null))
      if (isCellError(condition)) return condition
      const branch = condition ? args[1] : args[2]
      if (!branch) return Boolean(condition)
      return single(this.evaluate(branch))
    }
    if (name === 'IFERROR') {
      const value = single(args[0] ? this.evaluate(args[0]) : null)
      return isCellError(value) ? single(args[1] ? this.evaluate(args[1]) : '') : value
    }
    const fn = this.extraFunctions[name] ?? builtinFunctions[name]
    if (!fn) return new CellError('#NAME?', `Unknown function ${name}`)
    try {
      return fn(args.map((arg) => this.evaluate(arg)))
    } catch (error) {
      return new CellError('#VALUE!', `${name} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private binary(operator: string, left: CellValue, right: CellValue): CellValue {
    if (isCellError(left)) return left
    if (isCellError(right)) return right
    if (operator === '&') return toText(left) + toText(right)
    if (COMPARISON.includes(operator)) {
      const bothNumbers = typeof (left ?? 0) === 'number' && typeof (right ?? 0) === 'number'
      if (bothNumbers) return compare(left ?? 0, right ?? 0, operator)
      return compare(toText(left).toLowerCase(), toText(right).toLowerCase(), operator)
    }
    const a = toNumber(left)
    const b = toNumber(right)
    if (isCellError(a)) return a
    if (isCellError(b)) return b
    switch (operator) {
      case '+':
        return a + b
      case '-':
        return a - b
      case '*':
        return a * b
      case '/':
        return b === 0 ? new CellError('#DIV/0!', 'Division by zero') : a / b
      default:
        return a ** b
    }
  }
}

function normaliseFunctions(functions: Record<string, SpreadsheetFunction>): Record<string, SpreadsheetFunction> {
  return Object.fromEntries(Object.entries(functions).map(([name, fn]) => [name.toUpperCase(), fn]))
}

/** A cell's final value: a range is not a value, and neither is an infinite number. */
function settle(value: FormulaArgument): CellValue {
  if (Array.isArray(value)) return new CellError('#VALUE!', 'A range cannot be the value of a cell')
  if (typeof value === 'number' && !Number.isFinite(value)) return new CellError('#NUM!', 'The result is not a finite number')
  return value
}
