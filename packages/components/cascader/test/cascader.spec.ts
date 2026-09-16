import { accessible } from '../../../../tests/component-fixture'
import type { Cascader } from '../src/cascader'
import { test, expect } from './fixture'

test('opens one column per level and commits a leaf path', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-cascader')
  const trigger = page.getByRole('button', { name: 'Location' })

  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('treeitem', { name: 'Zhejiang' }).click()
  await page.getByRole('treeitem', { name: 'Hangzhou' }).click()
  await expect(page.getByRole('treeitem', { name: 'West Lake' })).toBeVisible()
  await page.getByRole('treeitem', { name: 'West Lake' }).click()

  await expect(host).toHaveJSProperty('value', ['zhejiang', 'hangzhou', 'west-lake'])
  await expect(trigger).toContainText('Zhejiang / Hangzhou / West Lake')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(host).toHaveAttribute('data-change', /"complete":true/)
})

test('navigates the hierarchy with the keyboard', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-cascader')
  const trigger = page.getByRole('button', { name: 'Location' })

  await trigger.focus()
  await trigger.press('ArrowDown')
  await expect(page.getByRole('treeitem', { name: 'Zhejiang' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  const province = page.getByRole('treeitem', { name: 'Jiangsu' })
  await expect(province).toBeFocused()
  await province.press('ArrowRight')
  const city = page.getByRole('treeitem', { name: 'Nanjing' })
  await expect(city).toBeFocused()
  await city.press('ArrowRight')
  const leaf = page.getByRole('treeitem', { name: 'Xuanwu' })
  await expect(leaf).toBeFocused()
  await leaf.press('Enter')

  await expect(host).toHaveJSProperty('value', ['jiangsu', 'nanjing', 'xuanwu'])
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

test('expands branches on hover when configured', async ({ page, scenario }) => {
  await scenario('hover')
  await page.getByRole('button', { name: 'Location' }).click()
  await page.getByRole('treeitem', { name: 'Zhejiang' }).hover()
  await expect(page.getByRole('treeitem', { name: 'Hangzhou' })).toBeVisible()
  await page.getByRole('treeitem', { name: 'Hangzhou' }).hover()
  await expect(page.getByRole('treeitem', { name: 'West Lake' })).toBeVisible()
})

test('can commit an intermediate branch without closing the panel', async ({ page, scenario }) => {
  await scenario('branch')
  const host = page.locator('c2-cascader')
  const trigger = page.getByRole('button', { name: 'Location' })

  await trigger.click()
  await page.getByRole('treeitem', { name: 'Zhejiang' }).click()

  await expect(host).toHaveJSProperty('value', ['zhejiang'])
  await expect(host).toHaveAttribute('data-change', /"complete":false/)
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
})

test('submits the path and participates in required validation', async ({ page, scenario }) => {
  await scenario('form')
  const host = page.locator('c2-cascader')

  await expect.poll(() => host.evaluate((element: Cascader) => element.validity.valueMissing)).toBe(true)
  await page.getByRole('button', { name: 'Location' }).click()
  await page.getByRole('treeitem', { name: 'Zhejiang' }).click()
  await page.getByRole('treeitem', { name: 'Ningbo' }).click()

  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('location'))).toBe('zhejiang;ningbo')
  await expect.poll(() => host.evaluate((element: Cascader) => element.validity.valid)).toBe(true)
})

test('keeps custom rendering inside interactive option rows', async ({ page, scenario }) => {
  await scenario('custom')
  await page.getByRole('button', { name: 'Location' }).click()
  const option = page.getByRole('treeitem', { name: /ZhejiangLevel 1/ })
  await expect(option.locator('strong')).toHaveText('Zhejiang')
  await expect(option.locator('small')).toHaveText('Level 1')
})

test('supports empty and disabled states', async ({ page, scenario }) => {
  await scenario('empty')
  await page.getByRole('button', { name: 'Location' }).click()
  await expect(page.getByRole('status')).toHaveText('No options available.')

  await scenario('disabled')
  await expect(page.getByRole('button', { name: 'Location' })).toBeDisabled()
})

test('has no detectable accessibility violations', async ({ page, scenario }) => {
  await scenario()
  await accessible(page)
  await page.getByRole('button', { name: 'Location' }).click()
  await page.getByRole('treeitem', { name: 'Zhejiang' }).click()
  await accessible(page)
})
