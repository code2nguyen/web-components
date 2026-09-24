export type C2TagName = `c2-${string}`
export type C2PackageName = `@c2n/${string}`

export interface ComponentUsageRecord {
  tag: C2TagName
  packageName: C2PackageName
  purpose: string
  regions: readonly string[]
  docsPath: `/web-components/components/${string}`
  sourcePaths: readonly string[]
}

export function defineComponentUsage<const T extends readonly ComponentUsageRecord[]>(records: T): T {
  const tags = new Set<string>()
  for (const record of records) {
    if (tags.has(record.tag)) throw new Error(`Duplicate component usage record: ${record.tag}`)
    if (record.regions.length === 0 || record.sourcePaths.length === 0) throw new Error(`Incomplete component usage record: ${record.tag}`)
    tags.add(record.tag)
  }
  return records
}
