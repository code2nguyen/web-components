import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { Fragment, Slice, type Mark, type MarkType, type Node as ProseNode } from 'prosemirror-model'
import { EditorState, Plugin, TextSelection, type Command, type Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView, type NodeView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, chainCommands, setBlockType, splitBlockAs, toggleMark } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import { InputRule, inputRules, textblockTypeInputRule, undoInputRule } from 'prosemirror-inputrules'
import { fromMarkdown, toMarkdown } from './markdown'
import { HIGHLIGHTS, INKS, MARK_NAMES, colorIndex, emptyFormat, formatOf, schema, type NotepadColor, type NotepadFormat, type NotepadMark } from './schema'
import { NOTEPAD_FONT_FAMILY, loadNotepadFont } from './font'
import styles from './notepad.scss?inline'

export { fromMarkdown, toMarkdown } from './markdown'
export { INKS, HIGHLIGHTS, MARK_NAMES, colorIndex } from './schema'
export type { NotepadColor, NotepadFormat, NotepadHighlight, NotepadInk, NotepadMark } from './schema'
export { NOTEPAD_FONT_FAMILY, loadNotepadFont } from './font'

/** Detail of `check-change`. */
export interface NotepadCheckChangeEventDetail {
  /** Zero-based line number of the checklist item. */
  line: number
  checked: boolean
  /** The item's plain text. */
  text: string
}

/** Detail of `page-tear`. */
export interface NotepadPageTearEventDetail {
  /** The torn page, in the notepad Markdown dialect. */
  value: string
  /** Number of the page that was torn off, starting at 1. */
  page: number
}

/** Kind of pad: each one is a preset of the binding, corners, shadow, spacing and paper colour variables. */
export type NotepadPad = 'notebook' | 'legal' | 'sticky' | 'index-card'
/** Ruling of the page. */
export type NotepadPaper = 'lined' | 'grid' | 'dot' | 'blank'
/** Colour of the page; `default` is `--c2-notepad__sheet--background`. */
export type NotepadPaperColor = 'default' | 'yellow' | 'green' | 'blue' | 'pink' | 'night'
/** Side of the "Paper" and "Tear off" buttons the `actions` slot sits on. */
export type NotepadActionsPlacement = 'start' | 'end'
export const PADS: readonly NotepadPad[] = ['notebook', 'legal', 'sticky', 'index-card']
export const PAPERS: readonly NotepadPaper[] = ['lined', 'grid', 'dot', 'blank']
export const PAPER_COLORS: readonly NotepadPaperColor[] = ['default', 'yellow', 'green', 'blue', 'pink', 'night']

/** Detail of `paper-change`. */
export interface NotepadPaperChangeEventDetail {
  pad: NotepadPad
  paper: NotepadPaper
  paperColor: NotepadPaperColor
}

/** Events fired by {@link Notepad}, keyed for `addEventListener`. */
export interface NotepadEventMap {
  input: Event
  change: Event
  'format-change': CustomEvent<NotepadFormat>
  'check-change': CustomEvent<NotepadCheckChangeEventDetail>
  'page-tear': CustomEvent<NotepadPageTearEventDetail>
  'paper-change': CustomEvent<NotepadPaperChangeEventDetail>
}

export interface Notepad {
  addEventListener: TypedAddEventListener<Notepad, NotepadEventMap>
  removeEventListener: TypedRemoveEventListener<Notepad, NotepadEventMap>
}

/**
 * The lists used while `inks` / `highlights` are unset, in the order a page stores them (`data-ink="3"` is red): the
 * documented `--c2-notepad__ink-*` and `--c2-notepad__highlight-*` variables. Spread them to extend the defaults.
 */
export const DEFAULT_INKS: readonly NotepadColor[] = [
  { name: 'Blue ink', value: 'var(--c2-notepad__ink-blue--color, #2848b8)' },
  { name: 'Black ink', value: 'var(--c2-notepad__ink-black--color, #18181b)' },
  { name: 'Red ink', value: 'var(--c2-notepad__ink-red--color, #b8232b)' },
  { name: 'Green ink', value: 'var(--c2-notepad__ink-green--color, #22743a)' },
]
export const DEFAULT_HIGHLIGHTS: readonly NotepadColor[] = [
  { name: 'Yellow highlighter', value: 'var(--c2-notepad__highlight-yellow--background, rgba(255, 214, 64, 0.55))' },
  { name: 'Green highlighter', value: 'var(--c2-notepad__highlight-green--background, rgba(110, 220, 120, 0.4))' },
  { name: 'Pink highlighter', value: 'var(--c2-notepad__highlight-pink--background, rgba(255, 120, 170, 0.38))' },
]
/** Position of the default black ink, which on night paper becomes the paper's own ink rather than a lifted grey. */
const DEFAULT_BLACK_INK = 2

/** A colour of a list as the toolbar uses it: a value, and the name its swatch is announced and titled with. */
interface NamedColor {
  name: string
  value: string
}

const isColor = (entry: unknown): entry is NotepadColor =>
  (typeof entry === 'string' && entry.trim() !== '') ||
  (typeof entry === 'object' && entry !== null && typeof (entry as { value?: unknown }).value === 'string')

/**
 * A usable list, or the defaults: a malformed attribute must not leave the writer without colours. An entry with no
 * name is called by its kind and position (`Ink 2`), so a swatch always has an accessible name.
 */
const colorList = (value: unknown, defaults: readonly NotepadColor[], kind: string): readonly NamedColor[] => {
  const list = Array.isArray(value) && value.some(isColor) ? (value as unknown[]) : defaults
  return list
    .filter(isColor)
    .map((entry, position) =>
      typeof entry === 'string'
        ? { name: `${kind} ${position + 1}`, value: entry }
        : { name: entry.name?.trim() || `${kind} ${position + 1}`, value: entry.value },
    )
}

const PAD_LABELS: Record<NotepadPad, string> = {
  notebook: 'Notebook',
  legal: 'Legal pad',
  sticky: 'Sticky note',
  'index-card': 'Index card',
}
/** Name of the `default` paper colour, which is the pad's own colour. */
const PAD_COLOR_LABELS: Record<NotepadPad, string> = {
  notebook: 'White',
  legal: 'Canary',
  sticky: 'Lemon',
  'index-card': 'Card',
}
const PAPER_LABELS: Record<NotepadPaper, string> = { lined: 'Lined', grid: 'Grid', dot: 'Dot grid', blank: 'Blank' }
const PAPER_COLOR_LABELS: Record<Exclude<NotepadPaperColor, 'default'>, string> = {
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  pink: 'Pink',
  night: 'Night',
}
/** Each paper colour is a pair: the sheet and the ink written on it. */
const PAPER_SWATCHES: Record<NotepadPaperColor, string> = {
  default: '--_swatch: var(--_pad-paper); --_swatch-ink: var(--c2-notepad__writing--color, #1e2a4a)',
  yellow: '--_swatch: var(--c2-notepad__paper-yellow--background, #fcf0bf); --_swatch-ink: var(--c2-notepad__paper-yellow--color, #2b2410)',
  green: '--_swatch: var(--c2-notepad__paper-green--background, #e8f3e4); --_swatch-ink: var(--c2-notepad__paper-green--color, #1d3324)',
  blue: '--_swatch: var(--c2-notepad__paper-blue--background, #e6eef9); --_swatch-ink: var(--c2-notepad__paper-blue--color, #1c2a4a)',
  pink: '--_swatch: var(--c2-notepad__paper-pink--background, #fbe6ea); --_swatch-ink: var(--c2-notepad__paper-pink--color, #3d1f2b)',
  night: '--_swatch: var(--c2-notepad__paper-night--background, #232a33); --_swatch-ink: var(--c2-notepad__paper-night--color, #e9e4d4)',
}
/** Hover-card timing: a short delay before opening so passing over the button does not flash the card. */
/** Range of the random tilt of a sticky note, in degrees either way. */
const STICKY_TILT_MIN = 1
const STICKY_TILT_MAX = 4
const HOVER_OPEN_DELAY = 150
const HOVER_CLOSE_DELAY = 250

const BOX = `<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M3.5 4.2c4.6-.6 10-.5 15 .2.6 4.5.5 9.6-.2 14.2-4.8.5-9.9.6-14.6.1-.6-4.7-.6-9.7-.2-14.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path class="tick" d="M5.5 11.5l4 4.2L19 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const textLength = (doc: ProseNode) => doc.textContent.length

/** Wraps `inner` in the mark when the typed delimiter closes it: `**bold**`, `*italic*`, `~~strike~~`, `==hi==`. */
function markRule(pattern: RegExp, open: number, mark: () => Mark, enabled: () => boolean): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    if (!enabled()) return null
    const [whole, lead = '', inner] = match
    const from = start + lead.length
    const innerFrom = from + open
    const innerTo = innerFrom + inner.length
    if (innerTo > end) return null
    const tr = state.tr
    // The last delimiter character is the one being typed and is not in the document yet.
    tr.delete(innerTo, Math.min(end, from + whole.length - lead.length - 1))
    tr.delete(from, innerFrom)
    const created = mark()
    tr.addMark(from, from + inner.length, created)
    tr.removeStoredMark(created.type)
    return tr
  })
}

class TaskView implements NodeView {
  readonly dom: HTMLElement
  readonly contentDOM: HTMLElement
  private readonly box: HTMLElement
  private node: ProseNode

  constructor(node: ProseNode, getPos: () => number | undefined, toggle: (pos: number) => void) {
    this.node = node
    this.dom = document.createElement('div')
    this.dom.className = 'task'
    this.box = document.createElement('span')
    this.box.className = 'box'
    this.box.contentEditable = 'false'
    this.box.setAttribute('role', 'checkbox')
    this.box.setAttribute('aria-label', 'Done')
    // The SVG is a static Lit template; render its markup once.
    this.box.innerHTML = BOX
    this.box.addEventListener('mousedown', (event) => event.preventDefault())
    this.box.addEventListener('click', (event) => {
      event.preventDefault()
      const pos = getPos()
      if (pos !== undefined) toggle(pos)
    })
    this.contentDOM = document.createElement('span')
    this.contentDOM.className = 'task-text'
    this.dom.append(this.box, this.contentDOM)
    this.sync()
  }

  update(node: ProseNode) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.sync()
    return true
  }

  private sync() {
    const checked = String(this.node.attrs.checked)
    this.dom.dataset.checked = checked
    this.box.setAttribute('aria-checked', checked)
  }

  stopEvent(event: Event) {
    return this.box.contains(event.target as Node)
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }) {
    return mutation.type !== 'selection' && !this.contentDOM.contains(mutation.target)
  }
}

/**
 * A rich-text notepad that reads as a sheet of paper: handwriting on ruled lines, a margin, a spiral binding and
 * paper grain. Selecting text opens a formatting toolbar drawn as a strip of washi tape (bold, italic, underline,
 * strikethrough, and one button each for the four inks and the three highlighters). Lines written as `[ ] ` become checklist items, and a tearable pad
 * can have its page torn off. The value is plain, line-based Markdown, and the element is a form control.
 *
 * The paper is presentation, so it is set entirely through CSS variables: set `--c2-notepad__grid--color` for graph
 * paper, `--c2-notepad__dot--color` (with `--c2-notepad__rule--color: transparent`) for a dot grid, and swap
 * `--c2-notepad__spiral--display` / `--c2-notepad__glue--display` for a glued legal pad. `pad` picks a ready-made
 * preset of those variables (notebook, legal pad, sticky note, index card); a variable set on the element
 * still wins over the preset.
 *
 * The handwriting face is Patrick Hand (SIL Open Font License 1.1), bundled and registered with `document.fonts`
 * only when the writing surface uses it.
 *
 * @tag c2-notepad
 * @slot header - Printed heading at the top of the sheet, e.g. a title or a date.
 * @slot margin - Content placed in the left margin column, such as a badge or a doodle.
 * @slot toolbar - Extra buttons appended to the selection toolbar.
 * @slot actions - Buttons at the top of the sheet, in the row of the "Paper" and "Tear off" buttons, e.g. a delete or a share button for the note. `actions-placement` puts them before (default) or after those buttons. A slotted `c2-icon-button` is shrunk to the height of that row.
 * @event {Event} input - Fired on each edit, after `value` is updated.
 * @event {Event} change - Fired when the notepad loses focus after its value changed, and after a page is torn off.
 * @event {CustomEvent<NotepadFormat>} format-change - Fired when the formatting at the selection changes. Does not bubble.
 * @event {CustomEvent<NotepadCheckChangeEventDetail>} check-change - Fired when a checklist item is ticked or unticked. Does not bubble.
 * @event {CustomEvent<NotepadPageTearEventDetail>} page-tear - Fired before a page is torn off; cancel it to keep the page. Does not bubble.
 * @event {CustomEvent<NotepadPaperChangeEventDetail>} paper-change - Fired when the writer picks another pad, ruling or paper colour in the paper picker. Does not bubble.
 * @csspart sheet - The paper sheet.
 * @csspart writing - The editable writing surface.
 * @csspart toolbar - The selection formatting toolbar.
 * @csspart tear-button - The "Tear off" button of a tearable pad.
 * @csspart paper-button - The "Paper" button that opens the paper picker.
 * @csspart paper-menu - The paper picker: pads, rulings and paper colours.
 * @csspart actions - Wrapper of the `actions` slot; assigned buttons keep their own styles.
 *
 * @cssproperty {color} [--c2-notepad__sheet--background=#fdfcf7] - Paper colour.
 * @cssproperty {border-radius} [--c2-notepad__sheet--border-radius=3px]
 * @cssproperty {box-shadow} [--c2-notepad__sheet--box-shadow=0 1px 2px rgba(24, 24, 27, 0.12), 0 10px 24px rgba(24, 24, 27, 0.1)]
 * @cssproperty {box-shadow} [--c2-notepad__sheet__focus--box-shadow=0 1px 2px rgba(24, 24, 27, 0.14), 0 16px 32px rgba(24, 24, 27, 0.16)] - The sheet lifts while it has focus.
 * @cssproperty {pixel} [--c2-notepad__sheet--min-height=224px]
 * @cssproperty {length} [--c2-notepad__sheet--max-height=none] - Past this height the page scrolls; the rules scroll with it.
 * @cssproperty {number} [--c2-notepad__texture--opacity=0.5] - Strength of the paper grain; 0 turns it off.
 * @cssproperty {pixel} [--c2-notepad__rule--spacing=28px] - Distance between ruled lines, which is also the line height (college ruled).
 * @cssproperty {color} [--c2-notepad__rule--color=#c3d3ea] - Horizontal rules; transparent for blank or dot paper.
 * @cssproperty {color} [--c2-notepad__grid--color=transparent] - Vertical rules; set it for graph paper.
 * @cssproperty {color} [--c2-notepad__dot--color=transparent] - Dot grid; set it for dotted paper.
 * @cssproperty {pixel} [--c2-notepad__margin--inset=56px] - Distance of the margin line from the left edge.
 * @cssproperty {color} [--c2-notepad__margin--color=#eba6a6] - Margin line; transparent to remove it.
 * @cssproperty {pixel} [--c2-notepad__margin--gap=0px] - Distance of a second margin line inside the first, as on a legal pad; 0 draws one line.
 * @cssproperty {color} [--c2-notepad__headline--color=transparent] - Rule under the top of the sheet, as on an index card.
 * @cssproperty {color} [--c2-notepad__writing--color=#1e2a4a] - Default ink.
 * @cssproperty {font-family} [--c2-notepad__writing--font-family='C2 Notepad Hand', 'Patrick Hand', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive]
 * @cssproperty {font-size} [--c2-notepad__writing--font-size=18px]
 * @cssproperty {color} [--c2-notepad__placeholder--color=#8a909b] - Placeholder, written in faint pencil.
 * @cssproperty {color} [--c2-notepad__selection--background=rgba(255, 214, 64, 0.45)] - Selected text.
 * @cssproperty {color} [--c2-notepad__header--color=#7a8494]
 * @cssproperty {font-size} [--c2-notepad__header--font-size=12px]
 * @cssproperty {display} [--c2-notepad__spiral--display=block] - Spiral binding; none to remove it.
 * @cssproperty {display} [--c2-notepad__glue--display=none] - Glued top binding of a legal pad; block to show it.
 * @cssproperty {color} [--c2-notepad__glue--background=#3f444b]
 * @cssproperty {angle} [--c2-notepad__sheet--rotate=0deg] - Tilt of the sheet. A sticky note leans by a random angle (1°–4° either way, picked again each time the pad becomes a sticky note) unless this is set; 0deg keeps it straight.
 * @cssproperty {pixel} [--c2-notepad__top--padding-top=20px] - Space above the header row, which clears the spiral binding.
 * @cssproperty {opacity} [--c2-notepad__controls--opacity=1] - Opacity of the "Paper" button, the "Tear off" button and the `actions` slot while the notepad is neither hovered nor focused. Set it to 0 to show them only on the note being pointed at or written in (on a touch screen, once the writer taps into it), and while the paper picker is open.
 * @cssproperty {color} [--c2-notepad__ink-blue--color=#2848b8]
 * @cssproperty {color} [--c2-notepad__ink-black--color=#18181b]
 * @cssproperty {color} [--c2-notepad__ink-red--color=#b8232b]
 * @cssproperty {color} [--c2-notepad__ink-green--color=#22743a]
 * @cssproperty {color} [--c2-notepad__highlight-yellow--background=rgba(255, 214, 64, 0.55)]
 * @cssproperty {color} [--c2-notepad__highlight-green--background=rgba(110, 220, 120, 0.4)]
 * @cssproperty {color} [--c2-notepad__highlight-pink--background=rgba(255, 120, 170, 0.38)]
 * @cssproperty {number} [--c2-notepad__task__checked--opacity=0.55] - Opacity of a ticked checklist item.
 * @cssproperty {color} [--c2-notepad__toolbar--background=#efe6cc] - The washi tape of the selection toolbar.
 * @cssproperty {color} [--c2-notepad__toolbar--color=#2c2a26]
 * @cssproperty {color} [--c2-notepad__toolbar__button__active--background=rgba(60, 50, 30, 0.14)]
 * @cssproperty {color} [--c2-notepad__perforation--color=#b9bfc8] - Perforated line of a tearable pad.
 * @cssproperty {color} [--c2-notepad__paper-yellow--background=#fcf0bf] - Sheet colour for `paper-color="yellow"`.
 * @cssproperty {color} [--c2-notepad__paper-yellow--color=#2b2410] - Ink colour for `paper-color="yellow"`.
 * @cssproperty {color} [--c2-notepad__paper-green--background=#e8f3e4] - Sheet colour for `paper-color="green"`.
 * @cssproperty {color} [--c2-notepad__paper-green--color=#1d3324] - Ink colour for `paper-color="green"`.
 * @cssproperty {color} [--c2-notepad__paper-blue--background=#e6eef9] - Sheet colour for `paper-color="blue"`.
 * @cssproperty {color} [--c2-notepad__paper-blue--color=#1c2a4a] - Ink colour for `paper-color="blue"`.
 * @cssproperty {color} [--c2-notepad__paper-pink--background=#fbe6ea] - Sheet colour for `paper-color="pink"`.
 * @cssproperty {color} [--c2-notepad__paper-pink--color=#3d1f2b] - Ink colour for `paper-color="pink"`.
 * @cssproperty {color} [--c2-notepad__paper-night--background=#232a33] - Sheet colour for `paper-color="night"`.
 * @cssproperty {color} [--c2-notepad__paper-night--color=#e9e4d4] - Ink colour for `paper-color="night"`.
 * @cssproperty {color} [--c2-notepad__pad-legal--background=#fbf1a6] - Sheet colour of `pad="legal"`.
 * @cssproperty {color} [--c2-notepad__pad-sticky--background=#ffe680] - Sheet colour of `pad="sticky"`.
 * @cssproperty {color} [--c2-notepad__pad-index-card--background=#ffffff] - Sheet colour of `pad="index-card"`.
 * @cssproperty {color} [--c2-notepad__error--color=#dc2626] - Error note and margin of an invalid notepad.
 * @cssproperty {outline} [--c2-notepad__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {opacity} [--c2-notepad__disabled--opacity=0.38]
 * @cssproperty {time} [--c2-notepad__tear--duration=700ms] - Length of the tear-off animation.
 */
@customElement('c2-notepad')
export class Notepad extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  /** The page, in the notepad Markdown dialect: one line per line, `- [ ]` checklist items, `**bold**`, `*italic*`, `~~strike~~`, `==highlight==`, `<u>`, `<span data-ink>` and `<mark data-color>`. */
  @property() value = ''
  /** Name submitted with the form. */
  @property() name = ''
  /** Accessible name of the writing surface. */
  @property() label = ''
  /** Accessible name forwarded from the host. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null
  /** Text written in faint pencil while the page is empty. */
  @property() placeholder = ''
  /** Prevents editing and removes the notepad from keyboard navigation. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Prevents editing while allowing selection. */
  @property({ type: Boolean, reflect: true }) readOnly = false
  /** Requires some text for form validation. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Maximum number of characters of plain text; -1 means unlimited. */
  @property({ type: Number }) maxLength = -1
  /** Shows the error margin and error note. */
  @property({ type: Boolean, reflect: true }) error = false
  /** Note written in red pen when `error` is set. */
  @property({ attribute: 'error-text' }) errorText = ''
  /** `auto` opens the formatting toolbar over a selection; `none` keeps the keyboard shortcuts and hides it. */
  @property() toolbar: 'auto' | 'none' = 'auto'
  /** Space-separated formats the writer may apply (`bold italic underline strike ink highlight`). Pasted formatting outside the list is dropped. Empty allows all. */
  @property() marks = ''
  /** Adds a perforated top edge with a "Tear off" button and a stack of sheets underneath. */
  @property({ type: Boolean, reflect: true }) tearable = false
  /** Number of the current page; it goes up by one each time a page is torn off. */
  @property({ type: Number }) page = 1
  /** Kind of pad: `notebook`, `legal`, `sticky` or `index-card`. Each is a preset of the paper's CSS variables. The writer changes it through the paper picker. */
  @property({ reflect: true }) pad: NotepadPad = 'notebook'
  /** Ruling of the page: `lined`, `grid`, `dot` or `blank`. The writer changes it through the paper picker. */
  @property({ reflect: true }) paper: NotepadPaper = 'lined'
  /** Colour of the page and its ink: `default`, `yellow`, `green`, `blue`, `pink` or `night`. The writer changes it through the paper picker. */
  @property({ attribute: 'paper-color', reflect: true }) paperColor: NotepadPaperColor = 'default'
  /**
   * The inks of the toolbar: each entry a CSS colour (`var()` included), or `{ value, name }` to give its swatch a
   * friendly name (`{ "value": "#b91c1c", "name": "Alert" }`); without one it is called `Ink 2`. The page stores an ink
   * by its 1-based position in this list (`<span data-ink="2">`), so give a dark theme a list of the same length and
   * order and the whole page recolours. Unset, the four documented `--c2-notepad__ink-*` inks. A list you give is used
   * as given: its contrast on the paper is yours to choose.
   */
  @property({ converter: jsonPropertyConverter }) inks?: NotepadColor[]
  /** The highlighters of the toolbar, as colours or `{ value, name }` entries, stored by position like `inks`. `==text==` is the first one. Unset, the three documented `--c2-notepad__highlight-*` highlighters. */
  @property({ converter: jsonPropertyConverter }) highlights?: NotepadColor[]
  /** Adds a "Paper" button to the top of the sheet, which lets the writer choose the pad, the ruling and the paper colour. */
  @property({ type: Boolean, attribute: 'paper-picker', reflect: true }) paperPicker = false
  /** Side of the "Paper" and "Tear off" buttons the `actions` slot sits on: `start` (before them, the default) or `end` (after them). The keyboard order follows. */
  @property({ attribute: 'actions-placement' }) actionsPlacement: NotepadActionsPlacement = 'start'

  @state() private format: NotepadFormat = emptyFormat()
  @state() private disabledByForm = false
  /** Focus came from a pointer, so the keyboard focus ring stays off. */
  @state() private pointerFocus = false
  /** Colour group whose flyout was opened by a click, a tap or the keyboard (hover opens it through CSS). */
  @state() private openGroup: 'ink' | 'highlight' | null = null
  /** Group whose colour was just picked by pointer: its hover flyout stays shut until the pointer leaves. */
  @state() private pickedGroup: 'ink' | 'highlight' | null = null

  @query('.writing') private surface!: HTMLElement
  @query('.toolbar') private toolbarEl!: HTMLElement
  @query('.sheet') private sheet!: HTMLElement
  @query('.paper-menu') private paperMenu?: HTMLElement
  @query('.paper-button') private paperButton?: HTMLElement
  @state() private paperMenuOpen = false
  /** Opened by a click, a tap or the keyboard, so it stays open when the pointer leaves. */
  private paperMenuPinned = false
  private hoverTimer?: ReturnType<typeof setTimeout>
  /** Pending frame of a scroll or resize while a popover is open. */
  private viewportFrame = 0
  private followingViewport = false

  private view?: EditorView
  private readonly slotPresence = new SlotPresenceController(this, ['header', 'actions'])
  /** The value the editor last produced, so writing it back (v-model) does not reset the page. */
  private serialized = ''
  private dirty = false
  private changedSinceFocus = false
  private customValidityMessage = ''
  private dismissedSelection: { from: number; to: number } | null = null
  private formatKey = ''

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
  /** The page as plain text, one line per line, without formatting or checklist markers. */
  get text(): string {
    const doc = this.view?.state.doc ?? fromMarkdown(this.value)
    const lines: string[] = []
    doc.forEach((block) => lines.push(block.textContent))
    return lines.join('\n')
  }

  private get allowedMarks(): Set<NotepadMark> {
    const listed = this.marks.split(/\s+/).filter((name): name is NotepadMark => MARK_NAMES.includes(name as NotepadMark))
    return new Set(listed.length ? listed : MARK_NAMES)
  }

  private get editable() {
    return !this.disabled && !this.disabledByForm && !this.readOnly
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    // The `value` attribute is the default value; once the writer has edited, it no longer drives the page.
    if (name === 'value' && this.dirty) return
    super.attributeChangedCallback(name, oldValue, newValue)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.hideToolbar()
    this.followViewport(false)
  }

  // ---- popovers follow their anchor ----------------------------------------------------------------------------
  // The toolbar and the paper card are fixed-position popovers in the top layer, placed in viewport coordinates.
  // While one is open, a scroll anywhere (the page, a scrolling ancestor, a sheet with a max height) or a resize
  // moves its anchor, so it is placed again on the next frame.

  private readonly handleViewportChange = () => {
    if (this.viewportFrame) return
    this.viewportFrame = requestAnimationFrame(() => {
      this.viewportFrame = 0
      if (this.toolbarEl?.matches(':popover-open')) this.updateToolbar()
      if (this.paperMenu?.matches(':popover-open')) this.placePaperMenu()
    })
  }

  private followViewport(follow: boolean) {
    if (follow === this.followingViewport) return
    this.followingViewport = follow
    const method = follow ? 'addEventListener' : 'removeEventListener'
    // Capture: scroll does not bubble, and the scrolling element may be any ancestor or the sheet itself.
    window[method]('scroll', this.handleViewportChange, { capture: true, passive: true } as AddEventListenerOptions)
    window[method]('resize', this.handleViewportChange)
    if (!follow && this.viewportFrame) {
      cancelAnimationFrame(this.viewportFrame)
      this.viewportFrame = 0
    }
  }

  private handlePopoverToggle() {
    this.followViewport(Boolean(this.toolbarEl?.matches(':popover-open') || this.paperMenu?.matches(':popover-open')))
  }

  /** Focuses the writing surface. */
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
  /** Restores the `value` attribute and clears the error state. */
  reset() {
    this.dirty = false
    this.value = this.getAttribute('value') ?? ''
    this.error = false
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

  /**
   * Applies a format to the selection, or to what is typed next when nothing is selected. Bold, italic, underline
   * and strike toggle. For `ink` and `highlight`, pass the colour's 1-based position in `inks` / `highlights` (a
   * default colour's name such as `red` also works) to apply it, or `null` to remove it; with no colour the first one
   * is toggled. Returns whether anything was applied.
   */
  formatSelection(mark: NotepadMark, color?: number | string | null): boolean {
    const view = this.view
    if (!view || !this.editable || !this.allowedMarks.has(mark)) return false
    const type = schema.marks[mark]
    if (mark !== 'ink' && mark !== 'highlight') {
      const applied = toggleMark(type)(view.state, view.dispatch)
      view.focus()
      return applied
    }
    const current = this.format[mark]
    let next: number | null
    if (color === undefined) next = current ? null : 1
    else if (color === null) next = null
    else {
      const index = colorIndex(color, mark === 'ink' ? INKS : HIGHLIGHTS)
      if (!index || index > this.colorsOf(mark).length) return false
      next = index === current ? null : index
    }
    this.applyColorMark(view, type, next)
    view.focus()
    return true
  }

  /** Removes every format from the selection. */
  clearFormatting(): boolean {
    const view = this.view
    if (!view || !this.editable) return false
    const { from, to, empty } = view.state.selection
    const tr = view.state.tr
    if (empty) tr.setStoredMarks([])
    else for (const name of MARK_NAMES) tr.removeMark(from, to, schema.marks[name])
    view.dispatch(tr)
    view.focus()
    return true
  }

  /**
   * Tears the page off: fires a cancelable `page-tear` with the page's value, plays the tear (skipped under
   * reduced motion), clears the page and turns to the next one. Resolves to the torn value, or `null` when the
   * notepad is not editable or the event was cancelled. The page stays undoable with Ctrl/⌘ Z.
   */
  async tearOff(): Promise<string | null> {
    const view = this.view
    if (!view || !this.editable) return null
    const value = this.value
    const detail: NotepadPageTearEventDetail = { value, page: this.page }
    if (!this.dispatchEvent(new CustomEvent('page-tear', { detail, cancelable: true }))) return null
    this.hideToolbar()
    const animation = this.animateTear()
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, schema.nodes.line.create())
    tr.setSelection(TextSelection.create(tr.doc, 1))
    view.dispatch(tr)
    this.page += 1
    this.changedSinceFocus = false
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    await animation
    return value
  }

  protected override firstUpdated() {
    this.view = new EditorView(
      { mount: this.surface },
      {
        state: this.createState(this.value),
        editable: () => this.editable,
        attributes: () => this.surfaceAttributes(),
        nodeViews: { task: (node, _view, getPos) => new TaskView(node, getPos, (pos) => this.toggleTask(pos)) },
        dispatchTransaction: (tr) => this.handleTransaction(tr),
        handleDOMEvents: {
          keydown: (view, event) => {
            if (!event.isComposing) this.syncSelectionFromDom(view)
            return false
          },
          focus: () => {
            this.changedSinceFocus = false
            this.updateToolbar()
            return false
          },
        },
        transformPasted: (slice) => this.filterSlice(slice),
        handlePaste: (view, _event, slice) => {
          // Pasted onto an empty line, the pasted lines replace it whole, so a checklist item stays a checklist item.
          const { $from, empty } = view.state.selection
          if (!empty || $from.parent.content.size > 0 || slice.content.firstChild?.type !== schema.nodes.task) return false
          const tr = view.state.tr.replaceWith($from.before(), $from.after(), slice.content)
          view.dispatch(tr.scrollIntoView())
          return true
        },
        clipboardTextParser: (text) => this.parsePastedText(text),
        clipboardTextSerializer: (slice) => {
          try {
            return toMarkdown(schema.nodes.doc.create(null, slice.content))
          } catch {
            return slice.content.textBetween(0, slice.content.size, '\n')
          }
        },
      },
    )
    this.serialized = toMarkdown(this.view.state.doc)
    if (getComputedStyle(this.surface).fontFamily.includes(NOTEPAD_FONT_FAMILY)) void loadNotepadFont()
    this.syncFormState()
  }

  protected override updated(changed: PropertyValues<this>) {
    // Each time the pad becomes a sticky note it is stuck on again, at a new angle: 1°–4° either way, never quite
    // straight. The angle is set inside the shadow root, not on the host, and only applies under pad="sticky".
    if (changed.has('pad') && this.pad === 'sticky') {
      const tilt = (STICKY_TILT_MIN + Math.random() * (STICKY_TILT_MAX - STICKY_TILT_MIN)) * (Math.random() < 0.5 ? -1 : 1)
      this.renderRoot.querySelector<HTMLElement>('.pad')?.style.setProperty('--_tilt', `${tilt.toFixed(1)}deg`)
    }
    const view = this.view
    if (!view) return
    if (changed.has('value') && this.value !== this.serialized) {
      view.updateState(this.createState(this.value))
      this.serialized = this.value
      this.emitFormat()
    }
    const surfaceInputs = ['label', 'ariaLabel', 'placeholder', 'disabled', 'readOnly', 'required', 'error', 'errorText', 'disabledByForm']
    if (surfaceInputs.some((key) => (changed as Map<PropertyKey, unknown>).has(key))) {
      // Re-reads `editable`, the surface attributes and the placeholder decoration.
      view.setProps({})
      if (!this.editable) this.hideToolbar()
    }
    if (changed.has('toolbar') || changed.has('marks')) this.updateToolbar()
    this.syncFormState()
  }

  private createState(markdown: string) {
    return EditorState.create({ schema, doc: fromMarkdown(markdown), plugins: this.plugins() })
  }

  private plugins(): Plugin[] {
    const allowed =
      (mark: NotepadMark): Command =>
      (state, dispatch) =>
        this.allowedMarks.has(mark) ? toggleMark(schema.marks[mark])(state, dispatch) : false
    const task = schema.nodes.task
    const line = schema.nodes.line
    const inTask: Command = (state) => state.selection.$from.parent.type === task
    const enterTask: Command = (state, dispatch) => {
      if (!inTask(state)) return false
      // An empty checklist item ends the list, as in every notes app.
      if (state.selection.empty && state.selection.$from.parent.content.size === 0) return setBlockType(line)(state, dispatch)
      return splitBlockAs(() => ({ type: task, attrs: { checked: false } }))(state, dispatch)
    }
    const backspaceTask: Command = (state, dispatch) => {
      const { $from, empty } = state.selection
      if (!empty || $from.parent.type !== task || $from.parentOffset > 0) return false
      return setBlockType(line)(state, dispatch)
    }
    const toggleChecked: Command = (state, dispatch) => {
      const { $from } = state.selection
      if ($from.parent.type !== task || !this.editable) return false
      if (dispatch) this.toggleTask($from.before())
      return true
    }
    const toggleTaskLine: Command = (state, dispatch) => {
      const type = state.selection.$from.parent.type === task ? line : task
      return setBlockType(type, type === task ? { checked: false } : undefined)(state, dispatch)
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

    const enabled = (mark: NotepadMark) => () => this.editable && this.allowedMarks.has(mark)
    const rules = [
      textblockTypeInputRule(/^(?:[-*+]\s)?\[([ xX]?)\]\s$/, task, (match) => ({ checked: /x/i.test(match[1]) })),
      markRule(/()\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, 2, () => schema.marks.bold.create(), enabled('bold')),
      markRule(/(^|[^*])\*([^*\s](?:[^*]*[^*\s])?)\*$/, 1, () => schema.marks.italic.create(), enabled('italic')),
      markRule(/()~~([^~\s](?:[^~]*[^~\s])?)~~$/, 2, () => schema.marks.strike.create(), enabled('strike')),
      markRule(/()==([^=\s](?:[^=]*[^=\s])?)==$/, 2, () => schema.marks.highlight.create({ color: 1 }), enabled('highlight')),
    ]

    const placeholder = new Plugin({
      props: {
        decorations: (state) => {
          const first = state.doc.firstChild
          if (!this.placeholder || state.doc.childCount !== 1 || !first || first.content.size > 0) return null
          return DecorationSet.create(state.doc, [Decoration.node(0, first.nodeSize, { class: 'placeholder', 'data-placeholder': this.placeholder })])
        },
      },
    })

    const limit = new Plugin({
      filterTransaction: (tr) => !(this.maxLength >= 0 && tr.docChanged && textLength(tr.doc) > this.maxLength && textLength(tr.doc) > textLength(tr.before)),
    })

    return [
      history(),
      inputRules({ rules }),
      keymap({
        'Mod-z': undo,
        'Shift-Mod-z': redo,
        'Mod-y': redo,
        'Mod-b': allowed('bold'),
        'Mod-i': allowed('italic'),
        'Mod-u': allowed('underline'),
        'Shift-Mod-x': allowed('strike'),
        'Shift-Mod-h': () => this.formatSelection('highlight'),
        'Mod-\\': () => this.clearFormatting(),
        'Mod-Enter': toggleChecked,
        'Shift-Mod-l': toggleTaskLine,
        Enter: enterTask,
        Backspace: chainCommands(undoInputRule, backspaceTask),
        'Alt-F10': focusToolbar,
        Escape: dismissToolbar,
      }),
      keymap(baseKeymap),
      placeholder,
      limit,
    ]
  }

  private surfaceAttributes(): Record<string, string> {
    const attributes: Record<string, string> = {
      class: 'writing',
      part: 'writing',
      role: 'textbox',
      'aria-multiline': 'true',
      translate: 'no',
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
    if (this.error && this.errorText) attributes['aria-describedby'] = 'error-note'
    if (this.error) attributes['aria-invalid'] = 'true'
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
    this.emitFormat()
    this.updateToolbar()
  }

  private applyColorMark(view: EditorView, type: MarkType, color: number | null) {
    const { from, to, empty } = view.state.selection
    const tr = view.state.tr
    if (empty) {
      const marks = type.removeFromSet(view.state.storedMarks ?? view.state.selection.$from.marks())
      tr.setStoredMarks(color ? type.create({ color }).addToSet(marks) : marks)
    } else {
      tr.removeMark(from, to, type)
      if (color) tr.addMark(from, to, type.create({ color }))
    }
    view.dispatch(tr)
  }

  private toggleTask(pos: number) {
    const view = this.view
    if (!view || !this.editable) return
    const node = view.state.doc.nodeAt(pos)
    if (!node || node.type !== schema.nodes.task) return
    const checked = !node.attrs.checked
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { checked }))
    let line = 0
    view.state.doc.forEach((_child, offset, index) => {
      if (offset === pos) line = index
    })
    this.dispatchEvent(new CustomEvent<NotepadCheckChangeEventDetail>('check-change', { detail: { line, checked, text: node.textContent } }))
  }

  /**
   * Pasted plain text is read as notepad Markdown. Its first and last lines join the line being written on, unless
   * they are checklist items, which keep their own line.
   */
  private parsePastedText(text: string): Slice {
    const content = fromMarkdown(text).content
    const open = (node: ProseNode | null) => (node && node.type === schema.nodes.task ? 0 : 1)
    return new Slice(content, open(content.firstChild), open(content.lastChild))
  }

  /**
   * ProseMirror learns where a click put the caret from `selectionchange`, which the browser fires asynchronously. A
   * key pressed before it arrives (Enter, a shortcut) would run against the old selection, so read the real one first.
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
      // A position inside a checkbox or between nodes has no text selection; keep ProseMirror's own.
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

  /** Drops the formats `marks` does not allow from pasted content. */
  private filterSlice(slice: Slice): Slice {
    const allowed = this.allowedMarks
    if (allowed.size === MARK_NAMES.length) return slice
    const strip = (fragment: Fragment): Fragment => {
      const nodes: ProseNode[] = []
      fragment.forEach((node) => {
        if (node.isText) nodes.push(node.mark(node.marks.filter((mark) => allowed.has(mark.type.name as NotepadMark))))
        else nodes.push(node.copy(strip(node.content)))
      })
      return Fragment.fromArray(nodes)
    }
    return new Slice(strip(slice.content), slice.openStart, slice.openEnd)
  }

  private emitFormat() {
    const state = this.view?.state
    if (!state) return
    const { $from, from, to, empty } = state.selection
    let format: NotepadFormat
    if (empty) {
      format = formatOf(state.storedMarks ?? $from.marks())
    } else {
      // A format is active when all of the selected text carries it.
      const formats: NotepadFormat[] = []
      state.doc.nodesBetween(from, to, (node) => {
        if (node.isText) formats.push(formatOf(node.marks))
      })
      format = formats.reduce(
        (all, each) => ({
          bold: all.bold && each.bold,
          italic: all.italic && each.italic,
          underline: all.underline && each.underline,
          strike: all.strike && each.strike,
          ink: all.ink === each.ink ? all.ink : null,
          highlight: all.highlight === each.highlight ? all.highlight : null,
        }),
        formats[0] ?? emptyFormat(),
      )
    }
    const key = JSON.stringify(format)
    if (key === this.formatKey) return
    this.formatKey = key
    this.format = format
    this.dispatchEvent(new CustomEvent<NotepadFormat>('format-change', { detail: { ...format } }))
  }

  // ---- selection toolbar ----------------------------------------------------------------------------------------

  /** The toolbar's own row of buttons, in roving order; the colour swatches live in their group's flyout. */
  private toolbarButtons(): HTMLElement[] {
    return [...(this.toolbarEl?.querySelectorAll<HTMLElement>('button:not([hidden])') ?? [])].filter(
      (button) => !button.closest('.flyout') && !button.closest('.group[hidden]'),
    )
  }

  private flyoutButtons(group: 'ink' | 'highlight'): HTMLElement[] {
    return [...(this.toolbarEl?.querySelectorAll<HTMLElement>(`.group[data-group='${group}'] .flyout button`) ?? [])]
  }

  private openFlyout(group: 'ink' | 'highlight') {
    this.openGroup = group
    void this.updateComplete.then(() => {
      const swatches = this.flyoutButtons(group)
      ;(swatches.find((each) => each.getAttribute('aria-pressed') === 'true') ?? swatches[0])?.focus()
    })
  }

  private closeFlyout(focusTrigger: boolean) {
    const group = this.openGroup
    this.openGroup = null
    if (focusTrigger && group) void this.updateComplete.then(() => this.toolbarEl.querySelector<HTMLElement>(`.group[data-group='${group}'] .trigger`)?.focus())
  }

  private updateToolbar() {
    const view = this.view
    const toolbar = this.toolbarEl
    if (!view || !toolbar) return
    const selection = view.state.selection
    const focused = view.hasFocus() || toolbar.contains(this.renderRoot instanceof ShadowRoot ? this.renderRoot.activeElement : null)
    const show =
      this.toolbar !== 'none' &&
      this.editable &&
      focused &&
      !selection.empty &&
      selection instanceof TextSelection &&
      !this.dismissedSelection &&
      this.allowedMarks.size > 0
    if (!show) {
      this.hideToolbar()
      return
    }
    if (!toolbar.matches(':popover-open')) toolbar.showPopover()
    const start = view.coordsAtPos(selection.from)
    const end = view.coordsAtPos(selection.to)
    const top = Math.min(start.top, end.top)
    const bottom = Math.max(start.bottom, end.bottom)
    const center = Math.abs(start.top - end.top) < 2 ? (start.left + end.right) / 2 : this.surface.getBoundingClientRect().left + this.surface.clientWidth / 2
    const width = toolbar.offsetWidth
    const height = toolbar.offsetHeight
    const coarse = matchMedia('(pointer: coarse)').matches
    let y = top - height - 10
    // On touch screens the system's copy/paste menu sits above the selection: stay out of its way.
    if (y < 8 || coarse) y = bottom + 12
    const x = Math.min(Math.max(8, center - width / 2), innerWidth - width - 8)
    toolbar.style.left = `${Math.round(x)}px`
    toolbar.style.top = `${Math.round(y)}px`
  }

  private hideToolbar() {
    this.openGroup = null
    if (this.toolbarEl?.matches(':popover-open')) this.toolbarEl.hidePopover()
  }

  private handleFocusOut(event: FocusEvent) {
    const next = event.relatedTarget as Node | null
    if (next && this.renderRoot.contains(next)) return
    this.pointerFocus = false
    this.hideToolbar()
    if (this.changedSinceFocus) {
      this.changedSinceFocus = false
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    }
  }

  private handleToolbarKeydown(event: KeyboardEvent) {
    const active = (this.renderRoot instanceof ShadowRoot ? this.renderRoot.activeElement : event.target) as HTMLElement | null
    const stop = () => {
      event.preventDefault()
      event.stopPropagation()
    }
    const flyoutGroup = active?.closest<HTMLElement>('.flyout') ? (active.closest<HTMLElement>('.group')?.dataset.group as 'ink' | 'highlight') : null
    if (flyoutGroup) {
      // Inside a colour flyout: the arrows move between swatches, Escape or ArrowUp goes back to its button.
      const swatches = this.flyoutButtons(flyoutGroup)
      const index = swatches.indexOf(active!)
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        stop()
        swatches[(index + (event.key === 'ArrowRight' ? 1 : -1) + swatches.length) % swatches.length]?.focus()
      } else if (event.key === 'Escape' || event.key === 'ArrowUp') {
        stop()
        this.closeFlyout(true)
      }
      return
    }
    const trigger = active?.classList.contains('trigger') ? (active.closest<HTMLElement>('.group')?.dataset.group as 'ink' | 'highlight') : null
    if (trigger && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      stop()
      this.openFlyout(trigger)
      return
    }
    const buttons = this.toolbarButtons()
    const index = buttons.indexOf(active!)
    const move = (to: number) => {
      event.preventDefault()
      this.openGroup = null
      buttons[(to + buttons.length) % buttons.length]?.focus()
    }
    if (event.key === 'ArrowRight') move(index + 1)
    else if (event.key === 'ArrowLeft') move(index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(buttons.length - 1)
    else if (event.key === 'Escape') {
      stop()
      this.view?.focus()
    }
  }

  private handleToolbarClick(event: MouseEvent) {
    const button = (event.target as Element).closest<HTMLButtonElement>('button')
    if (!button) return
    const fromKeyboard = event.detail === 0
    const group = button.closest<HTMLElement>('.group')?.dataset.group as 'ink' | 'highlight' | undefined
    if (button.classList.contains('trigger') && group) {
      // A tap or click opens the flyout too: touch screens have no hover.
      this.openGroup = this.openGroup === group ? null : group
      return
    }
    const mark = button.dataset.mark as NotepadMark | undefined
    if (!mark) return
    const color = Number(button.dataset.color) || null
    this.formatSelection(mark, mark === 'ink' || mark === 'highlight' ? color : undefined)
    if (group) {
      this.openGroup = null
      if (!fromKeyboard) this.pickedGroup = group
    }
    // A keyboard user stays on the toolbar to apply another format; formatting refocused the page.
    if (fromKeyboard) {
      const key = group ? null : button.dataset.key
      void this.updateComplete.then(() =>
        (group
          ? this.toolbarEl.querySelector<HTMLElement>(`.group[data-group='${group}'] .trigger`)
          : this.toolbarButtons().find((each) => each.dataset.key === key)
        )?.focus(),
      )
    }
  }

  // ---- paper picker ---------------------------------------------------------------------------------------------

  /** The picker behaves as a hover card: the pointer opens it, a click, a tap or the keyboard pins it open. */
  private openPaperMenu(focus: boolean) {
    const menu = this.paperMenu
    const button = this.paperButton
    if (!menu || !button) return
    clearTimeout(this.hoverTimer)
    if (!menu.matches(':popover-open')) {
      menu.showPopover()
      this.placePaperMenu()
    }
    if (focus) void this.updateComplete.then(() => menu.querySelector<HTMLElement>('[role=radio][aria-checked=true]')?.focus())
  }

  /** Places the card under the Paper button, or above it when there is no room below. */
  private placePaperMenu() {
    const menu = this.paperMenu
    const button = this.paperButton
    if (!menu || !button) return
    const box = button.getBoundingClientRect()
    const x = Math.min(Math.max(8, box.left + box.width / 2 - menu.offsetWidth / 2), innerWidth - menu.offsetWidth - 8)
    // Room for the arrow between the button and the card.
    const below = box.bottom + 10
    const above = below + menu.offsetHeight > innerHeight - 8 && box.top - menu.offsetHeight - 10 >= 8
    const y = above ? box.top - menu.offsetHeight - 10 : below
    menu.style.left = `${Math.round(x)}px`
    menu.style.top = `${Math.round(y)}px`
    menu.dataset.side = above ? 'top' : 'bottom'
    menu.style.setProperty('--_arrow-x', `${Math.round(box.left + box.width / 2 - x)}px`)
  }

  private closePaperMenu() {
    clearTimeout(this.hoverTimer)
    this.paperMenuPinned = false
    if (this.paperMenu?.matches(':popover-open')) this.paperMenu.hidePopover()
  }

  private handlePaperButtonClick(event: MouseEvent) {
    if (this.paperMenuPinned) {
      this.closePaperMenu()
      return
    }
    this.paperMenuPinned = true
    // From the keyboard (detail 0) the focus moves into the card; a click leaves it on the button.
    this.openPaperMenu(event.detail === 0)
  }

  private handlePaperHover(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    clearTimeout(this.hoverTimer)
    if (event.type === 'pointerenter') {
      if (!this.paperMenu?.matches(':popover-open')) this.hoverTimer = setTimeout(() => this.openPaperMenu(false), HOVER_OPEN_DELAY)
    } else if (!this.paperMenuPinned) {
      this.hoverTimer = setTimeout(() => this.closePaperMenu(), HOVER_CLOSE_DELAY)
    }
  }

  private handlePaperMenuToggle(event: ToggleEvent) {
    this.handlePopoverToggle()
    this.paperMenuOpen = event.newState === 'open'
    if (!this.paperMenuOpen) this.paperMenuPinned = false
    // Closed by Escape or a pick from the keyboard: give focus back to the button that opened it.
    if (!this.paperMenuOpen && this.paperMenu?.contains(this.renderRoot instanceof ShadowRoot ? this.renderRoot.activeElement : null)) this.paperButton?.focus()
  }

  private choosePaper(choice: Partial<NotepadPaperChangeEventDetail>) {
    const { pad = this.pad, paper = this.paper, paperColor = this.paperColor } = choice
    if (pad === this.pad && paper === this.paper && paperColor === this.paperColor) return
    this.pad = pad
    this.paper = paper
    this.paperColor = paperColor
    this.dispatchEvent(new CustomEvent<NotepadPaperChangeEventDetail>('paper-change', { detail: { pad, paper, paperColor } }))
  }

  private handlePaperMenuKeydown(event: KeyboardEvent) {
    const radio = (event.target as Element).closest<HTMLElement>('[role=radio]')
    if (!radio) return
    const group = [...(radio.parentElement?.querySelectorAll<HTMLElement>('[role=radio]') ?? [])]
    // The pads and the colours sit in rows of three: up and down move a whole row.
    const columns = radio.parentElement?.classList.contains('grid3') ? 3 : 1
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? columns : event.key === 'ArrowUp' ? -columns : 0
    if (!step) return
    event.preventDefault()
    // Radio semantics: moving to a choice selects it.
    const next = group[(group.indexOf(radio) + step + group.length) % group.length]
    next.click()
    void this.updateComplete.then(() => next.focus())
  }

  private renderPaperMenu() {
    return html`<div
      class="paper-menu"
      part="paper-menu"
      popover="auto"
      role="dialog"
      aria-label="Paper"
      @toggle=${this.handlePaperMenuToggle}
      @keydown=${this.handlePaperMenuKeydown}
      @pointerenter=${this.handlePaperHover}
      @pointerleave=${this.handlePaperHover}
    >
      <span class="label" id="paper-pads">Pad</span>
      <div class="row grid3 pads" role="radiogroup" aria-labelledby="paper-pads">
        ${PADS.map(
          (pad) =>
            html`<button
              type="button"
              role="radio"
              aria-checked=${String(this.pad === pad)}
              aria-label=${PAD_LABELS[pad]}
              title=${PAD_LABELS[pad]}
              tabindex=${this.pad === pad ? 0 : -1}
              @click=${() => this.choosePaper({ pad })}
            >
              <span class="pad-thumb ${pad}"></span>
              <span class="name">${PAD_LABELS[pad]}</span>
            </button>`,
        )}
      </div>
      <span class="label" id="paper-lines">Lines</span>
      <div class="row" role="radiogroup" aria-labelledby="paper-lines">
        ${PAPERS.map(
          (paper) =>
            html`<button
              type="button"
              role="radio"
              aria-checked=${String(this.paper === paper)}
              aria-label=${PAPER_LABELS[paper]}
              title=${PAPER_LABELS[paper]}
              tabindex=${this.paper === paper ? 0 : -1}
              @click=${() => this.choosePaper({ paper })}
            >
              <span class="thumb ${paper}"></span>
            </button>`,
        )}
      </div>
      <span class="label" id="paper-colors">Paper</span>
      <div class="row grid3 colors" role="radiogroup" aria-labelledby="paper-colors">
        ${PAPER_COLORS.map((color) => {
          const name = color === 'default' ? PAD_COLOR_LABELS[this.pad] : PAPER_COLOR_LABELS[color]
          return html`<button
            type="button"
            role="radio"
            aria-checked=${String(this.paperColor === color)}
            aria-label=${name}
            title=${name}
            tabindex=${this.paperColor === color ? 0 : -1}
            @click=${() => this.choosePaper({ paperColor: color })}
          >
            <span class="swatch" style=${PAPER_SWATCHES[color]}>Aa</span>
          </button>`
        })}
      </div>
    </div>`
  }

  /** Stops the editing surface's own `input` / `beforeinput`: the element fires its own `input` with `value` up to date. */
  private stopNativeEditing(event: Event) {
    event.stopPropagation()
  }

  private animateTear(): Promise<void> {
    const sheet = this.sheet
    const pad = sheet?.parentElement
    if (!sheet || !pad || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve()
    const ghost = sheet.cloneNode(true) as HTMLElement
    ghost.classList.add('torn')
    ghost.removeAttribute('part')
    ghost.setAttribute('aria-hidden', 'true')
    ghost.inert = true
    ghost.querySelector('.writing')?.removeAttribute('contenteditable')
    const sheetBox = sheet.getBoundingClientRect()
    const padBox = pad.getBoundingClientRect()
    Object.assign(ghost.style, {
      left: `${sheetBox.left - padBox.left}px`,
      top: `${sheetBox.top - padBox.top}px`,
      width: `${sheetBox.width}px`,
      height: `${sheetBox.height}px`,
    })
    pad.append(ghost)
    return new Promise((resolve) => {
      const done = () => {
        ghost.remove()
        resolve()
      }
      ghost.addEventListener('animationend', done, { once: true })
      ghost.addEventListener('animationcancel', done, { once: true })
      // A zero duration, or a theme that switched animations off, never fires animationend.
      if (!ghost.getAnimations().length) done()
    })
  }

  private syncFormState() {
    this.internals.setFormValue(this.value, this.value)
    if (this.disabled || this.disabledByForm) {
      this.internals.setValidity({})
      return
    }
    const text = this.text
    const flags: ValidityStateFlags = {}
    let message = ''
    if (this.customValidityMessage) {
      flags.customError = true
      message = this.customValidityMessage
    } else if (this.required && !text.trim()) {
      flags.valueMissing = true
      message = 'Please write something.'
    } else if (this.maxLength >= 0 && text.replace(/\n/g, '').length > this.maxLength) {
      flags.tooLong = true
      message = `Please use at most ${this.maxLength} characters.`
    }
    this.internals.setValidity(flags, message, this.surface)
  }

  private colorsOf(group: 'ink' | 'highlight'): readonly NamedColor[] {
    return group === 'ink' ? colorList(this.inks, DEFAULT_INKS, 'Ink') : colorList(this.highlights, DEFAULT_HIGHLIGHTS, 'Highlighter')
  }

  /**
   * `--_ink-<n>`, `--_ink-<n>-night` and `--_highlight-<n>` for every colour of the lists: the marks on the page and
   * the swatches read them, so a new list recolours both in place, and a position the list does not have stays unset
   * (its marks fall back to the page's ink). On night paper an ink is lifted towards white so it stays readable.
   */
  private colorVars(): Record<string, string> {
    const vars: Record<string, string> = {}
    const custom = Array.isArray(this.inks) && this.inks.some(isColor)
    this.colorsOf('ink').forEach(({ value }, position) => {
      const index = position + 1
      vars[`--_ink-${index}`] = value
      vars[`--_ink-${index}-night`] = !custom && index === DEFAULT_BLACK_INK ? 'var(--_ink)' : `color-mix(in srgb, ${value} 55%, #ffffff)`
    })
    this.colorsOf('highlight').forEach(({ value }, position) => (vars[`--_highlight-${position + 1}`] = value))
    return vars
  }

  private renderColorGroup(group: 'ink' | 'highlight') {
    const ink = group === 'ink'
    const colors = this.colorsOf(group)
    // A page may hold a position the current list does not have: it shows as no colour rather than a wrong one.
    const picked = this.format[group]
    const current = picked && picked <= colors.length ? picked : null
    const label = ink ? 'Ink colour' : 'Highlighter'
    const currentLabel = current ? colors[current - 1].name : ink ? 'Default ink' : 'No highlighter'
    const swatch = (index: number) => html`<span class=${ink ? 'ink' : 'hi'} style=${styleMap({ '--_swatch': `var(--_${group}-${index})` })}></span>`
    const open = this.openGroup === group
    return html`<div
      class="group ${open ? 'open' : ''} ${this.pickedGroup === group ? 'picked' : ''}"
      data-group=${group}
      ?hidden=${!this.allowedMarks.has(group)}
      @mouseleave=${() => {
        if (this.pickedGroup === group) this.pickedGroup = null
      }}
    >
      <button
        type="button"
        class="trigger"
        tabindex="-1"
        data-key=${group}
        aria-label=${`${label}: ${currentLabel}`}
        aria-haspopup="true"
        aria-expanded=${String(open)}
        title=${label}
      >
        ${current ? swatch(current) : ink ? html`<span class="ink default"></span>` : html`<span class="hi none"></span>`}
        <svg class="caret" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div class="flyout">
        <div class="scrap" role="group" aria-label=${ink ? 'Ink colours' : 'Highlighters'}>
          <button
            type="button"
            tabindex="-1"
            data-mark=${group}
            data-color=""
            aria-label=${ink ? 'Default ink' : 'No highlighter'}
            aria-pressed=${String(!current)}
            title=${ink ? 'Default ink' : 'No highlighter'}
          >
            ${ink ? html`<span class="ink default"></span>` : html`<span class="hi none"></span>`}
          </button>
          ${colors.map((color, position) => {
            const index = position + 1
            return html`<button
              type="button"
              tabindex="-1"
              data-mark=${group}
              data-color=${index}
              aria-label=${color.name}
              aria-pressed=${String(current === index)}
              title=${color.name}
            >
              ${swatch(index)}
            </button>`
          })}
        </div>
      </div>
    </div>`
  }

  override render() {
    const allowed = this.allowedMarks
    const markButton = (mark: NotepadMark, label: string, glyph: unknown, shortcut: string) =>
      html`<button
        type="button"
        tabindex=${mark === 'bold' ? 0 : -1}
        data-mark=${mark}
        data-key=${mark}
        aria-label=${label}
        aria-pressed=${String(Boolean(this.format[mark]))}
        title=${`${label} (${shortcut})`}
        ?hidden=${!allowed.has(mark)}
      >
        ${glyph}
      </button>`
    const hasEmphasis = ['bold', 'italic', 'underline', 'strike'].some((mark) => allowed.has(mark as NotepadMark))
    const showError = this.error && !!this.errorText
    const colorVars = this.colorVars()
    const paperButton = this.paperPicker
      ? html`<button
          class="paper-button"
          part="paper-button"
          type="button"
          aria-haspopup="dialog"
          aria-expanded=${String(this.paperMenuOpen)}
          ?disabled=${this.disabled || this.disabledByForm}
          @click=${this.handlePaperButtonClick}
          @pointerenter=${this.handlePaperHover}
          @pointerleave=${this.handlePaperHover}
        >
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
            <rect x="2" y="1" width="8" height="10" rx="1" />
            <path d="M4 4h4M4 6h4M4 8h3" />
          </svg>
          Paper
        </button>`
      : nothing
    const tearButton = this.tearable
      ? html`<button class="tear" part="tear-button" type="button" ?disabled=${!this.editable} @click=${() => void this.tearOff()}>Tear off</button>`
      : nothing
    // The slot stays put and the built-in buttons move around it: a re-created slot would report its stale assignment.
    const builtIns = html`${paperButton}${tearButton}`
    return html`
      <div
        class="pad ${this.disabledByForm ? 'form-disabled' : ''} ${this.pointerFocus ? 'pointer-focus' : ''}"
        style=${styleMap(colorVars)}
        @pointerdown=${() => (this.pointerFocus = true)}
        @focusout=${this.handleFocusOut}
      >
        <div class="stack" aria-hidden="true"></div>
        <div class="spiral" aria-hidden="true"></div>
        <div class="glue" aria-hidden="true"></div>
        <div class="sheet" part="sheet">
          <div class="holes" aria-hidden="true"></div>
          ${this.tearable ? html`<div class="perforation" aria-hidden="true"></div>` : nothing}
          <div class="top">
            <div class="header" ?hidden=${!this.slotPresence.has('header')}><slot name="header" @slotchange=${this.slotPresence.handleSlotChange}></slot></div>
            <div class="controls ${this.paperMenuOpen ? 'open' : ''}">
              ${this.actionsPlacement === 'end' ? builtIns : nothing}
              <div class="actions" part="actions" ?hidden=${!this.slotPresence.has('actions')}>
                <slot name="actions" @slotchange=${this.slotPresence.handleSlotChange}></slot>
              </div>
              ${this.actionsPlacement === 'end' ? nothing : builtIns}
            </div>
          </div>
          <div class="margin"><slot name="margin"></slot></div>
          <div class="writing" @input=${this.stopNativeEditing} @beforeinput=${this.stopNativeEditing}></div>
          ${showError ? html`<div class="error-note" id="error-note" role="alert">${this.errorText}</div>` : nothing}
        </div>
      </div>
      <div
        class="toolbar"
        part="toolbar"
        popover="manual"
        role="toolbar"
        aria-label="Formatting"
        style=${styleMap(colorVars)}
        @toggle=${this.handlePopoverToggle}
        @mousedown=${(event: Event) => event.preventDefault()}
        @click=${this.handleToolbarClick}
        @keydown=${this.handleToolbarKeydown}
        @focusout=${this.handleFocusOut}
      >
        ${markButton('bold', 'Bold', html`<b>B</b>`, 'Ctrl+B')} ${markButton('italic', 'Italic', html`<i>I</i>`, 'Ctrl+I')}
        ${markButton('underline', 'Underline', html`<u>U</u>`, 'Ctrl+U')} ${markButton('strike', 'Strikethrough', html`<s>S</s>`, 'Ctrl+Shift+X')}
        ${hasEmphasis && (allowed.has('ink') || allowed.has('highlight')) ? html`<span class="sep" aria-hidden="true"></span>` : nothing}
        ${this.renderColorGroup('ink')} ${this.renderColorGroup('highlight')}
        <slot name="toolbar"></slot>
      </div>
      ${this.paperPicker ? this.renderPaperMenu() : nothing}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-notepad': Notepad
  }
}
