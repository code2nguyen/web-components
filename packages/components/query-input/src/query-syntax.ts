/**
 * The `key:value` search syntax of Datadog, GitHub and Sentry, as `c2-query-input` reads it. Pure functions with no DOM,
 * so an application can run the same tokenizer on the server or in a worker and get the terms the element shows.
 *
 * - `service:web` is a term on a field; `-service:web` or `!service:web` negates it.
 * - `status:>=500`, `duration:<2s` carry a comparator (`>`, `>=`, `<`, `<=`, `=`) before the value.
 * - `"connection reset"` and `message:"timed out"` quote a phrase; `\"` escapes a quote inside it.
 * - `AND`, `OR` and `NOT` (upper case) are boolean operators, and `(` `)` group terms.
 * - Anything else is free text.
 */

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
  /** The field, or `null` for free text. */
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

/** Splits a query into tokens. Joining every token's `text` gives back the query exactly. */
export function tokenizeQuery(query: string): QueryToken[] {
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
    if (query[colon] === ':' && KEY_PATTERN.test(word)) {
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
export function parseQuery(query: string): QueryTerm[] {
  const tokens = tokenizeQuery(query)
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
