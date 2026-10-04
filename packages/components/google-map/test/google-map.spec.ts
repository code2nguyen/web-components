import type { Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'
import type { FakeGoogleLog } from './fake-google'

const EVENTS = ['map-ready', 'map-click', 'view-change', 'map-error', 'marker-click', 'marker-drag-end', 'route-change', 'route-error']

type Recorded = { type: string; target: string; detail: Record<string, unknown> }
type Scope = { fakeGoogle: FakeGoogleLog; events: Recorded[] }

test.beforeEach(async ({ page }) => {
  // The events do not bubble, but a capturing listener on the document still sees every one of them.
  await page.addInitScript((names) => {
    const scope = window as unknown as { events: unknown[] }
    scope.events = []
    for (const type of names) {
      document.addEventListener(
        type,
        (event) => {
          const { route: _route, map: _map, panorama: _panorama, ...detail } = ((event as CustomEvent).detail ?? {}) as Record<string, unknown>
          scope.events.push({ type, target: (event.target as Element).localName, detail })
        },
        true,
      )
    }
  }, EVENTS)
})

const events = (page: Page, type: string) =>
  page.evaluate((name) => (window as unknown as Scope).events.filter((event) => event.type === name).map(({ target, detail }) => ({ target, detail })), type)

const fake = <T>(page: Page, read: (log: FakeGoogleLog) => T) =>
  page.evaluate((source) => new Function('log', `return (${source})(log)`)((window as unknown as Scope).fakeGoogle), read.toString()) as Promise<T>

test.describe('c2-google-map', () => {
  test('creates the map from its attributes and the page colour scheme', async ({ page, renderScenario }) => {
    await renderScenario(
      `<c2-google-map style="color-scheme: dark" center="10.5,106.25" zoom="14" map-type="satellite" gesture-handling="cooperative"></c2-google-map>`,
    )
    await expect.poll(() => events(page, 'map-ready')).toHaveLength(1)
    const options = await fake(page, (log) => log.maps[0].options)
    expect(options).toMatchObject({
      center: { lat: 10.5, lng: 106.25 },
      zoom: 14,
      mapId: 'DEMO_MAP_ID',
      mapTypeId: 'satellite',
      gestureHandling: 'cooperative',
      colorScheme: 'DARK',
      disableDefaultUI: false,
    })
    await expect(page.locator('c2-google-map').getByRole('status')).toHaveCount(0)
  })

  test('shows the world without a centre and follows the system colour scheme by default', async ({ page, renderScenario }) => {
    await renderScenario(`<c2-google-map map-id="my-map"></c2-google-map>`)
    await expect.poll(() => fake(page, (log) => log.maps.length)).toBe(1)
    expect(await fake(page, (log) => log.maps[0].options)).toMatchObject({
      center: { lat: 20, lng: 0 },
      zoom: 2,
      mapId: 'my-map',
      colorScheme: 'FOLLOW_SYSTEM',
    })
  })

  test('reports a click on the map with its coordinate', async ({ page, renderScenario }) => {
    await renderScenario(`<c2-google-map center="1,1"></c2-google-map>`)
    await expect.poll(() => events(page, 'map-ready')).toHaveLength(1)
    await page.locator('[data-fake-map]').click({ position: { x: 150, y: 40 } })
    await expect.poll(() => events(page, 'map-click')).toEqual([{ target: 'c2-google-map', detail: { lat: 4, lng: 15 } }])
  })

  test('moves the map when center or zoom change, and reports the view it settles on', async ({ page, renderScenario }) => {
    await renderScenario(`<c2-google-map center="1,1" zoom="5"></c2-google-map>`)
    await expect.poll(() => events(page, 'view-change')).toHaveLength(1)
    await page.locator('c2-google-map').evaluate((map) => {
      map.setAttribute('center', '3,4')
      map.setAttribute('zoom', '9')
    })
    await expect.poll(async () => (await events(page, 'view-change')).at(-1)?.detail).toMatchObject({ center: { lat: 3, lng: 4 }, zoom: 9 })
    expect(await fake(page, (log) => ({ center: log.maps[0].center, zoom: log.maps[0].zoom }))).toEqual({ center: { lat: 3, lng: 4 }, zoom: 9 })
  })

  test('passes other map options through', async ({ page, renderScenario }) => {
    await renderScenario(`<c2-google-map center="1,1"></c2-google-map>`)
    await expect.poll(() => events(page, 'map-ready')).toHaveLength(1)
    await page.locator('c2-google-map').evaluate((map) => {
      ;(map as HTMLElement & { options: object }).options = { streetViewControl: false }
      map.toggleAttribute('disable-default-ui', true)
    })
    await expect.poll(() => fake(page, (log) => log.maps[0].options)).toMatchObject({ streetViewControl: false, disableDefaultUI: true })
  })

  /** Turns the fake off and serves it from the Maps script URL instead, recording every request for that script. */
  const serveGoogle = async (page: Page) => {
    await page.addInitScript(() => ((window as unknown as { noFakeGoogle: boolean }).noFakeGoogle = true))
    const requests: URL[] = []
    await page.route('https://maps.googleapis.com/**', (route) => {
      requests.push(new URL(route.request().url()))
      return route.fulfill({
        contentType: 'text/javascript',
        body: `window.installFakeGoogle(); window[new URL(document.currentScript.src).searchParams.get('callback')]()`,
      })
    })
    return requests
  }

  test('loads once a page-wide key is configured after the map rendered', async ({ page, renderScenario }) => {
    const requests = await serveGoogle(page)
    await renderScenario(`<c2-google-map center="1,1"></c2-google-map><c2-google-street-view position="1,1"></c2-google-street-view>`)
    await expect(page.getByRole('alert')).toHaveCount(2)
    await page.evaluate(() =>
      (window as unknown as { configureGoogleMaps: (options: object) => void }).configureGoogleMaps({ apiKey: 'page-key', language: 'vi', region: 'VN' }),
    )
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect.poll(() => events(page, 'map-ready')).toHaveLength(2)
    expect(requests).toHaveLength(1)
    expect(Object.fromEntries(requests[0].searchParams)).toMatchObject({ key: 'page-key', language: 'vi', region: 'VN' })
  })

  test('asks for an API key when there is none, then loads Google Maps once one is set', async ({ page, renderScenario }) => {
    const requests = await serveGoogle(page)
    await renderScenario(`<c2-google-map center="1,1"></c2-google-map>`)

    const map = page.locator('c2-google-map')
    await expect(map.getByRole('alert')).toHaveText('Set a Google Maps API key to show this map.')
    expect(await events(page, 'map-error')).toEqual([
      { target: 'c2-google-map', detail: { reason: 'missing-key', message: 'Set a Google Maps API key to show this map.' } },
    ])
    await accessible(page)

    await map.evaluate((element) => element.setAttribute('api-key', 'test-key'))
    await expect.poll(() => events(page, 'map-ready')).toHaveLength(1)
    await expect(map.getByRole('alert')).toHaveCount(0)
    expect(requests).toHaveLength(1)
    expect(Object.fromEntries(requests[0].searchParams)).toMatchObject({ key: 'test-key', v: 'weekly', loading: 'async' })
  })

  test('has no accessibility violations once the map shows', async ({ page, renderScenario }) => {
    await renderScenario(`<c2-google-map center="1,1"><c2-google-map-marker position="2,3" label="Office"></c2-google-map-marker></c2-google-map>`)
    await expect(page.getByRole('button', { name: 'Office' })).toBeVisible()
    await accessible(page)
  })
})

test.describe('c2-google-map-marker', () => {
  test('puts a pin on the map, themed through its CSS variables', async ({ page, renderScenario }) => {
    await renderScenario(`
      <c2-google-map center="1,1">
        <c2-google-map-marker position="2,3" label="Office" glyph="HQ" z-index="4" style="--c2-google-map-marker__pin--background-color: rgb(200, 10, 20)"></c2-google-map-marker>
      </c2-google-map>`)
    const pin = page.getByRole('button', { name: 'Office' })
    await expect(pin).toHaveText('HQ')
    await expect(pin.locator('span')).toHaveCSS('background-color', 'rgb(200, 10, 20)')
    expect(await fake(page, (log) => ({ position: log.markers[0].position, zIndex: log.markers[0].zIndex, clickable: log.markers[0].gmpClickable }))).toEqual({
      position: { lat: 2, lng: 3 },
      zIndex: 4,
      clickable: true,
    })
  })

  test('reports a click, and a drag with the new position', async ({ page, renderScenario }) => {
    await renderScenario(`<c2-google-map center="1,1"><c2-google-map-marker position="2,3" label="Office" draggable></c2-google-map-marker></c2-google-map>`)
    await page.getByRole('button', { name: 'Office' }).click()
    await expect.poll(() => events(page, 'marker-click')).toEqual([{ target: 'c2-google-map-marker', detail: { lat: 2, lng: 3 } }])

    expect(await fake(page, (log) => log.markers[0].gmpDraggable)).toBe(true)
    await page.evaluate(() => (window as unknown as Scope).fakeGoogle.markers[0].drop({ lat: 5, lng: 6 }))
    await expect.poll(() => events(page, 'marker-drag-end')).toEqual([{ target: 'c2-google-map-marker', detail: { lat: 5, lng: 6 } }])
    await expect
      .poll(() => page.locator('c2-google-map-marker').evaluate((marker) => (marker as HTMLElement & { position: unknown }).position))
      .toEqual({ lat: 5, lng: 6 })
  })

  test('follows attribute changes and leaves the map when removed', async ({ page, renderScenario }) => {
    await renderScenario(`<c2-google-map center="1,1"><c2-google-map-marker position="2,3" label="Office"></c2-google-map-marker></c2-google-map>`)
    await expect(page.getByRole('button', { name: 'Office' })).toBeVisible()
    await page.locator('c2-google-map-marker').evaluate((marker) => marker.setAttribute('position', '7,8'))
    await expect.poll(() => fake(page, (log) => log.markers[0].position)).toEqual({ lat: 7, lng: 8 })
    await page.locator('c2-google-map-marker').evaluate((marker) => marker.remove())
    await expect(page.getByRole('button', { name: 'Office' })).toHaveCount(0)
  })

  test('does nothing outside a map', async ({ page, renderScenario }) => {
    await renderScenario(`<c2-google-map-marker position="2,3" label="Stray"></c2-google-map-marker>`)
    await expect(page.locator('c2-google-map-marker')).toBeHidden()
    expect(await fake(page, (log) => log.markers.length)).toBe(0)
  })
})

test.describe('c2-google-map-route', () => {
  const ROUTE = `
    <c2-google-map center="1,1">
      <c2-google-map-route origin="1.5,2.5" destination="Ben Thanh Market" style="--c2-google-map-route__line--color: rgb(10, 150, 60); --c2-google-map-route__line--width: 7"></c2-google-map-route>
    </c2-google-map>`

  test('draws the route between its ends, with lettered markers, and zooms to it', async ({ page, renderScenario }) => {
    await renderScenario(ROUTE)
    await expect.poll(() => events(page, 'route-change')).toHaveLength(1)

    expect(await fake(page, (log) => log.routeRequests)).toEqual([
      {
        origin: { lat: 1.5, lng: 2.5 },
        destination: 'Ben Thanh Market',
        intermediates: [],
        travelMode: 'DRIVING',
        fields: ['path', 'distanceMeters', 'durationMillis', 'localizedValues', 'viewport', 'legs'],
      },
    ])
    const lines = await fake(page, (log) =>
      log.polylines.map(({ options }) => ({ color: options.strokeColor, weight: options.strokeWeight, zIndex: options.zIndex })),
    )
    expect(lines).toEqual([
      { color: '#ffffff', weight: 11, zIndex: 1 },
      { color: 'rgb(10, 150, 60)', weight: 7, zIndex: 2 },
    ])
    await expect(page.getByRole('button', { name: 'A', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'B', exact: true })).toBeVisible()
    expect(await fake(page, (log) => log.maps[0].fitted)).toEqual({ north: 9, south: 1.5, east: 9, west: 2.5 })

    const [change] = await events(page, 'route-change')
    expect(change).toEqual({
      target: 'c2-google-map-route',
      detail: {
        distanceMeters: 4200,
        durationMillis: 720_000,
        distanceText: '4.2 km',
        durationText: '12 mins',
        path: [
          { lat: 1.5, lng: 2.5 },
          { lat: 5.25, lng: 2.5 },
          { lat: 9, lng: 9 },
        ],
      },
    })
  })

  test('computes the route again when the travel mode changes, replacing the old line', async ({ page, renderScenario }) => {
    await renderScenario(ROUTE)
    await expect.poll(() => events(page, 'route-change')).toHaveLength(1)
    await page.locator('c2-google-map-route').evaluate((route) => route.setAttribute('travel-mode', 'walking'))
    await expect.poll(() => events(page, 'route-change')).toHaveLength(2)
    expect(await fake(page, (log) => log.routeRequests.at(-1)!.travelMode)).toBe('WALKING')
    expect((await events(page, 'route-change'))[1].detail.distanceMeters).toBe(3900)
    expect(await fake(page, (log) => log.polylines.filter((line) => line.map).length)).toBe(2)
    await expect(page.getByRole('button', { name: 'A', exact: true })).toHaveCount(1)
  })

  test('passes stops, and can leave out the markers and the zoom', async ({ page, renderScenario }) => {
    await renderScenario(`
      <c2-google-map center="1,1">
        <c2-google-map-route origin="1,1" destination="9,9" waypoints='["4,4", "Tan Dinh Market"]' hide-markers no-fit></c2-google-map-route>
      </c2-google-map>`)
    await expect.poll(() => events(page, 'route-change')).toHaveLength(1)
    expect(await fake(page, (log) => log.routeRequests[0].intermediates)).toEqual([{ location: { lat: 4, lng: 4 } }, { location: 'Tan Dinh Market' }])
    await expect(page.getByRole('button', { name: 'A', exact: true })).toHaveCount(0)
    expect(await fake(page, (log) => log.maps[0].fitted)).toBeUndefined()
  })

  test('reports a route Google cannot find and draws nothing', async ({ page, renderScenario }) => {
    await renderScenario(`<c2-google-map center="1,1"><c2-google-map-route origin="1,1" destination="Nowhere"></c2-google-map-route></c2-google-map>`)
    await expect
      .poll(() => events(page, 'route-error'))
      .toEqual([{ target: 'c2-google-map-route', detail: { message: 'Google found no route between these places.' } }])
    expect(await fake(page, (log) => log.polylines.length)).toBe(0)
  })

  test('takes its line and markers off the map when removed', async ({ page, renderScenario }) => {
    await renderScenario(ROUTE)
    await expect.poll(() => events(page, 'route-change')).toHaveLength(1)
    await page.locator('c2-google-map-route').evaluate((route) => route.remove())
    expect(await fake(page, (log) => log.polylines.filter((line) => line.map).length)).toBe(0)
    await expect(page.getByRole('button', { name: 'A', exact: true })).toHaveCount(0)
  })
})

test.describe('c2-google-street-view', () => {
  test('opens a panorama at its position and point of view, and reports where the user looks', async ({ page, renderScenario }) => {
    await renderScenario(`<c2-google-street-view position="48.85,2.29" heading="320" pitch="10" zoom="2"></c2-google-street-view>`)
    await expect.poll(() => events(page, 'map-ready')).toHaveLength(1)
    expect(await fake(page, (log) => log.panoramas[0].options)).toMatchObject({
      position: { lat: 48.85, lng: 2.29 },
      pov: { heading: 320, pitch: 10 },
      zoom: 2,
      visible: true,
    })

    await page.evaluate(() => (window as unknown as Scope).fakeGoogle.panoramas[0].setPov({ heading: 90, pitch: 0 }))
    const view = page.locator('c2-google-street-view')
    await expect.poll(() => view.evaluate((element) => (element as HTMLElement & { heading: number }).heading)).toBe(90)
    await expect(view.getByRole('status')).toHaveCount(0)
  })

  test('keeps its zoom when Google reports an unsettled one', async ({ page, renderScenario }) => {
    await renderScenario(`<c2-google-street-view position="48.85,2.29" zoom="2"></c2-google-street-view>`)
    await expect.poll(() => events(page, 'map-ready')).toHaveLength(1)
    await page.evaluate(() => {
      const panorama = (window as unknown as Scope).fakeGoogle.panoramas[0]
      panorama.zoomUnsettled = true
      panorama.setPov({ heading: 45, pitch: 0 })
    })
    await expect.poll(async () => (await events(page, 'view-change')).at(-1)?.detail).toMatchObject({ heading: 45, zoom: 2 })
    expect(await page.locator('c2-google-street-view').evaluate((view) => (view as HTMLElement & { zoom: number }).zoom)).toBe(2)
  })

  test('says so when there is no imagery at its position', async ({ page, renderScenario }) => {
    await renderScenario(`<c2-google-street-view position="0,0"></c2-google-street-view>`)
    await expect(page.locator('c2-google-street-view').getByRole('alert')).toHaveText('Street View has no imagery near this place.')
    expect((await events(page, 'map-error'))[0].detail.reason).toBe('no-imagery')
    await accessible(page)
  })

  test('becomes the Street View of the map it is linked to', async ({ page, renderScenario }) => {
    await renderScenario(`<c2-google-map id="city" center="1,1"></c2-google-map><c2-google-street-view for="city"></c2-google-street-view>`)
    const view = page.locator('c2-google-street-view')
    await expect(view.getByRole('status')).toHaveText('Drag the pegman onto the map to look around.')
    await expect.poll(() => fake(page, (log) => log.maps[0].options.streetView === log.panoramas[0])).toBe(true)

    // What the pegman does when it is dropped on the map.
    await page.evaluate(() => (window as unknown as Scope).fakeGoogle.panoramas[0].setVisible(true))
    await expect(view.getByRole('status')).toHaveCount(0)

    await view.evaluate((element) => element.remove())
    expect(await fake(page, (log) => log.maps[0].options.streetView)).toBeNull()
  })
})
