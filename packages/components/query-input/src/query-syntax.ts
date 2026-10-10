/**
 * The `key:value` search syntax of Datadog, GitHub and Sentry, as `c2-query-input` reads it. Pure functions with no DOM,
 * so an application can run the same tokenizer on the server or in a worker and get the terms the element shows.
 *
 * - `service:web` is a term on a field; `-service:web` or `!service:web` negates it.
 * - `status:>=500`, `duration:<2s` carry a comparator (`>`, `>=`, `<`, `<=`, `=`) before the value.
 * - `"connection reset"` and `message:"timed out"` quote a phrase; `\"` escapes a quote inside it.
 * - `AND`, `OR` and `NOT` (upper case) are boolean operators, and `(` `)` group terms.
 * - With the `keyless` option, `:web` (a colon at the start of a word) is a term on the key-less field: its key is `''`.
 * - Anything else is free text.
 */

export interface QuerySyntaxOptions {
  /** Read a word starting with a colon (`:web`, `-:web`) as a term on the key-less field `''` rather than free text. */
  keyless?: boolean
}

/** What a token is. `whitespace` tokens are kept so the tokens of a query always concatenate back to it. */
export type QueryTokenType = 'whitespace' | 'negation' | 'key' | 'separator' | 'comparator' | 'value' | 'text' | 'operator' | 'paren'

export interface QueryToken {
  type: QueryTokenType
  /** The source text of the token, quotes included. */
  text: string
  /** Offset of the first character in the query. */
  start: number
  /** Offset just past the last character. */
  end: number
  /** On `key`, `separator`, `comparator` and `value` tokens: the field the term is on. */
  key?: string
  /** A quoted value or phrase whose closing quote is missing. */
  unterminated?: boolean
}

export type QueryComparator = '>' | '>=' | '<' | '<=' | '='

export interface QueryTerm {
  /** The field, `''` for the key-less field (`:web`), or `null` for free text. */
  key: string | null
  /** The value with its quotes removed and escapes resolved. Empty for a key typed without a value yet. */
  value: string
  /** The term was written with a leading `-` or `!`, or right after `NOT`. */
  negated: boolean
  /** The comparator written before the value, if any. */
  comparator?: QueryComparator
  /** The term's value was quoted. */
  quoted: boolean
  /** Offsets of the whole term in the query, negation included. */
  start: number
  end: number
}

const OPERATORS = new Set(['AND', 'OR', 'NOT'])
const KEY_PATTERN = /^[@A-Za-z_][\w.\-@]*$/
const COMPARATORS: QueryComparator[] = ['>=', '<=', '>', '<', '=']

const isSpace = (char: string | undefined) => char !== undefined && /\s/.test(char)
const isBoundary = (char: string | undefined) => char === undefined || isSpace(char) || char === '(' || char === ')'

/** Reads a quoted run starting at `start` (on the opening quote); returns the offset past it. */
function readQuoted(query: string, start: number): { end: number; unterminated: boolean } {
  let index = start + 1
  while (index < query.length) {
    const char = query[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '"') return { end: index + 1, unterminated: false }
    index++
  }
  return { end: query.length, unterminated: true }
}

/** Reads an unquoted run up to whitespace or a parenthesis. */
function readBare(query: string, start: number): number {
  let index = start
  while (index < query.length && !isBoundary(query[index])) index++
  return index
}

/**
 * Splits a query into tokens. Joining every token's `text` gives back the query exactly. A key-less term (`keyless`)
 * has an empty `key` token before its separator.
 */
export function tokenizeQuery(query: string, options: QuerySyntaxOptions = {}): QueryToken[] {
  const tokens: QueryToken[] = []
  const push = (type: QueryTokenType, start: number, end: number, extra: Partial<QueryToken> = {}) => {
    tokens.push({ type, text: query.slice(start, end), start, end, ...extra })
  }
  let index = 0
  while (index < query.length) {
    const char = query[index]
    if (isSpace(char)) {
      let end = index
      while (end < query.length && isSpace(query[end])) end++
      push('whitespace', index, end)
      index = end
      continue
    }
    if (char === '(' || char === ')') {
      push('paren', index, index + 1)
      index++
      continue
    }
    // A leading - or ! negates the term that follows it directly.
    if ((char === '-' || char === '!') && index + 1 < query.length && !isBoundary(query[index + 1])) {
      push('negation', index, index + 1)
      index++
      continue
    }
    if (char === '"') {
      const { end, unterminated } = readQuoted(query, index)
      push('text', index, end, unterminated ? { unterminated } : {})
      index = end
      continue
    }
    // A word: a key when a colon follows a key-shaped run, an operator, or free text.
    let colon = index
    while (colon < query.length && !isBoundary(query[colon]) && query[colon] !== ':' && query[colon] !== '"') colon++
    const word = query.slice(index, colon)
    // A colon opening a word (not glued to a quoted phrase before it) starts a term on the key-less field.
    const keyless = options.keyless === true && word === '' && (index === 0 || isBoundary(query[index - 1]) || tokens[tokens.length - 1]?.type === 'negation')
    if (query[colon] === ':' && (keyless || KEY_PATTERN.test(word))) {
      push('key', index, colon, { key: word })
      push('separator', colon, colon + 1, { key: word })
      let cursor = colon + 1
      const comparator = COMPARATORS.find((candidate) => query.startsWith(candidate, cursor))
      if (comparator) {
        push('comparator', cursor, cursor + comparator.length, { key: word })
        cursor += comparator.length
      }
      if (query[cursor] === '"') {
        const { end, unterminated } = readQuoted(query, cursor)
        push('value', cursor, end, unterminated ? { key: word, unterminated } : { key: word })
        cursor = end
      } else {
        const end = readBare(query, cursor)
        if (end > cursor) push('value', cursor, end, { key: word })
        cursor = end
      }
      index = cursor
      continue
    }
    const end = readBare(query, index)
    const text = query.slice(index, end)
    push(OPERATORS.has(text) ? 'operator' : 'text', index, end)
    index = end
  }
  return tokens
}

/** Removes the quotes of a quoted value and resolves its escapes. */
export function unquoteQueryValue(text: string): string {
  if (!text.startsWith('"')) return text
  const body = text.endsWith('"') && text.length > 1 && !text.endsWith('\\"') ? text.slice(1, -1) : text.slice(1)
  return body.replace(/\\(.)/g, '$1')
}

/** Quotes a value when it would not survive as a bare word (whitespace, parentheses, quotes, or empty). */
export function quoteQueryValue(value: string): string {
  if (value && !/[\s()"]/.test(value)) return value
  return `"${value.replace(/(["\\])/g, '\\$1')}"`
}

/**
 * Reads the terms of a query, in order. Boolean operators and parentheses are not represented: the terms are what a
 * flat filter needs (every field and value the user wrote), and `NOT` negates the term right after it.
 */
export function parseQuery(query: string, options: QuerySyntaxOptions = {}): QueryTerm[] {
  const tokens = tokenizeQuery(query, options)
  const terms: QueryTerm[] = []
  let negated = false
  let negationStart: number | undefined
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    switch (token.type) {
      case 'whitespace':
      case 'paren':
        if (token.type === 'paren') negated = false
        continue
      case 'operator':
        negated = token.text === 'NOT'
        negationStart = negated ? token.start : undefined
        continue
      case 'negation':
        negated = true
        negationStart = token.start
        continue
      case 'text':
        terms.push({
          key: null,
          value: unquoteQueryValue(token.text),
          negated,
          quoted: token.text.startsWith('"'),
          start: negationStart ?? token.start,
          end: token.end,
        })
        break
      case 'key': {
        let end = tokens[index + 1]?.end ?? token.end
        let comparator: QueryComparator | undefined
        let value = ''
        let quoted = false
        let cursor = index + 2
        if (tokens[cursor]?.type === 'comparator') {
          comparator = tokens[cursor].text as QueryComparator
          end = tokens[cursor].end
          cursor++
        }
        if (tokens[cursor]?.type === 'value') {
          value = unquoteQueryValue(tokens[cursor].text)
          quoted = tokens[cursor].text.startsWith('"')
          end = tokens[cursor].end
        }
        terms.push({
          key: token.text,
          value,
          negated,
          ...(comparator ? { comparator } : {}),
          quoted,
          start: negationStart ?? token.start,
          end,
        })
        index = cursor - (tokens[cursor]?.type === 'value' ? 0 : 1)
        break
      }
      default:
        continue
    }
    negated = false
    negationStart = undefined
  }
  return terms
}

/** A `key:value` term that stands on its own in a query, as `c2-query-input` shows it on a chip. */
export interface QueryFilter {
  /** The term's source text, negation and quotes included: `-status:>=500`, `service:"billing worker"`. */
  text: string
  /** The field, `''` for a term on the key-less field (`:web`). */
  key: string
  /** The value with its quotes removed. */
  value: string
  comparator?: QueryComparator
  negated: boolean
  quoted: boolean
}

export interface QueryFilterSplit {
  /** The standalone terms, in order. */
  filters: QueryFilter[]
  /** The query with those terms (and the space after each) removed. */
  rest: string
  /** The given caret offset, mapped into `rest`. */
  caret: number
}

/**
 * Separates the `key:value` terms that stand on their own (and so can be toggled or removed independently) from the
 * rest of a query. A term stays in `rest` when it has no value yet, its quote is unterminated, it sits inside
 * parentheses, it is joined to a neighbour by `AND` or `OR`, or it follows `NOT`. `accept` can narrow the terms taken
 * further, by their offsets in the query.
 */
export function splitQueryFilters(
  query: string,
  caret = query.length,
  accept: (start: number, end: number) => boolean = () => true,
  options: QuerySyntaxOptions = {},
): QueryFilterSplit {
  const tokens = tokenizeQuery(query, options)
  const significant = (from: number, step: 1 | -1) => {
    for (let index = from; index >= 0 && index < tokens.length; index += step) if (tokens[index].type !== 'whitespace') return tokens[index]
    return undefined
  }
  const filters: QueryFilter[] = []
  const skipped = new Set<number>()
  let depth = 0
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token.type === 'paren') depth += token.text === '(' ? 1 : -1
    const keyIndex = token.type === 'negation' && tokens[index + 1]?.type === 'key' ? index + 1 : index
    if (tokens[keyIndex].type !== 'key' || depth > 0) continue
    let last = keyIndex + 1
    if (tokens[last + 1]?.type === 'comparator') last++
    const valueToken = tokens[last + 1]?.type === 'value' ? tokens[last + 1] : undefined
    if (!valueToken || valueToken.unterminated) {
      index = last
      continue
    }
    last++
    const before = significant(index - 1, -1)
    const after = significant(last + 1, 1)
    // AND, OR or NOT before it, or AND/OR after it, ties the term to its neighbour.
    const joined = before?.type === 'operator' || (after?.type === 'operator' && after.text !== 'NOT')
    const start = token.start
    const end = valueToken.end
    if (joined || !accept(start, end)) {
      index = last
      continue
    }
    const comparator = tokens[keyIndex + 2]?.type === 'comparator' ? (tokens[keyIndex + 2].text as QueryComparator) : undefined
    filters.push({
      text: query.slice(start, end),
      key: tokens[keyIndex].text,
      value: unquoteQueryValue(valueToken.text),
      ...(comparator ? { comparator } : {}),
      negated: keyIndex > index,
      quoted: valueToken.text.startsWith('"'),
    })
    for (let skip = index; skip <= last; skip++) skipped.add(skip)
    if (tokens[last + 1]?.type === 'whitespace') skipped.add(last + 1)
    index = last
  }
  let rest = ''
  let removedBefore = 0
  tokens.forEach((token, index) => {
    if (!skipped.has(index)) {
      rest += token.text
      return
    }
    if (token.end <= caret) removedBefore += token.text.length
    else if (token.start < caret) removedBefore += caret - token.start
  })
  return { filters, rest, caret: Math.max(0, caret - removedBefore) }
}
