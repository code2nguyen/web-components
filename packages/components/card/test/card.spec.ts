import { test, expect, props, watch, accessible, pointerClick, slotPresenceMatrix } from '../../../../tests/component-fixture'

test('default-slot presence follows assignment, text, insertion, removal and reassignment', async ({ page, renderScenario }) => {
  const body = page.locator('c2-card').locator('[part="body"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-card><span data-slot-presence-probe>Body</span></c2-card>',
    host: 'c2-card',
    text: true,
    assertPresent: async (present) => (present ? expect(body).toBeVisible() : expect(body).toBeHidden()),
  })
})

test('slotted sections appear and empty sections collapse', async ({ page, renderScenario }) => {
  await renderScenario('<c2-card><h2 slot="header">Title</h2><p>Body</p><button slot="footer">Action</button></c2-card>')
  await expect(page.getByRole('heading', { name: 'Title' })).toBeVisible()
  await expect(page.getByText('Body', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Action' })).toBeVisible()
  await expect(page.locator('.c2-card-media')).not.toBeVisible()
  await accessible(page)
})
test('interactive cards activate once on Enter and disabled cards suppress clicks', async ({ page, renderScenario }) => {
  await renderScenario('<c2-card interactive>Open project</c2-card>')
  const host = page.locator('c2-card')
  await watch(host, 'click')
  await page.getByRole('button', { name: 'Open project' }).press('Enter')
  await expect(host).toHaveAttribute('data-events', '[null]')
  await props(host, { disabled: true })
  await pointerClick(host)
  await expect(host).toHaveAttribute('data-events', '[null]')
})
test('link cards navigate to their destination', async ({ page, renderScenario }) => {
  await renderScenario('<c2-card href="#project">Open project</c2-card>')
  await page.getByRole('link', { name: 'Open project' }).click()
  await expect(page).toHaveURL(/#project$/)
})

test('a link card keeps footer actions out of the link while the whole card stays clickable', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-card href="#project" style="width: 320px"><h2 slot="header">Project</h2><p>Details</p><button slot="footer" id="share">Share</button></c2-card>',
  )
  const host = page.locator('c2-card')
  const link = page.getByRole('link', { name: 'Project Details' })
  await expect(link).toBeVisible()
  expect(await link.evaluate((el) => el.querySelector('slot[name="footer"]'))).toBeNull()
  await accessible(page)

  await page.locator('#share').evaluate((button) => button.addEventListener('click', () => button.setAttribute('data-clicked', '')))
  await page.getByRole('button', { name: 'Share' }).click()
  await expect(page.locator('#share')).toHaveAttribute('data-clicked', '')
  await expect(page).not.toHaveURL(/#project$/)

  // The footer's padding, beside the button, is still the card.
  const box = (await host.boundingBox())!
  await page.mouse.click(box.x + box.width - 8, box.y + box.height - 8)
  await expect(page).toHaveURL(/#project$/)
})

// The stretched link area sits under the sections: a control in the body is the hit target, not the link's `::after`.
test('a control in the body of a link card receives the click', async ({ page, renderScenario }) => {
  await renderScenario('<c2-card href="#project" style="width: 320px"><h2 slot="header">Project</h2><p>Details</p><button id="like">Like</button></c2-card>')
  const button = page.locator('#like')
  await button.evaluate((element) => element.addEventListener('click', () => element.setAttribute('data-clicked', '')))
  const box = (await button.boundingBox())!
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('#like')?.id ?? null, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  })
  expect(hit).toBe('like')

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(button).toHaveAttribute('data-clicked', '')
})

test('a control in the body of a link card does its own job without following the link', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-card href="#project" style="width: 320px">
    <h2 slot="header">Project</h2>
    <p id="text">Details</p>
    <button id="like" type="button">Like</button>
    <c2-button id="share">Share</c2-button>
    <c2-checkbox id="pin">Pin</c2-checkbox>
  </c2-card>`)
  await page.evaluate(() => (location.hash = ''))

  await page.locator('#like').click()
  await page.locator('#share').click()
  await page.locator('#pin').click()
  await expect(page.locator('#pin')).toHaveJSProperty('checked', true)
  expect(await page.evaluate(() => location.hash)).toBe('')
  // The link is armed again once the control's click is over: plain body text still opens the card.
  await expect(page.locator('c2-card').locator('a.c2-card-primary')).toHaveAttribute('href', '#project')
  await page.locator('#text').click()
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#project')
})

test('an interactive card shows its focus ring on the card', async ({ page, renderScenario, tab }) => {
  await renderScenario('<c2-card interactive>Open project<button slot="footer">Menu</button></c2-card>')
  await tab()
  await expect(page.getByRole('button', { name: 'Open project' })).toBeFocused()
  await expect(page.locator('c2-card').locator('.c2-card')).toHaveCSS('outline-style', 'solid')
  await accessible(page)
})

test('public parts style every slotted region without changing assignment', async ({ page, renderScenario }) => {
  await renderScenario('<c2-card><img slot="media" alt="Cover"><h2 slot="header">Title</h2><p>Body</p><button slot="footer">Action</button></c2-card>')
  await page.addStyleTag({
    content: `
      c2-card::part(media) { background: rgb(1, 2, 3); }
      c2-card::part(header) { background: rgb(4, 5, 6); }
      c2-card::part(body) { background: rgb(7, 8, 9); }
      c2-card::part(footer) { background: rgb(10, 11, 12); }
    `,
  })
  const host = page.locator('c2-card')
  await expect(host.locator('.c2-card-media')).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  await expect(host.locator('.c2-card-header')).toHaveCSS('background-color', 'rgb(4, 5, 6)')
  await expect(host.locator('.c2-card-content')).toHaveCSS('background-color', 'rgb(7, 8, 9)')
  await expect(host.locator('.c2-card-footer')).toHaveCSS('background-color', 'rgb(10, 11, 12)')
  await expect(host.locator('[slot="media"]')).toBeVisible()
  await expect(host.getByRole('heading', { name: 'Title' })).toBeVisible()
  await expect(host.getByText('Body', { exact: true })).toBeVisible()
  await expect(host.getByRole('button', { name: 'Action' })).toBeVisible()
})
