import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { exampleCoverageProblems, undocumentedPublishablePackages } from './lib/component-contract-scope.mjs'
import { mergeSlotStylingAuditEntries, validateSlotStylingAudit } from './lib/slot-styling-audit.mjs'

const fixtureRoot = new URL('./fixtures/slot-styling-audit/', import.meta.url)

async function fixture(name) {
  return JSON.parse(await readFile(new URL(name, fixtureRoot), 'utf8'))
}

test('accepts a complete part-backed audit', async () => {
  const input = await fixture('valid.json')
  assert.deepEqual(validateSlotStylingAudit(input).errors, [])
})

test('rejects a manifest slot without an audit entry', async () => {
  const input = await fixture('missing-slot.json')
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /missing audit entry.*c2-demo.*header/i)
})

test('rejects an audit entry for a slot that no longer exists', async () => {
  const input = await fixture('stale-slot.json')
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /stale audit entry.*c2-demo.*old/i)
})

test('rejects duplicate tag and slot identities', async () => {
  const input = await fixture('duplicate-key.json')
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /duplicate audit entry.*c2-demo/i)
})

test('rejects a referenced part absent from the manifest', async () => {
  const input = await fixture('unknown-part.json')
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /unknown part.*missing/i)
})

test('allows several state slots to share one semantic part', async () => {
  const input = await fixture('shared-part.json')
  assert.deepEqual(validateSlotStylingAudit(input).errors, [])
})

test('allows the default slot to map to a purpose-based body part', async () => {
  const input = await fixture('default-body.json')
  assert.deepEqual(validateSlotStylingAudit(input).errors, [])
})

test('allows an assigned-content decision with a reason', async () => {
  const input = await fixture('assigned-content.json')
  assert.deepEqual(validateSlotStylingAudit(input).errors, [])
})

test('allows a variable decision when every variable exists', async () => {
  const input = await fixture('variables.json')
  assert.deepEqual(validateSlotStylingAudit(input).errors, [])
})

test('allows delegation to another published tag', async () => {
  const input = await fixture('delegated.json')
  assert.deepEqual(validateSlotStylingAudit(input).errors, [])
})

test('rejects generic inferred prose for a slot-region part', async () => {
  const input = await fixture('valid.json')
  input.elements[0].parts.header = 'Shadow DOM styling hook for the header element.'
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /header.*generic description/i)
})

test('rejects fields that do not belong to a decision', async () => {
  const input = await fixture('assigned-content.json')
  input.registry.entries[0].parts = ['body']
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /forbids.*parts/i)
})

test('rejects a slot decision with no styling-route guidance', async () => {
  const input = await fixture('assigned-content.json')
  input.registry.entries[0].reason = '   '
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /requires a non-empty reason/i)
})

test('rejects generic generated prose even when the part name matches the slot', async () => {
  const input = await fixture('valid.json')
  input.elements[0].parts.header = 'Shadow DOM styling hook for the header element.'
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /generic description/i)
})

test('rejects source-to-manifest naming drift instead of accepting a similar part', async () => {
  const input = await fixture('valid.json')
  input.registry.entries[0].parts = ['header-region']
  input.elements[0].parts.header = 'Wrapper around the `header` slot.'
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /unknown part header-region/i)
})

test('finds publishable component packages omitted from documentation discovery', () => {
  const packages = [{ name: '@c2n/documented' }, { name: '@c2n/omitted' }]
  assert.deepEqual(undocumentedPublishablePackages(packages, new Set(['@c2n/documented'])), ['@c2n/omitted'])
})

test('accepts a runnable UI example customized through a documented property or part', () => {
  const packages = [
    {
      name: '@c2n/demo',
      manifest: {
        modules: [{ declarations: [{ tagName: 'c2-demo', cssProperties: [{ name: '--c2-demo--color' }], cssParts: [{ name: 'body' }] }] }],
      },
    },
  ]
  const propertyExample = [{ path: 'demo.mdx', source: "import '@c2n/demo'\n```html tag=UsageBlock\n<style>c2-demo{--c2-demo--color:red}</style><c2-demo></c2-demo>\n```" }]
  const partExample = [{ path: 'demo.mdx', source: "import '@c2n/demo'\n```html tag=MdxCodeBlock\n<style>c2-demo::part(body){padding:1rem}</style><c2-demo></c2-demo>\n```" }]

  assert.deepEqual(exampleCoverageProblems(packages, propertyExample), [])
  assert.deepEqual(exampleCoverageProblems(packages, partExample), [])
})

test('rejects publishable packages without runnable or substantially customized UI examples', () => {
  const packages = [
    {
      name: '@c2n/demo',
      manifest: { modules: [{ declarations: [{ tagName: 'c2-demo', cssProperties: [{ name: '--c2-demo--color' }] }] }] },
    },
  ]

  assert.match(exampleCoverageProblems(packages, [{ path: 'demo.mdx', source: "import '@c2n/demo'" }]).join('\n'), /no runnable UI example/i)
  assert.match(
    exampleCoverageProblems(packages, [{ path: 'demo.mdx', source: "import '@c2n/demo'\n```html tag=UsageBlock\n<c2-demo></c2-demo>\n```" }]).join('\n'),
    /no substantial customization/i,
  )
})

test('applies the registry schema to reject additional fields', async () => {
  const input = await fixture('valid.json')
  input.registry.entries[0].unexpected = true
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /schema.*additional properties/i)
})

test('applies the registry schema to tag and variable patterns', async () => {
  const input = await fixture('variables.json')
  input.registry.entries[0].tag = 'invalid'
  input.registry.entries[0].variables = ['size']
  const errors = validateSlotStylingAudit(input).errors.join('\n')
  assert.match(errors, /schema.*pattern/i)
})

test('applies the registry schema to reject duplicate decision references', async () => {
  const input = await fixture('valid.json')
  input.registry.entries[0].parts = ['header', 'header']
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /schema.*duplicate items/i)
})

test('generator merge preserves every reviewed decision and non-name-equivalent mapping', () => {
  const elements = [
    {
      tag: 'c2-demo',
      slots: ['', 'delegated', 'header', 'tone'],
      parts: { body: 'Wrapper around the default slot.', header: 'Wrapper around the `header` slot.' },
      variables: ['--c2-demo-tone'],
    },
  ]
  const reviewed = [
    { tag: 'c2-demo', slot: '', decision: 'part', parts: ['body'], reason: 'Reviewed body mapping.' },
    { tag: 'c2-demo', slot: 'delegated', decision: 'delegated', delegateTag: 'c2-child', reason: 'Reviewed delegation.' },
    { tag: 'c2-demo', slot: 'tone', decision: 'variables', variables: ['--c2-demo-tone'], reason: 'Reviewed variable.' },
  ]

  const entries = mergeSlotStylingAuditEntries(elements, reviewed)
  assert.deepEqual(entries.filter((entry) => reviewed.some((item) => item.slot === entry.slot)), reviewed)
  assert.deepEqual(entries.find((entry) => entry.slot === 'header')?.parts, ['header'])
})

test('rejects a part description that does not name its related slot', async () => {
  const input = await fixture('valid.json')
  input.elements[0].parts.header = 'Component-owned header wrapper containing assigned content.'
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /must identify its related header slot/i)
})

test('rejects a part description that does not identify the controlled region', async () => {
  const input = await fixture('valid.json')
  input.elements[0].parts.header = 'The `header` slot is exposed from the component.'
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /component-owned region it controls/i)
})

test('rejects a part description without placement or fallback semantics', async () => {
  const input = await fixture('valid.json')
  input.elements[0].parts.header = 'The `header` slot region.'
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /slot placement and fallback versus assigned-content/i)
})

test('requires shared state descriptions to name every applicable slot', async () => {
  const input = await fixture('shared-part.json')
  input.elements[0].parts.state = 'Container wrapping the `empty` slot and its fallback.'
  assert.match(validateSlotStylingAudit(input).errors.join('\n'), /related error slot/i)
})
