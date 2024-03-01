import listItem from '@c2n/list-item/custom-elements.json'
import list from '@c2n/list/custom-elements.json'
import tabs from '@c2n/tabs/custom-elements.json'
import codeViewer from '@c2n/code-viewer/custom-elements.json'
import label from '@c2n/label/custom-elements.json'
import { normalizeManifest } from '../utils/manifest-utils'

export const componentManifests = {
  [tabs.modules[0].declarations[0].tagName]: normalizeManifest(tabs.modules[0].declarations[0]),
  [codeViewer.modules[0].declarations[0].tagName]: normalizeManifest(codeViewer.modules[0].declarations[0]),
  [listItem.modules[0].declarations[0].tagName]: normalizeManifest(listItem.modules[0].declarations[0]),
  [label.modules[0].declarations[0].tagName]: normalizeManifest(label.modules[0].declarations[0]),
  [list.modules[0].declarations[0].tagName]: normalizeManifest(list.modules[0].declarations[0]),
}
