/**
 * Playground helpers shared by the example frames, the preset gallery and the inspector panel.
 * State lives in the nanostores in `src/store`; the DOM sync (store -> example element) is in MdxCodeBlockScript.ts.
 */
import { $configStore } from '../store/config-store.ts'
import { $configCodeStore } from '../store/config-code-store.ts'
import { componentManifests } from '../store/component-manifests.ts'
import { getComponentManifestData, saveInitialStyle } from './manifest-utils.ts'
import { getComponentByUid, getElemenetProperty, getInitialStyles } from './dom.ts'
import type { ExtraComponentConfigState } from '../model/component-config-state.ts'
import type { ComponentPreset } from '../data/component-presets.ts'

export interface PresetConfig {
  css: Record<string, string>
  attributes?: Record<string, string>
}

export interface SavedPreset extends PresetConfig {
  name: string
  savedAt: string
}

const STORAGE_PREFIX = 'c2n-presets:'

// ---------------------------------------------------------------------------
// Opening / closing the inspector for an example
// ---------------------------------------------------------------------------

function ensureConfig(uid: string): ExtraComponentConfigState | null {
  const element = getComponentByUid(uid)
  if (!element) return null
  const manifest = componentManifests[element.tagName.toLowerCase()]
  if (!manifest) return null

  saveInitialStyle(element, manifest.allCssProperties)
  if (!element.dataset.initialAttributes) {
    const initial: Record<string, string> = {}
    manifest.attributes.forEach((attr) => {
      const value = getElemenetProperty(element, attr.name)
      if (value !== undefined) initial[attr.name] = value
    })
    element.dataset.initialAttributes = JSON.stringify(initial)
  }

  const state = $configStore.get()
  const configs = state.configs ? new Map(state.configs) : new Map<string, ExtraComponentConfigState>()
  if (!configs.get(uid)) {
    configs.set(uid, getComponentManifestData(element, manifest))
    $configStore.setKey('configs', configs)
  }

  // Remember the example source so the Code tab can produce a copy-paste snippet.
  const codeElement = document.querySelector<HTMLElement>(`.example[data-uid="${uid}"] .example__code pre code`)
  if (codeElement && !$configCodeStore.get()[uid]) {
    $configCodeStore.setKey(uid, { code: codeElement.innerText, lang: 'html' })
  }
  return configs.get(uid) ?? null
}

/** Open the inspector for an example. */
export function openExample(uid: string): boolean {
  const config = ensureConfig(uid)
  if (!config) return false
  $configStore.setKey('showConfig', true)
  $configStore.setKey('currentComponentTag', config.tagName)
  $configStore.setKey('uid', uid)
  return true
}

export function closeInspector() {
  $configStore.setKey('showConfig', false)
  $configStore.setKey('currentComponentTag', '')
  $configStore.setKey('uid', '')
  $configStore.setKey('activeTab', undefined)
}

/** Toggle the inspector for an example (used by the example toolbar button). */
export function toggleExample(uid: string) {
  if ($configStore.get().uid === uid && $configStore.get().showConfig) {
    closeInspector()
  } else {
    openExample(uid)
  }
}

interface IconStudioTarget {
  uid: string
  tagName: string
  textContent?: string
  attributes?: Record<string, string>
}

/** Replace an icon gallery's reusable studio target and open the inspector for the selected icon. */
export function openIconInStudio({ uid, tagName, textContent = '', attributes = {} }: IconStudioTarget): boolean {
  const current = getComponentByUid(uid)
  if (!current || !componentManifests[tagName]) return false

  const replacement = document.createElement(tagName)
  replacement.dataset.targetUid = uid
  replacement.textContent = textContent
  for (const [name, value] of Object.entries(attributes)) replacement.setAttribute(name, value)
  current.replaceWith(replacement)
  customElements.upgrade(replacement)

  // One gallery frame is reused for many tags. Forget the previous icon's values before initializing its replacement.
  const configs = new Map($configStore.get().configs)
  configs.delete(uid)
  $configStore.setKey('configs', configs)

  const attributeSource = Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join('')
  const code = `<${tagName}${attributeSource}>${textContent}</${tagName}>`
  $configCodeStore.setKey(uid, { code, lang: 'html' })
  const codeElement = document.querySelector<HTMLElement>(`.example[data-uid="${uid}"] .example__code pre code`)
  if (codeElement) codeElement.textContent = code

  return openExample(uid)
}

// ---------------------------------------------------------------------------
// Applying / reading configuration
// ---------------------------------------------------------------------------

function commit(uid: string, config: ExtraComponentConfigState) {
  const configs = new Map($configStore.get().configs)
  configs.set(uid, { ...config, allCssProperties: [...config.allCssProperties], attributes: [...config.attributes] })
  $configStore.setKey('configs', configs)
}

/** Apply a preset (CSS variables + attributes) to an example and show the inspector. */
export function applyPreset(uid: string, preset: PresetConfig, { replace = true }: { replace?: boolean } = {}) {
  if (!openExample(uid)) return
  const config = $configStore.get().configs?.get(uid)
  if (!config) return
  if (replace) {
    const initialStyles = getInitialStyles(uid)
    config.allCssProperties.forEach((item) => (item.value = initialStyles[item.cssVariable]))
  }
  for (const [name, value] of Object.entries(preset.css)) {
    const item = config.allCssProperties.find((entry) => entry.cssVariable === name)
    if (item) item.value = value
  }
  if (preset.attributes) {
    for (const [name, value] of Object.entries(preset.attributes)) {
      const attr = config.attributes.find((entry) => entry.name === name.toLowerCase())
      if (attr) attr.value = value
    }
  }
  commit(uid, config)
}

/** Restore the example to how it was authored (initial CSS variables and attributes). */
export function resetExample(uid: string) {
  const config = $configStore.get().configs?.get(uid)
  const element = getComponentByUid(uid)
  if (!config || !element) return
  const initialStyles = getInitialStyles(uid)
  const initialAttributes: Record<string, string> = JSON.parse(element.dataset.initialAttributes ?? '{}')
  config.allCssProperties.forEach((item) => (item.value = initialStyles[item.cssVariable]))
  config.attributes.forEach((attr) => (attr.value = initialAttributes[attr.name]))
  config.host = { w: 'auto', h: 'auto' }
  element.style.removeProperty('width')
  element.style.removeProperty('height')
  commit(uid, config)
}

/** Restore a single CSS variable to its authored value, leaving every other edit in place. */
export function resetProperty(uid: string, cssVariable: string) {
  const config = $configStore.get().configs?.get(uid)
  if (!config) return
  const initialStyles = getInitialStyles(uid)
  const item = config.allCssProperties.find((entry) => entry.cssVariable === cssVariable)
  if (!item) return
  item.value = initialStyles[cssVariable]
  // Drop the remembered "hidden colour" too, or the colour control would keep showing the row as hidden.
  if (config.hideValues?.[cssVariable]) {
    const hideValues = { ...config.hideValues }
    delete hideValues[cssVariable]
    config.hideValues = hideValues
  }
  commit(uid, config)
}

/** Restore a single attribute to its authored value. */
export function resetAttribute(uid: string, name: string) {
  const config = $configStore.get().configs?.get(uid)
  const element = getComponentByUid(uid)
  if (!config || !element) return
  const initialAttributes: Record<string, string> = JSON.parse(element.dataset.initialAttributes ?? '{}')
  const attr = config.attributes.find((entry) => entry.name === name)
  if (!attr) return
  attr.value = initialAttributes[name]
  commit(uid, config)
}

/** The values that differ from the authored example: exactly what a saved preset / exported snippet needs. */
export function getChanges(uid: string): PresetConfig {
  const config = $configStore.get().configs?.get(uid)
  const element = getComponentByUid(uid)
  const css: Record<string, string> = {}
  const attributes: Record<string, string> = {}
  if (!config || !element) return { css }
  const initialStyles = getInitialStyles(uid)
  const initialAttributes: Record<string, string> = JSON.parse(element.dataset.initialAttributes ?? '{}')
  config.allCssProperties.forEach((item) => {
    if (item.value && item.value !== initialStyles[item.cssVariable]) css[item.cssVariable] = item.value
  })
  config.attributes.forEach((attr) => {
    const initial = initialAttributes[attr.name] ?? (attr.type === 'boolean' ? 'false' : undefined)
    if (attr.value !== undefined && attr.value !== initial) attributes[attr.name] = attr.value
  })
  return Object.keys(attributes).length > 0 ? { css, attributes } : { css }
}

// ---------------------------------------------------------------------------
// Saved presets (localStorage, per component tag)
// ---------------------------------------------------------------------------

export function loadSavedPresets(tag: string): SavedPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tag)
    return raw ? (JSON.parse(raw) as SavedPreset[]) : []
  } catch {
    return []
  }
}

function persist(tag: string, presets: SavedPreset[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + tag, JSON.stringify(presets))
  } catch {
    /* storage unavailable */
  }
}

export function savePreset(tag: string, name: string, config: PresetConfig): SavedPreset[] {
  const presets = loadSavedPresets(tag).filter((preset) => preset.name !== name)
  presets.unshift({ name, savedAt: new Date().toISOString(), ...config })
  persist(tag, presets)
  return presets
}

export function deletePreset(tag: string, name: string): SavedPreset[] {
  const presets = loadSavedPresets(tag).filter((preset) => preset.name !== name)
  persist(tag, presets)
  return presets
}

export function renamePreset(tag: string, from: string, to: string): SavedPreset[] {
  const name = to.trim()
  if (!name || name === from) return loadSavedPresets(tag)
  const presets = loadSavedPresets(tag)
  const target = presets.find((preset) => preset.name === from)
  if (!target) return presets
  // A rename onto an existing name replaces that entry, matching how saving behaves.
  const next = presets.filter((preset) => preset.name !== name || preset === target)
  target.name = name
  persist(tag, next)
  return next
}

/** The whole collection for one component as portable JSON. */
export function exportCollection(tag: string): string {
  return JSON.stringify({ tag, presets: loadSavedPresets(tag) }, null, 2)
}

/**
 * Adds presets to the collection from JSON. Accepts a whole exported collection (`{ tag, presets: [...] }`) or a
 * single preset (`{ css, attributes }`), which is what the Code tab's JSON output produces. Throws on bad input so
 * the caller can show the parse error.
 */
export function importCollection(tag: string, json: string, fallbackName: string): SavedPreset[] {
  const parsed: unknown = JSON.parse(json)
  if (!parsed || typeof parsed !== 'object') throw new Error('Expected a JSON object')
  const payload = parsed as { presets?: unknown; css?: unknown; attributes?: Record<string, string>; name?: string }

  const incoming: SavedPreset[] = []
  if (Array.isArray(payload.presets)) {
    for (const entry of payload.presets as SavedPreset[]) {
      if (!entry?.css || typeof entry.css !== 'object') continue
      incoming.push({ name: entry.name || fallbackName, savedAt: entry.savedAt ?? new Date().toISOString(), css: entry.css, attributes: entry.attributes })
    }
    if (incoming.length === 0) throw new Error('No presets found in "presets"')
  } else if (payload.css && typeof payload.css === 'object') {
    incoming.push({
      name: payload.name || fallbackName,
      savedAt: new Date().toISOString(),
      css: payload.css as Record<string, string>,
      attributes: payload.attributes,
    })
  } else {
    throw new Error('Expected a "css" object or a "presets" array')
  }

  const existing = loadSavedPresets(tag).filter((preset) => !incoming.some((entry) => entry.name === preset.name))
  const next = [...incoming, ...existing]
  persist(tag, next)
  return next
}

export function presetToConfig(preset: ComponentPreset | SavedPreset): PresetConfig {
  // `css` is optional on a curated preset (an attribute-only one); every consumer below expects a real map.
  return { css: preset.css ?? {}, attributes: preset.attributes }
}

// ---------------------------------------------------------------------------
// Code generation (shadcn-style: copy the snippet, own the component)
// ---------------------------------------------------------------------------

export type CodeFormat = 'html' | 'css' | 'lit' | 'json'

export interface CodeInput {
  tag: string
  /** Authored example markup. */
  html: string
  changes: PresetConfig
  /** Name for the generated class / custom element, e.g. `brand-checkbox`. */
  name: string
}

function toPascalCase(value: string) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('')
}

function cssDeclarations(css: Record<string, string>, indent = '  ') {
  return Object.entries(css)
    .map(([name, value]) => `${indent}${name}: ${value};`)
    .join('\n')
}

/** Rewrites the opening tag of the example root: adds a class and applies attribute changes. */
function rewriteRootTag(html: string, tag: string, className: string, attributes: Record<string, string> = {}) {
  const open = new RegExp(`<${tag}(\\s[^>]*)?>`, 'i')
  return html.replace(open, (_match, attrs: string = '') => {
    let rest = attrs
    for (const [name, value] of Object.entries(attributes)) {
      rest = rest.replace(new RegExp(`\\s${name}(=("[^"]*"|'[^']*'|[^\\s>]+))?`, 'i'), '')
      if (value === 'true') rest += ` ${name}`
      else if (value !== 'false' && value !== '') rest += ` ${name}="${value}"`
    }
    if (/\sclass=/.test(rest)) {
      rest = rest.replace(/\sclass=(["'])([^"']*)\1/, (_m, quote: string, classes: string) => ` class=${quote}${classes.trim()} ${className}${quote}`)
    } else {
      rest = ` class="${className}"` + rest
    }
    return `<${tag}${rest}>`
  })
}

export function generateCode(format: CodeFormat, input: CodeInput): string {
  const { tag, html, changes, name } = input
  const hasCss = Object.keys(changes.css).length > 0
  switch (format) {
    case 'css':
      return hasCss ? `.${name} {\n${cssDeclarations(changes.css)}\n}` : `/* No changes yet: adjust a value in the Design tab. */`
    case 'html': {
      const markup = rewriteRootTag(html.trim(), tag, name, changes.attributes)
      return hasCss ? `${markup}\n\n<style>\n  .${name} {\n${cssDeclarations(changes.css, '    ')}\n  }\n</style>` : markup
    }
    case 'lit': {
      const baseClass = toPascalCase(tag.replace(/^c2-/, ''))
      const className = toPascalCase(name)
      const pkg = `@c2n/${tag.replace(/^c2-/, '')}`
      const attributeLines = Object.entries(changes.attributes ?? {})
        .map(([attr, value]) => `    this.setAttribute('${attr}', '${value === 'true' ? '' : value}')`)
        .join('\n')
      return [
        `import { css } from 'lit'`,
        `import { ${baseClass} } from '${pkg}'`,
        ``,
        `/** ${tag} with your theme baked in. Register once, then use <${name}> anywhere. */`,
        `export class ${className} extends ${baseClass} {`,
        `  static override styles = [`,
        `    ${baseClass}.styles,`,
        `    css\``,
        `      :host {`,
        hasCss ? cssDeclarations(changes.css, '        ') : `        /* your overrides */`,
        `      }`,
        `    \`,`,
        `  ]`,
        ...(attributeLines ? [``, `  override connectedCallback() {`, `    super.connectedCallback()`, attributeLines, `  }`] : []),
        `}`,
        ``,
        `customElements.define('${name}', ${className})`,
      ].join('\n')
    }
    case 'json':
      return JSON.stringify({ tag, ...changes }, null, 2)
  }
}
