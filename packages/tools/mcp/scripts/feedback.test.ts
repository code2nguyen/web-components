import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  FEEDBACK_REPO,
  MAX_URL_LENGTH,
  buildIssueDraft,
  detectFramework,
  olderVersion,
  renderFeedbackReport,
  type FeedbackEnvironment,
  type FeedbackInput,
} from '../src/feedback.ts'

const input: FeedbackInput = {
  component: 'c2-table',
  kind: 'papercut',
  title: 'renderCell node does not fill the cell',
  building: 'A goals table with a progress bar per row.',
  expected: 'A 100% wide c2-progress fills the column.',
  actual: 'It is as wide as the label next to it.',
  workaround: 'A fixed --c2-progress--width: 96px.',
  repro: '<c2-table></c2-table>',
}
const env: FeedbackEnvironment = { tag: 'c2-table', version: '1.0.20', versionOf: '@c2n/components', registryVersion: '1.0.27', framework: 'React 19' }

test('the draft prefixes the title with the tag once and fills every section', () => {
  const draft = buildIssueDraft(input, env)
  assert.equal(draft.title, 'c2-table: renderCell node does not fill the cell')
  assert.equal(buildIssueDraft({ ...input, title: 'c2-table drops the width' }, env).title, 'c2-table drops the width')
  for (const text of [
    '### Kind',
    'papercut: works, but the common case is hard',
    '1.0.20 (@c2n/components)',
    'React 19',
    '### Workaround',
    '```html\n<c2-table>',
  ])
    assert.ok(draft.body.includes(text), `body lacks ${text}`)
  assert.deepEqual(draft.shortened, [])
})

test('the link opens the issue form with each field pre-filled under its id', () => {
  const url = new URL(buildIssueDraft(input, env).url)
  assert.equal(url.origin + url.pathname, `https://github.com/${FEEDBACK_REPO}/issues/new`)
  assert.equal(url.searchParams.get('template'), 'component-feedback.yml')
  assert.equal(url.searchParams.get('labels'), 'component-feedback')
  assert.equal(url.searchParams.get('component'), 'c2-table')
  // A dropdown is pre-filled only by its exact option text.
  assert.equal(url.searchParams.get('kind'), 'papercut: works, but the common case is hard')
  assert.equal(url.searchParams.get('repro'), '<c2-table></c2-table>')
  assert.equal(url.searchParams.get('framework'), 'React 19')
})

test('a long reproduction is cut to keep the link under the limit, and the draft keeps all of it', () => {
  const repro = `<c2-table>${'<c2-table-column field="x"></c2-table-column>'.repeat(400)}</c2-table>`
  const draft = buildIssueDraft({ ...input, repro }, env)
  assert.ok(draft.url.length <= MAX_URL_LENGTH, `link is ${draft.url.length} long`)
  assert.deepEqual(draft.shortened, ['repro'])
  assert.ok(new URL(draft.url).searchParams.get('repro')?.includes('cut to fit the link'))
  assert.ok(draft.body.includes(repro))
})

test('the report warns about an older install, a broken reproduction and an unsearched duplicate list', () => {
  const draft = buildIssueDraft(input, env)
  const report = renderFeedbackReport({
    draft,
    env,
    duplicates: undefined,
    reproFindings: [{ line: 1, column: 1, severity: 'error', rule: 'unknown-attribute', message: 'Unknown attribute "rowz"' }],
    unknownComponent: false,
  })
  assert.match(report, /Newer release available/)
  assert.match(report, /Check the reproduction first/)
  assert.match(report, /were not searched/)
  assert.match(report, /Do not submit it yourself/)
  assert.ok(report.includes(draft.url))
})

test('existing issues are listed so the developer can add to one', () => {
  const report = renderFeedbackReport({
    draft: buildIssueDraft(input, { ...env, version: '1.0.27' }),
    env: { ...env, version: '1.0.27' },
    duplicates: [{ number: 12, title: 'c2-table: cell width', url: 'https://github.com/x/y/issues/12', state: 'open' }],
    reproFindings: [],
    unknownComponent: true,
  })
  assert.match(report, /#12 \[open\] c2-table: cell width/)
  assert.match(report, /Check the component name/)
  assert.doesNotMatch(report, /Newer release/)
})

test('versions compare numerically', () => {
  assert.equal(olderVersion('1.0.9', '1.0.27'), true)
  assert.equal(olderVersion('1.0.27', '1.0.27'), false)
  assert.equal(olderVersion('2.0.0-beta.1', '1.9.0'), false)
})

test('the framework is read from package.json, the meta-framework first', () => {
  const root = mkdtempSync(join(tmpdir(), 'c2n-feedback-'))
  try {
    assert.equal(detectFramework(root), undefined)
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { react: '^19.1.0', next: '16.0.1' } }))
    assert.equal(detectFramework(root), 'Next.js 16')
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.5.0' } }))
    assert.equal(detectFramework(root), 'Vue 3')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
