import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  Glide,
  InertiaTracker,
  PinchTracker,
  centerOn,
  clampView,
  clampZoom,
  easeOutCubic,
  fitRect,
  fitZoom,
  interpolateView,
  panBy,
  panZoomKeyAction,
  pinchView,
  prefersReducedMotion,
  revealRect,
  sameView,
  toContentPoint,
  toViewportPoint,
  viewTransform,
  wheelPixels,
  wheelZoomFactor,
  zoomAround,
  type PanZoomView,
} from './pan-zoom.ts'

const viewport = { width: 400, height: 300 }
const close = (actual: number, expected: number, message?: string) => assert.ok(Math.abs(actual - expected) < 1e-6, message ?? `${actual} ≈ ${expected}`)
const closeView = (actual: PanZoomView, expected: PanZoomView) => {
  close(actual.x, expected.x, `x: ${actual.x} ≈ ${expected.x}`)
  close(actual.y, expected.y, `y: ${actual.y} ≈ ${expected.y}`)
  close(actual.zoom, expected.zoom, `zoom: ${actual.zoom} ≈ ${expected.zoom}`)
}

test('content and viewport points convert both ways', () => {
  const view = { x: 100, y: 50, zoom: 2 }
  assert.deepEqual(toContentPoint(view, { x: 40, y: 20 }), { x: 120, y: 60 })
  assert.deepEqual(toViewportPoint(view, { x: 120, y: 60 }), { x: 40, y: 20 })
  assert.equal(viewTransform(view), 'translate(-200px, -100px) scale(2)')
})

test('zooming around a point keeps the content under it still', () => {
  const view = { x: 10, y: 20, zoom: 1.5 }
  const origin = { x: 123, y: 45 }
  const before = toContentPoint(view, origin)
  const after = zoomAround(view, 3, origin)
  assert.equal(after.zoom, 3)
  const point = toContentPoint(after, origin)
  close(point.x, before.x)
  close(point.y, before.y)
})

test('panning moves by viewport pixels whatever the zoom', () => {
  assert.deepEqual(panBy({ x: 0, y: 0, zoom: 2 }, 100, -50), { x: 50, y: -25, zoom: 2 })
  assert.deepEqual(centerOn({ x: 0, y: 0, zoom: 1 }, { x: 500, y: 500 }, viewport, 2), { x: 400, y: 425, zoom: 2 })
})

test('a zoom is held to its limits', () => {
  assert.equal(clampZoom(10, 0.25, 4), 4)
  assert.equal(clampZoom(0.1, 0.25, 4), 0.25)
  assert.equal(clampZoom(1, 5, 4), 4)
})

test('contain fits the whole rectangle with padding, centred, and never zooms past 100%', () => {
  const rect = { x: 0, y: 0, width: 1600, height: 1000 }
  const view = fitRect(rect, viewport, { padding: 20 })
  close(view.zoom, 360 / 1600)
  // Centred: the rectangle's centre is in the middle of the viewport.
  const centre = toViewportPoint(view, { x: 800, y: 500 })
  close(centre.x, 200)
  close(centre.y, 150)
  assert.equal(fitRect({ x: 0, y: 0, width: 100, height: 50 }, viewport, { padding: 20 }).zoom, 1)
  assert.equal(fitRect({ x: 0, y: 0, width: 100, height: 50 }, viewport, { maxZoom: 2 }).zoom, 2)
})

test('cover fills the viewport, width starts at the top, none shows 100%', () => {
  const rect = { x: 0, y: 0, width: 800, height: 1200 }
  close(fitZoom(rect, viewport, 'cover'), 0.5)
  const width = fitRect(rect, viewport, { mode: 'width', padding: 0 })
  close(width.zoom, 0.5)
  close(width.y, 0)
  const padded = fitRect(rect, viewport, { mode: 'width', padding: 20 })
  close(toViewportPoint(padded, { x: 0, y: 0 }).y, 20)
  const none = fitRect(rect, viewport, { mode: 'none' })
  assert.equal(none.zoom, 1)
  closeView(none, { x: 200, y: 450, zoom: 1 })
})

test('clamping centres small content and keeps large content from leaving the viewport', () => {
  const content = { x: 0, y: 0, width: 1000, height: 100 }
  const view = clampView({ x: -500, y: 300, zoom: 1 }, content, viewport)
  // Wider than the viewport: its left edge stops at the viewport's left edge.
  close(view.x, 0)
  // Shorter than the viewport: centred.
  close(view.y, 50 - 150)
  const right = clampView({ x: 5000, y: 0, zoom: 1 }, content, viewport)
  close(right.x, 600)
  const margin = clampView({ x: -500, y: 0, zoom: 2 }, content, viewport, 24)
  close(margin.x, -12)
})

test('revealing pans the least distance and keeps the zoom', () => {
  const view = { x: 0, y: 0, zoom: 2 }
  // Already in view: unchanged.
  assert.equal(revealRect(view, { x: 10, y: 10, width: 20, height: 20 }, viewport, 8), view)
  // Off to the right: its right edge comes to 8px from the viewport's right edge.
  const right = revealRect(view, { x: 300, y: 10, width: 20, height: 20 }, viewport, 8)
  assert.equal(right.zoom, 2)
  close(toViewportPoint(right, { x: 320, y: 0 }).x, 392)
  // Off to the top-left: its corner comes to 8px from the viewport's.
  const left = revealRect(view, { x: -50, y: -40, width: 20, height: 20 }, viewport, 8)
  const corner = toViewportPoint(left, { x: -50, y: -40 })
  close(corner.x, 8)
  close(corner.y, 8)
  // Too large: its start shows.
  const large = revealRect(view, { x: 100, y: 0, width: 400, height: 20 }, viewport, 8)
  close(toViewportPoint(large, { x: 100, y: 0 }).x, 8)
})

test('an animated view starts and ends exactly and zooms geometrically', () => {
  const from = { x: 0, y: 0, zoom: 1 }
  const to = zoomAround(from, 4, { x: 200, y: 150 })
  closeView(interpolateView(from, to, 0, viewport), from)
  closeView(interpolateView(from, to, 1, viewport), to)
  const middle = interpolateView(from, to, 0.5, viewport)
  close(middle.zoom, 2)
  // A pure zoom around the centre keeps the centre still all the way.
  const centre = toContentPoint(middle, { x: 200, y: 150 })
  close(centre.x, 200)
  close(centre.y, 150)
  // Around another origin.
  const origin = { x: 50, y: 60 }
  const target = zoomAround(from, 2, origin)
  const step = interpolateView(from, target, 0.3, viewport, origin)
  const anchor = toContentPoint(step, origin)
  close(anchor.x, 50)
  close(anchor.y, 60)
  assert.equal(easeOutCubic(0), 0)
  assert.equal(easeOutCubic(1), 1)
  assert.ok(easeOutCubic(0.5) > 0.5)
})

test('views compare to within a hundredth of a pixel', () => {
  assert.ok(sameView({ x: 1, y: 1, zoom: 1 }, { x: 1.001, y: 1, zoom: 1 }))
  assert.ok(!sameView({ x: 1, y: 1, zoom: 1 }, { x: 1.1, y: 1, zoom: 1 }))
})

test('the wheel zooms in on a negative delta and reads lines and pages as pixels', () => {
  assert.ok(wheelZoomFactor(-100) > 1)
  assert.ok(wheelZoomFactor(100) < 1)
  close(wheelZoomFactor(100) * wheelZoomFactor(-100), 1)
  assert.equal(wheelPixels(3, 1, 300), 48)
  assert.equal(wheelPixels(1, 2, 300), 300)
  assert.equal(wheelPixels(7, 0, 300), 7)
})

test('keys pan, zoom and fit', () => {
  assert.deepEqual(panZoomKeyAction({ key: 'ArrowRight' }, viewport), { type: 'pan', dx: 48, dy: 0 })
  assert.deepEqual(panZoomKeyAction({ key: 'ArrowUp', shiftKey: true }, viewport), { type: 'pan', dx: 0, dy: -75 })
  assert.deepEqual(panZoomKeyAction({ key: '+' }, viewport), { type: 'zoom-in' })
  assert.deepEqual(panZoomKeyAction({ key: '=', ctrlKey: true }, viewport), { type: 'zoom-in' })
  assert.deepEqual(panZoomKeyAction({ key: '-', metaKey: true }, viewport), { type: 'zoom-out' })
  assert.deepEqual(panZoomKeyAction({ key: '0' }, viewport), { type: 'fit' })
  assert.deepEqual(panZoomKeyAction({ key: '1' }, viewport), { type: 'actual-size' })
  assert.equal(panZoomKeyAction({ key: 'ArrowLeft', ctrlKey: true }, viewport), null)
  assert.equal(panZoomKeyAction({ key: '+', altKey: true }, viewport), null)
  assert.equal(panZoomKeyAction({ key: 'a' }, viewport), null)
})

test('the inertia tracker measures the last moves only', () => {
  const tracker = new InertiaTracker(100)
  tracker.add(0, 0, 0)
  tracker.add(100, 0, 200)
  tracker.add(110, 0, 260)
  tracker.add(130, 20, 280)
  const velocity = tracker.velocity()
  // From the sample at 200 ms on: 30px across and 20px down in 80 ms.
  close(velocity.x, 30 / 80)
  close(velocity.y, 20 / 80)
  // A drag that stopped before the release does not glide.
  assert.deepEqual(tracker.velocity(400), { x: 0, y: 0 })
  tracker.reset()
  assert.deepEqual(tracker.velocity(), { x: 0, y: 0 })
})

test('a glide slows down and travels velocity × time constant', () => {
  const glide = new Glide({ x: 1, y: 0 }, 300)
  let travelled = 0
  let frames = 0
  while (!glide.done && frames < 1000) {
    travelled += glide.step(16).x
    frames++
  }
  assert.ok(frames < 200, `${frames} frames`)
  assert.ok(travelled > 280 && travelled <= 300, `${travelled}px`)
  const stopped = new Glide({ x: 1, y: 1 })
  stopped.stopX()
  stopped.stopY()
  assert.ok(stopped.done)
})

test('a pinch reports its factor and its centre', () => {
  const pinch = new PinchTracker()
  pinch.down(1, 100, 100)
  assert.equal(pinch.move(1, 110, 100), null)
  pinch.down(2, 210, 100)
  assert.equal(pinch.count, 2)
  assert.deepEqual(pinch.center(), { x: 160, y: 100 })
  const step = pinch.move(2, 310, 100)
  assert.ok(step)
  close(step.factor, 2)
  assert.deepEqual(step.from, { x: 160, y: 100 })
  assert.deepEqual(step.to, { x: 210, y: 100 })
  pinch.up(2)
  assert.equal(pinch.move(1, 0, 0), null)
})

test('a pinch step keeps the content under the fingers', () => {
  const view = { x: 0, y: 0, zoom: 1 }
  const step = { factor: 2, from: { x: 100, y: 100 }, to: { x: 150, y: 120 } }
  const next = pinchView(view, step, 0.25, 4)
  assert.equal(next.zoom, 2)
  const under = toContentPoint(next, step.to)
  close(under.x, 100)
  close(under.y, 100)
  assert.equal(pinchView(view, { ...step, factor: 10 }, 0.25, 4).zoom, 4)
})

test('without matchMedia (a server) motion is not reduced', () => {
  assert.equal(prefersReducedMotion(), false)
})
