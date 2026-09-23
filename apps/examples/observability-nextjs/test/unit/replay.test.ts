import assert from 'node:assert/strict'
import test from 'node:test'
import { createReplayClock, type ReplayScheduler } from '../../lib/replay/replay-clock.ts'

function manualScheduler() {
  let nextId = 0
  const callbacks = new Map<number, () => void>()
  const scheduler: ReplayScheduler = {
    setInterval(callback) {
      const id = ++nextId
      callbacks.set(id, callback)
      return id
    },
    clearInterval(id) {
      callbacks.delete(id as number)
    },
  }
  return {
    scheduler,
    active: () => callbacks.size,
    tick: () => [...callbacks.values()].forEach((callback) => callback()),
  }
}

test('starts with a paused tick-zero immutable snapshot', () => {
  const clock = createReplayClock({ baselineInstant: '2026-09-21T10:00:00.000Z', stepMs: 5_000 })
  const snapshot = clock.getSnapshot()
  assert.deepEqual(snapshot, { baselineInstant: '2026-09-21T10:00:00.000Z', tick: 0, status: 'paused', stepMs: 5_000 })
  assert.equal(Object.isFrozen(snapshot), true)
  assert.strictEqual(clock.getServerSnapshot(), clock.getInitialSnapshot())
  clock.destroy()
})

test('play creates one timer and advances one deterministic logical tick per callback', () => {
  const manual = manualScheduler()
  const clock = createReplayClock({ baselineInstant: '2026-09-21T10:00:00.000Z', stepMs: 1_000, scheduler: manual.scheduler })
  clock.play()
  clock.play()
  assert.equal(manual.active(), 1)
  manual.tick()
  assert.equal(clock.getSnapshot().tick, 1)
  manual.tick()
  assert.equal(clock.getSnapshot().tick, 2)
  assert.equal(clock.getSnapshot().status, 'playing')
  clock.destroy()
})

test('pause preserves tick while refresh cancels and resets', () => {
  const manual = manualScheduler()
  const clock = createReplayClock({ baselineInstant: '2026-09-21T10:00:00.000Z', stepMs: 1_000, scheduler: manual.scheduler })
  clock.play()
  manual.tick()
  clock.pause()
  assert.equal(manual.active(), 0)
  assert.deepEqual(clock.getSnapshot(), { baselineInstant: '2026-09-21T10:00:00.000Z', tick: 1, status: 'paused', stepMs: 1_000 })
  clock.play()
  clock.refresh()
  assert.equal(manual.active(), 0)
  assert.deepEqual(clock.getSnapshot(), clock.getInitialSnapshot())
  clock.destroy()
})

test('cleanup removes timers and notifications stop', () => {
  const manual = manualScheduler()
  const clock = createReplayClock({ baselineInstant: '2026-09-21T10:00:00.000Z', stepMs: 1_000, scheduler: manual.scheduler })
  let notifications = 0
  clock.subscribe(() => notifications++)
  clock.play()
  manual.tick()
  clock.destroy()
  assert.equal(manual.active(), 0)
  assert.equal(notifications, 2)
  clock.play()
  assert.equal(manual.active(), 0)
})

test('repeating the same command sequence produces identical snapshots', () => {
  const run = () => {
    const manual = manualScheduler()
    const clock = createReplayClock({ baselineInstant: '2026-09-21T10:00:00.000Z', stepMs: 2_500, scheduler: manual.scheduler })
    const sequence = [clock.getSnapshot()]
    clock.play()
    manual.tick()
    sequence.push(clock.getSnapshot())
    manual.tick()
    sequence.push(clock.getSnapshot())
    clock.pause()
    sequence.push(clock.getSnapshot())
    clock.refresh()
    sequence.push(clock.getSnapshot())
    clock.destroy()
    return sequence
  }
  assert.deepEqual(run(), run())
})

test('pauses deterministically at the replay boundary and does not create another timer', () => {
  const manual = manualScheduler()
  const clock = createReplayClock({ baselineInstant: '2026-09-21T10:00:00.000Z', stepMs: 1_000, maxTick: 2, scheduler: manual.scheduler })
  clock.play()
  manual.tick()
  manual.tick()
  assert.deepEqual(clock.getSnapshot(), { baselineInstant: '2026-09-21T10:00:00.000Z', tick: 2, status: 'paused', stepMs: 1_000 })
  assert.equal(manual.active(), 0)
  clock.play()
  assert.equal(manual.active(), 0)
  clock.destroy()
})
