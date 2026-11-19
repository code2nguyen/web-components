/** Reads the rows of a docs page's UsageBlock fence, the usage examples the registry serves. */

/** Removes the indentation every non-blank line shares. */
export function dedent(text: string): string {
  const lines = text.replace(/^\n+|\s+$/g, '').split('\n')
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length))
  return lines.map((l) => l.slice(indent)).join('\n')
}

/**
 * Splits a UsageBlock body into its `<div data-label="…">…</div>` rows (rows may contain nested divs). A row whose div
 * carries more than the label (`class="fields"`, a layout the block's CSS styles) keeps that div around its markup.
 */
export function usageRows(html: string): { label: string; html: string }[] {
  const rows: { label: string; html: string }[] = []
  const open = /<div\b([^>]*?)\sdata-label="([^"]+)"([^>]*)>/g
  let match: RegExpExecArray | null
  while ((match = open.exec(html))) {
    let depth = 1
    let cursor = match.index + match[0].length
    const tokens = /<div\b|<\/div>/g
    tokens.lastIndex = cursor
    let token: RegExpExecArray | null
    let end = html.length
    while ((token = tokens.exec(html))) {
      depth += token[0] === '</div>' ? -1 : 1
      if (depth === 0) {
        end = token.index
        cursor = token.index + token[0].length
        break
      }
    }
    const body = dedent(html.slice(match.index + match[0].length, end))
    const attributes = `${match[1]} ${match[3]}`.trim()
    rows.push({ label: match[2], html: attributes ? `<div ${attributes}>\n${body.replace(/^/gm, '  ')}\n</div>` : body })
    open.lastIndex = cursor
  }
  return rows
}
