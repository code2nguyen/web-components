import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as prettier from 'prettier'

import { publishableComponentPackages } from './lib/component-contract-scope.mjs'
import { manifestElements, mergeSlotStylingAuditEntries } from './lib/slot-styling-audit.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const publishable = publishableComponentPackages(repoRoot)
if (publishable.errors.length) throw new Error(publishable.errors.join('\n'))
const manifests = publishable.packages.map(({ manifest }) => manifest)

const target = join(repoRoot, 'scripts/data/slot-styling-audit.json')
const existingRegistry = JSON.parse(readFileSync(target, 'utf8'))
const entries = mergeSlotStylingAuditEntries(manifestElements(manifests), existingRegistry.entries)

const raw = JSON.stringify({ $schema: './slot-styling-audit.schema.json', version: 1, entries })
// Formatted as prettier would, so regenerating an up-to-date file changes nothing (CI regenerates and diffs it).
writeFileSync(target, await prettier.format(raw, { ...(await prettier.resolveConfig(target)), filepath: target }))
console.log(`Wrote ${entries.length} slot styling decisions to ${target}`)
