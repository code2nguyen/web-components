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

/** Row labels: the CSS property name, shortened where the long form only adds noise in a 400px panel. */
const SHORT_NAMES: Record<string, string> = {
  'background-color': 'background',
  'box-shadow': 'shadow',
  'border-top-left-radius': 'top left',
  'border-top-right-radius': 'top right',
  'border-bottom-right-radius': 'bottom right',
  'border-bottom-left-radius': 'bottom left',
  'text-decoration-color': 'decoration',
  'outline-offset': 'offset',
}

export function shortName(propertyName: string) {
  return SHORT_NAMES[propertyName] ?? propertyName
}

/** `container__selected` -> `container · selected`, with the component prefix (`c2-checkbox`) dropped. */
export function groupLabel(groups: string[], componentTag: string): string {
  const parts = groups.filter((group) => group !== componentTag)
  return parts.length > 0 ? parts.join(' · ') : 'Root'
}

export function updateDomCssValue(element: HTMLElement, cssProperties: CSSDeclarationItem[]) {
  cssProperties.forEach((cssVariable) => {
    if (cssVariable.value) {
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
  // Manifest attribute names are kebab-case (`selected-tab`); the Lit property behind them is camelCase (`selectedTab`).
  const camelName = propertyName.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value = (element as any)[propertyName] ?? (element as any)[camelName]

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

export function getComponentByUid(uid: string): (HTMLElement & { _initComponent?: () => void }) | null {
  return document.querySelector(`[data-target-uid="${uid}"]`)
}

/**
 * The authored value of every CSS variable of an example, captured once by `saveInitialStyle`.
 *
 * Stored as JSON: the previous `name:value;name:value` encoding split on `:` and `;`, so any value containing either
 * (`url(https://…)`, a multi-shadow list, `background: rgb(0 0 0 / 40%)`) was truncated — which silently corrupted
 * Reset and the "Customized" diff.
 */
export function getInitialStyles(uid: string): Record<string, string> {
  const element = getComponentByUid(uid)
  return parseInitialStyles(element?.dataset.initialStyles)
}

export function parseInitialStyles(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
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
