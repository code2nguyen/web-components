import type { Node as ProseNode } from 'prosemirror-model'
import { TextSelection } from 'prosemirror-state'
import type { Decoration, EditorView, NodeView } from 'prosemirror-view'
import { LANGUAGES, languageLabel, normalizeLanguage } from './languages'

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

/** Bullet, numbered and to-do items: a marker the caret cannot enter, then the item's text. */
export class ItemView implements NodeView {
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
  ) {
    this.node = node
    this.dom = element('div', 'item')
    this.marker = element('span', 'marker', { contenteditable: 'false' })
    if (node.attrs.kind === 'todo') {
      this.marker.classList.add('box')
      this.marker.setAttribute('role', 'checkbox')
      this.marker.setAttribute('aria-label', 'Done')
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

  stopEvent(event: Event) {
    return this.marker.contains(event.target as Node)
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }) {
    // The placeholder lives in attributes of the text element, which the view writes itself.
    if (mutation.type === 'attributes' && mutation.target === this.contentDOM) return true
    return mutation.type !== 'selection' && !this.contentDOM.contains(mutation.target)
  }
}

export interface CodeBlockOptions {
  /** How the platform spells the modifier key, for the hint under a focused block. */
  modKey: string
  onCopy?: (text: string) => void
}

/** A code block: language picker, wrap toggle and copy button over a `<pre>`, with line numbers in a gutter. */
export class CodeBlockView implements NodeView {
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
    this.hint.innerHTML = `<span><kbd>Tab</kbd> indent</span><span><kbd>${settings.modKey}↵</kbd> or <kbd>↵↵↵</kbd> leave the block</span>`
    const tools = element('div', 'code-tools')
    this.wrapButton = element('button', 'code-tool', { type: 'button', 'aria-label': 'Wrap long lines', 'aria-pressed': 'false', title: 'Wrap long lines' })
    this.wrapButton.innerHTML = WRAP
    this.wrapButton.addEventListener('click', () => {
      const wrap = !this.dom.classList.contains('wrap')
      this.dom.classList.toggle('wrap', wrap)
      this.wrapButton.setAttribute('aria-pressed', String(wrap))
    })
    this.copyButton = element('button', 'code-tool code-copy', { type: 'button' })
    this.copyButton.addEventListener('click', () => this.copy())
    this.renderCopy(false)
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

    this.menu = element('div', 'code-menu', { popover: 'auto', role: 'dialog', 'aria-label': 'Language', contenteditable: 'false' })
    this.search = element('input', 'code-search', {
      type: 'text',
      placeholder: 'Search languages…',
      'aria-label': 'Search languages',
      role: 'combobox',
      'aria-expanded': 'true',
      'aria-controls': `${this.id}-list`,
      'aria-autocomplete': 'list',
    })
    this.options = element('div', 'code-options', { role: 'listbox', id: `${this.id}-list`, 'aria-label': 'Languages' })
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
    this.sync()
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
    this.languageButton.append(languageLabel(language))
    this.languageButton.insertAdjacentHTML('beforeend', CARET)
    this.languageButton.setAttribute('aria-label', `Language: ${languageLabel(language)}`)
    this.languageButton.disabled = !this.view.editable
    const lines = this.node.textContent.split('\n').length
    if (lines !== this.lines) {
      this.lines = lines
      this.gutter.textContent = Array.from({ length: lines }, (_, index) => index + 1).join('\n')
    }
  }

  private renderCopy(copied: boolean) {
    this.copyButton.innerHTML = COPY
    this.copyButton.append(copied ? 'Copied' : 'Copy')
    this.copyButton.setAttribute('aria-label', copied ? 'Copied' : 'Copy code')
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
    return LANGUAGES.filter((each) => !query || each.label.toLowerCase().includes(query) || each.id.includes(query))
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
        option.append(each.label)
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
    clearTimeout(this.copyTimer)
    if (this.menu.matches(':popover-open')) this.menu.hidePopover()
  }
}
