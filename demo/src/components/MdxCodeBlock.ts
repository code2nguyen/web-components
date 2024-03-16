import { $configStore } from '../store/config-store.ts'
import { $configCodeStore } from '../store/config-code-store.ts'
import { closestElementSibling, getParent, getComponentByUid, normalizeCssValue, updateDomCssValue, updateDomAttribute } from '../utils/dom.ts'
import { getComponentManifestData } from '../utils/manifest-utils.ts'
import { componentManifests } from '../store/component-manifests.ts'

const settingBtns = document.querySelectorAll('.mdx-code-block-setting-btn')

for (const settingBtn of settingBtns) {
  settingBtn.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest('c2-icon-button') as HTMLElement
    const uid = btn?.dataset.uid
    if (uid) {
      const hideConfig = $configStore.get()['uid'] == uid
      if (hideConfig) {
        $configStore.setKey('showConfig', false)
        $configStore.setKey('uid', '')
        $configStore.setKey('cssComponentTag', '')
        return
      }

      const codeBlockElement = closestElementSibling(getParent(btn), '.code')!
      const code = codeBlockElement.querySelector('code')?.innerText
      const lang = codeBlockElement.dataset.lang
      const targetComp = getComponentByUid(uid)
      if (!targetComp) return
      const componentManifest = componentManifests[targetComp.tagName.toLowerCase()]
      const componentManifestData = getComponentManifestData(targetComp, componentManifest)
      $configStore.set({
        uid,
        cssComponentTag: componentManifestData.tagName,
        showConfig: true,
        ...componentManifestData,
      })
      $configCodeStore.setKey(uid, { code: code ?? '', lang: lang ?? '' })
    }
  })
}

// update config from configStore
$configStore.subscribe((componentConfig) => {
  const targetUID = componentConfig.uid
  let manifestStyleStr = ''
  if (!targetUID) {
    return
  }
  const targetComp = getComponentByUid(targetUID)
  if (!targetComp) return

  if (componentConfig.host?.w && componentConfig.host?.w !== 'auto') {
    const width = normalizeCssValue(componentConfig.host.w)
    manifestStyleStr += `width:${width};`
    targetComp.style.width = width
  }
  if (componentConfig.host?.h && componentConfig.host?.h !== 'auto') {
    const height = normalizeCssValue(componentConfig.host.h)
    manifestStyleStr += `height:${height};`
    targetComp.style.height = height
  }
  targetComp.dataset.style = manifestStyleStr

  updateDomCssValue(targetComp, componentConfig.allCssProperties)
  updateDomAttribute(targetComp, componentConfig.attributes)
})
