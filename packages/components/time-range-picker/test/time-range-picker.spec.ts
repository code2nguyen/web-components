import { accessible, expect, test, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

// Wednesday 2026-10-21 08:12:30 UTC.
const NOW = new Date('2026-10-21T08:12:30Z')

const freeze = (page: Page) => page.clock.setFixedTime(NOW)
const open = async (page: Page) => {
  await page.locator('c2-time-range-picker #trigger').click()
  const dialog = page.getByRole('dialog', { name: 'Choose a time range' })
  await expect(dialog).toBeVisible()
  return dialog
}

test('shows the range and applies a quick range', async ({ page, renderScenario }) => {
  await renderScenario('<c2-time-range-picker></c2-time-range-picker>')
  const host = page.locator('c2-time-range-picker')
  const trigger = page.getByRole('button', { name: 'Time range: Last 1 hour' })
  await expect(trigger).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await watch(host, 'change')

  const dialog = await open(page)
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(dialog.getByRole('textbox', { name: 'Search quick ranges' })).toBeFocused()
  await expect(dialog.getByRole('button', { name: 'Last 1 hour' })).toHaveAttribute('aria-current', 'true')
  await dialog.getByRole('button', { name: 'Last 24 hours' }).click()

  await expect(dialog).toBeHidden()
  await expect(host).toHaveAttribute('from', 'now-24h')
  // The default end stays off the host, as every default does.
  await expect(host).toHaveJSProperty('to', 'now')
  await expect(host).toHaveAttribute('data-events', JSON.stringify([{ from: 'now-24h', to: 'now', timeZone: '' }]))
  await expect(page.getByRole('button', { name: 'Time range: Last 24 hours' })).toBeFocused()
})

test('names calendar ranges and reads them in the time zone', async ({ page, renderScenario }) => {
  await freeze(page)
  await renderScenario('<c2-time-range-picker from="now-1d/d" to="now-1d/d" time-zone="UTC"></c2-time-range-picker>')
  const host = page.locator('c2-time-range-picker')
  await expect(host.locator('#trigger .label')).toHaveText('Yesterday')
  const range = await host.evaluate((element) => {
    const { from, to } = (element as HTMLElementTagNameMap['c2-time-range-picker']).resolve()!
    return [from.toISOString(), to.toISOString()]
  })
  expect(range).toEqual(['2026-10-20T00:00:00.000Z', '2026-10-21T00:00:00.000Z'])
})

test('a typed span in the search offers that range, and Enter applies it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-time-range-picker></c2-time-range-picker>')
  const dialog = await open(page)
  const search = dialog.getByRole('textbox', { name: 'Search quick ranges' })
  await search.fill('3 days')
  await expect(dialog.locator('.preset').first()).toHaveText('Last 3 days')
  await search.press('Enter')
  await expect(page.locator('c2-time-range-picker')).toHaveAttribute('from', 'now-3d')
  await expect(page.locator('c2-time-range-picker #trigger .label')).toHaveText('Last 3 days')

  const again = await open(page)
  await again.getByRole('textbox', { name: 'Search quick ranges' }).fill('zzz')
  await expect(again.getByText('No matching range')).toBeVisible()
  // A word that is not a unit, even one every object has, offers nothing.
  await again.getByRole('textbox', { name: 'Search quick ranges' }).fill('1 constructor')
  await expect(again.getByText('No matching range')).toBeVisible()
})

test('arrow keys move through the quick ranges', async ({ page, renderScenario }) => {
  await renderScenario('<c2-time-range-picker></c2-time-range-picker>')
  const dialog = await open(page)
  await page.keyboard.press('ArrowDown')
  await expect(dialog.getByRole('button', { name: 'Last 5 minutes' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(dialog.getByRole('button', { name: 'Last 15 minutes' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(dialog.getByRole('button', { name: 'This month so far' })).toBeFocused()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowUp')
  await expect(dialog.getByRole('textbox', { name: 'Search quick ranges' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('applies a typed absolute range and remembers it', async ({ page, renderScenario }) => {
  await freeze(page)
  await renderScenario('<c2-time-range-picker time-zone="UTC" lang="en-US"></c2-time-range-picker>')
  const host = page.locator('c2-time-range-picker')
  await watch(host, 'change')
  const dialog = await open(page)
  const from = dialog.getByRole('textbox', { name: 'From' })
  const to = dialog.getByRole('textbox', { name: 'To' })
  await expect(from).toHaveValue('now-1h')
  await from.fill('2026-10-20T09:00')
  await expect(dialog.locator('#draft-from-resolved')).toHaveText('Oct 20, 2026, 9:00:00 AM')
  await to.fill('2026-10-20T17:30')
  await to.press('Enter')

  await expect(dialog).toBeHidden()
  await expect(host).toHaveAttribute('data-events', JSON.stringify([{ from: '2026-10-20T09:00', to: '2026-10-20T17:30', timeZone: 'UTC' }]))
  await expect(host.locator('#trigger .label')).toHaveText('Oct 20, 09:00 AM → Oct 20, 05:30 PM')
  await expect(host.locator('#trigger .time-zone')).toHaveText('UTC')

  const again = await open(page)
  await again.getByRole('button', { name: 'Last 1 hour' }).click()
  const third = await open(page)
  await expect(third.getByRole('heading', { name: 'Recently used' })).toBeVisible()
  await third.locator('.recent .preset').click()
  await expect(host).toHaveAttribute('from', '2026-10-20T09:00')
})

test('rejects an unreadable end and an end before the start', async ({ page, renderScenario }) => {
  await renderScenario('<c2-time-range-picker></c2-time-range-picker>')
  const dialog = await open(page)
  const from = dialog.getByRole('textbox', { name: 'From' })
  const to = dialog.getByRole('textbox', { name: 'To' })
  await from.fill('yesterday')
  await dialog.getByRole('button', { name: 'Apply range' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Not a date, time or now expression')
  await expect(from).toHaveAttribute('aria-invalid', 'true')
  await expect(to).toHaveAttribute('aria-invalid', 'false')

  await from.fill('now')
  await to.fill('now-1h')
  await dialog.getByRole('button', { name: 'Apply range' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('The end must be after the start')
  await expect(page.locator('c2-time-range-picker')).toHaveJSProperty('from', 'now-1h')
})

test('two days picked on the calendar fill the range as dates', async ({ page, renderScenario }) => {
  await freeze(page)
  await renderScenario('<c2-time-range-picker time-zone="UTC"></c2-time-range-picker>')
  const dialog = await open(page)
  await dialog.locator('c2-date-selector .day[data-date="2026-10-12"]').click()
  await dialog.locator('c2-date-selector .day[data-date="2026-10-14"]').click()
  await expect(dialog.getByRole('textbox', { name: 'From' })).toHaveValue('2026-10-12')
  await expect(dialog.getByRole('textbox', { name: 'To' })).toHaveValue('2026-10-14')
  await dialog.getByRole('button', { name: 'Apply range' }).click()
  const host = page.locator('c2-time-range-picker')
  await expect(host).toHaveAttribute('to', '2026-10-14')
  await expect(host.locator('#trigger .label')).toHaveText('Oct 12 → Oct 14')
})

test('shifts the range by its span and zooms out', async ({ page, renderScenario }) => {
  await freeze(page)
  await renderScenario('<c2-time-range-picker nav time-zone="UTC"></c2-time-range-picker>')
  const host = page.locator('c2-time-range-picker')
  const later = page.getByRole('button', { name: 'Later' })
  await expect(later).toBeDisabled()

  await page.getByRole('button', { name: 'Zoom out' }).click()
  await expect(host).toHaveAttribute('from', 'now-2h')

  await page.getByRole('button', { name: 'Earlier' }).click()
  await expect(host).toHaveAttribute('from', '2026-10-21T04:12:30')
  await expect(host).toHaveAttribute('to', '2026-10-21T06:12:30')
  await expect(later).toBeEnabled()
  await later.click()
  await expect(host).toHaveAttribute('to', '2026-10-21T08:12:30')
})

test('refreshes on demand and on its interval, pausing while the page is hidden', async ({ page, renderScenario }) => {
  await page.clock.install({ time: NOW })
  await renderScenario('<c2-time-range-picker refresh-intervals="10s 1m"></c2-time-range-picker>')
  const host = page.locator('c2-time-range-picker')
  await host.evaluate((element) => {
    element.setAttribute('data-refreshes', '0')
    element.addEventListener('refresh', (event) => {
      const { from, to } = (event as CustomEvent<{ from: Date; to: Date }>).detail
      if (to.getTime() - from.getTime() !== 36e5) throw new Error('refresh carries the resolved range')
      element.setAttribute('data-refreshes', String(Number(element.getAttribute('data-refreshes')) + 1))
    })
  })
  await watch(host, 'refresh-interval-change')

  await page.getByRole('button', { name: 'Refresh now' }).click()
  await expect(host).toHaveAttribute('data-refreshes', '1')

  await page.getByRole('combobox', { name: 'Auto-refresh' }).selectOption('10s')
  await expect(host).toHaveAttribute('refresh-interval', '10s')
  await expect(host).toHaveAttribute('data-events', JSON.stringify([{ value: '10s' }]))
  await expect(host).toHaveAttribute('data-refreshes', '2')
  await page.clock.runFor(30_000)
  await expect(host).toHaveAttribute('data-refreshes', '5')

  // Moving the element in the DOM keeps it refreshing.
  await host.evaluate((element) => element.parentElement!.append(element))
  await page.clock.runFor(10_000)
  await expect(host).toHaveAttribute('data-refreshes', '6')

  await page.getByRole('combobox', { name: 'Auto-refresh' }).selectOption('')
  await page.clock.runFor(30_000)
  await expect(host).toHaveAttribute('data-refreshes', '6')
})

test('an active interval missing from the list is still shown', async ({ page, renderScenario }) => {
  await renderScenario('<c2-time-range-picker refresh-intervals="10s 30s" refresh-interval="2m"></c2-time-range-picker>')
  await expect(page.getByRole('combobox', { name: 'Auto-refresh' })).toHaveValue('2m')
})

test('offers a choice of time zones and reports the change', async ({ page, renderScenario }) => {
  await renderScenario('<c2-time-range-picker time-zone="UTC" time-zones="UTC Asia/Tokyo"></c2-time-range-picker>')
  const host = page.locator('c2-time-range-picker')
  await watch(host, 'change')
  const dialog = await open(page)
  await dialog.getByRole('combobox', { name: 'Time zone' }).selectOption('Asia/Tokyo')
  await expect(host).toHaveAttribute('time-zone', 'Asia/Tokyo')
  await expect(host).toHaveAttribute('data-events', JSON.stringify([{ from: 'now-1h', to: 'now', timeZone: 'Asia/Tokyo' }]))
})

test('takes custom presets and the nearest language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-time-range-picker
    presets='[{"from":"now-90m","to":"now"},{"from":"now/d","to":"now","label":"Since midnight"}]'
    from="now-90m"></c2-time-range-picker></div>`)
  await expect(page.getByRole('button', { name: 'Période: 90 minutes précédentes' })).toBeVisible()
  await page.locator('c2-time-range-picker #trigger').click()
  const dialog = page.getByRole('dialog', { name: 'Choisir une période' })
  await expect(dialog.locator('.presets').first().getByRole('button')).toHaveText(['90 minutes précédentes', 'Since midnight'])
})

test('a disabled picker does not open', async ({ page, renderScenario }) => {
  await renderScenario('<c2-time-range-picker disabled nav refresh-intervals="10s"></c2-time-range-picker>')
  await expect(page.locator('c2-time-range-picker #trigger')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Refresh now' })).toBeDisabled()
  await expect(page.locator('c2-time-range-picker c2-overlay')).toHaveCount(0)
})

test('disabling the picker while it is open closes it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-time-range-picker></c2-time-range-picker>')
  const host = page.locator('c2-time-range-picker')
  await open(page)
  await host.evaluate((element) => element.setAttribute('disabled', ''))
  await expect(host.locator('#trigger')).toHaveAttribute('aria-expanded', 'false')
  await host.evaluate((element) => element.removeAttribute('disabled'))
  await expect(page.getByRole('dialog', { name: 'Choose a time range' })).toBeHidden()
  await open(page)
})

test('is accessible closed and open', async ({ page, renderScenario }) => {
  await freeze(page)
  await renderScenario(
    '<c2-time-range-picker nav refresh-intervals="10s 1m" refresh-interval="1m" from="2026-10-20T09:00" to="2026-10-20T10:00" time-zone="UTC"></c2-time-range-picker>',
  )
  await accessible(page)
  await open(page)
  await accessible(page)
})
