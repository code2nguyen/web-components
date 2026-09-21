import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { publishableComponentPackages } from './lib/component-contract-scope.mjs'
import { manifestElements, mergeSlotStylingAuditEntries } from './lib/slot-styling-audit.mjs'

const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const publishable = publishableComponentPackages(repoRoot)
if (publishable.errors.length) throw new Error(publishable.errors.join('\n'))
const manifests = publishable.packages.map(({ manifest }) => manifest)

const target = join(repoRoot, 'scripts/data/slot-styling-audit.json')
const existingRegistry = JSON.parse(readFileSync(target, 'utf8'))
const entries = mergeSlotStylingAuditEntries(manifestElements(manifests), existingRegistry.entries)

writeFileSync(target, `${JSON.stringify({ $schema: './slot-styling-audit.schema.json', version: 1, entries }, null, 2)}\n`)
console.log(`Wrote ${entries.length} slot styling decisions to ${target}`)
