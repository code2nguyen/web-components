import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test, expect } from '../../../tests/component-fixture'

const require = createRequire(import.meta.url)
const umbrella = JSON.parse(readFileSync(require.resolve('@c2n/components/package.json'), 'utf8')) as { dependencies: Record<string, string> }

// Every tag documented by a package the umbrella depends on. The expectation comes from the manifests rather
// than from the generated barrel, so a package the barrel forgets to import fails here.
const tags = Object.keys(umbrella.dependencies).flatMap((pkg) => {
  let manifest: { modules?: { declarations?: { tagName?: string }[] }[] }
  try {
    manifest = JSON.parse(readFileSync(require.resolve(`${pkg}/custom-elements.json`), 'utf8'))
  } catch {
    return [] // @c2n/theme ships stylesheets, not elements
  }
  return (manifest.modules ?? []).flatMap((module) => (module.declarations ?? []).flatMap((declaration) => declaration.tagName ?? []))
})

test('the barrel registers every element of every package it depends on', async ({ page, renderScenario }) => {
  expect(tags.length).toBeGreaterThan(50)
  await renderScenario('')
  const missing = await page.evaluate((names) => names.filter((name) => !customElements.get(name)), tags)
  expect(missing).toEqual([])
})

test('elements loaded through the barrel upgrade and render', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-button>Save</c2-button>
    <c2-checkbox aria-label="Accept"></c2-checkbox>
    <c2-select aria-label="Region">
      <c2-list-item value="eu">Europe</c2-list-item>
    </c2-select>
  `)
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Accept' })).toBeVisible()
  expect(await page.evaluate(() => [...document.querySelectorAll('main > *')].every((element) => element.shadowRoot !== null))).toBe(true)
})
