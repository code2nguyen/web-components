import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { isServer } from 'lit-html/is-server.js'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { createEditor, type EditorHandle, type LanguageLoader } from './engine.js'
import styles from './code-editor.scss?inline'

export { BUILT_IN_LANGUAGES } from './engine.js'
export type { BuiltInLanguage, LanguageLoader } from './engine.js'

/** How far the engine got. `basic` is the textarea fallback: CodeMirror is not installed. */
export type CodeEditorEngineState = 'pending' | 'ready' | 'basic'

/** Events fired by {@link CodeEditor}, keyed for `addEventListener`. */
export interface CodeEditorEventMap {
  input: Event
  change: Event
  /** The engine settled. `detail.engine` is `codemirror` or `basic`. */
  ready: CustomEvent<{ engine: 'codemirror' | 'basic' }>
}

export interface CodeEditor {
  addEventListener: TypedAddEventListener<CodeEditor, CodeEditorEventMap>
  removeEventListener: TypedRemoveEventListener<CodeEditor, CodeEditorEventMap>
}

/**
 * Source-code field built on CodeMirror 6, which is an **optional peer dependency**: nothing is imported until an
 * editor mounts, and when the peer is absent the element degrades to a plain `<textarea>` carrying the same value,
 * the same events and the same form behaviour — only without highlighting. Install what you need alongside it:
 *
 * ```sh
 * npm install @codemirror/state @codemirror/view @codemirror/commands @codemirror/language \
 *   @codemirror/autocomplete @codemirror/search @lezer/highlight @codemirror/lang-javascript
 * ```
 *
 * It is form-associated: `name` and `value` take part in a `<form>`, it restores on reset, and it fires the plain
 * `input` and `change` a `v-model`, a `ControlValueAccessor` or any generic two-way binding listens for.
 *
 * Colours are **not** a CodeMirror theme. The editor renders real DOM inside the shadow root, so every surface,
 * gutter and token colour is an ordinary `--c2-code-editor__*` custom property — including the syntax palette, whose
 * `--c2-code-editor__theme--token-*` names match `@c2n/code-viewer`'s `css-variables` theme so one palette can drive
 * both. Dark mode is therefore just different variable values, with no JavaScript involved.
 *
 * Grammars for `javascript`, `typescript`, `jsx`, `tsx`, `html`, `css` and `json` are built in and loaded on demand.
 * Any other language comes from `languageLoader`, so adding Python or SQL costs this package no dependency.
 *
 * @tag c2-code-editor
 *
 * @slot label - Label shown above the editor. Falls back to the `label` attribute.
 * @slot supporting-text - Help text under the editor. Replaced by `error-text` while `error` is set.
 *
 * @event {Event} input - The document changed. Fires on every edit.
 * @event {Event} change - The value was committed: the editor lost focus after an edit, as a native control does.
 * @event {CustomEvent<{ engine: 'codemirror' | 'basic' }>} ready - The engine settled, so tests and hosts can wait for it. Does not bubble.
 *
 * @csspart container - The box around the label, editor and supporting text.
 * @csspart label - The label above the editor.
 * @csspart editor - The element CodeMirror renders into, or the fallback textarea.
 * @csspart supporting-text - The help / error row under the editor.
 *
 * @cssproperty {color} [--c2-code-editor--background=#ffffff]
 * @cssproperty {color} [--c2-code-editor--color=#24292e] - Foreground of text no token class matched.
 * @cssproperty {border} [--c2-code-editor--border=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-code-editor__focus--border=1px solid rgb(2, 101, 220)]
 * @cssproperty {outline} [--c2-code-editor__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {border-radius} [--c2-code-editor--border-radius=6px]
 * @cssproperty {box-shadow} --c2-code-editor--box-shadow
 * @cssproperty {opacity} [--c2-code-editor__disabled--opacity=0.38]
 *
 * @cssproperty {font-family} [--c2-code-editor--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {font-size} [--c2-code-editor--font-size=13px]
 * @cssproperty {line-height} [--c2-code-editor--line-height=1.6]
 * @cssproperty {pixel} [--c2-code-editor--min-height=120px]
 * @cssproperty {pixel} [--c2-code-editor--max-height=420px] - The editor scrolls past this height. A height set on
 * the element itself reaches the editor (the label and supporting text keep theirs); set this to `none` to fill it.
 * @cssproperty {padding} [--c2-code-editor--padding-block=10px]
 * @cssproperty {padding} [--c2-code-editor--padding-inline=12px]
 *
 * @cssproperty {color} [--c2-code-editor__gutter--background=transparent]
 * @cssproperty {color} [--c2-code-editor__gutter--color=#71717a]
 * @cssproperty {color} [--c2-code-editor__gutter__active--color=#18181b]
 * @cssproperty {border} [--c2-code-editor__gutter--border-right=1px solid #e4e4e7]
 * @cssproperty {pixel} [--c2-code-editor__gutter--min-width=32px]
 *
 * @cssproperty {color} [--c2-code-editor__active-line--background=rgba(2, 101, 220, 0.04)]
 * @cssproperty {color} [--c2-code-editor__selection--background=rgba(2, 101, 220, 0.18)]
 * @cssproperty {color} [--c2-code-editor__cursor--color=#18181b]
 * @cssproperty {color} [--c2-code-editor__matching-bracket--background=rgba(2, 101, 220, 0.16)]
 * @cssproperty {color} [--c2-code-editor__placeholder--color=#71717a]
 *
 * @cssproperty {color} [--c2-code-editor__theme--token-keyword=#cf222e]
 * @cssproperty {color} [--c2-code-editor__theme--token-string=#032f62]
 * @cssproperty {color} [--c2-code-editor__theme--token-comment=#636c76]
 * @cssproperty {color} [--c2-code-editor__theme--token-constant=#0550ae]
 * @cssproperty {color} [--c2-code-editor__theme--token-function=#6f42c1]
 * @cssproperty {color} [--c2-code-editor__theme--token-type=#953800]
 * @cssproperty {color} [--c2-code-editor__theme--token-property=#0550ae]
 * @cssproperty {color} [--c2-code-editor__theme--token-variable=#24292e]
 * @cssproperty {color} [--c2-code-editor__theme--token-tag=#116329]
 * @cssproperty {color} [--c2-code-editor__theme--token-punctuation=#24292e]
 * @cssproperty {color} [--c2-code-editor__theme--token-link=#032f62]
 * @cssproperty {color} [--c2-code-editor__theme--token-invalid=#cf222e]
 *
 * @cssproperty {color} [--c2-code-editor__label--color=#18181b]
 * @cssproperty {font-size} [--c2-code-editor__label--font-size=12px]
 * @cssproperty {font-weight} [--c2-code-editor__label--font-weight=500]
 * @cssproperty {color} [--c2-code-editor__supporting-text--color=#71717a]
 * @cssproperty {font-size} [--c2-code-editor__supporting-text--font-size=12px]
 * @cssproperty {color} [--c2-code-editor__error--color=#dc2626]
 * @cssproperty {border} [--c2-code-editor__error--border=1px solid #dc2626]
 * @cssproperty {pixel} [--c2-code-editor--gap=6px] - Space between the label, the editor and the supporting text.
 */
@customElement('c2-code-editor')
export class CodeEditor extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  /** The source code. Assigning it replaces the document without losing scroll position or undo history. */
  @property() value = ''

  /** Language id: one of `BUILT_IN_LANGUAGES`, anything `languageLoader` resolves, or empty for no highlighting. */
  @property({ reflect: true }) language = ''

  /**
   * Resolves a language id this package has no grammar for, to a CodeMirror `Extension`. Property only — it takes a
   * function, so there is no attribute for it.
   */
  @property({ attribute: false }) languageLoader: LanguageLoader | undefined = undefined

  /** Form field name. */
  @property() name = ''

  /** Label above the editor, when the `label` slot is empty. */
  @property() label = ''

  /** Accessible name when nothing visible labels the editor. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Text shown while the document is empty. */
  @property() placeholder = ''

  /** The document cannot be edited, but is still selectable and focusable. */
  @property({ type: Boolean, reflect: true, attribute: 'readonly' }) readOnly = false

  /** Blocks interaction entirely and dims the editor. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The form is invalid while the value is empty. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Show the line-number gutter. */
  @property({ type: Boolean, reflect: true, attribute: 'line-numbers' }) lineNumbers = false

  /** Wrap long lines instead of scrolling horizontally. */
  @property({ type: Boolean, reflect: true }) wrap = false

  /** Offer completions while typing (identifiers, and whatever the grammar contributes). */
  @property({ type: Boolean, reflect: true }) autocomplete = false

  /** Width of a tab stop, in characters. */
  @property({ type: Number, attribute: 'tab-size' }) tabSize = 2

  /** Renders the error styling; `error-text` replaces the supporting text. */
  @property({ type: Boolean, reflect: true }) error = false

  /** Message shown in place of the supporting text while `error` is set. */
  @property({ attribute: 'error-text' }) errorText = ''

  /** Help text under the editor, when the `supporting-text` slot is empty. */
  @property() help = ''

  /** How far the engine got: `pending`, `ready` (CodeMirror mounted) or `basic` (textarea fallback). */
  @state() private engineState: CodeEditorEngineState = 'pending'

  @state() private focused = false

  @query('.c2-code-editor__surface') private surface!: HTMLElement
  @query('textarea') private fallback?: HTMLTextAreaElement

  private editor: EditorHandle | undefined
  private mounting: Promise<void> | undefined
  private customValidityMessage = ''
  @state() private disabledByForm = false
  /** Set by an edit, cleared by the `change` that follows the blur — the native commit-on-blur contract. */
  private dirty = false

  /** Resolves once the engine has settled, so a host (or a test) can await the editor being live. */
  get ready(): Promise<CodeEditorEngineState> {
    return (this.mounting ?? Promise.resolve()).then(() => this.engineState)
  }

  /** The engine in use, or `undefined` while it is still loading. */
  get engine(): 'codemirror' | 'basic' | undefined {
    return this.engineState === 'pending' ? undefined : this.engineState === 'ready' ? 'codemirror' : 'basic'
  }

  get form() {
    return this.internals.form
  }

  get labels() {
    return this.internals.labels
  }

  get validity() {
    return this.internals.validity
  }

  get validationMessage() {
    return this.internals.validationMessage
  }

  get willValidate() {
    return this.internals.willValidate
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  /** What labels the editable element. CodeMirror's content node is the `textbox`, so the name has to land there. */
  private get accessibleName(): string {
    return this.label || this.ariaLabel || 'Code editor'
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.editor?.destroy()
    this.editor = undefined
    // A reconnect must mount again; `engineState` alone would say "ready" with no view behind it.
    if (this.engineState === 'ready') this.engineState = 'pending'
  }

  /** The `value` *attribute* is the default, exactly as `defaultValue` is on a native control. */
  formResetCallback() {
    this.value = this.getAttribute('value') ?? ''
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  checkValidity() {
    return this.internals.checkValidity()
  }

  reportValidity() {
    return this.internals.reportValidity()
  }

  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.requestUpdate()
  }

  override focus(options?: FocusOptions) {
    if (this.editor) this.editor.focus()
    else this.fallback?.focus(options)
  }

  protected override firstUpdated() {
    if (isServer) return
    this.mounting = this.mount()
  }

  private async mount() {
    const editor = await createEditor({
      parent: this.surface,
      root: this.renderRoot as ShadowRoot,
      value: this.value,
      language: this.language,
      languageLoader: this.languageLoader,
      readOnly: this.readOnly,
      editable: !this.effectiveDisabled,
      lineNumbers: this.lineNumbers,
      lineWrapping: this.wrap,
      autocomplete: this.autocomplete,
      tabSize: this.tabSize,
      placeholder: this.placeholder,
      label: this.accessibleName,
      onInput: (value) => this.handleEditorInput(value),
      onBlur: () => this.handleBlur(),
      onFocus: () => (this.focused = true),
    })
    // The element was torn down while the dynamic import was in flight.
    if (!this.isConnected) {
      editor?.destroy()
      return
    }
    this.editor = editor
    this.engineState = editor ? 'ready' : 'basic'
    this.dispatchEvent(new CustomEvent('ready', { detail: { engine: this.engineState === 'ready' ? 'codemirror' : 'basic' } }))
  }

  protected override updated(changed: PropertyValues) {
    const editor = this.editor
    if (editor) {
      if (changed.has('value')) editor.setValue(this.value)
      if (changed.has('language') || changed.has('languageLoader')) void editor.setLanguage(this.language, this.languageLoader)
      if (changed.has('readOnly') || changed.has('disabled') || changed.has('disabledByForm')) editor.setEditing(this.readOnly, !this.effectiveDisabled)
      if (changed.has('lineNumbers')) editor.setLineNumbers(this.lineNumbers)
      if (changed.has('wrap')) editor.setLineWrapping(this.wrap)
      if (changed.has('autocomplete')) editor.setAutocomplete(this.autocomplete)
      if (changed.has('tabSize')) editor.setTabSize(this.tabSize)
      if (changed.has('placeholder')) editor.setPlaceholder(this.placeholder)
      if (changed.has('label') || changed.has('ariaLabel')) editor.setLabel(this.accessibleName)
    }
    this.internals.setFormValue(this.value, this.value)
    const missing = this.required && !this.value
    const flags = this.customValidityMessage ? { customError: true } : missing ? { valueMissing: true } : {}
    const message = this.customValidityMessage || (missing ? 'Please enter some code.' : '')
    this.internals.setValidity(flags, message, this.surface)
  }

  /**
   * CodeMirror edits a `contenteditable`, whose native `input` / `beforeinput` are composed and would escape the
   * shadow root — a consumer would see one of those *and* the component's own `input` for the same keystroke, and
   * would see one even for an edit `readonly` rejected. The component owns its event surface, so they stop here.
   */
  private stopNativeEditing(event: Event) {
    event.stopPropagation()
  }

  private handleEditorInput(value: string) {
    // A read-only editor reverts a rejected DOM edit through this same listener, ending on the text it started
    // with: same text, no input.
    if (value === this.value) return
    this.value = value
    this.dirty = true
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  }

  private handleBlur() {
    this.focused = false
    if (!this.dirty) return
    this.dirty = false
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  /** The fallback textarea fires native `input` / `change`; only the value has to be mirrored. */
  private handleFallbackInput(event: Event) {
    this.value = (event.target as HTMLTextAreaElement).value
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  }

  private handleFallbackChange() {
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  private renderFallback() {
    return html`<textarea
      class="c2-code-editor__fallback"
      part="editor"
      name=${ifDefined(this.name || undefined)}
      aria-label=${this.accessibleName}
      placeholder=${ifDefined(this.placeholder || undefined)}
      spellcheck="false"
      autocapitalize="off"
      autocorrect="off"
      ?disabled=${this.effectiveDisabled}
      ?readonly=${this.readOnly}
      .value=${live(this.value)}
      @input=${this.handleFallbackInput}
      @change=${this.handleFallbackChange}
      @focus=${() => (this.focused = true)}
      @blur=${() => (this.focused = false)}
    ></textarea>`
  }

  override render() {
    const invalid = this.error && !this.effectiveDisabled
    const showError = invalid && !!this.errorText
    const supporting = !!this.help || showError
    return html`
      <div
        class=${classMap({
          'c2-code-editor': true,
          'is-focused': this.focused,
          'is-invalid': invalid,
          'is-disabled': this.effectiveDisabled,
          [`is-${this.engineState}`]: true,
        })}
        part="container"
      >
        <label class="c2-code-editor__label" part="label" ?hidden=${!this.label && !this.hasLabelSlot}>
          <slot name="label" @slotchange=${this.handleLabelSlotChange}>${this.label}</slot>
        </label>
        <!-- Always in the template, so switching engine state never recreates the node CodeMirror owns. -->
        <div
          class="c2-code-editor__surface"
          part=${this.engineState === 'ready' ? 'editor' : nothing}
          ?hidden=${this.engineState !== 'ready'}
          @beforeinput=${this.stopNativeEditing}
          @input=${this.stopNativeEditing}
        ></div>
        ${this.engineState === 'basic' ? this.renderFallback() : nothing}
        ${this.engineState === 'pending' ? html`<pre class="c2-code-editor__pending" aria-hidden="true">${this.value}</pre>` : nothing}
        <div class="c2-code-editor__supporting-text" part="supporting-text" ?hidden=${!supporting}>
          ${showError ? html`<span role="alert">${this.errorText}</span>` : html`<slot name="supporting-text">${this.help}</slot>`}
        </div>
      </div>
    `
  }

  @state() private hasLabelSlot = false

  private handleLabelSlotChange(event: Event) {
    const slot = event.target as HTMLSlotElement
    this.hasLabelSlot = slot.assignedNodes({ flatten: true }).some((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== '')
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-code-editor': CodeEditor
  }
}
