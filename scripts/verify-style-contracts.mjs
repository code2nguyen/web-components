#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildStaticAudit, formatFailure } from './lib/style-contract-report.mjs'
import { reconcileVerification } from './lib/style-contract-verification.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseOptions(args) {
  const options = { format: 'text', output: null }
  for (const argument of args) {
    if (argument === '--format=json') options.format = 'json'
    else if (argument.startsWith('--output=') && argument.slice('--output='.length)) options.output = argument.slice('--output='.length)
    else throw new Error('usage: verify-style-contracts.mjs [--format=json] [--output=<path>]')
  }
  if (options.output && options.format !== 'json') throw new Error('--output requires --format=json')
  return options
}

try {
  const options = parseOptions(process.argv.slice(2))
  const audit = buildStaticAudit(repoRoot, { requireCases: true })
  const cases = JSON.parse(readFileSync(resolve(repoRoot, 'scripts/data/style-contract-cases.json'), 'utf8')).cases
  const exceptions = JSON.parse(readFileSync(resolve(repoRoot, 'scripts/data/style-contract-exceptions.json'), 'utf8')).exceptions
  const staticFailures = audit.failures.map((failure) => ({
    ...failure,
    source: failure.source?.startsWith(repoRoot) ? relative(repoRoot, failure.source) : failure.source,
  }))
  // Until the exhaustive/representative browser and panel matrices are complete, missing evidence
  // is an explicit failed status. Static readiness alone must never turn into a verified ledger.
  const { report, exitCode } = reconcileVerification({
    inventory: audit.properties,
    staticFailures,
    cases,
    exceptions,
    browserEvidence: {},
    panelPassed: false,
    inventoryCounts: { packages: audit.packages, tags: audit.tags },
  })
  if (options.format === 'json') {
    const json = `${JSON.stringify(report, null, 2)}\n`
    if (options.output) writeFileSync(resolve(options.output), json)
    else process.stdout.write(json)
  } else {
    console.log(
      `Style contracts: ${report.summary.packages} packages, ${report.summary.tags} tags, ${report.summary.properties} properties, ${report.summary.failed} failed, ${report.summary.approvedExceptions} approved exceptions`,
    )
    for (const failure of report.failures.slice(0, 50)) console.error(formatFailure(failure))
    if (report.failures.length > 50) console.error(`... ${report.failures.length - 50} additional failures; use --format=json for the full ledger`)
  }
  process.exitCode = exitCode
} catch (error) {
  console.error(`Style-contract verification could not run: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 2
}
