import { html, nothing, unsafeCSS } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { TableOfContents, type TableOfContentsItem } from './table-of-contents'
import { indexBarMessages } from './index-bar-messages'
import styles from './index-bar.scss?inline'

/** One section of the index bar: a table of contents entry, with the key it is filed under. */
export interface IndexBarItem extends TableOfContentsItem {
  /** Key of the rail the section is filed under. Defaults to the first character of `label`, in capitals. */
  key?: string
}

interface IndexBarKey {
  key: string
  /** The first section filed under the key, which the key jumps to; `null` for an empty key. */
  id: string | null
  /** Every section filed under the key, so the key stays current while any of them is read. */
  ids: string[]
}

/**
 * The A to Z rail beside a long list, such as a contact list or a glossary. It lists the sections of the element named
 * by `for` (or of the page) by key, marks the key of the section being read, and jumps on a tap. Dragging along the rail
 * scrubs through the list: each key passed under the pointer jumps to its section at once, and a bubble beside the rail
 * shows the key. With `keys` set, the rail always shows that alphabet and dims the keys no section is filed under.
 *
 * It is a `c2-table-of-contents` in another shape: `for`, `selector`, `items`, `offset`, `keep-url`, `activeId`,
 * `scrollToSection()` and the `active-change` event work the same. Each section is filed under the first character of
 * its label (a heading's text, or its `data-toc-label`), or under the `key` of an entry of `items`; nesting is ignored.
 * The rail is one Tab stop: the arrow keys, Home and End move between its keys, and Enter jumps.
 *
 * @tag c2-index-bar
 * @owntemplate
 *
 * @csspart nav - The `<nav>` landmark around the rail, the bubble included.
 * @csspart keys - The `<ol>` of keys: the rail itself, which takes the drag.
 * @csspart key - Every key; the current one also has the `active` part, an empty one the `empty` part.
 * @csspart active - The key of the section being read.
 * @csspart empty - A key no section is filed under, dimmed and skipped.
 * @csspart bubble - The bubble beside the rail that shows the key under the pointer while dragging.
 *
 * @cssproperty {font-family} [--c2-index-bar--font-family=inherit]
 * @cssproperty {font-size} [--c2-index-bar--font-size=12px]
 * @cssproperty {font-weight} [--c2-index-bar--font-weight=600]
 * @cssproperty {time} [--c2-index-bar--transition-duration=150ms]
 * @cssproperty {pixel} [--c2-index-bar__keys--gap=0]
 * @cssproperty {padding} [--c2-index-bar__keys--padding=4px 0]
 * @cssproperty {color} [--c2-index-bar__keys--background-color=transparent]
 * @cssproperty {border-radius} [--c2-index-bar__keys--border-radius=999px]
 * @cssproperty {pixel} [--c2-index-bar__key--width=20px]
 * @cssproperty {pixel} [--c2-index-bar__key--padding-block=1px]
 * @cssproperty {line-height} [--c2-index-bar__key--line-height=1.4]
 * @cssproperty {color} [--c2-index-bar__key--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-index-bar__key--background-color=transparent]
 * @cssproperty {border-radius} [--c2-index-bar__key--border-radius=999px]
 * @cssproperty {color} [--c2-index-bar__key__hover--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-index-bar__key__active--color=#ffffff]
 * @cssproperty {color} [--c2-index-bar__key__active--background-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-index-bar__key__empty--color=rgb(2, 101, 220)]
 * @cssproperty {number} [--c2-index-bar__key__empty--opacity=0.38]
 * @cssproperty {outline} [--c2-index-bar__key__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-index-bar__key__focus--outline-offset=0]
 * @cssproperty {display} [--c2-index-bar__bubble--display=flex] - `none` turns the bubble off.
 * @cssproperty {pixel} [--c2-index-bar__bubble--width=48px]
 * @cssproperty {pixel} [--c2-index-bar__bubble--height=48px]
 * @cssproperty {pixel} [--c2-index-bar__bubble--inset-inline-end=calc(100% + 12px)] - Where the bubble sits, from the end edge of the rail.
 * @cssproperty {color} [--c2-index-bar__bubble--color=#ffffff]
 * @cssproperty {color} [--c2-index-bar__bubble--background-color=rgb(2, 101, 220)]
 * @cssproperty {border-radius} [--c2-index-bar__bubble--border-radius=999px]
 * @cssproperty {font-size} [--c2-index-bar__bubble--font-size=24px]
 * @cssproperty {shadow} [--c2-index-bar__bubble--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 */
@customElement('c2-index-bar')
export class IndexBar extends TableOfContents {
  static override styles = unsafeCSS(styles)

  /**
   * The keys of the rail, in order: one character each (`ABCDEFGHIJKLMNOPQRSTUVWXYZ#`), or `;`-separated or a JSON
   * array for longer keys. A key no section is filed under is dimmed. A section is filed under the key equal to its own,
   * else one that differs only by accents or case, else `#` when the rail has it. Empty: the keys of the sections.
   */
  @property() keys: string | string[] = ''

  /** The sections to list, in place of reading the headings. Each needs the `id` of an element on the page, and may name its `key`. */
  @property({ converter: jsonPropertyConverter }) override items?: IndexBarItem[]

  /** Name of the navigation landmark. Defaults to the translatable "Index". */
  @property({ type: String }) override label = ''

  @state() private bubble: { key: string; y: number } | null = null
  /** The key that holds the Tab stop while the rail has focus: a key, not an index, so a change of keys keeps it. */
  @state() private focusKey: string | null = null

  private readonly barMsg = new LocalizeController(this, indexBarMessages)
  private model: IndexBarKey[] = []
  private modelInputs: unknown[] = []
  private scrub: { pointerId: number; id: string | null } | null = null
  private suppressClick = false

  /** The keys of the rail, rebuilt only when the sections, the keys or the language change. */
  private keyModel() {
    const inputs = [this.entries, this.keys, this.barMsg.locale]
    if (inputs.some((input, i) => input !== this.modelInputs[i])) {
      this.modelInputs = inputs
      this.model = buildKeys(this.entries as IndexBarItem[], parseKeys(this.keys), this.barMsg.locale)
    }
    return this.model
  }

  override render() {
    const model = this.keyModel()
    // A rail with no section to jump to would be an empty landmark.
    if (!model.some((entry) => entry.id)) return nothing
    const active = this.activeId
    const activeIndex = model.findIndex((entry) => active !== null && entry.ids.includes(active))
    const focusIndex = model.findIndex((entry) => entry.id && entry.key === this.focusKey)
    const stop = focusIndex >= 0 ? focusIndex : activeIndex >= 0 ? activeIndex : model.findIndex((entry) => entry.id)
    return html`
      <nav class="c2-index-bar" part="nav" aria-label=${this.label || this.barMsg.t('label')}>
        <ol
          class="keys"
          part="keys"
          role="list"
          @pointerdown=${this.handlePointerDown}
          @pointermove=${this.handlePointerMove}
          @pointerup=${this.handlePointerUp}
          @pointercancel=${this.endScrub}
          @lostpointercapture=${this.endScrub}
          @keydown=${this.handleKeyDown}
          @focusout=${this.handleFocusOut}
        >
          ${model.map((entry, index) =>
            entry.id
              ? html`<li>
                  <a
                    class="key ${index === activeIndex ? 'active' : ''}"
                    part=${index === activeIndex ? 'key active' : 'key'}
                    href="#${encodeURIComponent(entry.id)}"
                    draggable="false"
                    tabindex=${index === stop ? 0 : -1}
                    data-index=${index}
                    aria-current=${index === activeIndex ? 'true' : nothing}
                    @click=${(event: MouseEvent) => this.handleKeyClick(event, entry)}
                    >${entry.key}</a
                  >
                </li>`
              : html`<li aria-hidden="true"><span class="key empty" part="key empty" data-index=${index}>${entry.key}</span></li>`,
          )}
        </ol>
        <div class="bubble" part="bubble" aria-hidden="true" ?hidden=${!this.bubble} style="--y:${this.bubble?.y ?? 0}px">${this.bubble?.key ?? ''}</div>
      </nav>
    `
  }

  private handleKeyClick(event: MouseEvent, entry: IndexBarKey) {
    // The click that follows a tap or a drag: the pointer already moved to the section.
    if (this.suppressClick) {
      event.preventDefault()
      return
    }
    this.handleClick(event, { id: entry.id!, label: entry.key })
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    // No focus, text selection or link drag: the rail scrubs instead.
    event.preventDefault()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    this.scrub = { pointerId: event.pointerId, id: null }
    this.suppressClick = false
    this.scrubTo(event.clientY)
  }

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (this.scrub?.pointerId === event.pointerId) this.scrubTo(event.clientY)
  }

  private readonly handlePointerUp = (event: PointerEvent) => {
    const scrub = this.scrub
    if (scrub?.pointerId !== event.pointerId) return
    this.endScrub()
    if (!scrub.id) return
    // Ends as a click on the key would: the section is focused and recorded in the URL.
    this.navigateTo(scrub.id, 'instant')
    this.suppressClick = true
    setTimeout(() => (this.suppressClick = false))
  }

  private readonly endScrub = () => {
    this.scrub = null
    this.bubble = null
  }

  /** Jumps to the section of the key at `clientY`, or of the nearest key that has one. */
  private scrubTo(clientY: number) {
    const keys = Array.from(this.renderRoot.querySelectorAll<HTMLElement>('.key'))
    const nav = this.renderRoot.querySelector('nav')
    if (!this.scrub || !keys.length || !nav) return
    let index = keys.findIndex((key) => clientY < key.getBoundingClientRect().bottom)
    if (index < 0) index = keys.length - 1
    const target = nearestKey(this.model, index)
    if (target < 0) return
    const id = this.model[target].id!
    if (this.scrub.id === id) return
    this.scrub.id = id
    const rect = keys[target].getBoundingClientRect()
    this.bubble = { key: this.model[target].key, y: Math.round(rect.top + rect.height / 2 - nav.getBoundingClientRect().top) }
    this.scrollToSection(id, { focus: false, behavior: 'instant' })
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    const from = Number((event.target as HTMLElement).dataset.index)
    const enabled = this.model.flatMap((entry, index) => (entry.id ? [index] : []))
    if (!enabled.length || Number.isNaN(from)) return
    const at = enabled.indexOf(from)
    let next: number
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = enabled[Math.min(at + 1, enabled.length - 1)]
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = enabled[Math.max(at - 1, 0)]
    else if (event.key === 'Home') next = enabled[0]
    else if (event.key === 'End') next = enabled[enabled.length - 1]
    else return
    event.preventDefault()
    this.focusKey = this.model[next].key
    this.renderRoot.querySelector<HTMLElement>(`a[data-index="${next}"]`)?.focus()
  }

  private readonly handleFocusOut = (event: FocusEvent) => {
    // Leaving the rail hands its Tab stop back to the current key.
    if (!(event.currentTarget as Node).contains(event.relatedTarget as Node | null)) this.focusKey = null
  }
}

/** The keys listed in `keys`: one per character, or `;`-separated / a JSON array for longer keys. */
function parseKeys(value: string | string[] | undefined | null): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  const text = (value ?? '').trim()
  if (!text) return []
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {
      // Not JSON: read as below.
    }
  }
  if (text.includes(';'))
    return text
      .split(';')
      .map((key) => key.trim())
      .filter(Boolean)
  return Array.from(text.replace(/\s+/g, ''))
}

/** Files the sections under their keys, in the language of the rail (the nearest `lang`). */
function buildKeys(entries: IndexBarItem[], listed: string[], locale: string): IndexBarKey[] {
  let collator: Intl.Collator
  let upper: (text: string) => string
  try {
    collator = new Intl.Collator(locale, { sensitivity: 'base', usage: 'search' })
    upper = (text) => text.toLocaleUpperCase(locale)
  } catch {
    // A `lang` that is no valid language tag.
    collator = new Intl.Collator(undefined, { sensitivity: 'base', usage: 'search' })
    upper = (text) => text.toLocaleUpperCase()
  }
  const keys: IndexBarKey[] = listed.map((key) => ({ key, id: null, ids: [] }))
  const hash = listed.indexOf('#')
  for (const item of entries) {
    const key = upper(item.key ?? Array.from((item.label ?? '').trim())[0] ?? '')
    if (!key || !item.id) continue
    let index = keys.findIndex((entry) => upper(entry.key) === key)
    if (index < 0 && listed.length) index = keys.findIndex((entry) => collator.compare(entry.key, key) === 0)
    if (index < 0 && listed.length) index = hash
    if (index < 0) {
      if (listed.length) continue
      index = keys.push({ key, id: null, ids: [] }) - 1
    }
    keys[index].id ??= item.id
    keys[index].ids.push(item.id)
  }
  return keys
}

/** `index` when its key has a section, else the nearest following key that has one, else the nearest before it. */
function nearestKey(keys: IndexBarKey[], index: number) {
  for (let i = index; i < keys.length; i++) if (keys[i].id) return i
  for (let i = index - 1; i >= 0; i--) if (keys[i].id) return i
  return -1
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-index-bar': IndexBar
  }
}
