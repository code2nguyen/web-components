import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { BarcodeScanner } from '../src/barcode-scanner'

const scanner = (page: Page) => page.locator('c2-barcode-scanner').first()
const events = async (page: Page) => JSON.parse((await scanner(page).getAttribute('data-events')) ?? '[]') as Record<string, unknown>[]
const status = (page: Page) => scanner(page).evaluate((element: BarcodeScanner) => element.status)

type Decoder = 'fake' | 'fallback' | 'none'

/**
 * Renders the markup and hands every scanner the fake camera. `fake` also hands it a decoder that "reads" whatever
 * `window.label` holds, and records each picture it was given; `fallback` hides the browser's BarcodeDetector, so the
 * bundled fallback reads the picture; `none` leaves the built-in decoder as the browser has it.
 */
async function render(page: Page, renderScenario: (html: string) => Promise<void>, markup: string, decoder: Decoder = 'fake') {
  await renderScenario(markup)
  await page.evaluate((decoder) => {
    const state = window as unknown as { label: { value: string; format: string } | null; frames: { width: number; height: number; formats: string[] }[] }
    state.label = { value: '4006381333931', format: 'ean_13' }
    state.frames = []
    if (decoder === 'fallback') delete (window as { BarcodeDetector?: unknown }).BarcodeDetector
    for (const element of document.querySelectorAll('c2-barcode-scanner')) {
      element.streamSource = window.fakeBarcodeCamera.source
      if (decoder === 'fake')
        element.decoder = (frame, { formats }) => {
          state.frames.push({ width: frame.width, height: frame.height, formats: [...formats] })
          return state.label ? [{ ...state.label, corners: [{ x: 0, y: 0 }] }] : []
        }
    }
  }, decoder)
}

const setLabel = (page: Page, label: { value: string; format: string } | null) =>
  page.evaluate((label) => ((window as unknown as { label: unknown }).label = label), label)
const frames = (page: Page) => page.evaluate(() => (window as unknown as { frames: { width: number; height: number; formats: string[] }[] }).frames)
const cameraClosed = (page: Page) =>
  page.evaluate(() => window.fakeBarcodeCamera.streams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')))

test('waits on an idle screen until the user starts the camera', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner></c2-barcode-scanner>')
  await expect(scanner(page)).toHaveHostAria('role', 'group')
  await expect(scanner(page)).toHaveHostAria('aria-label', 'Barcode scanner')
  await expect(scanner(page)).toHaveState('idle')
  await expect(page.getByText('Scan a barcode or a QR code with your camera.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible()
  // No camera is asked for before the user presses the button, and the empty bar under the picture takes no room.
  expect(await page.evaluate(() => window.fakeBarcodeCamera.requests.length)).toBe(0)
  await expect(scanner(page).locator('[part="controls"]')).toBeHidden()
  await accessible(page)
})

test('reads a code, fires scan, closes the camera and shows the code with Scan again', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner></c2-barcode-scanner>')
  await setLabel(page, null)
  await watch(scanner(page), 'scan')
  // The keyboard starts it as a click does.
  await page.getByRole('button', { name: 'Start camera' }).focus()
  await page.keyboard.press('Enter')
  await expect(scanner(page)).toHaveState('scanning')
  expect(await page.evaluate(() => window.fakeBarcodeCamera.requests)).toEqual([{ facing: 'environment', width: 1280, height: 720 }])
  await expect(scanner(page).locator('[part="window"]')).toBeVisible()
  await expect(scanner(page).locator('[part="hint"]')).toHaveText('Point the camera at a code.')
  await expect(page.getByRole('status').filter({ hasText: 'Point the camera at a code.' })).toHaveCount(1)
  await accessible(page)
  // Nothing to read yet: it keeps looking.
  await expect.poll(async () => (await frames(page)).length).toBeGreaterThan(2)
  expect(await events(page)).toEqual([])

  // The Start camera button went away with its screen: focus stays in the component, on the picture.
  expect(await scanner(page).evaluate((element) => element.shadowRoot!.activeElement?.getAttribute('part'))).toBe('stage')

  await setLabel(page, { value: '4006381333931', format: 'ean_13' })
  await expect(scanner(page)).toHaveState('done')
  // And moves to Scan again when the code is read, so the next scan is one key press away.
  await expect(page.getByRole('button', { name: 'Scan again' })).toBeFocused()
  const [scan] = await events(page)
  expect(scan.value).toBe('4006381333931')
  expect(scan.format).toBe('ean_13')
  // The corner the decoder gave is moved from the window's picture to the camera frame: the window is in its middle.
  const [corner] = scan.corners as { x: number; y: number }[]
  expect(corner.x).toBeGreaterThan(100)
  expect(corner.y).toBeGreaterThan(40)
  expect(await events(page)).toHaveLength(1)
  expect(await cameraClosed(page)).toBe(true)
  await expect(scanner(page).locator('[part="value"]')).toHaveText('4006381333931')
  await expect(scanner(page).locator('[part="format"]')).toHaveText('EAN-13')
  await expect(page.getByRole('status').filter({ hasText: 'Scanned: 4006381333931' })).toHaveCount(1)
  expect(await scanner(page).evaluate((element: BarcodeScanner) => element.result?.value)).toBe('4006381333931')
  await accessible(page)

  await setLabel(page, null)
  await page.keyboard.press('Enter')
  await expect(scanner(page)).toHaveState('scanning')
  expect(await scanner(page).evaluate((element: BarcodeScanner) => element.result)).toBeUndefined()
})

test('continuous keeps the camera open: one scan per code, again for a new code or after the code left the picture', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner continuous repeat-delay="400"></c2-barcode-scanner>')
  await watch(scanner(page), 'scan')
  await scanner(page).evaluate((element: BarcodeScanner) => element.start())
  await expect(scanner(page).locator('[part="result"]')).toHaveText('4006381333931')
  await expect(scanner(page).locator('.window--found')).toHaveCount(1)
  // The code stays in the window for well over the repeat delay: still one scan, and the camera is still open.
  await page.waitForTimeout(900)
  expect(await events(page)).toHaveLength(1)
  expect(await status(page)).toBe('scanning')
  expect(await cameraClosed(page)).toBe(false)

  await setLabel(page, { value: 'PALLET-7', format: 'code_128' })
  await expect(scanner(page).locator('[part="result"]')).toHaveText('PALLET-7')
  expect((await events(page)).map((scan) => scan.value)).toEqual(['4006381333931', 'PALLET-7'])
  await expect(page.getByRole('status').filter({ hasText: 'Scanned: PALLET-7' })).toHaveCount(1)

  // Taken away, then shown again after the delay: the same code counts again.
  await setLabel(page, null)
  await page.waitForTimeout(600)
  await setLabel(page, { value: 'PALLET-7', format: 'code_128' })
  await expect.poll(async () => (await events(page)).length).toBe(3)
  await accessible(page)

  // Turning continuous off finishes on the code already read.
  await scanner(page).evaluate((element: BarcodeScanner) => (element.continuous = false))
  await expect(scanner(page)).toHaveState('done')
  expect(await cameraClosed(page)).toBe(true)
})

test('hands the decoder the formats asked for and only the picture inside the window', async ({ page, renderScenario }) => {
  await render(
    page,
    renderScenario,
    `<c2-barcode-scanner continuous formats="ean_13;upc_a" style="--c2-barcode-scanner__window--aspect-ratio: 2.4; --c2-barcode-scanner__window--width: 80%"></c2-barcode-scanner>`,
  )
  await scanner(page).evaluate((element: BarcodeScanner) => element.start())
  await expect.poll(async () => (await frames(page)).length).toBeGreaterThan(0)
  const [frame] = await frames(page)
  expect(frame.formats).toEqual(['ean_13', 'upc_a'])
  expect(frame.width / frame.height).toBeCloseTo(2.4, 1)
  // 80% of the 640 pixel frame.
  expect(frame.width).toBeGreaterThan(480)
  expect(frame.width).toBeLessThan(540)
})

test('the built-in fallback reads a printed 1D code and a 2D code without the browser detector', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner continuous></c2-barcode-scanner>', 'fallback')
  await watch(scanner(page), 'scan')
  await scanner(page).evaluate((element: BarcodeScanner) => element.start())
  await expect.poll(async () => (await events(page)).length, { timeout: 15000 }).toBe(1)
  expect((await events(page))[0]).toMatchObject({ value: 'C2N-12345', format: 'code_128' })
  await page.evaluate(() => (window.fakeBarcodeCamera.code = { value: 'Hello c2n', format: 'datamatrix' }))
  await expect.poll(async () => (await events(page)).length, { timeout: 15000 }).toBe(2)
  const [, matrix] = await events(page)
  expect(matrix).toMatchObject({ value: 'Hello c2n', format: 'data_matrix' })
  expect((matrix.corners as unknown[]).length).toBeGreaterThan(1)
})

test('formats narrows what the fallback reads', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner continuous formats="data_matrix"></c2-barcode-scanner>', 'fallback')
  await watch(scanner(page), 'scan')
  await scanner(page).evaluate((element: BarcodeScanner) => element.start())
  // A Code 128 is in the picture, but only Data Matrix is asked for.
  await page.waitForTimeout(1200)
  expect(await events(page)).toEqual([])
  await page.evaluate(() => (window.fakeBarcodeCamera.code = { value: 'LOT 42', format: 'datamatrix' }))
  await expect.poll(async () => (await events(page)).length, { timeout: 15000 }).toBe(1)
  expect((await events(page))[0]).toMatchObject({ value: 'LOT 42', format: 'data_matrix' })
})

test("uses the browser's BarcodeDetector when it knows the formats, and the fallback when it does not", async ({ page, renderScenario }) => {
  await render(
    page,
    renderScenario,
    '<c2-barcode-scanner formats="qr_code"></c2-barcode-scanner><c2-barcode-scanner formats="code_128"></c2-barcode-scanner>',
    'none',
  )
  await page.evaluate(() => {
    const seen: string[][] = []
    ;(window as unknown as { detectors: string[][] }).detectors = seen
    ;(window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
      static getSupportedFormats = async () => ['qr_code', 'ean_13']
      constructor(options?: { formats?: string[] }) {
        seen.push(options?.formats ?? [])
      }
      detect = async () => [{ rawValue: 'https://example.com/t/81', format: 'qr_code', cornerPoints: [{ x: 4, y: 4 }] }]
    }
  })
  const [native, other] = [page.locator('c2-barcode-scanner').nth(0), page.locator('c2-barcode-scanner').nth(1)]
  await watch(native, 'scan')
  await watch(other, 'scan')
  await native.evaluate((element: BarcodeScanner) => element.start())
  await expect(native).toHaveState('done')
  expect(JSON.parse((await native.getAttribute('data-events'))!)[0]).toMatchObject({ value: 'https://example.com/t/81', format: 'qr_code' })
  // A value that is an address is shown as text, never as a link.
  await expect(native.locator('[part="value"]')).toHaveText('https://example.com/t/81')
  await expect(native.locator('a')).toHaveCount(0)
  // The detector does not know Code 128: the second scanner reads the printed label with the fallback.
  await other.evaluate((element: BarcodeScanner) => element.start())
  await expect(other).toHaveState('done', { timeout: 15000 })
  expect(JSON.parse((await other.getAttribute('data-events'))!)[0]).toMatchObject({ value: 'C2N-12345', format: 'code_128' })
  expect(await page.evaluate(() => (window as unknown as { detectors: string[][] }).detectors)).toEqual([['qr_code']])
})

test('shows why the camera did not start, and why nothing can read a barcode', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner></c2-barcode-scanner>')
  await watch(scanner(page), 'camera-error')
  await scanner(page).evaluate((element: BarcodeScanner) => {
    element.streamSource = () => Promise.reject(new DOMException('no', 'NotAllowedError'))
  })
  await page.getByRole('button', { name: 'Start camera' }).click()
  await expect(scanner(page)).toHaveState('error')
  await expect(scanner(page).locator('[part="error"]')).toContainText('Camera access was denied. Allow it in the browser settings, then try again.')
  await expect(page.getByRole('status').filter({ hasText: 'Camera access was denied.' })).toHaveCount(1)
  await accessible(page)

  // The camera works now, but the decoder reports that nothing here reads barcodes.
  await scanner(page).evaluate((element: BarcodeScanner) => {
    element.streamSource = window.fakeBarcodeCamera.source
    element.decoder = () => Promise.reject(Object.assign(new Error('No decoder here'), { name: 'BarcodeDecoderUnavailableError' }))
  })
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(scanner(page).locator('[part="error"]')).toContainText('Barcodes cannot be read in this browser.')
  expect((await events(page)).map((detail) => detail.kind)).toEqual(['denied', 'decoder'])
  expect(await cameraClosed(page)).toBe(true)
})

test('a decoder that fails on one picture reads the next', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner></c2-barcode-scanner>')
  await watch(scanner(page), 'scan')
  await scanner(page).evaluate((element: BarcodeScanner) => {
    let calls = 0
    element.decoder = () => {
      if (++calls < 3) throw new Error('bad frame')
      return [{ value: 'OK', format: 'code_39' }]
    }
    return element.start()
  })
  await expect(scanner(page)).toHaveState('done')
  expect(await events(page)).toEqual([{ value: 'OK', format: 'code_39' }])
  await expect(scanner(page).locator('[part="format"]')).toHaveText('Code 39')
})

test('the light button shows on a camera with a torch and drives it', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner continuous></c2-barcode-scanner>')
  await setLabel(page, null)
  await page.evaluate(() => (window.fakeBarcodeCamera.hasTorch = true))
  await scanner(page).evaluate((element: BarcodeScanner) => element.start())
  const light = page.getByRole('button', { name: 'Light' })
  await expect(light).toHaveAttribute('aria-pressed', 'false')
  await light.click()
  await expect(light).toHaveAttribute('aria-pressed', 'true')
  expect(await scanner(page).evaluate((element: BarcodeScanner) => element.torch)).toBe(true)
  // WebKit does not focus a button on click.
  await light.focus()
  await page.keyboard.press('Space')
  await expect(light).toHaveAttribute('aria-pressed', 'false')
  expect(await page.evaluate(() => window.fakeBarcodeCamera.torch)).toEqual([false, true, false])
  await accessible(page)
})

test('a camera without a torch shows no light button', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner continuous torch></c2-barcode-scanner>')
  await setLabel(page, null)
  await scanner(page).evaluate((element: BarcodeScanner) => element.start())
  await expect(scanner(page)).toHaveState('scanning')
  await expect(page.getByRole('button', { name: 'Light' })).toHaveCount(0)
  await expect(scanner(page).locator('[part="controls"]')).toBeHidden()
})

test('beep sounds once per scan, and not without the attribute', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner beep></c2-barcode-scanner><c2-barcode-scanner></c2-barcode-scanner>')
  // A stand-in for the sound output: a machine without an audio device (CI) must not decide this test.
  await page.evaluate(() => {
    let beeps = 0
    const node = { connect: () => node, start() {}, stop() {}, frequency: { value: 0 }, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }
    ;(window as unknown as { AudioContext: unknown }).AudioContext = class {
      state = 'running'
      currentTime = 0
      destination = {}
      createOscillator() {
        beeps++
        return node
      }
      createGain = () => node
      resume = async () => undefined
      close = async () => undefined
    }
    Object.defineProperty(window, 'beeps', { get: () => beeps })
  })
  for (const index of [0, 1]) {
    await page
      .locator('c2-barcode-scanner')
      .nth(index)
      .evaluate((element: BarcodeScanner) => element.start())
    await expect(page.locator('c2-barcode-scanner').nth(index)).toHaveState('done')
  }
  expect(await page.evaluate(() => (window as unknown as { beeps: number }).beeps)).toBe(1)
})

test('scanImage reads a still picture and fires scan', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner></c2-barcode-scanner>', 'fallback')
  await watch(scanner(page), 'scan')
  const codes = await scanner(page).evaluate(async (element: BarcodeScanner) => element.scanImage(await window.fakeBarcodeCamera.picture()))
  expect(codes).toHaveLength(1)
  expect(codes[0]).toMatchObject({ value: 'C2N-12345', format: 'code_128' })
  expect(await events(page)).toHaveLength(1)
  await expect(scanner(page)).toHaveState('done')
  await expect(scanner(page).locator('[part="value"]')).toHaveText('C2N-12345')
})

test('an app replaces the idle and done screens, the window drawing, and fills the action zone', async ({ page, renderScenario }) => {
  await render(
    page,
    renderScenario,
    `<c2-barcode-scanner>
      <button slot="idle" type="button" id="go">Scan a ticket</button>
      <span slot="window" id="reticle"></span>
      <p slot="done">Ticket checked in</p>
      <button slot="actions" type="button">Type the code</button>
    </c2-barcode-scanner>`,
  )
  await setLabel(page, null)
  await expect(page.getByRole('button', { name: 'Start camera' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Type the code' })).toBeVisible()
  await page.evaluate(() => document.querySelector('#go')!.addEventListener('click', () => document.querySelector('c2-barcode-scanner')!.start()))
  await page.getByRole('button', { name: 'Scan a ticket' }).click()
  await expect(scanner(page)).toHaveState('scanning')
  await expect(page.locator('#reticle')).toBeVisible()
  await expect(scanner(page).locator('[part="frame"]')).toBeHidden()
  await setLabel(page, { value: 'T-81', format: 'qr_code' })
  await expect(page.getByText('Ticket checked in')).toBeVisible()
  await expect(scanner(page).locator('[part="value"]')).toHaveCount(0)
  await accessible(page)
})

test('stops reading while it is scrolled out of view, and closes the camera when it leaves the page', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner continuous></c2-barcode-scanner><div id="spacer" style="height: 300vh"></div>')
  await setLabel(page, null)
  await scanner(page).evaluate((element: BarcodeScanner) => element.start())
  await expect.poll(async () => (await frames(page)).length).toBeGreaterThan(1)
  await page.locator('#spacer').evaluate((element) => element.scrollIntoView({ block: 'end' }))
  await page.waitForTimeout(400)
  const paused = (await frames(page)).length
  await page.waitForTimeout(600)
  expect((await frames(page)).length).toBe(paused)
  expect(await status(page)).toBe('scanning')
  await scanner(page).evaluate((element) => element.scrollIntoView())
  await expect.poll(async () => (await frames(page)).length).toBeGreaterThan(paused)

  await scanner(page).evaluate((element) => element.remove())
  expect(await cameraClosed(page)).toBe(true)
})

test('stop() closes the camera and goes back to the idle screen', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner continuous></c2-barcode-scanner>')
  await setLabel(page, null)
  await scanner(page).evaluate((element: BarcodeScanner) => element.start())
  await expect(scanner(page)).toHaveState('scanning')
  await scanner(page).evaluate((element: BarcodeScanner) => element.stop())
  await expect(scanner(page)).toHaveState('idle')
  expect(await cameraClosed(page)).toBe(true)
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible()
})

test('draws its text in the language of the page', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<div lang="fr"><c2-barcode-scanner></c2-barcode-scanner></div>')
  await expect(scanner(page)).toHaveHostAria('aria-label', 'Lecteur de codes-barres')
  await expect(page.getByText('Scannez un code-barres ou un QR code avec votre caméra.')).toBeVisible()
  await setLabel(page, null)
  await page.getByRole('button', { name: 'Activer la caméra' }).click()
  await expect(scanner(page).locator('[part="hint"]')).toHaveText('Visez un code avec la caméra.')
  await setLabel(page, { value: '96385074', format: 'ean_8' })
  await expect(page.getByRole('status').filter({ hasText: 'Code lu : 96385074' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Scanner à nouveau' })).toBeVisible()
})

test('two codes in the window each fire once, however the decoder orders them', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner continuous repeat-delay="5000"></c2-barcode-scanner>')
  await watch(scanner(page), 'scan')
  await scanner(page).evaluate((element: BarcodeScanner) => {
    let flip = false
    const codes = [
      { value: '4006381333931', format: 'ean_13' },
      { value: 'https://example.com/p/1', format: 'qr_code' },
    ]
    element.decoder = () => {
      flip = !flip
      return flip ? codes : [...codes].reverse()
    }
    return element.start()
  })
  await expect.poll(async () => (await events(page)).length).toBe(2)
  await page.waitForTimeout(800)
  expect((await events(page)).map((scan) => scan.value).sort()).toEqual(['4006381333931', 'https://example.com/p/1'])
})

test('a fallback that failed to load is loaded again on Try again', async ({ page, renderScenario, browserName }) => {
  // Chromium remembers a module that failed to load for the life of the page, so only a reload helps there; it is
  // also the engine that has the browser's own detector.
  test.skip(browserName === 'chromium')
  await render(page, renderScenario, '<c2-barcode-scanner></c2-barcode-scanner>', 'fallback')
  // The lazy chunk does not arrive the first time.
  let blocked = 0
  await page.route(/zxing-decoder/, (route) => (blocked++ ? route.continue() : route.abort()))
  await watch(scanner(page), 'scan')
  await page.getByRole('button', { name: 'Start camera' }).click()
  await expect(scanner(page).locator('[part="error"]')).toContainText('Barcodes cannot be read in this browser.')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(scanner(page)).toHaveState('done', { timeout: 15000 })
  expect((await events(page))[0]).toMatchObject({ value: 'C2N-12345', format: 'code_128' })
})

test('started before it is on the page, it opens the camera once it is there', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<div id="host"></div>')
  await page.evaluate(() => {
    const element = document.createElement('c2-barcode-scanner')
    element.streamSource = window.fakeBarcodeCamera.source
    element.decoder = () => []
    void element.start()
    document.querySelector('#host')!.append(element)
  })
  await expect(scanner(page)).toHaveState('scanning')
})

test('warns about a format name the built-in decoder does not know', async ({ page, renderScenario }) => {
  const warnings: string[] = []
  page.on('console', (message) => message.type() === 'warning' && warnings.push(message.text()))
  await render(page, renderScenario, '<c2-barcode-scanner continuous formats="ean13"></c2-barcode-scanner>', 'fallback')
  await scanner(page).evaluate((element: BarcodeScanner) => element.start())
  await expect.poll(() => warnings.filter((text) => text.includes('unknown format "ean13"')).length).toBe(1)
})

test('the icons of the light button can be replaced', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '<c2-barcode-scanner continuous><span slot="torch-icon" id="bulb">*</span></c2-barcode-scanner>')
  await setLabel(page, null)
  await page.evaluate(() => (window.fakeBarcodeCamera.hasTorch = true))
  await scanner(page).evaluate((element: BarcodeScanner) => element.start())
  await expect(page.getByRole('button', { name: 'Light' })).toBeVisible()
  await expect(page.locator('#bulb')).toBeVisible()
})
