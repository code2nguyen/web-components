import type { Package, CustomElement } from 'custom-elements-manifest/schema.ts'
import skeleton from '@c2n/skeleton/custom-elements.json'
import progress from '@c2n/progress/custom-elements.json'
import kbd from '@c2n/kbd/custom-elements.json'
import table from '@c2n/table/custom-elements.json'
import copyButton from '@c2n/copy-button/custom-elements.json'
import textarea from '@c2n/textarea/custom-elements.json'
import switchManifest from '@c2n/switch/custom-elements.json'
import spinner from '@c2n/spinner/custom-elements.json'
import slider from '@c2n/slider/custom-elements.json'
import seperator from '@c2n/seperator/custom-elements.json'
import breadcrumb from '@c2n/breadcrumb/custom-elements.json'
import badge from '@c2n/badge/custom-elements.json'
import toast from '@c2n/toast/custom-elements.json'
import radio from '@c2n/radio/custom-elements.json'
import buttonGroup from '@c2n/button-group/custom-elements.json'
import accordion from '@c2n/accordion/custom-elements.json'
import modal from '@c2n/modal/custom-elements.json'
import button from '@c2n/button/custom-elements.json'
import chatInput from '@c2n/chat-input/custom-elements.json'
import chatMessage from '@c2n/chat-message/custom-elements.json'
import avatar from '@c2n/avatar/custom-elements.json'
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
import iconButton from '@c2n/icon-button/custom-elements.json'
import matIcon from '@c2n/mat-icon/custom-elements.json'
import linkButton from '@c2n/link-button/custom-elements.json'
import textField from '@c2n/text-field/custom-elements.json'
import tooltip from '@c2n/tooltip/custom-elements.json'
import featherIcons from '@c2n/feather-icons/custom-elements.json'

import { normalizeManifest } from '../utils/manifest-utils.ts'
import type { ComponentManifests } from './manifest-declaration-item.ts'

export const componentManifests = (function () {
  const normalizedManifests: ComponentManifests = [
    skeleton,
    progress,
    kbd,
    table,
    copyButton,
    textarea,
    switchManifest,
    spinner,
    slider,
    seperator,
    breadcrumb,
    badge,
    toast,
    radio,
    buttonGroup,
    accordion,
    modal,
    button,
    chatInput,
    chatMessage,
    avatar,
    sideNav,
    details,
    textField,
    tooltip,
    linkButton,
    matIcon,
    iconButton,
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
    featherIcons,
  ].reduce((result, item) => {
    const pkg = item as Package
    const tags: string[] = []
    for (const module of pkg.modules) {
      if (module.declarations) {
        for (const declaration of module.declarations) {
          const customElementDeclaration = declaration as CustomElement
          if (customElementDeclaration.tagName) {
            result[customElementDeclaration.tagName] = normalizeManifest(customElementDeclaration)
            tags.push(customElementDeclaration.tagName)
          }
        }
      }
    }
    // A package with a few elements (tabs + tab, radio-group + radio) documents them on one API page; icon sets do not.
    if (tags.length > 1 && tags.length <= 10) {
      for (const tag of tags) result[tag].siblingTags = tags.filter((other) => other !== tag)
    }
    return result
  }, {} as ComponentManifests)

  Object.keys(normalizedManifests).forEach((componentTag) => {
    const manifest = normalizedManifests[componentTag]
    manifest.internalComponents.concat(manifest.slotComponents).forEach((item) => {
      if (normalizedManifests[item]) {
        manifest.allCssProperties = [...manifest.allCssProperties, ...normalizedManifests[item].cssProperties]
      }
    })
  })
  return normalizedManifests
})()
