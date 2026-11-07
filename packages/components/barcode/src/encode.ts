/** The barcode formats `c2-barcode` draws. */
export type BarcodeFormat = 'code128' | 'ean13' | 'ean8' | 'upca' | 'code39' | 'datamatrix'

/** A run of text under a 1D code, positioned in modules from the first bar. */
export interface BarcodeText {
  text: string
  /** Where the text is anchored, in modules from the first bar (negative is in the left quiet zone). */
  x: number
  anchor: 'start' | 'middle' | 'end'
}

/** A 1D code: one entry per module, `true` for a bar. */
export interface LinearBarcode {
  kind: 'linear'
  modules: boolean[]
  /** Modules drawn longer, into the text line (EAN and UPC guards). */
  long: boolean[]
  text: BarcodeText[]
  /** The minimum quiet zone the format requires, in modules. */
  quiet: [left: number, right: number]
  /** The value as encoded, check digit included. */
  encoded: string
}

/** A 2D code: rows of modules, `true` for a dark one, finder patterns included. */
export interface MatrixBarcode {
  kind: 'matrix'
  rows: boolean[][]
  encoded: string
}

export type EncodedBarcode = LinearBarcode | MatrixBarcode

/** Thrown when a value cannot be encoded in a format; `reason` names why. */
export class BarcodeEncodeError extends Error {
  readonly reason: 'empty' | 'characters' | 'length' | 'check-digit'

  constructor(reason: BarcodeEncodeError['reason'], message: string) {
    super(message)
    this.name = 'BarcodeEncodeError'
    this.reason = reason
  }
}

/** Encodes `value` in `format`, or throws a {@link BarcodeEncodeError}. */
export function encodeBarcode(value: string, format: BarcodeFormat): EncodedBarcode {
  if (!value) throw new BarcodeEncodeError('empty', 'There is no value to encode.')
  switch (format) {
    case 'ean13':
    case 'ean8':
    case 'upca':
      return encodeEan(value, format)
    case 'code39':
      return encodeCode39(value)
    case 'datamatrix':
      return encodeDataMatrix(value)
    default:
      return encodeCode128(value)
  }
}

/** Turns a width pattern (`'2122'`: bar 2, space 1, …) into modules. */
function widths(pattern: string, modules: boolean[]): void {
  for (let index = 0; index < pattern.length; index += 1) {
    for (let width = 0; width < Number(pattern[index]); width += 1) modules.push(index % 2 === 0)
  }
}

// ---------------------------------------------------------------------------------------------------------------- EAN

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const EAN_R = EAN_L.map((code) => [...code].map((bit) => (bit === '1' ? '0' : '1')).join(''))
const EAN_G = EAN_R.map((code) => [...code].reverse().join(''))
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLL', 'LGLGGL', 'LGGLGL']

/** The GS1 check digit of the digits before it. */
export function gs1CheckDigit(digits: string): number {
  let sum = 0
  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[digits.length - 1 - index])
    sum += digit * (index % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10
}

function encodeEan(value: string, format: 'ean13' | 'ean8' | 'upca'): LinearBarcode {
  const length = format === 'ean13' ? 13 : format === 'ean8' ? 8 : 12
  const name = format === 'ean13' ? 'EAN-13' : format === 'ean8' ? 'EAN-8' : 'UPC-A'
  if (!/^\d+$/.test(value)) throw new BarcodeEncodeError('characters', `${name} takes digits only.`)
  if (value.length !== length && value.length !== length - 1) {
    throw new BarcodeEncodeError('length', `${name} takes ${length - 1} digits, or ${length} with the check digit.`)
  }
  const body = value.slice(0, length - 1)
  const check = String(gs1CheckDigit(body))
  if (value.length === length && value[length - 1] !== check) {
    throw new BarcodeEncodeError('check-digit', `The check digit should be ${check}.`)
  }
  const full = body + check
  // UPC-A is EAN-13 with a leading 0.
  const digits = format === 'upca' ? `0${full}` : full
  const modules: boolean[] = []
  const long: boolean[] = []
  const push = (bits: string, isLong: boolean) => {
    for (const bit of bits) {
      modules.push(bit === '1')
      long.push(isLong)
    }
  }
  if (format === 'ean8') {
    push('101', true)
    for (const digit of digits.slice(0, 4)) push(EAN_L[Number(digit)], false)
    push('01010', true)
    for (const digit of digits.slice(4)) push(EAN_R[Number(digit)], false)
    push('101', true)
    return {
      kind: 'linear',
      modules,
      long,
      text: [
        { text: full.slice(0, 4), x: 17, anchor: 'middle' },
        { text: full.slice(4), x: 50, anchor: 'middle' },
      ],
      quiet: [7, 7],
      encoded: full,
    }
  }
  const parity = EAN_PARITY[Number(digits[0])]
  push('101', true)
  for (let index = 1; index <= 6; index += 1) push((parity[index - 1] === 'L' ? EAN_L : EAN_G)[Number(digits[index])], format === 'upca' && index === 1)
  push('01010', true)
  for (let index = 7; index <= 12; index += 1) push(EAN_R[Number(digits[index])], format === 'upca' && index === 12)
  push('101', true)
  const text: BarcodeText[] =
    format === 'upca'
      ? [
          { text: full[0], x: -2, anchor: 'end' },
          { text: full.slice(1, 6), x: 27.5, anchor: 'middle' },
          { text: full.slice(6, 11), x: 67.5, anchor: 'middle' },
          { text: full[11], x: 97, anchor: 'start' },
        ]
      : [
          { text: full[0], x: -2, anchor: 'end' },
          { text: full.slice(1, 7), x: 24, anchor: 'middle' },
          { text: full.slice(7), x: 71, anchor: 'middle' },
        ]
  return { kind: 'linear', modules, long, text, quiet: format === 'upca' ? [9, 9] : [11, 7], encoded: full }
}

// ----------------------------------------------------------------------------------------------------------- Code 128

const CODE128 = (
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
  '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
  '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
  '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
  '114131 311141 411131 211412 211214 211232'
).split(' ')
const CODE128_STOP = '2331112'
const START = { A: 103, B: 104, C: 105 } as const
const SWITCH = { A: 101, B: 100, C: 99 } as const

/** The number of digits in a row from `index`. */
function digitRun(value: string, index: number): number {
  let end = index
  while (end < value.length && value.charCodeAt(end) >= 48 && value.charCodeAt(end) <= 57) end += 1
  return end - index
}

function encodeCode128(value: string): LinearBarcode {
  for (const char of value) {
    if (char.charCodeAt(0) > 127) throw new BarcodeEncodeError('characters', 'Code 128 takes ASCII characters only.')
  }
  // Code set C packs two digits per symbol: it is worth it for a run of four digits, or for a value made of an even
  // number of digits. Control characters need set A; everything else is set B.
  const codes: number[] = []
  let set: 'A' | 'B' | 'C' | null = null
  const choose = (next: 'A' | 'B' | 'C') => {
    if (set === next) return
    codes.push(set === null ? START[next] : SWITCH[next])
    set = next
  }
  let index = 0
  while (index < value.length) {
    const run = digitRun(value, index)
    const wholeValue = index === 0 && run === value.length && run >= 2
    if (run >= 4 || wholeValue || (set === 'C' && run >= 2)) {
      // An odd run takes its first digit in the current set, so set C ends on a pair.
      if (run % 2 === 1 && set !== 'C') {
        choose(set ?? 'B')
        codes.push(value.charCodeAt(index) - 32)
        index += 1
        continue
      }
      choose('C')
      codes.push(Number(value.slice(index, index + 2)))
      index += 2
      continue
    }
    const code = value.charCodeAt(index)
    if (code < 32) choose('A')
    else if (code >= 96 || set !== 'A') choose('B')
    codes.push(code < 32 ? code + 64 : code - 32)
    index += 1
  }
  const check = codes.reduce((sum, code, position) => sum + code * (position || 1), 0) % 103
  codes.push(check)
  const modules: boolean[] = []
  for (const code of codes) widths(CODE128[code], modules)
  widths(CODE128_STOP, modules)
  return {
    kind: 'linear',
    modules,
    long: modules.map(() => false),
    text: [{ text: printable(value), x: modules.length / 2, anchor: 'middle' }],
    quiet: [10, 10],
    encoded: value,
  }
}

/** The value as a person reads it: control characters dropped. */
function printable(value: string): string {
  return [...value].filter((char) => char.charCodeAt(0) >= 32).join('')
}

// ------------------------------------------------------------------------------------------------------------ Code 39

const CODE39_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*'
const CODE39 = (
  '000110100 100100001 001100001 101100000 000110001 100110000 001110000 000100101 100100100 001100100 100001001 001001001 101001000 000011001 ' +
  '100011000 001011000 000001101 100001100 001001100 000011100 100000011 001000011 101000010 000010011 100010010 001010010 000000111 100000110 ' +
  '001000110 000010110 110000001 011000001 111000000 010010001 110010000 011010000 010000101 110000100 011000100 010101000 010100010 010001010 ' +
  '000101010 010010100'
).split(' ')

function encodeCode39(value: string): LinearBarcode {
  const upper = value.toUpperCase()
  if (![...upper].every((char) => char !== '*' && CODE39_CHARS.includes(char))) {
    throw new BarcodeEncodeError('characters', 'Code 39 takes letters, digits, space and - . $ / + % only.')
  }
  const modules: boolean[] = []
  const symbols = `*${upper}*`
  for (let index = 0; index < symbols.length; index += 1) {
    const pattern = CODE39[CODE39_CHARS.indexOf(symbols[index])]
    // Wide elements are three modules, narrow ones one; a narrow gap separates characters.
    widths([...pattern].map((bit) => (bit === '1' ? '3' : '1')).join(''), modules)
    if (index < symbols.length - 1) modules.push(false)
  }
  return {
    kind: 'linear',
    modules,
    long: modules.map(() => false),
    text: [{ text: upper, x: modules.length / 2, anchor: 'middle' }],
    quiet: [10, 10],
    encoded: upper,
  }
}

// ------------------------------------------------------------------------------------------------- Data Matrix (ECC 200)

/** The square ECC 200 sizes: [size, regions per side, data codewords, error codewords, interleaved blocks]. */
const MATRIX_SIZES: [number, number, number, number, number][] = [
  [10, 1, 3, 5, 1],
  [12, 1, 5, 7, 1],
  [14, 1, 8, 10, 1],
  [16, 1, 12, 12, 1],
  [18, 1, 18, 14, 1],
  [20, 1, 22, 18, 1],
  [22, 1, 30, 20, 1],
  [24, 1, 36, 24, 1],
  [26, 1, 44, 28, 1],
  [32, 2, 62, 36, 1],
  [36, 2, 86, 42, 1],
  [40, 2, 114, 48, 1],
  [44, 2, 144, 56, 1],
  [48, 2, 174, 68, 1],
  [52, 2, 204, 84, 2],
  [64, 4, 280, 112, 2],
  [72, 4, 368, 144, 4],
  [80, 4, 456, 192, 4],
  [88, 4, 576, 224, 4],
  [96, 4, 696, 272, 4],
  [104, 4, 816, 336, 6],
  [120, 6, 1050, 408, 6],
  [132, 6, 1304, 496, 8],
  [144, 6, 1558, 620, 10],
]

/**
 * ASCII encodation: digit pairs in one codeword, other bytes as themselves plus one, bytes over 127 behind an upper
 * shift. Data Matrix reads bytes as ISO-8859-1, so a value outside it is sent as UTF-8 behind ECI 26.
 */
export function dataMatrixCodewords(value: string): number[] {
  const latin1 = [...value].every((char) => char.charCodeAt(0) <= 255 && char.length === 1)
  const bytes = latin1 ? [...value].map((char) => char.charCodeAt(0)) : [...new TextEncoder().encode(value)]
  const codewords: number[] = latin1 ? [] : [241, 27]
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index]
    const next = bytes[index + 1]
    if (byte >= 48 && byte <= 57 && next !== undefined && next >= 48 && next <= 57) {
      codewords.push(130 + (byte - 48) * 10 + (next - 48))
      index += 1
    } else if (byte > 127) {
      codewords.push(235, byte - 127)
    } else {
      codewords.push(byte + 1)
    }
  }
  return codewords
}

const GF_EXP: number[] = []
const GF_LOG: number[] = []
{
  let x = 1
  for (let index = 0; index < 255; index += 1) {
    GF_EXP[index] = x
    GF_LOG[x] = index
    x <<= 1
    if (x & 0x100) x ^= 0x12d
  }
  for (let index = 255; index < 512; index += 1) GF_EXP[index] = GF_EXP[index - 255]
}
const gfMultiply = (a: number, b: number) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]])

/** Reed-Solomon error codewords over GF(256) (polynomial 0x12D, roots α¹…αⁿ). */
export function reedSolomon(data: number[], count: number): number[] {
  let generator = [1]
  for (let root = 1; root <= count; root += 1) {
    const next = new Array<number>(generator.length + 1).fill(0)
    for (let index = 0; index < generator.length; index += 1) {
      next[index] ^= generator[index]
      next[index + 1] ^= gfMultiply(generator[index], GF_EXP[root])
    }
    generator = next
  }
  const remainder = new Array<number>(count).fill(0)
  for (const codeword of data) {
    const factor = codeword ^ remainder[0]
    remainder.shift()
    remainder.push(0)
    for (let index = 0; index < count; index += 1) remainder[index] ^= gfMultiply(generator[index + 1], factor)
  }
  return remainder
}

/** The ECC 200 placement: for each cell of the mapping matrix, `codeword * 10 + bit` (bit 1 is the most significant), or 1 for a fixed dark cell. */
function placement(rows: number, columns: number): number[] {
  const cells = new Array<number>(rows * columns).fill(0)
  const module = (row: number, column: number, codeword: number, bit: number) => {
    if (row < 0) {
      row += rows
      column += 4 - ((rows + 4) % 8)
    }
    if (column < 0) {
      column += columns
      row += 4 - ((columns + 4) % 8)
    }
    cells[row * columns + column] = codeword * 10 + bit
  }
  const utah = (row: number, column: number, codeword: number) => {
    module(row - 2, column - 2, codeword, 1)
    module(row - 2, column - 1, codeword, 2)
    module(row - 1, column - 2, codeword, 3)
    module(row - 1, column - 1, codeword, 4)
    module(row - 1, column, codeword, 5)
    module(row, column - 2, codeword, 6)
    module(row, column - 1, codeword, 7)
    module(row, column, codeword, 8)
  }
  const corner = (codeword: number, places: [number, number][]) => places.forEach(([row, column], index) => module(row, column, codeword, index + 1))
  let codeword = 1
  let row = 4
  let column = 0
  do {
    if (row === rows && column === 0) {
      corner(codeword++, [
        [rows - 1, 0],
        [rows - 1, 1],
        [rows - 1, 2],
        [0, columns - 2],
        [0, columns - 1],
        [1, columns - 1],
        [2, columns - 1],
        [3, columns - 1],
      ])
    }
    if (row === rows - 2 && column === 0 && columns % 4) {
      corner(codeword++, [
        [rows - 3, 0],
        [rows - 2, 0],
        [rows - 1, 0],
        [0, columns - 4],
        [0, columns - 3],
        [0, columns - 2],
        [0, columns - 1],
        [1, columns - 1],
      ])
    }
    if (row === rows - 2 && column === 0 && columns % 8 === 4) {
      corner(codeword++, [
        [rows - 3, 0],
        [rows - 2, 0],
        [rows - 1, 0],
        [0, columns - 2],
        [0, columns - 1],
        [1, columns - 1],
        [2, columns - 1],
        [3, columns - 1],
      ])
    }
    if (row === rows + 4 && column === 2 && !(columns % 8)) {
      corner(codeword++, [
        [rows - 1, 0],
        [rows - 1, columns - 1],
        [0, columns - 3],
        [0, columns - 2],
        [0, columns - 1],
        [1, columns - 3],
        [1, columns - 2],
        [1, columns - 1],
      ])
    }
    do {
      if (row < rows && column >= 0 && !cells[row * columns + column]) utah(row, column, codeword++)
      row -= 2
      column += 2
    } while (row >= 0 && column < columns)
    row += 1
    column += 3
    do {
      if (row >= 0 && column < columns && !cells[row * columns + column]) utah(row, column, codeword++)
      row += 2
      column -= 2
    } while (row < rows && column >= 0)
    row += 3
    column += 1
  } while (row < rows || column < columns)
  if (!cells[rows * columns - 1]) {
    cells[rows * columns - 1] = 1
    cells[rows * columns - columns - 2] = 1
  }
  return cells
}

function encodeDataMatrix(value: string): MatrixBarcode {
  const data = dataMatrixCodewords(value)
  const size = MATRIX_SIZES.find(([, , capacity]) => capacity >= data.length)
  if (!size) throw new BarcodeEncodeError('length', 'The value is too long for a Data Matrix.')
  const [symbol, regions, capacity, errorCount, blocks] = size
  // Pad: 129 first, then the 253-state randomised pad.
  const length = data.length
  for (let position = length + 1; position <= capacity; position += 1) {
    if (position === length + 1) {
      data.push(129)
    } else {
      const pad = 129 + ((149 * position) % 253) + 1
      data.push(pad > 254 ? pad - 254 : pad)
    }
  }
  // Interleave: codeword i belongs to block i mod blocks; each block gets its own error codewords.
  const perBlock = errorCount / blocks
  const codewords = [...data, ...new Array<number>(errorCount).fill(0)]
  for (let block = 0; block < blocks; block += 1) {
    const blockData = data.filter((_codeword, index) => index % blocks === block)
    // The 144×144 symbol interleaves its error codewords two blocks round (ISO/IEC 16022, 5.7.2).
    const offset = symbol === 144 ? (block + 2) % blocks : block
    reedSolomon(blockData, perBlock).forEach((codeword, index) => (codewords[capacity + offset + index * blocks] = codeword))
  }
  const region = symbol / regions - 2
  const mapping = region * regions
  const cells = placement(mapping, mapping)
  const rows = Array.from({ length: symbol }, () => new Array<boolean>(symbol).fill(false))
  // Finder and clock patterns: a solid L on the left and bottom of each region, alternating cells on top and right.
  for (let row = 0; row < symbol; row += 1) {
    for (let column = 0; column < symbol; column += 1) {
      const inRow = row % (region + 2)
      const inColumn = column % (region + 2)
      if (inColumn === 0 || inRow === region + 1) rows[row][column] = true
      else if (inRow === 0) rows[row][column] = inColumn % 2 === 0
      else if (inColumn === region + 1) rows[row][column] = inRow % 2 === 1
    }
  }
  for (let row = 0; row < mapping; row += 1) {
    for (let column = 0; column < mapping; column += 1) {
      const cell = cells[row * mapping + column]
      const dark = cell === 1 || (cell >= 10 && ((codewords[Math.floor(cell / 10) - 1] >> (8 - (cell % 10))) & 1) === 1)
      rows[Math.floor(row / region) * (region + 2) + 1 + (row % region)][Math.floor(column / region) * (region + 2) + 1 + (column % region)] = dark
    }
  }
  return { kind: 'matrix', rows, encoded: value }
}
