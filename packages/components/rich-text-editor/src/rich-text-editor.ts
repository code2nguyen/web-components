import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult, svg } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { Fragment, Slice, type Mark, type Node as ProseNode } from 'prosemirror-model'
import { EditorState, Plugin, PluginKey, TextSelection, type Command, type Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView, type NodeView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, chainCommands, toggleMark as toggleMarkCommand } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import { inputRules, undoInputRule } from 'prosemirror-inputrules'
import {
  backspaceAtStart,
  buildInputRules,
  currentBlock,
  enterInCode,
  enterInItem,
  enterInTextblock,
  fromMarkdown,
  indentCode,
  indentItems,
  lineBreak,
  listNumbering,
  markExtent,
  normalize,
  pageToHTML,
  safeHref,
  schema,
  setBlock as setBlockCommand,
  splitPastedLines,
  toMarkdown,
  toggleBlock,
  type PageEditorBlock,
} from '@c2n/page-editor/prose'
import type { Menu } from '@c2n/menu'
import '@c2n/menu'
import { richTextEditorMessages } from './messages'
import styles from './rich-text-editor.scss?inline'

/** The formats `formats` can list, in their default toolbar order. */
export const RICH_TEXT_FORMATS = ['bold', 'italic', 'underline', 'strike', 'code', 'link', 'bullet', 'ordered', 'quote', 'code-block'] as const
export type RichTextFormatName = (typeof RICH_TEXT_FORMATS)[number]

/** Inline formats accepted by `toggleMark()`. */
export type RichTextMark = 'bold' | 'italic' | 'underline' | 'strike' | 'code'

/** Blocks accepted by `setBlock()` and reported by `format-change`. */
export type RichTextBlock = 'paragraph' | 'bullet' | 'ordered' | 'quote' | 'code-block'

/** Where the toolbar sits. */
export type RichTextToolbarPosition = 'top' | 'bottom' | 'floating' | 'none'

/** The `format-change` detail: the block at the caret and what the selected text carries. */
export interface RichTextFormat {
  block: RichTextBlock
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  code: boolean
  /** Address of the link at the selection, or `null`. */
  link: string | null
}

/** The `trigger` detail: a trigger character typed at the start of a word, and the word typed after it so far. */
export interface RichTextTriggerDetail {
  /** `false` once the word ends (a space, Escape, the caret moving away): the app closes its picker. */
  active: boolean
  char: string
  query: string
  /** Where the trigger character is drawn, in viewport coordinates, to place a picker under it. */
  rect: DOMRect | null
}

/** Events fired by {@link RichTextEditor}, keyed for `addEventListener`. */
export interface RichTextEditorEventMap {
  input: Event
  change: Event
  'format-change': CustomEvent<RichTextFormat>
  submit: Event
  trigger: CustomEvent<RichTextTriggerDetail>
}

export interface RichTextEditor {
  addEventListener: TypedAddEventListener<RichTextEditor, RichTextEditorEventMap>
  removeEventListener: TypedRemoveEventListener<RichTextEditor, RichTextEditorEventMap>
}

/** The text a link is being edited for, kept highlighted while focus is in the link popover. */
const linkTarget = new PluginKey<DecorationSet>('c2-rich-text-editor-link-target')

const DEFAULT_TOOLBAR = 'bold italic underline strike | link code | bullet ordered quote code-block'

const MARKS: readonly RichTextMark[] = ['bold', 'italic', 'underline', 'strike', 'code']

/** The page editor's block names for the blocks this editor offers. */
const BLOCK_OF: Record<Exclude<RichTextBlock, 'paragraph'>, PageEditorBlock> = { bullet: 'bullet', ordered: 'ordered', quote: 'quote', 'code-block': 'code' }

const icon = (body: TemplateResult) => html`<svg viewBox="0 0 20 20" aria-hidden="true">${body}</svg>`
const stroke = (d: string) => svg`<path d=${d} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />`

const ICONS = {
  code: icon(stroke('M7 6l-4 4 4 4M13 6l4 4-4 4')),
  link: icon(stroke('M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1')),
  bullet: icon(
    svg`<circle cx="4.5" cy="6" r="1.4" fill="currentColor" /><circle cx="4.5" cy="14" r="1.4" fill="currentColor" />${stroke('M8.5 6h8M8.5 14h8')}`,
  ),
  ordered: icon(
    svg`<text x="2.2" y="8.4" font-size="6.5" font-weight="600" fill="currentColor">1</text><text x="2.2" y="16.4" font-size="6.5" font-weight="600" fill="currentColor">2</text>${stroke('M8.5 6h8M8.5 14h8')}`,
  ),
  quote: icon(stroke('M4 4v12M8 6h8M8 10h8M8 14h5')),
  codeBlock: icon(
    svg`<rect x="2.5" y="3.5" width="15" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" />${stroke('M8 8l-2 2 2 2M12 8l2 2-2 2')}`,
  ),
  more: icon(
    svg`<circle cx="4.5" cy="10" r="1.4" fill="currentColor" /><circle cx="10" cy="10" r="1.4" fill="currentColor" /><circle cx="15.5" cy="10" r="1.4" fill="currentColor" />`,
  ),
  close: icon(stroke('M5 5l10 10M15 5L5 15')),
}

type MessageKey = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'link' | 'bullet' | 'ordered' | 'quote' | 'codeBlock'

interface ToolSpec {
  label: MessageKey
  keys: string
  content: TemplateResult
  /** Toggles show a pressed state; the link button opens the link popover. */
  toggle: boolean
}

const TOOLS: Record<RichTextFormatName, ToolSpec> = {
  bold: { label: 'bold', keys: 'Mod-B', content: html`<b class="glyph">B</b>`, toggle: true },
  italic: { label: 'italic', keys: 'Mod-I', content: html`<i class="glyph">I</i>`, toggle: true },
  underline: { label: 'underline', keys: 'Mod-U', content: html`<u class="glyph">U</u>`, toggle: true },
  strike: { label: 'strike', keys: 'Mod-Shift-X', content: html`<s class="glyph">S</s>`, toggle: true },
  code: { label: 'code', keys: 'Mod-E', content: ICONS.code, toggle: true },
  link: { label: 'link', keys: 'Mod-K', content: ICONS.link, toggle: false },
  bullet: { label: 'bullet', keys: 'Mod-Shift-8', content: ICONS.bullet, toggle: true },
  ordered: { label: 'ordered', keys: 'Mod-Shift-7', content: ICONS.ordered, toggle: true },
  quote: { label: 'quote', keys: 'Mod-Shift-9', content: ICONS.quote, toggle: true },
  'code-block': { label: 'codeBlock', keys: 'Mod-Alt-C', content: ICONS.codeBlock, toggle: true },
}

/** A toolbar entry: a format button, or a separator before the next group. */
type ToolbarEntry = { kind: 'tool'; name: RichTextFormatName } | { kind: 'separator' }

const emptyFormat = (block: RichTextBlock = 'paragraph'): RichTextFormat => ({
  block,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
  link: null,
})

function formatOfMarks(marks: readonly Mark[], block: RichTextBlock): RichTextFormat {
  const format = emptyFormat(block)
  for (const mark of marks) {
    const name = mark.type.name
    if (name === 'link') format.link = mark.attrs.href as string
    else if ((MARKS as readonly string[]).includes(name)) format[name as RichTextMark] = true
  }
  return format
}

function blockOfState(state: EditorState): RichTextBlock {
  const block = currentBlock(state)
  if (block === 'bullet' || block === 'ordered' || block === 'quote') return block
  if (block === 'code') return 'code-block'
  return 'paragraph'
}

/** Places a popover next to `anchor`, flipping to the other side when there is no room. */
function place(popover: HTMLElement, anchor: { left: number; top: number; bottom: number }, side: 'above' | 'below') {
  const width = popover.offsetWidth
  const height = popover.offsetHeight
  const gap = 8
  let y = side === 'below' ? anchor.bottom + gap : anchor.top - height - gap
  if (side === 'below' && y + height > innerHeight - 8 && anchor.top - height - gap >= 8) y = anchor.top - height - gap
  if (side === 'above' && y < 8) y = anchor.bottom + gap
  const x = Math.min(Math.max(8, anchor.left), innerWidth - width - 8)
  popover.style.left = `${Math.round(x)}px`
  popover.style.top = `${Math.round(Math.max(8, y))}px`
}

/** The toolbar a `formats` value describes, or `undefined` when it names no format. */
function toolbarEntries(formats: string): ToolbarEntry[] | undefined {
  const entries: ToolbarEntry[] = []
  const seen = new Set<string>()
  for (const token of formats.trim().split(/\s+/)) {
    if (token === '|') {
      if (entries.length && entries[entries.length - 1].kind === 'tool') entries.push({ kind: 'separator' })
    } else if ((RICH_TEXT_FORMATS as readonly string[]).includes(token) && !seen.has(token)) {
      seen.add(token)
      entries.push({ kind: 'tool', name: token as RichTextFormatName })
    }
  }
  if (entries[entries.length - 1]?.kind === 'separator') entries.pop()
  return entries.length ? entries : undefined
}

/** Bulleted and numbered items: a marker the caret cannot enter, then the item's text. */
class ItemView implements NodeView {
  readonly dom: HTMLElement
  readonly contentDOM: HTMLElement
  private readonly marker: HTMLElement
  private node: ProseNode

  constructor(node: ProseNode, decorations: readonly Decoration[]) {
    this.node = node
    this.dom = document.createElement('div')
    this.dom.className = 'item'
    this.marker = document.createElement('span')
    this.marker.className = 'marker'
    this.marker.contentEditable = 'false'
    this.contentDOM = document.createElement('div')
    this.contentDOM.className = 'item-text'
    this.dom.append(this.marker, this.contentDOM)
    this.sync(decorations)
  }

  update(node: ProseNode, decorations: readonly Decoration[]) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.sync(decorations)
    return true
  }

  private sync(decorations: readonly Decoration[]) {
    const { kind, indent } = this.node.attrs
    this.dom.dataset.kind = kind === 'ordered' ? 'ordered' : 'bullet'
    this.dom.dataset.indent = String(indent)
    const number = decorations.find((each) => (each.spec as { number?: number }).number)?.spec.number as number | undefined
    this.marker.textContent = kind === 'ordered' ? `${number ?? 1}.` : ''
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }) {
    return mutation.type !== 'selection' && !this.contentDOM.contains(mutation.target)
  }
}

/**
 * A compact formatted-text field for comments, replies, email bodies and short descriptions: bold, italic, underline,
 * strikethrough, inline code, links, bulleted and numbered lists, quotes and code blocks, and nothing more. For long
 * documents with headings, tables, colours and images, use `c2-page-editor`.
 *
 * The toolbar is one tab stop (arrow keys move between its buttons, Alt+F10 reaches it from the text, Escape goes
 * back), sits at the top, at the bottom beside the app's own buttons, over the selection, or nowhere
 * (`toolbar-position`), and moves the buttons that do not fit into a "More" menu. `formats` chooses the buttons, their
 * order and groups, and is also what the keyboard shortcuts, the Markdown typed as you go (`- `, `1. `, `> `,
 * three backticks, `**bold**`; Backspace right after undoes it) and paste are allowed to produce: anything else
 * pasted becomes plain text, and pasted styles (Google Docs, Word) become the formats they show.
 *
 * Tab leaves the field, except in a list or a code block, where it indents; Escape there gives Tab back, so the
 * next one leaves. ⌘/Ctrl+Enter fires `submit`, which submits an enclosing form unless it is cancelled.
 *
 * The value is GitHub-flavoured Markdown (`<u>` for underline), the same as `c2-page-editor`'s, and is `''` when the
 * field is empty. `toHTML()` gives the HTML for an email body: `p`, `br`, `strong`, `em`, `u`, `s`, `code`, `pre`,
 * `a`, `ul`, `ol`, `li` and `blockquote`, with links limited to web, mail and phone addresses. The element is a form
 * control (`name`, `required`, `maxlength`, reset, disabled fieldsets) and takes its label, hint and error from an
 * enclosing `c2-form-field`.
 *
 * Mentions, tags and emoji are the app's: list trigger characters in `triggers` (`"@ #"`), listen for `trigger` to
 * draw a picker under `detail.rect` from `detail.query`, and call `completeTrigger(text, { href })` with the choice.
 * While a trigger is active, a capture-phase `keydown` listener on the element that calls `preventDefault()` keeps
 * the key (ArrowDown, Enter) from the text.
 *
 * @tag c2-rich-text-editor
 *
 * @slot toolbar-end - The app's own tools at the end of the toolbar (attach, mention, emoji). Each is a tab stop of its own.
 * @slot footer-start - Content at the start of the footer, such as a Send button. With `toolbar-position="bottom"` the toolbar follows it.
 * @slot footer-end - Content at the end of the footer, after the character counter, such as Cancel and Comment buttons.
 *
 * @csspart container - The box around the toolbar, the text and the footer.
 * @csspart toolbar - The formatting toolbar region: its buttons, then the `toolbar-end` slot, which projects the app's own tools after them (it has no fallback content).
 * @csspart content - The editable text.
 * @csspart footer - The row under the text: the `footer-start` slot, then the toolbar when it sits at the bottom, the counter, and the `footer-end` slot. Both slots project assigned content only, without fallback; the row is hidden while it has nothing to show.
 * @csspart link-popover - The popover that edits a link.
 *
 * @event {Event} input - Fired on each edit, after `value` is updated.
 * @event {Event} change - Fired when the field loses focus after its value changed.
 * @event {CustomEvent<RichTextFormat>} format-change - Fired when the block or the formatting at the selection changes. Does not bubble.
 * @event {Event} submit - ⌘/Ctrl+Enter was pressed. Cancelable: unless it is cancelled, an enclosing form is submitted. Does not bubble.
 * @event {CustomEvent<RichTextTriggerDetail>} trigger - A character listed in `triggers` was typed at the start of a word, the word after it changed, or it ended (`active: false`). Does not bubble.
 *
 * @cssproperty {border} [--c2-rich-text-editor__container--border=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-rich-text-editor__container__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-rich-text-editor__container__focus--border=1px solid #476ef9]
 * @cssproperty {box-shadow} [--c2-rich-text-editor__container__focus--box-shadow=none] - A focus ring around the whole field, e.g. `0 0 0 3px rgba(2, 101, 220, 0.15)`.
 * @cssproperty {border} [--c2-rich-text-editor__container__error--border=1px solid #dc2626] - While invalid: over `maxlength`, or an enclosing `c2-form-field` shows an error.
 * @cssproperty {border-radius} [--c2-rich-text-editor__container--border-radius=6px]
 * @cssproperty {color} [--c2-rich-text-editor__container--background=#ffffff]
 * @cssproperty {color} [--c2-rich-text-editor__container--color=#18181b]
 * @cssproperty {color} [--c2-rich-text-editor__container__read-only--background=#fafafa]
 * @cssproperty {opacity} [--c2-rich-text-editor__container__disabled--opacity=0.38]
 * @cssproperty {padding} [--c2-rich-text-editor__toolbar--padding=6px]
 * @cssproperty {pixel} [--c2-rich-text-editor__toolbar--gap=2px]
 * @cssproperty {border} [--c2-rich-text-editor__toolbar--border=1px solid #e4e4e7] - The line between the toolbar and the text (above it when the toolbar is at the bottom).
 * @cssproperty {pixel} [--c2-rich-text-editor__tool--size=32px] - Width and height of a toolbar button; at least 44px on touch screens.
 * @cssproperty {border-radius} [--c2-rich-text-editor__tool--border-radius=4px]
 * @cssproperty {color} [--c2-rich-text-editor__tool--color=#52525b]
 * @cssproperty {color} [--c2-rich-text-editor__tool__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-rich-text-editor__tool__pressed--background=#edf1fe] - A format the selection carries.
 * @cssproperty {color} [--c2-rich-text-editor__tool__pressed--color=#0265dc]
 * @cssproperty {outline} [--c2-rich-text-editor__tool__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {color} [--c2-rich-text-editor__separator--color=#e4e4e7]
 * @cssproperty {padding} [--c2-rich-text-editor__content--padding=10px 12px]
 * @cssproperty {pixel} [--c2-rich-text-editor__content--min-height=80px] - The text grows from this height…
 * @cssproperty {pixel} [--c2-rich-text-editor__content--max-height=none] - …to this one, then scrolls.
 * @cssproperty {font-family} [--c2-rich-text-editor__content--font-family=inherit]
 * @cssproperty {font-size} [--c2-rich-text-editor__content--font-size=14px]
 * @cssproperty {pixel} [--c2-rich-text-editor__content--line-height=22px]
 * @cssproperty {pixel} [--c2-rich-text-editor__block--margin-top=6px] - Space between paragraphs, lists, quotes and code blocks.
 * @cssproperty {color} [--c2-rich-text-editor__placeholder--color=#71717a]
 * @cssproperty {color} [--c2-rich-text-editor__selection--background=rgba(2, 101, 220, 0.18)]
 * @cssproperty {color} [--c2-rich-text-editor__link--color=#0265dc]
 * @cssproperty {border} [--c2-rich-text-editor__quote--border-left=3px solid #d4d4d8]
 * @cssproperty {color} [--c2-rich-text-editor__quote--color=#52525b]
 * @cssproperty {pixel} [--c2-rich-text-editor__item--indent=22px] - Indentation of one list level, which is also the width of the marker column.
 * @cssproperty {font-family} [--c2-rich-text-editor__code--font-family=ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {color} [--c2-rich-text-editor__inline-code--background=rgba(135, 131, 120, 0.15)]
 * @cssproperty {border-radius} [--c2-rich-text-editor__inline-code--border-radius=4px]
 * @cssproperty {color} [--c2-rich-text-editor__code-block--background=#f4f4f5]
 * @cssproperty {border-radius} [--c2-rich-text-editor__code-block--border-radius=4px]
 * @cssproperty {padding} [--c2-rich-text-editor__footer--padding=8px 10px 10px 12px]
 * @cssproperty {pixel} [--c2-rich-text-editor__footer--gap=8px]
 * @cssproperty {font-size} [--c2-rich-text-editor__counter--font-size=12px]
 * @cssproperty {color} [--c2-rich-text-editor__counter--color=#71717a]
 * @cssproperty {color} [--c2-rich-text-editor__counter__error--color=#dc2626]
 * @cssproperty {color} [--c2-rich-text-editor__popover--background=#ffffff] - The link popover and the floating toolbar.
 * @cssproperty {border} [--c2-rich-text-editor__popover--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-rich-text-editor__popover--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-rich-text-editor__popover--box-shadow=0 8px 24px rgba(24, 24, 27, 0.12), 0 2px 6px rgba(24, 24, 27, 0.06)]
 * @cssproperty {border} [--c2-rich-text-editor__link-input--border=1px solid #bcbcc6]
 * @cssproperty {color} [--c2-rich-text-editor__button--background=#0265dc] - The link popover's Save button.
 * @cssproperty {color} [--c2-rich-text-editor__button--color=#ffffff]
 */
@customElement('c2-rich-text-editor')
export class RichTextEditor extends LitElement {
  static override styles = unsafeCSS(styles)
  static formAssociated = true

  private readonly internals = this.attachInternals()
  private readonly field = new FieldContextConsumer(this, { kind: 'text' })
  private readonly msg = new LocalizeController(this, richTextEditorMessages)
  private readonly slotPresence = new SlotPresenceController(this, ['footer-start', 'footer-end'])

  /** Markdown. `''` when the field is empty. */
  @property() value = ''
  /** Name of the field in form data. */
  @property({ reflect: true }) name = ''
  /** Accessible name when the field is not inside a `c2-form-field` and has no `aria-label`. */
  @property() label = ''
  /** Accessible name of the text, when there is no visible label to point at. Wins over an enclosing field's label. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null
  /** Shown while the field is empty. */
  @property() placeholder = ''
  /**
   * Space-separated formats the writer may use, in toolbar order, `|` starting a new group: `bold italic underline
   * strike code link bullet ordered quote code-block`. Shortcuts, typed Markdown and paste produce only these. Empty
   * allows all.
   */
  @property() formats = ''
  /** Where the toolbar sits: `top`, `bottom` (in the footer, after `footer-start`), `floating` (over selected text; at the bottom on touch screens) or `none`. */
  @property({ attribute: 'toolbar-position' }) toolbarPosition: RichTextToolbarPosition = 'top'
  /** Space-separated characters that start a `trigger` when typed at the start of a word, e.g. `"@ #"`. */
  @property() triggers = ''
  /** Not focusable, not editable and left out of the form data; the toolbar is inert. A disabled `<fieldset>` does the same. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Selectable and focusable, without a toolbar; the value is still submitted. */
  @property({ type: Boolean, reflect: true }) readOnly = false
  /** The field is invalid (`valueMissing`) while its text is empty or only whitespace. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Most characters of text (not Markdown) the field accepts: past it, a counter turns red and the field is invalid. `-1` for no limit. */
  @property({ type: Number, attribute: 'maxlength' }) maxLength = -1

  @state() private format: RichTextFormat = emptyFormat()
  @state() private disabledByForm = false
  @state() private focused = false
  @state() private selectionEmpty = true
  @state() private coarse = false
  @state() private textLength = 0
  @state() private overflowFrom = Infinity
  @state() private rovingIndex = 0
  @state() private linkOpen = false

  @query('.content') private surface!: HTMLElement
  @query('.toolbar') private toolbarEl?: HTMLElement
  @query('.link-popover') private linkPopover!: HTMLElement
  @query('.link-input') private linkInput!: HTMLInputElement
  @query('c2-menu') private moreMenu?: Menu

  private view?: EditorView
  private serialized = ''
  private dirty = false
  private changedSinceFocus = false
  private customValidityMessage = ''
  private formatKey = ''
  private pastingOwnHtml = false
  private tabReleased = false
  private linkRange: { from: number; to: number } | null = null
  private trigger: { char: string; query: string; from: number } | null = null
  private dismissedTrigger = -1
  private modKey = 'Ctrl+'
  private resizeObserver?: ResizeObserver
  private editorLocale = ''

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
  /** The text without formatting, one block per line. */
  get text(): string {
    return docText(this.view?.state.doc ?? this.restrictedDoc(this.value))
  }
  /** The block and the formats at the selection. */
  get currentFormat(): RichTextFormat {
    return { ...this.format }
  }

  private get toolbarEntries(): ToolbarEntry[] {
    return toolbarEntries(this.formats) ?? toolbarEntries(DEFAULT_TOOLBAR)!
  }

  private get allowed(): Set<RichTextFormatName> {
    return new Set(this.toolbarEntries.flatMap((entry) => (entry.kind === 'tool' ? [entry.name] : [])))
  }

  private get editable() {
    return !this.disabled && !this.disabledByForm && !this.readOnly
  }

  /** Where the toolbar is drawn: nowhere while read-only, at the bottom for a floating one on a touch screen. */
  private get position(): RichTextToolbarPosition {
    if (this.readOnly) return 'none'
    if (this.toolbarPosition === 'floating') return this.coarse ? 'bottom' : 'floating'
    return this.toolbarPosition === 'bottom' || this.toolbarPosition === 'none' ? this.toolbarPosition : 'top'
  }

  private get overLimit() {
    return this.maxLength >= 0 && this.textLength > this.maxLength
  }

  override connectedCallback() {
    super.connectedCallback()
    this.modKey = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+'
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    // The `value` attribute is the default value; once the writer has edited, it no longer drives the field.
    if (name === 'value' && this.dirty) return
    super.attributeChangedCallback(name, oldValue, newValue)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    this.closeLink(false)
  }

  // ---- public API -------------------------------------------------------------------------------------------------

  /** Focuses the text. */
  override focus(options?: FocusOptions) {
    if (this.view) this.view.focus()
    else this.surface?.focus(options)
  }
  override blur() {
    this.surface?.blur()
  }
  /** Whether the writer has edited the text since the last reset. */
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

  /** Toggles bold, italic, underline, strikethrough or inline code on the selection, or on what is typed next. */
  toggleMark(mark: RichTextMark): boolean {
    return this.run(this.markCommand(mark), MARKS.includes(mark) && this.allowed.has(mark))
  }

  /** Turns the blocks at the selection into `block`. Returns whether anything was applied. */
  setBlock(block: RichTextBlock): boolean {
    if (block === 'paragraph') return this.run(setBlockCommand('paragraph'))
    if (!(block in BLOCK_OF) || !this.allowed.has(block)) return false
    return this.run(setBlockCommand(BLOCK_OF[block]))
  }

  /** Links the selection (or the link at the caret) to `href`, or removes the link with `null`. Unsafe addresses (`javascript:`) are refused. */
  setLink(href: string | null): boolean {
    const view = this.view
    if (!view || !this.editable || !this.allowed.has('link')) return false
    const { from, to, empty, $from } = view.state.selection
    const range = empty ? markExtent($from, schema.marks.link) : { from, to }
    return this.applyLink(range ?? { from, to }, href)
  }

  /** Removes every inline format and link from the selection. */
  clearFormatting(): boolean {
    const view = this.view
    if (!view || !this.editable) return false
    const { from, to, empty } = view.state.selection
    const tr = view.state.tr
    if (empty) tr.setStoredMarks([])
    else for (const type of Object.values(schema.marks)) tr.removeMark(from, to, type)
    view.dispatch(tr)
    view.focus()
    return true
  }

  /** Inserts plain text at the caret, replacing the selection. */
  insertText(text: string): boolean {
    const view = this.view
    if (!view || !this.editable) return false
    view.dispatch(view.state.tr.insertText(text).scrollIntoView())
    view.focus()
    return true
  }

  /**
   * Replaces the active trigger (`@mai`) with `text` and a space, linked to `href` when one is given. Returns false
   * when no trigger is active.
   */
  completeTrigger(text: string, options: { href?: string } = {}): boolean {
    const view = this.view
    const trigger = this.trigger
    if (!view || !trigger || !this.editable) return false
    const to = view.state.selection.head
    const tr = view.state.tr.insertText(`${text} `, trigger.from, to)
    const href = options.href ? safeHref(options.href) : null
    if (href && this.allowed.has('link')) tr.addMark(trigger.from, trigger.from + text.length, schema.marks.link.create({ href }))
    tr.setStoredMarks([])
    view.dispatch(tr.scrollIntoView())
    view.focus()
    return true
  }

  /** The text as HTML (`p`, `strong`, `em`, `u`, `s`, `code`, `pre`, `a`, `ul`, `ol`, `li`, `blockquote`, `br`), for an email body or a page. */
  toHTML(): string {
    return pageToHTML(this.view?.state.doc ?? this.restrictedDoc(this.value))
  }

  // ---- editor ------------------------------------------------------------------------------------------------------

  private run(command: Command, allowed = true): boolean {
    const view = this.view
    if (!view || !this.editable || !allowed) return false
    const applied = command(view.state, view.dispatch, view)
    view.focus()
    return applied
  }

  /** The shortcut of a format that is not allowed (or in code) still takes the key, so the browser does not apply its own. */
  private markCommand(mark: RichTextMark): Command {
    return (state, dispatch) => {
      if (!this.allowed.has(mark) || state.selection.$from.parent.type.spec.code) return true
      return toggleMarkCommand(schema.marks[mark])(state, dispatch)
    }
  }

  private blockCommand(block: Exclude<RichTextBlock, 'paragraph'>): Command {
    return (state, dispatch) => this.allowed.has(block) && toggleBlock(BLOCK_OF[block])(state, dispatch)
  }

  protected override firstUpdated() {
    this.coarse = matchMedia('(pointer: coarse)').matches
    this.view = new EditorView(
      { mount: this.surface },
      {
        state: this.createState(this.value),
        editable: () => this.editable,
        attributes: () => this.surfaceAttributes(),
        nodeViews: { item: (node, _view, _getPos, decorations) => new ItemView(node, decorations) },
        dispatchTransaction: (tr) => this.handleTransaction(tr),
        handleDOMEvents: {
          keydown: (view, event) => {
            if (event.key !== 'Tab' && event.key !== 'Escape' && event.key !== 'Shift') this.tabReleased = false
            this.syncSelectionFromDom(view)
            // A capture-phase listener of the app (a mention picker) took the key.
            return event.defaultPrevented
          },
          focus: () => {
            this.coarse = matchMedia('(pointer: coarse)').matches
            this.changedSinceFocus = false
            return false
          },
        },
        transformPastedHTML: (html) => {
          this.pastingOwnHtml = html.includes('data-pm-slice')
          return html
        },
        transformPasted: (slice, view, plain) => {
          const own = this.pastingOwnHtml || plain || Boolean(view.dragging)
          this.pastingOwnHtml = false
          const source = own ? slice : splitPastedLines(slice)
          return new Slice(this.restrict(source.content), source.openStart, source.openEnd)
        },
        handlePaste: (view, event) => this.handlePaste(view, event),
        // Files have nowhere to go: dropping one never opens it in place of the page.
        handleDrop: (_view, event) => {
          if (!event.dataTransfer?.files.length) return false
          event.preventDefault()
          return true
        },
        clipboardTextParser: (text) => {
          const content = this.restrict(fromMarkdown(text).content)
          const open = (node: ProseNode | null) => (node && node.type === schema.nodes.paragraph ? 1 : 0)
          return new Slice(content, open(content.firstChild), open(content.lastChild))
        },
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
    this.textLength = docText(this.view.state.doc).length
    this.editorLocale = this.msg.locale
    this.emitFormat()
    this.syncFormState()
    this.resizeObserver = new ResizeObserver(() => this.measureToolbar())
    this.observeToolbar()
  }

  protected override updated(changedProperties: PropertyValues<this>) {
    const changed = changedProperties as Map<PropertyKey, unknown>
    // Read on every update: an enclosing field changes `invalid` without changing a property of this element.
    if ((this.field.invalid || this.overLimit) && !this.disabled && !this.disabledByForm) this.internals.states.add('error')
    else this.internals.states.delete('error')
    const view = this.view
    if (!view) return
    if (changed.has('value') && this.value !== this.serialized) {
      view.updateState(this.createState(this.value))
      this.serialized = toMarkdown(view.state.doc)
      this.textLength = docText(view.state.doc).length
      this.endTrigger()
      this.emitFormat()
    }
    if (changed.has('formats') && changed.get('formats') !== undefined) {
      // Text already written in a format no longer allowed loses it.
      view.updateState(this.createState(toMarkdown(view.state.doc)))
      this.emitFormat()
    }
    if (this.msg.locale !== this.editorLocale) this.editorLocale = this.msg.locale
    // Re-reads `editable`, the surface attributes and the placeholder.
    view.setProps({})
    if (changed.has('toolbarPosition') || changed.has('readOnly') || changed.has('coarse') || changed.has('formats')) this.observeToolbar()
    if (changed.has('focused') || changed.has('selectionEmpty') || changed.has('format') || changed.has('toolbarPosition') || changed.has('linkOpen'))
      this.placeFloatingToolbar()
    this.syncFormState()
  }

  private createState(markdown: string) {
    return EditorState.create({ schema, doc: this.restrictedDoc(markdown), plugins: this.plugins() })
  }

  /** A value read as a document, with what `formats` does not allow turned into text. */
  private restrictedDoc(markdown: string): ProseNode {
    let content = this.restrict(fromMarkdown(markdown).content)
    if (!content.childCount) content = Fragment.from(schema.nodes.paragraph.create())
    if (content.lastChild?.type === schema.nodes.code_block) content = content.append(Fragment.from(schema.nodes.paragraph.create()))
    return schema.nodes.doc.create(null, content)
  }

  /**
   * Blocks and marks `formats` does not allow become text: headings and to-dos become lines (to-dos bullets, when
   * those are allowed), a table its rows, a code block its lines; dividers and images go. Colours never come in.
   */
  private restrict(content: Fragment): Fragment {
    const allowed = this.allowed
    const markAllowed = (mark: Mark) => {
      const name = mark.type.name
      return name === 'link' ? allowed.has('link') : (MARKS as readonly string[]).includes(name) && allowed.has(name as RichTextMark)
    }
    const inline = (fragment: Fragment): Fragment => {
      const nodes: ProseNode[] = []
      fragment.forEach((node) => {
        if (node.isText) nodes.push(node.mark(node.marks.filter(markAllowed)))
        else if (node.isInline) nodes.push(node)
      })
      return Fragment.fromArray(nodes)
    }
    const paragraph = (fragment: Fragment) => schema.nodes.paragraph.create(null, inline(fragment))
    const lines = (text: string) => text.split('\n').map((line) => schema.nodes.paragraph.create(null, line ? schema.text(line) : null))
    const nodes: ProseNode[] = []
    content.forEach((node) => {
      const type = node.type
      if (node.isInline) nodes.push(...(node.isText ? [node.mark(node.marks.filter(markAllowed))] : [node]))
      else if (type === schema.nodes.paragraph || type === schema.nodes.heading) nodes.push(paragraph(node.content))
      else if (type === schema.nodes.item) {
        const kind = node.attrs.kind === 'todo' ? 'bullet' : (node.attrs.kind as 'bullet' | 'ordered')
        if (allowed.has(kind)) nodes.push(schema.nodes.item.create({ kind, indent: node.attrs.indent, checked: false }, inline(node.content)))
        else nodes.push(paragraph(node.content))
      } else if (type === schema.nodes.quote) nodes.push(allowed.has('quote') ? schema.nodes.quote.create(null, inline(node.content)) : paragraph(node.content))
      else if (type === schema.nodes.code_block) nodes.push(...(allowed.has('code-block') ? [node] : lines(node.textContent)))
      else if (type === schema.nodes.table) for (const row of node.attrs.rows as string[][]) nodes.push(...lines(row.filter(Boolean).join(' | ')))
    })
    return Fragment.fromArray(nodes)
  }

  private plugins(): Plugin[] {
    const allowed = this.allowed
    const allowedBlock = (block: PageEditorBlock) =>
      block === 'paragraph' ||
      (block === 'code' ? allowed.has('code-block') : (block === 'bullet' || block === 'ordered' || block === 'quote') && allowed.has(block))
    const ifTabCaptured =
      (command: Command): Command =>
      (state, dispatch, view) =>
        !this.tabReleased && command(state, dispatch, view)
    // Without code blocks, a typed fence stays text: Enter splits the line as usual.
    const enterInBlock: Command = (state, dispatch, view) => {
      const { $from } = state.selection
      if (!allowed.has('code-block') && $from.parent.type === schema.nodes.paragraph && /^```/.test($from.parent.textContent)) return false
      return enterInTextblock(state, dispatch, view)
    }
    const escape: Command = () => {
      if (this.trigger) {
        this.dismissedTrigger = this.trigger.from
        this.endTrigger()
        return true
      }
      // Escape gives Tab back to the page, so the next Tab leaves a list or a code block.
      this.tabReleased = true
      return false
    }
    const placeholder = new Plugin({
      props: {
        decorations: (state) => {
          const only = state.doc.childCount === 1 ? state.doc.firstChild : null
          if (!this.placeholder || !only || only.type !== schema.nodes.paragraph || only.content.size) return null
          return DecorationSet.create(state.doc, [Decoration.node(0, only.nodeSize, { class: 'placeholder', 'data-placeholder': this.placeholder })])
        },
      },
    })

    const linkTargetPlugin = new Plugin<DecorationSet>({
      key: linkTarget,
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, set) => {
          const range = tr.getMeta(linkTarget) as { from: number; to: number } | null | undefined
          if (range === null) return DecorationSet.empty
          if (range && range.from < range.to) return DecorationSet.create(tr.doc, [Decoration.inline(range.from, range.to, { class: 'link-target' })])
          return set.map(tr.mapping, tr.doc)
        },
      },
      props: { decorations: (state) => linkTarget.getState(state) },
    })

    return [
      history(),
      inputRules({
        rules: buildInputRules(allowedBlock, (mark) => this.editable && (mark === 'link' ? allowed.has('link') : allowed.has(mark as RichTextMark))),
      }),
      keymap({
        'Mod-z': undo,
        'Shift-Mod-z': redo,
        'Mod-y': redo,
        'Mod-b': this.markCommand('bold'),
        'Mod-i': this.markCommand('italic'),
        'Mod-u': this.markCommand('underline'),
        'Shift-Mod-x': this.markCommand('strike'),
        'Mod-e': this.markCommand('code'),
        'Mod-k': () => this.openLink(),
        'Mod-\\': () => this.clearFormatting(),
        'Shift-Mod-7': this.blockCommand('ordered'),
        'Shift-Mod-8': this.blockCommand('bullet'),
        'Shift-Mod-9': this.blockCommand('quote'),
        'Mod-Alt-c': this.blockCommand('code-block'),
        'Mod-Enter': () => this.requestSubmit(),
        Enter: chainCommands(enterInCode, enterInItem, enterInBlock),
        'Shift-Enter': lineBreak,
        Backspace: chainCommands(undoInputRule, backspaceAtStart),
        Tab: ifTabCaptured(chainCommands(indentCode(1), indentItems(1))),
        'Shift-Tab': ifTabCaptured(chainCommands(indentCode(-1), indentItems(-1))),
        'Alt-F10': () => this.focusToolbar(),
        Escape: escape,
      }),
      keymap(baseKeymap),
      listNumbering,
      normalize,
      placeholder,
      linkTargetPlugin,
    ]
  }

  private surfaceAttributes(): Record<string, string> {
    const attributes: Record<string, string> = {
      class: 'content',
      part: 'content',
      id: 'content',
      role: 'textbox',
      'aria-multiline': 'true',
    }
    const name = this.label || this.ariaLabel || this.field.label
    if (name) attributes['aria-label'] = name
    const describedBy = this.field.describedBy(this.maxLength >= 0 && !this.field.managed ? 'counter' : null)
    if (describedBy !== nothing) attributes['aria-describedby'] = describedBy
    if (this.field.invalid || this.overLimit) attributes['aria-invalid'] = 'true'
    if (this.placeholder) attributes['aria-placeholder'] = this.placeholder
    if (this.required) attributes['aria-required'] = 'true'
    if (this.readOnly) {
      attributes['aria-readonly'] = 'true'
      // Read-only text is still reachable by keyboard, to read and select.
      attributes.tabindex = '0'
    }
    if (this.disabled || this.disabledByForm) attributes['aria-disabled'] = 'true'
    return attributes
  }

  private handleTransaction(tr: Transaction) {
    const view = this.view!
    view.updateState(view.state.apply(tr))
    if (tr.docChanged) {
      const markdown = toMarkdown(view.state.doc)
      this.textLength = docText(view.state.doc).length
      if (markdown !== this.serialized) {
        this.serialized = markdown
        this.value = markdown
        this.dirty = true
        this.changedSinceFocus = true
        this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      }
    }
    this.selectionEmpty = view.state.selection.empty
    if (tr.docChanged || tr.selectionSet) this.syncTrigger()
    this.emitFormat()
    // A floating toolbar follows the selection as it grows or shrinks.
    if (tr.selectionSet || tr.docChanged) this.placeFloatingToolbar()
  }

  /**
   * ProseMirror learns where a click put the caret from `selectionchange`, which the browser fires asynchronously. A
   * key pressed before it arrives would run against the old selection, so read the real one first.
   */
  private syncSelectionFromDom(view: EditorView) {
    const dom = this.domSelection()
    if (!dom || !view.dom.contains(dom.anchorNode) || !view.dom.contains(dom.focusNode)) return
    try {
      const anchor = view.posAtDOM(dom.anchorNode, dom.anchorOffset)
      const head = view.posAtDOM(dom.focusNode, dom.focusOffset)
      if (view.state.selection.anchor === anchor && view.state.selection.head === head) return
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, head)))
    } catch {
      // A position inside a marker has no text selection; keep ProseMirror's own.
    }
  }

  /**
   * The caret and selection inside the shadow root: `getComposedRanges` where the browser has it, whose `direction`
   * tells the anchor from the focus, else the shadow root's own `getSelection()`.
   */
  private domSelection(): { anchorNode: Node; anchorOffset: number; focusNode: Node; focusOffset: number } | null {
    const root = this.renderRoot as ShadowRoot & { getSelection?: () => Selection | null }
    const selection = document.getSelection() as (Selection & { direction?: string }) | null
    if (selection && typeof selection.getComposedRanges === 'function') {
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

  private handlePaste(view: EditorView, event: ClipboardEvent): boolean {
    const text = event.clipboardData?.getData('text/plain').trim() ?? ''
    const { $from, empty, from, to } = view.state.selection
    // A link pasted over selected text links it.
    if (!empty && this.allowed.has('link') && /^(https?:\/\/|mailto:)\S+$/.test(text) && !$from.parent.type.spec.code) {
      const href = safeHref(text)
      if (href) {
        view.dispatch(view.state.tr.addMark(from, to, schema.marks.link.create({ href })))
        return true
      }
    }
    return false
  }

  private emitFormat() {
    const state = this.view?.state
    if (!state) return
    const { $from, from, to, empty } = state.selection
    const block = blockOfState(state)
    let format: RichTextFormat
    if (empty) format = formatOfMarks(state.storedMarks ?? $from.marks(), block)
    else {
      // A format is active when all of the selected text carries it.
      const formats: RichTextFormat[] = []
      state.doc.nodesBetween(from, to, (node) => {
        if (node.isText) formats.push(formatOfMarks(node.marks, block))
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
        }),
        formats[0] ?? emptyFormat(block),
      )
    }
    const key = JSON.stringify(format)
    if (key === this.formatKey) return
    this.formatKey = key
    this.format = format
    this.dispatchEvent(new CustomEvent<RichTextFormat>('format-change', { detail: { ...format } }))
  }

  private requestSubmit(): boolean {
    const event = new Event('submit', { cancelable: true })
    if (this.dispatchEvent(event)) this.internals.form?.requestSubmit()
    return true
  }

  // ---- triggers -----------------------------------------------------------------------------------------------------

  private syncTrigger() {
    const view = this.view!
    const chars = this.triggers.split(/\s+/).filter(Boolean)
    const { $head, empty } = view.state.selection
    let found: { char: string; query: string; from: number } | null = null
    if (chars.length && empty && this.editable && $head.parent.isTextblock && !$head.parent.type.spec.code) {
      const before = $head.parent.textBetween(Math.max(0, $head.parentOffset - 64), $head.parentOffset, undefined, '￼')
      const escaped = chars.map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
      const match = new RegExp(`(?:^|\\s)(${escaped})([^\\s\\ufffc]*)$`).exec(before)
      if (match) found = { char: match[1], query: match[2], from: $head.pos - match[2].length - match[1].length }
    }
    if (found && found.from === this.dismissedTrigger) found = null
    else if (!found) this.dismissedTrigger = -1
    if (!found) {
      this.endTrigger()
      return
    }
    if (this.trigger && this.trigger.from === found.from && this.trigger.query === found.query) return
    this.trigger = found
    let rect: DOMRect | null
    try {
      const coords = view.coordsAtPos(found.from)
      rect = new DOMRect(coords.left, coords.top, Math.max(1, coords.right - coords.left), coords.bottom - coords.top)
    } catch {
      rect = null
    }
    this.dispatchEvent(new CustomEvent<RichTextTriggerDetail>('trigger', { detail: { active: true, char: found.char, query: found.query, rect } }))
  }

  private endTrigger() {
    const trigger = this.trigger
    if (!trigger) return
    this.trigger = null
    this.dispatchEvent(new CustomEvent<RichTextTriggerDetail>('trigger', { detail: { active: false, char: trigger.char, query: trigger.query, rect: null } }))
  }

  // ---- links --------------------------------------------------------------------------------------------------------

  private applyLink(range: { from: number; to: number }, href: string | null): boolean {
    const view = this.view!
    const safe = href === null ? null : safeHref(href)
    if (href !== null && !safe) return false
    const tr = view.state.tr
    if (safe && range.from === range.to) {
      // Nothing selected: the address itself becomes the linked text.
      tr.insertText(safe, range.from)
      tr.addMark(range.from, range.from + safe.length, schema.marks.link.create({ href: safe }))
    } else {
      tr.removeMark(range.from, range.to, schema.marks.link)
      if (safe) tr.addMark(range.from, range.to, schema.marks.link.create({ href: safe }))
    }
    view.dispatch(tr.scrollIntoView())
    view.focus()
    return true
  }

  private openLink(): boolean {
    const view = this.view
    if (!view || !this.editable || !this.allowed.has('link') || view.state.selection.$from.parent.type.spec.code) return false
    const { from, to, empty, $from } = view.state.selection
    const range = (empty ? markExtent($from, schema.marks.link) : null) ?? { from, to }
    if (range.from !== from || range.to !== to) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to)))
    this.linkRange = range
    this.linkOpen = true
    view.dispatch(view.state.tr.setMeta(linkTarget, range).setMeta('addToHistory', false))
    void this.updateComplete.then(() => {
      const popover = this.linkPopover
      if (!popover.matches(':popover-open')) popover.showPopover()
      const start = view.coordsAtPos(range.from)
      const end = view.coordsAtPos(range.to)
      place(popover, { left: start.left, top: start.top, bottom: Math.max(start.bottom, end.bottom) }, 'below')
      this.linkInput.value = this.format.link ?? ''
      this.linkInput.focus()
      this.linkInput.select()
    })
    return true
  }

  private closeLink(refocus = true) {
    if (!this.linkOpen) return
    this.linkOpen = false
    this.linkRange = null
    const view = this.view
    if (view && !view.isDestroyed) view.dispatch(view.state.tr.setMeta(linkTarget, null).setMeta('addToHistory', false))
    if (this.linkPopover?.matches(':popover-open')) this.linkPopover.hidePopover()
    if (refocus) this.view?.focus()
  }

  private submitLink(event: Event) {
    event.preventDefault()
    const range = this.linkRange
    const value = this.linkInput.value.trim()
    this.closeLink(false)
    if (range) this.applyLink(range, value ? value : null)
    else this.view?.focus()
  }

  private removeLink() {
    const range = this.linkRange
    this.closeLink(false)
    if (range) this.applyLink(range, null)
  }

  private handleLinkKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.closeLink()
    }
  }

  private handleLinkFocusOut(event: FocusEvent) {
    const next = event.relatedTarget as Node | null
    if (next && this.linkPopover.contains(next)) return
    this.closeLink(false)
  }

  // ---- toolbar ------------------------------------------------------------------------------------------------------

  private toolButtons(): HTMLElement[] {
    return [...(this.toolbarEl?.querySelectorAll<HTMLElement>('.tool:not([hidden])') ?? [])]
  }

  private focusToolbar(): boolean {
    if (this.position === 'none') return false
    if (this.position === 'floating') {
      if (this.view?.state.selection.empty) return false
      this.placeFloatingToolbar(true)
    }
    const buttons = this.toolButtons()
    buttons[Math.min(this.rovingIndex, buttons.length - 1)]?.focus()
    return buttons.length > 0
  }

  private handleToolbarKeydown(event: KeyboardEvent) {
    const buttons = this.toolButtons()
    const index = buttons.indexOf((this.renderRoot as ShadowRoot).activeElement as HTMLElement)
    if (index < 0) return
    const move = (to: number) => {
      event.preventDefault()
      this.rovingIndex = (to + buttons.length) % buttons.length
      buttons[this.rovingIndex]?.focus()
    }
    if (event.key === 'ArrowRight') move(index + 1)
    else if (event.key === 'ArrowLeft') move(index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(buttons.length - 1)
    else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.view?.focus()
    }
  }

  private runTool(name: RichTextFormatName) {
    // The browser reports a selection change asynchronously; a click right after one must not act on the old selection.
    if (this.view) this.syncSelectionFromDom(this.view)
    if (name === 'link') {
      this.openLink()
      return
    }
    if ((MARKS as readonly string[]).includes(name)) this.toggleMark(name as RichTextMark)
    else this.run(this.blockCommand(name as Exclude<RichTextBlock, 'paragraph'>))
  }

  private handleMenuSelect(event: CustomEvent<{ value: string }>) {
    event.stopPropagation()
    const name = event.detail.value as RichTextFormatName
    // The menu gives focus back to its trigger as it closes; the text takes it after that.
    setTimeout(() => this.runTool(name))
  }

  private observeToolbar() {
    const observer = this.resizeObserver
    if (!observer) return
    observer.disconnect()
    void this.updateComplete.then(() => {
      if (this.toolbarEl) observer.observe(this.toolbarEl)
      this.measureToolbar()
    })
  }

  /** Moves the tools that do not fit on one line into the "More" menu. */
  private measureToolbar() {
    const toolbar = this.toolbarEl
    if (!toolbar || this.position === 'floating') {
      if (this.overflowFrom !== Infinity) this.overflowFrom = Infinity
      return
    }
    const style = getComputedStyle(toolbar)
    const gap = parseFloat(style.columnGap) || 0
    const end = toolbar.querySelector<HTMLElement>('.toolbar-end')
    const reserved = end?.offsetWidth ? end.offsetWidth + gap : 0
    const available = toolbar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - reserved
    const size = toolbar.querySelector<HTMLElement>('.tool')?.offsetWidth ?? 0
    if (!size || available <= 0) return
    const separator = toolbar.querySelector<HTMLElement>('.separator')
    const separatorWidth = separator ? separator.offsetWidth + parseFloat(getComputedStyle(separator).marginLeft) * 2 : 9
    const entries = this.toolbarEntries
    const widths = entries.map((entry) => (entry.kind === 'tool' ? size : separatorWidth))
    const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, entries.length - 1)
    let from = Infinity
    if (total > available) {
      const room = available - size - gap
      let used = 0
      let tools = 0
      for (let index = 0; index < entries.length; index++) {
        const next = used + widths[index] + (index ? gap : 0)
        if (next > room) break
        used = next
        if (entries[index].kind === 'tool') tools++
      }
      from = tools
    }
    if (from !== this.overflowFrom) this.overflowFrom = from
  }

  private placeFloatingToolbar(force = false) {
    const toolbar = this.toolbarEl
    if (!toolbar || this.position !== 'floating' || !toolbar.hasAttribute('popover')) return
    const view = this.view
    const show = Boolean(view) && this.editable && (force || (this.focused && !this.selectionEmpty)) && !this.linkOpen
    if (!show) {
      if (toolbar.matches(':popover-open')) toolbar.hidePopover()
      return
    }
    if (!toolbar.matches(':popover-open')) toolbar.showPopover()
    const { from, to } = view!.state.selection
    const start = view!.coordsAtPos(from)
    const end = view!.coordsAtPos(to)
    place(toolbar, { left: Math.min(start.left, end.left), top: Math.min(start.top, end.top), bottom: Math.max(start.bottom, end.bottom) }, 'above')
  }

  private handleFocusIn() {
    this.focused = true
  }

  private handleFocusOut() {
    // Once focus has landed: a move into the toolbar, the "More" menu or the link popover keeps the field focused.
    setTimeout(() => {
      const active = (this.renderRoot as ShadowRoot).activeElement
      const inMenu = this.moreMenu?.open ?? false
      if (active || inMenu || this.matches(':focus-within')) return
      this.focused = false
      this.endTrigger()
      if (this.changedSinceFocus) {
        this.changedSinceFocus = false
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
      }
    })
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
    const text = this.view ? docText(this.view.state.doc) : this.text
    if (this.customValidityMessage) {
      flags.customError = true
      message = this.customValidityMessage
    } else if (this.required && !text.trim()) {
      flags.valueMissing = true
      message = this.msg.t('valueMissing')
    } else if (this.maxLength >= 0 && text.length > this.maxLength) {
      flags.tooLong = true
      message = this.msg.t('tooLong', this.maxLength)
    }
    this.internals.setValidity(flags, message, this.surface ?? undefined)
  }

  // ---- rendering --------------------------------------------------------------------------------------------------

  private shortcut(keys: string) {
    const mac = this.modKey === '⌘'
    return keys
      .replace('Mod-', this.modKey)
      .replace('Shift-', mac ? '⇧' : 'Shift+')
      .replace('Alt-', mac ? '⌥' : 'Alt+')
  }

  private pressed(name: RichTextFormatName): boolean {
    const format = this.format
    if ((MARKS as readonly string[]).includes(name)) return format[name as RichTextMark]
    if (name === 'link') return Boolean(format.link)
    return format.block === name
  }

  private renderToolbar(position: RichTextToolbarPosition) {
    const entries = this.toolbarEntries
    const keepFocus = (event: Event) => {
      if (!(event.target as Element).closest('.toolbar-end')) event.preventDefault()
    }
    let toolIndex = 0
    const overflowed: RichTextFormatName[] = []
    const visibleCount = Math.min(this.overflowFrom, entries.filter((entry) => entry.kind === 'tool').length)
    const roving = Math.min(this.rovingIndex, visibleCount + (this.overflowFrom !== Infinity ? 1 : 0) - 1)
    const items = entries.map((entry) => {
      if (entry.kind === 'separator') {
        // A separator is drawn only before a visible tool.
        const hidden = toolIndex >= this.overflowFrom
        return html`<span class="separator" aria-hidden="true" ?hidden=${hidden}></span>`
      }
      const position = toolIndex++
      const spec = TOOLS[entry.name]
      const hidden = position >= this.overflowFrom
      if (hidden) overflowed.push(entry.name)
      const label = this.msg.t(spec.label)
      return html`<button
        type="button"
        class="tool"
        data-format=${entry.name}
        tabindex=${position === roving ? '0' : '-1'}
        aria-label=${label}
        aria-pressed=${spec.toggle ? String(this.pressed(entry.name)) : nothing}
        title=${this.msg.t('withShortcut', label, this.shortcut(spec.keys))}
        ?disabled=${!this.editable}
        ?hidden=${hidden}
        @focus=${() => (this.rovingIndex = position)}
        @click=${() => this.runTool(entry.name)}
      >
        ${spec.content}
      </button>`
    })
    const more = overflowed.length
      ? html`<c2-menu placement="bottom-end" @menu-select=${this.handleMenuSelect}>
          <button
            slot="trigger"
            type="button"
            class="tool more"
            tabindex=${roving === visibleCount ? '0' : '-1'}
            aria-label=${this.msg.t('moreFormatting')}
            title=${this.msg.t('moreFormatting')}
            ?disabled=${!this.editable}
            @focus=${() => (this.rovingIndex = visibleCount)}
          >
            ${ICONS.more}
          </button>
          ${overflowed.map((name) => {
            const spec = TOOLS[name]
            return html`<c2-menu-item value=${name} type=${spec.toggle ? 'checkbox' : 'item'} ?checked=${spec.toggle && this.pressed(name)}>
              ${this.msg.t(spec.label)}
            </c2-menu-item>`
          })}
        </c2-menu>`
      : nothing
    return html`<div
      class="toolbar ${position}"
      part="toolbar"
      role="toolbar"
      aria-label=${this.msg.t('formatting')}
      aria-controls="content"
      popover=${position === 'floating' ? 'manual' : nothing}
      @mousedown=${keepFocus}
      @keydown=${this.handleToolbarKeydown}
    >
      <div class="tools">${items}${more}</div>
      <div class="toolbar-end"><slot name="toolbar-end"></slot></div>
    </div>`
  }

  override render() {
    const position = this.position
    const counterShown = this.maxLength >= 0 && !this.field.managed
    const footerShown = position === 'bottom' || counterShown || this.slotPresence.has('footer-start') || this.slotPresence.has('footer-end')
    const classes = ['container', this.disabledByForm ? 'form-disabled' : '', this.overLimit ? 'over-limit' : ''].filter(Boolean).join(' ')
    return html`
      <div class=${classes} part="container" @focusin=${this.handleFocusIn} @focusout=${this.handleFocusOut}>
        ${position === 'top' ? this.renderToolbar('top') : nothing}
        <div class="editor">
          <div class="content" @input=${this.stopNativeEditing} @beforeinput=${this.stopNativeEditing}></div>
        </div>
        <div class="footer" part="footer" ?hidden=${!footerShown}>
          <slot name="footer-start" @slotchange=${this.slotPresence.handleSlotChange}></slot>
          ${position === 'bottom' ? this.renderToolbar('bottom') : nothing}
          <span class="spacer"></span>
          ${counterShown ? html`<span class="counter" id="counter">${this.msg.t('counter', this.textLength, this.maxLength)}</span>` : nothing}
          <slot name="footer-end" @slotchange=${this.slotPresence.handleSlotChange}></slot>
        </div>
        ${position === 'floating' ? this.renderToolbar('floating') : nothing}
      </div>
      <form
        class="link-popover"
        part="link-popover"
        popover="manual"
        role="dialog"
        aria-label=${this.msg.t('link')}
        @submit=${this.submitLink}
        @keydown=${this.handleLinkKeydown}
        @focusout=${this.handleLinkFocusOut}
      >
        <input class="link-input" type="text" inputmode="url" autocomplete="off" placeholder="https://" aria-label=${this.msg.t('linkAddress')} />
        <button type="submit" class="link-save">${this.msg.t('linkSave')}</button>
        ${
          this.format.link
            ? html`<button type="button" class="link-icon" aria-label=${this.msg.t('linkRemove')} title=${this.msg.t('linkRemove')} @click=${this.removeLink}>
                ${ICONS.close}
              </button>`
            : nothing
        }
      </form>
      ${this.field.renderDescription()}
    `
  }
}

/** A document's text, one block per line. */
function docText(doc: ProseNode): string {
  const lines: string[] = []
  doc.forEach((block) => lines.push(block.textBetween(0, block.content.size, '\n', '\n')))
  return lines.join('\n').replace(/\n+$/, '')
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-rich-text-editor': RichTextEditor
  }
}
