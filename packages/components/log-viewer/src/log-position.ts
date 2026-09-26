/** Prefix offsets support variable row heights and binary viewport lookup. */
export class LineIndex {
  readonly offsets = [0]
  append(height: number): void {
    this.offsets.push(this.total + height)
  }
  get total(): number {
    return this.offsets[this.offsets.length - 1]
  }
  at(offset: number): number {
    let low = 0
    let high = this.offsets.length - 2
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      if (this.offsets[mid] <= offset) low = mid
      else high = mid - 1
    }
    return Math.max(0, low)
  }
}

/** Explicit line breaks, tabs and measured glyph widths; breaks long tokens without assuming equal glyph widths. */
export function textLines(text: string, width: number, measure: (text: string) => number, wrap: boolean): string[] {
  const result: string[] = []
  for (const logical of text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    if (!wrap || !logical || measure(logical) <= width) {
      result.push(logical)
      continue
    }
    let line = ''
    let size = 0
    for (const glyph of logical) {
      const advance = measure(glyph)
      if (line && size + advance > width) {
        result.push(line)
        line = ''
        size = 0
      }
      line += glyph
      size += advance
    }
    result.push(line)
  }
  return result
}
