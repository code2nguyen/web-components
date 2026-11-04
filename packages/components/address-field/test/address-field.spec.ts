import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

type Address = Record<string, string>
const field = (page: Page) => page.locator('c2-address-field')
const labels = (locator: Locator) => locator.locator('c2-form-field.part').evaluateAll((parts) => parts.map((part) => part.getAttribute('label')))
const input = (locator: Locator, part: string) => locator.locator(`[data-part="${part}"] input`)
const value = (locator: Locator) => locator.evaluate((element) => (element as HTMLElement & { value: Address }).value)
const errors = (locator: Locator) =>
  locator.locator('c2-form-field.part').evaluateAll((parts) => parts.map((part) => part.getAttribute('error-text')).filter((text) => text))
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]')

/** Picks an option of a part's select. */
async function choose(locator: Locator, part: string, option: string) {
  // TEMP diagnostic for a WebKit-only "element is not visible": the select's box and styles up the composed tree.
  const chain = await locator.locator(`[data-part="${part}"]`).evaluate((element) => {
    const out: string[] = []
    for (
      let node: Node | null = element;
      node && node instanceof Element;
      node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode
    ) {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      out.push(
        `${node.localName}.${node.className || ''} ${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.left)},${Math.round(rect.top)} display=${style.display} visibility=${style.visibility} cv=${style.contentVisibility} visible=${node.checkVisibility?.()} slot=${(node as HTMLElement).assignedSlot ? 'yes' : 'no'}`,
      )
    }
    const inner = [...(element.shadowRoot?.children ?? [])].map((child) => {
      const rect = child.getBoundingClientRect()
      return `${child.localName}.${child.className} ${Math.round(rect.width)}x${Math.round(rect.height)} display=${getComputedStyle(child).display}`
    })
    return [...inner, ...out].join('\n')
  })
  console.log(`[diag ${part}]\n${chain}`)
  await locator.locator(`[data-part="${part}"]`).click()
  await locator.locator(`[data-part="${part}"] c2-list-item[value="${option}"]`).click()
}

test('the United States format: labels in order, ZIP and state on the city row, a named group that passes axe', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-address-field></c2-address-field>`)
  expect(await labels(field(page))).toEqual(['Country or region', 'Address', 'Apartment, suite, etc. (optional)', 'City', 'State', 'ZIP code'])
  await expect(field(page).getByRole('group', { name: 'Address' })).toBeVisible()
  await expect(input(field(page), 'line1')).toHaveAttribute('autocomplete', 'address-line1')
  await expect(input(field(page), 'postalCode')).toHaveAttribute('autocomplete', 'postal-code')
  // City, state and ZIP share a row.
  const tops = await field(page)
    .locator('[data-part="city"], [data-part="region"], [data-part="postalCode"]')
    .evaluateAll((parts) => parts.map((part) => Math.round(part.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
  expect((await value(field(page))).country).toBe('US')
  await accessible(page)
})

test('typing fills the value; the form gets name[part]; a missing part or a bad postal code blocks the submit with its message', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<form id="form"><c2-address-field name="ship"></c2-address-field><button>Pay</button></form>`)
  await watch(field(page), 'address-change')
  await page.evaluate(() =>
    document.getElementById('form')!.addEventListener('submit', (event) => (event.preventDefault(), (document.body.dataset.submitted = 'yes'))),
  )
  await input(field(page), 'line1').fill('1 Ferry Building')
  await input(field(page), 'city').fill('San Francisco')
  await input(field(page), 'postalCode').fill('9411')
  expect((await events(field(page))).at(-1)).toMatchObject({ value: { line1: '1 Ferry Building', postalCode: '9411', country: 'US' }, complete: false })
  // Leaving the code shows its message (moving the button down), so leave it before clicking.
  await page.keyboard.press('Tab')
  await expect.poll(() => errors(field(page))).toEqual(['ZIP code should look like 94103'])
  await page.getByRole('button', { name: 'Pay' }).click()
  await expect(page.locator('body')).not.toHaveAttribute('data-submitted', 'yes')
  await expect.poll(() => errors(field(page))).toEqual(['State is required', 'ZIP code should look like 94103'])
  await choose(field(page), 'region', 'CA')
  await input(field(page), 'postalCode').fill('94111')
  await page.keyboard.press('Tab')
  await expect.poll(() => errors(field(page))).toEqual([])
  expect((await events(field(page))).at(-1).complete).toBe(true)
  await page.getByRole('button', { name: 'Pay' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-submitted', 'yes')
  const data = await page.evaluate(() => [...new FormData(document.getElementById('form') as HTMLFormElement).entries()])
  expect(data).toEqual([
    ['ship[line1]', '1 Ferry Building'],
    ['ship[line2]', ''],
    ['ship[city]', 'San Francisco'],
    ['ship[region]', 'CA'],
    ['ship[postalCode]', '94111'],
    ['ship[country]', 'US'],
  ])
})

test('an empty, optional address submits; a started one needs its required parts; required needs it all', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-address-field id="a"></c2-address-field><c2-address-field id="b" required></c2-address-field></form>`)
  // validity, not checkValidity(): that fires `invalid`, which shows every message.
  const valid = (id: string) => page.locator(id).evaluate((element) => (element as HTMLElement & { validity: ValidityState }).validity.valid)
  expect(await valid('#a')).toBe(true)
  expect(await valid('#b')).toBe(false)
  await input(page.locator('#a'), 'line2').fill('Suite 50')
  expect(await valid('#a')).toBe(false)
  // A message shows once a part is left.
  await input(page.locator('#a'), 'city').focus()
  await input(page.locator('#a'), 'city').blur()
  await expect.poll(() => errors(page.locator('#a'))).toEqual(['City is required'])
})

test('another country changes the parts, their order and labels, and keeps what both share', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-address-field value='{"line1":"10 Downing Street","city":"London","region":"CA","postalCode":"SW1A 2AA","country":"US"}'></c2-address-field>`,
  )
  await choose(field(page), 'country', 'GB')
  expect(await labels(field(page))).toEqual([
    'Country or region',
    'Address line 1',
    'Address line 2 (optional)',
    'Town or city',
    'County (optional)',
    'Postcode',
  ])
  // The US state does not carry over to a typed county.
  expect(await value(field(page))).toMatchObject({ line1: '10 Downing Street', city: 'London', region: '', postalCode: 'SW1A 2AA', country: 'GB' })
  await choose(field(page), 'country', 'JP')
  expect(await labels(field(page))).toEqual(['Country or region', 'Postal code', 'Prefecture', 'City / ward', 'Street address', 'Building, floor (optional)'])
  await props(field(page), { value: { country: 'FR', line1: '8 rue de Rivoli', postalCode: '75004', city: 'Paris' } })
  expect(await labels(field(page))).toEqual(['Country or region', 'Address', 'Apartment, suite, etc. (optional)', 'Postal code', 'City'])
  // An unknown country gets the general format.
  await props(field(page), { value: { country: 'IS' } })
  expect(await labels(field(page))).toEqual([
    'Country or region',
    'Address',
    'Apartment, suite, etc. (optional)',
    'City',
    'State / region (optional)',
    'Postal code (optional)',
  ])
})

test('with a provider, the first line suggests addresses and picking one fills every part, switching country', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-address-field></c2-address-field>`)
  await field(page).evaluate(
    (element) => ((element as HTMLElement & { provider: unknown }).provider = (window as unknown as { fakeProvider: unknown }).fakeProvider),
  )
  await watch(field(page), 'change')
  await input(field(page), 'line1').fill('1 Fer')
  await field(page).locator('c2-list-item', { hasText: '1 Ferry Building' }).click()
  await expect
    .poll(() => value(field(page)))
    .toMatchObject({ line1: '1 Ferry Building', city: 'San Francisco', region: 'CA', postalCode: '94111', country: 'US' })
  expect(await page.evaluate(() => (window as unknown as { fakeProvider: { queries: string[][] } }).fakeProvider.queries.at(-1))).toEqual(['1 Fer', 'US'])
  await expect(field(page).locator('.announcement')).toHaveText('Address filled in')
  expect((await events(field(page))).length).toBeGreaterThan(0)

  await input(field(page), 'line1').fill('2-21')
  await field(page).locator('c2-list-item', { hasText: '2-21-1 Shibuya' }).click()
  await expect.poll(() => value(field(page))).toMatchObject({ city: 'Shibuya-ku', region: '13', postalCode: '150-0002', country: 'JP' })
  expect((await labels(field(page)))[1]).toBe('Postal code')
})

test('formatAddress prints each country in its postal order; regionCode reads a name', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-address-field></c2-address-field>`)
  const out = await page.evaluate(() => {
    const { formatAddress, regionCode } = (
      window as unknown as { addressApi: { formatAddress: (value: object, options?: object) => string[]; regionCode: (c: string, r: string) => string } }
    ).addressApi
    return {
      us: formatAddress(
        { line1: '1 Ferry Building', line2: 'Suite 50', city: 'San Francisco', region: 'CA', postalCode: '94111', country: 'US' },
        { locale: 'en' },
      ),
      fr: formatAddress({ line1: '8 rue de Rivoli', city: 'Paris', postalCode: '75004', country: 'FR' }, { locale: 'fr' }),
      jp: formatAddress({ line1: '2-21-1 Shibuya', city: 'Shibuya-ku', region: '13', postalCode: '150-0002', country: 'JP' }, { country: false }),
      gb: formatAddress({ line1: '10 Downing Street', city: 'London', postalCode: 'SW1A 2AA', country: 'GB' }, { locale: 'en' }),
      codes: [regionCode('US', 'california'), regionCode('BR', 'Sao Paulo'), regionCode('FR', 'Île-de-France')],
    }
  })
  expect(out).toEqual({
    us: ['1 Ferry Building', 'Suite 50', 'San Francisco, CA 94111', 'United States'],
    fr: ['8 rue de Rivoli', '75004 Paris', 'France'],
    jp: ['2-21-1 Shibuya', 'Shibuya-ku, Tokyo 150-0002'],
    gb: ['10 Downing Street', 'London', 'SW1A 2AA', 'United Kingdom'],
    codes: ['CA', 'SP', 'Île-de-France'],
  })
})

test('the Google and Mapbox providers send the query with the key and turn the reply into an address', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-address-field></c2-address-field>`)
  const requests: { url: string; body: string | null; key: string | null }[] = []
  await page.route('https://places.googleapis.com/**', async (route) => {
    const request = route.request()
    requests.push({ url: request.url(), body: request.postData(), key: request.headers()['x-goog-api-key'] ?? null })
    if (request.method() === 'POST') {
      await route.fulfill({
        json: {
          suggestions: [
            {
              placePrediction: {
                placeId: 'p1',
                structuredFormat: { mainText: { text: '1600 Amphitheatre Pkwy' }, secondaryText: { text: 'Mountain View, CA' } },
              },
            },
          ],
        },
      })
    } else {
      await route.fulfill({
        json: {
          addressComponents: [
            { longText: '1600', types: ['street_number'] },
            { longText: 'Amphitheatre Parkway', types: ['route'] },
            { longText: 'Mountain View', types: ['locality'] },
            { longText: 'California', shortText: 'CA', types: ['administrative_area_level_1'] },
            { longText: '94043', types: ['postal_code'] },
            { longText: 'United States', shortText: 'US', types: ['country'] },
          ],
        },
      })
    }
  })
  await page.route('https://api.mapbox.com/**', async (route) => {
    requests.push({ url: route.request().url(), body: null, key: null })
    if (route.request().url().includes('/suggest'))
      await route.fulfill({ json: { suggestions: [{ mapbox_id: 'm1', name: 'Hauptstraße 5', place_formatted: '10115 Berlin' }] } })
    else
      await route.fulfill({
        json: {
          features: [
            {
              properties: {
                context: {
                  address: { address_number: '5', street_name: 'Hauptstraße' },
                  place: { name: 'Berlin' },
                  postcode: { name: '10115' },
                  region: { name: 'Berlin' },
                  country: { country_code: 'de' },
                },
              },
            },
          ],
        },
      })
  })
  const out = await page.evaluate(async () => {
    const api = (window as unknown as { addressApi: Record<string, (options: object) => { suggest: Function; resolve: Function }> }).addressApi
    const signal = new AbortController().signal
    const google = api.googlePlacesProvider({ apiKey: 'KEY' })
    const mapbox = api.mapboxSearchProvider({ accessToken: 'TOKEN' })
    return {
      google: [await google.suggest('1600 Amph', { country: 'US', locale: 'en', signal }), await google.resolve('p1', { locale: 'en', signal })],
      mapbox: [await mapbox.suggest('Haupt', { country: 'DE', locale: 'de', signal }), await mapbox.resolve('m1', { locale: 'de', signal })],
    }
  })
  expect(out.google).toEqual([
    [{ id: 'p1', label: '1600 Amphitheatre Pkwy', description: 'Mountain View, CA' }],
    { line1: '1600 Amphitheatre Parkway', line2: '', city: 'Mountain View', district: '', region: 'CA', postalCode: '94043', country: 'US' },
  ])
  expect(out.mapbox).toEqual([
    [{ id: 'm1', label: 'Hauptstraße 5', description: '10115 Berlin' }],
    { line1: 'Hauptstraße 5', line2: '', city: 'Berlin', district: '', region: 'Berlin', postalCode: '10115', country: 'DE' },
  ])
  expect(requests[0].key).toBe('KEY')
  expect(JSON.parse(requests[0].body!)).toMatchObject({ input: '1600 Amph', includedRegionCodes: ['us'], languageCode: 'en' })
  expect(requests[1].url).toContain('/v1/places/p1')
  expect(requests[2].url).toContain('q=Haupt')
  expect(requests[2].url).toContain('access_token=TOKEN')
  expect(requests[2].url).toContain('country=de')
})

test('a reset restores the first value; its text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<form id="form"><div lang="fr"><c2-address-field value='{"country":"FR","city":"Lyon"}'></c2-address-field></div></form>`)
  expect(await labels(field(page))).toEqual(['Pays ou région', 'Adresse', 'Appartement, étage, etc. (facultatif)', 'Code postal', 'Ville'])
  await expect(field(page).getByRole('group', { name: 'Adresse' })).toBeVisible()
  await input(field(page), 'city').fill('Paris')
  await page.evaluate(() => (document.getElementById('form') as HTMLFormElement).reset())
  expect((await value(field(page))).city).toBe('Lyon')
})

test('regression: inside a c2-form-field that shows the message, the parts keep only the error look', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-form-field label="Delivery" error-text="Address not deliverable"><c2-address-field value='{"line1":"1 Main St"}'></c2-address-field></c2-form-field>`,
  )
  await expect(field(page).getByRole('group', { name: 'Delivery' })).toBeVisible()
  await field(page).evaluate((element) => (element as HTMLElement & { reportValidity(): boolean }).reportValidity())
  await expect.poll(() => errors(field(page))).toEqual([])
  await expect(field(page).locator('[data-part="city"]')).toHaveAttribute('error', '')
})
