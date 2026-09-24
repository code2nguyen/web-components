import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { discoverPublishableContracts } from './style-contract-discovery.mjs'
import { collectCssConsumers, collectSlottedForwardings, compileSass, validatedSlottedForwardings } from './style-contract-css.mjs'
import { compareCompiledDefaults } from './style-contract-defaults.mjs'
import { validateApprovedExceptions } from './style-contract-exceptions.mjs'
import { classifyComposedCssRead, classifyNonCssConsumers } from './style-contract-consumers.mjs'
import { validateReviewedRegistry } from './style-contract-cases.mjs'
import { auditComposedInspectorMappings, auditInspectorMappings, auditInspectorRegistration } from './style-contract-inspector.mjs'
import { nearestName, compareDiscoveredTag } from './style-contract-source.mjs'
import { validateRegistryReferences } from './style-contract-model.mjs'

export function sortFailures(failures) {
  return [...failures].sort(
    (a, b) =>
      a.tag.localeCompare(b.tag) || a.name.localeCompare(b.name) || a.category.localeCompare(b.category) || (a.source ?? '').localeCompare(b.source ?? ''),
  )
}

export function formatFailure(failure) {
  const details = [failure.tag, failure.name, failure.category, failure.source]
  if (failure.state) details.push(`state=${failure.state}`)
  if (failure.target) details.push(`target=${failure.target}`)
  if (failure.expected !== undefined) details.push(`expected=${failure.expected}`)
  if (failure.observed !== undefined) details.push(`observed=${failure.observed}`)
  if (failure.suggestion) details.push(`did-you-mean=${failure.suggestion}`)
  return details.filter(Boolean).join(' | ')
}

function scssFiles(directory) {
  if (!existsSync(directory)) return []
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...scssFiles(path))
    else if (entry.name.endsWith('.scss') && !entry.name.startsWith('_')) files.push(path)
  }
  return files.sort()
}

function stylingFilesForTag(record) {
  const files = new Set()
  const visited = new Set()
  let modulePath = record.modulePath
  let declaration = record.declaration
  while (modulePath && !visited.has(modulePath)) {
    visited.add(modulePath)
    const sourceFile = join(record.packagePath, modulePath)
    const source = readFileSync(sourceFile, 'utf8')
    const imports = [...source.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\.scss)\?inline['"]/g)]
    const classStart = source.search(new RegExp(`\\bclass\\s+${declaration.name}\\b`))
    const nextClass = classStart < 0 ? -1 : source.indexOf('export class ', classStart + 6)
    const classSource = classStart < 0 ? '' : source.slice(classStart, nextClass < 0 ? undefined : nextClass)
    const styleBindings = new Set([...classSource.matchAll(/unsafeCSS\(\s*(\w+)\s*\)/g)].map((match) => match[1]))
    for (const match of imports) {
      if (match[2].startsWith('.') && (!styleBindings.size || styleBindings.has(match[1]))) files.add(resolve(dirname(sourceFile), match[2]))
    }
    if (!imports.length) {
      const conventional = sourceFile.replace(/\.[cm]?tsx?$/, '.scss')
      if (existsSync(conventional)) files.add(conventional)
    }
    const parent = declaration.superclass
    if (!parent?.module?.startsWith('/src/')) break
    modulePath = parent.module.slice(1).replace(/\.(?:js|mjs)$/, '.ts')
    if (!/\.tsx?$/.test(modulePath)) modulePath += '.ts'
    const module = record.packageManifest.modules.find((entry) => entry.path.replace(/^\//, '') === modulePath)
    declaration = module?.declarations?.find((entry) => entry.name === parent.name)
    if (!declaration) break
  }
  return [...files]
}

function readRegistry(repoRoot, name, key) {
  const file = join(repoRoot, 'scripts/data', name)
  const registry = JSON.parse(readFileSync(file, 'utf8'))
  if (registry.schemaVersion !== 1 || !Array.isArray(registry[key])) throw new Error(`invalid registry ${file}`)
  return registry[key]
}

function sharedIconStylingPath(record) {
  const parent = record.declaration.superclass
  if (record.packageName === '@c2n/feather-icons' && parent?.name === 'FeatherIcon' && parent.module === '/src/feather-icon') return 'feather-icon-base'
  if (record.packageName === '@c2n/phosphor-icons' && parent?.name === 'PhosphorIcon' && parent.module === '/src/phosphor-icon') return 'phosphor-icon-base'
  return null
}

/** Build static readiness only. No property is called visually verified here. */
export function buildStaticAudit(repoRoot, { requireCases = false, requirePanel = true } = {}) {
  const inventory = discoverPublishableContracts(repoRoot)
  const caseRegistry = JSON.parse(readFileSync(join(repoRoot, 'scripts/data/style-contract-cases.json'), 'utf8'))
  const cases = caseRegistry.cases
  const consumers = readRegistry(repoRoot, 'style-contract-consumers.json', 'consumers')
  const exceptions = readRegistry(repoRoot, 'style-contract-exceptions.json', 'exceptions')
  const properties = inventory.tags.flatMap((record) =>
    (record.declaration.cssProperties ?? []).map((property) => ({
      tag: record.tag,
      name: property.name,
      ownerPackage: record.packageName,
      type: typeof property.type === 'string' ? property.type : (property.type?.text ?? 'unknown'),
      default: property.default ?? null,
      sharedStylingPath: sharedIconStylingPath(record),
    })),
  )
  validateReviewedRegistry(caseRegistry, properties)
  validateRegistryReferences(properties, { cases, consumers, exceptions })

  const failures = []
  if (requirePanel) {
    const panelSource = readFileSync(join(repoRoot, 'apps/ui/src/store/component-manifests.ts'), 'utf8')
    failures.push(...auditInspectorRegistration(inventory.packages, panelSource))
    failures.push(...auditInspectorMappings(properties))
    failures.push(...auditComposedInspectorMappings(inventory.tags))
  }
  const validatedConsumers = []
  for (const mapping of consumers) {
    try {
      const sourceFile = join(repoRoot, mapping.source)
      validatedConsumers.push(
        ...classifyNonCssConsumers({
          tag: mapping.tag,
          source: readFileSync(sourceFile, 'utf8'),
          sourceFile,
          properties: [mapping.name],
          mappings: [mapping],
        }),
      )
    } catch (error) {
      failures.push({ tag: mapping.tag, name: mapping.name, category: 'invalid-consumer-mapping', source: mapping.source, observed: error.message })
    }
  }
  const tagByName = new Map(inventory.tags.map((record) => [record.tag, record]))
  const composedChildren = new Map(
    inventory.tags.map((record) => [
      record.tag,
      { tag: record.tag, declaration: record.declaration, source: readFileSync(join(record.packagePath, record.modulePath), 'utf8') },
    ]),
  )
  const validSharedCases = new Set()
  for (const item of cases.filter((candidate) => candidate.sharedStylingPath)) {
    const sample = tagByName.get(item.tag)
    if (sample && sharedIconStylingPath(sample) === item.sharedStylingPath && compareDiscoveredTag(sample).length === 0) {
      validSharedCases.add(`${item.sharedStylingPath}|${item.name}`)
    } else {
      failures.push({
        tag: item.tag,
        name: item.name,
        category: 'invalid-shared-case',
        source: 'scripts/data/style-contract-cases.json',
        state: item.state,
        target: item.target,
      })
    }
  }
  const cssByFile = new Map()
  const forwardingsByFile = new Map()
  for (const entry of inventory.packages) {
    for (const file of scssFiles(join(entry.path, 'src'))) {
      const css = compileSass({ file })
      cssByFile.set(file, collectCssConsumers(css, file))
      forwardingsByFile.set(file, collectSlottedForwardings(css, file))
    }
  }

  const childContracts = new Map(
    inventory.tags.map((record) => [
      record.tag,
      {
        documented: new Set((record.declaration.cssProperties ?? []).map((property) => property.name)),
        consumed: new Set(stylingFilesForTag(record).flatMap((file) => (cssByFile.get(file) ?? []).map((path) => path.name))),
      },
    ]),
  )

  const ownedCssPaths = []
  const composedCssReads = []
  for (const record of inventory.tags) {
    const sourceFailures = compareDiscoveredTag(record)
    failures.push(...sourceFailures)
    const sharedStylingPath = sourceFailures.length === 0 ? sharedIconStylingPath(record) : null
    const stylingFiles = stylingFilesForTag(record)
    const paths = stylingFiles.flatMap((file) => cssByFile.get(file) ?? [])
    const forwards = validatedSlottedForwardings(
      stylingFiles
        .flatMap((file) => forwardingsByFile.get(file) ?? [])
        .filter((forwarding) => forwarding.name.startsWith(`--${record.tag}--`) || forwarding.name.startsWith(`--${record.tag}__`)),
      childContracts,
    )
    ownedCssPaths.push(...paths.map((path) => ({ tag: record.tag, name: path.name, target: path.target })))
    const documented = new Set((record.declaration.cssProperties ?? []).map((property) => property.name))
    for (const path of paths) {
      if (!documented.has(path.name)) {
        const composed = classifyComposedCssRead({ parent: record, name: path.name, children: composedChildren })
        if (composed) composedCssReads.push({ tag: record.tag, ...composed, source: path.source, target: path.target })
        else failures.push({ tag: record.tag, name: path.name, category: 'undocumented-consumer', source: path.source, state: path.state, target: path.target })
      }
    }
    for (const forwarding of forwards) {
      if (!documented.has(forwarding.name)) {
        failures.push({
          tag: record.tag,
          name: forwarding.name,
          category: 'undocumented-consumer',
          source: forwarding.source,
          state: 'base',
          target: `${forwarding.selector} -> ${forwarding.childTag} ${forwarding.childProperty}`,
        })
      }
    }
    failures.push(...compareCompiledDefaults({ tag: record.tag, properties: record.declaration.cssProperties ?? [], paths }))
    for (const property of record.declaration.cssProperties ?? []) {
      const relevant = paths.filter((path) => path.name === property.name)
      const delegated = forwards.filter((forwarding) => forwarding.name === property.name)
      const dynamic = validatedConsumers.filter((consumer) => consumer.tag === record.tag && consumer.name === property.name)
      if (
        !relevant.length &&
        !delegated.length &&
        !dynamic.length &&
        !exceptions.some((exception) => exception.tag === record.tag && exception.name === property.name)
      ) {
        failures.push({
          tag: record.tag,
          name: property.name,
          category: 'unused-property',
          source: `${record.manifestFile}:${record.modulePath}`,
          state: 'base',
          target: 'documented styling target',
          suggestion: nearestName(
            property.name,
            paths.map((path) => path.name),
          ),
        })
      }
      const directCase = cases.some((item) => item.tag === record.tag && item.name === property.name)
      const sharedCase = sharedStylingPath && validSharedCases.has(`${sharedStylingPath}|${property.name}`)
      if (requireCases && !directCase && !sharedCase && !exceptions.some((item) => item.tag === record.tag && item.name === property.name)) {
        failures.push({
          tag: record.tag,
          name: property.name,
          category: 'missing-case',
          source: 'scripts/data/style-contract-cases.json',
          state: 'base',
          target: relevant[0]?.target ?? 'observable target',
        })
      }
    }
  }
  validateApprovedExceptions({ exceptions, inventory: properties, cssPaths: ownedCssPaths })
  const staticallyFailedTags = new Set(failures.filter((failure) => failure.category !== 'missing-case').map((failure) => failure.tag))
  for (const property of properties) property.staticReady = !staticallyFailedTags.has(property.tag)
  properties.sort((a, b) => a.ownerPackage.localeCompare(b.ownerPackage) || a.tag.localeCompare(b.tag) || a.name.localeCompare(b.name))
  return {
    packages: inventory.packages.length,
    tags: inventory.tags.length,
    properties,
    composedCssReads,
    failures: sortFailures(failures),
    staticReady: failures.length === 0,
  }
}
