import { html, nothing, svg, type TemplateResult } from 'lit'
import type { Node as ProseNode } from 'prosemirror-model'
import { TextSelection } from 'prosemirror-state'
import type { Decoration, EditorView, NodeView } from 'prosemirror-view'
import type { ContextMenuContext, ContextMenuSelectEventDetail } from '@c2n/context-menu'
import type {
  Spreadsheet,
  SpreadsheetCellStyle,
  SpreadsheetColumn,
  SpreadsheetContextMenuData,
  SpreadsheetStyleChange,
  SpreadsheetTotal,
} from '@c2n/spreadsheet'
import { LANGUAGES, languageLabel, normalizeLanguage } from './languages'
import type { PageEditorText } from './messages'
import { COLORS, type PageEditorColor, type TableAlign, type TableAttrs, type TableCellStyle } from './schema'

const SWATCH =
  'display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; border-radius: 4px; font-size: 13px; font-weight: 600; line-height: 1;'

const menuIcon = (body: TemplateResult) => html`<svg slot="prefix-icon" viewBox="0 0 20 20" aria-hidden="true">${body}</svg>`
const line = (d: string) => svg`<path d=${d} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />`
const box = (x: number, y: number, width: number, height: number) =>
  svg`<rect x=${x} y=${y} width=${width} height=${height} rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />`

/** The icons of the table's right-click menu, drawn like the page editor's own. */
const TABLE_ICONS = {
  rowAbove: menuIcon(svg`${box(3, 10.5, 14, 6.5)}${line('M10 2.5v5M7.5 5h5')}`),
  rowBelow: menuIcon(svg`${box(3, 3, 14, 6.5)}${line('M10 12.5v5M7.5 15h5')}`),
  columnLeft: menuIcon(svg`${box(10.5, 3, 6.5, 14)}${line('M2.5 10h5M5 7.5v5')}`),
  columnRight: menuIcon(svg`${box(3, 3, 6.5, 14)}${line('M12.5 10h5M15 7.5v5')}`),
  rename: menuIcon(line('M4 16l1-3.5 8.5-8.5 2.5 2.5-8.5 8.5zM11.5 6l2.5 2.5')),
  total: menuIcon(line('M15 4.5H5.5l5 5.5-5 5.5H15')),
  bold: menuIcon(line('M6 4h4.5a3 3 0 0 1 0 6H6zM6 10h5.5a3 3 0 0 1 0 6H6z')),
  textColour: menuIcon(line('M5 16l5-12 5 12M7 11.5h6')),
  background: menuIcon(line('M10 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z')),
  size: menuIcon(line('M2.5 16l3.5-9 3.5 9M3.8 13h4.4M11 16l3-7 3 7M12 14h4')),
  formulaBar: menuIcon(svg`<text x="3" y="14.5" font-size="11" font-family="Georgia, serif" font-style="italic" fill="currentColor">fx</text>`),
  totals: menuIcon(line('M4 16v-5M8 16V6M12 16v-3M16 16V4')),
  delete: menuIcon(line('M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10')),
}

const CHECK = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const CARET = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const COPY = `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3.5 10.5h-.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`
const WRAP = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h10a2 2 0 0 1 0 4H9.5M2 12h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 10.5L9.5 12l1.5 1.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`

let uid = 0

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, attributes: Record<string, string> = {}) => {
  const node = document.createElement(tag)
  node.className = className
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value)
  return node
}

const PLUS = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`

/** A node view with interface text of its own, which it rewrites when the page's language changes. */
export interface Localizable {
  localize(): void
  /** Re-reads whether the page is editable, which ProseMirror does not tell node views. */
  refresh?(): void
}

/** Where node views read their text from, and the set of live views the host relocalizes on a language change. */
export interface ViewText {
  text: PageEditorText
  live: Set<Localizable>
}

/** Bullet, numbered and to-do items: a marker the caret cannot enter, then the item's text. */
export class ItemView implements NodeView, Localizable {
  readonly dom: HTMLElement
  readonly contentDOM: HTMLElement
  private readonly marker: HTMLElement
  private node: ProseNode

  constructor(
    node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    decorations: readonly Decoration[],
    private readonly onToggle: (pos: number) => void,
    private readonly i18n: ViewText,
  ) {
    this.node = node
    this.dom = element('div', 'item')
    this.marker = element('span', 'marker', { contenteditable: 'false' })
    if (node.attrs.kind === 'todo') {
      this.marker.classList.add('box')
      this.marker.setAttribute('role', 'checkbox')
      this.localize()
      i18n.live.add(this)
      // A static SVG string, rendered once.
      this.marker.innerHTML = CHECK
      this.marker.addEventListener('mousedown', (event) => event.preventDefault())
      this.marker.addEventListener('click', (event) => {
        event.preventDefault()
        const pos = this.getPos()
        if (pos !== undefined && this.view.editable) this.onToggle(pos)
      })
    }
    this.contentDOM = element('div', 'item-text')
    this.dom.append(this.marker, this.contentDOM)
    this.sync(decorations)
  }

  update(node: ProseNode, decorations: readonly Decoration[]) {
    if (node.type !== this.node.type || node.attrs.kind !== this.node.attrs.kind) return false
    this.node = node
    this.sync(decorations)
    return true
  }

  private sync(decorations: readonly Decoration[]) {
    const { kind, indent, checked } = this.node.attrs
    this.dom.dataset.kind = kind
    this.dom.dataset.indent = String(indent)
    this.dom.dataset.checked = String(checked)
    if (kind === 'todo') {
      this.marker.setAttribute('aria-checked', String(checked))
      this.marker.setAttribute('aria-disabled', String(!this.view.editable))
    } else if (kind === 'ordered') {
      const number = decorations.find((each) => (each.spec as { number?: number }).number)?.spec.number ?? 1
      this.marker.textContent = `${number}.`
    }
    const placeholder = decorations.find((each) => (each.spec as { placeholder?: string }).placeholder)?.spec.placeholder as string | undefined
    this.contentDOM.classList.toggle('placeholder', Boolean(placeholder))
    if (placeholder) this.contentDOM.dataset.placeholder = placeholder
    else delete this.contentDOM.dataset.placeholder
  }

  localize() {
    if (this.node.attrs.kind === 'todo') this.marker.setAttribute('aria-label', this.i18n.text.t('done'))
  }

  stopEvent(event: Event) {
    return this.marker.contains(event.target as Node)
  }

  destroy() {
    this.i18n.live.delete(this)
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }) {
    // The placeholder lives in attributes of the text element, which the view writes itself.
    if (mutation.type === 'attributes' && mutation.target === this.contentDOM) return true
    return mutation.type !== 'selection' && !this.contentDOM.contains(mutation.target)
  }
}

export interface CodeBlockOptions extends ViewText {
  /** How the platform spells the modifier key, for the hint under a focused block. */
  modKey: string
  onCopy?: (text: string) => void
}

/** A code block: language picker, wrap toggle and copy button over a `<pre>`, with line numbers in a gutter. */
export class CodeBlockView implements NodeView, Localizable {
  readonly dom: HTMLElement
  readonly contentDOM: HTMLElement
  private readonly header: HTMLElement
  private readonly languageButton: HTMLButtonElement
  private readonly wrapButton: HTMLButtonElement
  private readonly copyButton: HTMLButtonElement
  private readonly gutter: HTMLElement
  private readonly hint: HTMLElement
  private readonly menu: HTMLElement
  private readonly search: HTMLInputElement
  private readonly options: HTMLElement
  private node: ProseNode
  private lines = 0
  private active = 0
  private copyTimer?: ReturnType<typeof setTimeout>
  private copied = false
  private readonly id = `c2-code-${++uid}`

  constructor(
    node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly settings: CodeBlockOptions,
  ) {
    this.node = node
    this.dom = element('div', 'code-block')
    this.header = element('div', 'code-header', { contenteditable: 'false' })
    this.languageButton = element('button', 'code-language', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' })
    this.languageButton.addEventListener('click', () => this.toggleMenu())
    this.hint = element('div', 'code-hint', { contenteditable: 'false', 'aria-hidden': 'true' })
    const tools = element('div', 'code-tools')
    this.wrapButton = element('button', 'code-tool', { type: 'button', 'aria-pressed': 'false' })
    this.wrapButton.innerHTML = WRAP
    this.wrapButton.addEventListener('click', () => {
      const wrap = !this.dom.classList.contains('wrap')
      this.dom.classList.toggle('wrap', wrap)
      this.wrapButton.setAttribute('aria-pressed', String(wrap))
    })
    this.copyButton = element('button', 'code-tool code-copy', { type: 'button' })
    this.copyButton.addEventListener('click', () => this.copy())
    tools.append(this.wrapButton, this.copyButton)
    this.header.append(this.languageButton, tools)
    // The keyboard hint sits in the header, so showing it never moves the blocks below.
    this.header.insertBefore(this.hint, tools)
    for (const button of [this.languageButton, this.wrapButton, this.copyButton]) button.addEventListener('mousedown', (event) => event.preventDefault())

    const body = element('div', 'code-body')
    this.gutter = element('div', 'code-gutter', { 'aria-hidden': 'true', contenteditable: 'false' })
    const pre = element('pre', 'code-pre', { spellcheck: 'false' })
    this.contentDOM = element('code', 'code-text')
    pre.append(this.contentDOM)
    body.append(this.gutter, pre)

    this.menu = element('div', 'code-menu', { popover: 'auto', role: 'dialog', contenteditable: 'false' })
    this.search = element('input', 'code-search', {
      type: 'text',
      role: 'combobox',
      'aria-expanded': 'true',
      'aria-controls': `${this.id}-list`,
      'aria-autocomplete': 'list',
    })
    this.options = element('div', 'code-options', { role: 'listbox', id: `${this.id}-list` })
    this.menu.append(this.search, this.options)
    this.search.addEventListener('input', () => {
      this.active = 0
      this.renderOptions()
    })
    this.search.addEventListener('keydown', (event) => this.handleMenuKey(event))
    this.options.addEventListener('mousedown', (event) => event.preventDefault())
    this.options.addEventListener('click', (event) => {
      const option = (event.target as Element).closest<HTMLElement>('[role=option]')
      if (option) this.pick(option.dataset.id ?? '')
    })
    this.menu.addEventListener('toggle', (event) => {
      const open = (event as ToggleEvent).newState === 'open'
      this.languageButton.setAttribute('aria-expanded', String(open))
      if (!open && this.menu.contains(this.view.root.activeElement)) this.view.focus()
    })

    this.dom.append(this.header, body, this.menu)
    this.localize()
    settings.live.add(this)
  }

  /** Writes every piece of interface text, in the page's current language. */
  localize() {
    const t = this.settings.text.t.bind(this.settings.text)
    const kbd = (key: string) => {
      const node = document.createElement('kbd')
      node.textContent = key
      return node
    }
    const indent = document.createElement('span')
    indent.append(kbd('Tab'), ` ${t('hintIndent')}`)
    const leave = document.createElement('span')
    leave.append(kbd(`${this.settings.modKey}↵`), ` ${t('hintOr')} `, kbd('↵↵↵'), ` ${t('hintLeave')}`)
    this.hint.replaceChildren(indent, leave)
    this.wrapButton.setAttribute('aria-label', t('wrapLines'))
    this.wrapButton.title = t('wrapLines')
    this.menu.setAttribute('aria-label', t('language'))
    this.search.placeholder = t('searchLanguagesPlaceholder')
    this.search.setAttribute('aria-label', t('searchLanguages'))
    this.options.setAttribute('aria-label', t('languages'))
    this.renderCopy(this.copied)
    this.sync()
    if (this.menu.matches(':popover-open')) this.renderOptions()
  }

  update(node: ProseNode) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.sync()
    return true
  }

  private sync() {
    const language = normalizeLanguage(this.node.attrs.language)
    this.dom.dataset.language = language
    this.languageButton.innerHTML = ''
    const label = languageLabel(language, this.settings.text.t('plainText'))
    this.languageButton.append(label)
    this.languageButton.insertAdjacentHTML('beforeend', CARET)
    this.languageButton.setAttribute('aria-label', this.settings.text.t('languageIs', label))
    this.languageButton.disabled = !this.view.editable
    const lines = this.node.textContent.split('\n').length
    if (lines !== this.lines) {
      this.lines = lines
      this.gutter.textContent = Array.from({ length: lines }, (_, index) => index + 1).join('\n')
    }
  }

  private renderCopy(copied: boolean) {
    const t = this.settings.text.t.bind(this.settings.text)
    this.copied = copied
    this.copyButton.innerHTML = COPY
    this.copyButton.append(copied ? t('copied') : t('copy'))
    this.copyButton.setAttribute('aria-label', copied ? t('copied') : t('copyCode'))
  }

  /** A language's name as the picker shows it: "Plain text" in the page's language, the others as they are. */
  private labelOf(language: { id: string; label: string }) {
    return language.id ? language.label : this.settings.text.t('plainText')
  }

  private copy() {
    const text = this.node.textContent
    void navigator.clipboard?.writeText(text).then(
      () => {
        this.renderCopy(true)
        clearTimeout(this.copyTimer)
        this.copyTimer = setTimeout(() => this.renderCopy(false), 1500)
      },
      () => undefined,
    )
    this.settings.onCopy?.(text)
  }

  private filtered() {
    const query = this.search.value.trim().toLowerCase()
    return LANGUAGES.filter(
      (each) => !query || this.labelOf(each).toLowerCase().includes(query) || each.label.toLowerCase().includes(query) || each.id.includes(query),
    )
  }

  private renderOptions() {
    const current = normalizeLanguage(this.node.attrs.language)
    const list = this.filtered()
    this.active = Math.max(0, Math.min(this.active, list.length - 1))
    this.options.replaceChildren(
      ...list.map((each, index) => {
        const option = element('div', 'code-option', {
          role: 'option',
          id: `${this.id}-${index}`,
          'aria-selected': String(each.id === current),
          'data-id': each.id,
        })
        if (index === this.active) option.classList.add('active')
        option.append(this.labelOf(each))
        if (each.id === current) option.insertAdjacentHTML('beforeend', CHECK)
        return option
      }),
    )
    if (list.length) this.search.setAttribute('aria-activedescendant', `${this.id}-${this.active}`)
    else this.search.removeAttribute('aria-activedescendant')
    this.options.querySelector('.active')?.scrollIntoView({ block: 'nearest' })
  }

  private toggleMenu() {
    if (this.menu.matches(':popover-open')) {
      this.menu.hidePopover()
      return
    }
    this.search.value = ''
    const current = normalizeLanguage(this.node.attrs.language)
    this.active = Math.max(
      0,
      LANGUAGES.findIndex((each) => each.id === current),
    )
    this.renderOptions()
    this.menu.showPopover()
    const box = this.languageButton.getBoundingClientRect()
    const below = box.bottom + 6
    const top = below + this.menu.offsetHeight > innerHeight - 8 ? Math.max(8, box.top - this.menu.offsetHeight - 6) : below
    this.menu.style.left = `${Math.round(Math.min(box.left, innerWidth - this.menu.offsetWidth - 8))}px`
    this.menu.style.top = `${Math.round(top)}px`
    this.search.focus()
  }

  private handleMenuKey(event: KeyboardEvent) {
    const list = this.filtered()
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      this.active = (this.active + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % Math.max(1, list.length)
      this.renderOptions()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const choice = list[this.active]
      if (choice) this.pick(choice.id)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.menu.hidePopover()
    }
  }

  private pick(language: string) {
    const pos = this.getPos()
    this.menu.hidePopover()
    if (pos === undefined) return
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, language })
    // Back in the code, where the writer was going to type.
    const inside = tr.selection.from > pos && tr.selection.from < pos + this.node.nodeSize
    if (!inside) tr.setSelection(TextSelection.create(tr.doc, pos + 1 + this.node.content.size))
    this.view.dispatch(tr)
    this.view.focus()
  }

  stopEvent(event: Event) {
    const target = event.target as Node
    return !this.contentDOM.contains(target) && this.dom.contains(target)
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }) {
    if (mutation.type === 'selection') return !this.contentDOM.contains(mutation.target)
    return !this.contentDOM.contains(mutation.target)
  }

  destroy() {
    this.settings.live.delete(this)
    clearTimeout(this.copyTimer)
    if (this.menu.matches(':popover-open')) this.menu.hidePopover()
  }
}

/** The elements a table is drawn with, loaded with the first table so a page without one never pays for them. */
let tableElements: Promise<typeof import('@c2n/spreadsheet')> | undefined
const loadTableElements = () => (tableElements ??= Promise.all([import('@c2n/spreadsheet'), import('@c2n/context-menu')]).then(([spreadsheet]) => spreadsheet))

/** Where the keyboard goes when it leaves a table: the line above, the line below, or the table selected as a block. */
export type TableExit = 'before' | 'after' | 'select'

export interface TableOptions extends ViewText {
  onLeave: (pos: number, exit: TableExit) => void
}

const tableViews = new WeakMap<Node, TableView>()

/** The table view drawn at a node's DOM, to hand it the keyboard. */
export const tableViewOf = (dom: Node | null | undefined) => (dom ? tableViews.get(dom) : undefined)

/** `B3`, or a range of that one cell, as a zero-based row; `-1` for a range of several cells. */
function singleCellRow(range: string): number {
  const match = /^([A-Z]+)(\d+)(?::\1\2)?$/.exec(range)
  return match ? Number(match[2]) - 1 : -1
}

const cellText = (input: unknown) => (input === null || input === undefined ? '' : String(input))

/**
 * A table: a `c2-spreadsheet` in a `c2-context-menu`, with New row and New column buttons under it. The node's first
 * row names the columns (a header the user renames in place) and the others are the sheet's rows, so the first row
 * of data is row 1 in formulas. Each change is written back to the node, and the page's Markdown follows every edit. ArrowUp on the
 * first row and ArrowDown on the last leave the table for the line above or below, and Escape selects it as a block.
 */
export class TableView implements NodeView, Localizable {
  readonly dom: HTMLElement
  private readonly menu: HTMLElementTagNameMap['c2-context-menu']
  private readonly sheet: Spreadsheet
  private readonly tools: HTMLElement
  private readonly addRow: HTMLButtonElement
  private readonly addColumn: HTMLButtonElement
  private node: ProseNode
  /** The rows this view last wrote to the node, so its own change is not loaded back into the sheet. */
  private written: string[][] | undefined
  private writtenStyles: Record<string, TableCellStyle> | undefined
  /** The column names and alignment the sheet was given, so a change of either reshapes it. */
  private shape = ''
  /** The sheet's selection when the key now going down reached the table, before the sheet moved it. */
  private selectionAtKey = ''
  /** The right-click menu is open: the table is still in use, though the focus is in the menu. */
  private menuOpen = false

  constructor(
    node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly settings: TableOptions,
  ) {
    this.node = node
    this.dom = element('div', 'table-block idle', { contenteditable: 'false' })
    this.menu = document.createElement('c2-context-menu')
    this.sheet = document.createElement('c2-spreadsheet')
    this.sheet.className = 'table-sheet'
    this.menu.append(this.sheet)
    this.menu.renderContextMenu = (context) => this.renderMenu(context)
    this.menu.addEventListener('context-menu-select', (event) => void this.pick(event.detail))
    this.sheet.addEventListener('cell-change', () => this.write())
    this.sheet.addEventListener('column-rename', () => this.write())
    this.sheet.addEventListener('style-change', () => this.write())

    this.tools = element('div', 'table-tools')
    this.addRow = element('button', 'table-tool', { type: 'button' })
    this.addRow.addEventListener('click', () => void this.grow('row'))
    this.addColumn = element('button', 'table-tool', { type: 'button' })
    this.addColumn.addEventListener('click', () => void this.grow('column'))
    this.tools.append(this.addRow, this.addColumn)
    this.dom.append(this.menu, this.tools)

    // Before the sheet moves its selection: whether ArrowUp was pressed on the first row is read here.
    this.dom.addEventListener('keydown', () => (this.selectionAtKey = this.sheet.selection ?? ''), { capture: true })
    this.dom.addEventListener('keydown', (event) => this.handleKey(event))
    // Idle (its selection hidden) once neither the focus nor the open menu is in the table. The focus leaves for the
    // menu, which the page's :focus-within does not see, hence a class.
    this.dom.addEventListener('focusin', () => this.updateIdle())
    this.dom.addEventListener('focusout', () => setTimeout(() => this.updateIdle()))
    this.menu.addEventListener('toggle', (event) => {
      if (event.target !== this.menu) return
      this.menuOpen = (event as ToggleEvent).newState === 'open'
      this.updateIdle()
    })
    // The sheet's and the menu's events are the table's own business: the page fires its own `input` and `change`.
    for (const type of [
      'input',
      'change',
      'cell-change',
      'column-rename',
      'style-change',
      'column-resize',
      'context-menu-open',
      'context-menu-select',
      'menu-select',
      'toggle',
    ])
      this.dom.addEventListener(type, (event) => event.stopPropagation())

    this.load()
    this.localize()
    this.refresh()
    settings.live.add(this)
    tableViews.set(this.dom, this)
    void loadTableElements()
  }

  localize() {
    const t = this.settings.text.t.bind(this.settings.text)
    this.sheet.label = t('table')
    this.menu.menuLabel = t('tableActions')
    this.addRow.innerHTML = PLUS
    this.addRow.append(t('newRow'))
    this.addColumn.innerHTML = PLUS
    this.addColumn.append(t('newColumn'))
  }

  refresh() {
    const editable = this.view.editable
    this.sheet.readonly = !editable
    this.sheet.renameColumns = editable
    this.menu.disabled = !editable
    this.tools.hidden = !editable
  }

  /** Hands the keyboard to the table, on its first row or its last, or to the name of its first column (a new table). */
  async enter(edge: 'start' | 'end' | 'name') {
    const { cellRef } = await this.ready()
    if (edge === 'name') return this.sheet.renameColumn(0)
    this.sheet.select(cellRef(edge === 'start' ? 0 : this.lastRow(), 0))
    this.sheet.focus()
  }

  /** The sheet's last row: the node's rows less the header. */
  private lastRow() {
    return Math.max(0, (this.node.attrs as TableAttrs).rows.length - 2)
  }

  update(node: ProseNode) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.load()
    return true
  }

  /**
   * Gives the sheet the node's rows under its header, unless they are the ones it wrote, and the header as column
   * names only when they or the alignment changed (so a width the user dragged stays).
   */
  private load() {
    const { rows, align, formulaBar, summary, styles } = this.node.attrs as TableAttrs
    const [header = [''], ...body] = rows
    if (rows !== this.written) {
      this.written = rows
      this.sheet.data = body.map((row) => [...row])
      this.sheet.rows = Math.max(1, body.length)
    }
    if (styles !== this.writtenStyles) {
      this.writtenStyles = styles
      this.sheet.styles = styles as Record<string, SpreadsheetCellStyle>
    }
    const shape = JSON.stringify([header, align])
    if (shape !== this.shape) {
      this.shape = shape
      this.sheet.columns = header.map((label, index): SpreadsheetColumn => ({ ...(label ? { label } : {}), ...(align[index] ? { align: align[index] } : {}) }))
    }
    this.sheet.formulaBar = formulaBar
    this.sheet.summary = summary
  }

  /** Writes the sheet's inputs back to the node: every row and column it has, empty ones included. */
  private write() {
    const pos = this.getPos()
    if (pos === undefined) return
    const sheet = this.sheet
    const data = sheet.data ?? []
    const columns = Array.isArray(sheet.columns) ? sheet.columns : []
    const declared = typeof sheet.columns === 'number' ? sheet.columns : columns.length
    const width = Math.max(1, declared, ...data.map((row) => (Array.isArray(row) ? row.length : 0)))
    const height = Math.max(1, sheet.rows, data.length)
    const header = Array.from({ length: width }, (_, column) => columns[column]?.label ?? '')
    const body = Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, column) => cellText(data[row]?.[column])))
    const rows = [header, ...body]
    const align: TableAlign[] = columns.some((column) => column?.align) ? Array.from({ length: width }, (_, index) => columns[index]?.align ?? null) : []
    const styles = (sheet.styles ?? {}) as Record<string, TableCellStyle>
    this.written = rows
    this.writtenStyles = styles
    this.shape = JSON.stringify([header, align])
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, rows, align, styles }))
  }

  private setOption(name: 'formulaBar' | 'summary') {
    const pos = this.getPos()
    if (pos === undefined) return
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, [name]: !this.node.attrs[name] }))
  }

  /** The spreadsheet module, once its elements are defined and the sheet has drawn. */
  private async ready() {
    const spreadsheet = await loadTableElements()
    await this.sheet.updateComplete
    return spreadsheet
  }

  /** Adds a row at the bottom, with the current cell at its start, or a column at the end, with its name to type. */
  private async grow(axis: 'row' | 'column') {
    const { cellRef } = await this.ready()
    const height = this.lastRow() + 1
    const width = (this.node.attrs as TableAttrs).rows[0]?.length ?? 1
    if (axis === 'row') this.sheet.insertRows(height)
    else this.sheet.insertColumns(width)
    this.write()
    if (axis === 'column') return this.sheet.renameColumn(width)
    this.sheet.select(cellRef(height, 0))
    this.sheet.focus()
  }

  private renderMenu({ data, source }: ContextMenuContext) {
    if (source !== this.sheet || !data) return nothing
    const t = this.settings.text.t.bind(this.settings.text)
    const { area, start, end } = data as SpreadsheetContextMenuData
    const { formulaBar, summary } = this.node.attrs as TableAttrs
    const rows = area !== 'column'
    const columns = area !== 'row'
    const several = start.row !== end.row || start.column !== end.column
    const style = this.sheet.getStyle?.((data as SpreadsheetContextMenuData).active) ?? {}
    // The menu renders in the context menu's shadow root, out of reach of the page's stylesheet: the swatch is styled
    // inline, with the page's colour variables, which inherit into it.
    const swatch = (kind: 'color' | 'background', color: PageEditorColor | null) =>
      html`<span
        slot="prefix-icon"
        data-color=${color ?? 'default'}
        aria-hidden="true"
        style=${`${SWATCH}${color ? (kind === 'color' ? `color: var(--_color-${color});` : `background: var(--_background-${color});`) : ''}`}
        >A</span
      >`
    // The colours of the page's text, as a row of swatches; the first takes the colour off.
    const palette = (kind: 'color' | 'background', current: PageEditorColor | undefined) =>
      html`<c2-menu slot="submenu">
        <c2-menu-row>
          <c2-menu-item
            type="radio"
            name=${kind}
            value=${`${kind}-default`}
            label=${t(kind === 'color' ? 'defaultColour' : 'noBackground')}
            ?checked=${!current}
            >${swatch(kind, null)}</c2-menu-item
          >
          ${COLORS.map(
            (color) =>
              html`<c2-menu-item type="radio" name=${kind} value=${`${kind}-${color}`} label=${t(color)} ?checked=${current === color}
                >${swatch(kind, color)}</c2-menu-item
              >`,
          )}
        </c2-menu-row>
      </c2-menu>`
    return html`
      ${rows ? html`<c2-menu-item value="row-above">${TABLE_ICONS.rowAbove}${t('insertRowAbove')}</c2-menu-item><c2-menu-item value="row-below">${TABLE_ICONS.rowBelow}${t('insertRowBelow')}</c2-menu-item>` : nothing}
      ${
        columns
          ? html`<c2-menu-item value="column-left">${TABLE_ICONS.columnLeft}${t('insertColumnLeft')}</c2-menu-item
              ><c2-menu-item value="column-right">${TABLE_ICONS.columnRight}${t('insertColumnRight')}</c2-menu-item
              ><c2-menu-item value="rename-column">${TABLE_ICONS.rename}${t('renameColumn')}</c2-menu-item>`
          : nothing
      }
      ${
        several
          ? html`<c2-menu-item value="total"
              >${TABLE_ICONS.total}${t('addTotal')}
              <c2-menu slot="submenu">
                <c2-menu-item value="total-SUM">${t('totalSum')}</c2-menu-item>
                <c2-menu-item value="total-AVERAGE">${t('totalAverage')}</c2-menu-item>
                <c2-menu-item value="total-COUNTA">${t('totalCount')}</c2-menu-item>
                <c2-menu-item value="total-MIN">${t('totalMin')}</c2-menu-item>
                <c2-menu-item value="total-MAX">${t('totalMax')}</c2-menu-item>
              </c2-menu>
            </c2-menu-item>`
          : nothing
      }
      <hr />
      <c2-menu-item type="checkbox" value="bold" ?checked=${Boolean(style.bold)}>${TABLE_ICONS.bold}${t('bold')}</c2-menu-item>
      <c2-menu-item value="text-colour">${TABLE_ICONS.textColour}${t('textColour')}${palette('color', style.color)}</c2-menu-item>
      <c2-menu-item value="background-colour">${TABLE_ICONS.background}${t('backgroundColour')}${palette('background', style.background)}</c2-menu-item>
      <c2-menu-item value="text-size"
        >${TABLE_ICONS.size}${t('textSize')}
        <c2-menu slot="submenu">
          ${(['small', 'normal', 'large'] as const).map(
            (size) =>
              html`<c2-menu-item type="radio" name="size" value=${`size-${size}`} ?checked=${(style.size ?? 'normal') === size}
                >${t(size === 'small' ? 'sizeSmall' : size === 'large' ? 'sizeLarge' : 'sizeNormal')}</c2-menu-item
              >`,
          )}
        </c2-menu>
      </c2-menu-item>
      <hr />
      ${rows ? html`<c2-menu-item value="delete-rows" destructive>${TABLE_ICONS.delete}${t('deleteRows')}</c2-menu-item>` : nothing}
      ${columns ? html`<c2-menu-item value="delete-columns" destructive>${TABLE_ICONS.delete}${t('deleteColumns')}</c2-menu-item>` : nothing}
      <hr />
      <c2-menu-item type="checkbox" value="formula-bar" ?checked=${formulaBar}>${TABLE_ICONS.formulaBar}${t('formulaBar')}</c2-menu-item>
      <c2-menu-item type="checkbox" value="summary" ?checked=${summary}>${TABLE_ICONS.totals}${t('selectionTotals')}</c2-menu-item>
      <hr />
      <c2-menu-item value="delete-table" destructive>${TABLE_ICONS.delete}${t('deleteTable')}</c2-menu-item>
    `
  }

  private async pick({ value, context }: ContextMenuSelectEventDetail) {
    if (value === 'formula-bar') return this.setOption('formulaBar')
    if (value === 'summary') return this.setOption('summary')
    if (value === 'delete-table') return this.remove()
    const data = context.data as SpreadsheetContextMenuData | undefined
    if (!data) return
    await this.ready()
    const { start, end } = data
    const rowCount = end.row - start.row + 1
    const columnCount = end.column - start.column + 1
    const sheet = this.sheet
    if (value === 'rename-column') return sheet.renameColumn(start.column)
    const format = /^(bold|color|background|size)(?:-(\w+))?$/.exec(value)
    if (format) {
      const [, kind, name] = format
      const change: SpreadsheetStyleChange =
        kind === 'bold'
          ? { bold: !sheet.getStyle(data.active)?.bold }
          : kind === 'size'
            ? { size: name as 'small' | 'normal' | 'large' }
            : { [kind]: name === 'default' ? null : (name as PageEditorColor) }
      sheet.setStyle(data.range, change)
      this.write()
      return sheet.focus()
    }
    if (value.startsWith('total-')) {
      // Under each column of the range (after a one-row range), as the totals bar's buttons do.
      sheet.insertTotal(value.slice(6) as SpreadsheetTotal, data.range)
      this.write()
      return sheet.focus()
    }
    if (value === 'row-above') sheet.insertRows(start.row, rowCount)
    else if (value === 'row-below') sheet.insertRows(end.row + 1, rowCount)
    else if (value === 'column-left') sheet.insertColumns(start.column, columnCount)
    else if (value === 'column-right') sheet.insertColumns(end.column + 1, columnCount)
    else if (value === 'delete-rows') sheet.deleteRows(start.row, rowCount)
    else if (value === 'delete-columns') sheet.deleteColumns(start.column, columnCount)
    else return
    this.write()
    sheet.focus()
  }

  private updateIdle() {
    let focused: Element | null = document.activeElement
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement
    const inside = Boolean(focused && (this.dom.contains(focused) || this.dom.contains((focused.getRootNode() as ShadowRoot).host ?? null)))
    this.dom.classList.toggle('idle', !this.menuOpen && !(inside || this.dom.matches(':focus-within')))
  }

  /** Removes the table, leaving the caret where it stood. */
  private remove() {
    const pos = this.getPos()
    if (pos === undefined) return
    const tr = this.view.state.tr.delete(pos, pos + this.node.nodeSize)
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size))))
    this.view.dispatch(tr.scrollIntoView())
    this.view.focus()
  }

  /** Keys the sheet let through (it keeps those of an edit): the arrows past its edges and Escape leave the table. */
  private handleKey(event: KeyboardEvent) {
    const pos = this.getPos()
    if (event.target !== this.sheet || pos === undefined || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const row = singleCellRow(this.selectionAtKey)
    const last = this.lastRow()
    let exit: TableExit | null = null
    if (event.key === 'ArrowUp' && row === 0) exit = 'before'
    else if (event.key === 'ArrowDown' && row === last) exit = 'after'
    else if (event.key === 'Escape' && row >= 0) exit = 'select'
    if (!exit) return
    event.preventDefault()
    this.settings.onLeave(pos, exit)
  }

  stopEvent() {
    return true
  }

  ignoreMutation() {
    return true
  }

  destroy() {
    this.settings.live.delete(this)
  }
}
