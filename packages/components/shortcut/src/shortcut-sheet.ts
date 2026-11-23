import { LitElement, adoptStyles, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { registerShortcuts } from '@c2n/core/shortcut-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { shortcutMessages, type ShortcutMessages } from './messages.js'
import styles from './shortcut-sheet.scss?inline'

/** A shortcut the sheet lists without binding it: one a component handles itself, such as a list's arrow keys. */
export interface ShortcutSheetItem {
  /** The keys, in the `c2-shortcut` syntax. Bare keys are allowed here (`j`, `?`, `arrowdown`, `g d`). */
  keys: string
  /** What the shortcut does. */
  description: string
  /** Section the shortcut is listed under. */
  group?: string
}

/** A listed shortcut with its platform-aware labels. */
export interface ShortcutSheetEntry extends ShortcutSheetItem {
  /** Display label of each alternative; the strokes of a sequence are separated by a space (`G D`). */
  labels: string[]
}

export interface ShortcutSheetItemContext {
  entry: ShortcutSheetEntry
  /** Position of the entry in the list as filtered. */
  index: number
  /** The search text, trimmed. */
  query: string
}

/** Draws the content of one row; the sheet keeps the row itself. */
export type ShortcutSheetItemRenderer = (context: ShortcutSheetItemContext) => unknown

/** Events fired by {@link ShortcutSheet}, keyed for `addEventListener`. */
export interface ShortcutSheetEventMap {
  open: Event
  close: CustomEvent<{ returnValue: string }>
}

export interface ShortcutSheet {
  addEventListener: TypedAddEventListener<ShortcutSheet, ShortcutSheetEventMap>
  removeEventListener: TypedRemoveEventListener<ShortcutSheet, ShortcutSheetEventMap>
}

/** What the lazily loaded view reads from the sheet besides its public properties. */
export interface ShortcutSheetViewState {
  msg: LocalizeController<ShortcutMessages>
  query: string
  setQuery(query: string): void
}

type View = typeof import('./shortcut-sheet-view.js')
let viewModule: Promise<View> | undefined
const loadView = () =>
  (viewModule ??= import('./shortcut-sheet-view.js').catch((error: unknown) => {
    // A failed load (offline, a stale deploy) is tried again next time.
    viewModule = undefined
    throw error
  }))

/**
 * The keyboard-shortcuts sheet, the dialog a "?" key opens on GitHub or Gmail: every shortcut of the page grouped
 * by section, each key drawn with `c2-kbd`, and a search field that filters them.
 *
 * The sheet reads the bindings of the `c2-shortcut` elements in its document (or shadow root), or of those `for`
 * names, each time it opens: a binding is listed when it has a `description`, under its `group`. `shortcuts` adds
 * entries the page does not bind itself, such as a component's own arrow keys; they are listed after the bindings.
 * A disabled binding or `c2-shortcut` is left out, and `no-bindings` lists `shortcuts` alone. Shortcuts with no group
 * come first, under "General" when others have a group.
 *
 * Open it with `show()`, the `open` attribute, the sheet's own `keys` (`keys="mod+/"`), or a button with
 * `commandfor="<sheet id>" command="--show"` (`--toggle`, `--hide`). The dialog is a `c2-modal`, loaded with the
 * rest of the sheet the first time it opens; `inline` lists the shortcuts in the page instead, for a help or settings
 * page. The `footer` slot is an action zone for the app's own links ("Customize shortcuts").
 *
 * @tag c2-shortcut-sheet
 *
 * @slot title - Replaces the dialog's heading ("Keyboard shortcuts").
 * @slot footer - Action zone under the list: links or buttons of the app. Hidden when empty.
 * @slot empty - Replaces the text shown when nothing is listed, or the search matches nothing.
 *
 * @csspart panel - The list region: the search field, the groups and the empty text, inline or inside the dialog.
 * @csspart title - The dialog heading region wrapping the `title` slot.
 * @csspart search - The search region wrapping the search field.
 * @csspart groups - The groups region, laid out in columns.
 * @csspart group - The region of one group: its heading and its rows.
 * @csspart group-heading - The heading region of one group.
 * @csspart item - The row region of one shortcut.
 * @csspart description - The description region of a row.
 * @csspart keys - The keys region of a row: its `c2-kbd` keys and the words between them.
 * @csspart empty - The empty-state region wrapping the `empty` slot.
 * @csspart footer - The footer region wrapping the `footer` slot.
 *
 * @event {Event} open - Fired after the dialog has opened.
 * @event {CustomEvent<{ returnValue: string }>} close - Fired after the dialog has closed, by Escape, the × button, the backdrop or `hide()`.
 *
 * @cssproperty {pixel} [--c2-shortcut-sheet--width=min(720px, calc(100vw - 32px))] - Width of the dialog; the other `--c2-modal…` variables reach it too.
 * @cssproperty {pixel} [--c2-shortcut-sheet__groups--column-width=260px] - Narrowest column; groups flow into as many columns as fit.
 * @cssproperty {pixel} [--c2-shortcut-sheet__groups--column-gap=32px]
 * @cssproperty {pixel} [--c2-shortcut-sheet__group--margin-bottom=20px]
 * @cssproperty {color} [--c2-shortcut-sheet__group-heading--color=#71717a]
 * @cssproperty {font-size} [--c2-shortcut-sheet__group-heading--font-size=12px]
 * @cssproperty {font-weight} [--c2-shortcut-sheet__group-heading--font-weight=600]
 * @cssproperty {text-transform} [--c2-shortcut-sheet__group-heading--text-transform=uppercase]
 * @cssproperty {pixel} [--c2-shortcut-sheet__group-heading--letter-spacing=0.04em]
 * @cssproperty {pixel} [--c2-shortcut-sheet__group-heading--margin-bottom=4px]
 * @cssproperty {padding} [--c2-shortcut-sheet__item--padding-top=6px]
 * @cssproperty {padding} [--c2-shortcut-sheet__item--padding-bottom=6px]
 * @cssproperty {pixel} [--c2-shortcut-sheet__item--gap=16px] - Space between the description and the keys.
 * @cssproperty {border} [--c2-shortcut-sheet__item--border-bottom=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-shortcut-sheet__description--color=#18181b]
 * @cssproperty {font-size} [--c2-shortcut-sheet__description--font-size=14px]
 * @cssproperty {pixel} [--c2-shortcut-sheet__keys--gap=4px]
 * @cssproperty {color} [--c2-shortcut-sheet__separator--color=#71717a] - The "or" and "then" between keys.
 * @cssproperty {font-size} [--c2-shortcut-sheet__separator--font-size=12px]
 * @cssproperty {pixel} [--c2-shortcut-sheet__search--margin-bottom=16px]
 * @cssproperty {color} [--c2-shortcut-sheet__empty--color=#71717a]
 * @cssproperty {font-size} [--c2-shortcut-sheet__empty--font-size=14px]
 * @cssproperty {padding} [--c2-shortcut-sheet__empty--padding=24px 0]
 * @cssproperty {padding} [--c2-shortcut-sheet__footer--padding-top=12px] - Space above the footer of an inline sheet.
 */
@customElement('c2-shortcut-sheet')
export class ShortcutSheet extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Whether the dialog is open. */
  @property({ type: Boolean, reflect: true }) open = false

  /** List the shortcuts in the page, without a dialog. */
  @property({ type: Boolean }) inline = false

  /** Space-separated ids of the `c2-shortcut` elements to read. Empty: every `c2-shortcut` in the sheet's document or shadow root. */
  @property() for = ''

  /** Shortcuts listed after the bindings: `{ keys, description, group? }` objects, or a JSON array as an attribute. */
  @property({ converter: jsonPropertyConverter }) shortcuts: ShortcutSheetItem[] = []

  /** List `shortcuts` only, without reading any `c2-shortcut`: a help panel for a component's own keys. */
  @property({ type: Boolean, attribute: 'no-bindings' }) noBindings = false

  /** Keys that toggle the dialog, in the `c2-shortcut` syntax (`mod+/`; Ctrl, ⌘ or Alt required, as for a binding). Listed in the sheet itself; ignored by an `inline` sheet. */
  @property() keys = ''

  /** Hide the search field. */
  @property({ type: Boolean, attribute: 'no-search' }) noSearch = false

  /** Draws the content of each row instead of the description and the keys. */
  @property({ attribute: false }) renderItem?: ShortcutSheetItemRenderer

  @state() private query = ''
  @state() private view: View['renderSheet'] | undefined
  private loading = false

  private readonly msg = new LocalizeController(this, shortcutMessages)
  private unregister: (() => void) | undefined

  constructor() {
    super()
    this.addEventListener('command', (event) => this.runCommand(event, (event as CommandEvent).command))
  }

  /** Opens the dialog. */
  show() {
    this.open = true
  }

  /** Closes the dialog. */
  hide() {
    this.open = false
  }

  /** Opens the dialog when it is closed, closes it when it is open. */
  toggle() {
    this.open = !this.open
  }

  /** Reads the `c2-shortcut` bindings again, after they changed while the sheet is shown. */
  refresh() {
    this.requestUpdate()
  }

  override connectedCallback() {
    super.connectedCallback()
    if (isServer) return
    this.unregister = registerShortcuts(
      this,
      () => (this.keys && !this.inline ? [{ keys: this.keys }] : []),
      () => this.toggle(),
    )
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unregister?.()
    this.unregister = undefined
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('open') && this.open) this.query = ''
    if (isServer || this.view || this.loading || !(this.open || this.inline)) return
    this.loading = true
    loadView()
      .then(
        (module) => {
          // The list's styles come with the view, so a page pays for neither until the sheet is shown.
          adoptStyles(this.renderRoot as ShadowRoot, [...(this.constructor as typeof ShortcutSheet).elementStyles, module.styles])
          this.view = module.renderSheet
        },
        (error: unknown) => console.error('[c2-shortcut-sheet] could not load the sheet', error),
      )
      .finally(() => (this.loading = false))
  }

  override render() {
    return this.view ? this.view(this, { msg: this.msg, query: this.query, setQuery: (query) => (this.query = query) }) : nothing
  }

  private runCommand(event: Event, command: string | null) {
    if (event.defaultPrevented) return
    if (command === '--show') this.show()
    else if (command === '--hide') this.hide()
    else if (command === '--toggle') this.toggle()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-shortcut-sheet': ShortcutSheet
  }
}
