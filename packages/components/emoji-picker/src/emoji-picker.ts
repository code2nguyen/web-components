import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { property, jsonPropertyConverter, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { state, query } from 'lit/decorators.js'
import { guard } from 'lit/directives/guard.js'
import { defaultEmojis, searchRank, type EmojiData } from './emojis'
import { emojiPickerMessages } from './messages'
import styles from './emoji-picker.scss?inline'

export { defaultEmojis, DEFAULT_EMOJI_GROUPS, type EmojiData } from './emojis'
export { emojiPickerMessages } from './messages'

/** A skin tone: 0 is the default yellow, 1 to 5 run from light to dark. */
export type SkinTone = 0 | 1 | 2 | 3 | 4 | 5

/** What `emoji-select` carries. */
export interface EmojiSelectDetail {
  /** The emoji picked, in the chosen skin tone when it has one. */
  emoji: string
  /** The emoji without a skin tone, as listed in the data. */
  base: string
  /** Its name. */
  name: string
  /** The skin tone applied, 0 when none was. */
  skinTone: SkinTone
}

/** Events fired by {@link EmojiPicker}, keyed for `addEventListener`. */
export interface EmojiPickerEventMap {
  'emoji-select': CustomEvent<EmojiSelectDetail>
  'skin-tone-change': CustomEvent<{ skinTone: SkinTone }>
}

export interface EmojiPicker {
  addEventListener: TypedAddEventListener<EmojiPicker, EmojiPickerEventMap>
  removeEventListener: TypedRemoveEventListener<EmojiPicker, EmojiPickerEventMap>
}

/** The message key of each category of the default set. */
const GROUP_MESSAGES = {
  'smileys-emotion': 'smileysEmotion',
  'people-body': 'peopleBody',
  'animals-nature': 'animalsNature',
  'food-drink': 'foodDrink',
  'travel-places': 'travelPlaces',
  activities: 'activities',
  objects: 'objects',
  symbols: 'symbols',
  flags: 'flags',
} as const

/** The emoji shown on each category's button. */
const GROUP_ICONS: Record<string, string> = {
  recent: '🕘',
  'smileys-emotion': '😀',
  'people-body': '👋',
  'animals-nature': '🐻',
  'food-drink': '🍔',
  'travel-places': '🚗',
  activities: '⚽',
  objects: '💡',
  symbols: '🔣',
  flags: '🏁',
}

const TONES: SkinTone[] = [0, 1, 2, 3, 4, 5]
const TONE_SWATCHES = ['✋', '✋🏻', '✋🏼', '✋🏽', '✋🏾', '✋🏿']

interface Section {
  id: string
  title: string
  items: EmojiData[]
}

/**
 * A searchable grid of emoji in categories, with a skin-tone choice and the emoji used last, like the pickers of Slack,
 * GitHub and Discord. Picking an emoji fires `emoji-select`; the picker does not close or insert anything itself, so it
 * fits a popover, a reaction bar (`c2-reaction-bar` takes one in its `picker` slot) or a panel of its own.
 *
 * The default set is every Unicode emoji up to 15.1 with English names and search keywords, from Emojibase. Set `emojis`
 * to offer your own set: a localised one, a smaller one, or custom emoji whose `emoji` is any text. Searching matches
 * the start of any word of a name or its keywords.
 *
 * The emoji are one grid in reading order: the arrow keys move between them (up and down by visual row), Home and End
 * go to the first and last, Enter or Space picks one. From the search field, Arrow Down enters the grid and Enter picks
 * the first match. The category buttons scroll to their section.
 *
 * Recently used emoji are listed first. They and the skin tone persist across visits only under a `storage-key`, kept
 * in `localStorage`; without one they last as long as the element.
 *
 * @tag c2-emoji-picker
 *
 * @event {CustomEvent<EmojiSelectDetail>} emoji-select - An emoji was picked. `detail.emoji` carries the chosen skin tone; `detail.base` is the emoji without one. Bubbles.
 * @event {CustomEvent<{ skinTone: SkinTone }>} skin-tone-change - The reader chose another skin tone.
 *
 * @csspart picker - The picker's box.
 * @csspart header - The row holding the search field and the skin-tone control.
 * @csspart search - The search field's box, holding its icon and input.
 * @csspart search-input - The search input.
 * @csspart tone-button - The button showing the current skin tone, which opens the choice of tones.
 * @csspart tones - The row of six skin tones the tone button opens.
 * @csspart categories - The row of category buttons.
 * @csspart category - One category button.
 * @csspart body - The scrolling list of sections.
 * @csspart section-title - The title above each section's grid.
 * @csspart grid - One section's grid of emoji.
 * @csspart emoji - One emoji button.
 * @csspart empty - The message shown when a search matches nothing.
 * @csspart preview - The footer naming the emoji pointed at or focused.
 *
 * @cssproperty {pixel} [--c2-emoji-picker--width=352px]
 * @cssproperty {pixel} [--c2-emoji-picker--height=420px]
 * @cssproperty {color} [--c2-emoji-picker--background-color=#ffffff]
 * @cssproperty {border} [--c2-emoji-picker--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-emoji-picker--border-radius=8px]
 * @cssproperty {shadow} [--c2-emoji-picker--box-shadow=none] - A shadow for a picker floating over the page.
 * @cssproperty {color} [--c2-emoji-picker--color=#18181b]
 * @cssproperty {font-size} [--c2-emoji-picker--font-size=14px]
 * @cssproperty {font-family} [--c2-emoji-picker__emoji--font-family=Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif] - The font the emoji are drawn with.
 *
 * @cssproperty {padding} [--c2-emoji-picker__header--padding=8px 8px 4px]
 * @cssproperty {pixel} [--c2-emoji-picker__search--height=32px]
 * @cssproperty {border} [--c2-emoji-picker__search--border=1px solid #bcbcc6]
 * @cssproperty {color} [--c2-emoji-picker__search__hover--border-color=#a1a1aa]
 * @cssproperty {border-radius} [--c2-emoji-picker__search--border-radius=6px]
 * @cssproperty {color} [--c2-emoji-picker__search--background-color=#ffffff]
 * @cssproperty {color} [--c2-emoji-picker__search--placeholder-color=#71717a]
 * @cssproperty {outline} [--c2-emoji-picker__search__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 *
 * @cssproperty {pixel} [--c2-emoji-picker__category--size=32px]
 * @cssproperty {color} [--c2-emoji-picker__category__hover--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-emoji-picker__category__active--indicator-color=rgb(2, 101, 220)] - The line under the category in view.
 * @cssproperty {number} [--c2-emoji-picker__category--opacity=0.55] - Opacity of the categories not in view, which are also drawn in grey.
 *
 * @cssproperty {pixel} [--c2-emoji-picker__emoji--size=36px] - The smallest an emoji button gets: each row fits as many as the picker's width allows, and they share what is left.
 * @cssproperty {pixel} [--c2-emoji-picker__grid--gap=2px]
 * @cssproperty {padding} [--c2-emoji-picker__body--padding=0 8px 8px] - Space around the sections inside the scrolling list.
 * @cssproperty {color} [--c2-emoji-picker__section-title--color=#71717a]
 * @cssproperty {font-size} [--c2-emoji-picker__section-title--font-size=12px]
 * @cssproperty {font-weight} [--c2-emoji-picker__section-title--font-weight=600]
 * @cssproperty {font-size} [--c2-emoji-picker__emoji--font-size=22px]
 * @cssproperty {border-radius} [--c2-emoji-picker__emoji--border-radius=6px]
 * @cssproperty {color} [--c2-emoji-picker__emoji__hover--background-color=#f4f4f5]
 * @cssproperty {outline} [--c2-emoji-picker__emoji__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 *
 * @cssproperty {border} [--c2-emoji-picker__preview--border-top=1px solid #e4e4e7]
 * @cssproperty {padding} [--c2-emoji-picker__preview--padding=6px 12px]
 * @cssproperty {font-size} [--c2-emoji-picker__preview__emoji--font-size=24px]
 * @cssproperty {color} [--c2-emoji-picker__preview--color=#71717a] - The preview's name, and its placeholder.
 * @cssproperty {color} [--c2-emoji-picker__empty--color=#71717a]
 */
@customElement('c2-emoji-picker')
export class EmojiPicker extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The emoji offered. Defaults to every Unicode emoji up to 15.1, with English names, from Emojibase. */
  @property({ converter: jsonPropertyConverter }) emojis: EmojiData[] | undefined = undefined

  /** The skin tone applied to emoji that have one: 0 is the default yellow, 1 to 5 run from light to dark. */
  @property({ type: Number, attribute: 'skin-tone' }) skinTone: SkinTone = 0

  /** The recently used emoji, newest first, without skin tones. Picking one moves it to the front. */
  @property({ converter: arrayPropertyConverter }) recents: string[] = []

  /** How many recently used emoji are kept. 0 hides the section. */
  @property({ type: Number, attribute: 'max-recents' }) maxRecents = 18

  /** `localStorage` key the recently used emoji and the skin tone are kept under. Without it they are not stored. */
  @property({ attribute: 'storage-key' }) storageKey = ''

  /** Text in the search field. Setting it searches. */
  @property() query = ''

  /** The accessible name of the picker. Defaults to "Emoji picker" in the page's language. */
  @property() label = ''

  /** Index, in display order, of the emoji that takes focus in the grid. Kept off the render: moving it re-renders nothing. */
  private activeIndex = 0
  /** The emoji the preview names: the one pointed at, else the one focused. */
  @state() private previewed: EmojiData | undefined
  @state() private activeSection = ''
  @state() private tonesOpen = false

  @query('.body') private body?: HTMLElement
  @query('.search-input') private searchInput?: HTMLInputElement

  private readonly msg = new LocalizeController(this, emojiPickerMessages)
  private readonly internals = this.attachInternals()
  /** The emoji listed, in display order: what the arrow keys walk through. */
  private flat: EmojiData[] = []
  /** The `storage-key` whose entry has been read. */
  private loadedKey = ''
  /** The sections last computed, and what they were computed from. */
  private sectionCache?: { key: unknown[]; sections: Section[] }

  override connectedCallback(): void {
    super.connectedCallback()
    this.internals.role = 'group'
    this.loadStorage()
  }

  /** Moves focus to the search field. */
  override focus(options?: FocusOptions): void {
    this.searchInput?.focus(options)
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('storageKey') && this.storageKey !== this.loadedKey) this.loadStorage()
    if (changed.has('query') || changed.has('emojis')) this.activeIndex = 0
  }

  protected override updated(changed: PropertyValues<this>): void {
    this.internals.ariaLabel = this.label || this.msg.t('label')
    if (changed.has('query') && this.body) this.body.scrollTop = 0
  }

  private get data(): EmojiData[] {
    return Array.isArray(this.emojis) ? this.emojis : defaultEmojis()
  }

  private get tone(): SkinTone {
    return TONES.includes(this.skinTone) ? this.skinTone : 0
  }

  private groupTitle(group: string): string {
    const key = GROUP_MESSAGES[group as keyof typeof GROUP_MESSAGES]
    return key ? this.msg.t(key) : group
  }

  private sections(): Section[] {
    const key = [this.data, this.query, this.recents, this.maxRecents, this.msg.locale]
    if (this.sectionCache?.key.every((value, at) => value === key[at])) return this.sectionCache.sections
    const sections = this.computeSections()
    this.sectionCache = { key, sections }
    return sections
  }

  private computeSections(): Section[] {
    const data = this.data
    const terms = this.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length) {
      const ranked = data
        .map((entry, order) => ({ entry, order, rank: searchRank(entry, terms) }))
        .filter((match) => match.rank >= 0)
        .sort((a, b) => a.rank - b.rank || a.order - b.order)
      return [{ id: 'results', title: this.msg.t('results'), items: ranked.map((match) => match.entry) }]
    }
    const sections: Section[] = []
    if (this.maxRecents > 0 && this.recents.length) {
      const byEmoji = new Map(data.map((entry) => [entry.emoji, entry]))
      const items = this.recents
        .slice(0, this.maxRecents)
        .map((emoji) => byEmoji.get(emoji))
        .filter((entry): entry is EmojiData => !!entry)
      if (items.length) sections.push({ id: 'recent', title: this.msg.t('recent'), items })
    }
    const groups = new Map<string, EmojiData[]>()
    for (const entry of data) {
      if (!groups.has(entry.group)) groups.set(entry.group, [])
      groups.get(entry.group)!.push(entry)
    }
    for (const [group, items] of groups) sections.push({ id: group, title: this.groupTitle(group), items })
    return sections
  }

  /** The emoji as shown: in the chosen skin tone when it has one. */
  private shown(entry: EmojiData): string {
    const tone = this.tone
    return tone && entry.skins?.[tone - 1] ? entry.skins[tone - 1] : entry.emoji
  }

  override render() {
    const sections = this.sections()
    this.flat = sections.flatMap((section) => section.items)
    const searching = !!this.query.trim()
    const inView = searching ? '' : this.activeSection || '0'
    return html`<div class="picker" part="picker">
      <div class="header" part="header">
        <label class="search" part="search">
          <svg class="search-icon" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <input
            class="search-input"
            part="search-input"
            type="search"
            autocomplete="off"
            spellcheck="false"
            .value=${this.query}
            placeholder=${this.msg.t('search')}
            aria-label=${this.msg.t('search')}
            @input=${this.handleSearch}
            @keydown=${this.handleSearchKeydown}
          />
        </label>
        <button
          class="tone-button"
          part="tone-button"
          type="button"
          aria-label=${this.msg.t('currentSkinTone', this.msg.t(`tone${this.tone}`))}
          aria-expanded=${this.tonesOpen ? 'true' : 'false'}
          aria-controls="tones"
          @click=${this.toggleTones}
        >
          <span class="emoji-glyph">${TONE_SWATCHES[this.tone]}</span>
        </button>
      </div>
      <div
        class="tones"
        part="tones"
        id="tones"
        role="radiogroup"
        aria-label=${this.msg.t('skinTone')}
        ?hidden=${!this.tonesOpen}
        @keydown=${this.handleTonesKeydown}
        @focusout=${this.handleTonesFocusOut}
      >
        ${TONES.map(
          (tone) =>
            html`<button
              class="tone"
              type="button"
              role="radio"
              aria-checked=${tone === this.tone ? 'true' : 'false'}
              aria-label=${this.msg.t(`tone${tone}`)}
              tabindex=${tone === this.tone ? 0 : -1}
              data-tone=${tone}
              @click=${this.pickTone}
            >
              <span class="emoji-glyph">${TONE_SWATCHES[tone]}</span>
            </button>`,
        )}
      </div>
      ${
        searching
          ? nothing
          : html`<div class="categories" part="categories" role="group" aria-label=${this.msg.t('categories')}>
              ${sections.map(
                (section, at) =>
                  html`<button
                    class="category"
                    part="category"
                    type="button"
                    aria-label=${section.title}
                    aria-current=${String(at) === inView ? 'true' : nothing}
                    data-section=${at}
                    @click=${this.scrollToSection}
                  >
                    <span class="emoji-glyph" aria-hidden="true">${GROUP_ICONS[section.id] ?? section.items[0]?.emoji ?? ''}</span>
                  </button>`,
              )}
            </div>`
      }
      <div
        class="body"
        part="body"
        @scroll=${this.handleScroll}
        @click=${this.handleGridClick}
        @keydown=${this.handleGridKeydown}
        @pointerover=${this.handlePointerOver}
        @pointerleave=${this.handlePointerLeave}
        @focusin=${this.handleFocusIn}
      >
        ${guard([sections, this.tone], () => this.renderSections(sections))}
        ${searching && !this.flat.length ? html`<p class="empty" part="empty">${this.msg.t('noResults', this.query.trim())}</p>` : nothing}
      </div>
      <div class="preview" part="preview" aria-hidden="true">
        ${
          this.previewed
            ? html`<span class="preview-emoji emoji-glyph">${this.shown(this.previewed)}</span><span class="preview-name">${this.previewed.name}</span>`
            : html`<span class="preview-name">${this.msg.t('placeholder')}</span>`
        }
      </div>
      <div class="visually-hidden" role="status">${searching ? this.msg.t('resultCount', this.flat.length) : ''}</div>
    </div>`
  }

  /** The grid of every section. Guarded in `render`: pointing at or focusing an emoji re-renders only the preview. */
  private renderSections(sections: Section[]) {
    const active = Math.min(this.activeIndex, Math.max(0, this.flat.length - 1))
    let index = 0
    return sections.map((section, at) => {
      if (!section.items.length) return nothing
      // Ids and keys come from the position: a group id of the author's own may hold spaces or repeat a built-in one.
      const titleId = `section-title-${at}`
      return html`<section class="section" data-section=${at} aria-labelledby=${titleId}>
        <div class="section-title" part="section-title" id=${titleId}>${section.title}</div>
        <div class="grid" part="grid">
          ${section.items.map((entry) => {
            const at = index++
            return html`<button class="emoji" part="emoji" type="button" tabindex=${at === active ? 0 : -1} aria-label=${entry.name} data-index=${at}>
              ${this.shown(entry)}
            </button>`
          })}
        </div>
      </section>`
    })
  }

  private emojiButton(index: number): HTMLButtonElement | null {
    return this.body?.querySelector<HTMLButtonElement>(`button.emoji[data-index="${index}"]`) ?? null
  }

  /** Moves the grid's single tab stop to `index`, touching only the old and the new stop. */
  private setTabStop(index: number): HTMLButtonElement | null {
    if (!this.flat.length) return null
    const target = Math.max(0, Math.min(this.flat.length - 1, index))
    for (const stop of this.body?.querySelectorAll<HTMLButtonElement>('button.emoji[tabindex="0"]') ?? []) stop.tabIndex = -1
    this.activeIndex = target
    const button = this.emojiButton(target)
    if (button) button.tabIndex = 0
    return button
  }

  private focusIndex(index: number): void {
    this.setTabStop(index)?.focus()
  }

  private pick(index: number): void {
    const entry = this.flat[index]
    if (!entry) return
    const emoji = this.shown(entry)
    if (this.maxRecents > 0) {
      const focused = this.shadowRoot?.activeElement
      const fromGrid = focused instanceof HTMLButtonElement && focused.matches('button.emoji')
      this.recents = [entry.emoji, ...this.recents.filter((recent) => recent !== entry.emoji)].slice(0, this.maxRecents)
      this.saveStorage()
      // The recent emoji are listed first, so every button after them moves: keep focus on the emoji just picked, in
      // its own category (its last occurrence), rather than on whatever button now sits where it was.
      this.updateComplete.then(() => {
        const at = this.flat.lastIndexOf(entry)
        if (fromGrid) this.focusIndex(at)
        else this.setTabStop(at)
      })
    }
    this.dispatchEvent(
      new CustomEvent<EmojiSelectDetail>('emoji-select', {
        bubbles: true,
        detail: { emoji, base: entry.emoji, name: entry.name, skinTone: emoji === entry.emoji ? 0 : this.tone },
      }),
    )
  }

  private handleSearch(event: Event): void {
    this.query = (event.target as HTMLInputElement).value
  }

  private handleSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' && this.flat.length) {
      event.preventDefault()
      this.focusIndex(0)
    } else if (event.key === 'Enter' && !event.isComposing && this.query.trim() && this.flat.length) {
      event.preventDefault()
      this.pick(0)
    }
  }

  private handleGridClick(event: Event): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('button.emoji')
    if (!button) return
    const index = Number(button.dataset.index)
    this.activeIndex = index
    this.pick(index)
  }

  private handleGridKeydown(event: KeyboardEvent): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('button.emoji')
    if (!button) return
    const index = Number(button.dataset.index)
    let next: number | undefined
    switch (event.key) {
      case 'ArrowRight':
        next = index + 1
        break
      case 'ArrowLeft':
        next = index - 1
        break
      case 'ArrowDown':
      case 'ArrowUp':
        next = this.verticalNeighbour(button, event.key === 'ArrowDown')
        if (next === undefined && event.key === 'ArrowUp') {
          event.preventDefault()
          this.searchInput?.focus()
          return
        }
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = this.flat.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    if (next !== undefined) this.focusIndex(next)
  }

  /** The emoji in the next visual row up or down, nearest in x: rows differ in length between sections. */
  private verticalNeighbour(from: HTMLButtonElement, down: boolean): number | undefined {
    const box = from.getBoundingClientRect()
    const centre = box.left + box.width / 2
    let rowTop: number | undefined
    let best: HTMLButtonElement | undefined
    let bestDistance = Infinity
    // The next row is within a few rows' worth of emoji, whatever the column count: measure only those.
    const origin = Number(from.dataset.index)
    const span = 64
    const start = down ? origin + 1 : Math.max(0, origin - span)
    const end = down ? Math.min(this.flat.length - 1, origin + span) : origin - 1
    for (let at = start; at <= end; at++) {
      const button = this.emojiButton(at)
      if (!button) continue
      const rect = button.getBoundingClientRect()
      const beyond = down ? rect.top > box.top + 2 : rect.top < box.top - 2
      if (!beyond) continue
      if (rowTop === undefined || (down ? rect.top < rowTop - 2 : rect.top > rowTop + 2)) {
        rowTop = rect.top
        best = undefined
        bestDistance = Infinity
      }
      if (Math.abs(rect.top - rowTop) > 2) continue
      const distance = Math.abs(rect.left + rect.width / 2 - centre)
      if (distance < bestDistance) {
        best = button
        bestDistance = distance
      }
    }
    return best ? Number(best.dataset.index) : undefined
  }

  private handlePointerOver(event: PointerEvent): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('button.emoji')
    if (button) this.previewed = this.flat[Number(button.dataset.index)]
  }

  private handlePointerLeave(): void {
    const focused = this.shadowRoot?.activeElement
    this.previewed = focused instanceof HTMLButtonElement && focused.matches('button.emoji') ? this.flat[Number(focused.dataset.index)] : undefined
  }

  private handleFocusIn(event: FocusEvent): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('button.emoji')
    if (!button) return
    if (button.tabIndex !== 0) this.setTabStop(Number(button.dataset.index))
    this.previewed = this.flat[this.activeIndex]
  }

  private handleScroll(): void {
    const body = this.body
    if (!body || this.query.trim()) return
    const top = body.scrollTop
    let current = ''
    for (const section of body.querySelectorAll<HTMLElement>('section')) {
      // `.body` is positioned, so a section's offsetTop is measured from the top of the scrolling list.
      if (section.offsetTop <= top + 8) current = section.dataset.section ?? ''
      else break
    }
    if (current !== this.activeSection) this.activeSection = current
  }

  private scrollToSection(event: Event): void {
    const id = (event.currentTarget as HTMLElement).dataset.section
    const body = this.body
    const section = body?.querySelector<HTMLElement>(`section[data-section="${CSS.escape(id ?? '')}"]`)
    if (!body || !section) return
    body.scrollTop = section.offsetTop
    this.activeSection = id ?? ''
  }

  private toggleTones(): void {
    this.tonesOpen = !this.tonesOpen
    if (this.tonesOpen) this.updateComplete.then(() => this.renderRoot.querySelector<HTMLButtonElement>('.tone[tabindex="0"]')?.focus())
  }

  private pickTone(event: Event): void {
    const tone = Number((event.currentTarget as HTMLElement).dataset.tone) as SkinTone
    this.tonesOpen = false
    this.updateComplete.then(() => this.renderRoot.querySelector<HTMLButtonElement>('.tone-button')?.focus())
    if (tone === this.tone) return
    this.skinTone = tone
    this.saveStorage()
    this.dispatchEvent(new CustomEvent('skin-tone-change', { detail: { skinTone: tone } }))
  }

  /** The choice of tones closes when focus leaves it for anything but the button that opened it. */
  private handleTonesFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Element | null
    if (next?.closest('.tones, .tone-button')) return
    this.tonesOpen = false
  }

  private handleTonesKeydown(event: KeyboardEvent): void {
    const tones = [...this.renderRoot.querySelectorAll<HTMLButtonElement>('.tone')]
    const at = tones.indexOf(event.target as HTMLButtonElement)
    if (at < 0) return
    let next: number | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (at + 1) % tones.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (at - 1 + tones.length) % tones.length
    else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.tonesOpen = false
      this.updateComplete.then(() => this.renderRoot.querySelector<HTMLButtonElement>('.tone-button')?.focus())
      return
    }
    if (next === undefined) return
    event.preventDefault()
    for (const tone of tones) tone.tabIndex = -1
    tones[next].tabIndex = 0
    tones[next].focus()
  }

  private loadStorage(): void {
    if (isServer || this.storageKey === this.loadedKey) return
    const switching = this.loadedKey !== ''
    this.loadedKey = this.storageKey
    if (!this.storageKey) return
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) ?? 'null') as { recents?: unknown; skinTone?: unknown } | null
      // Moving to another key (another user) must not carry the previous one's choices into it.
      if (!saved && switching) {
        this.recents = []
        this.skinTone = 0
      }
      if (Array.isArray(saved?.recents)) this.recents = saved.recents.filter((emoji): emoji is string => typeof emoji === 'string')
      if (TONES.includes(saved?.skinTone as SkinTone)) this.skinTone = saved!.skinTone as SkinTone
    } catch {
      // A private window or a corrupt entry only costs the stored choices.
    }
  }

  private saveStorage(): void {
    if (isServer || !this.storageKey) return
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({ recents: this.recents, skinTone: this.tone }))
    } catch {
      // A private window or a full quota only costs the stored choices.
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-emoji-picker': EmojiPicker
  }
}
