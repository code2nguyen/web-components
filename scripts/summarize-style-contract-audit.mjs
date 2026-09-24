#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function summarizeStaticAudit(report) {
  const categories = new Map()
  for (const failure of report.failures) categories.set(failure.category, (categories.get(failure.category) ?? 0) + 1)
  const lines = [
    '### Style-contract diagnostic (not yet a release gate)',
    '',
    `${report.summary.packages} packages · ${report.summary.tags} tags · ${report.summary.properties} properties · ${report.summary.failures} static failures`,
    '',
    ...[...categories].sort(([left], [right]) => left.localeCompare(right)).map(([category, count]) => `- ${category}: ${count}`),
    '',
    'The full-library audit remains incomplete. See the uploaded JSON artifact for every affected tag and property.',
  ]
  return `${lines.join('\n')}\n`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
    const summary = summarizeStaticAudit(report)
    process.stdout.write(summary)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  } catch (error) {
    process.stdout.write(`Style-contract report unavailable: ${error.message}\n`)
  }
}
