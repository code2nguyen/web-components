import { readFileSync } from 'node:fs'
import Ajv from 'ajv'
import { propertyKey } from './style-contract-model.mjs'

const schema = JSON.parse(readFileSync(new URL('../data/style-contract-cases.schema.json', import.meta.url), 'utf8'))
const validateSchema = new Ajv({ allErrors: true }).compile(schema)

const TYPE_SYNTAX = {
  color: ['color', 'background-color', 'border-color', 'outline-color', 'fill', 'stroke'],
  border: ['border', 'border-top', 'border-right', 'border-bottom', 'border-left'],
  'border-radius': ['border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius'],
  'font-family': ['font-family'],
  pixel: [
    'width',
    'height',
    'min-width',
    'max-width',
    'margin-left',
    'padding-left',
    'top',
    'right',
    'bottom',
    'left',
    'stroke-width',
    'font-size',
    'border-width',
    'border-radius',
  ],
  length: [
    'width',
    'height',
    'min-width',
    'max-width',
    'margin-left',
    'padding-left',
    'top',
    'right',
    'bottom',
    'left',
    'stroke-width',
    'font-size',
    'border-width',
    'border-radius',
  ],
  number: ['z-index', 'line-height', 'stroke-width', 'opacity', 'flex-grow', 'order'],
  opacity: ['opacity'],
  time: ['animation-duration', 'transition-duration'],
  duration: ['animation-duration', 'transition-duration'],
}

function caseIdentity(tag, name, state) {
  return JSON.stringify([tag, name, state])
}

export function selectCasesForBrowser(cases, browser) {
  return cases.filter((item) => (item.browsers ?? ['chromium']).includes(browser))
}

export function reconcileCaseCoverage(properties, cases) {
  const failures = []
  const exact = new Map()
  const propertyIdentities = new Set(properties.map((property) => propertyKey(property.tag, property.name)))
  for (const item of cases) {
    const identity = caseIdentity(item.tag, item.name, item.state)
    if (exact.has(identity)) failures.push({ category: 'duplicate-case', tag: item.tag, name: item.name, state: item.state })
    exact.set(identity, item)
    if (!propertyIdentities.has(propertyKey(item.tag, item.name))) failures.push({ category: 'stale-case', tag: item.tag, name: item.name, state: item.state })
  }
  for (const property of properties) {
    for (const state of property.states ?? ['base']) {
      const direct = exact.get(caseIdentity(property.tag, property.name, state))
      const directMatchesPath = direct && (!property.sharedStylingPath || direct.sharedStylingPath === property.sharedStylingPath)
      const shared = property.sharedStylingPath
        ? cases.find(
            (item) =>
              item.name === property.name &&
              item.state === state &&
              item.sharedStylingPath === property.sharedStylingPath &&
              properties.some(
                (candidate) =>
                  candidate.tag === item.tag &&
                  candidate.name === item.name &&
                  candidate.staticReady === true &&
                  candidate.sharedStylingPath === item.sharedStylingPath,
              ),
          )
        : null
      if (!property.staticReady && property.sharedStylingPath) {
        failures.push({ category: 'static-contract-failed', tag: property.tag, name: property.name, state })
      } else if (!directMatchesPath && !shared) {
        failures.push({ category: 'missing-case', tag: property.tag, name: property.name, state })
      }
      const evidence = directMatchesPath ? direct : shared
      if (evidence && !(evidence.browsers ?? []).includes('chromium'))
        failures.push({ category: 'missing-chromium', tag: property.tag, name: property.name, state })
    }
  }
  return failures
}

export function loadReviewedCases(path, inventory) {
  const registry = JSON.parse(readFileSync(path, 'utf8'))
  validateReviewedRegistry(registry, inventory)
  const failures = reconcileCaseCoverage(inventory, registry.cases)
  if (failures.length) throw new Error(`case coverage invalid: ${JSON.stringify(failures.slice(0, 5))}`)
  return registry
}

/** Validate reviewed inputs without requiring the still-incomplete full coverage matrix. */
export function validateReviewedRegistry(registry, inventory) {
  if (!validateSchema(registry)) {
    const issue = validateSchema.errors?.[0]
    const field = issue?.params?.additionalProperty ?? issue?.params?.missingProperty ?? ''
    throw new Error(`invalid case registry ${issue?.instancePath ?? ''} ${field}: ${issue?.message ?? 'schema mismatch'}`)
  }
  const contexts = new Map()
  for (const context of registry.contexts) {
    validateReviewedContext(context)
    if (contexts.has(context.id)) throw new Error(`duplicate context ${context.id}`)
    contexts.set(context.id, context)
  }
  const known = new Map(inventory.map((property) => [propertyKey(property.tag, property.name), property]))
  const caseIds = new Set()
  const caseKeys = new Set()
  for (const item of registry.cases) {
    if (!contexts.has(item.context)) throw new Error(`missing context ${item.context} for ${item.id}`)
    if (contexts.get(item.context).tag !== item.tag) throw new Error(`${item.id}: context tag does not match ${item.tag}`)
    const property = known.get(propertyKey(item.tag, item.name))
    if (!property) throw new Error(`stale case ${item.id}: ${item.tag} ${item.name}`)
    if (caseIds.has(item.id)) throw new Error(`duplicate case ID ${item.id}`)
    caseIds.add(item.id)
    const key = JSON.stringify([item.tag, item.name, item.state])
    if (caseKeys.has(key)) throw new Error(`duplicate case identity ${key}`)
    caseKeys.add(key)
    validateObservableCase(item, property)
  }
  return registry
}

export function validateReviewedContext(context) {
  if (!context.id || !context.tag || !context.fixture || !context.settledWhen) throw new Error(`incomplete context ${context.id ?? '(missing id)'}`)
  if (context.hoverTarget !== undefined && (!context.hoverTarget || typeof context.hoverTarget !== 'string'))
    throw new Error(`${context.id}: invalid hoverTarget`)
  if (context.stateSetup !== undefined) {
    if (!Array.isArray(context.stateSetup) || !context.stateSetup.length) throw new Error(`${context.id}: stateSetup must contain declarative actions`)
    for (const action of context.stateSetup) {
      if (!action.target || !action.attribute || typeof action.value !== 'string') throw new Error(`${context.id}: invalid stateSetup action`)
    }
  }
  if (context.dimensions !== undefined) {
    if (!Array.isArray(context.dimensions) || !context.dimensions.length) throw new Error(`${context.id}: dimensions must contain target sizes`)
    for (const size of context.dimensions) {
      if (!size.target || (!size.width && !size.height)) throw new Error(`${context.id}: invalid dimensions target`)
    }
  }
}

export function validateObservableCase(item, property) {
  if (!item.value || !item.target || !item.reset || !item.assertion) throw new Error(`incomplete case ${item.id}`)
  if (item.controlValue !== undefined) {
    const control = item.controlValue.trim()
    if (!control || control === item.value.trim() || /\b(?:var|env|attr)\s*\(/i.test(control))
      throw new Error(`${item.id}: controlValue must be a distinct literal value`)
  }
  if (!['computed-style', 'geometry', 'pseudo-style', 'slotted-style', 'delegated-style', 'programmatic-output'].includes(item.assertion))
    throw new Error(`${item.id}: unknown assertion ${item.assertion}`)
  if (item.reset !== 'remove-property') throw new Error(`${item.id}: unsupported reset ${item.reset}`)
  if (!Array.isArray(item.browsers) || !item.browsers.includes('chromium')) throw new Error(`${item.id}: browsers must include chromium`)
  if (item.assertion === 'pseudo-style' && !['::before', '::after'].includes(item.pseudo))
    throw new Error(`${item.id}: pseudo-style requires a reviewed ::before or ::after pseudo target`)
  if (item.assertion !== 'pseudo-style' && item.pseudo !== undefined) throw new Error(`${item.id}: pseudo target requires pseudo-style assertion`)
  if (['geometry', 'programmatic-output'].includes(item.assertion) && !item.valueSyntax)
    throw new Error(`${item.id}: ${item.assertion} requires valueSyntax to validate the contrasting value`)
  if (item.assertion === 'geometry' && !['width', 'height', 'x', 'y', 'area'].includes(item.geometryMetric))
    throw new Error(`${item.id}: geometry requires an explicit geometryMetric`)
  if (item.assertion !== 'geometry' && item.geometryMetric !== undefined) throw new Error(`${item.id}: geometryMetric requires geometry assertion`)
  if (!item.valueSyntax && !item.declaration) throw new Error(`${item.id}: a CSS declaration or valueSyntax is required`)
  if (['computed-style', 'pseudo-style', 'slotted-style', 'delegated-style'].includes(item.assertion) && !item.declaration)
    throw new Error(`${item.id}: ${item.assertion} requires a declaration`)
  if (item.assertion === 'programmatic-output' && !['canvas-bitmap', 'svg-bitmap', 'image-bitmap', 'text-content'].includes(item.outputProbe))
    throw new Error(`${item.id}: programmatic-output requires an explicit outputProbe`)
  if (item.stabilityWindowMs !== undefined && (!Number.isInteger(item.stabilityWindowMs) || item.stabilityWindowMs < 0 || item.stabilityWindowMs > 5000))
    throw new Error(`${item.id}: invalid stabilityWindowMs`)
  if (item.assertion === 'delegated-style' && !item.childTag) throw new Error(`${item.id}: delegated-style requires childTag`)
  if (property?.type) {
    const type = typeof property.type === 'string' ? property.type : property.type.text
    const allowed = TYPE_SYNTAX[type] ?? [type]
    const syntax = item.valueSyntax ?? item.declaration
    if (!allowed.includes(syntax) && !item.syntaxRationale?.trim())
      throw new Error(
        `${item.id}: ${item.valueSyntax ? 'valueSyntax' : 'declaration'} ${syntax} disagrees with published type ${type}; add syntaxRationale for a reviewed transformation`,
      )
  }
}

const CONTRAST_VALUES = {
  color: 'rgb(231, 17, 73)',
  border: '3px solid rgb(231, 17, 73)',
  'border-radius': '19px',
  pixel: '37px',
  length: '37px',
  number: '0.37',
  opacity: '0.37',
  'font-size': '37px',
  time: '713ms',
}

/** Infer only a unique ordinary CSS target; anything stateful or structural needs review. */
export function deriveOrdinaryCase(property, paths, context) {
  const candidates = paths.filter((path) => path.name === property.name && path.state === 'base' && !path.selector.includes('::'))
  const targets = new Set(candidates.map((path) => `${path.selector}|${path.declaration}`))
  if (targets.size !== 1 || !context) return null
  const path = candidates[0]
  const value = CONTRAST_VALUES[property.type] ?? null
  if (!value) return null
  return {
    id: `${property.tag}:${property.name}:base`,
    tag: property.tag,
    name: property.name,
    context,
    state: 'base',
    value,
    target: path.selector,
    assertion: 'computed-style',
    declaration: path.declaration,
    browsers: ['chromium'],
    reset: 'remove-property',
  }
}
