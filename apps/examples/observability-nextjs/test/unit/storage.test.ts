import assert from 'node:assert/strict'
import test from 'node:test'
import { createBrowserStore, type StorageLike } from '../../lib/storage/browser-store.ts'
import { createEnvelope, parseEnvelope } from '../../lib/storage/envelope.ts'
import {
  STORAGE_KEYS,
  createAlertOverlayValidator,
  createDashboardLayoutValidator,
  isThemePreference,
  resetDashboardLayout,
  resetDemoData,
} from '../../lib/storage/keys.ts'

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()
  failGet = false
  failSet = false
  failRemove = false

  getItem(key: string) {
    if (this.failGet) throw new DOMException('blocked', 'SecurityError')
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    if (this.failSet) throw new DOMException('full', 'QuotaExceededError')
    this.values.set(key, value)
  }

  removeItem(key: string) {
    if (this.failRemove) throw new DOMException('blocked', 'SecurityError')
    this.values.delete(key)
  }
}

test('creates and validates versioned envelopes', () => {
  const envelope = createEnvelope({ theme: 'dark' as const }, '2026-09-21T10:00:00.000Z')
  assert.deepEqual(envelope, { schemaVersion: 1, updatedAt: '2026-09-21T10:00:00.000Z', data: { theme: 'dark' } })
  assert.deepEqual(parseEnvelope(JSON.stringify(envelope), isThemePreference), envelope)
  assert.equal(parseEnvelope(JSON.stringify({ ...envelope, schemaVersion: 2 }), isThemePreference), null)
  assert.equal(parseEnvelope('{bad json', isThemePreference), null)
})

test('browser stores recover keys independently and use deterministic server snapshots', () => {
  const storage = new MemoryStorage()
  storage.values.set(STORAGE_KEYS.theme, JSON.stringify(createEnvelope({ theme: 'dark' })))
  storage.values.set(STORAGE_KEYS.alerts, '{bad')

  const themeStore = createBrowserStore({
    key: STORAGE_KEYS.theme,
    defaultValue: { theme: 'system' as const },
    validate: isThemePreference,
    storage: () => storage,
  })
  const alertStore = createBrowserStore({
    key: STORAGE_KEYS.alerts,
    defaultValue: { rulesById: {} },
    validate: createAlertOverlayValidator({ serviceIds: ['checkout'], destinationIds: ['primary-on-call'] }),
    storage: () => storage,
  })
  assert.deepEqual(themeStore.getServerSnapshot(), { theme: 'system' })
  assert.deepEqual(themeStore.hydrate(), { theme: 'dark' })
  assert.deepEqual(alertStore.hydrate(), { rulesById: {} })
  assert.equal(storage.values.has(STORAGE_KEYS.alerts), false)
  assert.equal(storage.values.has(STORAGE_KEYS.theme), true)
})

test('browser stores keep in-memory state through quota and security failures', () => {
  const storage = new MemoryStorage()
  const store = createBrowserStore({ key: STORAGE_KEYS.theme, defaultValue: { theme: 'system' as const }, validate: isThemePreference, storage: () => storage })
  storage.failSet = true
  assert.equal(store.set({ theme: 'light' }), false)
  assert.deepEqual(store.getSnapshot(), { theme: 'light' })
  storage.failGet = true
  assert.deepEqual(store.hydrate(), { theme: 'light' })
})

test('dashboard validation requires an exact permutation and supported sizes', () => {
  const validate = createDashboardLayoutValidator({ panelSizes: { traffic: ['small', 'medium'], latency: ['medium', 'large'] } })
  assert.equal(validate({ breakpoint: 'desktop', orderedPanelIds: ['latency', 'traffic'], sizes: { traffic: 'small', latency: 'large' } }), true)
  assert.equal(validate({ breakpoint: 'desktop', orderedPanelIds: ['traffic', 'traffic'], sizes: { traffic: 'small', latency: 'large' } }), false)
  assert.equal(validate({ breakpoint: 'desktop', orderedPanelIds: ['traffic'], sizes: { traffic: 'small' } }), false)
  assert.equal(validate({ breakpoint: 'desktop', orderedPanelIds: ['traffic', 'latency'], sizes: { traffic: 'large', latency: 'medium' } }), false)
})

test('alert overlays reject invalid records without accepting external destinations', () => {
  const validate = createAlertOverlayValidator({ serviceIds: ['checkout'], destinationIds: ['primary-on-call'] })
  const validRule = {
    id: 'local-1',
    name: 'Checkout latency',
    signal: 'latency',
    serviceIds: ['checkout'],
    operator: 'above',
    threshold: 500,
    evaluationWindowMinutes: 5,
    severity: 'critical',
    owner: 'Payments team',
    destinationIds: ['primary-on-call'],
    enabled: true,
    origin: 'local',
  }
  assert.equal(validate({ rulesById: { 'local-1': validRule } }), true)
  assert.equal(validate({ rulesById: { 'local-1': { ...validRule, destinationIds: ['https://real.example/hook'] } } }), false)
})

test('reset boundaries clear only owned keys', () => {
  const storage = new MemoryStorage()
  for (const key of Object.values(STORAGE_KEYS)) storage.values.set(key, '{}')

  assert.equal(resetDemoData(storage), true)
  assert.equal(storage.values.has(STORAGE_KEYS.alerts), false)
  assert.equal(storage.values.has(STORAGE_KEYS.theme), true)
  assert.equal(storage.values.has(STORAGE_KEYS.dashboardDesktop), true)

  assert.equal(resetDashboardLayout(storage), true)
  assert.equal(storage.values.has(STORAGE_KEYS.dashboardDesktop), false)
  assert.equal(storage.values.has(STORAGE_KEYS.dashboardTablet), false)
  assert.equal(storage.values.has(STORAGE_KEYS.theme), true)
})
