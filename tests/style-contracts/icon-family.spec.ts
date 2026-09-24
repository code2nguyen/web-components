import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from '@playwright/test'
import { checkObservableEffect } from './assertions'

test('every generated icon keeps its individual source/manifest styling contract', () => {
  const families = [
    { directory: 'feather-icons', names: ['--c2-feather-icon--size', '--c2-feather-icon--color', '--c2-feather-icon--stroke-width'] },
    { directory: 'phosphor-icons', names: ['--c2-phosphor-icon--size', '--c2-phosphor-icon--color'] },
  ]
  for (const family of families) {
    const packageRoot = resolve('packages/icons', family.directory)
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'custom-elements.json'), 'utf8')) as {
      modules: { path: string; declarations?: { tagName?: string; cssProperties?: { name: string; type?: { text?: string }; default?: string }[] }[] }[]
    }
    const tags = manifest.modules.flatMap((module) => (module.declarations ?? []).filter((entry) => entry.tagName).map((entry) => ({ module, entry })))
    expect(tags.length).toBeGreaterThan(1)
    for (const { module, entry } of tags) {
      const source = readFileSync(resolve(packageRoot, module.path), 'utf8')
      const sourceProperties = [...source.matchAll(/@cssproperty\s+\{([^}]+)\}\s+\[(--c2-[a-z0-9_-]+)=([^\]]+)\]/g)].map((match) => ({
        name: match[2],
        type: match[1],
        default: match[3],
      }))
      const manifestProperties = (entry.cssProperties ?? []).map((property) => ({
        name: property.name,
        type: property.type?.text,
        default: property.default,
      }))
      expect(
        manifestProperties.sort((a, b) => a.name.localeCompare(b.name)),
        entry.tagName,
      ).toEqual(sourceProperties.sort((a, b) => a.name.localeCompare(b.name)))
      expect(manifestProperties.map(({ name }) => name).sort(), entry.tagName).toEqual([...family.names].sort())
    }
  }
})

for (const sample of [
  {
    tag: 'c2-feather-activity',
    cases: [
      {
        name: '--c2-feather-icon--size',
        value: '39px',
        target: 'c2-feather-activity',
        assertion: 'geometry' as const,
        valueSyntax: 'width',
        geometryMetric: 'width' as const,
      },
      {
        name: '--c2-feather-icon--color',
        value: 'rgb(231, 17, 73)',
        target: 'c2-feather-activity svg',
        assertion: 'computed-style' as const,
        declaration: 'color',
      },
      {
        name: '--c2-feather-icon--stroke-width',
        value: '5',
        target: 'c2-feather-activity svg',
        assertion: 'computed-style' as const,
        declaration: 'stroke-width',
      },
    ],
  },
  {
    tag: 'c2-phosphor-acorn',
    cases: [
      {
        name: '--c2-phosphor-icon--size',
        value: '39px',
        target: 'c2-phosphor-acorn',
        assertion: 'geometry' as const,
        valueSyntax: 'width',
        geometryMetric: 'width' as const,
      },
      {
        name: '--c2-phosphor-icon--color',
        value: 'rgb(231, 17, 73)',
        target: 'c2-phosphor-acorn svg',
        assertion: 'computed-style' as const,
        declaration: 'color',
      },
    ],
  },
]) {
  test(`one shared CSS styling sample for ${sample.tag}`, async ({ page }) => {
    await page.goto('/tests/style-contracts/scenarios.html')
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.modulesReady)).toBe('true')
    await page.locator('main').evaluate((main, tag) => {
      main.innerHTML = `<${tag}></${tag}>`
    }, sample.tag)
    await page.evaluate(async (tag) => void (await customElements.whenDefined(tag)), sample.tag)
    await expect(page.locator(sample.tag)).toBeAttached()
    for (const iconCase of sample.cases) {
      const result = await checkObservableEffect(page, { host: sample.tag, ...iconCase })
      expect(result.kind, `${sample.tag} ${iconCase.name}: ${JSON.stringify(result)}`).toBe('changed')
    }
  })
}
