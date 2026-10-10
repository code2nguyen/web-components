/**
 * The lexer keeps character references as written (`&amp;`, `&#169;`); marked's own HTML renderer leaves them for
 * the browser to decode. Rendering through text bindings instead, they are decoded here: numeric references, and the
 * named ones that turn up in practice. An unknown name is left as written, which is what a browser shows too.
 */
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  middot: '·',
  bull: '•',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  le: '≤',
  ge: '≥',
  ne: '≠',
  asymp: '≈',
  infin: '∞',
  check: '✓',
}

const REFERENCE = /&(?:#(\d{1,7})|#[xX]([\da-fA-F]{1,6})|([a-zA-Z][a-zA-Z\d]{1,31}));/g

function fromCodePoint(code: number): string {
  // Null, surrogates and values past Unicode are replaced, as the HTML parser does.
  if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�'
  return String.fromCodePoint(code)
}

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(REFERENCE, (match, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (decimal) return fromCodePoint(Number.parseInt(decimal, 10))
    if (hex) return fromCodePoint(Number.parseInt(hex, 16))
    return (name && NAMED[name]) ?? match
  })
}
