import listItem from '@c2n/list-item/custom-elements.json'
import label from '@c2n/label/custom-elements.json'
import { normalizeManifest } from '../utils/manifest-utils'

export const componentManifests = {
  [listItem.modules[0].declarations[0].tagName]: normalizeManifest(listItem.modules[0].declarations[0]),
  [label.modules[0].declarations[0].tagName]: normalizeManifest(label.modules[0].declarations[0]),
}
