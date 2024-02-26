import type { ComponentManifest, ManifestDeclarationItem } from '../store/manifest-declaration-item'
import * as changeCase from 'change-case'
import type { ManifestData } from './types'
import { cloneDeep } from 'lodash-es'

export function normalizeManifest(value: ComponentManifest): ComponentManifest {
  value.stateCssProperties =
    value.cssProperties
      ?.filter((item) => item.type?.text.split(' - ').length == 2)
      .reduce(
        (result, item) => {
          const [state, type] = item.type!.text.split(' - ')
          const stateName = changeCase.capitalCase(state)
          result[stateName] = result[state] ?? []
          result[stateName].push({ ...item, ...{ type: { text: type } } })
          return result
        },
        {} as {
          [state: string]: ManifestDeclarationItem[]
        },
      ) ?? {}
  value.cssProperties = value.cssProperties?.filter((item) => item.type?.text.split(' - ').length == 1)
  return value
}

export function getComponentManifestData(manifestData: ManifestData, defaultManifest: ComponentManifest): ComponentManifest {
  const computedManifest: ComponentManifest = cloneDeep(defaultManifest)
  computedManifest.host = {
    w: manifestData.styles.width ?? 'auto',
    h: manifestData.styles.height ?? 'auto',
  }
  computedManifest.cssProperties.forEach((item) => {
    const cssVariableName = Object.keys(manifestData.styles).find((cssVariable) => cssVariable == item.name)
    if (cssVariableName) {
      item.value = manifestData.styles[cssVariableName]
    }
  })

  computedManifest.attributes.forEach((item) => {
    const attrName = Object.keys(manifestData.attributes).find((attr) => attr == item.name)
    if (attrName) {
      item.value = manifestData.attributes[attrName]
    }
  })

  computedManifest.slots.forEach((item) => {
    const slotName = Object.keys(manifestData.slots).find((slot) => slot == item.name)
    if (slotName) {
      item.value = manifestData.slots[slotName]
    }
  })

  return computedManifest
}
