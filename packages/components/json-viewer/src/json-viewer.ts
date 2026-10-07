import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import {
  copyText,
  filterVisible,
  flatten,
  formatPath,
  isBranch,
  kindOf,
  leafText,
  search,
  type JsonPathFormat,
  type JsonPathSegment,
  type JsonRow,
  type SearchResult,
} from './json-model.js'
import styles from './json-viewer.scss?inline'

export type { JsonPathFormat, JsonPathSegment, JsonValueKind } from './json-model.js'
export { formatPath } from './json-model.js'

const COPIED_DURATION = 1200

export interface JsonViewerCopiedEventDetail {
  /** What reached the clipboard. */
  text: string
  /** `path` for a copied path, `value` for a copied value. */
  kind: 'path' | 'value'
  /** Path of the node, as segments. */
  path: JsonPathSegment[]
}

export interface JsonViewerExpansionChangeEventDetail {
  /** Path of the branch, written in `path-format`. */
  path: string
  /** Path of the branch, as segments. */
  segments: JsonPathSegment[]
  expanded: boolean
}

/** Events fired by {@link JsonViewer}, keyed for `addEventListener`. */
export interface JsonViewerEventMap {
  copied: CustomEvent<JsonViewerCopiedEventDetail>
  'copy-error': CustomEvent<{ error: unknown }>
  'expansion-change': CustomEvent<JsonViewerExpansionChangeEventDetail>
}

export interface JsonViewer {
  addEventListener: TypedAddEventListener<JsonViewer, JsonViewerEventMap>
  removeEventListener: TypedRemoveEventListener<JsonViewer, JsonViewerEventMap>
}

/**
 * A collapsible, searchable JSON tree. Every line can copy its path or its value.
 *
 * Hand it any JSON value through `data`, as a property or as a JSON string in the attribute:
 *
 * ```html
 * <c2-json-viewer data='{"user":{"name":"Ada","roles":["admin"]}}'></c2-json-viewer>
 * ```
 *
 * The top-level entries of an object or array are the first lines; a branch shows its size while collapsed.
 * `expand-depth` decides how many levels start open, and `expandAll()` / `collapseAll()` reset every branch.
 * A branch with more than `page-size` children shows that many and a "show more" line for the rest.
 *
 * `search` highlights every key and value containing the text (case-insensitive) and opens the branches on the
 * way to each match; `filter` also hides the lines that lead to no match. The viewer has no search box of its
 * own, so pair it with `c2-search-field`. `searchMatches` lists the paths that matched.
 *
 * Paths are written as JSONPath (`$.user.roles[0]`) or, with `path-format="pointer"`, as JSON Pointer
 * (`/user/roles/0`). A circular reference shows as `[Circular]` rather than recursing.
 *
 * ### Keyboard
 *
 * Arrow Up and Down walk the lines. Arrow Right opens a branch, then moves to its first child; Arrow Left closes
 * it, then moves to its parent. Home and End jump to the ends, Enter and Space toggle a branch (or reveal the
 * rest of a long one), `*` opens every sibling. `C` (or Ctrl/Cmd + C) copies the focused line's value, `P` its path.
 *
 * @tag c2-json-viewer
 *
 * @slot empty - Shown instead of the tree while `data` is undefined.
 *
 * @csspart tree - The scrolling container holding the lines.
 * @csspart row - One line.
 * @csspart key - The key of a line.
 * @csspart value - The value of a leaf, or the size summary of a branch.
 *
 * @event {CustomEvent<JsonViewerCopiedEventDetail>} copied - Fired after a path or value reached the clipboard.
 * @event {CustomEvent<{ error: unknown }>} copy-error - Fired when the clipboard write failed.
 * @event {CustomEvent<JsonViewerExpansionChangeEventDetail>} expansion-change - Fired after the user opens or closes a branch. Does not bubble.
 *
 * @cssproperty {color} [--c2-json-viewer--background-color=#ffffff] - Background of the viewer.
 * @cssproperty {color} [--c2-json-viewer--color=#18181b] - Text colour, and the colour of punctuation.
 * @cssproperty {font-family} [--c2-json-viewer--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace] - Font of every line.
 * @cssproperty {font-size} [--c2-json-viewer--font-size=12px] - Font size of every line.
 * @cssproperty {line-height} [--c2-json-viewer--line-height=1.6] - Line height of every line.
 * @cssproperty {border} [--c2-json-viewer--border=1px solid #e4e4e7] - Border around the viewer.
 * @cssproperty {border-radius} [--c2-json-viewer--border-radius=8px] - Corner radius of the viewer.
 * @cssproperty {padding} [--c2-json-viewer--padding=6px] - Space around the lines.
 * @cssproperty {pixel} --c2-json-viewer--max-height - Height at which the viewer starts scrolling.
 * @cssproperty {pixel} [--c2-json-viewer__row--min-height=24px] - Minimum height of a line.
 * @cssproperty {padding} [--c2-json-viewer__row--padding-inline=6px] - Horizontal space inside a line.
 * @cssproperty {pixel} [--c2-json-viewer__row--indent=16px] - Indentation per level of depth.
 * @cssproperty {border-radius} [--c2-json-viewer__row--border-radius=4px] - Corner radius of a hovered or focused line.
 * @cssproperty {color} [--c2-json-viewer__row__hover--background-color=#f4f4f5] - Background of the hovered line.
 * @cssproperty {outline} [--c2-json-viewer__row__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Ring around the keyboard-focused line.
 * @cssproperty {color} [--c2-json-viewer__twisty--color=#71717a] - Colour of the expand arrow.
 * @cssproperty {color} [--c2-json-viewer__key--color=#6f42c1] - Colour of object keys.
 * @cssproperty {color} [--c2-json-viewer__index--color=#71717a] - Colour of array indexes.
 * @cssproperty {color} [--c2-json-viewer__string--color=#116329] - Colour of string values.
 * @cssproperty {color} [--c2-json-viewer__number--color=#0550ae] - Colour of number values.
 * @cssproperty {color} [--c2-json-viewer__boolean--color=#b35900] - Colour of `true` and `false`.
 * @cssproperty {color} [--c2-json-viewer__null--color=#71717a] - Colour of `null` and `[Circular]`.
 * @cssproperty {color} [--c2-json-viewer__summary--color=#71717a] - Colour of a branch's size summary.
 * @cssproperty {color} [--c2-json-viewer__match--background-color=rgba(250, 204, 21, 0.4)] - Highlight behind search matches.
 * @cssproperty {color} --c2-json-viewer__match--color - Text colour of search matches. Defaults to the token colour.
 * @cssproperty {color} [--c2-json-viewer__more--color=rgb(2, 101, 220)] - Colour of the "show more" line.
 * @cssproperty {color} [--c2-json-viewer__action--color=#71717a] - Colour of the copy buttons.
 * @cssproperty {color} [--c2-json-viewer__action__hover--background-color=#e4e4e7] - Background of a hovered copy button.
 * @cssproperty {color} [--c2-json-viewer__action__copied--color=rgb(0, 122, 77)] - Colour of a copy button after a successful copy.
 * @cssproperty {color} [--c2-json-viewer__empty--color=#71717a] - Colour of the empty message.
 * @cssproperty {padding} [--c2-json-viewer__empty--padding=18px] - Space around the empty message.
 */
@customElement('c2-json-viewer')
export class JsonViewer extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The JSON value to show. As an attribute it is parsed as JSON. */
  @property({ converter: jsonPropertyConverter }) data: unknown

  /** How many levels start open: 1 shows the top-level entries closed, 2 also opens them. Applied when `data` changes. */
  @property({ type: Number, attribute: 'expand-depth' }) expandDepth = 2

  /** Highlights the keys and values containing this text and opens the branches leading to them. */
  @property({ type: String }) search = ''

  /** With `search`, hides every line that leads to no match. */
  @property({ type: Boolean }) filter = false

  /** Shows object keys in alphabetical order rather than insertion order. */
  @property({ type: Boolean, attribute: 'sort-keys' }) sortKeys = false

  /** How copied and reported paths are written: `jsonpath` (`$.a[0]`) or `pointer` (`/a/0`). */
  @property({ type: String, attribute: 'path-format' }) pathFormat: JsonPathFormat = 'jsonpath'

  /** How many children of a branch are shown before a "show more" line. */
  @property({ type: Number, attribute: 'page-size' }) pageSize = 100

  /** Accessible name of the tree. */
  @property({ type: String }) label = 'JSON'

  /** Branches opened or closed by the user, overriding the depth rule. */
  @state() private overrides = new Map<string, boolean>()
  /** Branches toggled while a search is active; dropped with the search so the earlier expansion comes back. */
  @state() private searchOverrides = new Map<string, boolean>()
  /** Branches below this level start closed. Reset from `expandDepth` with the data. */
  @state() private openDepth = 2
  @state() private pages = new Map<string, number>()
  @state() private focusedId: string | undefined
  @state() private copied: { id: string; kind: 'path' | 'value' } | undefined

  private searchResult: SearchResult | undefined
  private visible: Set<string> | undefined
  private rows: JsonRow[] = []
  private copiedTimer: ReturnType<typeof setTimeout> | undefined

  /** Paths of the nodes matching `search`, in document order, written in `path-format`. */
  get searchMatches(): string[] {
    return (this.searchResult?.matches ?? []).map((id) => formatPath(this.segmentsOf(id), this.pathFormat))
  }

  /** Opens every branch. */
  expandAll() {
    this.openDepth = Number.POSITIVE_INFINITY
    this.overrides = new Map()
  }

  /** Closes every branch, leaving the top-level entries. */
  collapseAll() {
    this.openDepth = 1
    this.overrides = new Map()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    clearTimeout(this.copiedTimer)
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('data') || changed.has('expandDepth')) {
      this.openDepth = this.expandDepth
      this.overrides = new Map()
      this.pages = new Map()
    }
    if (changed.has('data') || changed.has('search') || changed.has('sortKeys') || changed.has('filter')) {
      const query = this.search.trim()
      this.searchOverrides = new Map()
      this.searchResult = query ? search(this.data, query, this.sortKeys) : undefined
      this.visible = this.searchResult && this.filter ? filterVisible(this.data, this.searchResult, this.sortKeys) : undefined
    }
    this.rows = flatten(
      this.data,
      {
        isExpanded: (id, level) => this.isExpanded(id, level),
        limit: (id) => Math.max(this.pages.get(id) ?? this.pageSize, (this.searchResult?.deepest.get(id) ?? -1) + 1),
        visible: this.visible,
      },
      this.sortKeys,
    )
    if (!this.rows.some((row) => row.id === this.focusedId)) this.focusedId = this.rows[0]?.id
  }

  private isExpanded(id: string, level: number): boolean {
    if (this.searchResult) {
      const toggled = this.searchOverrides.get(id)
      if (toggled !== undefined) return toggled
      if (this.searchResult.deepest.has(id)) return true
    }
    return this.overrides.get(id) ?? level < this.openDepth
  }

  override render() {
    if (this.data === undefined) {
      return html`<div class="empty" part="tree"><slot name="empty">No data</slot></div>`
    }
    const rootKind = kindOf(this.data)
    if (isBranch(rootKind) && this.rows.length === 0 && !this.searchResult) {
      return html`<div class="empty" part="tree">${rootKind === 'array' ? '[]' : '{}'}</div>`
    }
    const matches = new Set(this.searchResult?.matches)
    return html`
      <div class="tree" part="tree" role="tree" aria-label=${this.label} @keydown=${this.onKeydown} @click=${this.onClick} @focusin=${this.onFocusin}>
        ${
          this.rows.length === 0
            ? html`<div class="empty" role="none">No match</div>`
            : repeat(
                this.rows,
                (row) => row.id,
                (row) => this.renderRow(row, matches.has(row.id)),
              )
        }
      </div>
    `
  }

  private renderRow(row: JsonRow, matched: boolean): TemplateResult {
    const branch = isBranch(row.kind)
    const focused = row.id === this.focusedId
    if (row.more !== undefined) {
      return html`<div
        class="row more"
        part="row"
        role="treeitem"
        data-id=${row.id}
        aria-level=${row.level}
        aria-posinset=${row.posinset}
        aria-setsize=${row.setsize}
        tabindex=${focused ? 0 : -1}
        style="--level: ${row.level}"
      >
        <span class="twisty" aria-hidden="true"></span>
        <span class="more-label">Show ${Math.min(row.more, this.pageSize)} more of ${row.more}</span>
      </div>`
    }
    const copied = this.copied?.id === row.id ? this.copied.kind : undefined
    return html`<div
      class="row ${matched ? 'matched' : ''}"
      part="row"
      role="treeitem"
      data-id=${row.id}
      aria-level=${row.level}
      aria-posinset=${row.posinset}
      aria-setsize=${row.setsize}
      aria-expanded=${branch && row.size > 0 ? String(row.expanded) : nothing}
      aria-keyshortcuts="C P"
      tabindex=${focused ? 0 : -1}
      style="--level: ${row.level}"
    >
      <span class="twisty ${branch && row.size > 0 ? 'branch' : ''}" aria-hidden="true">
        ${
          branch && row.size > 0
            ? html`<svg viewBox="0 0 16 16" width="12" height="12">
                <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>`
            : nothing
        }
      </span>
      ${
        row.key === undefined
          ? nothing
          : html`<span class="key ${typeof row.key === 'number' ? 'index' : ''}" part="key">${this.highlight(String(row.key))}</span
              ><span class="colon">:</span>`
      }
      ${this.renderValue(row)}
      <span class="actions" aria-hidden="true"> ${this.renderAction('path', copied === 'path')} ${this.renderAction('value', copied === 'value')} </span>
    </div>`
  }

  private renderValue(row: JsonRow): TemplateResult {
    switch (row.kind) {
      case 'object':
      case 'array': {
        const [open, close] = row.kind === 'array' ? ['[', ']'] : ['{', '}']
        const unit = row.kind === 'array' ? (row.size === 1 ? 'item' : 'items') : row.size === 1 ? 'key' : 'keys'
        if (row.size === 0) return html`<span class="value summary" part="value">${open}${close}</span>`
        return html`<span class="value summary" part="value"
          >${open}${row.expanded ? nothing : html`…${close}`} <span class="count">${row.size} ${unit}</span></span
        >`
      }
      case 'string':
        return html`<span class="value string" part="value">"${this.highlight(leafText(row.value, row.kind))}"</span>`
      default:
        return html`<span class="value ${row.kind}" part="value">${this.highlight(leafText(row.value, row.kind))}</span>`
    }
  }

  private renderAction(kind: 'path' | 'value', copied: boolean): TemplateResult {
    const label = kind === 'path' ? 'Copy path' : 'Copy value'
    return html`<span class="action ${copied ? 'copied' : ''}" data-action=${kind} title=${copied ? 'Copied' : label}>
      ${
        copied
          ? html`<svg viewBox="0 0 16 16" width="12" height="12">
              <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>`
          : kind === 'path'
            ? html`<svg viewBox="0 0 16 16" width="12" height="12">
                <path
                  d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
              </svg>`
            : html`<svg viewBox="0 0 16 16" width="12" height="12">
                <rect x="5.5" y="5.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4" />
                <path d="M10.5 3.5h-6a1 1 0 00-1 1v6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              </svg>`
      }
    </span>`
  }

  /** Wraps each case-insensitive occurrence of the search text in a `<mark>`. */
  private highlight(text: string): TemplateResult | string {
    const query = this.search.trim().toLowerCase()
    if (!query) return text
    const lower = text.toLowerCase()
    const parts: (TemplateResult | string)[] = []
    let from = 0
    for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, from)) {
      parts.push(text.slice(from, at), html`<mark part="match">${text.slice(at, at + query.length)}</mark>`)
      from = at + query.length
    }
    if (from === 0) return text
    parts.push(text.slice(from))
    return html`${parts}`
  }

  private rowOf(event: Event): JsonRow | undefined {
    const element = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.dataset.id !== undefined)
    return element ? this.rows.find((row) => row.id === element.dataset.id) : undefined
  }

  private onFocusin = (event: FocusEvent) => {
    const row = this.rowOf(event)
    if (row) this.focusedId = row.id
  }

  private onClick = (event: MouseEvent) => {
    const row = this.rowOf(event)
    if (!row) return
    this.focusedId = row.id
    const action = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.dataset.action !== undefined)?.dataset.action
    if (action === 'path' || action === 'value') {
      void this.copy(row, action)
      return
    }
    this.activate(row)
  }

  private onKeydown = (event: KeyboardEvent) => {
    const index = this.rows.findIndex((row) => row.id === this.focusedId)
    const row = this.rows[index]
    if (!row) return
    const branch = isBranch(row.kind) && row.size > 0
    const modifier = event.ctrlKey || event.metaKey
    let target: JsonRow | undefined
    switch (event.key) {
      case 'ArrowDown':
        target = this.rows[index + 1]
        break
      case 'ArrowUp':
        target = this.rows[index - 1]
        break
      case 'Home':
        target = this.rows[0]
        break
      case 'End':
        target = this.rows[this.rows.length - 1]
        break
      case 'ArrowRight':
        if (branch && !row.expanded) this.toggle(row, true)
        else if (branch && this.rows[index + 1]?.level === row.level + 1) target = this.rows[index + 1]
        break
      case 'ArrowLeft':
        if (branch && row.expanded) this.toggle(row, false)
        else target = this.parentOf(index)
        break
      case 'Enter':
      case ' ':
        this.activate(row)
        break
      case '*':
        for (const sibling of this.siblingsOf(index)) if (isBranch(sibling.kind) && sibling.size > 0 && !sibling.expanded) this.toggle(sibling, true)
        break
      case 'c':
      case 'C':
        // Leave Ctrl/Cmd + C alone while the user has text selected: they are copying that.
        if (row.more !== undefined || event.altKey || (modifier && getSelection()?.toString())) return
        void this.copy(row, 'value')
        break
      case 'p':
      case 'P':
        if (modifier || row.more !== undefined || event.altKey) return
        void this.copy(row, 'path')
        break
      default:
        return
    }
    event.preventDefault()
    if (target) void this.focusRow(target.id)
  }

  private parentOf(index: number): JsonRow | undefined {
    const level = this.rows[index].level
    for (let i = index - 1; i >= 0; i--) if (this.rows[i].level < level) return this.rows[i]
    return undefined
  }

  private siblingsOf(index: number): JsonRow[] {
    const level = this.rows[index].level
    const parent = this.parentOf(index)
    const start = parent ? this.rows.indexOf(parent) + 1 : 0
    const siblings: JsonRow[] = []
    for (let i = start; i < this.rows.length && this.rows[i].level >= level; i++) if (this.rows[i].level === level) siblings.push(this.rows[i])
    return siblings
  }

  private activate(row: JsonRow) {
    if (row.more !== undefined) {
      const parentId = row.id.slice(0, -'/#more'.length)
      const shown = row.setsize - 1
      this.pages = new Map(this.pages).set(parentId, shown + this.pageSize)
      return
    }
    if (isBranch(row.kind) && row.size > 0) this.toggle(row, !row.expanded)
  }

  private toggle(row: JsonRow, expanded: boolean) {
    if (this.searchResult) this.searchOverrides = new Map(this.searchOverrides).set(row.id, expanded)
    else this.overrides = new Map(this.overrides).set(row.id, expanded)
    this.dispatchEvent(
      new CustomEvent<JsonViewerExpansionChangeEventDetail>('expansion-change', {
        detail: { path: formatPath(row.path, this.pathFormat), segments: [...row.path], expanded },
      }),
    )
  }

  private async focusRow(id: string) {
    this.focusedId = id
    await this.updateComplete
    this.renderRoot.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus()
  }

  private async copy(row: JsonRow, kind: 'path' | 'value') {
    const text = kind === 'path' ? formatPath(row.path, this.pathFormat) : copyText(row.value)
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(text)
    } catch (error) {
      this.dispatchEvent(new CustomEvent('copy-error', { detail: { error }, bubbles: true, composed: true }))
      return
    }
    this.copied = { id: row.id, kind }
    clearTimeout(this.copiedTimer)
    this.copiedTimer = setTimeout(() => (this.copied = undefined), COPIED_DURATION)
    this.dispatchEvent(new CustomEvent<JsonViewerCopiedEventDetail>('copied', { detail: { text, kind, path: [...row.path] }, bubbles: true, composed: true }))
  }

  private segmentsOf(id: string): JsonPathSegment[] {
    const segments: JsonPathSegment[] = []
    let node: unknown = this.data
    for (const raw of id.split('/').slice(1)) {
      const key = raw.replace(/~1/g, '/').replace(/~0/g, '~')
      if (Array.isArray(node)) {
        segments.push(Number(key))
        node = node[Number(key)]
      } else {
        segments.push(key)
        node = node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined
      }
    }
    return segments
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-json-viewer': JsonViewer
  }
}
