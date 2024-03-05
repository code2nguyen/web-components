import listItem from '@c2n/list-item/custom-elements.json'
import overlay from '@c2n/overlay/custom-elements.json'
import select from '@c2n/select/custom-elements.json'
import dropdownList from '@c2n/dropdown-list/custom-elements.json'
import list from '@c2n/list/custom-elements.json'
import tabs from '@c2n/tabs/custom-elements.json'
import codeViewer from '@c2n/code-viewer/custom-elements.json'
import label from '@c2n/label/custom-elements.json'
import { normalizeManifest } from '../utils/manifest-utils'

export const componentManifests = {
  [overlay.modules[0].declarations[0].tagName]: normalizeManifest(overlay.modules[0].declarations[0]),
  [select.modules[0].declarations[0].tagName]: normalizeManifest(select.modules[0].declarations[0]),
  [dropdownList.modules[0].declarations[0].tagName]: normalizeManifest(dropdownList.modules[0].declarations[0]),
  [tabs.modules[0].declarations[0].tagName]: normalizeManifest(tabs.modules[0].declarations[0]),
  [codeViewer.modules[0].declarations[0].tagName]: normalizeManifest(codeViewer.modules[0].declarations[0]),
  [listItem.modules[0].declarations[0].tagName]: normalizeManifest(listItem.modules[0].declarations[0]),
  [label.modules[0].declarations[0].tagName]: normalizeManifest(label.modules[0].declarations[0]),
  [list.modules[0].declarations[0].tagName]: normalizeManifest(list.modules[0].declarations[0]),
}
