import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function sourceBlockForTag(source, tag) {
  for (const match of source.matchAll(/\/\*\*([\s\S]*?)\*\//g)) {
    if (new RegExp(`@tag\\s+${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(match[1])) return { text: match[1], start: match.index }
  }
  return null
}

function extractPropertiesFromBlock(source, block, sourceFile) {
  const properties = []
  for (const match of block.text.matchAll(/@cssproperty\s+\{([^}]+)\}\s+(?:\[(--[^\]=\s]+)(?:=([^\]]*))?\]|(--[^\s*]+))/g)) {
    const name = match[2] ?? match[4]
    const location = block.start + 3 + match.index
    const line = source.slice(0, location).split('\n').length
    properties.push({ name, type: match[1].trim(), default: match[3]?.trim() ?? null, source: `${sourceFile}:${line}` })
  }
  return properties
}

export function extractSourceCssProperties(source, tag, sourceFile) {
  const block = sourceBlockForTag(source, tag)
  if (!block) throw new Error(`${sourceFile}: no @tag ${tag} source declaration`)
  return extractPropertiesFromBlock(source, block, sourceFile)
}

function extractAllSourceCssProperties(source, sourceFile) {
  const properties = []
  for (const match of source.matchAll(/\/\*\*([\s\S]*?)\*\//g)) {
    properties.push(...extractPropertiesFromBlock(source, { text: match[1], start: match.index }, sourceFile))
  }
  return properties
}

function editDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const prior = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + Number(a[i - 1] !== b[j - 1]))
      diagonal = prior
    }
  }
  return previous[b.length]
}

export function nearestName(name, candidates) {
  const ranked = candidates
    .map((candidate) => ({ candidate, distance: editDistance(name, candidate) }))
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate))
  const closest = ranked[0]
  return closest && closest.distance <= Math.max(3, Math.floor(name.length / 6)) ? closest.candidate : null
}

export function compareSourceManifest({ tag, source, sourceFile, manifestProperties, sourceProperties = extractSourceCssProperties(source, tag, sourceFile) }) {
  const failures = []
  const sourceByName = new Map()
  const manifestByName = new Map()
  for (const property of sourceProperties) {
    if (sourceByName.has(property.name)) failures.push({ tag, name: property.name, category: 'duplicate-property', source: property.source })
    sourceByName.set(property.name, property)
  }
  for (const property of manifestProperties) {
    if (manifestByName.has(property.name)) failures.push({ tag, name: property.name, category: 'duplicate-property', source: 'custom-elements.json' })
    manifestByName.set(property.name, property)
  }
  for (const property of sourceProperties) {
    const generated = manifestByName.get(property.name)
    if (!generated) {
      failures.push({
        tag,
        name: property.name,
        category: 'missing-manifest',
        source: property.source,
        suggestion: nearestName(property.name, [...manifestByName.keys()]),
      })
      continue
    }
    const generatedType = typeof generated.type === 'string' ? generated.type : (generated.type?.text ?? null)
    if (property.type !== generatedType)
      failures.push({ tag, name: property.name, category: 'type-mismatch', source: property.source, expected: property.type, observed: generatedType })
    if (property.default !== (generated.default ?? null)) {
      failures.push({
        tag,
        name: property.name,
        category: 'default-mismatch',
        source: property.source,
        expected: property.default,
        observed: generated.default ?? null,
      })
    }
  }
  for (const property of manifestProperties) {
    if (!sourceByName.has(property.name))
      failures.push({
        tag,
        name: property.name,
        category: 'stale-manifest',
        source: 'custom-elements.json',
        suggestion: nearestName(property.name, [...sourceByName.keys()]),
      })
  }
  return failures
}

export function compareDiscoveredTag(record) {
  const sourceFile = join(record.packagePath, record.modulePath)
  const source = readFileSync(sourceFile, 'utf8')
  const own = extractSourceCssProperties(source, record.tag, sourceFile)
  const inheritedLevels = []
  const seen = new Set()
  let parent = record.declaration.superclass
  while (parent?.module?.startsWith('/src/')) {
    const parentPath = parent.module.slice(1)
    const modulePath = parentPath.endsWith('.js') ? parentPath.replace(/\.js$/, '.ts') : parentPath.endsWith('.ts') ? parentPath : `${parentPath}.ts`
    if (seen.has(modulePath)) throw new Error(`${record.tag}: cyclic superclass path ${modulePath}`)
    seen.add(modulePath)
    const module = record.packageManifest.modules.find((entry) => entry.path === modulePath)
    if (!module) break
    const declaration = (module.declarations ?? []).find((entry) => entry.name === parent.name)
    if (!declaration) break
    const inheritedSourceFile = join(record.packagePath, modulePath)
    inheritedLevels.push(extractAllSourceCssProperties(readFileSync(inheritedSourceFile, 'utf8'), inheritedSourceFile))
    parent = declaration.superclass
  }
  const sourceProperties = [...new Map([...inheritedLevels.reverse().flat(), ...own].map((property) => [property.name, property])).values()]
  return compareSourceManifest({ tag: record.tag, source, sourceFile, manifestProperties: record.declaration.cssProperties ?? [], sourceProperties })
}
