import type { Package, CustomElement } from 'custom-elements-manifest/schema.ts'
import sideNav from '@c2n/side-nav/custom-elements.json'
import card from '@c2n/card/custom-elements.json'
import checkbox from '@c2n/checkbox/custom-elements.json'
import colorSelect from '@c2n/color-select/custom-elements.json'
import colorArea from '@c2n/color-area/custom-elements.json'
import colorSlider from '@c2n/color-slider/custom-elements.json'
import listItem from '@c2n/list-item/custom-elements.json'
import overlay from '@c2n/overlay/custom-elements.json'
import select from '@c2n/select/custom-elements.json'
import dropdownList from '@c2n/dropdown-list/custom-elements.json'
import list from '@c2n/list/custom-elements.json'
import tabs from '@c2n/tabs/custom-elements.json'
import codeViewer from '@c2n/code-viewer/custom-elements.json'
import label from '@c2n/label/custom-elements.json'
import details from '@c2n/details/custom-elements.json'
import expansionPanel from '@c2n/expansion-panel/custom-elements.json'
import hyperlinkList from '@c2n/hyperlink-list/custom-elements.json'

import { normalizeManifest } from '../utils/manifest-utils.ts'
import type { ComponentManifests } from './manifest-declaration-item.ts'

export const componentManifests = (function () {
  const nomalizedManifests: ComponentManifests = [
    sideNav,
    details,
    hyperlinkList,
    expansionPanel,
    checkbox,
    colorSelect,
    colorArea,
    colorSlider,
    listItem,
    overlay,
    select,
    dropdownList,
    card,
    list,
    tabs,
    codeViewer,
    label,
  ].reduce((result, item) => {
    const pkg = item as Package
    for (const module of pkg.modules) {
      if (module.declarations) {
        for (const declaration of module.declarations) {
          const customElementDeclaration = declaration as CustomElement
          if (customElementDeclaration.tagName) {
            result[customElementDeclaration.tagName] = normalizeManifest(customElementDeclaration)
          }
        }
      }
    }
    return result
  }, {} as ComponentManifests)

  Object.keys(nomalizedManifests).forEach((componentTag) => {
    const manifest = nomalizedManifests[componentTag]
    manifest.internalComponents.concat(manifest.slotComponents).forEach((item) => {
      if (nomalizedManifests[item]) {
        manifest.allCssProperties = [...manifest.allCssProperties, ...nomalizedManifests[item].cssProperties]
      }
    })
  })
  console.log(nomalizedManifests)
  return nomalizedManifests
})()
