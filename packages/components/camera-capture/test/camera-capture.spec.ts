import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { CameraCapture } from '../src/camera-capture'
import type { FakeScene } from './fake-camera'

const camera = (page: Page) => page.locator('c2-camera-capture').first()
const events = async (page: Page) => JSON.parse((await camera(page).getAttribute('data-events')) ?? '[]') as Record<string, unknown>[]

/** Renders the markup and hands every camera the fake source, as an app would hand its own. */
async function render(page: Page, renderScenario: (html: string) => Promise<void>, markup: string, scene: FakeScene = 'steady') {
  await renderScenario(markup)
  await page.evaluate((scene) => {
    window.fakeCamera.scene = scene
    for (const element of document.querySelectorAll('c2-camera-capture')) element.streamSource = window.fakeCamera.source
  }, scene)
}

const setScene = (page: Page, scene: FakeScene) => page.evaluate((scene) => (window.fakeCamera.scene = scene), scene)
const status = (page: Page) => camera(page).evaluate((element: CameraCapture) => element.status)

async function startCamera(page: Page) {
  await page.getByRole('button', { name: 'Start camera' }).click()
  await expect.poll(() => status(page)).toBe('live')
}

test('waits on an idle screen until the user starts the camera', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-camera-capture></c2-camera-capture>')
  await expect(camera(page)).toHaveHostAria('role', 'group')
  await expect(camera(page)).toHaveHostAria('aria-label', 'Camera')
  await expect(camera(page)).toHaveState('idle')
  await expect(page.getByText('Take a photo with your camera.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible()
  // No camera is asked for before the user presses the button.
  expect(await page.evaluate(() => window.fakeCamera.requests.length)).toBe(0)
  await accessible(page)
})

test('starts the back camera, shows the guide and its instruction, and fires camera-start', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-camera-capture guide="card"></c2-camera-capture>')
  await watch(camera(page), 'camera-start')
  await startCamera(page)
  await expect(camera(page)).toHaveState('live')
  expect(await events(page)).toEqual([{ facing: 'environment' }])
  expect(await page.evaluate(() => window.fakeCamera.requests)).toEqual([{ facing: 'environment', width: 1920, height: 1080 }])
  await expect(camera(page).locator('[part="video"]')).toBeVisible()
  await expect(camera(page).locator('[part="guide"]')).toBeVisible()
  await expect(camera(page).locator('[part="hint"]')).toHaveText('Fit the card inside the frame.')
  await expect(page.getByRole('status').filter({ hasText: 'Fit the card inside the frame.' })).toHaveCount(1)
  // A steady, well-lit card turns the guide green.
  await expect(camera(page).locator('.guide--ready')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Take photo' })).toBeEnabled()
  await accessible(page)
})

test('takes a photo, lets the user retake it, then keeps it and finishes', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-camera-capture></c2-camera-capture>')
  await camera(page).evaluate((element: CameraCapture) => {
    const seen: string[] = []
    for (const type of ['capture', 'retake', 'accept', 'complete']) element.addEventListener(type, () => seen.push(type))
    ;(element as HTMLElement & { seen?: string[] }).seen = seen
  })
  await startCamera(page)
  await page.getByRole('button', { name: 'Take photo' }).click()
  await expect(camera(page)).toHaveState('review')
  await expect(page.getByRole('img', { name: 'Photo to review' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Photo taken.' })).toHaveCount(1)
  await accessible(page)

  await page.getByRole('button', { name: 'Retake' }).click()
  await expect(camera(page)).toHaveState('live')
  await page.getByRole('button', { name: 'Take photo' }).click()
  await page.getByRole('button', { name: 'Use photo' }).click()
  await expect(camera(page)).toHaveState('done')
  expect(await camera(page).evaluate((element: CameraCapture) => (element as HTMLElement & { seen?: string[] }).seen)).toEqual([
    'capture',
    'retake',
    'capture',
    'accept',
    'complete',
  ])
  const photos = await camera(page).evaluate((element: CameraCapture) =>
    element.photos.map(({ id, index, blob, width, height }) => ({ id, index, type: blob.type, size: blob.size > 0, width, height })),
  )
  expect(photos).toEqual([{ id: 'photo', index: 0, type: 'image/jpeg', size: true, width: 640, height: 480 }])
  // Finished: the camera is closed, and the summary offers to take the photo again.
  expect(await page.evaluate(() => window.fakeCamera.streams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')))).toBe(true)
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retake Photo 1' })).toBeVisible()
  await accessible(page)
})

test('walks through a list of required shots, each with its guide and camera, and can retake one at the end', async ({ page, renderScenario }) => {
  await render(
    page,
    renderScenario,
    `<c2-camera-capture shots='[{"id":"front","label":"Front of the card","guide":"card"},{"id":"back","label":"Back of the card","guide":"card"},{"id":"selfie","label":"Selfie","guide":"face","facing":"user"}]'></c2-camera-capture>`,
  )
  await watch(camera(page), 'complete')
  const list = page.getByRole('list', { name: 'Photos to take' })
  await expect(list.getByRole('listitem')).toHaveText([/Front of the card/, /Back of the card/, /Selfie/])
  await startCamera(page)
  await expect(list.getByRole('listitem').nth(0)).toHaveAttribute('aria-current', 'step')
  await expect(page.getByRole('status').filter({ hasText: 'Photo 1 of 3: Front of the card' })).toHaveCount(1)

  for (const label of ['Front of the card', 'Back of the card']) {
    await expect(page.getByRole('status').filter({ hasText: `: ${label}` })).toHaveCount(1)
    await page.getByRole('button', { name: 'Take photo' }).click()
    await page.getByRole('button', { name: 'Use photo' }).click()
    await expect.poll(() => status(page)).toBe('live')
  }
  await expect(list.getByRole('listitem').nth(0)).toContainText('taken')
  await expect(list.getByRole('listitem').nth(2)).toHaveAttribute('aria-current', 'step')
  // The selfie opens the front camera, mirrored on screen.
  expect(await page.evaluate(() => window.fakeCamera.requests.map((request) => request.facing))).toEqual(['environment', 'user'])
  await expect(camera(page).locator('.video--mirrored')).toHaveCount(1)
  await expect(camera(page).locator('[part="hint"]')).toHaveText('Centre your face in the oval.')
  await page.getByRole('button', { name: 'Take photo' }).click()
  await page.getByRole('button', { name: 'Use photo' }).click()
  await expect(camera(page)).toHaveState('done')
  const [complete] = await events(page)
  expect((complete.photos as unknown[]).length).toBe(3)
  expect(await camera(page).evaluate((element: CameraCapture) => element.photos.map((photo) => photo.id))).toEqual(['front', 'back', 'selfie'])

  // Retaking the back reopens the back camera on that shot, and finishing again replaces it.
  await page.getByRole('button', { name: 'Retake Back of the card' }).click()
  await expect.poll(() => status(page)).toBe('live')
  await expect(list.getByRole('listitem').nth(1)).toHaveAttribute('aria-current', 'step')
  expect(await page.evaluate(() => window.fakeCamera.requests.at(-1)?.facing)).toBe('environment')
  await page.getByRole('button', { name: 'Take photo' }).click()
  await page.getByRole('button', { name: 'Use photo' }).click()
  await expect(camera(page)).toHaveState('done')
  expect(await events(page)).toHaveLength(2)
  await accessible(page)
})

test('tells the user what is wrong with the picture', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-camera-capture guide="document"></c2-camera-capture>', 'dark')
  await startCamera(page)
  const hint = camera(page).locator('[part="hint"]')
  await expect(hint).toHaveText('More light needed.')
  await expect(hint).toHaveClass(/hint--issue/)
  await expect(camera(page).locator('.guide--ready')).toHaveCount(0)
  await setScene(page, 'glare')
  await expect(hint).toHaveText('Avoid glare: tilt away from the light.')
  await setScene(page, 'moving')
  await expect(hint).toHaveText('Hold the camera steady.')
  await setScene(page, 'steady')
  await expect(hint).toHaveText('Fit the document inside the frame.')
})

test('auto-capture takes the photo once the picture holds steady, and not while it moves', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-camera-capture guide="card" auto-capture steady-time="400"></c2-camera-capture>', 'moving')
  await startCamera(page)
  await expect(camera(page).locator('[part="hint"]')).toHaveText('Hold the camera steady.')
  // Moving for well over the steady time: still live.
  await page.waitForTimeout(800)
  expect(await status(page)).toBe('live')
  await setScene(page, 'steady')
  await expect(camera(page)).toHaveState('review', { timeout: 5000 })
})

test('an app replaces the quality rules through assessFrame', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-camera-capture guide="card"></c2-camera-capture>', 'steady')
  await camera(page).evaluate((element: CameraCapture) => {
    element.assessFrame = (metrics) => (metrics.brightness > 0 ? 'blurry' : 'ready')
  })
  await startCamera(page)
  await expect(camera(page).locator('[part="hint"]')).toHaveText('The picture is blurry: move closer or wait for focus.')
})

test('crop keeps only the area inside the guide', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-camera-capture guide="card" crop></c2-camera-capture>')
  await startCamera(page)
  const photo = await camera(page).evaluate(async (element: CameraCapture) => {
    const taken = await element.capture()
    return taken && { width: taken.width, height: taken.height }
  })
  expect(photo).not.toBeNull()
  expect(photo!.width).toBeLessThan(640)
  expect(photo!.width / photo!.height).toBeCloseTo(1.586, 1)
})

test('shows why the camera did not start, and starts on Try again', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-camera-capture></c2-camera-capture>')
  await page.evaluate(() => (window.fakeCamera.failWith = 'NotAllowedError'))
  await watch(camera(page), 'camera-error')
  await page.getByRole('button', { name: 'Start camera' }).click()
  await expect(camera(page)).toHaveState('error')
  await expect(camera(page).locator('[part="error"]')).toContainText('Camera access was denied. Allow it in the browser settings, then try again.')
  await expect(page.getByRole('status').filter({ hasText: 'Camera access was denied.' })).toHaveCount(1)
  expect((await events(page)).map((detail) => detail.kind)).toEqual(['denied'])
  await accessible(page)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect.poll(() => status(page)).toBe('live')
})

test('without a stream source it asks getUserMedia, and names a missing camera', async ({ page, renderScenario }) => {
  await renderScenario('<c2-camera-capture facing="user"></c2-camera-capture>')
  const constraints = await page.evaluate(() => {
    const seen: MediaStreamConstraints[] = []
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: (request: MediaStreamConstraints) => {
          seen.push(request)
          return Promise.reject(new DOMException('none', 'NotFoundError'))
        },
      },
    })
    ;(window as Window & { seen?: MediaStreamConstraints[] }).seen = seen
    return seen
  })
  expect(constraints).toEqual([])
  await page.getByRole('button', { name: 'Start camera' }).click()
  await expect(camera(page).locator('[part="error"]')).toContainText('No camera was found on this device.')
  expect(await page.evaluate(() => (window as Window & { seen?: MediaStreamConstraints[] }).seen)).toEqual([
    { audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
  ])
})

test('offers to switch camera when the device has two, and switches facing', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-camera-capture></c2-camera-capture>')
  await page.evaluate(() => {
    const devices = [
      { kind: 'videoinput', deviceId: 'back', label: '', groupId: '' },
      { kind: 'videoinput', deviceId: 'front', label: '', groupId: '' },
    ]
    const media = navigator.mediaDevices ?? {}
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: Object.assign(Object.create(media), { enumerateDevices: async () => devices }),
    })
  })
  await startCamera(page)
  await page.getByRole('button', { name: 'Switch camera' }).click()
  await expect.poll(() => status(page)).toBe('live')
  expect(await page.evaluate(() => window.fakeCamera.requests.map((request) => request.facing))).toEqual(['environment', 'user'])
  expect(await camera(page).evaluate((element: CameraCapture) => element.facing)).toBe('user')
  // The first stream is closed when the second opens.
  expect(await page.evaluate(() => window.fakeCamera.streams[0].getTracks().every((track) => track.readyState === 'ended'))).toBe(true)
  await expect(camera(page).locator('.video--mirrored')).toHaveCount(1)
})

test('closes the camera when the element leaves the page', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-camera-capture></c2-camera-capture>')
  await startCamera(page)
  const ended = await camera(page).evaluate((element: CameraCapture) => {
    const stream = element.stream!
    element.remove()
    return stream.getTracks().every((track) => track.readyState === 'ended')
  })
  expect(ended).toBe(true)
})

test('a photo under review is dropped when the element leaves, and the camera can start again', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-camera-capture></c2-camera-capture>')
  await startCamera(page)
  await page.getByRole('button', { name: 'Take photo' }).click()
  await expect(camera(page)).toHaveState('review')
  await camera(page).evaluate(async (element: CameraCapture) => {
    const parent = element.parentElement!
    element.remove()
    parent.append(element)
    await element.updateComplete
  })
  await expect(camera(page)).toHaveState('idle')
  await expect(page.getByRole('img', { name: 'Photo to review' })).toHaveCount(0)
  await startCamera(page)
})

test('a start that was stopped while the browser asked shows no error when the answer is no', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-camera-capture></c2-camera-capture>')
  await page.evaluate(() => {
    window.fakeCamera.failWith = 'NotAllowedError'
    window.fakeCamera.delay = 300
  })
  await watch(camera(page), 'camera-error')
  await page.getByRole('button', { name: 'Start camera' }).click()
  await expect.poll(() => status(page)).toBe('starting')
  await camera(page).evaluate((element: CameraCapture) => element.stop())
  // The refusal arrives after the stop: the element stays idle and says nothing.
  await page.waitForTimeout(500)
  expect(await status(page)).toBe('idle')
  expect(await events(page)).toEqual([])
})

test('a camera that goes away while open shows the error screen', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-camera-capture></c2-camera-capture>')
  await watch(camera(page), 'camera-error')
  await startCamera(page)
  // What the browser does when the camera is unplugged: the track ends by itself.
  await camera(page).evaluate((element: CameraCapture) => element.stream!.getVideoTracks()[0].dispatchEvent(new Event('ended')))
  await expect(camera(page)).toHaveState('error')
  await expect(camera(page).locator('[part="error"]')).toContainText('The camera stopped. Check that it is connected, then try again.')
  expect((await events(page)).map((detail) => detail.kind)).toEqual(['ended'])
  await expect(page.getByRole('button', { name: 'Take photo' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect.poll(() => status(page)).toBe('live')
})

test('a new array with the same shots keeps the photos taken; other shots start over', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-camera-capture shots='[{"id":"front"},{"id":"back"}]'></c2-camera-capture>`)
  await startCamera(page)
  await page.getByRole('button', { name: 'Take photo' }).click()
  await page.getByRole('button', { name: 'Use photo' }).click()
  await expect.poll(() => status(page)).toBe('live')
  // A framework re-rendering passes a new array literal with the same content.
  await camera(page).evaluate(async (element: CameraCapture) => {
    element.shots = [{ id: 'front' }, { id: 'back' }]
    await element.updateComplete
  })
  expect(await camera(page).evaluate((element: CameraCapture) => element.photos.map((photo) => photo.id))).toEqual(['front'])
  await expect(page.getByRole('list', { name: 'Photos to take' }).getByRole('listitem').nth(1)).toHaveAttribute('aria-current', 'step')
  await camera(page).evaluate(async (element: CameraCapture) => {
    element.shots = [{ id: 'receipt' }, { id: 'card' }]
    await element.updateComplete
  })
  expect(await camera(page).evaluate((element: CameraCapture) => element.photos)).toEqual([])
  await expect(page.getByRole('list', { name: 'Photos to take' }).getByRole('listitem').nth(0)).toHaveAttribute('aria-current', 'step')
})

test('each guide keeps its shape whatever the stage, and its events stay on the element', async ({ page, renderScenario }) => {
  await render(
    page,
    renderScenario,
    `<div id="outer"><c2-camera-capture guide="face" style="--c2-camera-capture__stage--aspect-ratio: 16 / 9; --c2-camera-capture__guide__document--aspect-ratio: 2.3"></c2-camera-capture></div>`,
  )
  await page.evaluate(() => {
    ;(window as Window & { bubbled?: number }).bubbled = 0
    for (const type of ['camera-start', 'capture', 'accept', 'complete'])
      document.getElementById('outer')!.addEventListener(type, () => ((window as Window & { bubbled?: number }).bubbled! += 1))
  })
  await startCamera(page)
  const ratio = async () => {
    const box = (await camera(page).locator('[part="guide"]').boundingBox())!
    return box.width / box.height
  }
  expect(await ratio()).toBeCloseTo(0.75, 2)
  await camera(page).evaluate(async (element: CameraCapture) => {
    element.guide = 'document'
    await element.updateComplete
  })
  expect(await ratio()).toBeCloseTo(2.3, 2)
  await page.getByRole('button', { name: 'Take photo' }).click()
  await page.getByRole('button', { name: 'Use photo' }).click()
  await expect(camera(page)).toHaveState('done')
  expect(await page.evaluate(() => (window as Window & { bubbled?: number }).bubbled)).toBe(0)
})

test('is driven from the keyboard', async ({ page, renderScenario, tab }) => {
  await render(page, renderScenario, '<c2-camera-capture></c2-camera-capture>')
  await tab()
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => status(page)).toBe('live')
  await page.getByRole('button', { name: 'Take photo' }).focus()
  await page.keyboard.press('Space')
  await expect(camera(page)).toHaveState('review')
  await tab()
  await expect(page.getByRole('button', { name: 'Retake' })).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: 'Use photo' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(camera(page)).toHaveState('done')
})

test('the slots replace the idle screen and add actions beside the shutter', async ({ page, renderScenario }) => {
  await render(
    page,
    renderScenario,
    `<c2-camera-capture>
      <div slot="idle"><button type="button" id="own-start">Scan the receipt</button></div>
      <button slot="actions" type="button">Upload a file</button>
    </c2-camera-capture>`,
  )
  await expect(page.getByRole('button', { name: 'Start camera' })).toHaveCount(0)
  await page.locator('#own-start').evaluate((button) => button.addEventListener('click', () => button.closest('c2-camera-capture')!.start()))
  await page.getByRole('button', { name: 'Scan the receipt' }).click()
  await expect.poll(() => status(page)).toBe('live')
  await expect(page.getByRole('button', { name: 'Upload a file' })).toBeVisible()
})

test('speaks the language of the page', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<div lang="fr"><c2-camera-capture guide="card"></c2-camera-capture></div>')
  await expect(camera(page)).toHaveHostAria('aria-label', 'Caméra')
  await page.getByRole('button', { name: 'Activer la caméra' }).click()
  await expect(camera(page).locator('[part="hint"]')).toHaveText('Placez la carte dans le cadre.')
  await expect(page.getByRole('button', { name: 'Prendre la photo' })).toBeVisible()
})
