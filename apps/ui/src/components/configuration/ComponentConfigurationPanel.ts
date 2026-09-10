import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { StoreController } from '@nanostores/lit'
import { repeat } from 'lit/directives/repeat.js'
import { $configStore } from '../../store/config-store.ts'

import styles from './ComponentConfigurationPanel.scss?inline'

import './GenerateCodeBlock'
import './InspectorRow'
import './ColorConfig'
import './BorderConfig'
import './BoxSidesConfig'
import './FontConfig'
import './LengthConfig'
import './KeywordConfig'

import '@c2n/details'
import '@c2n/label'
import '@c2n/switch'
import '@c2n/select'
import '@c2n/list'
import '@c2n/list-item'
import '@c2n/text-field'
import '@c2n/textarea'
import '@c2n/icon-button'
import '@c2n/button'
import '@c2n/badge'
import '@c2n/tabs/tab.js'
import '@c2n/tabs'
import '@c2n/feather-icons/icons/rotate-ccw.js'
import '@c2n/feather-icons/icons/x.js'
import '@c2n/feather-icons/icons/search.js'
import '@c2n/feather-icons/icons/filter.js'
import '@c2n/feather-icons/icons/trash-2.js'
import '@c2n/feather-icons/icons/edit-2.js'
import '@c2n/feather-icons/icons/copy.js'
import '@c2n/feather-icons/icons/check.js'
import '@c2n/feather-icons/icons/download.js'
import '@c2n/feather-icons/icons/chevron-right.js'

import type { AttributeDeclarationItem, CSSDeclarationItem, GroupedCssVariables } from '../../store/manifest-declaration-item.ts'
import { flatGroupCssProperties, groupCssProperties } from '../../utils/manifest-utils.ts'
import { BORDER_RADIUS_ORDER, FONT_PROPERTY, PADDING_ORDER, groupLabel, shortName } from '../../utils/dom.ts'
import { KEYWORD_OPTIONS, UNITLESS_TYPES } from '../../utils/css-value.ts'
import type { Select } from '@c2n/select'
import type { Switch } from '@c2n/switch'
import type { TextField } from '@c2n/text-field'
import type { Textarea } from '@c2n/textarea'
import type { SelectionChangeEventDetail } from '@c2n/list'
import type { ExtraComponentConfigState, InspectorTab } from '../../model/component-config-state.ts'
import { componentPresets } from '../../data/component-presets.ts'
import {
  applyPreset,
  closeInspector,
  deletePreset,
  exportCollection,
  getChanges,
  importCollection,
  loadSavedPresets,
  presetToConfig,
  renamePreset,
  resetAttribute,
  resetExample,
  resetProperty,
  savePreset,
  type PresetConfig,
  type SavedPreset,
} from '../../utils/playground.ts'
import { getComponentByUid, getInitialStyles } from '../../utils/dom.ts'

/** Row model: one visible property row, with everything the row needs to render and to report "changed". */
interface Row {
  key: string
  label: string
  description?: string
  /** Every CSS variable this row writes (a 4-side or font row owns several). */
  names: string[]
  render: (changed: boolean) => TemplateResult
  stacked?: boolean
}

@customElement('demo-component-configuration-panel')
export class ComponentConfigurationPanel extends LitElement {
  static override styles = unsafeCSS(styles)

  private configStore = new StoreController(this, $configStore)

  // --- Design tab view state -------------------------------------------------
  @state() private filter = ''
  @state() private changedOnly = false
  /** `null` until the user opens or closes something: the first section starts open. */
  @state() private expanded: Set<string> | null = null

  // --- Collection tab state --------------------------------------------------
  @state() private presetName = ''
  @state() private savedPresets: SavedPreset[] = []
  @state() private renaming = ''
  @state() private importJson = ''
  @state() private importError = ''
  @state() private copied = false
  private loadedPresetsFor = ''

  private renderedUid = ''

  /** Transient view state must not leak from one example to the next. */
  override willUpdate(_changed: PropertyValues) {
    const uid = this.configStore.value.uid ?? ''
    if (uid !== this.renderedUid) {
      this.renderedUid = uid
      this.filter = ''
      this.changedOnly = false
      this.expanded = null
      this.presetName = ''
      this.renaming = ''
      this.importJson = ''
      this.importError = ''
      this.copied = false
      this.loadedPresetsFor = ''
    }
  }

  private get componentConfig(): ExtraComponentConfigState | null | undefined {
    const { uid, configs } = this.configStore.value
    return uid && configs ? configs.get(uid) : null
  }

  private get uid(): string {
    return this.configStore.value.uid ?? ''
  }

  // ---------------------------------------------------------------------------
  // Store writes
  // ---------------------------------------------------------------------------

  /**
   * Applies one control's `change` detail in a single store commit.
   *
   * Controls emit `{ '--css-var': value, 'hideValue--css-var': rememberedColour }`. Writing those as two separate
   * commits (as before) made every colour edit render the panel twice and briefly publish a half-applied state.
   */
  private applyChangeDetail(detail: Record<string, string>) {
    const config = this.componentConfig
    if (!config || !this.uid) return

    const cssProperties = [...config.allCssProperties]
    const attributes = [...config.attributes]
    let hideValues: Record<string, string> | undefined
    let touched = false

    for (const [key, value] of Object.entries(detail)) {
      if (key.startsWith('hideValue')) {
        const name = key.slice('hideValue'.length)
        hideValues = hideValues ?? { ...(config.hideValues ?? {}) }
        if (value) hideValues[name] = value
        else delete hideValues[name]
        touched = true
        continue
      }
      const attribute = attributes.find((item) => item.name === key)
      if (attribute) {
        attribute.value = value
        touched = true
        continue
      }
      const cssProperty = cssProperties.find((item) => item.cssVariable === key)
      if (cssProperty) {
        cssProperty.value = value
        touched = true
      }
    }
    if (!touched) return

    this.optimizeCssVariables(cssProperties)
    const next: ExtraComponentConfigState = { ...config, allCssProperties: cssProperties, attributes }
    if (hideValues) next.hideValues = hideValues
    const configs = new Map(this.configStore.value.configs)
    configs.set(this.uid, next)
    $configStore.setKey('configs', configs)
  }

  private handleControlChange = (event: CustomEvent<Record<string, string>>) => {
    event.stopPropagation()
    this.applyChangeDetail(event.detail)
  }

  /** A value that only restates the fallback variable it points at is not an override; drop it from the diff. */
  private optimizeCssVariables(cssProperties: CSSDeclarationItem[]) {
    cssProperties.forEach((cssProperty) => {
      if (cssProperty.value && cssProperty.default?.startsWith('--')) {
        if (cssProperty.value === this.getCssVariableValue(cssProperty.default)) cssProperty.value = undefined
      }
    })
    return cssProperties
  }

  private getCssVariableValue(name: string): string {
    const cssVariable = this.componentConfig?.allCssProperties.find((item) => item.cssVariable === name)
    if (!cssVariable) return ''
    if (cssVariable.value !== undefined) return cssVariable.value
    if (cssVariable.default?.startsWith('--')) return this.getCssVariableValue(cssVariable.default)
    return cssVariable.default ?? ''
  }

  private getAttributeValue(name: string) {
    const attr = this.componentConfig?.attributes.find((item) => item.name === name)
    if (!attr) return ''
    return attr.value !== undefined ? attr.value : (attr.default ?? (attr.type === 'boolean' ? 'false' : ''))
  }

  // ---------------------------------------------------------------------------
  // Change tracking
  // ---------------------------------------------------------------------------

  private get initialStyles(): Record<string, string> {
    return getInitialStyles(this.uid)
  }

  private get initialAttributes(): Record<string, string> {
    const element = getComponentByUid(this.uid)
    try {
      return JSON.parse(element?.dataset.initialAttributes ?? '{}') as Record<string, string>
    } catch {
      return {}
    }
  }

  private isCssChanged(name: string, initialStyles = this.initialStyles): boolean {
    const item = this.componentConfig?.allCssProperties.find((entry) => entry.cssVariable === name)
    if (!item?.value) return false
    return item.value !== initialStyles[name]
  }

  private isAttributeChanged(attr: AttributeDeclarationItem, initialAttributes = this.initialAttributes): boolean {
    const initial = initialAttributes[attr.name] ?? (attr.type === 'boolean' ? 'false' : undefined)
    return attr.value !== undefined && attr.value !== initial
  }

  private get changeCount(): number {
    if (!this.uid) return 0
    const changes = getChanges(this.uid)
    return Object.keys(changes.css).length + Object.keys(changes.attributes ?? {}).length
  }

  // ---------------------------------------------------------------------------
  // Chrome
  // ---------------------------------------------------------------------------

  private handleTabChange(event: CustomEvent<{ value: string }>) {
    // `change` bubbles out of every control in the panel (c2-switch, c2-text-field, c2-textarea are all in this same
    // shadow tree), so the tab strip must only react to its own event — otherwise flipping a boolean prop would set
    // `activeTab` to `undefined` and throw the user back to the Design tab.
    if ((event.target as HTMLElement | null)?.localName !== 'c2-tabs') return
    const value = event.detail?.value
    if (value) $configStore.setKey('activeTab', value as InspectorTab)
  }

  private handleReset = () => {
    if (this.uid) resetExample(this.uid)
  }

  private handleSelectComponentChange(event: CustomEvent<SelectionChangeEventDetail> & { target: Select }) {
    const tag = event.detail.value[0]
    if (tag) $configStore.setKey('currentComponentTag', tag)
  }

  override render() {
    if (!this.uid || !this.configStore.value.showConfig) return nothing
    const changeCount = this.changeCount
    const activeTab = this.configStore.value.activeTab ?? 'design'
    return html`<div class="inspector">
      <header class="inspector__header">
        <div class="inspector__heading">
          <span class="inspector__eyebrow">Inspector</span>
          <code class="inspector__tag">${this.componentConfig?.tagName}</code>
        </div>
        ${changeCount > 0 ? html`<c2-badge class="inspector__count" tone="info">${changeCount} changed</c2-badge>` : nothing}
        <div class="inspector__actions">
          <c2-icon-button
            class="inspector-icon-btn"
            aria-label="Reset this example to the authored values"
            tooltip="Reset example"
            ?disabled=${changeCount === 0}
            @click=${this.handleReset}
          >
            <c2-feather-rotate-ccw></c2-feather-rotate-ccw>
          </c2-icon-button>
          <c2-icon-button class="inspector-icon-btn" aria-label="Exit studio (Esc)" tooltip="Exit studio (Esc)" @click=${() => closeInspector()}>
            <c2-feather-x></c2-feather-x>
          </c2-icon-button>
        </div>
      </header>
      <c2-tabs class="inspector__tabs" selected-tab=${activeTab} @change=${this.handleTabChange}>
        <c2-tab label="Design" for="design"></c2-tab>
        <c2-tab label="Props" for="props"></c2-tab>
        <c2-tab label="Collection" for="presets"></c2-tab>
        <c2-tab label="Code" for="code"></c2-tab>
        <div id="design" class="tab-panel">${this.renderDesign()}</div>
        <div id="props" class="tab-panel">${this.renderProps()}</div>
        <div id="presets" class="tab-panel">${this.renderCollection()}</div>
        <div id="code" class="tab-panel">${this.renderCode()}</div>
      </c2-tabs>
    </div>`
  }

  // ---------------------------------------------------------------------------
  // Design tab
  // ---------------------------------------------------------------------------

  private renderDesign() {
    const config = this.componentConfig
    if (!config) return nothing
    const tag = this.configStore.value.currentComponentTag ?? config.tagName
    const owned = config.allCssProperties.filter((item) => item.cssVariable.startsWith(`--${tag}--`) || item.cssVariable.startsWith(`--${tag}__`))
    const groups = flatGroupCssProperties(groupCssProperties(owned))
    const initialStyles = this.initialStyles
    this.firstSectionKey = ''
    const parts = [config.tagName, ...config.internalComponents, ...config.slotComponents]

    const sections = groups
      .map((group) => this.buildSection(group, tag, initialStyles))
      .filter((section): section is { key: string; label: string; rows: Row[]; changed: number } => section !== null)

    return html`
      <div class="design">
        <div class="design__toolbar">
          ${
            parts.length > 1
              ? html`<c2-select class="part-select" .value=${[tag]} required aria-label="Part to theme" @selection-change=${this.handleSelectComponentChange}>
                  ${parts.map((part) => html`<c2-list-item class=${part === config.tagName ? 'level-0' : 'level-1'} value=${part}>${part}</c2-list-item>`)}
                </c2-select>`
              : nothing
          }
          <div class="design__filter">
            <c2-text-field
              class="filter-field"
              placeholder="Filter properties"
              aria-label="Filter properties"
              clearable
              .value=${this.filter}
              @input=${(event: Event) => (this.filter = (event.target as TextField).value)}
              @clear=${() => (this.filter = '')}
            >
              <c2-feather-search slot="prefix-icon"></c2-feather-search>
            </c2-text-field>
            <c2-icon-button
              class="inspector-icon-btn"
              toggle
              ?selected=${this.changedOnly}
              aria-pressed=${String(this.changedOnly)}
              aria-label="Show only changed properties"
              tooltip="Only changed"
              @click=${() => (this.changedOnly = !this.changedOnly)}
            >
              <c2-feather-filter></c2-feather-filter>
            </c2-icon-button>
          </div>
        </div>
        ${
          sections.length === 0
            ? html`<p class="empty">
                ${this.changedOnly ? 'Nothing changed on this part yet.' : this.filter ? html`No property matches <b>${this.filter}</b>.` : 'This part exposes no CSS variables.'}
              </p>`
            : repeat(
                sections,
                (section) => section.key,
                (section, index) => this.renderSection(section, index === 0),
              )
        }
      </div>
    `
  }

  private renderSection(section: { key: string; label: string; rows: Row[]; changed: number }, first: boolean) {
    // While filtering, everything that survived the filter is worth showing open.
    const open = this.filter || this.changedOnly ? true : (this.expanded?.has(section.key) ?? first)
    return html`<c2-details class="section" ?expanded=${open} @toggle=${(event: Event) => this.handleSectionToggle(section.key, first, event)}>
      <div slot="title" class="section__title">
        <span>${section.label}</span>
        ${section.changed > 0 ? html`<c2-badge class="section__badge" tone="info" dot></c2-badge>` : nothing}
      </div>
      <c2-feather-chevron-right slot="icon"></c2-feather-chevron-right>
      <div class="section__rows">${section.rows.map((row) => row.render(row.names.some((name) => this.isCssChanged(name))))}</div>
    </c2-details>`
  }

  private handleSectionToggle(key: string, first: boolean, event: Event) {
    // Filtering forces every surviving section open, so those toggles are not the user's own choice.
    if (this.filter || this.changedOnly) return
    const open = (event as ToggleEvent).newState === 'open'
    // Materialise the default (first section open) on the first interaction so it is not re-applied afterwards.
    const expanded = new Set(this.expanded ?? (this.firstSectionKey ? [this.firstSectionKey] : []))
    if (open) expanded.add(key)
    else expanded.delete(key)
    this.expanded = expanded
  }

  private firstSectionKey = ''

  /** Builds one accordion section, applying the filter and the "only changed" toggle. */
  private buildSection(
    group: GroupedCssVariables,
    tag: string,
    initialStyles: Record<string, string>,
  ): { key: string; label: string; rows: Row[]; changed: number } | null {
    const key = group.groups.join('__')
    const label = groupLabel(group.groups, tag)
    let rows = this.buildRows(group.cssProperties)

    const needle = this.filter.trim().toLowerCase()
    if (needle) {
      rows = rows.filter((row) => row.label.toLowerCase().includes(needle) || row.names.some((name) => name.toLowerCase().includes(needle)))
      // A section whose own name matches keeps all its rows, so "hover" finds the whole hover group.
      if (rows.length === 0 && label.toLowerCase().includes(needle)) rows = this.buildRows(group.cssProperties)
    }
    if (this.changedOnly) rows = rows.filter((row) => row.names.some((name) => this.isCssChanged(name, initialStyles)))
    if (rows.length === 0) return null

    const changed = rows.filter((row) => row.names.some((name) => this.isCssChanged(name, initialStyles))).length
    if (!this.firstSectionKey) this.firstSectionKey = key
    return { key, label, rows, changed }
  }

  /**
   * Turns the CSS variables of one group into rows, pulling the multi-variable properties (padding, border-radius,
   * font) out into single composite rows first so they stay one labelled control instead of four bare fields.
   */
  private buildRows(cssProperties: CSSDeclarationItem[]): Row[] {
    let remaining = [...cssProperties]
    const rows: Row[] = []

    const takeBox = (kind: 'padding' | 'radius', order: string[], label: string, match: (item: CSSDeclarationItem) => boolean) => {
      const picked = remaining.filter(match).sort((a, b) => order.indexOf(a.property) - order.indexOf(b.property))
      if (picked.length === 0) return
      remaining = remaining.filter((item) => !picked.includes(item))
      const single = picked.length === 1
      const names = picked.map((item) => item.cssVariable)
      rows.push({
        key: names.join('|'),
        label: single ? shortName(picked[0].property) : label,
        description: picked[0].description,
        names,
        stacked: true,
        render: (changed) =>
          this.row(
            names.join('|'),
            single ? shortName(picked[0].property) : label,
            picked[0].description,
            changed,
            names,
            true,
            () =>
              html`<demo-box-sides-config
                kind=${kind}
                .names=${single ? names[0] : names}
                .values=${single ? this.getCssVariableValue(names[0]) : names.map((name) => this.getCssVariableValue(name))}
                @change=${this.handleControlChange}
              ></demo-box-sides-config>`,
          ),
      })
    }

    takeBox('padding', PADDING_ORDER, 'Padding', (item) => item.type === 'padding' || item.property.startsWith('padding'))
    takeBox('radius', BORDER_RADIUS_ORDER, 'Radius', (item) => item.type === 'border-radius' || BORDER_RADIUS_ORDER.includes(item.property))

    // Font: one composite row for the family/size/weight/style of this part.
    const fontItems = remaining.filter((item) => FONT_PROPERTY.includes(item.property))
    if (fontItems.length > 0) {
      remaining = remaining.filter((item) => !fontItems.includes(item))
      const names = fontItems.map((item) => item.cssVariable)
      rows.push({
        key: names.join('|'),
        label: 'Font',
        names,
        stacked: true,
        render: (changed) =>
          this.row(
            names.join('|'),
            'Font',
            undefined,
            changed,
            names,
            true,
            () =>
              html`<demo-font-config
                .names=${names}
                .values=${names.map((name) => this.getCssVariableValue(name))}
                @change=${this.handleControlChange}
              ></demo-font-config>`,
          ),
      })
    }

    for (const item of remaining) {
      const name = item.cssVariable
      const label = shortName(item.property) || name
      const stacked = item.type === 'border' || item.type === 'outline'
      rows.push({
        key: name,
        label,
        description: item.description,
        names: [name],
        stacked,
        render: (changed) => this.row(name, label, item.description, changed, [name], stacked, () => this.control(item)),
      })
    }
    return rows
  }

  private row(key: string, label: string, description: string | undefined, changed: boolean, names: string[], stacked: boolean, control: () => TemplateResult) {
    return html`<demo-inspector-row
      data-key=${key}
      label=${label}
      description=${description ?? ''}
      ?changed=${changed}
      ?stacked=${stacked}
      @revert=${() => names.forEach((name) => resetProperty(this.uid, name))}
      >${control()}</demo-inspector-row
    >`
  }

  /** Picks the control for one CSS variable from its `@cssproperty {type}` tag, falling back to a text field. */
  private control(item: CSSDeclarationItem): TemplateResult {
    const name = item.cssVariable
    const value = this.getCssVariableValue(name)
    const type = item.type
    const hiddenColor = this.componentConfig?.hideValues?.[name] ?? ''

    if (type === 'color' || type === 'background' || type === 'background-color') {
      return html`<demo-color-config
        .name=${name}
        .value=${value}
        .hiddenColor=${hiddenColor}
        ?transparentWhenHidden=${type !== 'color' || !!(item.default && !item.default.startsWith('--'))}
        @change=${this.handleControlChange}
      ></demo-color-config>`
    }
    if (type === 'border' || type === 'outline') {
      return html`<demo-border-config .name=${name} .value=${value} .hiddenColor=${hiddenColor} @change=${this.handleControlChange}></demo-border-config>`
    }
    if (type === 'opacity') {
      return html`<demo-length-config .name=${name} variant="opacity" .value=${value} @change=${this.handleControlChange}></demo-length-config>`
    }
    if (type === 'time' || type === 'duration') {
      return html`<demo-length-config .name=${name} variant="time" .value=${value} @change=${this.handleControlChange}></demo-length-config>`
    }
    if (UNITLESS_TYPES.includes(type)) {
      return html`<demo-length-config .name=${name} variant="unitless" .value=${value} @change=${this.handleControlChange}></demo-length-config>`
    }
    if (type === 'pixel' || type === 'font-size' || type === 'line-height' || type === 'letter-spacing' || type === 'margin' || type === 'max-height') {
      return html`<demo-length-config .name=${name} variant="length" .value=${value} @change=${this.handleControlChange}></demo-length-config>`
    }
    const options = KEYWORD_OPTIONS[type] ?? KEYWORD_OPTIONS[item.property]
    if (options) {
      return html`<demo-keyword-config .name=${name} .options=${options} .value=${value} @change=${this.handleControlChange}></demo-keyword-config>`
    }
    return html`<c2-text-field
      class="text-control"
      spellcheck="false"
      .value=${value}
      @input=${(event: Event) => this.applyChangeDetail({ [name]: (event.target as TextField).value })}
    ></c2-text-field>`
  }

  // ---------------------------------------------------------------------------
  // Props tab
  // ---------------------------------------------------------------------------

  /** `"'sm' | 'md' | 'lg'"` -> `['sm', 'md', 'lg']`; anything else -> `null`. */
  private enumOptions(type: string): string[] | null {
    if (!type.includes('|')) return null
    const parts = type.split('|').map((part) => part.trim())
    const values = parts.filter((part) => /^'[^']*'$/.test(part) || /^"[^"]*"$/.test(part)).map((part) => part.slice(1, -1))
    // A union that also admits `string`/`undefined` is not a closed keyword set.
    return values.length >= 2 && values.length === parts.filter((part) => part !== 'undefined' && part !== 'null').length ? values : null
  }

  private renderProps() {
    const config = this.componentConfig
    if (!config || config.attributes.length === 0) {
      return html`<p class="empty">This component takes no attributes.</p>`
    }
    const initialAttributes = this.initialAttributes
    return html`<div class="props">${config.attributes.map((attr) => this.renderAttributeRow(attr, initialAttributes))}</div>`
  }

  private renderAttributeRow(attr: AttributeDeclarationItem, initialAttributes: Record<string, string>) {
    const changed = this.isAttributeChanged(attr, initialAttributes)
    const value = this.getAttributeValue(attr.name)
    const options = this.enumOptions(attr.type)
    let control: TemplateResult

    if (attr.type === 'boolean') {
      control = html`<c2-switch
        class="prop-switch"
        .checked=${value !== 'false' && value !== ''}
        aria-label=${attr.name}
        @change=${(event: Event) => this.applyChangeDetail({ [attr.name]: (event.target as Switch).checked ? 'true' : 'false' })}
      ></c2-switch>`
    } else if (options) {
      control = html`<c2-select
        class="prop-select"
        .value=${value ? [value] : []}
        placeholder=${attr.default || 'default'}
        required
        aria-label=${attr.name}
        @selection-change=${(event: CustomEvent<SelectionChangeEventDetail>) => {
          const next = event.detail.value[0]
          if (next !== undefined) this.applyChangeDetail({ [attr.name]: next })
        }}
      >
        ${options.map((option) => html`<c2-list-item value=${option}>${option}</c2-list-item>`)}
      </c2-select>`
    } else {
      control = html`<c2-text-field
        class="text-control"
        spellcheck="false"
        type=${attr.type === 'number' ? 'number' : 'text'}
        placeholder=${attr.default || attr.type}
        aria-label=${attr.name}
        .value=${value}
        @input=${(event: Event) => this.applyChangeDetail({ [attr.name]: (event.target as TextField).value })}
      ></c2-text-field>`
    }

    return html`<demo-inspector-row
      label=${attr.name}
      description=${attr.description ?? ''}
      ?changed=${changed}
      @revert=${() => resetAttribute(this.uid, attr.name)}
      >${control}</demo-inspector-row
    >`
  }

  // ---------------------------------------------------------------------------
  // Collection tab: the user's own saved variants of this component
  // ---------------------------------------------------------------------------

  private refreshSavedPresets() {
    const tag = this.componentConfig?.tagName ?? ''
    if (tag !== this.loadedPresetsFor) {
      this.loadedPresetsFor = tag
      this.savedPresets = loadSavedPresets(tag)
    }
  }

  private handleSavePreset() {
    const tag = this.componentConfig?.tagName
    if (!this.uid || !tag) return
    const name = this.presetName.trim() || `${tag.replace(/^c2-/, '')} ${this.savedPresets.length + 1}`
    this.savedPresets = savePreset(tag, name, getChanges(this.uid))
    this.presetName = ''
  }

  private handleRename(from: string, to: string) {
    const tag = this.componentConfig?.tagName
    if (!tag) return
    this.savedPresets = renamePreset(tag, from, to)
    this.renaming = ''
  }

  private async handleCopyJson() {
    if (!this.uid) return
    await navigator.clipboard.writeText(JSON.stringify({ tag: this.componentConfig?.tagName, ...getChanges(this.uid) }, null, 2))
    this.copied = true
    setTimeout(() => (this.copied = false), 1200)
  }

  private async handleExport() {
    const tag = this.componentConfig?.tagName
    if (!tag) return
    await navigator.clipboard.writeText(exportCollection(tag))
    this.copied = true
    setTimeout(() => (this.copied = false), 1200)
  }

  private handleImport() {
    const tag = this.componentConfig?.tagName
    if (!tag || !this.uid) return
    try {
      this.savedPresets = importCollection(tag, this.importJson, `${tag.replace(/^c2-/, '')} import`)
      this.importJson = ''
      this.importError = ''
    } catch (error) {
      this.importError = error instanceof Error ? error.message : 'Invalid JSON'
    }
  }

  /**
   * One row of a collection list. Built on `c2-list-item` so the list gets keyboard navigation, typeahead and the
   * site's row styling for free; the rename/delete buttons stop their click so they do not also "apply" the variant.
   */
  private renderPresetItem(name: string, meta: string, preset: PresetConfig, onDelete?: () => void, onRename?: (next: string) => void) {
    const count = Object.keys(preset.css).length + Object.keys(preset.attributes ?? {}).length
    if (onRename && this.renaming === name) {
      return html`<c2-text-field
        class="inspector-field rename-field"
        .value=${name}
        aria-label="Rename ${name}"
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === 'Enter') onRename((event.target as TextField).value)
          if (event.key === 'Escape') this.renaming = ''
        }}
        @blur=${(event: Event) => onRename((event.target as TextField).value)}
      ></c2-text-field>`
    }
    return html`<c2-list-item class="preset" value=${name}>
      ${name}
      <span slot="description">${meta || `${count} ${count === 1 ? 'value' : 'values'}`}</span>
      ${
        onDelete || onRename
          ? html`<div slot="suffix-icon" class="preset__actions" @click=${(event: Event) => event.stopPropagation()}>
              ${
                onRename
                  ? html`<c2-icon-button class="inspector-icon-btn" aria-label="Rename ${name}" tooltip="Rename" @click=${() => (this.renaming = name)}>
                      <c2-feather-edit-2></c2-feather-edit-2>
                    </c2-icon-button>`
                  : nothing
              }
              ${
                onDelete
                  ? html`<c2-icon-button class="inspector-icon-btn" aria-label="Delete ${name}" tooltip="Delete" @click=${onDelete}>
                      <c2-feather-trash-2></c2-feather-trash-2>
                    </c2-icon-button>`
                  : nothing
              }
            </div>`
          : nothing
      }
    </c2-list-item>`
  }

  /** Applying is a list selection; the list is immediately cleared so the same variant can be re-applied. */
  private handleApplyFromList(presets: { name: string; config: PresetConfig }[]) {
    return (event: CustomEvent<SelectionChangeEventDetail>) => {
      const name = event.detail.value[0]
      const match = presets.find((entry) => entry.name === name)
      if (match && this.uid) applyPreset(this.uid, match.config)
    }
  }

  private renderCollection() {
    const config = this.componentConfig
    if (!config) return nothing
    this.refreshSavedPresets()
    const tag = config.tagName
    const builtIn = componentPresets[tag]?.presets ?? []
    const changeCount = this.changeCount

    return html`<div class="collection">
      <section class="block">
        <h4 class="block__title">Save to my collection</h4>
        <div class="block__row">
          <c2-text-field
            class="inspector-field"
            placeholder="Name this variant"
            aria-label="Variant name"
            .value=${this.presetName}
            @input=${(event: Event) => (this.presetName = (event.target as TextField).value)}
            @keydown=${(event: KeyboardEvent) => event.key === 'Enter' && this.handleSavePreset()}
          ></c2-text-field>
          <c2-button class="inspector-btn inspector-btn--primary" ?disabled=${changeCount === 0} @click=${this.handleSavePreset}>Save</c2-button>
        </div>
        <p class="block__hint">
          ${
            changeCount === 0
              ? 'Change something in Design or Props, then save it here to build your own set of variants.'
              : `${changeCount} changed ${changeCount === 1 ? 'value' : 'values'}, stored in this browser.`
          }
        </p>
      </section>

      <section class="block">
        <h4 class="block__title">
          My collection ${this.savedPresets.length > 0 ? html`<c2-badge class="block__count">${this.savedPresets.length}</c2-badge>` : nothing}
        </h4>
        ${
          this.savedPresets.length === 0
            ? html`<p class="block__hint">No saved variants of <code>${tag}</code> yet.</p>`
            : html`<c2-list
                class="preset-list"
                .value=${[]}
                @selection-change=${this.handleApplyFromList(this.savedPresets.map((preset) => ({ name: preset.name, config: presetToConfig(preset) })))}
              >
                ${this.savedPresets.map((preset) =>
                  this.renderPresetItem(
                    preset.name,
                    new Date(preset.savedAt).toLocaleDateString(),
                    presetToConfig(preset),
                    () => {
                      this.savedPresets = deletePreset(tag, preset.name)
                    },
                    (next) => this.handleRename(preset.name, next),
                  ),
                )}
              </c2-list>`
        }
      </section>

      ${
        builtIn.length > 0
          ? html`<section class="block">
              <h4 class="block__title">Inspiration</h4>
              <c2-list
                class="preset-list"
                .value=${[]}
                @selection-change=${this.handleApplyFromList(builtIn.map((preset) => ({ name: preset.name, config: presetToConfig(preset) })))}
              >
                ${builtIn.map((preset) => this.renderPresetItem(preset.name, preset.description ?? '', presetToConfig(preset)))}
              </c2-list>
            </section>`
          : nothing
      }

      <c2-details class="block block--details">
        <div slot="title" class="block__title">Share &amp; import</div>
        <c2-feather-chevron-right slot="icon"></c2-feather-chevron-right>
        <div class="block__stack">
          <div class="block__row">
            <c2-button class="inspector-btn" ?disabled=${changeCount === 0} @click=${this.handleCopyJson}>
              <c2-feather-copy slot="prefix-icon"></c2-feather-copy>
              ${this.copied ? 'Copied' : 'Copy current'}
            </c2-button>
            <c2-button class="inspector-btn" ?disabled=${this.savedPresets.length === 0} @click=${this.handleExport}>
              <c2-feather-download slot="prefix-icon"></c2-feather-download>
              Export all
            </c2-button>
          </div>
          <c2-textarea
            class="import-field"
            rows="4"
            resize="vertical"
            placeholder='{"css": {"--c2-…": "value"}}'
            aria-label="Preset JSON to import"
            ?error=${!!this.importError}
            error-text=${this.importError}
            .value=${this.importJson}
            @input=${(event: Event) => {
              this.importJson = (event.target as Textarea).value
              this.importError = ''
            }}
          ></c2-textarea>
          <c2-button class="inspector-btn" ?disabled=${!this.importJson.trim()} @click=${this.handleImport}>Add to collection</c2-button>
        </div>
      </c2-details>
    </div>`
  }

  private renderCode() {
    return html`<demo-generate-code-block .componentUID=${this.uid}></demo-generate-code-block>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'demo-component-configuration-panel': ComponentConfigurationPanel
  }
}
