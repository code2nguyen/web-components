import { expect, test, type Locator, type Page } from '@playwright/test'

async function writeField(field: Locator, value: string) {
  await field.evaluate((element, next) => {
    const input = element as HTMLElement & { value: string }
    input.value = next
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  }, value)
}

async function openSliderStudio(page: Page) {
  await page.goto('./components/color-slider/gallery/')
  const slider = page.locator('c2-color-slider').first()
  await expect(slider).toBeVisible()
  await page.evaluate(() => customElements.whenDefined('demo-component-configuration-panel'))
  await page.locator('.mdx-code-block-setting-btn').first().click()
  const panel = page.locator('demo-component-configuration-panel')
  await expect(panel.locator('.inspector')).toBeVisible()
  return { slider, panel }
}

async function openKbdStudio(page: Page) {
  await page.goto('./components/kbd/gallery/')
  const kbd = page.locator('c2-kbd').first()
  await expect(kbd).toBeVisible()
  await page.evaluate(() => customElements.whenDefined('demo-component-configuration-panel'))
  await page.locator('.mdx-code-block-setting-btn').first().click()
  const panel = page.locator('demo-component-configuration-panel')
  await expect(panel.locator('.inspector')).toBeVisible()
  return { kbd, panel }
}

async function filterProperty(panel: Locator, name: string) {
  await writeField(panel.locator('c2-text-field.filter-field'), name)
}

test('the studio border control changes the color slider target and reset restores its authored border', async ({ page }) => {
  await page.goto('./components/color-slider/gallery/')

  const slider = page.locator('c2-color-slider').first()
  const border = () =>
    slider.evaluate((host) => {
      const target = host.shadowRoot?.querySelector('.gradient')
      return target ? getComputedStyle(target).borderLeftWidth : null
    })

  await expect(slider).toBeVisible()
  const authoredWidth = await border()
  await page.evaluate(() => customElements.whenDefined('demo-component-configuration-panel'))
  await page.locator('.mdx-code-block-setting-btn').first().click()

  const panel = page.locator('demo-component-configuration-panel')
  await expect(panel.locator('.inspector')).toBeVisible()
  await panel.locator('c2-text-field.filter-field').evaluate((field) => {
    const input = field as HTMLElement & { value: string }
    input.value = 'border-left'
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  })

  const row = panel.locator('demo-inspector-row[data-key="--c2-color-slider--border-left"]')
  await expect(row).toBeVisible()
  await row.locator('demo-border-config c2-text-field.width').evaluate((field) => {
    const input = field as HTMLElement & { value: string }
    input.value = '4px'
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  })

  await expect.poll(border).toBe('4px')
  await expect(slider).toHaveCSS('--c2-color-slider--border-left', /4px/)

  await panel.locator('c2-icon-button[aria-label="Reset this example to the authored values"]').click()
  await expect.poll(border).toBe(authoredWidth)
  await expect(slider).not.toHaveCSS('--c2-color-slider--border-left', /4px/)
})

test('the four-corner radius control writes the intended corner only', async ({ page }) => {
  await page.goto('./components/color-slider/gallery/')
  const slider = page.locator('c2-color-slider').first()
  const radii = () =>
    slider.evaluate((host) => {
      const gradient = host.shadowRoot?.querySelector('.gradient')
      if (!gradient) return null
      const style = getComputedStyle(gradient)
      return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
    })
  await expect(slider).toBeVisible()
  const authoredRadii = await radii()
  await page.evaluate(() => customElements.whenDefined('demo-component-configuration-panel'))
  await page.locator('.mdx-code-block-setting-btn').first().click()

  const panel = page.locator('demo-component-configuration-panel')
  await panel.locator('c2-text-field.filter-field').evaluate((field) => {
    const input = field as HTMLElement & { value: string }
    input.value = 'border-bottom-right-radius'
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  })
  const corners = panel.locator('demo-inspector-row[data-key*="--c2-color-slider--border-bottom-right-radius"] demo-box-sides-config[kind="radius"]')
  await expect(corners).toBeVisible()
  await expect(corners.locator('c2-text-field[data-index]')).toHaveCount(4)
  await corners.locator('c2-text-field[data-index="2"]').evaluate((field) => {
    const input = field as HTMLElement & { value: string }
    input.value = '13px'
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  })

  await expect.poll(radii).toEqual([authoredRadii?.[0], authoredRadii?.[1], '13px', authoredRadii?.[3]])
})

test('color and length controls update the rendered slider, and row revert does not discard another edit', async ({ page }) => {
  const { slider, panel } = await openSliderStudio(page)
  const appearance = () =>
    slider.evaluate((host) => {
      const gradient = host.shadowRoot?.querySelector('.gradient')
      const handle = host.shadowRoot?.querySelector('.color-handle')
      if (!gradient || !handle) return null
      return { width: getComputedStyle(gradient).width, handleColor: getComputedStyle(handle).backgroundColor }
    })

  const authored = await appearance()
  await filterProperty(panel, '--c2-color-slider--width')
  const widthRow = panel.locator('demo-inspector-row[data-key="--c2-color-slider--width"]')
  await expect(widthRow).toBeVisible()
  await writeField(widthRow.locator('demo-length-config c2-text-field').first(), '220')
  await expect.poll(appearance).toMatchObject({ width: '220px' })
  await expect(slider).toHaveCSS('--c2-color-slider--width', '220px')
  await expect(widthRow).toHaveAttribute('changed', '')

  await filterProperty(panel, '--c2-color-slider__color-handle--background-color')
  const colorRow = panel.locator('demo-inspector-row[data-key="--c2-color-slider__color-handle--background-color"]')
  await expect(colorRow).toBeVisible()
  await writeField(colorRow.locator('demo-color-config c2-text-field.raw'), '#123456')
  await expect.poll(appearance).toMatchObject({ width: '220px', handleColor: 'rgb(18, 52, 86)' })
  await expect(slider).toHaveCSS('--c2-color-slider__color-handle--background-color', '#123456')
  await expect(colorRow).toHaveAttribute('changed', '')

  await colorRow.locator('c2-icon-button[aria-label^="Revert "]').click()
  await expect.poll(appearance).toMatchObject({ width: '220px', handleColor: authored?.handleColor })
  await expect(slider).not.toHaveCSS('--c2-color-slider__color-handle--background-color', '#123456')
  await expect(colorRow).not.toHaveAttribute('changed', '')
  await expect(panel.locator('.inspector__count')).toContainText('1 changed')

  await panel.locator('c2-icon-button[aria-label="Reset this example to the authored values"]').click()
  await expect.poll(appearance).toEqual(authored)
  await expect(panel.locator('.inspector__count')).toHaveCount(0)
})

test('linked corner editing changes all corners, then independent editing changes only one', async ({ page }) => {
  const { slider, panel } = await openSliderStudio(page)
  const radii = () =>
    slider.evaluate((host) => {
      const gradient = host.shadowRoot?.querySelector('.gradient')
      if (!gradient) return null
      const style = getComputedStyle(gradient)
      return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
    })
  await filterProperty(panel, 'border-top-left-radius')
  const corners = panel.locator('demo-inspector-row[data-key*="--c2-color-slider--border-top-left-radius"] demo-box-sides-config[kind="radius"]')
  await expect(corners).toBeVisible()
  await corners.locator('c2-icon-button[aria-label="Edit all sides together"]').click()
  await writeField(corners.locator('c2-text-field[data-index="0"]'), '14px')
  await expect.poll(radii).toEqual(['14px', '14px', '14px', '14px'])
  await corners.locator('c2-icon-button[aria-label="Edit each side separately"]').click()
  await writeField(corners.locator('c2-text-field[data-index="2"]'), '6px')
  await expect.poll(radii).toEqual(['14px', '14px', '6px', '14px'])
})

test('a panel edit can be saved, copied, and exported as a reproducible CSS override', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const { slider, panel } = await openSliderStudio(page)
  await filterProperty(panel, '--c2-color-slider--width')
  const widthRow = panel.locator('demo-inspector-row[data-key="--c2-color-slider--width"]')
  await writeField(widthRow.locator('demo-length-config c2-text-field').first(), '228')
  await expect(slider).toHaveCSS('--c2-color-slider--width', '228px')

  await panel.locator('c2-tab[for="presets"]').click()
  const collection = panel.locator('.collection')
  await expect(collection).toBeVisible()
  await writeField(collection.locator('c2-text-field[aria-label="Variant name"]'), 'Wider slider')
  await collection.locator('c2-button', { hasText: 'Save' }).click()
  await expect(collection.locator('c2-list-item[value="Wider slider"]')).toBeVisible()

  await collection.locator('c2-details.block--details').evaluate((details) => {
    ;(details as HTMLElement & { expanded: boolean }).expanded = true
  })
  await collection.locator('c2-button', { hasText: 'Copy current' }).click()
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as { tag: string; css: Record<string, string> }
  expect(copied.tag).toBe('c2-color-slider')
  expect(copied.css).toEqual({ '--c2-color-slider--width': '228px' })

  await collection.locator('c2-button', { hasText: 'Export all' }).click()
  const exported = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as {
    tag: string
    presets: { name: string; css: Record<string, string> }[]
  }
  expect(exported.tag).toBe('c2-color-slider')
  expect(exported.presets).toEqual([expect.objectContaining({ name: 'Wider slider', css: copied.css })])

  await panel.locator('c2-icon-button[aria-label="Reset this example to the authored values"]').click()
  await expect(slider).not.toHaveCSS('--c2-color-slider--width', '228px')
  await collection.locator('c2-list-item[value="Wider slider"]').click()
  await expect(slider).toHaveCSS('--c2-color-slider--width', '228px')
  await expect
    .poll(() =>
      slider.evaluate((host) => {
        const gradient = host.shadowRoot?.querySelector('.gradient')
        return gradient ? getComputedStyle(gradient).width : null
      }),
    )
    .toBe('228px')
})

test('keyword and free-text controls change the rendered keycap', async ({ page }) => {
  const { kbd, panel } = await openKbdStudio(page)
  const targetStyle = () =>
    kbd.evaluate((host) => {
      const target = host.shadowRoot?.querySelector('kbd')
      if (!target) return null
      const style = getComputedStyle(target)
      return { textTransform: style.textTransform, boxShadow: style.boxShadow }
    })

  await filterProperty(panel, '--c2-kbd--text-transform')
  const keywordRow = panel.locator('demo-inspector-row[data-key="--c2-kbd--text-transform"]')
  await expect(keywordRow.locator('demo-keyword-config')).toBeVisible()
  await keywordRow.locator('demo-keyword-config c2-select').click()
  await keywordRow.locator('c2-list-item[value="uppercase"]').click()
  await expect.poll(targetStyle).toMatchObject({ textTransform: 'uppercase' })
  await expect(kbd).toHaveCSS('--c2-kbd--text-transform', 'uppercase')

  await filterProperty(panel, '--c2-kbd--box-shadow')
  const textRow = panel.locator('demo-inspector-row[data-key="--c2-kbd--box-shadow"]')
  await expect(textRow.locator('c2-text-field.text-control')).toBeVisible()
  await writeField(textRow.locator('c2-text-field.text-control'), '0 4px 0 #123456')
  await expect.poll(targetStyle).toMatchObject({ textTransform: 'uppercase', boxShadow: 'rgb(18, 52, 86) 0px 4px 0px 0px' })
  await expect(kbd).toHaveCSS('--c2-kbd--box-shadow', '0 4px 0 #123456')
})

test('font controls edit size and weight without discarding the other font value', async ({ page }) => {
  const { kbd, panel } = await openKbdStudio(page)
  const font = () =>
    kbd.evaluate((host) => {
      const target = host.shadowRoot?.querySelector('kbd')
      if (!target) return null
      const style = getComputedStyle(target)
      return { size: style.fontSize, weight: style.fontWeight }
    })
  await filterProperty(panel, '--c2-kbd--font-size')
  const fontRow = panel.locator('demo-inspector-row[data-key*="--c2-kbd--font-size"]')
  await expect(fontRow.locator('demo-font-config')).toBeVisible()
  await writeField(fontRow.locator('demo-font-config c2-text-field[aria-label="font-size"]'), '19px')
  await expect.poll(font).toMatchObject({ size: '19px' })
  await fontRow.locator('demo-font-config c2-select[placeholder="font-weight"]').click()
  await fontRow.locator('c2-list-item[value="700"]').click()
  await expect.poll(font).toEqual({ size: '19px', weight: '700' })
  await expect(kbd).toHaveCSS('--c2-kbd--font-size', '19px')
  await expect(kbd).toHaveCSS('--c2-kbd--font-weight', '700')
})

test('a selected-state control changes the button only when its selected prop is active', async ({ page }) => {
  await page.goto('./components/button/gallery/')
  const button = page.locator('.example__canvas c2-button').first()
  await expect(button).toBeVisible()
  await page.evaluate(() => customElements.whenDefined('demo-component-configuration-panel'))
  await page.locator('.mdx-code-block-setting-btn').first().click()
  const panel = page.locator('demo-component-configuration-panel')
  await expect(panel.locator('.inspector')).toBeVisible()
  const background = () =>
    button.evaluate((host) => {
      const target = host.shadowRoot?.querySelector('.c2-button')
      return target ? getComputedStyle(target).backgroundColor : null
    })
  const authored = await background()

  await filterProperty(panel, '--c2-button__container__selected--background-color')
  const row = panel.locator('demo-inspector-row[data-key="--c2-button__container__selected--background-color"]')
  await expect(row).toBeVisible()
  await writeField(row.locator('demo-color-config c2-text-field.raw'), '#123456')
  await expect(button).toHaveCSS('--c2-button__container__selected--background-color', '#123456')
  await expect.poll(background).toBe(authored)

  await panel.locator('c2-tab[for="props"]').click()
  await panel.locator('demo-inspector-row[label="selected"] c2-switch').click()
  await expect(button).toHaveAttribute('selected', 'true')
  await expect.poll(background).toBe('rgb(18, 52, 86)')
  await panel.locator('c2-icon-button[aria-label="Reset this example to the authored values"]').click()
  await expect(button).not.toHaveAttribute('selected', 'true')
  await expect.poll(background).toBe(authored)
})

test('a composed child control writes to the accordion host and visibly themes its slotted details', async ({ page }) => {
  await page.goto('./components/accordion/gallery/')
  const accordion = page.locator('.example c2-accordion').first()
  await expect(accordion).toBeVisible()
  await page.evaluate(() => customElements.whenDefined('demo-component-configuration-panel'))
  await page.locator('.mdx-code-block-setting-btn').first().click()
  const panel = page.locator('demo-component-configuration-panel')
  await expect(panel.locator('.inspector')).toBeVisible()

  const child = accordion.locator('c2-details').first()
  const headerColor = () =>
    child.evaluate((host) => {
      const header = host.shadowRoot?.querySelector('summary')
      return header ? getComputedStyle(header).color : null
    })
  const authored = await headerColor()
  await panel.locator('c2-select.part-select').click()
  await panel.locator('c2-select.part-select c2-list-item[value="c2-details"]').click()
  await filterProperty(panel, '--c2-details__header--color')
  const row = panel.locator('demo-inspector-row[data-key="--c2-details__header--color"]')
  await expect(row).toBeVisible()
  await writeField(row.locator('demo-color-config c2-text-field.raw'), '#123456')

  await expect(accordion).toHaveCSS('--c2-details__header--color', '#123456')
  await expect(child).not.toHaveAttribute('style', /--c2-details__header--color/)
  await expect.poll(headerColor).toBe('rgb(18, 52, 86)')
  await row.locator('c2-icon-button[aria-label^="Revert "]').click()
  await expect.poll(headerColor).toBe(authored)
})

test('reset restores a gallery variant’s authored CSS instead of the component default', async ({ page }) => {
  await page.goto('./components/button/gallery/')
  const button = page.locator('.example__canvas c2-button.soft').first()
  await expect(button).toBeVisible()
  const background = () =>
    button.evaluate((host) => {
      const target = host.shadowRoot?.querySelector('.c2-button')
      return target ? getComputedStyle(target).backgroundColor : null
    })
  const authored = await background()
  expect(authored).not.toBe('rgb(2, 101, 220)')

  await page.evaluate(() => customElements.whenDefined('demo-component-configuration-panel'))
  await button.locator('xpath=ancestor::figure[contains(@class,"example")]').locator('.mdx-code-block-setting-btn').click()
  const panel = page.locator('demo-component-configuration-panel')
  await expect(panel.locator('.inspector')).toBeVisible()
  await filterProperty(panel, '--c2-button__container--background-color')
  const row = panel.locator('demo-inspector-row[data-key="--c2-button__container--background-color"]')
  await expect(row).toBeVisible()
  await writeField(row.locator('demo-color-config c2-text-field.hex'), '#123456')
  await expect.poll(background).toBe('rgba(18, 52, 86, 0.1)')

  await panel.locator('c2-icon-button[aria-label="Reset this example to the authored values"]').click()
  await expect.poll(background).toBe(authored)
  await expect(button).not.toHaveCSS('--c2-button__container--background-color', '#123456')
})
