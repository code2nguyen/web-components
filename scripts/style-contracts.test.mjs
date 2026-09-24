import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildStaticAudit } from './lib/style-contract-report.mjs'

const tag = 'c2-example'
const name = '--c2-example--color'

function fixture(overrides, run) {
  const root = mkdtempSync(join(tmpdir(), 'c2-style-audit-'))
  const packagePath = join(root, 'packages/components/example')
  const data = join(root, 'scripts/data')
  mkdirSync(join(packagePath, 'src'), { recursive: true })
  mkdirSync(data, { recursive: true })
  const sourceName = overrides.sourceName ?? name
  const manifestName = overrides.manifestName ?? sourceName
  const cssName = overrides.cssName ?? name
  const sourceDefault = overrides.sourceDefault ?? 'red'
  const manifestDefault = overrides.manifestDefault ?? sourceDefault
  const source = `/**\n * @tag ${tag}\n * @cssproperty {color} [${sourceName}=${sourceDefault}]\n */\nexport class Example {}`
  const css = `.target { color: var(${cssName}, ${overrides.cssDefault ?? 'red'}); }`
  const manifest = {
    modules: [
      {
        path: 'src/example.ts',
        declarations: [{ name: 'Example', tagName: tag, cssProperties: [{ name: manifestName, type: { text: 'color' }, default: manifestDefault }] }],
      },
    ],
  }
  if (overrides.siblingConsumer) {
    manifest.modules.push({ path: 'src/sibling.ts', declarations: [{ name: 'Sibling', tagName: 'c2-sibling', cssProperties: [] }] })
    writeFileSync(join(packagePath, 'src/sibling.ts'), '/** @tag c2-sibling */\nexport class Sibling {}')
    writeFileSync(join(packagePath, 'src/sibling.scss'), `.sibling { color: var(${name}, red); }`)
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/components/*'] }))
  writeFileSync(join(packagePath, 'package.json'), JSON.stringify({ name: '@c2n/example', customElements: 'custom-elements.json' }))
  writeFileSync(join(packagePath, 'src/example.ts'), source)
  writeFileSync(join(packagePath, 'src/example.scss'), overrides.noCss ? '.target { display: block }' : css)
  writeFileSync(join(packagePath, 'custom-elements.json'), JSON.stringify(manifest))
  const cases = overrides.noCase
    ? []
    : [
        {
          id: 'example-color',
          tag,
          name: manifestName,
          context: 'example',
          state: 'base',
          value: 'blue',
          target: '.target',
          assertion: 'computed-style',
          declaration: 'color',
          browsers: ['chromium'],
          reset: 'remove-property',
          ...overrides.caseOverride,
        },
      ]
  const contexts = [{ id: 'example', tag, fixture: '<c2-example></c2-example>', settledWhen: 'c2-example', ...overrides.contextOverride }]
  writeFileSync(join(data, 'style-contract-cases.json'), JSON.stringify({ schemaVersion: 1, contexts, cases }))
  writeFileSync(join(data, 'style-contract-consumers.json'), JSON.stringify({ schemaVersion: 1, consumers: [] }))
  writeFileSync(join(data, 'style-contract-exceptions.json'), JSON.stringify({ schemaVersion: 1, exceptions: overrides.exceptions ?? [] }))
  try {
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('valid fixture passes static contract readiness', () => {
  fixture({}, (root) => assert.equal(buildStaticAudit(root, { requireCases: true, requirePanel: false }).staticReady, true))
})

for (const [label, overrides, category] of [
  ['documented but unused', { noCss: true }, 'unused-property'],
  ['undocumented consumer', { cssName: '--c2-example--secret' }, 'undocumented-consumer'],
  ['default drift', { manifestDefault: 'blue' }, 'default-mismatch'],
  ['misspelled documented name', { sourceName: '--c2-example--colo' }, 'unused-property'],
  ['stale manifest', { manifestName: '--c2-example--old-color' }, 'stale-manifest'],
]) {
  test(`${label} fixture fails with exact tag, name, and category`, () => {
    fixture(overrides, (root) => {
      const audit = buildStaticAudit(root, { requireCases: true, requirePanel: false })
      assert.equal(audit.staticReady, false)
      assert.ok(audit.failures.some((failure) => failure.tag === tag && failure.name.startsWith('--c2-example--') && failure.category === category))
    })
  })
}

test('a new publishable property enters coverage automatically', () => {
  fixture({ noCase: true }, (root) => {
    const audit = buildStaticAudit(root, { requireCases: true, requirePanel: false })
    assert.equal(audit.properties.length, 1)
    assert.ok(audit.failures.some((failure) => failure.category === 'missing-case' && failure.name === name))
  })
})

test('Sass fallback drift fails even when source and manifest defaults agree', () => {
  fixture({ cssDefault: 'blue' }, (root) => {
    const audit = buildStaticAudit(root, { requirePanel: false })
    assert.ok(
      audit.failures.some(
        (failure) =>
          failure.tag === tag && failure.name === name && failure.category === 'default-mismatch' && failure.expected === 'red' && failure.observed === 'blue',
      ),
    )
  })
})

test('a sibling stylesheet cannot prove consumption or documentation for another tag', () => {
  fixture({ noCss: true, siblingConsumer: true }, (root) => {
    const audit = buildStaticAudit(root, { requirePanel: false })
    assert.ok(audit.failures.some((failure) => failure.tag === tag && failure.name === name && failure.category === 'unused-property'))
    assert.ok(audit.failures.some((failure) => failure.tag === 'c2-sibling' && failure.name === name && failure.category === 'undocumented-consumer'))
  })
})

test('an ordinary CSS consumer cannot be suppressed by a reviewed exception', () => {
  const exception = {
    id: 'invalid-component-exception',
    tag,
    name,
    surfaceKind: 'third-party',
    limitation: 'claimed limitation',
    userImpact: 'claimed impact',
    supportedAlternative: 'claimed alternative',
    technicalReason: 'claimed reason',
    reviewedBy: 'Component maintainers',
    reviewedOn: '2026-09-01',
    reassessOn: '2027-09-01',
  }
  fixture({ exceptions: [exception] }, (root) => {
    assert.throws(() => buildStaticAudit(root, { requirePanel: false }), /component-owned/i)
  })
})

test('static readiness rejects malformed reviewed cases before treating them as coverage', () => {
  for (const [overrides, message] of [
    [{ caseOverride: { assertion: 'pseudo-style' } }, /pseudo/],
    [{ caseOverride: { assertion: 'geometry', declaration: undefined } }, /valueSyntax/],
    [{ contextOverride: { stateSetup: 'selected' } }, /stateSetup/],
    [{ contextOverride: { dimensions: '123px' } }, /dimensions/],
    [{ caseOverride: { context: 'absent' } }, /missing context/],
    [{ caseOverride: { browsers: [] } }, /browsers/],
    [{ caseOverride: { reset: 'leave-property' } }, /reset/],
    [{ caseOverride: { assertion: 'unknown' } }, /assertion/],
  ]) {
    fixture(overrides, (root) => assert.throws(() => buildStaticAudit(root, { requireCases: true, requirePanel: false }), message))
  }
})
