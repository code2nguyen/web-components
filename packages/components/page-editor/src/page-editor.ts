import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { DOMSerializer, Fragment, Slice, type Mark, type MarkType, type Node as ProseNode, type ResolvedPos } from 'prosemirror-model'
import { EditorState, Plugin, TextSelection, type Command, type Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, chainCommands, toggleMark as toggleMarkCommand } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import { inputRules, undoInputRule } from 'prosemirror-inputrules'
import {
  autoformatHint,
  autoformatKey,
  backspaceAtStart,
  buildInputRules,
  currentBlock,
  enterInCode,
  enterInItem,
  enterInTextblock,
  exitCode,
  indentCode,
  indentItems,
  lineBreak,
  listNumbering,
  normalize,
  setBlock as setBlockCommand,
  toggleBlock,
  toggleChecked,
} from './commands'
import { highlightPlugin } from './highlight'
import { fromMarkdown, toMarkdown } from './markdown'
import {
  BLOCK_NAMES,
  COLORS,
  MARK_NAMES,
  blockOf,
  emptyFormat,
  formatOf,
  isColor,
  listNumbers,
  safeHref,
  schema,
  type PageEditorBlock,
  type PageEditorColor,
  type PageEditorFormat,
  type PageEditorMark,
} from './schema'
import { CodeBlockView, ItemView } from './views'
import styles from './page-editor.scss?inline'

export { BLOCK_NAMES as PAGE_EDITOR_BLOCKS, COLORS as PAGE_EDITOR_COLORS, MARK_NAMES as PAGE_EDITOR_MARKS } from './schema'
export type { PageEditorBlock, PageEditorColor, PageEditorFormat, PageEditorMark } from './schema'
export { LANGUAGES as PAGE_EDITOR_LANGUAGES } from './languages'

/** Renders a page editor value (Markdown) as HTML, with real nested lists, without an editor on the page. */
export function markdownToHTML(markdown: string): string {
  return pageToHTML(fromMarkdown(markdown))
}

/** Events fired by {@link PageEditor}, keyed for `addEventListener`. */
export interface PageEditorEventMap {
  input: Event
  change: Event
  'format-change': CustomEvent<PageEditorFormat>
}

export interface PageEditor {
  addEventListener: TypedAddEventListener<PageEditor, PageEditorEventMap>
  removeEventListener: TypedRemoveEventListener<PageEditor, PageEditorEventMap>
}

type ColorKind = 'color' | 'background'

interface MenuEntry {
  id: string
  section: string
  label: string
  description: string
  keywords: string
  shortcut?: string
  icon: TemplateResult
  run: () => void
}

interface SlashState {
  /** Position of the typed `/`; -1 when the menu turns the current block into another one. */
  from: number
  query: string
}

const COLOR_LABELS: Record<PageEditorColor, string> = {
  gray: 'Gray',
  brown: 'Brown',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  red: 'Red',
}

const icon = (body: TemplateResult) => html`<svg viewBox="0 0 20 20" aria-hidden="true">${body}</svg>`
const stroke = (d: string) => svg`<path d=${d} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />`

const ICONS = {
  bullet: icon(
    svg`<circle cx="4.5" cy="6" r="1.4" fill="currentColor" /><circle cx="4.5" cy="14" r="1.4" fill="currentColor" />${stroke('M8.5 6h8M8.5 14h8')}`,
  ),
  ordered: icon(
    svg`<text x="2.2" y="8.4" font-size="6.5" font-weight="600" fill="currentColor">1</text><text x="2.2" y="16.4" font-size="6.5" font-weight="600" fill="currentColor">2</text>${stroke('M8.5 6h8M8.5 14h8')}`,
  ),
  todo: icon(
    svg`<rect x="3" y="3" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" />${stroke('M6.5 10.2l2.4 2.4 4.6-5.2')}`,
  ),
  quote: icon(stroke('M4 4v12M8 6h8M8 10h8M8 14h5')),
  code: icon(stroke('M7 6l-4 4 4 4M13 6l4 4-4 4')),
  divider: icon(stroke('M3 10h14')),
  link: icon(stroke('M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1')),
  plus: icon(stroke('M10 4v12M4 10h12')),
  caret: html`<svg class="caret" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`,
  check: icon(stroke('M4.5 10.5l3.5 3.5 7.5-8')),
  close: icon(stroke('M5 5l10 10M15 5L5 15')),
  none: icon(stroke('M5 15L15 5')),
  indent: icon(stroke('M9 5h8M9 10h8M9 15h8M3 7l3 3-3 3')),
  outdent: icon(stroke('M9 5h8M9 10h8M9 15h8M6 7l-3 3 3 3')),
}

const glyph = (text: string) => html`<span class="glyph" aria-hidden="true">${text}</span>`

/**
 * A page editor for long text, in the spirit of Notion but with only what makes writing faster: headings, lists,
 * to-dos, quotes, code blocks with syntax colours, dividers, links, and eight named text and background colours.
 *
 * Formatting is reachable three ways, all running the same commands: Markdown typed as you go (`# `, `- `, `[] `,
 * `> `, three backticks, `**bold**`; Backspace right after undoes it), a `/` menu (or the `+` button on an empty line),
 * and a toolbar over selected text. On touch screens a format bar sits above the keyboard.
 *
 * The value is GitHub-flavoured Markdown, with inline HTML for underline and colours, and the element is a form
 * control. Code blocks load their syntax colours on demand from shiki, only when a block names a language.
 *
 * @tag c2-page-editor
 * @slot header - Content above the page, such as a title field or a breadcrumb.
 * @event {Event} input - Fired on each edit, after `value` is updated.
 * @event {Event} change - Fired when the editor loses focus after its value changed.
 * @event {CustomEvent<PageEditorFormat>} format-change - Fired when the block or the formatting at the selection changes. Does not bubble.
 * @csspart content - The editable page.
 * @csspart toolbar - The formatting toolbar over selected text.
 * @csspart slash-menu - The menu opened by `/` and the `+` button.
 * @csspart palette - The text and background colour picker.
 * @csspart format-bar - The format bar shown above the keyboard on touch screens.
 *
 * @cssproperty {length} [--c2-page-editor__content--padding=8px 16px 8px 40px] - The left padding is the gutter that holds the `+` button.
 * @cssproperty {length} [--c2-page-editor__content--min-height=120px]
 * @cssproperty {length} [--c2-page-editor__content--max-height=none] - Past this height the page scrolls.
 * @cssproperty {color} [--c2-page-editor__content--color=#18181b] - Text colour. The named colours are mixed with it, so they follow it into dark mode.
 * @cssproperty {font-family} [--c2-page-editor__content--font-family=inherit]
 * @cssproperty {font-size} [--c2-page-editor__content--font-size=16px]
 * @cssproperty {number} [--c2-page-editor__content--line-height=1.65]
 * @cssproperty {length} [--c2-page-editor__block--margin-top=4px] - Space between blocks.
 * @cssproperty {color} [--c2-page-editor__placeholder--color=#a1a1aa]
 * @cssproperty {color} [--c2-page-editor__selection--background=rgba(2, 101, 220, 0.18)]
 * @cssproperty {font-size} [--c2-page-editor__heading1--font-size=30px]
 * @cssproperty {font-size} [--c2-page-editor__heading2--font-size=24px]
 * @cssproperty {font-size} [--c2-page-editor__heading3--font-size=20px]
 * @cssproperty {font-weight} [--c2-page-editor__heading--font-weight=600]
 * @cssproperty {length} [--c2-page-editor__heading--margin-top=20px] - Space above a heading, which replaces the block spacing.
 * @cssproperty {color} [--c2-page-editor__link--color=rgb(2, 101, 220)]
 * @cssproperty {border} [--c2-page-editor__quote--border-left=3px solid currentColor]
 * @cssproperty {length} [--c2-page-editor__quote--padding-left=14px]
 * @cssproperty {length} [--c2-page-editor__item--indent=26px] - Indentation of one list level, which is also the width of the marker column.
 * @cssproperty {color} [--c2-page-editor__checkbox--border-color=#a1a1aa]
 * @cssproperty {color} [--c2-page-editor__checkbox__checked--background=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-page-editor__checkbox__checked--color=#ffffff]
 * @cssproperty {border-radius} [--c2-page-editor__checkbox--border-radius=4px]
 * @cssproperty {color} [--c2-page-editor__todo__checked--color=#71717a] - Text of a ticked to-do.
 * @cssproperty {border} [--c2-page-editor__divider--border-top=1px solid #e4e4e7]
 * @cssproperty {font-family} [--c2-page-editor__code--font-family=ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {color} [--c2-page-editor__inline-code--background=rgba(113, 113, 122, 0.14)]
 * @cssproperty {color} [--c2-page-editor__inline-code--color=#d44c47]
 * @cssproperty {border-radius} [--c2-page-editor__inline-code--border-radius=4px]
 * @cssproperty {color} [--c2-page-editor__code-block--background=#f4f4f5]
 * @cssproperty {color} [--c2-page-editor__code-block--color=#18181b]
 * @cssproperty {border-radius} [--c2-page-editor__code-block--border-radius=8px]
 * @cssproperty {font-size} [--c2-page-editor__code-block--font-size=14px]
 * @cssproperty {box-shadow} [--c2-page-editor__code-block__focus--box-shadow=0 0 0 2px rgba(2, 101, 220, 0.25)] - Ring around the code block that holds the caret.
 * @cssproperty {color} [--c2-page-editor__code-header--color=#52525b] - Language button, tools, line numbers and hint of a code block.
 * @cssproperty {color} [--c2-page-editor__syntax-keyword--color=#9065b0]
 * @cssproperty {color} [--c2-page-editor__syntax-string--color=#448361]
 * @cssproperty {color} [--c2-page-editor__syntax-function--color=#337ea9]
 * @cssproperty {color} [--c2-page-editor__syntax-constant--color=#d9730d]
 * @cssproperty {color} [--c2-page-editor__syntax-comment--color=#91918e]
 * @cssproperty {color} [--c2-page-editor__syntax-parameter--color=#a27763]
 * @cssproperty {color} [--c2-page-editor__syntax-punctuation--color=#71717a]
 * @cssproperty {color} [--c2-page-editor__syntax-link--color=#337ea9]
 * @cssproperty {color} [--c2-page-editor__color-gray--color=#91918e] - Named text colour; every one is mixed with the text colour so it reads on light and dark pages.
 * @cssproperty {color} [--c2-page-editor__color-brown--color=#a27763]
 * @cssproperty {color} [--c2-page-editor__color-orange--color=#d9730d]
 * @cssproperty {color} [--c2-page-editor__color-yellow--color=#cb912f]
 * @cssproperty {color} [--c2-page-editor__color-green--color=#448361]
 * @cssproperty {color} [--c2-page-editor__color-blue--color=#337ea9]
 * @cssproperty {color} [--c2-page-editor__color-purple--color=#9065b0]
 * @cssproperty {color} [--c2-page-editor__color-red--color=#d44c47]
 * @cssproperty {color} [--c2-page-editor__background-gray--background=rgba(145, 145, 142, 0.2)] - Named background colour; translucent, so it tints a light or a dark page.
 * @cssproperty {color} [--c2-page-editor__background-brown--background=rgba(162, 119, 99, 0.2)]
 * @cssproperty {color} [--c2-page-editor__background-orange--background=rgba(217, 115, 13, 0.18)]
 * @cssproperty {color} [--c2-page-editor__background-yellow--background=rgba(223, 171, 1, 0.22)]
 * @cssproperty {color} [--c2-page-editor__background-green--background=rgba(68, 131, 97, 0.18)]
 * @cssproperty {color} [--c2-page-editor__background-blue--background=rgba(51, 126, 169, 0.18)]
 * @cssproperty {color} [--c2-page-editor__background-purple--background=rgba(144, 101, 176, 0.18)]
 * @cssproperty {color} [--c2-page-editor__background-red--background=rgba(212, 76, 71, 0.18)]
 * @cssproperty {color} [--c2-page-editor__popover--background=#ffffff] - Toolbar, menus and format bar.
 * @cssproperty {color} [--c2-page-editor__popover--color=#18181b]
 * @cssproperty {border} [--c2-page-editor__popover--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-page-editor__popover--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-page-editor__popover--box-shadow=0 8px 24px rgba(24, 24, 27, 0.12), 0 2px 6px rgba(24, 24, 27, 0.06)]
 * @cssproperty {color} [--c2-page-editor__menu-item__active--background=#f4f4f5] - Highlighted menu item and pressed toolbar button.
 * @cssproperty {color} [--c2-page-editor__menu-label--color=#52525b] - Section labels, descriptions and shortcuts in menus.
 * @cssproperty {color} [--c2-page-editor__plus-button--color=#a1a1aa]
 * @cssproperty {color} [--c2-page-editor__hint--color=#71717a] - The "⌫ to undo" note after an automatic format.
 * @cssproperty {outline} [--c2-page-editor__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {opacity} [--c2-page-editor__disabled--opacity=0.38]
 */
@customElement('c2-page-editor')
export class PageEditor extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  /** The page as Markdown: headings, lists, to-dos, quotes, fenced code, dividers, emphasis and links, with `<u>`, `<span data-color>` and `<mark data-color>` for underline and colours. */
  @property() value = ''
  /** Name submitted with the form. */
  @property() name = ''
  /** Accessible name of the page. */
  @property() label = ''
  /** Accessible name forwarded from the host. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null
  /** Shown while the page is empty. */
  @property() placeholder = ''
  /** Space-separated block types the writer may use (`paragraph heading1 heading2 heading3 bullet ordered todo quote code divider`). The menus and Markdown shortcuts offer only these, and pasted blocks outside the list become text. Empty allows all. */
  @property() blocks = ''
  /** Prevents editing and removes the page from keyboard navigation. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Prevents editing while allowing selection, copying and following links. */
  @property({ type: Boolean, reflect: true }) readOnly = false
  /** Requires some text for form validation. */
  @property({ type: Boolean, reflect: true }) required = false

  @state() private format: PageEditorFormat = emptyFormat()
  @state() private disabledByForm = false
  @state() private focused = false
  @state() private slash: SlashState | null = null
  @state() private slashIndex = 0
  @state() private toolbarMode: 'format' | 'link' = 'format'
  @state() private palette: 'toolbar' | 'bar' | null = null
  @state() private turnMenu = false
  @state() private plusTop: number | null = null
  @state() private coarse = false
  @state() private lastColor: { kind: ColorKind; name: PageEditorColor } = { kind: 'background', name: 'yellow' }

  @query('.content') private surface!: HTMLElement
  @query('.editor') private editorEl!: HTMLElement
  @query('.toolbar') private toolbarEl!: HTMLElement
  @query('.slash') private slashEl!: HTMLElement
  @query('.palette') private paletteEl!: HTMLElement
  @query('.turn-menu') private turnMenuEl!: HTMLElement
  @query('.format-bar') private barEl!: HTMLElement
  @query('.link-input') private linkInput?: HTMLInputElement

  private view?: EditorView
  private readonly slotPresence = new SlotPresenceController(this, ['header'])
  /** The value the editor last produced, so writing it back (v-model) does not reset the page. */
  private serialized = ''
  private dirty = false
  private changedSinceFocus = false
  private customValidityMessage = ''
  private formatKey = ''
  private dismissedSelection: { from: number; to: number } | null = null
  private pendingSlash = -1
  /** Length of the last query that still matched something; a few characters past it the menu gives up. */
  private slashMatched = 0
  private paletteAnchor?: HTMLElement
  private turnAnchor?: HTMLElement
  private modKey = 'Ctrl+'
  private viewportFrame = 0
  private followingViewport = false

  /** The containing form, when this control is associated with one. */
  get form() {
    return this.internals.form
  }
  /** Labels associated with this form control. */
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
  /** The page as plain text, one block per line. */
  get text(): string {
    const doc = this.view?.state.doc ?? fromMarkdown(this.value)
    const lines: string[] = []
    doc.forEach((block) => lines.push(block.textBetween(0, block.content.size, '\n', '\n')))
    return lines.join('\n').replace(/\n+$/, '')
  }

  private get allowedBlocks(): Set<PageEditorBlock> {
    const listed = this.blocks.split(/\s+/).filter((name): name is PageEditorBlock => BLOCK_NAMES.includes(name as PageEditorBlock))
    return new Set(listed.length ? listed : BLOCK_NAMES)
  }

  private get editable() {
    return !this.disabled && !this.disabledByForm && !this.readOnly
  }

  override connectedCallback() {
    super.connectedCallback()
    this.modKey = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+'
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    // The `value` attribute is the default value; once the writer has edited, it no longer drives the page.
    if (name === 'value' && this.dirty) return
    super.attributeChangedCallback(name, oldValue, newValue)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.hideFloating()
    this.followViewport(false)
  }

  // ---- public API -------------------------------------------------------------------------------------------------

  /** Focuses the page. */
  override focus(options?: FocusOptions) {
    if (this.view) this.view.focus()
    else this.surface?.focus(options)
  }
  override blur() {
    this.surface?.blur()
  }
  /** Whether the writer has edited the page since the last reset. */
  isDirty() {
    return this.dirty
  }
  /** Restores the `value` attribute. */
  reset() {
    this.dirty = false
    this.value = this.getAttribute('value') ?? ''
  }
  formResetCallback() {
    this.reset()
  }
  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }
  formStateRestoreCallback(restored: string | File | FormData | null) {
    if (typeof restored === 'string') this.value = restored
  }
  checkValidity() {
    return this.internals.checkValidity()
  }
  reportValidity() {
    return this.internals.reportValidity()
  }
  /** Sets or clears a custom validation message. */
  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.syncFormState()
  }

  /** Turns the blocks at the selection into `block` (`divider` inserts one). Returns whether anything was applied. */
  setBlock(block: PageEditorBlock): boolean {
    return this.run(setBlockCommand(block), this.allowedBlocks.has(block))
  }

  /** Toggles bold, italic, underline, strike or inline code on the selection, or on what is typed next. */
  toggleMark(mark: PageEditorMark): boolean {
    return this.run(toggleMarkCommand(schema.marks[mark]), MARK_NAMES.includes(mark))
  }

  /** Colours the selected text with a named colour, or removes the colour with `null`. */
  setColor(color: PageEditorColor | null): boolean {
    return this.applyColor('color', color)
  }

  /** Gives the selected text a named background colour, or removes it with `null`. */
  setBackground(color: PageEditorColor | null): boolean {
    return this.applyColor('background', color)
  }

  /** Links the selection (or the link at the caret) to `href`, or removes the link with `null`. */
  setLink(href: string | null): boolean {
    const view = this.view
    if (!view || !this.editable) return false
    const range = this.linkRange()
    if (!range) return false
    const tr = view.state.tr.removeMark(range.from, range.to, schema.marks.link)
    const safe = href === null ? null : safeHref(href)
    if (href !== null && !safe) return false
    if (safe) tr.addMark(range.from, range.to, schema.marks.link.create({ href: safe }))
    view.dispatch(tr)
    view.focus()
    return true
  }

  /** Removes every inline format and colour from the selection. */
  clearFormatting(): boolean {
    const view = this.view
    if (!view || !this.editable) return false
    const { from, to, empty } = view.state.selection
    const tr = view.state.tr
    if (empty) tr.setStoredMarks([])
    else for (const type of Object.values(schema.marks)) if (type !== schema.marks.link) tr.removeMark(from, to, type)
    view.dispatch(tr)
    view.focus()
    return true
  }

  /** The page as HTML, with real `<ul>`/`<ol>` lists, for showing it outside the editor. */
  toHTML(): string {
    const doc = this.view?.state.doc ?? fromMarkdown(this.value)
    return pageToHTML(doc)
  }

  // ---- editor ------------------------------------------------------------------------------------------------------

  private run(command: Command, allowed = true): boolean {
    const view = this.view
    if (!view || !this.editable || !allowed) return false
    const applied = command(view.state, view.dispatch, view)
    view.focus()
    return applied
  }

  protected override firstUpdated() {
    this.coarse = matchMedia('(pointer: coarse)').matches
    this.view = new EditorView(
      { mount: this.surface },
      {
        state: this.createState(this.value),
        editable: () => this.editable,
        attributes: () => this.surfaceAttributes(),
        nodeViews: {
          item: (node, view, getPos, decorations) => new ItemView(node, view, getPos, decorations, (pos) => this.toggleTodo(pos)),
          code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos, { modKey: this.modKey }),
        },
        dispatchTransaction: (tr) => this.handleTransaction(tr),
        handleTextInput: (view, from, _to, text) => {
          if (text === '/' && !view.state.selection.$from.parent.type.spec.code) {
            const before = view.state.doc.textBetween(Math.max(view.state.selection.$from.start(), from - 1), from)
            if (!before || /\s/.test(before)) this.pendingSlash = from
          }
          return false
        },
        handleDOMEvents: {
          keydown: (view, event) => {
            if (!event.isComposing) this.syncSelectionFromDom(view)
            return false
          },
          focus: (view) => {
            this.focused = true
            this.coarse = matchMedia('(pointer: coarse)').matches
            this.changedSinceFocus = false
            view.dispatch(view.state.tr.setMeta('c2-focus', true))
            return false
          },
          blur: (view) => {
            // Once focus has landed: moving into the toolbar's link field keeps the toolbar open.
            setTimeout(() => {
              if (!view.isDestroyed && !view.hasFocus()) view.dispatch(view.state.tr.setMeta('c2-focus', false))
            })
            return false
          },
          mousedown: (_view, event) => {
            // ⌘/Ctrl-click follows a link while editing.
            const link = (event.target as Element).closest?.('a[href]')
            if (link && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              window.open((link as HTMLAnchorElement).href, '_blank', 'noopener')
              return true
            }
            return false
          },
        },
        transformPasted: (slice) => this.filterSlice(slice),
        handlePaste: (view, event, slice) => this.handlePaste(view, event, slice),
        clipboardTextParser: (text) => this.parsePastedText(text),
        clipboardTextSerializer: (slice) => {
          try {
            return toMarkdown(schema.nodes.doc.create(null, slice.content))
          } catch {
            return slice.content.textBetween(0, slice.content.size, '\n\n')
          }
        },
      },
    )
    this.serialized = toMarkdown(this.view.state.doc)
    this.syncFormState()
  }

  protected override updated(changedProperties: PropertyValues<this>) {
    const changed = changedProperties as Map<PropertyKey, unknown>
    const view = this.view
    if (!view) return
    if (changed.has('value') && this.value !== this.serialized) {
      view.updateState(this.createState(this.value))
      this.serialized = toMarkdown(view.state.doc)
      this.emitFormat()
    }
    const surfaceInputs = ['label', 'ariaLabel', 'placeholder', 'disabled', 'readOnly', 'required', 'disabledByForm', 'blocks', 'slash', 'slashIndex']
    if (surfaceInputs.some((key) => changed.has(key))) {
      // Re-reads `editable`, the surface attributes and the placeholder decorations.
      view.setProps({})
      if (!this.editable) this.hideFloating()
    }
    if (changed.has('slash') || changed.has('slashIndex')) this.placeSlash()
    if (changed.has('toolbarMode') || changed.has('format')) this.updateToolbar()
    if (changed.has('focused') || changed.has('coarse') || changed.has('disabled') || changed.has('readOnly')) this.updateBar()
    if (changed.has('palette')) this.placePalette()
    if (changed.has('turnMenu')) this.placeTurnMenu()
    this.syncFormState()
  }

  private createState(markdown: string) {
    let doc = fromMarkdown(markdown)
    const last = doc.lastChild
    if (last && (last.type === schema.nodes.code_block || last.type === schema.nodes.divider)) {
      doc = doc.copy(doc.content.append(Fragment.from(schema.nodes.paragraph.create())))
    }
    return EditorState.create({ schema, doc, plugins: this.plugins() })
  }

  private plugins(): Plugin[] {
    const allowed = (block: PageEditorBlock) => this.allowedBlocks.has(block)
    const mark =
      (name: PageEditorMark): Command =>
      (state, dispatch) =>
        state.selection.$from.parent.type.spec.code ? false : toggleMarkCommand(schema.marks[name])(state, dispatch)
    const block =
      (name: PageEditorBlock): Command =>
      (state, dispatch) =>
        allowed(name) && toggleBlock(name)(state, dispatch)
    const ifSlash =
      (command: () => boolean): Command =>
      () =>
        this.slash ? command() : false
    const toggleTodoAtCaret: Command = (state, dispatch) => {
      const { $from } = state.selection
      const node = $from.parent
      if (node.type !== schema.nodes.item || node.attrs.kind !== 'todo') return false
      const tr = toggleChecked(state, $from.before())
      if (tr && dispatch) dispatch(tr)
      return true
    }
    const focusToolbar: Command = () => {
      if (!this.toolbarEl?.matches(':popover-open')) return false
      this.toolbarButtons()[0]?.focus()
      return true
    }
    const dismissToolbar: Command = (state) => {
      if (!this.toolbarEl?.matches(':popover-open')) return false
      this.dismissedSelection = { from: state.selection.from, to: state.selection.to }
      this.hideToolbar()
      return true
    }
    const editLink: Command = (state) => {
      if (state.selection.$from.parent.type.spec.code) return false
      return this.openLinkEditor()
    }

    const focusDecorations: Plugin<boolean> = new Plugin<boolean>({
      state: {
        init: () => false,
        apply: (tr, focused) => {
          const meta = tr.getMeta('c2-focus') as boolean | undefined
          return meta === undefined ? focused : meta
        },
      },
      props: {
        decorations: (state): DecorationSet | null => this.placeholders(state, focusDecorations.getState(state) ?? false),
      },
    })

    return [
      // While the slash menu is open, the arrows, Enter and Escape belong to it.
      keymap({
        ArrowDown: ifSlash(() => this.moveSlash(1)),
        ArrowUp: ifSlash(() => this.moveSlash(-1)),
        Enter: ifSlash(() => this.pickSlash()),
        Tab: ifSlash(() => this.pickSlash()),
        Escape: ifSlash(() => this.closeSlash(true)),
      }),
      history(),
      inputRules({
        rules: buildInputRules(
          allowed,
          (name) => this.blockLabel(name),
          () => this.editable,
        ),
      }),
      keymap({
        'Mod-z': undo,
        'Shift-Mod-z': redo,
        'Mod-y': redo,
        'Mod-b': mark('bold'),
        'Mod-i': mark('italic'),
        'Mod-u': mark('underline'),
        'Shift-Mod-s': mark('strike'),
        'Shift-Mod-x': mark('strike'),
        'Mod-e': mark('code'),
        'Mod-k': editLink,
        'Shift-Mod-h': () => this.applyColor(this.lastColor.kind, this.lastColor.name),
        'Mod-\\': () => this.clearFormatting(),
        'Mod-Alt-0': block('paragraph'),
        'Mod-Alt-1': block('heading1'),
        'Mod-Alt-2': block('heading2'),
        'Mod-Alt-3': block('heading3'),
        'Shift-Mod-7': block('ordered'),
        'Shift-Mod-8': block('bullet'),
        'Shift-Mod-9': block('todo'),
        'Mod-Enter': chainCommands(exitCode, toggleTodoAtCaret),
        Enter: chainCommands(enterInCode, enterInItem, enterInTextblock),
        'Shift-Enter': lineBreak,
        Backspace: chainCommands(undoInputRule, backspaceAtStart),
        Tab: chainCommands(indentCode(1), indentItems(1)),
        'Shift-Tab': chainCommands(indentCode(-1), indentItems(-1)),
        'Alt-F10': focusToolbar,
        Escape: dismissToolbar,
      }),
      keymap(baseKeymap),
      autoformatHint(() => this.editable),
      listNumbering,
      normalize,
      highlightPlugin(),
      focusDecorations,
    ]
  }

  /** Placeholder text: the element's own on an empty page, a block's name on an empty heading or the line with the caret. */
  private placeholders(state: EditorState, focused: boolean): DecorationSet | null {
    const decorations: Decoration[] = []
    const doc = state.doc
    // The code block that holds the caret shows its ring and its keyboard hint.
    const $caret = state.selection.$head
    if (focused && $caret.depth > 0 && $caret.parent.type === schema.nodes.code_block) {
      const pos = $caret.before(1)
      decorations.push(Decoration.node(pos, pos + $caret.parent.nodeSize, { class: 'active' }))
    }
    const only = doc.childCount === 1 ? doc.firstChild : null
    if (only && only.type === schema.nodes.paragraph && only.content.size === 0) {
      const text = this.placeholder || (focused && this.editable ? this.commandHint() : '')
      if (text) decorations.push(Decoration.node(0, only.nodeSize, { class: 'placeholder', 'data-placeholder': text }))
      return DecorationSet.create(doc, decorations)
    }
    const { $head, empty } = state.selection
    // Right after an automatic format, its "⌫ to undo" note stands where the placeholder would.
    const caretIndex = empty && !autoformatKey.getState(state) ? $head.index(0) : -1
    doc.forEach((node, pos, index) => {
      if (!node.isTextblock || node.content.size > 0 || node.type === schema.nodes.code_block) return
      const here = focused && index === caretIndex && this.editable
      let text = ''
      if (node.type === schema.nodes.heading) text = `Heading ${node.attrs.level}`
      else if (!here) return
      else if (node.type === schema.nodes.paragraph) text = this.commandHint()
      else if (node.type === schema.nodes.quote) text = 'Quote'
      else if (node.type === schema.nodes.item) text = node.attrs.kind === 'todo' ? 'To-do' : 'List'
      if (!text) return
      // A list item's view shows it on its text, after the marker.
      if (node.type === schema.nodes.item) decorations.push(Decoration.node(pos, pos + node.nodeSize, {}, { placeholder: text }))
      else decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'placeholder', 'data-placeholder': text }))
    })
    return DecorationSet.create(doc, decorations)
  }

  private commandHint() {
    return this.coarse ? 'Tap + for blocks' : "Type '/' for commands"
  }

  private surfaceAttributes(): Record<string, string> {
    const attributes: Record<string, string> = {
      class: 'content',
      part: 'content',
      role: 'textbox',
      'aria-multiline': 'true',
    }
    const name = this.label || this.ariaLabel
    if (name) attributes['aria-label'] = name
    if (this.placeholder) attributes['aria-placeholder'] = this.placeholder
    if (this.required) attributes['aria-required'] = 'true'
    if (this.readOnly) {
      attributes['aria-readonly'] = 'true'
      // A read-only page is still reachable by keyboard, to read and select.
      attributes.tabindex = '0'
    }
    if (this.disabled || this.disabledByForm) attributes['aria-disabled'] = 'true'
    if (this.slash) {
      attributes['aria-controls'] = 'slash-menu'
      if (this.slashEntries().length) attributes['aria-activedescendant'] = `slash-${this.slashIndex}`
    }
    return attributes
  }

  private handleTransaction(tr: Transaction) {
    const view = this.view!
    view.updateState(view.state.apply(tr))
    if (tr.docChanged) {
      const markdown = toMarkdown(view.state.doc)
      if (markdown !== this.serialized) {
        this.serialized = markdown
        this.value = markdown
        this.dirty = true
        this.changedSinceFocus = true
        this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      }
    }
    if (tr.selectionSet && this.dismissedSelection) {
      const { from, to } = view.state.selection
      if (from !== this.dismissedSelection.from || to !== this.dismissedSelection.to) this.dismissedSelection = null
    }
    if (tr.selectionSet || tr.docChanged) {
      this.palette = this.palette === 'bar' ? 'bar' : null
      this.turnMenu = false
    }
    if (!view.state.selection.empty || tr.docChanged) this.toolbarMode = this.toolbarMode === 'link' && !tr.selectionSet ? 'link' : 'format'
    this.syncSlash(tr)
    this.emitFormat()
    this.updateToolbar()
    this.updatePlus()
  }

  /**
   * ProseMirror learns where a click put the caret from `selectionchange`, which the browser fires asynchronously. A
   * key pressed before it arrives (Enter, Backspace, a shortcut) would run against the old selection, so read the real one first.
   */
  private syncSelectionFromDom(view: EditorView) {
    const dom = this.domSelection()
    if (!dom || !view.dom.contains(dom.anchorNode) || !view.dom.contains(dom.focusNode)) return
    try {
      const anchor = view.posAtDOM(dom.anchorNode, dom.anchorOffset)
      const head = view.posAtDOM(dom.focusNode, dom.focusOffset)
      const { selection } = view.state
      if (selection.anchor === anchor && selection.head === head) return
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, head)))
    } catch {
      // A position inside a marker or between nodes has no text selection; keep ProseMirror's own.
    }
  }

  /**
   * The caret and selection inside the shadow root. The standard way is `getComposedRanges` with this shadow root
   * (Chromium, WebKit, Firefox), whose `direction` tells the anchor from the focus. WebKit's `shadowRoot.getSelection()`
   * can lag behind a selection set from script, so it is only the fallback for browsers without composed ranges.
   */
  private domSelection(): { anchorNode: Node; anchorOffset: number; focusNode: Node; focusOffset: number } | null {
    const root = this.renderRoot as ShadowRoot & { getSelection?: () => Selection | null }
    const selection = document.getSelection() as (Selection & { direction?: string }) | null
    if (selection && typeof selection.getComposedRanges === 'function' && root instanceof ShadowRoot) {
      if (!selection.rangeCount) return null
      const range = selection.getComposedRanges({ shadowRoots: [root] })[0]
      if (!range) return null
      return selection.direction === 'backward'
        ? { anchorNode: range.endContainer, anchorOffset: range.endOffset, focusNode: range.startContainer, focusOffset: range.startOffset }
        : { anchorNode: range.startContainer, anchorOffset: range.startOffset, focusNode: range.endContainer, focusOffset: range.endOffset }
    }
    const fallback = root.getSelection?.() ?? selection
    return fallback?.anchorNode && fallback.focusNode ? (fallback as Selection & { anchorNode: Node; focusNode: Node }) : null
  }

  private toggleTodo(pos: number) {
    const view = this.view
    if (!view || !this.editable) return
    const tr = toggleChecked(view.state, pos)
    if (tr) view.dispatch(tr)
  }

  private blockLabel(block: PageEditorBlock) {
    return BLOCK_ENTRIES.find((each) => each.block === block)?.label ?? 'Text'
  }

  /** Pasted plain text is read as Markdown; its first and last lines join the line being written when they are text. */
  private parsePastedText(text: string): Slice {
    const content = fromMarkdown(text).content
    const open = (node: ProseNode | null) => (node && node.type === schema.nodes.paragraph ? 1 : 0)
    return new Slice(content, open(content.firstChild), open(content.lastChild))
  }

  private handlePaste(view: EditorView, event: ClipboardEvent, slice: Slice): boolean {
    const text = event.clipboardData?.getData('text/plain').trim() ?? ''
    const { $from, empty } = view.state.selection
    // A link pasted over selected text links it.
    if (!empty && /^(https?:\/\/|mailto:)\S+$/.test(text) && !$from.parent.type.spec.code) {
      const href = safeHref(text)
      if (href) {
        view.dispatch(view.state.tr.addMark(view.state.selection.from, view.state.selection.to, schema.marks.link.create({ href })))
        return true
      }
    }
    // Pasted onto an empty line, blocks replace it whole, so a list stays a list.
    if (empty && $from.depth === 1 && $from.parent.isTextblock && $from.parent.content.size === 0 && slice.openStart === 0 && slice.content.childCount) {
      const tr = view.state.tr.replaceWith($from.before(), $from.after(), slice.content)
      view.dispatch(tr.scrollIntoView())
      return true
    }
    return false
  }

  /** Blocks `blocks` does not allow become text when pasted. */
  private filterSlice(slice: Slice): Slice {
    const allowed = this.allowedBlocks
    if (allowed.size === BLOCK_NAMES.length) return slice
    const nodes: ProseNode[] = []
    slice.content.forEach((node) => {
      if (node.isInline || allowed.has(blockOf(node))) nodes.push(node)
      else if (node.type === schema.nodes.code_block)
        for (const line of node.textContent.split('\n')) nodes.push(schema.nodes.paragraph.create(null, line ? schema.text(line) : null))
      else if (node.isTextblock) nodes.push(schema.nodes.paragraph.create(null, node.content, node.marks))
    })
    return new Slice(Fragment.fromArray(nodes), slice.openStart, slice.openEnd)
  }

  private emitFormat() {
    const state = this.view?.state
    if (!state) return
    const { $from, from, to, empty } = state.selection
    const block = currentBlock(state)
    let format: PageEditorFormat
    if (empty) {
      format = formatOf(state.storedMarks ?? $from.marks(), block)
    } else {
      // A format is active when all of the selected text carries it.
      const formats: PageEditorFormat[] = []
      state.doc.nodesBetween(from, to, (node) => {
        if (node.isText) formats.push(formatOf(node.marks, block))
      })
      format = formats.reduce(
        (all, each) => ({
          block,
          bold: all.bold && each.bold,
          italic: all.italic && each.italic,
          underline: all.underline && each.underline,
          strike: all.strike && each.strike,
          code: all.code && each.code,
          link: all.link === each.link ? all.link : null,
          color: all.color === each.color ? all.color : null,
          background: all.background === each.background ? all.background : null,
        }),
        formats[0] ?? emptyFormat(block),
      )
    }
    const key = JSON.stringify(format)
    if (key === this.formatKey) return
    this.formatKey = key
    this.format = format
    this.dispatchEvent(new CustomEvent<PageEditorFormat>('format-change', { detail: { ...format } }))
  }

  // ---- colours and links ------------------------------------------------------------------------------------------

  /** Applies a named colour to the selection; with no selection, to the whole block when `block` is set, and to what is typed next. */
  private applyColor(kind: ColorKind, color: PageEditorColor | null, block = false): boolean {
    const view = this.view
    if (!view || !this.editable || (color !== null && !isColor(color))) return false
    const type = schema.marks[kind]
    const state = view.state
    const { $from, empty } = state.selection
    if ($from.parent.type.spec.code) return false
    let { from, to } = state.selection
    if (empty && block) {
      from = $from.start()
      to = $from.end()
    }
    const tr = state.tr
    if (from === to) {
      const marks = type.removeFromSet(state.storedMarks ?? $from.marks())
      tr.setStoredMarks(color ? type.create({ name: color }).addToSet(marks) : marks)
    } else {
      tr.removeMark(from, to, type)
      if (color) tr.addMark(from, to, type.create({ name: color }))
      if (empty) {
        const marks = type.removeFromSet(state.storedMarks ?? $from.marks())
        tr.setStoredMarks(color ? type.create({ name: color }).addToSet(marks) : marks)
      }
    }
    if (color) this.lastColor = { kind, name: color }
    view.dispatch(tr)
    view.focus()
    return true
  }

  /** The range a link edit applies to: the selection, or the whole link around the caret. */
  private linkRange(): { from: number; to: number } | null {
    const state = this.view?.state
    if (!state) return null
    const { from, to, empty, $from } = state.selection
    if (!empty) return { from, to }
    return markExtent($from, schema.marks.link)
  }

  private openLinkEditor(): boolean {
    const view = this.view
    if (!view || !this.editable) return false
    const state = view.state
    if (state.selection.empty) {
      const range = markExtent(state.selection.$from, schema.marks.link)
      if (!range) return false
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, range.from, range.to)))
    }
    this.dismissedSelection = null
    this.toolbarMode = 'link'
    void this.updateComplete.then(() => {
      this.updateToolbar()
      const input = this.linkInput
      if (input) {
        input.value = this.format.link ?? ''
        input.focus()
        input.select()
      }
    })
    return true
  }

  private submitLink(event: Event) {
    event.preventDefault()
    const value = this.linkInput?.value.trim() ?? ''
    this.toolbarMode = 'format'
    this.setLink(value ? value : null)
  }

  private readonly removeLink = () => {
    this.toolbarMode = 'format'
    this.setLink(null)
  }

  private handleLinkKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.toolbarMode = 'format'
      this.view?.focus()
    }
  }

  // ---- slash menu -------------------------------------------------------------------------------------------------

  private slashEntries(): MenuEntry[] {
    const slash = this.slash
    if (!slash) return []
    const allowed = this.allowedBlocks
    const entries: MenuEntry[] = BLOCK_ENTRIES.filter((entry) => allowed.has(entry.block)).map((entry) => ({
      id: entry.block,
      section: 'Blocks',
      label: entry.label,
      description: entry.description,
      keywords: entry.keywords,
      shortcut: entry.shortcut,
      icon: entry.icon,
      run: () => this.setBlock(entry.block),
    }))
    if (slash.from >= 0) {
      const swatch = (kind: ColorKind, color: PageEditorColor | null) =>
        html`<span class="swatch ${kind}" data-color=${color ?? 'default'} aria-hidden="true">A</span>`
      entries.push({
        id: 'color-default',
        section: 'Colours',
        label: 'Default colour',
        description: 'Remove text and background colours',
        keywords: 'color colour reset clear none',
        icon: swatch('color', null),
        run: () => {
          this.applyColor('color', null, true)
          this.applyColor('background', null, true)
        },
      })
      for (const color of COLORS) {
        entries.push({
          id: `color-${color}`,
          section: 'Colours',
          label: `${COLOR_LABELS[color]} text`,
          description: 'Colour the current line',
          keywords: `color colour text ${color}`,
          icon: swatch('color', color),
          run: () => this.applyColor('color', color, true),
        })
      }
      for (const color of COLORS) {
        entries.push({
          id: `background-${color}`,
          section: 'Colours',
          label: `${COLOR_LABELS[color]} background`,
          description: 'Highlight the current line',
          keywords: `color colour background highlight ${color}`,
          icon: swatch('background', color),
          run: () => this.applyColor('background', color, true),
        })
      }
    }
    const query = slash.query.trim().toLowerCase()
    if (!query) return entries
    // Every word typed starts a word of the entry: `co` finds Code and Colour, `red` does not find unordered.
    const terms = query.split(/\s+/)
    const matches = entries.filter((entry) => {
      const words = `${entry.label} ${entry.keywords}`.toLowerCase().split(/[\s-]+/)
      return terms.every((term) => words.some((word) => word.startsWith(term)))
    })
    // Within a section, a label that starts with the query comes first.
    return matches.sort((a, b) => {
      if (a.section !== b.section) return 0
      return Number(!a.label.toLowerCase().startsWith(query)) - Number(!b.label.toLowerCase().startsWith(query))
    })
  }

  private syncSlash(tr: Transaction) {
    const view = this.view!
    const state = view.state
    if (this.pendingSlash >= 0) {
      const from = this.pendingSlash
      this.pendingSlash = -1
      if (tr.docChanged && state.doc.textBetween(from, Math.min(from + 1, state.doc.content.size)) === '/') {
        this.openSlash(from)
        return
      }
    }
    const slash = this.slash
    if (!slash) return
    if (slash.from < 0) {
      // The turn-into menu closes as soon as anything changes under it.
      if (tr.docChanged || tr.selectionSet) this.closeSlash(false)
      return
    }
    const from = tr.mapping.map(slash.from)
    const { $head, empty } = state.selection
    const valid =
      empty &&
      from < state.doc.content.size &&
      state.doc.textBetween(from, from + 1) === '/' &&
      $head.pos > from &&
      $head.parent === state.doc.resolve(from + 1).parent &&
      $head.pos - from <= 32
    if (!valid) {
      this.closeSlash(false)
      return
    }
    const query = state.doc.textBetween(from + 1, $head.pos)
    this.slash = { from, query }
    const count = this.slashEntries().length
    if (count) this.slashMatched = query.length
    else if (query.length > this.slashMatched + 3 || /\s\s$/.test(query)) {
      this.closeSlash(false)
      return
    }
    if (query !== slash.query) this.slashIndex = 0
  }

  private openSlash(from: number) {
    this.slash = { from, query: '' }
    this.slashIndex = 0
    this.slashMatched = 0
    this.hideToolbar()
  }

  /** Opens the block menu for the current block, without a typed `/` (the format bar's Aa button). */
  private openTurnInto() {
    this.slash = { from: -1, query: '' }
    this.slashIndex = Math.max(
      0,
      BLOCK_ENTRIES.findIndex((entry) => entry.block === this.format.block),
    )
  }

  private closeSlash(_byKey: boolean): boolean {
    if (!this.slash) return false
    this.slash = null
    if (this.slashEl?.matches(':popover-open')) this.slashEl.hidePopover()
    return true
  }

  private moveSlash(step: number): boolean {
    const count = this.slashEntries().length
    if (!count) return true
    this.slashIndex = (this.slashIndex + step + count) % count
    return true
  }

  private pickSlash(index = this.slashIndex): boolean {
    const view = this.view
    const slash = this.slash
    if (!view || !slash) return false
    const entry = this.slashEntries()[index]
    if (!entry) {
      this.closeSlash(false)
      return slash.from >= 0 ? false : true
    }
    if (slash.from >= 0) {
      const end = slash.from + 1 + slash.query.length
      view.dispatch(view.state.tr.delete(slash.from, Math.min(end, view.state.selection.head)))
    }
    this.closeSlash(false)
    entry.run()
    view.focus()
    return true
  }

  /** Inserts `/` at the caret (on a new line when the line has text) and opens the menu: the `+` button. */
  private insertSlash() {
    const view = this.view
    if (!view || !this.editable) return
    const state = view.state
    const { $from } = state.selection
    let tr = state.tr
    let at = state.selection.from
    if ($from.parent.type.spec.code || $from.parent.content.size > 0 || !$from.parent.isTextblock) {
      const after = $from.after(1)
      tr = tr.insert(after, schema.nodes.paragraph.create())
      at = after + 1
    }
    tr.setSelection(TextSelection.create(tr.doc, at)).insertText('/')
    view.dispatch(tr.scrollIntoView())
    view.focus()
    this.openSlash(at)
  }

  private placeSlash() {
    const menu = this.slashEl
    const view = this.view
    if (!menu || !view) return
    if (!this.slash) {
      if (menu.matches(':popover-open')) menu.hidePopover()
      this.followViewport(this.anyFloatingOpen())
      return
    }
    if (!menu.matches(':popover-open')) menu.showPopover()
    this.followViewport(true)
    let anchor: DOMRect
    if (this.slash.from >= 0) {
      const coords = view.coordsAtPos(this.slash.from)
      anchor = new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top)
    } else {
      anchor = this.barEl?.matches(':popover-open') ? this.barEl.getBoundingClientRect() : view.dom.getBoundingClientRect()
    }
    place(menu, anchor, this.slash.from < 0 && this.barEl?.matches(':popover-open') ? 'above' : 'below')
    menu.querySelector('.active')?.scrollIntoView({ block: 'nearest' })
  }

  // ---- floating UI ------------------------------------------------------------------------------------------------

  private anyFloatingOpen() {
    return [this.toolbarEl, this.slashEl, this.paletteEl, this.turnMenuEl, this.barEl].some((each) => each?.matches(':popover-open'))
  }

  private readonly handleViewportChange = () => {
    if (this.viewportFrame) return
    this.viewportFrame = requestAnimationFrame(() => {
      this.viewportFrame = 0
      this.updateToolbar()
      this.placeSlash()
      this.placePalette()
      this.placeTurnMenu()
      this.updateBar()
      this.updatePlus()
    })
  }

  private followViewport(follow: boolean) {
    if (follow === this.followingViewport) return
    this.followingViewport = follow
    const method = follow ? 'addEventListener' : 'removeEventListener'
    // Capture: scroll does not bubble, and the scrolling element may be any ancestor or the page itself.
    window[method]('scroll', this.handleViewportChange, { capture: true, passive: true } as AddEventListenerOptions)
    window[method]('resize', this.handleViewportChange)
    window.visualViewport?.[method]('resize', this.handleViewportChange)
    window.visualViewport?.[method]('scroll', this.handleViewportChange)
    if (!follow && this.viewportFrame) {
      cancelAnimationFrame(this.viewportFrame)
      this.viewportFrame = 0
    }
  }

  private hideFloating() {
    this.hideToolbar()
    this.closeSlash(false)
    this.palette = null
    this.turnMenu = false
    for (const each of [this.paletteEl, this.turnMenuEl, this.barEl]) if (each?.matches(':popover-open')) each.hidePopover()
  }

  private toolbarButtons(): HTMLElement[] {
    return [...(this.toolbarEl?.querySelectorAll<HTMLElement>('button:not([hidden])') ?? [])]
  }

  private updateToolbar() {
    const view = this.view
    const toolbar = this.toolbarEl
    if (!view || !toolbar) return
    const selection = view.state.selection
    const active = this.renderRoot instanceof ShadowRoot ? this.renderRoot.activeElement : null
    const focused = view.hasFocus() || toolbar.contains(active) || this.paletteEl?.contains(active) || this.turnMenuEl?.contains(active)
    const inCode = selection.$from.parent.type.spec.code || selection.$to.parent.type.spec.code
    const show = this.editable && focused && !selection.empty && selection instanceof TextSelection && !this.dismissedSelection && !inCode && !this.slash
    if (!show) {
      this.hideToolbar()
      return
    }
    if (!toolbar.matches(':popover-open')) toolbar.showPopover()
    this.followViewport(true)
    const start = view.coordsAtPos(selection.from)
    const end = view.coordsAtPos(selection.to)
    const top = Math.min(start.top, end.top)
    const bottom = Math.max(start.bottom, end.bottom)
    const left = Math.abs(start.top - end.top) < 2 ? (start.left + end.right) / 2 : view.dom.getBoundingClientRect().left + view.dom.clientWidth / 2
    const width = toolbar.offsetWidth
    const height = toolbar.offsetHeight
    let y = top - height - 8
    // On touch screens the system's copy/paste menu sits above the selection: stay out of its way.
    if (y < 8 || this.coarse) y = bottom + 10
    const x = Math.min(Math.max(8, left - width / 2), innerWidth - width - 8)
    toolbar.style.left = `${Math.round(x)}px`
    toolbar.style.top = `${Math.round(y)}px`
    if (this.palette === 'toolbar') this.placePalette()
    if (this.turnMenu) this.placeTurnMenu()
  }

  private hideToolbar() {
    if (this.palette === 'toolbar') this.palette = null
    this.turnMenu = false
    if (this.toolbarMode === 'link') this.toolbarMode = 'format'
    if (this.toolbarEl?.matches(':popover-open')) this.toolbarEl.hidePopover()
  }

  private openPalette(where: 'toolbar' | 'bar', anchor: HTMLElement, focus: boolean) {
    this.turnMenu = false
    if (this.palette === where) {
      this.palette = null
      return
    }
    this.paletteAnchor = anchor
    this.palette = where
    if (focus)
      void this.updateComplete.then(() =>
        (this.paletteEl.querySelector<HTMLElement>('[aria-pressed=true]') ?? this.paletteEl.querySelector<HTMLElement>('button'))?.focus(),
      )
  }

  private placePalette() {
    const palette = this.paletteEl
    if (!palette) return
    if (!this.palette || !this.paletteAnchor) {
      if (palette.matches(':popover-open')) palette.hidePopover()
      return
    }
    if (!palette.matches(':popover-open')) palette.showPopover()
    this.followViewport(true)
    place(palette, this.paletteAnchor.getBoundingClientRect(), this.palette === 'bar' ? 'above' : 'below')
  }

  private openTurnMenu(anchor: HTMLElement, focus: boolean) {
    this.palette = null
    this.turnAnchor = anchor
    this.turnMenu = !this.turnMenu
    if (this.turnMenu && focus)
      void this.updateComplete.then(() =>
        (this.turnMenuEl.querySelector<HTMLElement>('[aria-checked=true]') ?? this.turnMenuEl.querySelector<HTMLElement>('button'))?.focus(),
      )
  }

  private placeTurnMenu() {
    const menu = this.turnMenuEl
    if (!menu) return
    if (!this.turnMenu || !this.turnAnchor) {
      if (menu.matches(':popover-open')) menu.hidePopover()
      return
    }
    if (!menu.matches(':popover-open')) menu.showPopover()
    place(menu, this.turnAnchor.getBoundingClientRect(), 'below')
  }

  /** The `+` button sits in the gutter of the empty line that holds the caret. */
  private updatePlus() {
    const view = this.view
    if (!view || !this.editorEl) return
    const { $head, empty } = view.state.selection
    const show = this.editable && this.focused && empty && $head.parent.type === schema.nodes.paragraph && $head.parent.content.size === 0 && !this.slash
    if (!show) {
      this.plusTop = null
      return
    }
    const coords = view.coordsAtPos($head.pos)
    const box = this.editorEl.getBoundingClientRect()
    this.plusTop = Math.round((coords.top + coords.bottom) / 2 - box.top + this.editorEl.scrollTop)
  }

  /** On touch screens a format bar sits on top of the on-screen keyboard while the page has focus. */
  private updateBar() {
    const bar = this.barEl
    if (!bar) return
    const show = this.coarse && this.focused && this.editable
    if (!show) {
      if (bar.matches(':popover-open')) bar.hidePopover()
      if (this.palette === 'bar') this.palette = null
      return
    }
    if (!bar.matches(':popover-open')) bar.showPopover()
    this.followViewport(true)
    const viewport = window.visualViewport
    const bottom = viewport ? Math.max(0, innerHeight - (viewport.offsetTop + viewport.height)) : 0
    bar.style.bottom = `${Math.round(bottom)}px`
  }

  private handleFocusIn() {
    this.focused = true
  }

  private handleFocusOut(event: FocusEvent) {
    const next = event.relatedTarget as Node | null
    if (next && (this.renderRoot.contains(next) || this.contains(next))) return
    this.focused = false
    this.hideFloating()
    this.plusTop = null
    if (this.changedSinceFocus) {
      this.changedSinceFocus = false
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    }
  }

  private handleToolbarKeydown(event: KeyboardEvent) {
    if ((event.target as Element).closest('.link-form')) return
    const active = (this.renderRoot instanceof ShadowRoot ? this.renderRoot.activeElement : event.target) as HTMLElement | null
    const buttons = this.toolbarButtons()
    const index = buttons.indexOf(active!)
    const move = (to: number) => {
      event.preventDefault()
      buttons[(to + buttons.length) % buttons.length]?.focus()
    }
    if (event.key === 'ArrowRight') move(index + 1)
    else if (event.key === 'ArrowLeft') move(index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(buttons.length - 1)
    else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.palette = null
      this.turnMenu = false
      this.view?.focus()
    }
  }

  private handleMenuKeydown(event: KeyboardEvent) {
    const menu = event.currentTarget as HTMLElement
    const buttons = [...menu.querySelectorAll<HTMLElement>('button')]
    const index = buttons.indexOf(event.target as HTMLElement)
    const columns = menu.classList.contains('palette') ? 9 : 1
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? columns : event.key === 'ArrowUp' ? -columns : 0
    if (step) {
      event.preventDefault()
      buttons[(index + step + buttons.length) % buttons.length]?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      const anchor = menu.classList.contains('palette') ? this.paletteAnchor : this.turnAnchor
      this.palette = null
      this.turnMenu = false
      if (anchor && this.toolbarEl.contains(anchor)) anchor.focus()
      else this.view?.focus()
    }
  }

  /** Stops the editing surface's own `input` / `beforeinput`: the element fires its own `input` with `value` up to date. */
  private stopNativeEditing(event: Event) {
    event.stopPropagation()
  }

  private syncFormState() {
    this.internals.setFormValue(this.value, this.value)
    if (this.disabled || this.disabledByForm) {
      this.internals.setValidity({})
      return
    }
    const flags: ValidityStateFlags = {}
    let message = ''
    if (this.customValidityMessage) {
      flags.customError = true
      message = this.customValidityMessage
    } else if (this.required && !this.text.trim()) {
      flags.valueMissing = true
      message = 'Please write something.'
    }
    this.internals.setValidity(flags, message, this.surface)
  }

  // ---- rendering --------------------------------------------------------------------------------------------------

  private shortcut(keys: string) {
    return keys
      .replace('Mod-', this.modKey)
      .replace('Shift-', this.modKey === '⌘' ? '⇧' : 'Shift+')
      .replace('Alt-', this.modKey === '⌘' ? '⌥' : 'Alt+')
  }

  private renderToolbar() {
    if (this.toolbarMode === 'link') {
      return html`<form class="link-form" @submit=${this.submitLink} @keydown=${this.handleLinkKeydown}>
        <input class="link-input" type="text" inputmode="url" placeholder="Paste or type a link" aria-label="Link address" autocomplete="off" />
        <button type="submit" class="tool" aria-label="Apply link" title="Apply link">${ICONS.check}</button>
        ${
          this.format.link
            ? html`<button type="button" class="tool" aria-label="Remove link" title="Remove link" @click=${this.removeLink}>${ICONS.close}</button>`
            : nothing
        }
      </form>`
    }
    const format = this.format
    const markButton = (mark: PageEditorMark, label: string, content: unknown, keys: string) =>
      html`<button
        type="button"
        class="tool"
        tabindex="-1"
        aria-label=${label}
        aria-pressed=${String(format[mark])}
        title=${`${label} (${this.shortcut(keys)})`}
        @click=${() => this.toggleMark(mark)}
      >
        ${content}
      </button>`
    const turnable = BLOCK_ENTRIES.filter((entry) => entry.block !== 'divider' && this.allowedBlocks.has(entry.block))
    return html`
      ${
        turnable.length > 1
          ? html`<button
                type="button"
                class="tool turn"
                tabindex="0"
                aria-haspopup="true"
                aria-expanded=${String(this.turnMenu)}
                title="Turn into"
                @click=${(event: MouseEvent) => this.openTurnMenu(event.currentTarget as HTMLElement, event.detail === 0)}
              >
                ${this.blockLabel(format.block)} ${ICONS.caret}
              </button>
              <span class="sep" aria-hidden="true"></span>`
          : nothing
      }
      ${markButton('bold', 'Bold', html`<b>B</b>`, 'Mod-B')} ${markButton('italic', 'Italic', html`<i>I</i>`, 'Mod-I')}
      ${markButton('underline', 'Underline', html`<u>U</u>`, 'Mod-U')} ${markButton('strike', 'Strikethrough', html`<s>S</s>`, 'Mod-Shift-S')}
      ${markButton('code', 'Inline code', ICONS.code, 'Mod-E')}
      <button
        type="button"
        class="tool"
        tabindex="-1"
        aria-label="Link"
        aria-pressed=${String(Boolean(format.link))}
        title=${`Link (${this.shortcut('Mod-K')})`}
        @click=${() => this.openLinkEditor()}
      >
        ${ICONS.link}
      </button>
      <span class="sep" aria-hidden="true"></span>
      <button
        type="button"
        class="tool color-tool"
        tabindex="-1"
        aria-label="Colour"
        aria-haspopup="true"
        aria-expanded=${String(this.palette === 'toolbar')}
        title="Colour"
        @click=${(event: MouseEvent) => this.openPalette('toolbar', event.currentTarget as HTMLElement, event.detail === 0)}
      >
        <span class="swatch-letter" data-color=${format.color ?? 'default'} data-background=${format.background ?? 'none'}>A</span>
        ${ICONS.caret}
      </button>
    `
  }

  private renderPalette() {
    const format = this.format
    const pick = (kind: ColorKind, color: PageEditorColor | null) => () => {
      const fromKeyboard = this.paletteEl.contains(this.renderRoot instanceof ShadowRoot ? this.renderRoot.activeElement : null)
      this.applyColor(kind, color)
      if (this.palette === 'toolbar') this.palette = null
      if (fromKeyboard && this.palette === null) void this.updateComplete.then(() => this.toolbarEl.querySelector<HTMLElement>('.color-tool')?.focus())
    }
    const row = (kind: ColorKind) => {
      const current = format[kind]
      return html`<div class="swatches" role="group" aria-labelledby=${`palette-${kind}`}>
        <button
          type="button"
          class="swatch ${kind}"
          data-color="default"
          aria-label=${kind === 'color' ? 'Default text colour' : 'No background'}
          aria-pressed=${String(!current)}
          title=${kind === 'color' ? 'Default' : 'None'}
          @click=${pick(kind, null)}
        >
          ${kind === 'color' ? 'A' : ICONS.none}
        </button>
        ${COLORS.map(
          (color) =>
            html`<button
              type="button"
              class="swatch ${kind}"
              data-color=${color}
              aria-label=${`${COLOR_LABELS[color]} ${kind === 'color' ? 'text' : 'background'}`}
              aria-pressed=${String(current === color)}
              title=${COLOR_LABELS[color]}
              @click=${pick(kind, color)}
            >
              ${kind === 'color' ? 'A' : ''}
            </button>`,
        )}
      </div>`
    }
    const last = this.lastColor
    return html`
      <span class="menu-label" id="palette-color">Text</span>
      ${row('color')}
      <span class="menu-label" id="palette-background">Background</span>
      ${row('background')}
      <div class="palette-footer">
        Last used:
        <span
          class="swatch-letter"
          data-color=${last.kind === 'color' ? last.name : 'default'}
          data-background=${last.kind === 'background' ? last.name : 'none'}
          >${COLOR_LABELS[last.name]}</span
        >
        · <kbd>${this.shortcut('Mod-Shift-H')}</kbd> to reapply
      </div>
    `
  }

  private renderTurnMenu() {
    const current = this.format.block
    return BLOCK_ENTRIES.filter((entry) => entry.block !== 'divider' && this.allowedBlocks.has(entry.block)).map(
      (entry) =>
        html`<button
          type="button"
          class="turn-item"
          role="menuitemradio"
          aria-checked=${String(current === entry.block)}
          @click=${() => {
            this.turnMenu = false
            this.setBlock(entry.block)
          }}
        >
          <span class="menu-icon">${entry.icon}</span>
          <span class="turn-label">${entry.label}</span>
          ${current === entry.block ? html`<span class="turn-check">${ICONS.check}</span>` : nothing}
        </button>`,
    )
  }

  private renderSlash() {
    const entries = this.slashEntries()
    if (!this.slash) return nothing
    if (!entries.length) return html`<div class="slash-empty">No results</div>`
    return html`${entries.map((entry, index) => {
        const heading = entry.section !== entries[index - 1]?.section ? html`<div class="menu-label" role="presentation">${entry.section}</div>` : nothing
        return html`${heading}
          <div
            class="slash-item ${index === this.slashIndex ? 'active' : ''}"
            id=${`slash-${index}`}
            role="option"
            aria-selected=${String(index === this.slashIndex)}
            @mousemove=${() => {
              if (this.slashIndex !== index) this.slashIndex = index
            }}
            @click=${() => this.pickSlash(index)}
          >
            <span class="menu-icon">${entry.icon}</span>
            <span class="slash-text"><span class="slash-label">${entry.label}</span><span class="slash-description">${entry.description}</span></span>
            ${entry.shortcut ? html`<kbd class="slash-shortcut">${entry.shortcut}</kbd>` : nothing}
          </div>`
      })}
      <div class="slash-footer" role="presentation">
        <span><kbd>↑↓</kbd> move</span><span><kbd>↵</kbd> insert</span><span><kbd>esc</kbd> close</span>
      </div>`
  }

  private renderBar() {
    const format = this.format
    const allowed = this.allowedBlocks
    const keep = (event: Event) => event.preventDefault()
    return html`
      <button type="button" class="tool" aria-label="Insert a block" @click=${() => this.insertSlash()}>${ICONS.plus}</button>
      <button type="button" class="tool aa" aria-label="Turn into" @click=${() => (this.slash ? this.closeSlash(false) : this.openTurnInto())}>Aa</button>
      ${
        allowed.has('todo')
          ? html`<button
              type="button"
              class="tool"
              aria-label="To-do"
              aria-pressed=${String(format.block === 'todo')}
              @click=${() => this.run(toggleBlock('todo'))}
            >
              ${ICONS.todo}
            </button>`
          : nothing
      }
      <button type="button" class="tool" aria-label="Bold" aria-pressed=${String(format.bold)} @click=${() => this.toggleMark('bold')}><b>B</b></button>
      <button type="button" class="tool" aria-label="Italic" aria-pressed=${String(format.italic)} @click=${() => this.toggleMark('italic')}><i>I</i></button>
      <button
        type="button"
        class="tool color-tool"
        aria-label="Colour"
        aria-expanded=${String(this.palette === 'bar')}
        @click=${(event: MouseEvent) => this.openPalette('bar', event.currentTarget as HTMLElement, false)}
      >
        <span class="swatch-letter" data-color=${format.color ?? 'default'} data-background=${format.background ?? 'none'}>A</span>
      </button>
      ${
        allowed.has('code')
          ? html`<button
              type="button"
              class="tool"
              aria-label="Code block"
              aria-pressed=${String(format.block === 'code')}
              @click=${() => this.run(toggleBlock('code'))}
            >
              ${ICONS.code}
            </button>`
          : nothing
      }
      <button
        type="button"
        class="tool"
        aria-label="Indent"
        @click=${() => this.run(indentItems(1))}
        ?hidden=${!['bullet', 'ordered', 'todo'].includes(format.block)}
      >
        ${ICONS.indent}
      </button>
      <button
        type="button"
        class="tool"
        aria-label="Outdent"
        @click=${() => this.run(indentItems(-1))}
        ?hidden=${!['bullet', 'ordered', 'todo'].includes(format.block)}
      >
        ${ICONS.outdent}
      </button>
      <span class="bar-keep" @mousedown=${keep}></span>
    `
  }

  override render() {
    const keepFocus = (event: Event) => {
      // Buttons keep the caret in the page; the link field takes focus.
      if (!(event.target as Element).closest('input')) event.preventDefault()
    }
    return html`
      <div class="frame ${this.disabledByForm ? 'form-disabled' : ''}" @focusin=${this.handleFocusIn} @focusout=${this.handleFocusOut}>
        <div class="header" ?hidden=${!this.slotPresence.has('header')}><slot name="header" @slotchange=${this.slotPresence.handleSlotChange}></slot></div>
        <div class="editor">
          <div class="content" @input=${this.stopNativeEditing} @beforeinput=${this.stopNativeEditing}></div>
          <button
            type="button"
            class="plus"
            tabindex="-1"
            aria-label="Insert a block"
            title="Insert a block"
            ?hidden=${this.plusTop === null}
            style=${this.plusTop === null ? '' : `top: ${this.plusTop}px`}
            @mousedown=${keepFocus}
            @click=${() => this.insertSlash()}
          >
            ${ICONS.plus}
          </button>
        </div>
      </div>
      <div
        class="toolbar"
        part="toolbar"
        popover="manual"
        role="toolbar"
        aria-label="Formatting"
        @mousedown=${keepFocus}
        @keydown=${this.handleToolbarKeydown}
        @focusout=${this.handleFocusOut}
      >
        ${this.renderToolbar()}
      </div>
      <div
        class="turn-menu"
        popover="manual"
        role="menu"
        aria-label="Turn into"
        @mousedown=${keepFocus}
        @keydown=${this.handleMenuKeydown}
        @focusout=${this.handleFocusOut}
      >
        ${this.renderTurnMenu()}
      </div>
      <div
        class="palette"
        part="palette"
        popover="manual"
        role="dialog"
        aria-label="Colour"
        @mousedown=${keepFocus}
        @keydown=${this.handleMenuKeydown}
        @focusout=${this.handleFocusOut}
      >
        ${this.renderPalette()}
      </div>
      <!-- Focus stays in the page while the menu is open (Tab picks an item); the tab stop only makes the scrolling list keyboard-reachable for assistive tools. -->
      <div class="slash" part="slash-menu" id="slash-menu" popover="manual" role="listbox" aria-label="Insert a block" tabindex="0" @mousedown=${keepFocus}>
        ${this.renderSlash()}
      </div>
      <div class="format-bar" part="format-bar" popover="manual" role="toolbar" aria-label="Format" @mousedown=${keepFocus} @focusout=${this.handleFocusOut}>
        ${this.renderBar()}
      </div>
    `
  }
}

const BLOCK_ENTRIES: ReadonlyArray<{ block: PageEditorBlock; label: string; description: string; keywords: string; shortcut?: string; icon: TemplateResult }> =
  [
    { block: 'paragraph', label: 'Text', description: 'Plain writing', keywords: 'text paragraph plain', icon: glyph('T') },
    { block: 'heading1', label: 'Heading 1', description: 'Big section title', keywords: 'h1 title heading', shortcut: '#', icon: glyph('H1') },
    { block: 'heading2', label: 'Heading 2', description: 'Medium section title', keywords: 'h2 subtitle heading', shortcut: '##', icon: glyph('H2') },
    { block: 'heading3', label: 'Heading 3', description: 'Small section title', keywords: 'h3 heading', shortcut: '###', icon: glyph('H3') },
    { block: 'bullet', label: 'Bulleted list', description: 'A simple list', keywords: 'bullet list ul unordered', shortcut: '-', icon: ICONS.bullet },
    { block: 'ordered', label: 'Numbered list', description: 'A list with numbers', keywords: 'numbered list ol ordered', shortcut: '1.', icon: ICONS.ordered },
    {
      block: 'todo',
      label: 'To-do list',
      description: 'Track tasks with checkboxes',
      keywords: 'todo task checkbox check list',
      shortcut: '[]',
      icon: ICONS.todo,
    },
    { block: 'quote', label: 'Quote', description: 'Set a quotation apart', keywords: 'quote blockquote citation', shortcut: '>', icon: ICONS.quote },
    {
      block: 'code',
      label: 'Code block',
      description: 'Snippet with syntax colours',
      keywords: 'code snippet pre programming',
      shortcut: '```',
      icon: ICONS.code,
    },
    { block: 'divider', label: 'Divider', description: 'Separate sections', keywords: 'divider line rule hr separator', shortcut: '---', icon: ICONS.divider },
  ]

/** Places a popover next to `anchor`, flipping to the other side when there is no room. */
function place(popover: HTMLElement, anchor: DOMRect, side: 'above' | 'below') {
  const width = popover.offsetWidth
  const height = popover.offsetHeight
  const gap = 6
  let y = side === 'below' ? anchor.bottom + gap : anchor.top - height - gap
  if (side === 'below' && y + height > innerHeight - 8 && anchor.top - height - gap >= 8) y = anchor.top - height - gap
  if (side === 'above' && y < 8) y = anchor.bottom + gap
  const x = Math.min(Math.max(8, anchor.left), innerWidth - width - 8)
  popover.style.left = `${Math.round(x)}px`
  popover.style.top = `${Math.round(Math.max(8, y))}px`
}

/** The extent of `type` around a position, or `null` when it does not carry it. */
function markExtent($pos: ResolvedPos, type: MarkType): { from: number; to: number } | null {
  const parent = $pos.parent
  const start = $pos.start()
  let found: Mark | undefined = type.isInSet($pos.marks())
  if (!found && $pos.nodeAfter) found = type.isInSet($pos.nodeAfter.marks)
  if (!found) return null
  const mark = found
  let from = -1
  let to = -1
  let offset = 0
  for (let index = 0; index < parent.childCount; index++) {
    const child = parent.child(index)
    const end = offset + child.nodeSize
    if (mark.isInSet(child.marks)) {
      if (from < 0) from = offset
      to = end
    } else if (from >= 0) {
      if (start + to >= $pos.pos) break
      from = -1
    }
    offset = end
  }
  return from < 0 ? null : { from: start + from, to: start + to }
}

/** Serializes a page to HTML with real nested `<ul>`/`<ol>` lists. */
function pageToHTML(doc: ProseNode): string {
  const serializer = DOMSerializer.fromSchema(schema)
  const root = document.createElement('div')
  const numbers = listNumbers(doc)
  let stack: Array<{ list: HTMLElement; kind: string; last: HTMLElement | null }> = []
  doc.forEach((node, _pos, index) => {
    if (node.type !== schema.nodes.item) {
      stack = []
      if (node.type === schema.nodes.paragraph && node.content.size === 0 && index === doc.childCount - 1) return
      root.append(serializer.serializeNode(node))
      return
    }
    const indent = node.attrs.indent as number
    const kind = node.attrs.kind as string
    const tag = kind === 'ordered' ? 'ol' : 'ul'
    while (stack.length > indent + 1) stack.pop()
    let level: (typeof stack)[number] | undefined = stack[indent]
    if (level && level.kind !== kind) {
      stack.length = indent
      level = undefined
    }
    if (!level) {
      const list = document.createElement(tag)
      if (kind === 'todo') list.className = 'todo-list'
      if (kind === 'ordered' && numbers[index] > 1) list.setAttribute('start', String(numbers[index]))
      const parent = indent > 0 ? stack[indent - 1]?.last : null
      ;(parent ?? root).append(list)
      level = { list, kind, last: null }
      stack[indent] = level
    }
    const li = document.createElement('li')
    if (kind === 'todo') {
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.disabled = true
      if (node.attrs.checked) box.setAttribute('checked', '')
      li.append(box, ' ')
      li.dataset.checked = String(node.attrs.checked)
    }
    li.append(serializer.serializeFragment(node.content))
    level.list.append(li)
    level.last = li
  })
  return root.innerHTML
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-page-editor': PageEditor
  }
}
