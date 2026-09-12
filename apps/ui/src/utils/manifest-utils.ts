import type { CssCustomProperty, CustomElement } from 'custom-elements-manifest/schema.ts'

import type {
  AttributeDeclarationItem,
  CSSDeclarationItem,
  ComponentManifest,
  EventDeclarationItem,
  FlattenGroupedCssVariable,
  GroupedCssVariables,
} from '../store/manifest-declaration-item.ts'
import type { ManifestDataItem } from './types.ts'
import { cloneDeep } from 'lodash-es'
import { getElemenetProperty } from './dom.ts'

export function normalizeManifest(value: CustomElement): ComponentManifest {
  value.attributes = value.attributes ?? []
  value.attributes.forEach((attr) => {
    if (attr.default) attr.default = attr.default.replace(/^'|'$/g, '')
    attr.name = attr.name.toLowerCase()
  })

  const attributes: AttributeDeclarationItem[] = value.attributes
    .filter((item) => item.name)
    .map((item) => {
      return {
        name: item.name,
        type: item.type?.text ?? 'CustomEvent',
        default: item.default ?? '',
        description: item.description,
      }
    })
  const cssProperties = normalizeCssDeclaration(value.cssProperties)

  const events: EventDeclarationItem[] =
    value.events
      ?.filter((item) => item.name)
      .map((item) => {
        return {
          name: item.name,
          type: item.type?.text ?? '',
          description: item.description,
        }
      }) ?? []

  return {
    host: {},
    attributes,
    cssProperties,
    events,
    allCssProperties: [...cssProperties],
    internalComponents: value.internalComponents ?? [],
    slotComponents: value.slotComponents ?? [],
    tagName: value.tagName ?? '',
    siblingTags: [],
  }
}

export function normalizeCssDeclaration(cssProperties?: CssCustomProperty[]): CSSDeclarationItem[] {
  return (
    cssProperties
      ?.filter((item) => item.name)
      .map((item) => {
        const items = item.name.split('--')
        const blocks = items.length > 1 ? items[1].split('__') : []
        const property = items.length > 2 ? items[2] : ''
        return {
          cssVariable: item.name,
          type: item.type?.text ?? '',
          default: item.default,
          blocks,
          property,
          description: item.description,
        }
      }) ?? []
  )
}

/**
 * Reads the computed value of a custom property. The Typed OM hands back the raw token stream, which keeps the
 * whitespace after the colon (`" 18px"`), so every read is trimmed: an untrimmed value leaks into the text fields
 * and makes the change diff compare `" 18px"` against `"18px"`.
 */
function readCssVariable(element: HTMLElement, name: string): string | undefined {
  try {
    if (typeof element.computedStyleMap === 'function') {
      const value = element.computedStyleMap().get(name) as CSSUnparsedValue | undefined
      if (value && value.length > 0) {
        const first = [...value.values()][0]
        const text = (typeof first === 'string' ? first : first.toString()).trim()
        if (text) return text
      }
    }
  } catch {
    // Some engines expose part of Typed OM but still reject custom-property reads.
  }

  // Firefox and older WebKit builds do not expose CSS Typed OM. The string API still returns custom properties and
  // keeps the studio functional instead of aborting before `showConfig` can be set.
  return getComputedStyle(element).getPropertyValue(name).trim() || undefined
}

export function updateManifestCssValue(element: HTMLElement, cssProperties: CSSDeclarationItem[]) {
  cssProperties.forEach((cssVariable) => {
    cssVariable.value = readCssVariable(element, cssVariable.cssVariable)
  })
}

export function updateManifestAttributes(element: HTMLElement, attributes: AttributeDeclarationItem[]) {
  attributes.forEach((attr) => {
    const attrValue = getElemenetProperty(element, attr.name)
    attr.value = attrValue
  })
}

export function saveInitialStyle(element: HTMLElement, cssProperties: CSSDeclarationItem[]) {
  // The authored inline style is restored before each sync so inline-declared variables survive editing.
  if (element.dataset.initialInlineStyle === undefined) {
    element.dataset.initialInlineStyle = element.getAttribute('style') ?? ''
  }
  if (!element.dataset.initialStyles) {
    const initialStyles: Record<string, string> = {}
    cssProperties.forEach((cssVariable) => {
      const value = readCssVariable(element, cssVariable.cssVariable)
      if (value !== undefined) initialStyles[cssVariable.cssVariable] = value
    })
    element.dataset.initialStyles = JSON.stringify(initialStyles)
  }
}

export function getComponentManifestData(element: HTMLElement, defaultManifest: ComponentManifest): ComponentManifest {
  const computedManifest: ComponentManifest = cloneDeep(defaultManifest)
  const styles =
    element.dataset.style?.split(';').reduce((result, item) => {
      if (!item) return result
      const [key, value] = item.split(':')
      result[key.trim()] = value.trim()
      return result
    }, {} as ManifestDataItem) ?? {}

  computedManifest.host = {
    w: styles.width ?? 'auto',
    h: styles.height ?? 'auto',
  }

  updateManifestCssValue(element, computedManifest.allCssProperties)
  updateManifestAttributes(element, computedManifest.attributes)

  return computedManifest
}

export function groupCssProperties(cssProperties: CSSDeclarationItem[]): GroupedCssVariables[] {
  const groupedCssProperties: GroupedCssVariables[] = []
  for (const item of cssProperties) {
    let cursor = groupedCssProperties
    for (const [index, groupName] of item.blocks.entries()) {
      let group = cursor.find((iter) => iter.groupName == groupName)
      if (!group) {
        group = { groups: item.blocks.slice(0, index + 1), groupName, cssProperties: [], subGroups: [], level: index }
        cursor.push(group)
      }
      if (index == item.blocks.length - 1) {
        group.cssProperties.push(item)
      } else {
        cursor = group.subGroups
      }
    }
  }
  return groupedCssProperties
}

export function deepFlatGroupCssProperties(groupedCssProperties: GroupedCssVariables[]): FlattenGroupedCssVariable[] {
  const result: FlattenGroupedCssVariable[] = []

  for (const group of groupedCssProperties) {
    result.push({
      groupName: group.groupName,
      fullGroupName: group.groups.join(' > '),
      level: group.level,
    })
    for (const cssProperty of group.cssProperties) {
      result.push({
        groupName: group.groupName,
        fullGroupName: group.groups.join(' > '),
        level: group.level,
        cssProperty: cssProperty,
      })
    }
    if (group.subGroups.length > 0) {
      const flattenSubGroup = deepFlatGroupCssProperties(group.subGroups)
      result.push(...flattenSubGroup)
    }
  }
  return result
}

export function flatGroupCssProperties(groupedCssProperties: GroupedCssVariables[]): GroupedCssVariables[] {
  const result: GroupedCssVariables[] = []

  for (const group of groupedCssProperties) {
    if (group.cssProperties.length > 0) {
      result.push(group)
    }
    if (group.subGroups.length > 0) {
      const flattenSubGroup = flatGroupCssProperties(group.subGroups)
      result.push(...flattenSubGroup)
    }
  }
  return result
}
