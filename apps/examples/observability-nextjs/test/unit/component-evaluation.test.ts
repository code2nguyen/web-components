import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { COMPONENT_USAGE } from '../../lib/data/component-usage.ts'

const report = readFileSync(new URL('../../COMPONENT-EVALUATION.md', import.meta.url), 'utf8')
const feedback = readFileSync(new URL('../../../../../COMPONENT-FEEDBACK.md', import.meta.url), 'utf8')

test('evaluation inventories every actually rendered registry tag with version, outcome, and evidence', () => {
  for (const record of COMPONENT_USAGE) {
    if (record.sourcePaths.some((path) => ['app/', 'components/', 'features/'].some((part) => path.includes(part)))) {
      assert.ok(report.includes(`\`${record.tag}\``), `${record.tag} missing from report`)
    }
  }
  assert.match(report, /Every component below is version 0\.0\.14/)
  assert.match(report, /successful(?:-with-workaround)?/)
  assert.match(report, /Evidence/)
})

test('every finding contains the required actionable fields and open findings are synchronized', () => {
  const findings = report.split(/^### (?=C2N-NEXT-\d{3})/m).slice(1)
  assert.ok(findings.length >= 6)
  const fields = [
    'Kind',
    'Category',
    'Priority',
    'Affected package/tag and exact version',
    'Workflow/context',
    'Expected behavior',
    'Actual behavior',
    'Minimal reproduction steps',
    'Evidence',
    'Workaround',
    'Recommended change',
    'Disposition',
  ]
  for (const finding of findings) {
    assert.match(finding, /^C2N-NEXT-\d{3}/)
    for (const field of fields) assert.match(finding, new RegExp(`\\*\\*${field}:\\*\\*`), `${field} missing`)
    if (/\*\*Disposition:\*\* Open/.test(finding)) {
      const id = finding.match(/^C2N-NEXT-\d{3}/)?.[0]
      assert.ok(id)
      assert.match(report, /synchronized root feedback entry/)
      assert.match(feedback, /Next\.js observability example|observability example/)
    }
  }
})

test('required evaluation categories and manual limitations are explicit', () => {
  for (const category of [
    'Next.js integration',
    'SSR/hydration',
    'API/types',
    'Events/bindings',
    'Styling',
    'Composition',
    'Accessibility',
    'Documentation',
    'Performance',
    'Developer experience',
  ]) {
    assert.match(report, new RegExp(`\\*\\*${category}:\\*\\*`))
  }
  assert.match(report, /VoiceOver\/Safari/)
  assert.match(report, /NVDA\/Firefox-or-Chrome/)
  assert.match(report, /not claimed/i)
})

test('expanded component usage stays synchronized across registry and evaluation contexts', () => {
  const details = COMPONENT_USAGE.find(({ tag }) => tag === 'c2-details')
  assert.ok(details)
  for (const region of ['trace-detail', 'dashboard', 'alerts', 'built-with']) {
    assert.ok((details.regions as readonly string[]).includes(region), `c2-details missing ${region} region`)
  }
  for (const source of [
    'apps/examples/observability-nextjs/features/traces/TraceDetail.tsx',
    'apps/examples/observability-nextjs/features/dashboards/OperationalDashboard.tsx',
    'apps/examples/observability-nextjs/features/alerts/AlertRulePreview.tsx',
    'apps/examples/observability-nextjs/components/built-with/BuiltWithC2n.tsx',
  ]) {
    assert.ok(details.sourcePaths.includes(source), `c2-details missing representative source ${source}`)
  }

  const inventoryRow = report.split('\n').find((line) => line.startsWith('| `c2-details`'))
  assert.ok(inventoryRow)
  for (const workflow of ['Trace', 'dashboard', 'alert preview', 'developer guidance']) {
    assert.match(inventoryRow, new RegExp(workflow, 'i'), `c2-details evaluation missing ${workflow} context`)
  }
})

test('the evaluation and registry include the developer-guidance sheet composition', () => {
  const sheet = COMPONENT_USAGE.find(({ tag }) => tag === 'c2-sheet')
  assert.ok(sheet)
  assert.ok((sheet.regions as readonly string[]).includes('built-with'))
  assert.ok(sheet.sourcePaths.includes('apps/examples/observability-nextjs/components/built-with/BuiltWithC2n.tsx'))

  const inventoryRow = report.split('\n').find((line) => line.startsWith('| `c2-sheet`'))
  assert.ok(inventoryRow)
  assert.match(inventoryRow, /guidance/i)
  assert.match(inventoryRow, /components\/built-with\/BuiltWithC2n\.tsx/)
})
