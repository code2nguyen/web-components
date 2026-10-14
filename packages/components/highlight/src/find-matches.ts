/** How {@link findMatches} compares the query with the text. */
export interface MatchOptions {
  /** Compares letter case exactly. Off by default: `app` matches `Apple`. */
  matchCase?: boolean
  /** Ignores accents and other combining marks: `cafe` matches `café`, and `café` matches `cafe`. */
  ignoreAccents?: boolean
  /** Matches whole words only: `app` no longer matches inside `Apple`. */
  wholeWord?: boolean
  /** Splits each query string on white space and matches every word on its own. */
  words?: boolean
}

/** One match, as UTF-16 offsets into the original text (`text.slice(start, end)` is the matched text). */
export interface TextMatch {
  start: number
  end: number
}

const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u
const MARKS = /\p{M}/gu

/** Folds one code point the way the options compare it; the result may be empty (a lone combining mark). */
const fold = (char: string, { matchCase, ignoreAccents }: MatchOptions): string => {
  let folded = matchCase ? char : char.toLowerCase()
  if (ignoreAccents) folded = folded.normalize('NFD').replace(MARKS, '')
  return folded
}

const foldString = (value: string, options: MatchOptions): string => Array.from(value, (char) => fold(char, options)).join('')

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const isWordChar = (char: string | undefined): boolean => char !== undefined && WORD_CHAR.test(char)

/** The query as a deduplicated list of non-empty terms, longest first so `apple` wins over `app` at the same offset. */
export const queryTerms = (query: string | readonly string[] | null | undefined, words = false): string[] => {
  const list = query == null ? [] : typeof query === 'string' ? [query] : query
  const terms = list.flatMap((term) => (words ? String(term).split(/\s+/) : [String(term)])).filter((term) => term.trim() !== '')
  return [...new Set(terms)].sort((a, b) => b.length - a.length)
}

/**
 * Finds every non-overlapping occurrence of the query in `text`, left to right. The query is a string or a list of
 * strings; with several terms, the longest one wins where two start at the same offset. Offsets always point into
 * the original `text`, also when case or accent folding changed its length.
 */
export function findMatches(text: string, query: string | readonly string[] | null | undefined, options: MatchOptions = {}): TextMatch[] {
  const terms = queryTerms(query, options.words)
    .map((term) => foldString(term, options))
    .filter(Boolean)
  if (!text || terms.length === 0) return []

  // `origin[i]` is the offset in `text` of the code point that produced `folded[i]`.
  let folded = ''
  const origin: number[] = []
  let offset = 0
  for (const char of text) {
    const part = fold(char, options)
    for (let i = 0; i < part.length; i++) origin.push(offset)
    folded += part
    offset += char.length
  }

  const pattern = new RegExp(terms.map(escape).join('|'), 'gu')
  const matches: TextMatch[] = []
  let found: RegExpExecArray | null
  while ((found = pattern.exec(folded))) {
    const start = origin[found.index]
    // The match ends after the code point that produced its last folded character, so a match ending inside the
    // expansion of one code point (`İ` lower-cases to `i` plus a combining dot) still covers that whole code point.
    let end = nextCodePoint(text, origin[found.index + found[0].length - 1])
    if (options.wholeWord && (isWordChar(charBefore(text, start)) || isWordChar(charAt(text, end)))) {
      pattern.lastIndex = found.index + 1
      continue
    }
    // Extend over combining marks that folding dropped, so `e` in `é` (decomposed) highlights the whole letter.
    while (end < text.length && /\p{M}/u.test(charAt(text, end) ?? '')) end = nextCodePoint(text, end)
    matches.push({ start, end })
  }
  return matches
}

const charAt = (text: string, index: number): string | undefined => (index < text.length ? String.fromCodePoint(text.codePointAt(index)!) : undefined)

const charBefore = (text: string, index: number): string | undefined => {
  if (index <= 0) return undefined
  const low = text.charCodeAt(index - 1)
  const start = low >= 0xdc00 && low <= 0xdfff && index >= 2 ? index - 2 : index - 1
  return charAt(text, start)
}

const nextCodePoint = (text: string, index: number): number => index + (charAt(text, index)?.length ?? 1)
