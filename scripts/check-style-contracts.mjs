#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { buildStaticAudit, formatFailure } from './lib/style-contract-report.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
try {
  const options = process.argv.slice(2)
  if (options.some((option) => option !== '--json') || options.length > 1) throw new Error('usage: check-style-contracts.mjs [--json]')
  const audit = buildStaticAudit(repoRoot, { requireCases: true })
  if (options.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          schemaVersion: 1,
          kind: 'static-readiness',
          summary: { packages: audit.packages, tags: audit.tags, properties: audit.properties.length, failures: audit.failures.length },
          failures: audit.failures.map((failure) => ({
            ...failure,
            source: failure.source ?? 'static audit',
            state: failure.state ?? 'unknown',
            target: failure.target ?? 'unresolved target',
          })),
        },
        null,
        2,
      ),
    )
  } else {
    console.log(
      `Style contracts: ${audit.packages} packages, ${audit.tags} tags, ${audit.properties.length} properties, ${audit.failures.length} static failures`,
    )
    for (const failure of audit.failures.slice(0, 50)) console.error(formatFailure(failure))
    if (audit.failures.length > 50) console.error(`... ${audit.failures.length - 50} additional failures; use --json for the full sorted failure set`)
  }
  process.exitCode = audit.staticReady ? 0 : 1
} catch (error) {
  console.error(`Style contract audit could not run: ${error.message}`)
  process.exitCode = 2
}
