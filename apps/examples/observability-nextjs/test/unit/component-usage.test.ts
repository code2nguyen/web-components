import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'
import { COMPONENT_USAGE } from '../../lib/data/component-usage.ts'
import type { ComponentUsageRecord } from '../../lib/domain/component-usage.ts'
import { componentGroupsForPathname, componentSourcePathForRegions, regionsForPathname } from '../../components/built-with/component-map.ts'
import { componentDocsUrl, componentSourceUrl } from '../../components/built-with/component-links.ts'

const appRoot = new URL('../../', import.meta.url).pathname
const repositoryFeedback = readFileSync(new URL('../../../../../COMPONENT-FEEDBACK.md', import.meta.url), 'utf8')
function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? sources(path) : /\.(tsx|ts)$/.test(name) && !path.endsWith('component-usage.ts') ? [path] : []
  })
}

test('every rendered c2 tag has one complete usage record and broad category coverage', () => {
  const rendered = new Set<string>()
  for (const path of sources(appRoot)) {
    for (const match of readFileSync(path, 'utf8').matchAll(/<\/?(c2-[a-z0-9-]+)/g)) rendered.add(match[1])
  }
  const registered = new Map<string, ComponentUsageRecord>(COMPONENT_USAGE.map((record) => [record.tag, record]))
  const missing = [...rendered].filter((tag) => !registered.has(tag))
  assert.deepEqual(missing, [])
  assert.equal(registered.size, new Set(COMPONENT_USAGE.map(({ tag }) => tag)).size)
  assert.ok(rendered.size >= 25, `expected at least 25 rendered c2 elements, received ${rendered.size}`)
  const packages = new Set<string | undefined>([...rendered].map((tag) => registered.get(tag)?.packageName))
  for (const expected of ['@c2n/header', '@c2n/select', '@c2n/table', '@c2n/chart', '@c2n/dashboard', '@c2n/status-panel']) assert.ok(packages.has(expected))
})

test('component documentation and source links are canonical and bounded', () => {
  assert.equal(componentDocsUrl('/web-components/components/table'), 'https://code2nguyen.github.io/web-components/components/table/')
  assert.equal(
    componentSourceUrl('apps/examples/observability-nextjs/features/services/ServiceTable.tsx'),
    'https://github.com/code2nguyen/web-components/blob/develop/apps/examples/observability-nextjs/features/services/ServiceTable.tsx',
  )
  assert.throws(() => componentSourceUrl('../../secret'), /inside the observability example/)
})

test('every route exposes every applicable component record without truncation or duplication', () => {
  for (const pathname of ['/', '/services/', '/services/production-edge-gateway/', '/traces/', '/traces/trace-00001/', '/logs/', '/dashboards/', '/alerts/']) {
    const regions = regionsForPathname(pathname)
    const expected = COMPONENT_USAGE.filter((record) => record.regions.some((region) => regions.includes(region))).map(({ tag }) => tag)
    const groups = componentGroupsForPathname(pathname)
    const actual = groups.flatMap(({ records }) => records.map(({ tag }) => tag))

    assert.ok(
      groups.every(({ records }) => records.length > 0),
      `${pathname} contains an empty component group`,
    )
    assert.equal(actual.length, new Set(actual).size, `${pathname} repeats a component record`)
    assert.deepEqual(new Set(actual), new Set(expected), `${pathname} omits an applicable component record`)
  }
})

test('collection and detail routes expose only their visible page compositions', () => {
  assert.ok(!regionsForPathname('/services/').includes('service-detail'))
  assert.ok(regionsForPathname('/services/production-edge-gateway/').includes('service-detail'))
  assert.ok(!regionsForPathname('/traces/').includes('trace-detail'))
  assert.ok(regionsForPathname('/traces/trace-00001/').includes('trace-detail'))

  const pageTags = (pathname: string) =>
    new Set(
      componentGroupsForPathname(pathname)
        .find(({ id }) => id === 'page')
        ?.records.map(({ tag }) => tag) ?? [],
    )
  const serviceCollection = pageTags('/services/')
  const serviceDetail = pageTags('/services/production-edge-gateway/')
  for (const tag of ['c2-card', 'c2-stat', 'c2-line-chart']) assert.ok(!serviceCollection.has(tag as `c2-${string}`), `/services/ exposes detail-only ${tag}`)
  for (const tag of ['c2-card', 'c2-stat', 'c2-line-chart']) assert.ok(serviceDetail.has(tag as `c2-${string}`), `service detail omits ${tag}`)

  const traceCollection = pageTags('/traces/')
  const traceDetail = pageTags('/traces/trace-00001/')
  for (const tag of ['c2-details', 'c2-tree', 'c2-tree-item']) assert.ok(!traceCollection.has(tag as `c2-${string}`), `/traces/ exposes detail-only ${tag}`)
  for (const tag of ['c2-details', 'c2-tree', 'c2-tree-item']) assert.ok(traceDetail.has(tag as `c2-${string}`), `trace detail omits ${tag}`)
})

test('every primary route identifies the Built with c2n overlay composition', () => {
  for (const pathname of ['/', '/services/', '/traces/', '/logs/', '/dashboards/', '/alerts/']) {
    const groups = componentGroupsForPathname(pathname)
    const developerGuidance = groups.find(({ id }) => id === 'built-with')
    assert.ok(developerGuidance, `${pathname} omits developer guidance`)
    const tags = new Set(groups.flatMap(({ records }) => records.map(({ tag }) => tag)))
    assert.ok(tags.has('c2-sheet'), `${pathname} omits the Built with c2n sheet`)
    assert.ok(tags.has('c2-details'), `${pathname} omits the Built with c2n disclosures`)
  }
})

test('multi-workflow components link to a representative source for the active region', () => {
  const details = COMPONENT_USAGE.find(({ tag }) => tag === 'c2-details')
  assert.ok(details)
  assert.match(componentSourcePathForRegions(details, ['trace-detail']), /features\/traces\/TraceDetail\.tsx$/)
  assert.match(componentSourcePathForRegions(details, ['dashboard']), /features\/dashboards\/OperationalDashboard\.tsx$/)
  assert.match(componentSourcePathForRegions(details, ['alerts']), /features\/alerts\/AlertRulePreview\.tsx$/)
  assert.match(componentSourcePathForRegions(details, ['built-with']), /components\/built-with\/BuiltWithC2n\.tsx$/)
})

test('the example verifies components only through their public element boundary', () => {
  const privateRootToken = ['shadow', 'Root'].join('')
  const violations = sources(appRoot)
    .filter((path) => readFileSync(path, 'utf8').includes(privateRootToken))
    .map((path) => relative(appRoot, path))
  assert.deepEqual(violations, [])
})

test('application UI uses c2 controls unless an exemption links repository feedback', () => {
  const nativeEquivalent = /<(button|select|input|textarea|dialog|details|progress)\b/
  const violations: string[] = []
  for (const directory of ['app', 'components', 'features', 'providers']) {
    for (const path of sources(join(appRoot, directory))) {
      const lines = readFileSync(path, 'utf8').split('\n')
      lines.forEach((line, index) => {
        if (!nativeEquivalent.test(line)) return
        const context = lines.slice(Math.max(0, index - 3), index + 1).join('\n')
        const exemption = context.match(/dogfood-exempt:\s*feedback=([^\s*]+)/i)?.[1]
        if (!exemption || !repositoryFeedback.includes(exemption)) violations.push(`${relative(appRoot, path)}:${index + 1}`)
      })
    }
  }
  assert.deepEqual(violations, [])
})
