import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { checkObservableEffect } from './assertions'
import { prepareReviewedContext, type ReviewedContext } from './context'
import { validateReviewedRegistry } from '../../scripts/lib/style-contract-cases.mjs'
import { discoverPublishableContracts } from '../../scripts/lib/style-contract-discovery.mjs'

type ReviewedCase = {
  id: string
  tag: string
  name: string
  context: string
  state: string
  value: string
  controlValue?: string
  target: string
  assertion: 'computed-style' | 'geometry' | 'pseudo-style' | 'slotted-style' | 'delegated-style' | 'programmatic-output'
  declaration?: string
  pseudo?: '::before' | '::after'
  valueSyntax?: string
  syntaxRationale?: string
  outputProbe?: 'canvas-bitmap' | 'svg-bitmap' | 'image-bitmap' | 'text-content'
  geometryMetric?: 'width' | 'height' | 'x' | 'y' | 'area'
  stabilityWindowMs?: number
  childTag?: string
  browsers: string[]
  reset: string
}

const registry = JSON.parse(readFileSync(new URL('../../scripts/data/style-contract-cases.json', import.meta.url), 'utf8')) as {
  schemaVersion: number
  contexts: ReviewedContext[]
  cases: ReviewedCase[]
}
const inventory = discoverPublishableContracts(process.cwd()).tags.flatMap((record) =>
  (record.declaration.cssProperties ?? []).map((property) => ({
    tag: record.tag,
    name: property.name,
    type: typeof property.type === 'string' ? property.type : property.type?.text,
  })),
)
validateReviewedRegistry(registry, inventory)
const contexts = new Map(registry.contexts.map((context) => [context.id, context]))

test('browser registry startup rejects malformed reviewed inputs', () => {
  for (const [mutate, message] of [
    [(copy: typeof registry) => (copy.cases[0].assertion = 'pseudo-style'), /pseudo/],
    [(copy: typeof registry) => (copy.cases[0].context = 'absent'), /missing context/],
    [(copy: typeof registry) => (copy.cases.find((item) => item.id === 'button-container-border-base')!.valueSyntax = 'width'), /valueSyntax/],
    [(copy: typeof registry) => ((copy.contexts[0] as unknown as Record<string, unknown>).stateSetup = 'selected'), /stateSetup/],
    [(copy: typeof registry) => ((copy.contexts[0] as unknown as Record<string, unknown>).dimensions = '123px'), /dimensions/],
    [(copy: typeof registry) => (copy.cases[0].browsers = []), /browsers/],
    [(copy: typeof registry) => (copy.cases[0].reset = 'leave-property'), /reset/],
    [(copy: typeof registry) => (copy.cases[0].assertion = 'unknown' as ReviewedCase['assertion']), /assertion/],
  ] as const) {
    const copy = structuredClone(registry)
    mutate(copy)
    expect(() => validateReviewedRegistry(copy, inventory)).toThrow(message)
  }
})

for (const verificationCase of registry.cases) {
  test(`observable contract: ${verificationCase.id}`, async ({ page }, testInfo) => {
    test.skip(!verificationCase.browsers.includes(testInfo.project.name), `not selected for ${testInfo.project.name}`)
    const context = contexts.get(verificationCase.context)
    if (!context) throw new Error(`Missing reviewed context ${verificationCase.context}`)
    await page.goto('/tests/style-contracts/scenarios.html')
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.modulesReady)).toBe('true')
    for (const module of context.modules ?? []) await page.evaluate(async (url) => void (await import(/* @vite-ignore */ url)), module)
    await prepareReviewedContext(page, context)
    const result = await checkObservableEffect(page, {
      host: verificationCase.tag,
      name: verificationCase.name,
      value: verificationCase.value,
      controlValue: verificationCase.controlValue,
      target: verificationCase.target,
      declaration: verificationCase.declaration,
      pseudo: verificationCase.pseudo,
      valueSyntax: verificationCase.valueSyntax,
      outputProbe: verificationCase.outputProbe,
      geometryMetric: verificationCase.geometryMetric,
      stabilityWindowMs: verificationCase.stabilityWindowMs,
      childTag: verificationCase.childTag,
      assertion: verificationCase.assertion,
      state: verificationCase.state,
      publishedType: inventory.find((property) => property.tag === verificationCase.tag && property.name === verificationCase.name)?.type,
    })
    expect(result.kind, `${verificationCase.tag} ${verificationCase.name} ${verificationCase.state}: ${JSON.stringify(result)}`).toBe('changed')
  })
}

test('host variable echo alone cannot prove a target effect', async ({ page }) => {
  await page.setContent(`<c2-style-probe style="--c2-style-probe--border-color: red"><span class="target">Target</span></c2-style-probe>
    <style>.target { border: 2px solid blue }</style>`)
  const result = await checkObservableEffect(page, {
    host: 'c2-style-probe',
    name: '--c2-style-probe--border-color',
    value: 'green',
    target: '.target',
    declaration: 'border-color',
    assertion: 'computed-style',
  })
  expect(result.kind).toBe('no-observable-change')
  expect(result.hostEcho).toBe('green')
})

test('invalid contrasting value is not blamed on the component', async ({ page }) => {
  await page.setContent(`<c2-style-probe><span class="target">Target</span></c2-style-probe>
    <style>.target { border: 2px solid var(--c2-style-probe--border-color, blue) }</style>`)
  const result = await checkObservableEffect(page, {
    host: 'c2-style-probe',
    name: '--c2-style-probe--border-color',
    value: 'not-a-color',
    target: '.target',
    declaration: 'border-color',
    assertion: 'computed-style',
  })
  expect(result.kind).toBe('invalid-test-value')
})

test('an unresolved custom-property reference is an invalid contrasting value', async ({ page }) => {
  await page.setContent(`<c2-style-probe><span class="target">Target</span></c2-style-probe>
    <style>.target { width: var(--c2-style-probe--width, 10px) }</style>`)
  const result = await checkObservableEffect(page, {
    host: 'c2-style-probe',
    name: '--c2-style-probe--width',
    value: 'var(--missing)',
    publishedType: 'pixel',
    target: '.target',
    assertion: 'computed-style',
    declaration: 'width',
  })
  expect(result.kind).toBe('invalid-test-value')
})

test('a valid observed declaration cannot validate the wrong published value type', async ({ page }) => {
  await page.setContent(`<c2-style-probe><span class="target">Target</span></c2-style-probe>
    <style>.target { color: var(--c2-style-probe--pixel-size, blue) }</style>`)
  const result = await checkObservableEffect(page, {
    host: 'c2-style-probe',
    name: '--c2-style-probe--pixel-size',
    value: 'red',
    publishedType: 'pixel',
    target: '.target',
    declaration: 'color',
    assertion: 'computed-style',
  })
  expect(result.kind).toBe('invalid-test-value')
})
