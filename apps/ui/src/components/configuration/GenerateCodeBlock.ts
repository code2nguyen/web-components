import { LitElement, html, css, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { StoreController } from '@nanostores/lit'
import { $configCodeStore } from '../../store/config-code-store.ts'
import { $configStore } from '../../store/config-store.ts'
import { generateCode, getChanges, type CodeFormat } from '../../utils/playground.ts'

import '@c2n/code-viewer'
import '@c2n/tabs'
import '@c2n/tabs/tab.js'
import '@c2n/text-field'
import type { TextField } from '@c2n/text-field'

const FORMATS: { id: CodeFormat; label: string; hint: string }[] = [
  { id: 'html', label: 'HTML', hint: 'Drop-in snippet: the example markup with a class and the overrides in a <style> block.' },
  { id: 'css', label: 'CSS', hint: 'Only the custom property overrides, scoped to a class you can put on any ancestor.' },
  { id: 'lit', label: 'Lit', hint: 'Own it: a subclass with the theme baked in, registered under your own tag name.' },
  { id: 'json', label: 'JSON', hint: 'Portable preset. Paste it back through “Share & import” in the Collection tab.' },
]

/**
 * Code tab of the inspector. Turns the current changes of the selected example into copy-paste code, shadcn-style:
 * you play with the parameters, then take the code and make it your own component.
 */
@customElement('demo-generate-code-block')
export class GenerateCodeBLock extends LitElement {
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
      }
      // Segmented control built from c2-tabs: no indicator, a tinted track, the selected tab as a raised pill.
      .formats {
        --c2-tabs--box-shadow: none;
        --c2-tabs--background-color: var(--site-color-surface-container-2);
        --c2-tabs--border-radius: 8px;
        --c2-tabs--padding-top: 3px;
        --c2-tabs--padding-right: 3px;
        --c2-tabs--padding-bottom: 3px;
        --c2-tabs--padding-left: 3px;
        --c2-tabs--gap: 2px;
        --c2-tabs--height: 32px;
        --c2-tabs__indicator--height: 0px;
        --c2-tabs__tab--flex: 1 1 0;
        --c2-tabs__tab--padding-top: 0px;
        --c2-tabs__tab--padding-bottom: 0px;
        --c2-tabs__tab--padding-left: 8px;
        --c2-tabs__tab--padding-right: 8px;
        --c2-tabs__tab--font-size: 11.5px;
        --c2-tabs__tab--font-weight: 500;
        --c2-tabs__tab--border-top-left-radius: 6px;
        --c2-tabs__tab--border-top-right-radius: 6px;
        --c2-tabs__tab--border-bottom-left-radius: 6px;
        --c2-tabs__tab--border-bottom-right-radius: 6px;
        --c2-tabs__tab--color: var(--site-color-on-surface-variant);
        --c2-tabs__tab__hover--color: var(--site-color-on-surface);
        --c2-tabs__tab__selected--color: var(--site-color-on-surface);
        --c2-tabs__tab__selected--background-color: var(--site-color-surface);
      }
      .name {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11.5px;
        color: var(--site-color-on-surface-variant);
      }
      .name c2-text-field {
        flex: 1;
        min-width: 0;
        --c2-text-field--min-height: 26px;
        --c2-text-field--font-size: 12px;
        --c2-text-field--font-family: var(--site-font-mono);
        --c2-text-field--padding-left: 8px;
        --c2-text-field--padding-right: 8px;
        --c2-text-field--background: var(--site-color-surface-container-1);
      }
      .hint {
        margin: 0;
        font-size: 11.5px;
        line-height: 1.5;
        color: var(--site-color-on-surface-muted);
      }
      .viewer {
        position: relative;
        border: 1px solid var(--site-color-outline-variant);
        border-radius: 8px;
        overflow: hidden;
        background: var(--site-color-surface-container-1);
      }
      .code-viewer {
        display: block;
        padding: 10px 12px;
        font-size: 11.5px;
        --c2-code-viewer--background: transparent;
      }
      .code-viewer {
        --c2-code-viewer__copy--size: 24px;
        --c2-code-viewer__copy--icon-size: 14px;
      }
    `,
  ]

  @property() componentUID = ''
  @state() private format: CodeFormat = 'html'
  @state() private name = ''

  private configStore = new StoreController(this, $configStore)
  private codeStore = new StoreController(this, $configCodeStore)

  private get tag() {
    return this.configStore.value.configs?.get(this.componentUID)?.tagName ?? ''
  }

  private get elementName() {
    return this.name || `my-${this.tag.replace(/^c2-/, '')}`
  }

  private get codeTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'github-dark-default' : 'github-light'
  }

  private handleThemeChange = () => this.requestUpdate()

  override connectedCallback() {
    super.connectedCallback()
    window.addEventListener('c2n-theme-change', this.handleThemeChange)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('c2n-theme-change', this.handleThemeChange)
  }

  private handleFormatChange = (event: CustomEvent<{ value: string }>) => {
    // The name field below also fires `change`; only the strip's own event switches format.
    if ((event.target as HTMLElement | null)?.localName !== 'c2-tabs') return
    const value = event.detail?.value
    if (value) this.format = value.replace(/^format-/, '') as CodeFormat
  }

  private generate() {
    if (!this.componentUID || !this.tag) return ''
    const source = this.codeStore.value[this.componentUID]?.code ?? `<${this.tag}></${this.tag}>`
    return generateCode(this.format, { tag: this.tag, html: source, changes: getChanges(this.componentUID), name: this.elementName })
  }

  override render() {
    if (!this.componentUID) return nothing
    const code = this.generate()
    const format = FORMATS.find((entry) => entry.id === this.format)!
    const language = this.format === 'lit' ? 'ts' : this.format === 'json' ? 'json' : this.format
    return html`
      <c2-tabs class="formats" selected-tab=${`format-${this.format}`} @change=${this.handleFormatChange}>
        ${FORMATS.map((entry) => html`<c2-tab label=${entry.label} for=${`format-${entry.id}`}></c2-tab>`)}
      </c2-tabs>
      <label class="name">
        <span>${this.format === 'lit' ? 'Tag name' : 'Class name'}</span>
        <c2-text-field .value=${this.elementName} @input=${(event: Event) => (this.name = (event.target as TextField).value.trim())}></c2-text-field>
      </label>
      <p class="hint">${format.hint}</p>
      <div class="viewer">
        <c2-code-viewer class="code-viewer" .code=${code} .theme=${this.codeTheme} language=${language} wrap copyable></c2-code-viewer>
      </div>
    `
  }
}
