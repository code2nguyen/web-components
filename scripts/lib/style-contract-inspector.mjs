import { buildInspectorDescriptors } from '../../apps/ui/src/utils/inspector-descriptors.ts'

/** Match both the manifest import and its use in normalizedManifests, not an unused import alone. */
export function auditInspectorRegistration(packages, source) {
  const imported = new Map(
    [...source.matchAll(/import\s+(\w+)\s+from\s+['"](@c2n\/[^'"\s]+)\/custom-elements\.json['"]/g)].map((match) => [match[1], match[2]]),
  )
  const list = /const normalizedManifests:[^=]+?=\s*\[([\s\S]*?)\]\.reduce/.exec(source)?.[1] ?? ''
  const registered = new Set([...list.matchAll(/\b[A-Za-z][A-Za-z0-9]*\b/g)].map((match) => imported.get(match[0])).filter(Boolean))
  return packages.filter((entry) => !registered.has(entry.name)).map((entry) => ({ category: 'missing-panel-registration', packageName: entry.name }))
}

function normalizeProperty(entry) {
  const segments = entry.name.split('--')
  return {
    cssVariable: entry.name,
    type: entry.type ?? '',
    default: entry.default ?? undefined,
    blocks: segments[1]?.split('__') ?? [],
    property: segments.slice(2).join('--'),
  }
}

/** Check one exact control owner per property without rendering thousands of inspector rows. */
export function auditInspectorMappings(properties) {
  const failures = []
  const groups = new Map()
  for (const entry of properties) {
    if (entry.writeTarget && entry.writeTarget !== entry.tag) failures.push({ category: 'wrong-target', tag: entry.tag, name: entry.name })
    const normalized = normalizeProperty(entry)
    const key = JSON.stringify([entry.tag, normalized.blocks])
    const group = groups.get(key) ?? []
    group.push(normalized)
    groups.set(key, group)
  }
  for (const items of groups.values()) {
    try {
      const descriptors = buildInspectorDescriptors(items)
      const expected = items.map((item) => item.cssVariable).sort()
      const actual = descriptors.flatMap((descriptor) => descriptor.names).sort()
      if (JSON.stringify(expected) !== JSON.stringify(actual))
        failures.push({ category: 'missing-control', name: expected.find((name) => !actual.includes(name)) ?? '' })
      for (const descriptor of descriptors) {
        if (['padding-sides', 'radius-corners'].includes(descriptor.controlFamily) && descriptor.names.length !== 4) {
          failures.push({ category: 'ambiguous-control', name: descriptor.names.join('|') })
        }
        if (['padding-shorthand', 'radius-shorthand'].includes(descriptor.controlFamily) && descriptor.names.length !== 1) {
          failures.push({ category: 'ambiguous-control', name: descriptor.names.join('|') })
        }
      }
    } catch (error) {
      failures.push({ category: 'duplicate-control', name: items[0]?.cssVariable ?? '', observed: error.message })
    }
  }
  return failures
}

export function auditComposedInspectorMappings(tags) {
  const byTag = new Map(tags.map((record) => [record.tag, record]))
  const failures = []
  for (const parent of tags) {
    const own = new Set((parent.declaration.cssProperties ?? []).map((property) => property.name))
    for (const childTag of [...(parent.declaration.internalComponents ?? []), ...(parent.declaration.slotComponents ?? [])]) {
      const child = byTag.get(childTag)
      if (!child) {
        failures.push({ category: 'missing-child-owner', tag: parent.tag, name: childTag })
        continue
      }
      for (const property of child.declaration.cssProperties ?? []) {
        if (own.has(property.name)) failures.push({ category: 'ambiguous-child-owner', tag: parent.tag, name: property.name, childTag })
      }
    }
  }
  return failures
}
