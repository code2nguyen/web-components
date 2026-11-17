import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SyncStatus, syncStatusTone } from './sync-status.ts'

test('goes from saved to pending, saving and saved again, counting the changes', async () => {
  const status = new SyncStatus({ online: true })
  const states: string[] = []
  status.addEventListener('change', () => states.push(status.state))
  assert.equal(status.state, 'saved')
  status.change()
  status.change(2)
  assert.equal(status.pending, 3)
  let finish!: () => void
  const saving = status.save(() => new Promise<void>((resolve) => (finish = resolve)))
  assert.equal(status.state, 'saving')
  status.change() // made while the save runs: still pending after it
  finish()
  await saving
  assert.equal(status.state, 'pending')
  assert.equal(status.pending, 1)
  assert.ok(status.lastSaved instanceof Date)
  assert.deepEqual(states, ['pending', 'pending', 'saving', 'saving', 'pending'])
})

test('a failed save is an error until a retry succeeds', async () => {
  let attempts = 0
  const status = new SyncStatus({ online: true })
  status.change()
  const task = async () => {
    attempts += 1
    if (attempts === 1) throw new Error('500')
    return 'ok'
  }
  await assert.rejects(status.save(task), /500/)
  assert.equal(status.state, 'error')
  assert.equal((status.error as Error).message, '500')
  await status.retry()
  assert.equal(attempts, 2)
  assert.equal(status.state, 'saved')
  assert.equal(status.error, undefined)
})

test('offline wins, holds the changes, and saves them when the connection is back', async () => {
  const saved: number[] = []
  const status = new SyncStatus({ online: true, backOnlineDuration: 20, retry: async () => void saved.push(status.pending) })
  const target = new EventTarget()
  status.connect(target)
  target.dispatchEvent(new Event('offline'))
  assert.equal(status.state, 'offline')
  status.change(2)
  assert.equal(await status.save(async () => 'never'), undefined)
  assert.equal(status.state, 'offline')
  target.dispatchEvent(new Event('online'))
  assert.equal(status.backOnline, true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(saved, [2])
  assert.equal(status.state, 'saved')
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(status.backOnline, false)
  status.disconnect()
  target.dispatchEvent(new Event('offline'))
  assert.equal(status.online, true)
})

test('maps each state to a status-light tone', () => {
  assert.equal(syncStatusTone('saved'), 'success')
  assert.equal(syncStatusTone('saving'), 'info')
  assert.equal(syncStatusTone('pending'), 'neutral')
  assert.equal(syncStatusTone('offline'), 'warning')
  assert.equal(syncStatusTone('error'), 'danger')
})

test('a new save after a failure shows saving, not the old error', async () => {
  const status = new SyncStatus({ online: true })
  status.change()
  await assert.rejects(
    status.save(async () => {
      throw new Error('500')
    }),
  )
  let finish!: () => void
  const saving = status.save(() => new Promise<void>((resolve) => (finish = resolve)))
  assert.equal(status.state, 'saving')
  finish()
  await saving
  assert.equal(status.state, 'saved')
})

test('disconnecting ends a back online notice whose timer it stops', () => {
  const status = new SyncStatus({ online: false, backOnlineDuration: 60_000, retryWhenOnline: false })
  status.setOnline(true)
  assert.equal(status.backOnline, true)
  status.disconnect()
  assert.equal(status.backOnline, false)
})
