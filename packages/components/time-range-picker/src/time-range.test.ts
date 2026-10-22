// Imports @c2n/core from its build output: run `npm run build -w packages/core` first in a fresh clone.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isRelative, lastSpan, parseDuration, resolveTime, shiftRange, wallClockString, zoomOutRange, type ResolveOptions } from './time-range.ts'

// Wednesday 2026-10-21 10:12:30 in Paris (UTC+2 until the 25th).
const now = Date.UTC(2026, 9, 21, 8, 12, 30)
const paris: ResolveOptions = { now, timeZone: 'Europe/Paris', weekStart: 'monday' }
const utc: ResolveOptions = { now, timeZone: 'UTC', weekStart: 'monday' }
const at = (instant: number | null, zone = 'Europe/Paris') => (instant === null ? null : wallClockString(instant, zone))

test('now with offsets', () => {
  assert.equal(resolveTime('now', paris), now)
  assert.equal(resolveTime('now-15m', paris), now - 15 * 6e4)
  assert.equal(resolveTime('now+1h', paris), now + 36e5)
  assert.equal(at(resolveTime('now-1M', paris)), '2026-09-21T10:12:30')
  assert.equal(at(resolveTime('now - 2d', paris)), '2026-10-19T10:12:30')
})

test('rounding to a unit, down and up', () => {
  assert.equal(at(resolveTime('now/d', paris)), '2026-10-21T00:00')
  assert.equal(at(resolveTime('now/d', { ...paris, roundUp: true })), '2026-10-21T23:59:59')
  assert.equal(at(resolveTime('now-1d/d', paris)), '2026-10-20T00:00')
  assert.equal(at(resolveTime('now/w', paris)), '2026-10-19T00:00')
  assert.equal(at(resolveTime('now/w', { ...paris, weekStart: 'sunday' })), '2026-10-18T00:00')
  assert.equal(at(resolveTime('now/M', paris)), '2026-10-01T00:00')
  assert.equal(at(resolveTime('now/y', paris)), '2026-01-01T00:00')
  assert.equal(at(resolveTime('now/h', utc), 'UTC'), '2026-10-21T08:00')
})

test('a day stays a calendar day across a DST change', () => {
  const after = { ...paris, now: Date.UTC(2026, 9, 26, 9, 0) } // Monday 10:00 CET
  assert.equal(at(resolveTime('now-1d', after)), '2026-10-25T10:00')
  assert.equal(at(resolveTime('now-2d', after)), '2026-10-24T10:00')
})

test('month arithmetic keeps the day inside the month', () => {
  const march31 = { ...utc, now: Date.UTC(2026, 2, 31, 12) }
  assert.equal(at(resolveTime('now-1M', march31), 'UTC'), '2026-02-28T12:00')
})

test('absolute ends', () => {
  assert.equal(at(resolveTime('2026-10-20', paris)), '2026-10-20T00:00')
  assert.equal(at(resolveTime('2026-10-20', { ...paris, roundUp: true })), '2026-10-20T23:59:59')
  assert.equal(resolveTime('2026-10-20T09:00', paris), Date.UTC(2026, 9, 20, 7))
  assert.equal(resolveTime('2026-10-20 09:00', utc), Date.UTC(2026, 9, 20, 9))
  assert.equal(resolveTime('2026-10-20T07:00:00Z', paris), Date.UTC(2026, 9, 20, 7))
  assert.equal(resolveTime('2026-10-20T09:00+02:00', utc), Date.UTC(2026, 9, 20, 7))
})

test('unreadable input', () => {
  for (const text of ['', 'yesterday', 'now-', 'now-5x', 'now--1h', '2026-02-30', '2026-10-20T25:00']) assert.equal(resolveTime(text, paris), null, text)
  assert.equal(isRelative('now-1h'), true)
  assert.equal(isRelative('2026-10-20'), false)
})

test('lastSpan', () => {
  assert.deepEqual(lastSpan('now-15m', 'now'), { amount: 15, unit: 'm' })
  assert.equal(lastSpan('now/d', 'now'), null)
  assert.equal(lastSpan('now-1h', 'now-5m'), null)
})

test('shift moves by one span', () => {
  assert.deepEqual(shiftRange({ from: 'now-1d/d', to: 'now-1d/d' }, -1, utc), { from: '2026-10-19T00:00', to: '2026-10-20T00:00' })
  assert.deepEqual(shiftRange({ from: 'now-1h', to: 'now' }, -1, utc), { from: '2026-10-21T06:12:30', to: '2026-10-21T07:12:30' })
  assert.deepEqual(shiftRange({ from: '2026-10-20T09:00', to: '2026-10-20T10:00' }, 1, utc), { from: '2026-10-20T10:00', to: '2026-10-20T11:00' })
  assert.deepEqual(shiftRange({ from: '2026-10-19', to: '2026-10-20' }, -1, utc), { from: '2026-10-17', to: '2026-10-18' })
})

test('zoom out doubles the span', () => {
  assert.deepEqual(zoomOutRange({ from: 'now-30m', to: 'now' }, utc), { from: 'now-60m', to: 'now' })
  assert.deepEqual(zoomOutRange({ from: 'now/d', to: 'now' }, utc), { from: '2026-10-20T15:47:30', to: 'now' })
  assert.deepEqual(zoomOutRange({ from: '2026-10-20T09:00', to: '2026-10-20T10:00' }, utc), { from: '2026-10-20T08:30', to: '2026-10-20T10:30' })
  assert.deepEqual(zoomOutRange({ from: '2026-10-21T07:00', to: '2026-10-21T08:00' }, utc), { from: '2026-10-21T06:12:30', to: 'now' })
})

test('parseDuration', () => {
  assert.equal(parseDuration('30s'), 30_000)
  assert.equal(parseDuration('5m'), 300_000)
  assert.equal(parseDuration('off'), 0)
})
