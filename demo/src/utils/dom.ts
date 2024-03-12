import type { AttributeDeclarationItem, CSSDeclarationItem } from '../store/manifest-declaration-item.ts'

export const PADDING_ORDER = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']
export const BORDER_RADIUS_ORDER = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius']

export const BORDER_ORDER = ['border', 'border-top', 'border-right', 'border-bottom', 'border-left']

export const FONT_PROPERTY = ['font-family', 'font-weight', 'font-size', 'font-style']

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

export function updateDomCssValue(element: HTMLElement, cssProperties: CSSDeclarationItem[]) {
  cssProperties.forEach((cssVariable) => {
    if (cssVariable.value && cssVariable.value !== cssVariable.default) {
      element.style.setProperty(cssVariable.cssVariable, cssVariable.value)
    } else {
      element.style.removeProperty(cssVariable.cssVariable)
    }
  })
}

export function updateDomAttribute(element: HTMLElement, manifestAttributes: AttributeDeclarationItem[]) {
  manifestAttributes.forEach((attr) => {
    setElemenetAttribute(element, attr)
  })
}

export function getElemenetProperty(element: HTMLElement, propertyName: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value = (element as any)[propertyName]

  if (value == undefined || value == null) return undefined
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(';')

  return JSON.stringify(value)
}

export function setElemenetAttribute(element: HTMLElement, attribute: AttributeDeclarationItem) {
  if (attribute.value == null || attribute.value == undefined || (attribute.type == 'boolean' && attribute.value === 'false')) {
    element.removeAttribute(attribute.name)
  } else {
    element.setAttribute(attribute.name, attribute.value)
  }
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

// export function extractManifestData(element: HTMLElement, componentManifest: ComponentManifest): ComponentManifest {
//   const styles =
//     element.dataset.style?.split(';').reduce((result, item) => {
//       if (!item) return result
//       const [key, value] = item.split(':')
//       result[key.trim()] = value.trim()
//       return result
//     }, {} as ManifestDataItem) ?? {}

//   const attributes: ManifestDataItem = {}
//   for (const attr of element.attributes) {
//     attributes[attr.name] = attr.value
//   }
//   const slots: ManifestDataItem = {}
//   element.querySelectorAll('[slot]').forEach((slotItem) => {
//     slots[slotItem.slot] = slotItem.outerHTML
//   })
//   const defaultSlot = element.querySelector(':not([slot])')
//   if (defaultSlot) {
//     slots['default'] = defaultSlot.outerHTML
//   }
//   if (element.innerText) {
//     slots['default'] = slots['default'] ?? ''
//     slots['default'] += element.innerText
//   }

//   return { styles, attributes, slots }
// }

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
