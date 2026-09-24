import { readFileSync } from 'node:fs'
import Ajv from 'ajv'
import { createAuditResult, propertyKey, validatePropertyInventory } from './style-contract-model.mjs'
import { sortFailures } from './style-contract-report.mjs'

const reportSchema = JSON.parse(readFileSync(new URL('../data/style-contract-report.schema.json', import.meta.url), 'utf8'))
const validateReport = new Ajv({ allErrors: true }).compile(reportSchema)
const BROWSERS = ['chromium', 'firefox', 'webkit']

function reportProperty(property) {
  return {
    tag: property.tag,
    name: property.name,
    ownerPackage: property.ownerPackage,
    type: property.type,
    default: property.default ?? null,
    state: property.state ?? 'base',
    target: property.target ?? 'unresolved target',
    consumptionMode: property.consumptionMode ?? null,
    controlFamily: property.controlFamily ?? null,
  }
}

function failureFor(property, category, observed, source = 'scripts/data/style-contract-cases.json', state = property.state ?? 'base') {
  return { tag: property.tag, name: property.name, category, state, target: property.target ?? 'unresolved target', observed, source }
}

function normalizeFailure(failure) {
  return {
    tag: failure.tag,
    name: failure.name,
    category: failure.category,
    state: failure.state ?? 'base',
    target: failure.target ?? 'unresolved target',
    observed: String(failure.observed ?? failure.expected ?? failure.category),
    source: failure.source ?? 'static audit',
    ...(failure.suggestion ? { suggestion: failure.suggestion } : {}),
  }
}

/** Reconcile already-run evidence. Callers must validate the reviewed exception registry before passing it here. */
export function reconcileVerification({
  inventory,
  staticFailures = [],
  cases = [],
  exceptions = [],
  browserEvidence = {},
  panelPassed = false,
  inventoryCounts = {},
}) {
  validatePropertyInventory(inventory)
  const known = new Set(inventory.map((property) => propertyKey(property.tag, property.name)))
  const exceptionKeys = new Set()
  for (const exception of exceptions) {
    const key = propertyKey(exception.tag, exception.name)
    if (!known.has(key) || exceptionKeys.has(key)) throw new Error(`stale or duplicate exception ${exception.tag} ${exception.name}`)
    exceptionKeys.add(key)
  }

  const caseIds = new Set()
  const inventoryByKey = new Map(inventory.map((property) => [propertyKey(property.tag, property.name), property]))
  for (const item of cases) {
    if (!known.has(propertyKey(item.tag, item.name)) || caseIds.has(item.id)) throw new Error(`stale or duplicate case ${item.id}`)
    if (!Array.isArray(item.browsers) || !item.browsers.includes('chromium') || item.browsers.some((browser) => !BROWSERS.includes(browser)))
      throw new Error(`invalid browser selection for ${item.id}`)
    caseIds.add(item.id)
  }
  const evidenceByBrowser = new Map()
  for (const browser of BROWSERS) {
    const selected = new Set(cases.filter((item) => item.browsers.includes(browser)).map((item) => item.id))
    const observed = new Map()
    for (const item of browserEvidence[browser] ?? []) {
      if (!selected.has(item.id) || observed.has(item.id)) throw new Error(`stale browser evidence ${browser} ${item.id}`)
      if (!['passed', 'failed'].includes(item.status)) throw new Error(`invalid browser status ${browser} ${item.id}`)
      observed.set(item.id, item.status)
    }
    evidenceByBrowser.set(browser, { selected, observed })
  }

  const failures = staticFailures.map(normalizeFailure)
  const staticFailuresByProperty = new Set(staticFailures.map((failure) => propertyKey(failure.tag, failure.name)))
  const existingMissingCases = new Set(
    staticFailures
      .filter((failure) => failure.category === 'missing-case')
      .map((failure) => `${propertyKey(failure.tag, failure.name)}:${failure.state ?? 'base'}`),
  )
  const outcomes = []
  let allPropertiesHaveCases = true
  for (const property of inventory) {
    const key = propertyKey(property.tag, property.name)
    const propertyCases = cases.filter((item) => {
      if (item.name !== property.name) return false
      if (!item.sharedStylingPath) return item.tag === property.tag
      const sample = inventoryByKey.get(propertyKey(item.tag, item.name))
      return (
        property.sharedStylingPath === item.sharedStylingPath &&
        property.staticReady === true &&
        sample?.sharedStylingPath === item.sharedStylingPath &&
        sample.staticReady === true
      )
    })
    const requiredStates = property.states ?? [property.state ?? 'base']
    const ownFailures = []
    if (!exceptionKeys.has(key)) {
      if (property.sharedStylingPath && property.staticReady !== true)
        ownFailures.push(
          failureFor(
            property,
            'static-contract-failed',
            'Generated tag cannot inherit shared browser evidence before its own static contract passes',
            'static audit',
          ),
        )
      if (!property.target || !property.consumptionMode || !property.controlFamily)
        ownFailures.push(
          failureFor(property, 'incomplete-property-classification', 'Target, consumption mode, or panel control is not classified', 'static audit'),
        )
      for (const state of requiredStates) {
        if (!propertyCases.some((item) => item.state === state)) {
          allPropertiesHaveCases = false
          if (!existingMissingCases.has(`${key}:${state}`))
            ownFailures.push(failureFor(property, 'missing-case', `No reviewed case for ${state}`, undefined, state))
        }
      }
      for (const item of propertyCases) {
        for (const browser of item.browsers) {
          const status = evidenceByBrowser.get(browser).observed.get(item.id)
          if (status !== 'passed')
            ownFailures.push(
              failureFor(property, status === 'failed' ? 'browser-failure' : 'missing-browser-evidence', `${browser}: ${item.id}`, undefined, item.state),
            )
        }
      }
      if (!panelPassed)
        ownFailures.push(failureFor(property, 'missing-panel-evidence', 'Configuration-panel matrix did not pass', 'apps/ui/test/style-panel.spec.ts'))
    }
    failures.push(...ownFailures)
    const status = staticFailuresByProperty.has(key) || ownFailures.length ? 'failed' : exceptionKeys.has(key) ? 'approved-exception' : 'verified'
    outcomes.push({ tag: property.tag, name: property.name, status, evidence: propertyCases.map((item) => item.id).sort() })
  }

  const browserCoverage = Object.fromEntries(
    BROWSERS.map((browser) => {
      const { selected, observed } = evidenceByBrowser.get(browser)
      const complete = allPropertiesHaveCases && selected.size > 0 && [...selected].every((id) => observed.get(id) === 'passed')
      return [browser, complete ? (browser === 'chromium' ? 'complete' : 'representative') : 'failed']
    }),
  )
  for (const browser of BROWSERS) {
    if (browserCoverage[browser] === 'failed') {
      failures.push({
        tag: 'browser-matrix',
        name: browser,
        category: 'incomplete-browser-coverage',
        state: 'base',
        target: 'selected observable cases',
        observed: 'Missing or failed browser evidence',
        source: 'scripts/data/style-contract-cases.json',
      })
    }
  }
  const report = createAuditResult({ inventory: inventory.map(reportProperty), outcomes, browserCoverage })
  if (inventoryCounts.packages !== undefined) report.summary.packages = inventoryCounts.packages
  if (inventoryCounts.tags !== undefined) report.summary.tags = inventoryCounts.tags
  report.failures = sortFailures(failures)
  if (!validateReport(report)) throw new Error(`invalid final report: ${validateReport.errors?.[0]?.message ?? 'schema mismatch'}`)
  return { report, exitCode: report.summary.failed || report.failures.length ? 1 : 0 }
}
