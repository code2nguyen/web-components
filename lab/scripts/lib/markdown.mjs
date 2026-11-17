// Readers for the lab's markdown: spec and report front matter, and a build report's requirement rows. Shared by
// gaps.mjs (the gap matrix) and record.mjs (run records snapshot the report a build was made from).

export const OUTCOMES = ['met', 'workaround', 'hand-rolled', 'failed']

/** A deliberately small front-matter reader: `key: value` and `key: [a, b]` lines between `---` fences. */
export function frontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
  const data = {}
  if (!match) return { data, body: text }
  for (const line of match[1].split('\n')) {
    const field = /^([\w-]+):\s*(.*)$/.exec(line)
    if (!field) continue
    const value = field[2].trim()
    data[field[1]] = value.startsWith('[')
      ? value
          .slice(1, -1)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : value
  }
  return { data, body: text.slice(match[0].length) }
}

/**
 * The requirement rows of a build report's table: `| R1 | met | c2-…, c2-… | notes |`. Returns a Map of id →
 * `{ outcome, rawOutcome, components, notes }`; `outcome` is the cell reduced to its letters, so `met ✅` reads `met`.
 */
export function reportRows(body) {
  const rows = new Map()
  for (const line of body.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    if (cells.length < 5 || !/^R\d+$/.test(cells[1])) continue
    const components = [...cells[3].matchAll(/c2-[a-z0-9-]+|@c2n\/[a-z0-9-]+/g)].map((match) => match[0])
    rows.set(cells[1], { outcome: cells[2].replace(/[^a-z-]/g, ''), rawOutcome: cells[2], components, notes: cells[4] })
  }
  return rows
}
