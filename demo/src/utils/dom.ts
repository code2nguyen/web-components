import type { ManifestDataItem, ManifestData } from './types'

export function closestElementSibling(currentElement: HTMLElement, selector: string): HTMLElement | null {
  const parent = getParent(currentElement)

  let result = parent?.querySelector(selector)
  if (result) return result as HTMLElement

  const astroIslands = parent?.querySelectorAll('astro-island')
  if (astroIslands) {
    for (const island of astroIslands) {
      result = island?.querySelector(selector)
      if (result) return result as HTMLElement
    }
  }
  return null
}

export function nextSibling(currentElement: HTMLElement, tagName: string): HTMLElement | null {
  let element: ChildNode | null = currentElement.nextSibling
  while (element && element.nodeName != tagName) {
    element = element.nextSibling
  }
  return element as HTMLElement
}

export function firstChild(currentElement: HTMLElement, tagName: string): HTMLElement | null {
  for (const child of currentElement.childNodes) {
    if (child.nodeName == tagName) {
      return child as HTMLElement
    }
  }
  return null
}

export function getParent(currentElement: HTMLElement): HTMLElement {
  const parent = isAstroIsland(currentElement.parentElement!) ? currentElement.parentElement!.parentElement! : currentElement.parentElement!

  return parent
}

export function getComponentByUid(uid: string): HTMLElement | null {
  return document.querySelector(`#${uid}`)
}

export function extractManifestData(element: HTMLElement): ManifestData {
  const styles =
    element.dataset.style?.split(';').reduce((result, item) => {
      if (!item) return result
      const [key, value] = item.split(':')
      result[key.trim()] = value.trim()
      return result
    }, {} as ManifestDataItem) ?? {}

  const attributes: ManifestDataItem = {}
  for (const attr of element.attributes) {
    attributes[attr.name] = attr.value
  }
  const slots: ManifestDataItem = {}
  element.querySelectorAll('[slot]').forEach((slotItem) => {
    slots[slotItem.slot] = slotItem.outerHTML
  })
  const defaultSlot = element.querySelector(':not([slot])')
  if (defaultSlot) {
    slots['default'] = defaultSlot.outerHTML
  }
  if (element.innerText) {
    slots['default'] = slots['default'] ?? ''
    slots['default'] += element.innerText
  }

  return { styles, attributes, slots }
}

export function normalizeCssValue(value: string | undefined): string {
  if (!value) return ''

  if (isNumber(value)) {
    return `${value}px`
  }

  return value
}

export function isNumber(value: string): boolean {
  return /^-?\d+$/.test(value)
}

function isAstroIsland(element: HTMLElement) {
  return element.tagName == 'ASTRO-ISLAND'
}
