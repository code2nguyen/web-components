import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ToastController } from '../src/toast-controller.ts'

test('bursts queue in order and each toast receives its full visible lifetime', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const removed: string[] = []
  const manager = new ToastController((toast) => removed.push(toast.id))
  manager.maxVisible = 2
  for (let i = 1; i <= 8; i++) manager.show({ id: String(i), message: `Notification ${i}`, duration: 1000 })
  assert.equal(manager.queuedCount, 6)
  context.mock.timers.tick(1000)
  assert.deepEqual(removed, ['1', '2'])
  assert.deepEqual(
    manager.visible.map((toast) => toast.id),
    ['3', '4'],
  )
  context.mock.timers.tick(999)
  assert.equal(removed.length, 2)
  context.mock.timers.tick(1)
  assert.deepEqual(removed, ['1', '2', '3', '4'])
  manager.clear()
})

test('overlapping pause reasons preserve remaining lifetime', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const manager = new ToastController()
  manager.show({ message: 'Pause me', duration: 1000 })
  context.mock.timers.tick(400)
  manager.pause('hover')
  manager.pause('focus')
  context.mock.timers.tick(5000)
  manager.resume('hover')
  context.mock.timers.tick(5000)
  assert.equal(manager.count, 1)
  manager.resume('focus')
  context.mock.timers.tick(599)
  assert.equal(manager.count, 1)
  context.mock.timers.tick(1)
  assert.equal(manager.count, 0)
})

test('stable IDs update without duplication and restart the lifetime', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const manager = new ToastController()
  manager.show({ id: 'save', message: 'Saving', duration: 1000 })
  context.mock.timers.tick(700)
  manager.show({ id: 'save', message: 'Saved', variant: 'success' })
  assert.equal(manager.count, 1)
  assert.equal(manager.visible[0].message, 'Saved')
  context.mock.timers.tick(999)
  assert.equal(manager.count, 1)
  context.mock.timers.tick(1)
  assert.equal(manager.count, 0)
  assert.equal(manager.update('missing', { message: 'Nope' }), false)
})

test('persistent toasts, queued dismissal, clear and timer cleanup', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const reasons: string[] = []
  const manager = new ToastController((_toast, reason) => reasons.push(reason))
  manager.maxVisible = 1
  manager.show({ id: 'persistent', message: 'Stay', duration: 0 })
  manager.show({ id: 'queued', message: 'Later' })
  context.mock.timers.tick(60000)
  assert.equal(manager.count, 2)
  manager.dismiss('queued')
  assert.equal(manager.queuedCount, 0)
  manager.clear()
  context.mock.timers.tick(60000)
  assert.deepEqual(reasons, ['programmatic', 'clear'])
  assert.equal(manager.count, 0)
})

test('reducing capacity pauses hidden entries and reconnect resumes them', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const manager = new ToastController()
  manager.show({ id: 'first', message: 'First', duration: 0 })
  manager.show({ id: 'second', message: 'Second', duration: 1000 })
  context.mock.timers.tick(400)
  manager.maxVisible = 1
  context.mock.timers.tick(5000)
  manager.pause('disconnected')
  manager.maxVisible = 2
  context.mock.timers.tick(5000)
  assert.equal(manager.count, 2)
  manager.resume('disconnected')
  context.mock.timers.tick(599)
  assert.equal(manager.count, 2)
  context.mock.timers.tick(1)
  assert.equal(manager.count, 1)
  manager.clear()
})

test('exit completion frees capacity before the next timeout starts', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  let finishExit!: () => void
  const dismissed: string[] = []
  const manager = new ToastController(
    (toast) => dismissed.push(toast.id),
    () =>
      new Promise<void>((resolve) => {
        finishExit = resolve
      }),
  )
  manager.maxVisible = 1
  manager.show({ id: 'first', message: 'First', duration: 1000 })
  manager.show({ id: 'next', message: 'Next', duration: 1000 })
  context.mock.timers.tick(1000)
  assert.equal(manager.isClosing('first'), true)
  assert.deepEqual(
    manager.visible.map((toast) => toast.id),
    ['first'],
  )
  assert.equal(manager.dismiss('first'), false)
  context.mock.timers.tick(200)
  finishExit()
  await Promise.resolve()
  assert.deepEqual(dismissed, ['first'])
  assert.deepEqual(
    manager.visible.map((toast) => toast.id),
    ['next'],
  )
  context.mock.timers.tick(999)
  assert.equal(manager.isClosing('next'), false)
  context.mock.timers.tick(1)
  assert.equal(manager.isClosing('next'), true)
  finishExit()
  await Promise.resolve()
  assert.equal(manager.count, 0)
})

test('updating a closing toast cancels stale removal', async () => {
  let finishExit!: () => void
  const manager = new ToastController(
    () => {},
    () =>
      new Promise<void>((resolve) => {
        finishExit = resolve
      }),
  )
  manager.show({ id: 'upload', message: 'Uploading', duration: 0 })
  manager.dismiss('upload')
  manager.update('upload', { message: 'Retrying' })
  assert.equal(manager.isClosing('upload'), false)
  finishExit()
  await Promise.resolve()
  assert.equal(manager.visible[0].message, 'Retrying')
  assert.equal(manager.count, 1)
})

test('clear animates only visible items and never promotes queued items', async () => {
  const exits: string[] = []
  const finishes: Array<() => void> = []
  const manager = new ToastController(
    () => {},
    (toast) => {
      exits.push(toast.id)
      return new Promise<void>((resolve) => finishes.push(resolve))
    },
  )
  manager.maxVisible = 2
  for (let i = 0; i < 6; i++) manager.show({ id: String(i), message: 'Notification', duration: 0 })
  manager.clear()
  assert.deepEqual(exits.sort(), ['0', '1'])
  assert.equal(manager.queuedCount, 0)
  assert.equal(manager.count, 2)
  finishes.forEach((finish) => finish())
  await Promise.resolve()
  assert.equal(manager.count, 0)
})

test('cancelled exit promises still complete dismissal', async () => {
  const manager = new ToastController(
    () => {},
    () => Promise.reject(new Error('Animation cancelled')),
  )
  manager.show({ id: 'cancelled', message: 'Message', duration: 0 })
  manager.dismiss('cancelled')
  await Promise.resolve()
  assert.equal(manager.count, 0)
})

test('countdown follows lifetime through pauses, queue promotion, and updates', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const manager = new ToastController()
  manager.maxVisible = 1
  manager.show({ id: 'first', message: 'First', duration: 1000, showProgress: true })
  manager.show({ id: 'queued', message: 'Next', duration: 2000 })
  context.mock.timers.tick(300)
  assert.deepEqual(manager.getTiming('first'), { remaining: 700, duration: 1000, running: true })
  assert.deepEqual(manager.getTiming('queued'), { remaining: 2000, duration: 2000, running: false })
  manager.pause('hover')
  context.mock.timers.tick(5000)
  assert.deepEqual(manager.getTiming('first'), { remaining: 700, duration: 1000, running: false })
  manager.resume('hover')
  context.mock.timers.tick(200)
  assert.equal(manager.getTiming('first')?.remaining, 500)
  manager.update('first', { duration: 1500 })
  assert.equal(manager.getTiming('first')?.remaining, 1500)
  assert.equal(manager.visible[0].showProgress, true)
  manager.dismiss('first')
  assert.deepEqual(manager.getTiming('queued'), { remaining: 2000, duration: 2000, running: true })
  manager.update('queued', { duration: 0 })
  assert.deepEqual(manager.getTiming('queued'), { remaining: 0, duration: 0, running: false })
  manager.clear()
  assert.equal(manager.getTiming('queued'), undefined)
})
