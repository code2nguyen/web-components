import type { ComponentManifest, ManifestDeclarationItem, StateCssProperties } from '../store/manifest-declaration-item'
import * as changeCase from 'change-case'
import type { ManifestData, ManifestDataItem } from './types'
import { cloneDeep } from 'lodash-es'

export function normalizeManifest(value: ComponentManifest): ComponentManifest {
  value.allCssProperties = value.cssProperties ? [...value.cssProperties] : []
  value.stateCssProperties =
    value.cssProperties
      ?.filter((item) => item.type?.text.split(' - ').length == 2)
      .reduce((result, item) => {
        const [state, type] = item.type!.text.split(' - ')
        const stateName = changeCase.capitalCase(state)
        result[stateName] = result[stateName] ?? []
        result[stateName].push({ ...item, ...{ type: { text: type } } })
        return result
      }, {} as StateCssProperties) ?? {}
  value.cssProperties = value.cssProperties?.filter((item) => item.type?.text.split(' - ').length == 1)
  value.attributes.forEach((attr) => {
    if (attr.default == "''") attr.default = ''
  })
  return value
}

export function updateManifestCssValue(element: HTMLElement, cssProperties: ManifestDeclarationItem[]) {
  cssProperties.forEach((cssVariable) => {
    const cssVariableValue = element.computedStyleMap().get(cssVariable.name) as CSSUnparsedValue
    if (cssVariableValue && cssVariableValue.length > 0) {
      cssVariable.value = [...cssVariableValue.values()][0].toString()
    } else {
      cssVariable.value = undefined
    }
  })
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

  updateManifestCssValue(element, computedManifest.cssProperties)

  if (computedManifest.stateCssProperties) {
    Object.keys(computedManifest.stateCssProperties).forEach((state) => {
      updateManifestCssValue(element, computedManifest.stateCssProperties![state])
    })
  }

  computedManifest.attributes.forEach((attr) => {
    const attrValue = element.getAttribute(attr.name)
    if (attrValue != null) {
      attr.value = attrValue
    } else {
      attr.value = undefined
    }
  })

  return computedManifest
}
