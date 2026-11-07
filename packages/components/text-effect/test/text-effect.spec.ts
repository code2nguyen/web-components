import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { TextEffect } from '../src/text-effect'

const effect = (page: Page, selector = 'c2-text-effect') => page.locator(selector)
const shown = (page: Page, selector?: string) => effect(page, selector).locator('[part="text"]')
const events = async (page: Page, selector = 'c2-text-effect') => JSON.parse((await effect(page, selector).getAttribute('data-events')) ?? '[]')
/** Fast timings, so the tests do not wait seconds. */
const FAST =
  'style="--c2-text-effect--interval: 150ms; --c2-text-effect__char--duration: 10ms; --c2-text-effect__rotate--duration: 60ms; --c2-text-effect__reveal--duration: 60ms; --c2-text-effect__reveal--stagger: 10ms"'

test('reads the still text, hides the animation from assistive technology, and passes axe', async ({ page, renderScenario }) => {
  await renderScenario(
    `<h1>Build <c2-text-effect effect="shimmer">anything</c2-text-effect></h1><p><c2-text-effect effect="rotate" words="faster;safer;together"></c2-text-effect></p>`,
  )
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Build\s+anything/)
  await expect(shown(page).first()).toHaveAttribute('aria-hidden', 'true')
  await expect(shown(page).first()).toHaveText('anything')
  // The words, joined, rather than whichever one is on screen.
  await expect(effect(page).nth(1).locator('.sr')).toHaveText('faster, safer, together')
  await accessible(page)
})

test('rotate cycles the words in a box as wide as the widest, so the line never jumps', async ({ page, renderScenario }) => {
  await renderScenario(`<p>Build <c2-text-effect effect="rotate" words='["fast","safer","together"]' ${FAST}></c2-text-effect> today</p>`)
  const width = () => effect(page).evaluate((element) => Math.round(element.getBoundingClientRect().width))
  const first = await width()
  const seen = new Set<string>()
  await expect
    .poll(async () => {
      seen.add((await shown(page).locator('.word:not(.out)').textContent()) ?? '')
      return seen.size
    })
    .toBe(3)
  expect(await width()).toBe(first)
  // The box reserves "together", the widest word.
  const together = await effect(page).evaluate((element) => {
    const probe = document.createElement('span')
    probe.textContent = 'together'
    element.parentElement!.append(probe)
    const result = Math.round(probe.getBoundingClientRect().width)
    probe.remove()
    return result
  })
  expect(Math.abs(first - together)).toBeLessThanOrEqual(1)
})

test('typewriter types each word, deletes it and types the next; without loop it stops on the last and says so', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-text-effect effect="typewriter" words="ask;answer" ${FAST}></c2-text-effect>`)
  await watch(effect(page), 'effect-end')
  await expect(shown(page).locator('[part="caret"]')).toBeAttached()
  await expect.poll(() => shown(page).textContent()).toBe('ask')
  await expect.poll(() => shown(page).textContent()).toBe('answer')
  await expect.poll(() => events(page)).toEqual([null])
  await page.waitForTimeout(300)
  expect(await shown(page).textContent()).toBe('answer')
})

test('scramble resolves into the text and ends; reveal rises word by word and ends', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-text-effect id="s" effect="scramble" ${FAST}>Deployed</c2-text-effect> <c2-text-effect id="r" ${FAST}>Your team's second brain</c2-text-effect>`,
  )
  // At these timings both effects can end before a listener attached in a later call, so each one is played again
  // in the same task that starts listening: only the replay's end is recorded.
  await page.evaluate(() =>
    document.querySelectorAll<TextEffect>('c2-text-effect').forEach((element) => {
      const ends: null[] = []
      element.setAttribute('data-events', '[]')
      element.addEventListener('effect-end', () => {
        ends.push(null)
        element.setAttribute('data-events', JSON.stringify(ends))
      })
      element.replay()
    }),
  )
  await expect.poll(() => shown(page, '#s').textContent()).toBe('Deployed')
  await expect.poll(() => events(page, '#s')).toEqual([null])
  await expect(shown(page, '#r').locator('.piece')).toHaveCount(4)
  await expect.poll(() => events(page, '#r')).toEqual([null])
  await expect(shown(page, '#r')).toHaveText("Your team's second brain")
})

test('shimmer sweeps with a CSS animation; reduced motion shows every effect still and final', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-text-effect effect="shimmer">Thinking…</c2-text-effect>`)
  expect(await shown(page).evaluate((element) => getComputedStyle(element).animationName)).toBe('c2-text-effect-shimmer')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await renderScenario(
    `<c2-text-effect id="sh" effect="shimmer">Thinking…</c2-text-effect><c2-text-effect id="ro" effect="rotate" words="faster;safer" ${FAST}></c2-text-effect><c2-text-effect id="ty" effect="typewriter" ${FAST}>Ask about invoices</c2-text-effect><c2-text-effect id="sc" effect="scramble" ${FAST}>Deployed</c2-text-effect>`,
  )
  expect(await shown(page, '#sh').evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
  await expect(shown(page, '#ty')).toHaveText('Ask about invoices')
  await expect(shown(page, '#sc')).toHaveText('Deployed')
  await page.waitForTimeout(400)
  expect(await shown(page, '#ro').locator('.word').allTextContents()).toEqual(['faster'])
})

test('play="in-view" waits until it is seen; play="hover" starts again on hover; a new text replays', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div style="height: 2000px"></div><c2-text-effect id="v" effect="typewriter" play="in-view" ${FAST}>Hello there</c2-text-effect><c2-text-effect id="h" effect="scramble" play="hover" ${FAST}>Hover</c2-text-effect>`,
  )
  await page.waitForTimeout(300)
  expect(await shown(page, '#v').textContent()).toBe('')
  await effect(page, '#v').scrollIntoViewIfNeeded()
  await expect.poll(() => shown(page, '#v').textContent()).toBe('Hello there')

  await watch(effect(page, '#h'), 'effect-end')
  await effect(page, '#h').hover()
  await expect.poll(() => events(page, '#h')).toEqual([null])

  await effect(page, '#v').evaluate((element) => (element.textContent = 'Bye'))
  await expect.poll(() => shown(page, '#v').textContent()).toBe('Bye')
  await props(effect(page, '#v'), { effect: 'shimmer' })
  await expect(shown(page, '#v')).toHaveClass(/shimmer/)
})

test('regressions: scramble keeps the word length, a moved element starts again, hover and in-view effects wait', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-text-effect id="s" effect="scramble" style="--c2-text-effect__char--duration: 40ms">Deployed</c2-text-effect><div id="box"></div><c2-text-effect id="h" play="hover">Rest here</c2-text-effect><div style="height: 2000px"></div><c2-text-effect id="v" play="in-view">Seen later</c2-text-effect>`,
  )
  const lengths = await shown(page, '#s').evaluate(
    (element) =>
      new Promise<number[]>((resolve) => {
        const seen: number[] = []
        const timer = setInterval(() => {
          seen.push((element.textContent ?? '').length)
          if (seen.length > 15) {
            clearInterval(timer)
            resolve(seen)
          }
        }, 20)
      }),
  )
  expect(new Set(lengths.filter((length) => length > 0))).toEqual(new Set([8]))

  // A rotate moved in the page keeps rotating.
  await renderScenario(`<c2-text-effect id="r" effect="rotate" words="one;two;three" ${FAST}></c2-text-effect><div id="box"></div>`)
  await effect(page, '#r').evaluate((element) => document.getElementById('box')!.append(element))
  const words = new Set<string>()
  await expect
    .poll(async () => {
      words.add((await shown(page, '#r').locator('.word:not(.out)').textContent()) ?? '')
      return words.size
    })
    .toBeGreaterThan(1)

  await renderScenario(
    `<c2-text-effect id="h" play="hover">Rest here</c2-text-effect><div style="height: 2000px"></div><c2-text-effect id="v" play="in-view">Seen later</c2-text-effect>`,
  )
  expect(
    await shown(page, '#h')
      .locator('.piece')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none')
  expect(
    await shown(page, '#v')
      .locator('.piece')
      .first()
      .evaluate((element) => getComputedStyle(element).opacity),
  ).toBe('0')
  await effect(page, '#v').scrollIntoViewIfNeeded()
  await expect
    .poll(() =>
      shown(page, '#v')
        .locator('.piece')
        .first()
        .evaluate((element) => getComputedStyle(element).animationName),
    )
    .toBe('c2-text-effect-rise')
})
