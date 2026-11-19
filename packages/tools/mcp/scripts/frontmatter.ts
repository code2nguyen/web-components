// The docs pages' frontmatter as build-registry reads it: one value per key, a block list gathered into a flow list.

export function parseFrontmatter(source: string): { frontmatter: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source)
  if (!match) return { frontmatter: {}, body: source }
  const frontmatter: Record<string, string> = {}
  let listKey: string | undefined
  for (const line of match[1].split('\n')) {
    // A YAML block list (`keywords:` then `  - faq` lines) is gathered into the inline form `[a, b]`.
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && listKey) {
      const current = frontmatter[listKey]
      // Each item quoted, so a comma inside one stays inside it (already-quoted items are kept as written).
      const raw = item[1].trim()
      const quoted = /^(['"]).*\1$/.test(raw) ? raw : `'${raw.replace(/'/g, "''")}'`
      frontmatter[listKey] = `${current === '' ? '[' : `${current.slice(0, -1)}, `}${quoted}]`
      continue
    }
    const kv = /^([a-zA-Z_-]+):\s*(.*)$/.exec(line.trim())
    if (!kv) continue
    frontmatter[kv[1]] = kv[2].replace(/^(['"])(.*)\1$/, '$2')
    listKey = kv[2] === '' ? kv[1] : undefined
  }
  return { frontmatter, body: source.slice(match[0].length) }
}

/**
 * The items of a YAML flow list (`['a', "b", c]`): single-quoted items with `''` for an apostrophe, double-quoted or
 * plain ones.
 */
export function flowList(value: string): string[] {
  return [...value.matchAll(/'((?:[^']|'')*)'|"([^"]*)"|([^,[\]'"\s][^,\]]*)/g)].map((m) => (m[1]?.replace(/''/g, "'") ?? m[2] ?? m[3]).trim()).filter(Boolean)
}
