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

/** Visual lines retain their source logical line and UTF-16 offset for token projection. */
export interface TextLayout {
  lines: string[]
  logicalLines: string[]
  sources: number[]
  starts: number[]
}

/**
 * Explicit line breaks, tabs and measured glyph widths; breaks long tokens without assuming equal glyph widths.
 * widths caches each logical line's natural width across calls, so rewrapping the same text at a new width does not measure it again.
 */
export function textLayout(text: string, width: number, measure: (text: string) => number, wrap: boolean, widths?: number[]): TextLayout {
  const result: TextLayout = { lines: [], logicalLines: text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'), sources: [], starts: [] }
  const push = (line: string, source: number, start: number) => {
    result.lines.push(line)
    result.sources.push(source)
    result.starts.push(start)
  }
  for (let source = 0; source < result.logicalLines.length; source++) {
    const logical = result.logicalLines[source]
    if (!wrap || !logical || (widths ? (widths[source] ??= measure(logical)) : measure(logical)) <= width) {
      push(logical, source, 0)
      continue
    }
    let line = ''
    let size = 0
    let start = 0
    for (const glyph of logical) {
      const advance = measure(glyph)
      if (line && size + advance > width) {
        push(line, source, start)
        start += line.length
        line = ''
        size = 0
      }
      line += glyph
      size += advance
    }
    push(line, source, start)
  }
  return result
}

export function textLines(text: string, width: number, measure: (text: string) => number, wrap: boolean): string[] {
  return textLayout(text, width, measure, wrap).lines
}
