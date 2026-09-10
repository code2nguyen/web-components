import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { Task } from '@lit/task'
import styles from './code-viewer.scss?inline'
import { highlight, isKnownTheme, normalizeLang, type HighlightResult, type ThemeName } from './shiki'

export type { ThemeName } from './shiki'

const LEGACY_LANG_ATTRIBUTE = 'langage'

/**
 * Syntax-highlighted source code powered by shiki. Grammars and themes are loaded on demand into one shared
 * highlighter, so many viewers on a page cost one engine. The raw code renders immediately as plain text (also on the
 * server) and is upgraded in place once highlighted.
 *
 * Source: the `code` property, or the default slot. Wrap slotted text in a `<pre>` (formatters such as Prettier collapse
 * whitespace inside custom elements but leave `<pre>` alone) and markup samples in a `<template>` so the browser does
 * not parse them. Common indentation is stripped.
 *
 * @tag c2-code-viewer
 *
 * @slot - Source code, in a `<pre>` (text) or a `<template>` (markup). Ignored when the `code` property is set.
 * @slot title - Header label, typically a file name. Shown above the code when present.
 * @slot copy-icon - Replaces the default copy icon.
 * @slot copied-icon - Replaces the default check icon shown after copying.
 *
 * @event {CustomEvent<{ code: string }>} code-copy - Fired after the copy button put the code on the clipboard.
 *
 * @cssproperty {background} --c2-code-viewer--background - Overrides the theme background.
 * @cssproperty {color} --c2-code-viewer--color - Overrides the theme foreground.
 * @cssproperty {font-family} [--c2-code-viewer--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {font-size} [--c2-code-viewer--font-size=13px]
 * @cssproperty {line-height} [--c2-code-viewer--line-height=1.6]
 * @cssproperty {tab-size} [--c2-code-viewer--tab-size=2]
 * @cssproperty {pixel} --c2-code-viewer--max-height - The code scrolls vertically past this height.
 *
 * @cssproperty {padding} [--c2-code-viewer--padding-top=12px]
 * @cssproperty {padding} [--c2-code-viewer--padding-right=16px]
 * @cssproperty {padding} [--c2-code-viewer--padding-bottom=12px]
 * @cssproperty {padding} [--c2-code-viewer--padding-left=16px]
 *
 * @cssproperty {border} [--c2-code-viewer--border-top=1px solid rgb(213, 213, 213)]
 * @cssproperty {border} [--c2-code-viewer--border-right=1px solid rgb(213, 213, 213)]
 * @cssproperty {border} [--c2-code-viewer--border-bottom=1px solid rgb(213, 213, 213)]
 * @cssproperty {border} [--c2-code-viewer--border-left=1px solid rgb(213, 213, 213)]
 * @cssproperty {box-shadow} --c2-code-viewer--box-shadow
 *
 * @cssproperty {border-radius} [--c2-code-viewer--border-top-left-radius=8px]
 * @cssproperty {border-radius} [--c2-code-viewer--border-top-right-radius=8px]
 * @cssproperty {border-radius} [--c2-code-viewer--border-bottom-left-radius=8px]
 * @cssproperty {border-radius} [--c2-code-viewer--border-bottom-right-radius=8px]
 *
 * @cssproperty {background} [--c2-code-viewer__header--background=rgba(127, 127, 127, 0.08)]
 * @cssproperty {color} --c2-code-viewer__header--color
 * @cssproperty {font-family} --c2-code-viewer__header--font-family - Defaults to the code font.
 * @cssproperty {font-size} [--c2-code-viewer__header--font-size=12px]
 * @cssproperty {padding} [--c2-code-viewer__header--padding-top=6px]
 * @cssproperty {padding} [--c2-code-viewer__header--padding-right=8px]
 * @cssproperty {padding} [--c2-code-viewer__header--padding-bottom=6px]
 * @cssproperty {padding} [--c2-code-viewer__header--padding-left=16px]
 * @cssproperty {border} [--c2-code-viewer__header--border-bottom=1px solid rgba(127, 127, 127, 0.2)]
 *
 * @cssproperty {pixel} [--c2-code-viewer__copy--size=28px]
 * @cssproperty {pixel} [--c2-code-viewer__copy--icon-size=14px]
 * @cssproperty {border-radius} [--c2-code-viewer__copy--border-radius=6px]
 * @cssproperty {color} --c2-code-viewer__copy--color - Defaults to the code foreground at 70% opacity.
 * @cssproperty {background} --c2-code-viewer__copy--background
 * @cssproperty {background} [--c2-code-viewer__copy__hover--background=rgba(127, 127, 127, 0.15)]
 * @cssproperty {color} [--c2-code-viewer__copy__copied--color=rgb(34, 197, 94)]
 *
 * @cssproperty {pixel} [--c2-code-viewer__line-numbers--min-width=2ch]
 * @cssproperty {pixel} [--c2-code-viewer__line-numbers--gap=16px]
 * @cssproperty {color} --c2-code-viewer__line-numbers--color - Defaults to the foreground at 45% opacity.
 *
 * @cssproperty {background} [--c2-code-viewer__line__highlighted--background=rgba(99, 102, 241, 0.12)]
 * @cssproperty {border} [--c2-code-viewer__line__highlighted--border-left=3px solid rgb(99, 102, 241)]
 *
 * @cssproperty {color} [--c2-code-viewer__theme--foreground=#24292e] - `css-variables` theme only.
 * @cssproperty {color} [--c2-code-viewer__theme--background=#ffffff] - `css-variables` theme only.
 * @cssproperty {color} [--c2-code-viewer__theme--token-constant=#005cc5] - `css-variables` theme only.
 * @cssproperty {color} [--c2-code-viewer__theme--token-string=#032f62] - `css-variables` theme only.
 * @cssproperty {color} [--c2-code-viewer__theme--token-comment=#6a737d] - `css-variables` theme only.
 * @cssproperty {color} [--c2-code-viewer__theme--token-keyword=#d73a49] - `css-variables` theme only.
 * @cssproperty {color} [--c2-code-viewer__theme--token-parameter=#24292e] - `css-variables` theme only.
 * @cssproperty {color} [--c2-code-viewer__theme--token-function=#6f42c1] - `css-variables` theme only.
 * @cssproperty {color} [--c2-code-viewer__theme--token-string-expression=#22863a] - `css-variables` theme only.
 * @cssproperty {color} [--c2-code-viewer__theme--token-punctuation=#24292e] - `css-variables` theme only.
 * @cssproperty {color} [--c2-code-viewer__theme--token-link=#032f62] - `css-variables` theme only.
 */
@customElement('c2-code-viewer')
export class CodeViewer extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Source code. When unset, the default slot's text is used. A literal `\n` counts as a newline when the text has none. */
  @property() code: string | undefined = undefined

  /**
   * Language id or alias (`ts`, `html`, `bash`, `diff`, …). Unknown values render as plain text. (Not `lang`: that is the
   * global attribute for the natural language of the element's text and is read by assistive technology.)
   */
  @property({ reflect: true }) language = 'plaintext'

  /** shiki theme name, or `css-variables`. */
  @property() theme: ThemeName = 'github-light'

  /** Second theme for dark mode. When set both palettes are rendered and `color-scheme` picks one. */
  @property({ attribute: 'dark-theme' }) darkTheme: ThemeName | undefined = undefined

  /** Which palette to show when `dark-theme` is set: follow the OS (`auto`), or force one. */
  @property({ reflect: true, attribute: 'color-scheme' }) colorScheme: 'auto' | 'light' | 'dark' = 'auto'

  /** Soft-wrap long lines instead of scrolling horizontally. */
  @property({ type: Boolean, reflect: true }) wrap = false

  /** Render as an inline `<code>` fragment (no frame, no header). */
  @property({ type: Boolean, reflect: true }) inline = false

  @property({ type: Boolean, reflect: true, attribute: 'line-numbers' }) lineNumbers = false

  /** First line number when `line-numbers` is on. */
  @property({ type: Number, attribute: 'start-line' }) startLine = 1

  /** Lines to emphasise, 1-based, e.g. `"2-4,7"`. */
  @property({ attribute: 'highlight-lines' }) highlightLines = ''

  /** Show a copy-to-clipboard button. */
  @property({ type: Boolean, reflect: true }) copyable = false

  @state() private slotCode = ''
  @state() private hasTitle = false
  @state() private highlighted: HighlightResult | undefined = undefined
  @state() private copied = false

  private copiedTimer: ReturnType<typeof setTimeout> | undefined

  /** Accepts the pre-1.0 `langage` attribute. */
  static override get observedAttributes() {
    return [...super.observedAttributes, LEGACY_LANG_ATTRIBUTE]
  }

  override attributeChangedCallback(name: string, old: string | null, value: string | null) {
    if (name === LEGACY_LANG_ATTRIBUTE) {
      if (value !== null) this.language = value
      return
    }
    super.attributeChangedCallback(name, old, value)
  }

  /** The code being displayed: `code` or the dedented slot text. */
  get source(): string {
    if (this.code === undefined) return this.slotCode
    // Attributes (and framework props) cannot carry newlines comfortably: accept `\n` escapes when there are no real ones.
    return this.code.includes('\n') ? this.code : this.code.replace(/\\n/g, '\n')
  }

  private get highlightedLines(): Set<number> {
    const lines = new Set<number>()
    for (const part of this.highlightLines.split(',')) {
      const [from, to] = part
        .trim()
        .split('-')
        .map((n) => Number.parseInt(n, 10))
      if (Number.isNaN(from)) continue
      const last = to === undefined || Number.isNaN(to) ? from : to
      for (let i = from; i <= last; i++) lines.add(i)
    }
    return lines
  }

  protected highlightTask = new Task(this, {
    args: () => [this.source, this.language, this.theme, this.darkTheme, this.inline, this.lineNumbers, this.startLine, this.highlightLines] as const,
    task: async ([code, lang, theme, darkTheme, inline, lineNumbers, startLine]) => {
      if (!code) return { html: '', style: '' }
      const safeTheme = isKnownTheme(theme) ? theme : 'github-light'
      const safeDark = isKnownTheme(darkTheme) ? darkTheme : undefined
      return highlight({ code, lang, theme: safeTheme, darkTheme: safeDark, inline, lineNumbers, startLine, highlightedLines: this.highlightedLines })
    },
    onComplete: (value) => {
      this.highlighted = value
    },
  })

  override willUpdate(changed: PropertyValues) {
    // New text or language: show the plain version until the new highlight lands, rather than stale colours over new code.
    if (changed.has('code') || changed.has('slotCode') || changed.has('language') || changed.has('inline')) this.highlighted = undefined
  }

  override firstUpdated() {
    for (const slot of this.renderRoot.querySelectorAll('slot')) this.updateSlot(slot)
  }

  private handleSlotChange(event: Event) {
    this.updateSlot(event.target as HTMLSlotElement)
  }

  private updateSlot(slot: HTMLSlotElement) {
    const nodes = slot.assignedNodes({ flatten: true })
    if (slot.name === 'title') {
      this.hasTitle = nodes.some((n) => n.nodeType === Node.ELEMENT_NODE || (n.textContent ?? '').trim() !== '')
    } else if (slot.name === '') {
      // With <pre> / <template> children, the whitespace text nodes around them are formatting, not code.
      const elements = nodes.filter((n): n is Element => n.nodeType === Node.ELEMENT_NODE)
      const parts = (elements.length ? elements : nodes).map((n) => (n instanceof HTMLTemplateElement ? n.innerHTML : (n.textContent ?? '')))
      this.slotCode = dedent(parts.join(''))
    }
  }

  /** Copies the displayed code to the clipboard. */
  async copy() {
    const code = this.source
    await navigator.clipboard.writeText(code)
    this.copied = true
    clearTimeout(this.copiedTimer)
    this.copiedTimer = setTimeout(() => (this.copied = false), 2000)
    this.dispatchEvent(new CustomEvent('code-copy', { detail: { code }, bubbles: true, composed: true }))
  }

  private renderCopyButton() {
    return html`
      <button
        class=${classMap({ 'c2-code-viewer-copy': true, 'is-copied': this.copied })}
        type="button"
        aria-label=${this.copied ? 'Copied' : 'Copy code'}
        @click=${this.copy}
      >
        ${
          this.copied
            ? html`<slot name="copied-icon"
                ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline></svg
              ></slot>`
            : html`<slot name="copy-icon"
                ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg
              ></slot>`
        }
      </button>
    `
  }

  private renderCode() {
    if (this.highlighted !== undefined) return unsafeHTML(this.highlighted.html)
    // Plain fallback: same structure as shiki's output so nothing moves when the highlight arrives.
    return this.inline
      ? html`${this.source}`
      : html`<pre
          class="shiki plain ${this.lineNumbers ? 'has-line-numbers' : ''}"
        ><code style=${this.lineNumbers ? `counter-reset: line ${this.startLine - 1}` : nothing}>${this.source.split('\n').map((line, i, all) => html`<span class="line">${line}</span>${i < all.length - 1 ? '\n' : ''}`)}</code></pre>`
  }

  override render() {
    const source = html`<slot hidden @slotchange=${this.handleSlotChange}></slot>`
    if (this.inline) {
      return html`${source}<code
          class="c2-code-viewer-inline ${this.darkTheme ? 'dual' : ''}"
          style=${this.highlighted?.style || nothing}
          data-language=${normalizeLang(this.language)}
          >${this.renderCode()}</code
        >`
    }
    return html`
      ${source}
      <div class=${classMap({ 'c2-code-viewer': true, 'has-title': this.hasTitle })} style=${this.highlighted?.style || nothing}>
        <div class="c2-code-viewer-header" ?hidden=${!this.hasTitle}>
          <slot name="title" @slotchange=${this.handleSlotChange}></slot>
          ${this.copyable ? this.renderCopyButton() : nothing}
        </div>
        <div class="c2-code-viewer-body">${this.renderCode()} ${this.copyable && !this.hasTitle ? this.renderCopyButton() : nothing}</div>
      </div>
    `
  }
}

/** Removes leading/trailing blank lines and the indentation shared by every non-empty line. */
export function dedent(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length && lines[0].trim() === '') lines.shift()
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  const indent = Math.min(...lines.filter((l) => l.trim() !== '').map((l) => l.match(/^[ \t]*/)![0].length))
  return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n')
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-code-viewer': CodeViewer
  }
}
