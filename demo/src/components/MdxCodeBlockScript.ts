import { $configStore } from '../store/config-store.ts'
import { getComponentByUid, normalizeCssValue, updateDomCssValue, updateDomAttribute, getInitialStyles } from '../utils/dom.ts'
import { getComponentManifestData, saveInitialStyle } from '../utils/manifest-utils.ts'
import { componentManifests } from '../store/component-manifests.ts'

const settingBtns = document.querySelectorAll('.mdx-code-block-setting-btn')

for (const settingBtn of settingBtns) {
  settingBtn.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest('c2-icon-button') as HTMLElement
    const uid = btn?.dataset.uid
    if (uid) {
      const configStore = $configStore.get()
      const hideConfig = configStore.uid == uid
      if (hideConfig) {
        $configStore.setKey('showConfig', false)
        $configStore.setKey('currentComponentTag', '')
        $configStore.setKey('uid', '')
        return
      }

      const targetComp = getComponentByUid(uid)
      if (!targetComp) return

      const componentManifest = componentManifests[targetComp.tagName.toLowerCase()]
      saveInitialStyle(targetComp, componentManifest.allCssProperties)

      $configStore.setKey('showConfig', true)
      $configStore.setKey('currentComponentTag', componentManifest.tagName)
      $configStore.setKey('uid', uid)

      if (!configStore.configs || !configStore.configs.get(uid)) {
        const new_configs = configStore.configs ? new Map(configStore.configs) : new Map()
        const componentManifestData = getComponentManifestData(targetComp, componentManifest)
        new_configs.set(uid, componentManifestData)
        $configStore.setKey('configs', new_configs)
      }
      // TODO: review the way we display generated code
      // const codeBlockElement = closestElementSibling(getParent(btn), '.code')!
      // const code = codeBlockElement.querySelector('code')?.innerText
      // const lang = codeBlockElement.dataset.lang
      // $configCodeStore.setKey(uid, { code: code ?? '', lang: lang ?? '' })
    }
  })
}

// update config from configStore
$configStore.subscribe((configStore) => {
  const targetUID = configStore.uid
  let manifestStyleStr = ''
  if (!targetUID || !configStore.configs) {
    return
  }
  const initialStyles = getInitialStyles(targetUID)
  const targetComp = getComponentByUid(targetUID)
  const componentConfig = configStore.configs.get(targetUID)

  if (!targetComp || !componentConfig) return

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
  const newCssProperties = componentConfig.allCssProperties.filter((cssVariable) => {
    return initialStyles[cssVariable.cssVariable] !== cssVariable.value
  })

  componentConfig.allCssProperties.forEach((cssVariable) => {
    targetComp.style.removeProperty(cssVariable.cssVariable)
  })

  updateDomCssValue(targetComp, newCssProperties)
  updateDomAttribute(targetComp, componentConfig.attributes)
  if (targetComp._initComponent) {
    targetComp._initComponent()
  }
})
