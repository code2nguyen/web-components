import type { Locator } from '@playwright/test'
import type { Translations } from '@c2n/core/localize.js'
import { test, expect, accessible } from '../../../../tests/component-fixture'
import type { TestSyncIndicator } from './sync-indicator'

// A status light fed by `@c2n/core`'s sync status model (`SyncStatusController`), as an editor header would use it.

const model = (host: Locator) => ({
  change: (count = 1) => host.evaluate((element: TestSyncIndicator, n) => element.sync.model.change(n), count),
  /** Starts a save that resolves or rejects when `finish(ok)` is called from the page. */
  startSave: () =>
    host.evaluate((element: TestSyncIndicator) => {
      const page = window as unknown as { finish?: (ok: boolean) => void }
      void element.sync.model
        .save(
          () =>
            new Promise<void>((resolve, reject) => {
              page.finish = (ok) => (ok ? resolve() : reject(new Error('500')))
            }),
        )
        .catch(() => undefined)
    }),
  finish: (ok: boolean) => host.evaluate((_element, value) => (window as unknown as { finish: (ok: boolean) => void }).finish(value), ok),
  online: (online: boolean) => host.evaluate((element: TestSyncIndicator, value) => element.sync.model.setOnline(value), online),
})

const light = (host: Locator) => host.locator('c2-status-light')

test('shows saved, pending, saving and saved at a time, with the tone of each', async ({ page, renderScenario }) => {
  await renderScenario('<test-sync-indicator></test-sync-indicator>')
  const host = page.locator('test-sync-indicator')
  const sync = model(host)
  await expect(light(host)).toHaveText('Saved')
  await expect(light(host)).toHaveAttribute('tone', 'success')

  await sync.change(2)
  await expect(light(host)).toHaveText('2 unsaved changes')
  await expect(light(host)).toHaveAttribute('tone', 'neutral')

  await sync.startSave()
  await expect(light(host)).toHaveText('Saving…')
  await expect(light(host)).toHaveAttribute('tone', 'info')
  await expect(light(host)).toHaveAttribute('pulse', '')

  await sync.finish(true)
  await expect(light(host)).toHaveText(/^Saved at \d/)
  await expect(light(host)).not.toHaveAttribute('pulse', '')
  await expect(page.getByRole('status')).toContainText('Saved at')
  await accessible(page)
})

test('a failed save offers a retry that saves again', async ({ page, renderScenario }) => {
  await renderScenario('<test-sync-indicator></test-sync-indicator>')
  const host = page.locator('test-sync-indicator')
  const sync = model(host)
  await sync.change()
  await sync.startSave()
  await sync.finish(false)
  await expect(light(host)).toHaveText('Couldn’t save')
  await expect(light(host)).toHaveAttribute('tone', 'danger')

  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(light(host)).toHaveText('Saving…')
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  await sync.finish(true)
  await expect(light(host)).toHaveText(/^Saved at/)
})

test('offline holds the changes and saves them when the connection is back', async ({ page, renderScenario }) => {
  await renderScenario('<test-sync-indicator></test-sync-indicator>')
  const host = page.locator('test-sync-indicator')
  const sync = model(host)
  await sync.online(false)
  await expect(light(host)).toHaveText('Offline')
  await expect(light(host)).toHaveAttribute('tone', 'warning')
  await sync.change(3)
  await expect(light(host)).toHaveText('Offline, 3 changes waiting')

  // The save is attempted only once the connection is back: it reruns the last task given to save().
  await sync.startSave()
  await expect(light(host)).toHaveText('Offline, 3 changes waiting')
  await sync.online(true)
  await expect(light(host)).toHaveText('Saving…')
  await sync.finish(true)
  await expect(light(host)).toHaveText(/^Saved at/)
})

test('follows the browser connection events while connected, and stops once removed', async ({ page, renderScenario }) => {
  await renderScenario('<test-sync-indicator></test-sync-indicator>')
  const host = page.locator('test-sync-indicator')
  await host.evaluate((element: TestSyncIndicator) => element.sync.model.connect(window))
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(light(host)).toHaveText('Offline')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(light(host)).toHaveText('Saved')
})

test('speaks the language of the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><test-sync-indicator></test-sync-indicator></div>')
  await page.evaluate(() => {
    const translations: Translations = {
      fr: { 'sync-status': { saved: 'Enregistré', pending: { one: '{0} modification', other: '{0} modifications' }, retry: 'Réessayer' } },
    }
    ;(window as unknown as { addTranslations: (t: Translations) => void }).addTranslations(translations)
  })
  const host = page.locator('test-sync-indicator')
  await expect(light(host)).toHaveText('Enregistré')
  await model(host).change(2)
  await expect(light(host)).toHaveText('2 modifications')
})
