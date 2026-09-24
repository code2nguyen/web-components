import type { CSSDeclarationItem } from '../store/manifest-declaration-item.ts'
import { BORDER_RADIUS_ORDER, FONT_PROPERTY, PADDING_ORDER, shortName } from './dom.ts'
import { KEYWORD_OPTIONS, UNITLESS_TYPES } from './css-value.ts'

export type InspectorControlFamily =
  'padding-shorthand' | 'padding-sides' | 'radius-shorthand' | 'radius-corners' | 'font' | 'color' | 'border' | 'length' | 'keyword' | 'text'

export interface InspectorDescriptor {
  key: string
  label: string
  description?: string
  names: string[]
  controlFamily: InspectorControlFamily
  items: CSSDeclarationItem[]
  stacked: boolean
}

/** Manifest membership, not a variable-name prefix, establishes which tag owns a panel part. */
export function selectInspectorProperties(allProperties: CSSDeclarationItem[], ownerProperties: CSSDeclarationItem[]): CSSDeclarationItem[] {
  const owned = new Set(ownerProperties.map((item) => item.cssVariable))
  return allProperties.filter((item) => owned.has(item.cssVariable))
}

function scalarFamily(item: CSSDeclarationItem): InspectorControlFamily {
  const type = item.type
  if (type === 'color' || type === 'background' || type === 'background-color') return 'color'
  if (type === 'border' || type === 'outline') return 'border'
  if (
    type === 'opacity' ||
    type === 'time' ||
    type === 'duration' ||
    UNITLESS_TYPES.includes(type) ||
    ['pixel', 'font-size', 'line-height', 'letter-spacing', 'margin', 'max-height'].includes(type)
  ) {
    return 'length'
  }
  if (KEYWORD_OPTIONS[type] || KEYWORD_OPTIONS[item.property]) return 'keyword'
  return 'text'
}

/** A pure, exhaustive mapping from one manifest group to one control owner per public variable. */
export function buildInspectorDescriptors(cssProperties: CSSDeclarationItem[]): InspectorDescriptor[] {
  const seen = new Set<string>()
  for (const item of cssProperties) {
    if (seen.has(item.cssVariable)) throw new Error(`duplicate inspector property ${item.cssVariable}`)
    seen.add(item.cssVariable)
  }
  let remaining = [...cssProperties]
  const rows: InspectorDescriptor[] = []
  const take = (items: CSSDeclarationItem[], controlFamily: InspectorControlFamily, label: string) => {
    if (!items.length) return
    remaining = remaining.filter((item) => !items.includes(item))
    const names = items.map((item) => item.cssVariable)
    rows.push({ key: names.join('|'), label, description: items[0].description, names, controlFamily, items, stacked: controlFamily !== 'text' })
  }
  const takeBox = (shorthand: string, order: string[], shorthandFamily: InspectorControlFamily, longhandFamily: InspectorControlFamily, label: string) => {
    const single = remaining.find((item) => item.property === shorthand)
    if (single) take([single], shorthandFamily, shortName(shorthand))
    const longhands = order.map((name) => remaining.find((item) => item.property === name)).filter((item): item is CSSDeclarationItem => !!item)
    if (longhands.length === 4) take(longhands, longhandFamily, label)
  }

  takeBox('padding', PADDING_ORDER, 'padding-shorthand', 'padding-sides', 'Padding')
  takeBox('border-radius', BORDER_RADIUS_ORDER, 'radius-shorthand', 'radius-corners', 'Radius')

  const fontItems = remaining.filter((item) => FONT_PROPERTY.includes(item.property))
  if (fontItems.length) take(fontItems, 'font', 'Font')

  for (const item of remaining) {
    const family = scalarFamily(item)
    rows.push({
      key: item.cssVariable,
      label: shortName(item.property) || item.cssVariable,
      description: item.description,
      names: [item.cssVariable],
      controlFamily: family,
      items: [item],
      stacked: family === 'border',
    })
  }
  return rows
}
