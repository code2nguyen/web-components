import { $configStore } from '../store/config-store.ts'
import { getComponentByUid, normalizeCssValue, updateDomCssValue, updateDomAttribute, getInitialStyles } from '../utils/dom.ts'
import { toggleExample } from '../utils/playground.ts'
import type { ExtraComponentConfigState } from '../model/component-config-state.ts'

document.querySelectorAll<HTMLElement>('.mdx-code-block-setting-btn').forEach((button) => {
  button.addEventListener('click', () => {
    const uid = button.dataset.uid
    if (uid) toggleExample(uid)
  })
})

// Sync every configured example element with the inspector state. Edits persist after the studio closes (the example
// keeps its customized look and shows a "Customized" badge), so all entries are synced, not only the open one.
$configStore.subscribe((configStore) => {
  configStore.configs?.forEach((componentConfig, targetUID) => syncExample(targetUID, componentConfig))
})

function syncExample(targetUID: string, componentConfig: ExtraComponentConfigState) {
  let manifestStyleStr = ''
  const initialStyles = getInitialStyles(targetUID)
  const targetComp = getComponentByUid(targetUID)

  if (!targetComp) return

  // Start from the authored inline style, then layer the edits on top.
  const initialInlineStyle = targetComp.dataset.initialInlineStyle ?? ''
  if (initialInlineStyle) targetComp.setAttribute('style', initialInlineStyle)
  else targetComp.removeAttribute('style')

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

  updateDomCssValue(targetComp, newCssProperties)
  updateDomAttribute(targetComp, componentConfig.attributes)
  if (targetComp._initComponent) {
    targetComp._initComponent()
  }
}
