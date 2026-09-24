const FINAL_STATUSES = new Set(['verified', 'failed', 'approved-exception'])
const CONSUMPTION_MODES = new Set(['compiled-css', 'inline-style', 'programmatic', 'delegated'])
const ASSERTION_KINDS = new Set(['computed-style', 'geometry', 'pseudo-style', 'slotted-style', 'delegated-style', 'programmatic-output'])

function requiredString(record, field) {
  if (typeof record[field] !== 'string' || !record[field].trim()) throw new Error(`missing ${field}`)
  return record[field]
}

export function propertyKey(tag, name) {
  if (!tag || !name) throw new Error('property identity requires tag and name')
  return JSON.stringify([tag, name])
}

export function validatePropertyInventory(properties) {
  const seen = new Set()
  for (const property of properties) {
    const key = propertyKey(property.tag, property.name)
    if (seen.has(key)) throw new Error(`duplicate property ${property.tag} ${property.name}`)
    seen.add(key)
  }
  return seen
}

export function validateRegistryReferences(inventory, { cases = [], consumers = [], exceptions = [] }) {
  const known = validatePropertyInventory(inventory)
  for (const [label, entries] of [
    ['case', cases],
    ['consumer', consumers],
    ['exception', exceptions],
  ]) {
    const identities = new Set()
    for (const entry of entries) {
      const key = propertyKey(entry.tag, entry.name)
      if (!known.has(key)) throw new Error(`stale ${label} reference: ${entry.tag} ${entry.name}`)
      if (label !== 'consumer') {
        const identity = label === 'case' ? `${key}:${entry.state}` : key
        if (identities.has(identity)) throw new Error(`duplicate ${label} reference: ${entry.tag} ${entry.name}`)
        identities.add(identity)
      }
    }
  }
}

export function createElementContract(input) {
  return {
    tag: requiredString(input, 'tag'),
    packageName: requiredString(input, 'packageName'),
    source: requiredString(input, 'source'),
    manifest: input.manifest ?? null,
    generatedFamily: input.generatedFamily ?? null,
    stylingPath: input.stylingPath ?? null,
    parts: input.parts ?? [],
    states: input.states ?? [],
  }
}

export function createStylingProperty(input) {
  const tag = requiredString(input, 'tag')
  const name = requiredString(input, 'name')
  if (!name.startsWith('--')) throw new Error(`${tag}: invalid CSS property ${name}`)
  if (!Object.hasOwn(input, 'authoredDefault')) throw new Error(`${tag} ${name}: authoredDefault must be explicit, including null`)
  if (!Object.hasOwn(input, 'effectiveDefault')) throw new Error(`${tag} ${name}: effectiveDefault must be explicit, including null`)
  return {
    tag,
    name,
    type: requiredString(input, 'type'),
    description: requiredString(input, 'description'),
    source: input.source ?? null,
    manifest: input.manifest ?? null,
    authoredDefault: input.authoredDefault,
    effectiveDefault: input.effectiveDefault,
    fallbackReferences: input.fallbackReferences ?? [],
    part: input.part ?? null,
    state: input.state ?? 'base',
    consumptionMode: input.consumptionMode ?? null,
    control: input.control ?? null,
    caseIds: input.caseIds ?? [],
  }
}

export function createConsumptionPath(input) {
  const tag = requiredString(input, 'tag')
  const name = requiredString(input, 'name')
  const mode = requiredString(input, 'mode')
  if (!CONSUMPTION_MODES.has(mode)) throw new Error(`${tag} ${name}: invalid consumption mode ${mode}`)
  const target = requiredString(input, 'target')
  if (mode === 'delegated' && (!input.childTag || !input.childProperty || !input.targetHost)) {
    throw new Error(`${tag} ${name}: delegated consumer requires childTag, childProperty, and targetHost`)
  }
  return {
    tag,
    name,
    mode,
    source: requiredString(input, 'source'),
    target,
    state: input.state ?? 'base',
    selector: input.selector ?? null,
    declaration: input.declaration ?? null,
    fallbackOrder: input.fallbackOrder ?? [],
    childTag: input.childTag ?? null,
    childProperty: input.childProperty ?? null,
    targetHost: input.targetHost ?? null,
  }
}

export function createVerificationCase(input) {
  const tag = requiredString(input, 'tag')
  const name = requiredString(input, 'name')
  const target = requiredString(input, 'target')
  if (input.assertion && !ASSERTION_KINDS.has(input.assertion)) throw new Error(`${tag} ${name}: invalid assertion kind`)
  return {
    id: requiredString(input, 'id'),
    tag,
    name,
    state: requiredString(input, 'state'),
    context: input.context ?? null,
    value: requiredString(input, 'value'),
    controlValue: input.controlValue ?? null,
    target,
    assertion: input.assertion ?? 'computed-style',
    declaration: input.declaration ?? null,
    pseudo: input.pseudo ?? null,
    valueSyntax: input.valueSyntax ?? null,
    syntaxRationale: input.syntaxRationale ?? null,
    outputProbe: input.outputProbe ?? null,
    geometryMetric: input.geometryMetric ?? null,
    stabilityWindowMs: input.stabilityWindowMs ?? null,
    childTag: input.childTag ?? null,
    browsers: input.browsers ?? ['chromium'],
    reset: input.reset ?? 'remove-property',
    sharedStylingPath: input.sharedStylingPath ?? null,
  }
}

export function createApprovedException(input) {
  for (const field of [
    'id',
    'tag',
    'name',
    'surfaceKind',
    'limitation',
    'userImpact',
    'supportedAlternative',
    'technicalReason',
    'reviewedBy',
    'reviewedOn',
    'reassessOn',
  ]) {
    requiredString(input, field)
  }
  if (!['browser-owned', 'third-party'].includes(input.surfaceKind)) throw new Error(`${input.tag} ${input.name}: invalid surfaceKind`)
  return { ...input }
}

export function createAuditResult({ inventory, outcomes, browserCoverage = { chromium: 'failed', firefox: 'failed', webkit: 'failed' } }) {
  const inventoryKeys = validatePropertyInventory(inventory)
  const outcomeByKey = new Map()
  for (const outcome of outcomes) {
    const key = propertyKey(outcome.tag, outcome.name)
    if (!inventoryKeys.has(key)) throw new Error(`stale status for ${outcome.tag} ${outcome.name}`)
    if (outcomeByKey.has(key)) throw new Error(`duplicate status for ${outcome.tag} ${outcome.name}`)
    if (!FINAL_STATUSES.has(outcome.status)) throw new Error(`invalid status for ${outcome.tag} ${outcome.name}`)
    outcomeByKey.set(key, outcome)
  }
  const properties = inventory.map((property) => {
    const outcome = outcomeByKey.get(propertyKey(property.tag, property.name))
    if (!outcome) throw new Error(`missing status for ${property.tag} ${property.name}`)
    return { ...property, ...outcome }
  })
  properties.sort((a, b) => a.ownerPackage?.localeCompare(b.ownerPackage ?? '') || a.tag.localeCompare(b.tag) || a.name.localeCompare(b.name))
  const summary = {
    packages: new Set(properties.map((property) => property.ownerPackage).filter(Boolean)).size,
    tags: new Set(properties.map((property) => property.tag)).size,
    properties: properties.length,
    verified: properties.filter((property) => property.status === 'verified').length,
    failed: properties.filter((property) => property.status === 'failed').length,
    approvedExceptions: properties.filter((property) => property.status === 'approved-exception').length,
  }
  if (summary.verified + summary.failed + summary.approvedExceptions !== summary.properties) throw new Error('status counts do not reconcile')
  return { schemaVersion: 1, summary, properties, failures: [], browserCoverage }
}
