import { expect, test } from '@playwright/test'

// The streamed demos are driven by page scripts (`StreamingExamples.astro`), not by the components: the page must load them.
for (const { path, demo: selector } of [
  { path: './components/markdown/', demo: 'c2-markdown[data-markdown-demo]' },
  { path: './components/streaming-text/', demo: 'c2-streaming-text[data-streaming-text-demo]' },
]) {
  test(`${path} streams its demo when it scrolls into view, and Replay starts it again`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(path)
    const demo = page.locator(selector).first()
    const length = () => demo.evaluate((element) => (element as HTMLElement & { value: string }).value.length)
    await demo.scrollIntoViewIfNeeded()
    await expect.poll(length, { timeout: 15_000 }).toBeGreaterThan(40)
    await expect(demo).toHaveJSProperty('streaming', false, { timeout: 30_000 })
    const full = await length()

    await page.getByText('Replay', { exact: true }).first().click()
    // Replay clears the element and streams the answer again from its start.
    await expect(demo).toHaveJSProperty('streaming', true)
    expect(await length()).toBeLessThan(full)
    await expect(demo).toHaveJSProperty('streaming', false, { timeout: 30_000 })
    expect(await length()).toBe(full)
    // Hydration errors included: a c2-image inside the page's static example once failed to hydrate.
    expect(errors).toEqual([])
  })
}
