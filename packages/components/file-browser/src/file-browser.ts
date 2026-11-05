import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { query, state } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { property, arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/tree'
import '@c2n/breadcrumb'
import '@c2n/link-button'
import '@c2n/search-field'
import '@c2n/button'
import '@c2n/button-group'
import '@c2n/menu'
import '@c2n/menu/menu-item.js'
import '@c2n/status-panel'
import '@c2n/skeleton'
import type { Menu } from '@c2n/menu'
import type { MenuSelectEventDetail } from '@c2n/menu/menu-item.js'
import type { TreeNode, TreeItemContext, TreeSelectionChangeEventDetail, TreeExpansionChangeEventDetail } from '@c2n/tree/tree-types.js'
import type { SearchFieldSearchDetail } from '@c2n/search-field'
import { fileCategory, fileFormat, fileIcon, type FileCategory } from './file-kind.js'
import { fileBrowserMessages } from './messages.js'
import styles from './file-browser.scss?inline'

export { fileCategory, fileFormat, type FileCategory } from './file-kind.js'
export { fileBrowserMessages } from './messages.js'

/** A folder or a file. The list is flat: `parent` links an item to its folder. */
export interface FileBrowserItem {
  /** Unique id. */
  id: string
  /** Display name, with its extension for a file. */
  name: string
  /** The id of the folder holding it; empty, `null` or missing for the root. */
  parent?: string | null
  kind: 'folder' | 'file'
  /** Size in bytes. */
  size?: number
  /** Last modification: an ISO 8601 string or a millisecond timestamp. */
  modified?: string | number
  /** MIME type, such as `image/png`. The extension is used when it is missing. */
  type?: string
  /** URL of a preview image, shown in the grid view. */
  thumbnail?: string
}

/** A command offered in the context menu and the selection bar. */
export interface FileBrowserAction {
  /** Reported as `action` in `item-action`. `rename` edits the name in place; `delete` is also bound to the Delete key. */
  id: string
  label: string
  /** Offered when several items are selected. */
  multiple?: boolean
  /** Drawn as a destructive command. */
  destructive?: boolean
}

export type FileBrowserView = 'list' | 'grid'
export type FileBrowserSort = 'name' | 'modified' | 'size' | 'kind'
export type FileBrowserSortDirection = 'asc' | 'desc'
export type FileBrowserSelection = 'single' | 'multiple'
/** Loads a folder's items the first time it opens; `''` is the root. */
export type FileBrowserLoader = (folder: string) => Promise<FileBrowserItem[]>

export interface FileBrowserFolderChangeDetail {
  /** The open folder's id, `''` for the root. */
  folder: string
}
export interface FileBrowserItemDetail {
  item: FileBrowserItem
}
export interface FileBrowserSelectionChangeDetail {
  value: string[]
  items: FileBrowserItem[]
}
export interface FileBrowserItemActionDetail {
  action: string
  items: FileBrowserItem[]
}
export interface FileBrowserItemRenameDetail {
  item: FileBrowserItem
  /** The new name, trimmed. */
  name: string
}
export interface FileBrowserItemMoveDetail {
  items: FileBrowserItem[]
  /** The id of the folder they were dropped on, `''` for the root. */
  target: string
}
export interface FileBrowserFilesDropDetail {
  files: File[]
  /** The id of the folder they were dropped on, `''` for the root. */
  folder: string
}
export interface FileBrowserSearchDetail {
  query: string
  folder: string
}
export interface FileBrowserViewChangeDetail {
  view: FileBrowserView
}
export interface FileBrowserSortChangeDetail {
  sort: FileBrowserSort
  direction: FileBrowserSortDirection
}
export interface FileBrowserLoadErrorDetail {
  folder: string
  error: unknown
}

/** Events fired by {@link FileBrowser}, keyed for `addEventListener`. */
export interface FileBrowserEventMap {
  'folder-change': CustomEvent<FileBrowserFolderChangeDetail>
  'item-open': CustomEvent<FileBrowserItemDetail>
  'selection-change': CustomEvent<FileBrowserSelectionChangeDetail>
  'item-action': CustomEvent<FileBrowserItemActionDetail>
  'item-rename': CustomEvent<FileBrowserItemRenameDetail>
  'item-move': CustomEvent<FileBrowserItemMoveDetail>
  'files-drop': CustomEvent<FileBrowserFilesDropDetail>
  search: CustomEvent<FileBrowserSearchDetail>
  'view-change': CustomEvent<FileBrowserViewChangeDetail>
  'sort-change': CustomEvent<FileBrowserSortChangeDetail>
  'load-error': CustomEvent<FileBrowserLoadErrorDetail>
}

export interface FileBrowser {
  addEventListener: TypedAddEventListener<FileBrowser, FileBrowserEventMap>
  removeEventListener: TypedRemoveEventListener<FileBrowser, FileBrowserEventMap>
}

const ROOT_NODE = '\u001froot'
const DRAG_TYPE = 'application/x-c2-file-browser'
const asFolder = (id: string | null | undefined) => id ?? ''
const collators = new Map<string, Intl.Collator>()
/** A name collator per locale, made once: sorting reads it for every comparison. */
function collatorFor(locale: string): Intl.Collator {
  let collator = collators.get(locale)
  if (!collator) {
    collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
    collators.set(locale, collator)
  }
  return collator
}

/**
 * Folders and files, as in Google Drive, Dropbox or a CMS media library: a folder tree, breadcrumbs, search, sorting,
 * a list and a grid view, selection, a context menu, renaming and drag and drop. It is the interface over the app's
 * storage and never reads or writes files: every change is reported as an event, and the app updates `items`.
 *
 * `items` is a flat list of `{ id, name, parent, kind, size?, modified?, type?, thumbnail? }`; `parent` is a folder's id,
 * empty for the root. For a large tree, `loadChildren(folder)` returns a folder's items the first time it opens; they
 * are cached until `refresh()`. `folder` is the open folder, which the browser changes itself as the user navigates
 * (`folder-change`).
 *
 * The folder pane is a `c2-tree` of the folders; below `--c2-file-browser--narrow-width` it gives way, the breadcrumbs
 * carry the navigation, and an Up button opens the parent folder. The toolbar holds the breadcrumbs, a search field
 * (the open folder, by name; `search="remote"` fires `search` instead), a sort menu and a list/grid switch. In the list,
 * a column header sorts by it; folders always come first.
 *
 * Selection follows the desktop: a click selects one item, Ctrl/Cmd+click toggles one, Shift+click selects a range,
 * Ctrl/Cmd+A selects all, and in the list the check box toggles one. `value` holds the selected ids
 * (`selection-change`, which does not bubble). A double-click or Enter opens a folder or fires `item-open` for a file.
 *
 * `actions` fills the context menu (right-click, the menu key or Shift+F10, or the ⋯ button of a row) and the selection
 * bar; picking one fires `item-action`. An action with the id `rename` edits the name in place (also F2) and fires
 * `item-rename`; `delete` is bound to the Delete key. Dragging items onto a folder, in the list, the grid or the tree,
 * fires `item-move`; dropping files from the desktop fires `files-drop`.
 *
 * Both views are a multi-selectable list box: the arrow keys move through the items (all four in the grid), Shift
 * extends the selection, Ctrl/Cmd moves without selecting, Space toggles, Home and End jump to the ends, typing jumps
 * to a name, and Backspace opens the parent folder. Each item is named by its name, kind, size and date.
 *
 * @tag c2-file-browser
 *
 * @slot empty - Replaces the empty-folder panel.
 *
 * @csspart toolbar - The bar with the breadcrumbs, search, sort and view controls.
 * @csspart tree - The folder pane.
 * @csspart content - The scrolling list or grid.
 * @csspart item - Each item of the list or grid.
 * @csspart selection-bar - The bar shown while items are selected.
 *
 * @event {CustomEvent<FileBrowserFolderChangeDetail>} folder-change - The user opened another folder.
 * @event {CustomEvent<FileBrowserItemDetail>} item-open - The user opened a file (double-click or Enter).
 * @event {CustomEvent<FileBrowserSelectionChangeDetail>} selection-change - The user changed the selection. Does not bubble.
 * @event {CustomEvent<FileBrowserItemActionDetail>} item-action - The user picked an action for the selected items.
 * @event {CustomEvent<FileBrowserItemRenameDetail>} item-rename - The user renamed an item in place.
 * @event {CustomEvent<FileBrowserItemMoveDetail>} item-move - The user dropped items on a folder.
 * @event {CustomEvent<FileBrowserFilesDropDetail>} files-drop - The user dropped files from the desktop.
 * @event {CustomEvent<FileBrowserSearchDetail>} search - With `search="remote"`, the query to run.
 * @event {CustomEvent<FileBrowserViewChangeDetail>} view-change - The user switched between the list and the grid.
 * @event {CustomEvent<FileBrowserSortChangeDetail>} sort-change - The user changed the sort order.
 * @event {CustomEvent<FileBrowserLoadErrorDetail>} load-error - `loadChildren` rejected.
 *
 * @cssproperty {length} [--c2-file-browser--height=440px] - The browser's height.
 * @cssproperty {border} [--c2-file-browser--border=1px solid #e4e4e7]
 * @cssproperty {radius} [--c2-file-browser--border-radius=8px]
 * @cssproperty {color} [--c2-file-browser--background-color=#ffffff]
 * @cssproperty {color} [--c2-file-browser--color=#18181b]
 * @cssproperty {font-size} [--c2-file-browser--font-size=14px]
 * @cssproperty {length} [--c2-file-browser--narrow-width=560px] - Below this width the folder pane hides.
 * @cssproperty {border} [--c2-file-browser__divider--border=1px solid #e4e4e7] - Lines between the panes, the toolbar and the rows.
 * @cssproperty {length} [--c2-file-browser__tree--width=220px]
 * @cssproperty {color} [--c2-file-browser__tree--background-color=#fafafa]
 * @cssproperty {color} [--c2-file-browser__muted--color=#52525b] - Column headers, dates, sizes and kinds.
 * @cssproperty {length} [--c2-file-browser__row--height=36px]
 * @cssproperty {color} [--c2-file-browser__row__hover--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-file-browser__row__selected--background-color=#edf1fe]
 * @cssproperty {color} [--c2-file-browser__accent--color=rgb(2, 101, 220)] - Check boxes, the focus mark and drop targets.
 * @cssproperty {color} [--c2-file-browser__check__checked--color=#ffffff]
 * @cssproperty {outline} [--c2-file-browser__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {length} [--c2-file-browser__tile--min-width=128px] - The narrowest a grid tile gets.
 * @cssproperty {radius} [--c2-file-browser__tile--border-radius=8px]
 * @cssproperty {color} [--c2-file-browser__thumbnail--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-file-browser__selection-bar--background-color=#27272a]
 * @cssproperty {color} [--c2-file-browser__selection-bar--color=#fafafa]
 * @cssproperty {color} [--c2-file-browser__icon__folder--color=#e0a526]
 * @cssproperty {color} [--c2-file-browser__icon__pdf--color=#dc2626]
 * @cssproperty {color} [--c2-file-browser__icon__image--color=#0d9488]
 * @cssproperty {color} [--c2-file-browser__icon__video--color=#db2777]
 * @cssproperty {color} [--c2-file-browser__icon__audio--color=#9333ea]
 * @cssproperty {color} [--c2-file-browser__icon__archive--color=#a16207]
 * @cssproperty {color} [--c2-file-browser__icon__document--color=#2563eb]
 * @cssproperty {color} [--c2-file-browser__icon__spreadsheet--color=#16a34a]
 * @cssproperty {color} [--c2-file-browser__icon__presentation--color=#ea580c]
 * @cssproperty {color} [--c2-file-browser__icon__code--color=#7c3aed]
 * @cssproperty {color} [--c2-file-browser__icon__file--color=#71717a] - Text and unknown files.
 */
@customElement('c2-file-browser')
export class FileBrowser extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Every known folder and file, flat. JSON in markup. */
  @property({ converter: jsonPropertyConverter }) items: FileBrowserItem[] = []

  /** The open folder's id; empty for the root. */
  @property() folder = ''

  /** The root folder's name. Defaults to the "My files" message. */
  @property({ attribute: 'root-label' }) rootLabel = ''

  /** The browser's accessible name. Defaults to the "Files" message. */
  @property() label = ''

  /** `list` (the default) or `grid`. */
  @property() view: FileBrowserView = 'list'

  /** The column the items are sorted by. Folders always come first. */
  @property() sort: FileBrowserSort = 'name'

  /** `asc` (the default) or `desc`. */
  @property({ attribute: 'sort-direction' }) sortDirection: FileBrowserSortDirection = 'asc'

  /** `multiple` (the default) or `single`. */
  @property() selection: FileBrowserSelection = 'multiple'

  /** The selected ids. */
  @property({ converter: arrayPropertyConverter }) value: string[] = []

  /** The commands of the context menu and the selection bar. JSON in markup. */
  @property({ converter: jsonPropertyConverter }) actions: FileBrowserAction[] = []

  /** `local` (the default) filters the open folder by name; `remote` fires `search` for the app to answer. */
  @property() search: 'local' | 'remote' = 'local'

  /** Loads a folder's items the first time it opens. */
  @property({ attribute: false }) loadChildren?: FileBrowserLoader

  /** The locale for dates and sizes; the nearest `lang` when empty. */
  @property() locale = ''

  @state() private query = ''
  @state() private cursor = ''
  @state() private narrow = false
  /**
   * The folder tree is drawn from the first client update on. A server-rendered tree inside this shadow root would
   * hydrate after the tree has already written its rows' state (level, expanded, selected), a hydration mismatch; with
   * the pane empty on the server and on the first client render, the two agree and the tree then renders client-side.
   */
  @state() private treeReady = false
  @state() private loading = new Set<string>()
  @state() private loaded = new Map<string, FileBrowserItem[]>()
  /** The latest load started for each folder: an answer to an older one (made stale by `refresh()`) is dropped. */
  private loadGeneration = new Map<string, number>()
  @state() private expanded: string[] = []
  @state() private renaming = ''
  @state() private dropTarget: string | null = null
  @state() private menuPoint: { x: number; y: number } | null = null
  @state() private announcement = ''

  @query('.actions-menu') private actionsMenu?: Menu
  @query('.probe') private probe?: HTMLElement
  @query('.menu-point') private menuPointElement?: HTMLElement

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, fileBrowserMessages, () => this.locale)
  private anchorId = ''
  /** Set when a navigation should end with focus on the new folder's list, once it has rendered. */
  private pendingFocus = false
  private dragging: string[] = []
  private typeahead = ''
  private typeaheadTimer?: ReturnType<typeof setTimeout>
  private resizeObserver?: ResizeObserver
  private byId = new Map<string, FileBrowserItem>()
  private childrenOf = new Map<string, FileBrowserItem[]>()

  override connectedCallback(): void {
    super.connectedCallback()
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => requestAnimationFrame(() => this.measure()))
      this.resizeObserver.observe(this)
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    clearTimeout(this.typeaheadTimer)
  }

  /** Forgets what `loadChildren` returned, for one folder or all, and reloads the open folder. */
  refresh(folder?: string): void {
    const next = new Map(this.loaded)
    const stale = folder === undefined ? [...this.loading] : this.loading.has(folder) ? [folder] : []
    if (folder === undefined) next.clear()
    else next.delete(folder)
    this.loaded = next
    // A load still running for a refreshed folder answers with what was there before: forget it so a new one starts.
    for (const id of stale) this.loadGeneration.set(id, (this.loadGeneration.get(id) ?? 0) + 1)
    if (stale.length) this.loading = new Set([...this.loading].filter((id) => !stale.includes(id)))
    void this.ensureLoaded(this.folder)
  }

  /** Clears the selection. */
  clearSelection(): void {
    this.select([])
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('items') || changed.has('loaded')) this.index()
    if (changed.has('folder') || changed.has('items') || changed.has('loaded')) {
      const open = this.ancestors(this.folder).map((id) => this.treeValue(id))
      if (open.some((value) => !this.expanded.includes(value))) this.expanded = [...new Set([...this.expanded, ...open])]
    }
    if (changed.has('folder')) this.renaming = ''
  }

  protected override firstUpdated(): void {
    this.treeReady = true
    this.measure()
    void this.ensureLoaded(this.folder)
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('folder') && changed.get('folder') !== undefined) void this.ensureLoaded(this.folder)
    if (this.pendingFocus && this.isLoaded(this.folder)) {
      this.pendingFocus = false
      this.focusCursor()
    }
    this.internals.role = 'region'
    this.internals.ariaLabel = this.label || this.msg.t('files')
  }

  // ------------------------------------------------------------------------------------------------------ data

  private index(): void {
    const loaded = [...this.loaded.entries()].flatMap(([folder, entries]) => entries.map((entry) => ({ ...entry, parent: entry.parent ?? folder })))
    const seen = new Set<string>()
    const all: FileBrowserItem[] = []
    for (const entry of [...(Array.isArray(this.items) ? this.items : []), ...loaded]) {
      if (!entry || typeof entry.id !== 'string' || seen.has(entry.id)) continue
      seen.add(entry.id)
      all.push(entry)
    }
    this.byId = new Map(all.map((entry) => [entry.id, entry]))
    this.childrenOf = new Map()
    for (const entry of all) {
      const parent = asFolder(entry.parent)
      const list = this.childrenOf.get(parent)
      if (list) list.push(entry)
      else this.childrenOf.set(parent, [entry])
    }
  }

  private async ensureLoaded(folder: string): Promise<void> {
    const loader = this.loadChildren
    if (!loader || this.loaded.has(folder) || this.loading.has(folder)) return
    const generation = (this.loadGeneration.get(folder) ?? 0) + 1
    this.loadGeneration.set(folder, generation)
    const current = () => this.loadGeneration.get(folder) === generation
    this.loading = new Set([...this.loading, folder])
    try {
      const entries = await loader(folder)
      if (!current()) return
      this.loaded = new Map(this.loaded).set(folder, Array.isArray(entries) ? entries : [])
      if (folder === this.folder) this.announce(this.msg.t('opened', this.folderName(folder), Array.isArray(entries) ? entries.length : 0))
    } catch (error) {
      if (!current()) return
      this.loaded = new Map(this.loaded).set(folder, [])
      this.dispatchEvent(new CustomEvent('load-error', { detail: { folder, error }, bubbles: true, composed: true }))
    } finally {
      if (current()) {
        const next = new Set(this.loading)
        next.delete(folder)
        this.loading = next
      }
    }
  }

  private isLoaded(folder: string): boolean {
    return !this.loadChildren || this.loaded.has(folder)
  }

  private folderName(id: string): string {
    return id ? (this.byId.get(id)?.name ?? id) : this.rootLabel || this.msg.t('root')
  }

  /** The folder's chain from the root down: `''` (the root) first, the folder itself last. */
  private ancestors(id: string): string[] {
    const chain: string[] = []
    const seen = new Set<string>()
    let current: string = id
    while (current && !seen.has(current)) {
      seen.add(current)
      chain.unshift(current)
      current = asFolder(this.byId.get(current)?.parent)
    }
    return ['', ...chain]
  }

  private treeValue(id: string): string {
    return id || ROOT_NODE
  }

  /** The open folder's items as shown: filtered and sorted once per change of what they depend on. */
  private get visible(): FileBrowserItem[] {
    const children = this.childrenOf.get(this.folder)
    const locale = this.msg.locale
    const query = this.search === 'local' ? this.query.trim().toLocaleLowerCase(locale) : ''
    const memo = this.visibleMemo
    if (
      memo &&
      memo.children === children &&
      memo.locale === locale &&
      memo.query === query &&
      memo.sort === this.sort &&
      memo.direction === this.sortDirection
    ) {
      return memo.list
    }
    const list = this.sorted(children ?? [], locale, query)
    this.visibleMemo = { children, locale, query, sort: this.sort, direction: this.sortDirection, list }
    return list
  }

  private visibleMemo?: {
    children: FileBrowserItem[] | undefined
    locale: string
    query: string
    sort: FileBrowserSort
    direction: FileBrowserSortDirection
    list: FileBrowserItem[]
  }

  private sorted(children: FileBrowserItem[], locale: string, query: string): FileBrowserItem[] {
    let list = [...children]
    if (query) list = list.filter((entry) => entry.name.toLocaleLowerCase(locale).includes(query))
    const collator = collatorFor(locale)
    const direction = this.sortDirection === 'desc' ? -1 : 1
    const time = (entry: FileBrowserItem) => (entry.modified === undefined ? 0 : new Date(entry.modified).getTime() || 0)
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      const order =
        this.sort === 'modified'
          ? time(a) - time(b)
          : this.sort === 'size'
            ? (a.size ?? 0) - (b.size ?? 0)
            : this.sort === 'kind'
              ? collator.compare(this.kindOf(a), this.kindOf(b))
              : collator.compare(a.name, b.name)
      return order * direction || collator.compare(a.name, b.name)
    })
    return list
  }

  private selectedItems(): FileBrowserItem[] {
    return this.value.map((id) => this.byId.get(id)).filter((entry): entry is FileBrowserItem => !!entry)
  }

  // -------------------------------------------------------------------------------------------------- formatting

  private kindOf(entry: FileBrowserItem): string {
    const format = fileFormat(entry.name)
    switch (fileCategory(entry)) {
      case 'folder':
        return this.msg.t('kindFolder')
      case 'pdf':
        return this.msg.t('kindPdf')
      case 'image':
        return this.msg.t('kindImage', format)
      case 'video':
        return this.msg.t('kindVideo', format)
      case 'audio':
        return this.msg.t('kindAudio', format)
      case 'archive':
        return this.msg.t('kindArchive', format)
      case 'document':
        return this.msg.t('kindDocument')
      case 'spreadsheet':
        return this.msg.t('kindSpreadsheet')
      case 'presentation':
        return this.msg.t('kindPresentation')
      case 'text':
        return this.msg.t('kindText')
      case 'code':
        return this.msg.t('kindCode', format)
      default:
        return this.msg.t('kindFile', format)
    }
  }

  private formatSize(bytes: number | undefined): string {
    if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return ''
    const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte']
    let value = bytes
    let unit = 0
    while (value >= 1000 && unit < units.length - 1) {
      value /= 1000
      unit += 1
    }
    try {
      return new Intl.NumberFormat(this.msg.locale, {
        style: 'unit',
        unit: units[unit],
        unitDisplay: 'short',
        maximumFractionDigits: unit && value < 10 ? 1 : 0,
      }).format(value)
    } catch {
      return `${Math.round(value)} ${['B', 'KB', 'MB', 'GB', 'TB'][unit]}`
    }
  }

  private formatDate(modified: string | number | undefined): string {
    if (modified === undefined || modified === '') return ''
    const date = new Date(modified)
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(this.msg.locale, { dateStyle: 'medium' }).format(date)
  }

  private itemLabel(entry: FileBrowserItem): string {
    return this.msg.t('itemName', entry.name, this.kindOf(entry), entry.kind === 'file' ? this.formatSize(entry.size) : '', this.formatDate(entry.modified))
  }

  // ---------------------------------------------------------------------------------------------- navigation

  private navigate(folder: string, focus = true): void {
    if (folder === this.folder) return
    this.folder = folder
    this.select([])
    this.cursor = ''
    this.anchorId = ''
    this.query = ''
    this.pendingFocus = focus
    this.dispatchEvent(new CustomEvent('folder-change', { detail: { folder }, bubbles: true, composed: true }))
    if (this.isLoaded(folder)) this.announce(this.msg.t('opened', this.folderName(folder), this.childrenOf.get(folder)?.length ?? 0))
  }

  private open(entry: FileBrowserItem): void {
    if (entry.kind === 'folder') this.navigate(entry.id)
    else this.dispatchEvent(new CustomEvent('item-open', { detail: { item: entry }, bubbles: true, composed: true }))
  }

  private up(): void {
    if (!this.folder) return
    const from = this.folder
    this.navigate(asFolder(this.byId.get(from)?.parent))
    this.cursor = from
  }

  // ----------------------------------------------------------------------------------------------- selection

  private select(ids: string[]): void {
    const next = this.selection === 'single' ? ids.slice(-1) : [...new Set(ids)]
    if (next.length === this.value.length && next.every((id, index) => id === this.value[index])) return
    this.value = next
    this.dispatchEvent(new CustomEvent('selection-change', { detail: { value: [...next], items: this.selectedItems() } }))
  }

  private range(from: string, to: string): string[] {
    const ids = this.visible.map((entry) => entry.id)
    let start = ids.indexOf(from)
    const end = ids.indexOf(to)
    if (start < 0) start = end
    return ids.slice(Math.min(start, end), Math.max(start, end) + 1)
  }

  private pick(entry: FileBrowserItem, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }, toggle = false): void {
    const multiple = this.selection === 'multiple'
    if (multiple && event.shiftKey && this.anchorId) {
      this.select(this.range(this.anchorId, entry.id))
    } else if (multiple && (event.ctrlKey || event.metaKey || toggle)) {
      this.select(this.value.includes(entry.id) ? this.value.filter((id) => id !== entry.id) : [...this.value, entry.id])
      this.anchorId = entry.id
    } else {
      this.select([entry.id])
      this.anchorId = entry.id
    }
    this.cursor = entry.id
  }

  // ------------------------------------------------------------------------------------------------- keyboard

  private get cursorId(): string {
    const ids = this.visible.map((entry) => entry.id)
    return ids.includes(this.cursor) ? this.cursor : (ids.find((id) => this.value.includes(id)) ?? ids[0] ?? '')
  }

  private focusCursor(): void {
    const id = this.cursorId
    const option = id ? this.renderRoot.querySelector<HTMLElement>(`[role="option"][data-id="${CSS.escape(id)}"]`) : null
    // An empty folder has no item to hold focus: the content area takes it, so Backspace still goes back.
    const target = option ?? this.renderRoot.querySelector<HTMLElement>('.content')
    target?.focus()
    option?.scrollIntoView?.({ block: 'nearest' })
  }

  /** Items per row in the grid, from where the tiles wrap. */
  private columns(): number {
    if (this.view !== 'grid') return 1
    const tiles = [...this.renderRoot.querySelectorAll<HTMLElement>('.tile')]
    if (!tiles.length) return 1
    const top = tiles[0].offsetTop
    const count = tiles.findIndex((tile) => tile.offsetTop !== top)
    return count < 0 ? tiles.length : count
  }

  private onKeydown(event: KeyboardEvent): void {
    if (this.renaming || event.defaultPrevented) return
    // Keys typed in the column headers belong to their buttons.
    if (event.composedPath().some((node) => node instanceof HTMLElement && node.classList.contains('columns'))) return
    // Keys typed in the author's own content (the `empty` slot: a "New folder" field, a link) and in any editable
    // element belong to it, never to the browser's navigation.
    const origin = event.composedPath()[0]
    if (origin instanceof Node && origin !== this && this.contains(origin)) return
    if (origin instanceof HTMLElement && (origin.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(origin.tagName))) return
    const list = this.visible
    if (event.key === 'Backspace' || (event.altKey && event.key === 'ArrowUp')) {
      event.preventDefault()
      this.up()
      return
    }
    if (!list.length) return
    const ids = list.map((entry) => entry.id)
    const index = Math.max(0, ids.indexOf(this.cursorId))
    const current = list[index]
    const mod = event.ctrlKey || event.metaKey
    const rtl = getComputedStyle(this).direction === 'rtl'
    let target = -1
    switch (event.key) {
      case 'ArrowDown':
        target = Math.min(ids.length - 1, index + this.columns())
        break
      case 'ArrowUp':
        target = Math.max(0, index - this.columns())
        break
      case 'ArrowRight':
        if (this.view === 'grid') target = Math.min(ids.length - 1, Math.max(0, index + (rtl ? -1 : 1)))
        break
      case 'ArrowLeft':
        if (this.view === 'grid') target = Math.min(ids.length - 1, Math.max(0, index + (rtl ? 1 : -1)))
        break
      case 'Home':
        target = 0
        break
      case 'End':
        target = ids.length - 1
        break
      case 'Enter':
        event.preventDefault()
        this.open(current)
        return
      case ' ':
        event.preventDefault()
        this.pick(current, { shiftKey: event.shiftKey, ctrlKey: true, metaKey: false })
        return
      case 'Escape':
        if (this.value.length) {
          event.preventDefault()
          this.select([])
        }
        return
      case 'F2':
        if (this.hasAction('rename')) {
          event.preventDefault()
          void this.startRename(current.id)
        }
        return
      case 'Delete':
        if (this.hasAction('delete')) {
          event.preventDefault()
          this.runAction('delete', this.value.length ? this.selectedItems() : [current])
        }
        return
      case 'ContextMenu':
        event.preventDefault()
        this.selectForMenu(current)
        void this.openMenu(current, null)
        return
      case 'F10':
        if (event.shiftKey) {
          event.preventDefault()
          this.selectForMenu(current)
          void this.openMenu(current, null)
        }
        return
      case 'a':
      case 'A':
        if (mod && this.selection === 'multiple') {
          event.preventDefault()
          this.select(ids)
          return
        }
        break
    }
    if (target >= 0) {
      event.preventDefault()
      const next = list[target]
      if (event.shiftKey && this.selection === 'multiple') {
        this.anchorId ||= current.id
        this.select(this.range(this.anchorId, next.id))
      } else if (!mod) {
        this.select([next.id])
        this.anchorId = next.id
      }
      this.cursor = next.id
      void this.updateComplete.then(() => this.focusCursor())
      return
    }
    if (event.key.length === 1 && !mod && !event.altKey && event.key !== ' ') this.typeAhead(event.key, list, index)
  }

  private typeAhead(key: string, list: FileBrowserItem[], index: number): void {
    const locale = this.msg.locale
    clearTimeout(this.typeaheadTimer)
    this.typeahead += key.toLocaleLowerCase(locale)
    this.typeaheadTimer = setTimeout(() => (this.typeahead = ''), 600)
    const start = this.typeahead.length === 1 ? index + 1 : index
    const match = [...list.slice(start), ...list.slice(0, start)].find((entry) => entry.name.toLocaleLowerCase(locale).startsWith(this.typeahead))
    if (!match) return
    this.select([match.id])
    this.anchorId = match.id
    this.cursor = match.id
    void this.updateComplete.then(() => this.focusCursor())
  }

  // ------------------------------------------------------------------------------------------------- pointer

  private onItemClick(event: MouseEvent, entry: FileBrowserItem): void {
    if (this.renaming === entry.id) return
    const toggle = (event.target as Element).closest('.check') !== null
    this.pick(entry, event, toggle)
    ;(event.currentTarget as HTMLElement).focus()
  }

  private onContentClick(event: MouseEvent): void {
    const inside = event
      .composedPath()
      .some(
        (node) => node instanceof HTMLElement && (node.getAttribute('role') === 'option' || node.classList.contains('columns') || node.localName === 'slot'),
      )
    if (!inside && this.value.length) this.select([])
  }

  private selectForMenu(entry: FileBrowserItem): void {
    if (!this.value.includes(entry.id)) {
      this.select([entry.id])
      this.anchorId = entry.id
    }
    this.cursor = entry.id
  }

  private onContextMenu(event: MouseEvent, entry: FileBrowserItem): void {
    if (!this.actions.length) return
    event.preventDefault()
    this.selectForMenu(entry)
    const box = this.getBoundingClientRect()
    const point = { x: event.clientX - box.left, y: event.clientY - box.top }
    // Where `contextmenu` fires on press (Linux, macOS), the release that follows would light-dismiss a menu opened
    // now: open it once the button is up.
    if (!event.buttons) {
      void this.openMenu(entry, point)
      return
    }
    let opened = false
    const open = () => {
      if (opened) return
      opened = true
      window.removeEventListener('pointerup', open, true)
      requestAnimationFrame(() => void this.openMenu(entry, point))
    }
    window.addEventListener('pointerup', open, true)
    setTimeout(open, 800)
  }

  private onMore(event: MouseEvent, entry: FileBrowserItem): void {
    event.stopPropagation()
    this.selectForMenu(entry)
    void this.openMenu(entry, null, event.currentTarget as HTMLElement)
  }

  // --------------------------------------------------------------------------------------------------- actions

  private hasAction(id: string): boolean {
    return this.actions.some((action) => action.id === id)
  }

  private menuActions(count: number): FileBrowserAction[] {
    return this.actions.filter((action) => count <= 1 || action.multiple)
  }

  private async openMenu(entry: FileBrowserItem, point: { x: number; y: number } | null, anchor?: HTMLElement): Promise<void> {
    if (!this.menuActions(Math.max(1, this.value.length)).length) return
    this.cursor = entry.id
    this.menuPoint = point
    await this.updateComplete
    const menu = this.actionsMenu
    if (!menu) return
    menu.anchor =
      anchor ?? (point ? this.menuPointElement : this.renderRoot.querySelector<HTMLElement>(`[role="option"][data-id="${CSS.escape(entry.id)}"]`)) ?? undefined
    await menu.updateComplete
    menu.show('first')
  }

  private onMenuSelect(event: CustomEvent<MenuSelectEventDetail>): void {
    event.stopPropagation()
    const current = this.byId.get(this.cursor)
    const items = this.value.length ? this.selectedItems() : current ? [current] : []
    this.runAction(event.detail.value, items)
  }

  private onMenuToggle(event: Event): void {
    if ((event as ToggleEvent).newState !== 'closed') return
    this.menuPoint = null
    // A menu opened at the pointer has nowhere to hand focus back to.
    requestAnimationFrame(() => {
      if (!this.renaming && !this.shadowRoot?.activeElement) this.focusCursor()
    })
  }

  private runAction(action: string, items: FileBrowserItem[]): void {
    if (!items.length) return
    if (action === 'rename') {
      void this.startRename(items[0].id)
      return
    }
    this.dispatchEvent(new CustomEvent('item-action', { detail: { action, items }, bubbles: true, composed: true }))
  }

  private async startRename(id: string): Promise<void> {
    if (!this.byId.has(id)) return
    this.renaming = id
    this.cursor = id
    await this.updateComplete
    // Wait for the menu to give focus back before taking it.
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const input = this.renderRoot.querySelector<HTMLInputElement>('.rename')
    if (!input) return
    input.focus()
    const dot = this.byId.get(id)?.kind === 'file' ? input.value.lastIndexOf('.') : -1
    input.setSelectionRange(0, dot > 0 ? dot : input.value.length)
  }

  private finishRename(commit: boolean): void {
    const id = this.renaming
    if (!id) return
    const input = this.renderRoot.querySelector<HTMLInputElement>('.rename')
    const entry = this.byId.get(id)
    const name = input?.value.trim() ?? ''
    this.renaming = ''
    if (commit && entry && name && name !== entry.name) {
      this.dispatchEvent(new CustomEvent('item-rename', { detail: { item: entry, name }, bubbles: true, composed: true }))
    }
    void this.updateComplete.then(() => this.focusCursor())
  }

  private onRenameKeydown(event: KeyboardEvent): void {
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      this.finishRename(true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.finishRename(false)
    }
  }

  // ------------------------------------------------------------------------------------------------ drag and drop

  private onDragStart(event: DragEvent, entry: FileBrowserItem): void {
    if (this.renaming) {
      event.preventDefault()
      return
    }
    this.selectForMenu(entry)
    this.dragging = [...this.value]
    event.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(this.dragging))
    event.dataTransfer?.setData('text/plain', this.dragging.map((id) => this.byId.get(id)?.name ?? id).join('\n'))
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copyMove'
  }

  private onDragEnd(): void {
    this.dragging = []
    this.dropTarget = null
  }

  /** Whether the dragged items may go into `folder`: not into themselves, not below themselves, not where they are. */
  private canMoveInto(folder: string): boolean {
    if (!this.dragging.length) return false
    const chain = this.ancestors(folder)
    if (this.dragging.some((id) => chain.includes(id))) return false
    return this.dragging.some((id) => asFolder(this.byId.get(id)?.parent) !== folder)
  }

  /** The folder under the pointer: a folder row or tile, a tree row, or the open folder's empty space. */
  private dropFolderFrom(event: DragEvent): string | null {
    for (const node of event.composedPath()) {
      if (!(node instanceof HTMLElement)) continue
      if (node.localName === 'c2-tree-item') {
        const value = node.getAttribute('value') ?? ''
        return value === ROOT_NODE ? '' : value
      }
      if (node.getAttribute('role') === 'option') {
        const id = node.dataset.id ?? ''
        return this.byId.get(id)?.kind === 'folder' ? id : this.folder
      }
      if (node.classList.contains('content')) return this.folder
    }
    return null
  }

  private onDragOver(event: DragEvent): void {
    const files = !this.dragging.length && (event.dataTransfer?.types.includes('Files') ?? false)
    const target = this.dropFolderFrom(event)
    if (target === null || (!files && !this.canMoveInto(target))) {
      this.dropTarget = null
      return
    }
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = files ? 'copy' : 'move'
    this.dropTarget = target
  }

  private onDragLeave(event: DragEvent): void {
    const next = event.relatedTarget as Node | null
    if (!next || !this.shadowRoot?.contains(next)) this.dropTarget = null
  }

  private onDrop(event: DragEvent): void {
    const target = this.dropTarget
    this.dropTarget = null
    if (target === null) return
    event.preventDefault()
    const files = [...(event.dataTransfer?.files ?? [])]
    if (!this.dragging.length) {
      if (!files.length) return
      this.announce(this.msg.t('dropping', files.length, this.folderName(target)))
      this.dispatchEvent(new CustomEvent('files-drop', { detail: { files, folder: target }, bubbles: true, composed: true }))
      return
    }
    const items = this.dragging.map((id) => this.byId.get(id)).filter((entry): entry is FileBrowserItem => !!entry)
    this.dragging = []
    if (!items.length) return
    this.announce(this.msg.t('moving', items.length, this.folderName(target)))
    this.dispatchEvent(new CustomEvent('item-move', { detail: { items, target }, bubbles: true, composed: true }))
  }

  // ------------------------------------------------------------------------------------------------ toolbar

  private onSearch(event: CustomEvent<SearchFieldSearchDetail>): void {
    this.query = event.detail.value
    if (this.search === 'remote') {
      this.dispatchEvent(new CustomEvent('search', { detail: { query: event.detail.value, folder: this.folder }, bubbles: true, composed: true }))
    }
  }

  private setSort(sort: FileBrowserSort, direction: FileBrowserSortDirection): void {
    if (sort === this.sort && direction === this.sortDirection) return
    this.sort = sort
    this.sortDirection = direction
    this.dispatchEvent(new CustomEvent('sort-change', { detail: { sort, direction }, bubbles: true, composed: true }))
  }

  private onSortSelect(event: CustomEvent<MenuSelectEventDetail>): void {
    event.stopPropagation()
    const [kind, value] = event.detail.value.split(':')
    if (kind === 'sort') this.setSort(value as FileBrowserSort, this.sortDirection)
    else if (kind === 'dir') this.setSort(this.sort, value as FileBrowserSortDirection)
  }

  private onHeaderSort(sort: FileBrowserSort): void {
    this.setSort(sort, sort === this.sort && this.sortDirection === 'asc' ? 'desc' : 'asc')
  }

  private onView(event: CustomEvent<{ value: string }>): void {
    event.stopPropagation()
    const view: FileBrowserView = event.detail.value === 'grid' ? 'grid' : 'list'
    if (view === this.view) return
    this.view = view
    this.dispatchEvent(new CustomEvent('view-change', { detail: { view }, bubbles: true, composed: true }))
  }

  private onTreeSelect(event: CustomEvent<TreeSelectionChangeEventDetail>): void {
    event.stopPropagation()
    const value = event.detail.value[0]
    if (value === undefined) return
    this.navigate(value === ROOT_NODE ? '' : value, false)
  }

  private onTreeExpansion(event: CustomEvent<TreeExpansionChangeEventDetail>): void {
    event.stopPropagation()
    this.expanded = event.detail.expandedItems
  }

  private treeLoader = async ({ node }: TreeItemContext): Promise<TreeNode[]> => {
    const id = node.value === ROOT_NODE ? '' : node.value
    await this.ensureLoaded(id)
    await this.updateComplete
    return this.treeNodes(id)
  }

  private treeNodes(parent: string, seen = new Set<string>()): TreeNode[] {
    return (this.childrenOf.get(parent) ?? [])
      .filter((entry) => entry.kind === 'folder' && !seen.has(entry.id))
      .sort((a, b) => a.name.localeCompare(b.name, this.msg.locale, { numeric: true }))
      .map((entry) => {
        seen.add(entry.id)
        if (!this.isLoaded(entry.id)) return { value: entry.id, label: entry.name, hasChildren: true }
        const children = this.treeNodes(entry.id, seen)
        return children.length ? { value: entry.id, label: entry.name, children } : { value: entry.id, label: entry.name }
      })
  }

  private measure(): void {
    const limit = this.probe?.getBoundingClientRect().width || 560
    const width = this.getBoundingClientRect().width
    const narrow = width > 0 && width < limit
    if (narrow !== this.narrow) this.narrow = narrow
  }

  private announce(text: string): void {
    this.announcement = ''
    requestAnimationFrame(() => (this.announcement = text))
  }

  // ---------------------------------------------------------------------------------------------------- render

  private renderIcon(category: FileCategory, large = false) {
    return html`<span class="icon icon-${category} ${large ? 'large' : ''}">${fileIcon(category)}</span>`
  }

  private renderName(entry: FileBrowserItem) {
    if (this.renaming !== entry.id) return html`<span class="name">${entry.name}</span>`
    return html`<input
      class="rename"
      .value=${entry.name}
      aria-label=${this.msg.t('rename', entry.name)}
      spellcheck="false"
      @keydown=${this.onRenameKeydown}
      @blur=${() => this.finishRename(true)}
      @click=${(event: Event) => event.stopPropagation()}
      @dblclick=${(event: Event) => event.stopPropagation()}
    />`
  }

  private optionState(entry: FileBrowserItem, cursor: string) {
    const selected = this.value.includes(entry.id)
    return {
      selected,
      tabindex: entry.id === cursor ? 0 : -1,
      classes: [selected ? 'selected' : '', this.dropTarget === entry.id && entry.kind === 'folder' ? 'drop' : ''].join(' '),
    }
  }

  private renderCheck(selected: boolean) {
    return this.selection === 'multiple' ? html`<span class="check" aria-hidden="true">${selected ? checkmark : nothing}</span>` : nothing
  }

  private renderOption(entry: FileBrowserItem, cursor: string) {
    const { selected, tabindex, classes } = this.optionState(entry, cursor)
    const category = fileCategory(entry)
    const size = entry.kind === 'file' ? this.formatSize(entry.size) : ''
    const date = this.formatDate(entry.modified)
    const content =
      this.view === 'grid'
        ? html`<span class="thumb">
              ${
                entry.thumbnail && category !== 'folder'
                  ? html`<img src=${entry.thumbnail} alt="" loading="lazy" draggable="false" />`
                  : this.renderIcon(category, true)
              }
            </span>
            ${this.renderCheck(selected)}
            <span class="label">${this.renderIcon(category)}${this.renderName(entry)}</span>
            <span class="meta" aria-hidden="true">${entry.kind === 'folder' ? this.kindOf(entry) : [size, date].filter(Boolean).join(' · ')}</span>`
        : html`<span class="cell name-cell">
              ${this.renderCheck(selected)} ${this.renderIcon(category)}
              <span class="name-stack">${this.renderName(entry)}<span class="sub" aria-hidden="true">${[size, date].filter(Boolean).join(' · ')}</span></span>
            </span>
            <span class="cell modified" aria-hidden="true">${date}</span>
            <span class="cell size" aria-hidden="true">${size || '—'}</span>
            <span class="cell kind" aria-hidden="true">${this.kindOf(entry)}</span>
            <span class="cell more-cell">
              ${
                this.actions.length
                  ? html`<span
                      class="more"
                      aria-hidden="true"
                      title=${this.msg.t('more', entry.name)}
                      @click=${(event: MouseEvent) => this.onMore(event, entry)}
                      >${moreIcon}</span
                    >`
                  : nothing
              }
            </span>`
    return html`<div
      class="${this.view === 'grid' ? 'tile' : 'row'} ${classes}"
      part="item"
      role="option"
      data-id=${entry.id}
      aria-selected=${selected ? 'true' : 'false'}
      aria-label=${this.itemLabel(entry)}
      tabindex=${tabindex}
      draggable=${this.renaming === entry.id ? 'false' : 'true'}
      @click=${(event: MouseEvent) => this.onItemClick(event, entry)}
      @dblclick=${() => this.open(entry)}
      @contextmenu=${(event: MouseEvent) => this.onContextMenu(event, entry)}
      @dragstart=${(event: DragEvent) => this.onDragStart(event, entry)}
      @dragend=${this.onDragEnd}
      @focus=${() => (this.cursor = entry.id)}
    >
      ${content}
    </div>`
  }

  private renderColumns() {
    const column = (sort: FileBrowserSort, label: string, extra = '') => {
      const active = this.sort === sort
      const direction = active ? this.msg.t(this.sortDirection === 'asc' ? 'ascending' : 'descending') : ''
      return html`<button
        type="button"
        class="column ${extra} ${active ? 'active' : ''}"
        aria-label=${this.msg.t('sortBy', label, direction)}
        @click=${() => this.onHeaderSort(sort)}
      >
        <span>${label}</span>${active ? (this.sortDirection === 'asc' ? arrowUp : arrowDown) : nothing}
      </button>`
    }
    return html`<div class="columns">
      ${column('name', this.msg.t('name'), 'name-column')} ${column('modified', this.msg.t('modified'), 'modified')}
      ${column('size', this.msg.t('size'), 'size')} ${column('kind', this.msg.t('kind'), 'kind')}<span></span>
    </div>`
  }

  private renderBody(list: FileBrowserItem[]) {
    if (!this.isLoaded(this.folder)) {
      return html`<div class="loading" role="status" aria-label=${this.msg.t('loading')}>
        ${[0, 1, 2, 3, 4].map(() => html`<div class="skeleton-row"><c2-skeleton variant="text"></c2-skeleton></div>`)}
      </div>`
    }
    if (!list.length) {
      const query = this.search === 'local' ? this.query.trim() : ''
      return html`<div class="empty">
        <slot name="empty">
          <c2-status-panel
            heading=${query ? this.msg.t('noResults', query) : this.msg.t('empty')}
            description=${query ? this.msg.t('noResultsHint') : this.msg.t('emptyHint')}
          ></c2-status-panel>
        </slot>
      </div>`
    }
    const cursor = this.cursorId
    return html`<div
      class=${this.view === 'grid' ? 'grid' : 'list'}
      role="listbox"
      aria-multiselectable=${this.selection === 'multiple' ? 'true' : 'false'}
      aria-label=${this.msg.t('contents', this.folderName(this.folder))}
    >
      ${repeat(
        list,
        (entry) => entry.id,
        (entry) => this.renderOption(entry, cursor),
      )}
    </div>`
  }

  private renderSelectionBar() {
    const items = this.selectedItems()
    if (!items.length || this.selection !== 'multiple') return nothing
    const bytes = items.reduce((sum, entry) => sum + (entry.kind === 'file' ? (entry.size ?? 0) : 0), 0)
    return html`<div class="selection-bar" part="selection-bar" role="toolbar" aria-label=${this.msg.t('selected', items.length, '')}>
      <span class="count">${this.msg.t('selected', items.length, bytes ? this.formatSize(bytes) : '')}</span>
      ${this.menuActions(items.length).map(
        (action) =>
          html`<button
            type="button"
            class="bar-action ${action.destructive ? 'destructive' : ''}"
            @click=${() => this.runAction(action.id, this.selectedItems())}
          >
            ${action.label}
          </button>`,
      )}
      <button type="button" class="bar-clear" aria-label=${this.msg.t('clearSelection')} @click=${() => this.select([])}>${closeIcon}</button>
    </div>`
  }

  private renderTrail() {
    const chain = this.ancestors(this.folder)
    return chain.map((id, index) =>
      index === chain.length - 1
        ? html`<span class="current">${this.folderName(id)}</span>`
        : html`<c2-link-button @click=${() => this.navigate(id)}>${this.folderName(id)}</c2-link-button>`,
    )
  }

  private renderTree() {
    const root: TreeNode = this.isLoaded('')
      ? { value: ROOT_NODE, label: this.folderName(''), children: this.treeNodes('') }
      : { value: ROOT_NODE, label: this.folderName(''), hasChildren: true }
    return html`<nav
      class="tree-pane"
      part="tree"
      aria-label=${this.msg.t('folders')}
      @dragover=${this.onDragOver}
      @drop=${this.onDrop}
      @dragleave=${this.onDragLeave}
    >
      ${this.treeReady ? this.renderTreeElement(root) : nothing}
    </nav>`
  }

  private renderTreeElement(root: TreeNode) {
    return html`<c2-tree
      class="tree"
      aria-label=${this.msg.t('folders')}
      .items=${[root]}
      .value=${[this.treeValue(this.folder)]}
      .expandedItems=${this.expanded}
      .loadChildren=${this.loadChildren ? this.treeLoader : undefined}
      @selection-change=${this.onTreeSelect}
      @expansion-change=${this.onTreeExpansion}
    ></c2-tree>`
  }

  override render(): TemplateResult {
    const folderName = this.folderName(this.folder)
    const sortLabel = this.msg.t(this.sort)
    const direction = this.msg.t(this.sortDirection === 'asc' ? 'ascending' : 'descending')
    const list = this.isLoaded(this.folder) ? this.visible : []
    return html`<div class="browser ${this.narrow ? 'narrow' : ''}">
      ${this.narrow ? nothing : this.renderTree()}
      <div class="main">
        <div class="toolbar" part="toolbar">
          ${this.narrow && this.folder ? html`<c2-button class="up" aria-label=${this.msg.t('up')} @click=${() => this.up()}>${backIcon}</c2-button>` : nothing}
          <c2-breadcrumb class="trail" aria-label=${this.msg.t('path')}>${this.renderTrail()}</c2-breadcrumb>
          <c2-search-field
            class="search"
            .value=${this.query}
            placeholder=${this.msg.t('searchIn', folderName)}
            aria-label=${this.msg.t('searchIn', folderName)}
            debounce="150"
            @search=${this.onSearch}
          ></c2-search-field>
          <div class="tools">
            <c2-menu class="sort-menu" aria-label=${this.msg.t('sort')} @menu-select=${this.onSortSelect}>
              <c2-button slot="trigger" class="sort-trigger" aria-label=${this.msg.t('sortedBy', sortLabel, direction)}
                >${sortLabel}${this.sortDirection === 'asc' ? arrowUp : arrowDown}</c2-button
              >
              ${(['name', 'modified', 'size', 'kind'] as const).map(
                (sort) =>
                  html`<c2-menu-item type="radio" name="sort" value=${`sort:${sort}`} ?checked=${this.sort === sort}>${this.msg.t(sort)}</c2-menu-item>`,
              )}
              <hr />
              <c2-menu-item type="radio" name="direction" value="dir:asc" ?checked=${this.sortDirection === 'asc'}>${this.msg.t('ascending')}</c2-menu-item>
              <c2-menu-item type="radio" name="direction" value="dir:desc" ?checked=${this.sortDirection === 'desc'}>${this.msg.t('descending')}</c2-menu-item>
            </c2-menu>
            <c2-button-group
              class="views"
              appearance="segmented"
              size="s"
              selection="single"
              .value=${this.view}
              aria-label=${this.msg.t('view')}
              @change=${this.onView}
            >
              <c2-button value="list" aria-label=${this.msg.t('listView')}>${listIcon}</c2-button>
              <c2-button value="grid" aria-label=${this.msg.t('gridView')}>${gridIcon}</c2-button>
            </c2-button-group>
          </div>
        </div>
        <div
          class="content ${this.dropTarget === this.folder && !list.some((entry) => entry.id === this.dropTarget) ? 'drop' : ''}"
          part="content"
          aria-busy=${this.isLoaded(this.folder) ? 'false' : 'true'}
          tabindex="-1"
          @keydown=${this.onKeydown}
          @click=${this.onContentClick}
          @dragover=${this.onDragOver}
          @dragleave=${this.onDragLeave}
          @drop=${this.onDrop}
        >
          ${this.view === 'list' && !this.narrow && list.length ? this.renderColumns() : nothing} ${this.renderBody(list)}
        </div>
        ${this.renderSelectionBar()}
      </div>
      <span class="menu-point" style=${styleMap(this.menuPoint ? { left: `${this.menuPoint.x}px`, top: `${this.menuPoint.y}px` } : {})}></span>
      <c2-menu class="actions-menu" aria-label=${this.msg.t('actions')} @menu-select=${this.onMenuSelect} @toggle=${this.onMenuToggle}>
        ${this.menuActions(Math.max(1, this.value.length)).map(
          (action) => html`<c2-menu-item value=${action.id} ?destructive=${!!action.destructive}>${action.label}</c2-menu-item>`,
        )}
      </c2-menu>
      <span class="announcement" aria-live="polite">${this.announcement}</span>
      <span class="probe" aria-hidden="true"></span>
    </div>`
  }
}

const checkmark = html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" /></svg>`
const moreIcon = html`<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
  <circle cx="3.5" cy="8" r="1.3" />
  <circle cx="8" cy="8" r="1.3" />
  <circle cx="12.5" cy="8" r="1.3" />
</svg>`
const arrowUp = html`<svg class="arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
  <path d="M8 13V3M4 7l4-4 4 4" />
</svg>`
const arrowDown = html`<svg class="arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
  <path d="M8 3v10M4 9l4 4 4-4" />
</svg>`
const listIcon = html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
  <path d="M2 4h12M2 8h12M2 12h12" />
</svg>`
const gridIcon = html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
  <rect x="2" y="2" width="5" height="5" rx="1" />
  <rect x="9" y="2" width="5" height="5" rx="1" />
  <rect x="2" y="9" width="5" height="5" rx="1" />
  <rect x="9" y="9" width="5" height="5" rx="1" />
</svg>`
const backIcon = html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>`
const closeIcon = html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>`

declare global {
  interface HTMLElementTagNameMap {
    'c2-file-browser': FileBrowser
  }
}
