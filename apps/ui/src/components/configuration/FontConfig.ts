import { LitElement, html, css, nothing } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import '@c2n/select'
import '@c2n/list-item'
import '@c2n/text-field'
import type { TextField } from '@c2n/text-field'
import type { SelectionChangeEventDetail } from '@c2n/list'
import { FONT_PROPERTY } from '../../utils/dom.ts'
import { formatLength, parseLength } from '../../utils/css-value.ts'

/**
 * Font block: family, size, weight and style of one part, in a single row group.
 *
 * Three fixes over the previous version. The selects are bound to the current values (only `font-size` was, so the
 * other three always read "font-family" / "font-weight" no matter what the component had). The families are the ones
 * the site can actually render — the old list offered `Caveat Variable`, `Pacifico`, `IMB Plex Mono` (sic) and the
 * rest, none of which is loaded, so picking them changed nothing — and each webfont is fetched on demand the first
 * time it is selected, so a docs page pays nothing for fonts nobody picked. Size is a free field again, so `0.875rem`
 * and `14px` both work.
 */

// Families the repo ships as a `@fontsource` dependency, as stylesheet URLs.
//
// `?url` is what makes this lazy: a plain (or dynamic) `import` of the CSS gets hoisted by Vite and inlined into
// every page's HTML, so all ten families' `@font-face` blocks would ship on every docs page. `?url` emits the
// stylesheet as its own asset and gives us just the string; the browser fetches it only once `loadFamily` injects
// the `<link>`. Inter and IBM Plex Mono are already loaded globally by assets/global.scss, so they are not here.
import anonymousPro from '@fontsource/anonymous-pro/400.css?url'
import caveat from '@fontsource/caveat/400.css?url'
import crimsonText from '@fontsource/crimson-text/400.css?url'
import pacifico from '@fontsource/pacifico/400.css?url'
import playfairDisplay from '@fontsource/playfair-display/400.css?url'
import roboto from '@fontsource/roboto/400.css?url'
import robotoMono from '@fontsource/roboto-mono/400.css?url'
import sourceSerifPro from '@fontsource/source-serif-pro/400.css?url'

const ON_DEMAND_FONTS: Record<string, string> = {
  'Anonymous Pro': anonymousPro,
  Caveat: caveat,
  'Crimson Text': crimsonText,
  Pacifico: pacifico,
  'Playfair Display': playfairDisplay,
  Roboto: roboto,
  'Roboto Mono': robotoMono,
  'Source Serif Pro': sourceSerifPro,
}

/** Families already on the page (site chrome), plus the ones fetched on demand. */
const WEBFONTS: Record<string, true> = {
  Inter: true,
  'IBM Plex Mono': true,
  ...(Object.fromEntries(Object.keys(ON_DEMAND_FONTS).map((family) => [family, true])) as Record<string, true>),
}

/** Generic stacks, which need no download at all. */
const GENERIC_FAMILIES = ['inherit', 'system-ui', 'sans-serif', 'serif', 'monospace', 'cursive']

const FONT_WEIGHTS = ['300', '400', '500', '600', '700', '800', '900']
const FONT_STYLES = ['normal', 'italic', 'oblique']

const loaded = new Set<string>()

/** Adds the family's stylesheet to the document once. The `<link>` goes in `<head>`: `@font-face` is document-scoped. */
function loadFamily(family: string) {
  const href = ON_DEMAND_FONTS[family]
  if (!href || loaded.has(family)) return
  loaded.add(family)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.append(link)
}

@customElement('demo-font-config')
export class FontConfig extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .font-config {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 4px;
        min-width: 0;
      }
      .family {
        grid-column: 1 / -1;
      }
      c2-select {
        min-width: 0;
        --c2-select__button--font-size: 11.5px;
        --c2-select__button--padding: 4px 4px 4px 8px;
      }
      c2-text-field {
        min-width: 0;
        --c2-text-field--font-family: var(--site-font-mono);
        --c2-text-field--font-size: 11.5px;
        --c2-text-field--padding-left: 8px;
        --c2-text-field--padding-right: 4px;
      }
    `,
  ]

  /** CSS variable per font property, in the same order as `values`. */
  @property({ attribute: false }) names: string[] = []
  @property({ attribute: false }) values: string[] = []

  /** `['font-family', 'font-size', …]` derived from `names`, so a value can be looked up by property. */
  private get properties(): string[] {
    return this.names.map((name) => {
      const property = name.split('--').pop() ?? ''
      return FONT_PROPERTY.includes(property) ? property : ''
    })
  }

  private nameOf(property: string): string | undefined {
    const index = this.properties.indexOf(property)
    return index === -1 ? undefined : this.names[index]
  }

  private readValue(property: string): string {
    const index = this.properties.indexOf(property)
    return index === -1 ? '' : (this.values[index] ?? '').trim()
  }

  private emit(property: string, value: string) {
    const name = this.nameOf(property)
    if (!name) return
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, cancelable: true, detail: { [name]: value } }))
  }

  private handleFamilyChange(event: CustomEvent<SelectionChangeEventDetail>) {
    const family = event.detail.value[0]
    if (!family) return
    loadFamily(family)
    // Quote a family whose name has spaces, and give a webfont a generic fallback.
    const quoted = /\s/.test(family) ? `'${family}'` : family
    const fallback = WEBFONTS[family] ? `, ${genericFallback(family)}` : ''
    this.emit('font-family', GENERIC_FAMILIES.includes(family) ? family : `${quoted}${fallback}`)
  }

  private handleSizeInput(event: Event & { target: TextField }) {
    const raw = event.target.value.trim()
    if (!raw) return
    const typed = parseLength(raw)
    if (!typed) {
      this.emit('font-size', raw)
      return
    }
    const unit = typed.unit || parseLength(this.readValue('font-size'))?.unit || 'px'
    this.emit('font-size', formatLength({ value: typed.value, unit }))
  }

  private handleKeywordChange(property: string) {
    return (event: CustomEvent<SelectionChangeEventDetail>) => {
      const value = event.detail.value[0]
      if (value !== undefined) this.emit(property, value)
    }
  }

  override willUpdate() {
    // Show the current family in its own face even before the user opens the select.
    const current = currentFamilyKey(this.readValue('font-family'))
    if (current) loadFamily(current)
  }

  private renderFamily() {
    const current = currentFamilyKey(this.readValue('font-family'))
    const families = [...GENERIC_FAMILIES, ...Object.keys(WEBFONTS)]
    return html`<c2-select class="family" .value=${current ? [current] : []} placeholder="font-family" required @selection-change=${this.handleFamilyChange}>
      ${families.map(
        (family) =>
          html`<c2-list-item value=${family} style=${GENERIC_FAMILIES.includes(family) ? `font-family:${family}` : `font-family:'${family}'`}
            >${family}</c2-list-item
          >`,
      )}
    </c2-select>`
  }

  render() {
    const properties = this.properties
    return html`<div class="font-config">
      ${properties.includes('font-family') ? this.renderFamily() : nothing}
      ${
        properties.includes('font-size')
          ? html`<c2-text-field
              spellcheck="false"
              aria-label="font-size"
              placeholder="font-size"
              .value=${this.readValue('font-size')}
              @input=${this.handleSizeInput}
            ></c2-text-field>`
          : nothing
      }
      ${
        properties.includes('font-weight')
          ? html`<c2-select
              .value=${optionValue(this.readValue('font-weight'), FONT_WEIGHTS)}
              placeholder="font-weight"
              required
              @selection-change=${this.handleKeywordChange('font-weight')}
            >
              ${FONT_WEIGHTS.map((weight) => html`<c2-list-item value=${weight} style="font-weight:${weight}">${weight}</c2-list-item>`)}
            </c2-select>`
          : nothing
      }
      ${
        properties.includes('font-style')
          ? html`<c2-select
              .value=${optionValue(this.readValue('font-style'), FONT_STYLES)}
              placeholder="font-style"
              required
              @selection-change=${this.handleKeywordChange('font-style')}
            >
              ${FONT_STYLES.map((style) => html`<c2-list-item value=${style} style="font-style:${style}">${style}</c2-list-item>`)}
            </c2-select>`
          : nothing
      }
    </div>`
  }
}

/** `'Playfair Display', serif` -> `Playfair Display`, so a stored stack still selects its row. */
function currentFamilyKey(value: string): string | undefined {
  if (!value) return undefined
  const first = (value.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '')
  if (!first) return undefined
  if (GENERIC_FAMILIES.includes(first) || first in WEBFONTS) return first
  // An unknown family (`Comic Sans MS`, `var(--site-font-sans)`): leave the select empty rather than lie.
  return undefined
}

function optionValue(value: string, options: string[]): string[] {
  const normalized = value === 'normal' && options.includes('400') ? '400' : value
  return options.includes(normalized) ? [normalized] : []
}

/** Generic family each webfont falls back to while it loads (or if it fails to). */
const FALLBACKS: Record<string, string> = {
  Inter: 'sans-serif',
  Roboto: 'sans-serif',
  'IBM Plex Mono': 'monospace',
  'Roboto Mono': 'monospace',
  'Anonymous Pro': 'monospace',
  'Crimson Text': 'serif',
  'Playfair Display': 'serif',
  'Source Serif Pro': 'serif',
  Caveat: 'cursive',
  Pacifico: 'cursive',
}

function genericFallback(family: string): string {
  return FALLBACKS[family] ?? 'sans-serif'
}

declare global {
  interface HTMLElementTagNameMap {
    'demo-font-config': FontConfig
  }
}
