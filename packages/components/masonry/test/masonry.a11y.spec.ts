import { test, expect } from './fixture'
import AxeBuilder from '@axe-core/playwright'

test('keeps tall content inside its declared tile height and reachable', async ({ page, scenario }) => {
  await scenario('overflow')
  const tile = page.locator('c2-masonry-item')
  const content = tile.locator('[part="content"]')
  await expect(content).toBeVisible()
  const metrics = await content.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }))
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight)
  await content.focus()
  await page.keyboard.press('End')
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await page.locator('#content-button').click()
  await expect(page.locator('#content-activations')).toHaveText('1')
})

test('offers named edit controls, status, focus and an accessible edit state', async ({ page, scenario }) => {
  await scenario('editing')
  const move = page.getByRole('button', { name: 'Move Tile 1' })
  const resize = page.getByRole('button', { name: 'Resize Tile 1' })
  await expect(move).toBeVisible()
  await expect(resize).toBeVisible()
  await move.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('c2-masonry').getByRole('status')).toContainText('Tile 1')
  await page.keyboard.press('Escape')
  await expect(move).toBeFocused()
  const scan = await new AxeBuilder({ page }).analyze()
  expect(scan.violations).toEqual([])
})

test('reveals the move handle and right/bottom resize edges on hover and focus', async ({ page, scenario }) => {
  await scenario('editing')
  const tile = page.locator('c2-masonry-item').first()
  const moveHandle = tile.locator('[part="move-handle"]')
  const controls = tile.locator('[part="controls"]')
  const move = await moveHandle.boundingBox()
  const target = tile.locator('[part="resize-handle"]')
  const right = tile.locator('[data-masonry-edge="right"]')
  const resize = await target.boundingBox()
  const bounds = await tile.boundingBox()
  expect(move).not.toBeNull()
  expect(resize).not.toBeNull()
  expect(bounds).not.toBeNull()
  expect(move!.y).toBeLessThan(bounds!.y + bounds!.height / 2)
  expect(resize!.y + resize!.height).toBeCloseTo(bounds!.y + bounds!.height, 0)
  expect(resize!.width).toBeCloseTo(bounds!.width, 0)
  await expect(target).toHaveCSS('height', '8px')
  await expect(target).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(target).toHaveCSS('cursor', 'ns-resize')
  await expect(target.locator('svg, slot')).toHaveCount(0)
  await expect(right).toHaveCount(1)
  await expect(target).toHaveCount(1)
  for (const edge of ['top', 'left']) await expect(tile.locator(`[data-masonry-edge="${edge}"]`)).toHaveCount(0)
  await page.mouse.move(0, 0)
  await expect(moveHandle).toHaveCSS('opacity', '0')
  expect(await controls.evaluate((element) => getComputedStyle(element, '::after').opacity)).toBe('0')
  await tile.hover()
  await expect(moveHandle).toHaveCSS('opacity', '1')
  await expect(moveHandle).toHaveCSS('cursor', 'move')
  await expect(moveHandle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  expect(await controls.evaluate((element) => getComputedStyle(element, '::after').opacity)).toBe('1')
  expect(await controls.evaluate((element) => getComputedStyle(element, '::after').borderRightColor)).toBe('rgba(37, 99, 235, 0.35)')
  expect(await controls.evaluate((element) => getComputedStyle(element, '::after').borderBottomColor)).toBe('rgba(37, 99, 235, 0.35)')
  await page.mouse.move(0, 0)
  await expect(moveHandle).toHaveCSS('opacity', '0')
  expect(await controls.evaluate((element) => getComputedStyle(element, '::after').opacity)).toBe('0')
  await moveHandle.focus()
  await expect(moveHandle).toHaveCSS('opacity', '1')
  expect(await controls.evaluate((element) => getComputedStyle(element, '::after').opacity)).toBe('1')
  await tile.evaluate((element) => {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    icon.setAttribute('slot', 'move-icon')
    element.append(icon)
  })
  await expect(tile.locator('svg[slot="move-icon"]')).toHaveCSS('pointer-events', 'none')
  await moveHandle.hover()
  await expect(moveHandle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await target.focus()
  await expect(target).toHaveCSS('outline-width', '2px')
})

test('animates relocated tiles and disables the motion under reduced-motion preference', async ({ page, scenario }) => {
  await scenario('editing')
  const host = page.locator('c2-masonry')
  await host.evaluate((element) => (element as HTMLElement).style.setProperty('--c2-masonry__motion--duration', '2s'))
  const move = page.getByRole('button', { name: 'Move Tile 1' })
  await move.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => host.locator('.tile').evaluateAll((tiles) => tiles.some((tile) => tile.getAnimations().length > 0))).toBe(true)
  await page.keyboard.press('Escape')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await move.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => host.getByRole('status').textContent()).toContain('position 2')
  expect(await host.locator('.tile').evaluateAll((tiles) => tiles.some((tile) => tile.getAnimations().length > 0))).toBe(false)
  await page.keyboard.press('Escape')
})

test('keeps slotted controls usable and honors reduced motion', async ({ page, scenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await scenario('overflow-editing')
  await page.locator('#content-button').click()
  await expect(page.locator('#content-activations')).toHaveText('1')
  await expect(page.locator('c2-masonry').locator('[part="move-handle"]')).toBeVisible()
  await expect(page.locator('c2-masonry').locator('.tile')).toHaveCSS('transition-duration', '0s')
  const scan = await new AxeBuilder({ page }).analyze()
  expect(scan.violations).toEqual([])
})

test('public container variables affect the grid, motion, and candidate target', async ({ page, scenario }) => {
  await scenario('editing')
  const host = page.locator('c2-masonry')
  await host.evaluate((element) => {
    const style = (element as HTMLElement).style
    for (const [name, value] of Object.entries({
      '--c2-masonry--gap': '13px',
      '--c2-masonry--row-height': '17px',
      '--c2-masonry--padding': '11px',
      '--c2-masonry--background': 'rgb(20 30 40)',
      '--c2-masonry--border': '3px solid rgb(40 50 60)',
      '--c2-masonry--border-radius': '15px',
      '--c2-masonry__placeholder--background': 'rgb(60 70 80)',
      '--c2-masonry__placeholder--border': '4px dashed rgb(80 90 100)',
      '--c2-masonry__placeholder--border-radius': '9px',
      '--c2-masonry__motion--duration': '1s',
      '--c2-masonry__motion--timing-function': 'linear',
    }))
      style.setProperty(name, value)
  })
  await expect(host).toHaveCSS('border-top-width', '3px')
  await expect(host).toHaveCSS('border-top-left-radius', '15px')
  const grid = host.locator('[part="grid"]')
  await expect(grid).toHaveCSS('gap', '13px')
  await expect(grid).toHaveCSS('grid-auto-rows', '17px')
  await expect(grid).toHaveCSS('padding-top', '11px')
  await expect(grid).toHaveCSS('background-color', 'rgb(20, 30, 40)')
  await expect(grid.locator('.tile').first()).toHaveCSS('transition-duration', '1s')
  await expect(grid.locator('.tile').first()).toHaveCSS('transition-timing-function', 'linear')
  const move = host.locator('[part="move-handle"]').first()
  await move.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  const placeholder = host.locator('[part="placeholder"]')
  await expect(placeholder).toHaveCSS('background-color', 'rgb(60, 70, 80)')
  await expect(placeholder).toHaveCSS('border-top-width', '4px')
  await expect(placeholder).toHaveCSS('border-top-style', 'dashed')
  await expect(placeholder).toHaveCSS('border-top-left-radius', '9px')
  await page.keyboard.press('Escape')
})

test('public tile variables and parts affect content, controls, and active state', async ({ page, scenario }) => {
  await scenario('editing')
  const tile = page.locator('c2-masonry-item').first()
  await tile.evaluate((element) => {
    const style = (element as HTMLElement).style
    for (const [name, value] of Object.entries({
      '--c2-masonry-item--background': 'rgb(10 20 30)',
      '--c2-masonry-item--border': '2px solid rgb(30 40 50)',
      '--c2-masonry-item--border-radius': '14px',
      '--c2-masonry-item--box-shadow': '0px 4px 8px rgb(0 0 0)',
      '--c2-masonry-item__content--padding': '12px',
      '--c2-masonry-item__controls--gap': '7px',
      '--c2-masonry-item__controls--background': 'rgb(50 60 70)',
      '--c2-masonry-item__handle--size': '40px',
      '--c2-masonry-item__resize-handle--size': '52px',
      '--c2-masonry-item__resize-edge__hover--color': 'rgb(160 170 180)',
      '--c2-masonry-item__handle--icon-size': '20px',
      '--c2-masonry-item__handle--color': 'rgb(70 80 90)',
      '--c2-masonry-item__handle--background': 'rgb(90 100 110)',
      '--c2-masonry-item__handle--border-radius': '11px',
      '--c2-masonry-item__handle__hover--background': 'rgb(110 120 130)',
      '--c2-masonry-item__handle__focus--outline': '3px solid rgb(130 140 150)',
      '--c2-masonry-item__dragging--opacity': '0.5',
      '--c2-masonry-item__dragging--box-shadow': '0px 8px 16px rgb(0 0 0)',
    }))
      style.setProperty(name, value)
  })
  await expect(tile).toHaveCSS('background-color', 'rgb(10, 20, 30)')
  await expect(tile).toHaveCSS('border-top-width', '2px')
  await expect(tile).toHaveCSS('border-top-left-radius', '14px')
  await expect(tile).toHaveCSS('box-shadow', 'rgb(0, 0, 0) 0px 4px 8px 0px')
  await expect(tile.locator('[part="content"]')).toHaveCSS('padding-top', '12px')
  await expect(tile.locator('[part="move-handle"]')).toHaveCSS('top', '7px')
  await expect(tile.locator('[part="move-handle"]')).toHaveCSS('right', '7px')
  expect(await tile.locator('[part="controls"]').evaluate((element) => getComputedStyle(element, '::before').backgroundColor)).toBe('rgb(50, 60, 70)')
  const move = tile.locator('[part="move-handle"]')
  await expect(move).toHaveCSS('width', '40px')
  await expect(tile.locator('[part="resize-handle"]')).toHaveCSS('height', '52px')
  await expect(move.locator('svg')).toHaveCSS('width', '20px')
  await expect(move).toHaveCSS('color', 'rgb(70, 80, 90)')
  await expect(move).toHaveCSS('background-color', 'rgb(90, 100, 110)')
  await expect(move).toHaveCSS('border-top-left-radius', '11px')
  await move.hover()
  await expect(move).toHaveCSS('background-color', 'rgb(110, 120, 130)')
  const highlight = await tile.locator('[part="controls"]').evaluate((element) => {
    const style = getComputedStyle(element, '::after')
    return { rightColor: style.borderRightColor, bottomColor: style.borderBottomColor, radius: style.borderTopRightRadius }
  })
  expect(highlight).toEqual({ rightColor: 'rgb(160, 170, 180)', bottomColor: 'rgb(160, 170, 180)', radius: '14px' })
  await move.focus()
  await expect(move).toHaveCSS('outline-width', '3px')
  await page.keyboard.press('Enter')
  await expect(tile).toHaveCSS('opacity', '0.5')
  await expect(tile).toHaveCSS('box-shadow', 'rgb(0, 0, 0) 0px 8px 16px 0px')
  await page.keyboard.press('Escape')
})

test('all documented CSS parts accept consumer styling', async ({ page, scenario }) => {
  await scenario('editing')
  await page.addStyleTag({
    content: `c2-masonry::part(grid) { outline: 1px solid rgb(1 2 3); }
      c2-masonry::part(placeholder) { outline: 2px solid rgb(2 3 4); }
      c2-masonry-item::part(content) { outline: 3px solid rgb(3 4 5); }
      c2-masonry-item::part(controls) { outline: 4px solid rgb(4 5 6); }
      c2-masonry-item::part(move-handle) { outline: 5px solid rgb(5 6 7); }
      c2-masonry-item::part(resize-handle) { outline: 6px solid rgb(6 7 8); }
      c2-masonry-item::part(resize-edge) { outline: 7px solid rgb(7 8 9); }`,
  })
  const host = page.locator('c2-masonry')
  const tile = page.locator('c2-masonry-item').first()
  await expect(host.locator('[part="grid"]')).toHaveCSS('outline-width', '1px')
  await expect(tile.locator('[part="content"]')).toHaveCSS('outline-width', '3px')
  await expect(tile.locator('[part="controls"]')).toHaveCSS('outline-width', '4px')
  await expect(tile.locator('[part="move-handle"]')).toHaveCSS('outline-width', '5px')
  await expect(tile.locator('[part="resize-handle"]')).toHaveCSS('outline-width', '6px')
  await expect(tile.locator('[part="resize-edge"]').first()).toHaveCSS('outline-width', '7px')
  await tile.locator('[part="move-handle"]').focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await expect(host.locator('[part="placeholder"]')).toHaveCSS('outline-width', '2px')
})
