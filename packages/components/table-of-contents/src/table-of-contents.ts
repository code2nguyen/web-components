import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { tableOfContentsMessages } from './messages'
import styles from './table-of-contents.scss?inline'

/** One entry of the table of contents. */
export interface TableOfContentsItem {
  /** `id` of the element the entry links to. */
  id: string
  /** Text of the entry. */
  label: string
  /** Nesting depth, `1` for the top level. Only the differences matter: `[2, 3, 3, 2]` nests like `[1, 2, 2, 1]`. */
  level?: number
}

export interface TableOfContentsActiveChangeEventDetail {
  /** `id` of the section now current, or `null` when the list has no entries. */
  id: string | null
  /** The entry of that section. */
  item: TableOfContentsItem | null
}

export interface TableOfContentsEventMap {
  'active-change': CustomEvent<TableOfContentsActiveChangeEventDetail>
}

export interface TableOfContents {
  addEventListener: TypedAddEventListener<TableOfContents, TableOfContentsEventMap>
  removeEventListener: TypedRemoveEventListener<TableOfContents, TableOfContentsEventMap>
}

interface TocNode {
  item: TableOfContentsItem
  index: number
  level: number
  children: TocNode[]
}

/**
 * An "On this page" navigation for long documents. It lists the headings of the page (or of the element named by
 * `for`), nests them by level, and follows the reader: the section at the top of the scroll area is marked current
 * (`aria-current="true"`) and a sliding indicator moves to its link. Activating a link scrolls to the section, moves
 * focus to its heading and updates the URL fragment.
 *
 * Headings are read from the page and re-read when it changes; a heading needs an `id` to be listed, its
 * `data-toc-label` replaces its text, and `data-toc-ignore` leaves it out. Pass `items` instead to list sections
 * yourself, which also renders on the server.
 *
 * @tag c2-table-of-contents
 *
 * @event {CustomEvent<TableOfContentsActiveChangeEventDetail>} active-change - The current section changed, by scrolling or by activating a link. Does not bubble.
 *
 * @csspart nav - The `<nav>` landmark around the whole list.
 * @csspart title - The heading above the list.
 * @csspart list - Every `<ul>`, the nested ones included.
 * @csspart link - Every entry's `<a>`; the current one also has the `active` part.
 * @csspart active - The current entry's link.
 * @csspart track - The rail along the start edge of the list.
 * @csspart indicator - The marker that slides along the rail to the current entry.
 * @csspart progress - The part of the rail from the top to the current entry.
 *
 * @cssproperty {font-family} [--c2-table-of-contents--font-family=inherit]
 * @cssproperty {font-size} [--c2-table-of-contents--font-size=14px]
 * @cssproperty {display} [--c2-table-of-contents__title--display=block] - `none` hides the title; it still names the navigation.
 * @cssproperty {color} [--c2-table-of-contents__title--color=#71717a]
 * @cssproperty {font-size} [--c2-table-of-contents__title--font-size=12px]
 * @cssproperty {font-weight} [--c2-table-of-contents__title--font-weight=600]
 * @cssproperty {letter-spacing} [--c2-table-of-contents__title--letter-spacing=0.06em]
 * @cssproperty {text-transform} [--c2-table-of-contents__title--text-transform=uppercase]
 * @cssproperty {margin} [--c2-table-of-contents__title--margin=0 0 8px]
 * @cssproperty {color} [--c2-table-of-contents__link--color=#71717a]
 * @cssproperty {color} [--c2-table-of-contents__link--background-color=transparent]
 * @cssproperty {font-weight} [--c2-table-of-contents__link--font-weight=400]
 * @cssproperty {pixel} [--c2-table-of-contents__link--padding-block=4px]
 * @cssproperty {pixel} [--c2-table-of-contents__link--padding-inline=12px] - Space between the rail and the text, and after the text.
 * @cssproperty {line-height} [--c2-table-of-contents__link--line-height=1.4]
 * @cssproperty {border-radius} [--c2-table-of-contents__link--border-radius=0]
 * @cssproperty {pixel} [--c2-table-of-contents__link--indent=12px] - Added to the start padding for each level of nesting.
 * @cssproperty {color} [--c2-table-of-contents__link__hover--color=#18181b]
 * @cssproperty {color} [--c2-table-of-contents__link__hover--background-color=transparent]
 * @cssproperty {color} [--c2-table-of-contents__link__active--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-table-of-contents__link__active--background-color=transparent]
 * @cssproperty {font-weight} [--c2-table-of-contents__link__active--font-weight=500]
 * @cssproperty {color} [--c2-table-of-contents__link__passed--color=#71717a] - Entries above the current one, already read.
 * @cssproperty {outline} [--c2-table-of-contents__link__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-table-of-contents__link__focus--outline-offset=-2px]
 * @cssproperty {font-size} [--c2-table-of-contents__nested--font-size=inherit] - Size of entries below the top level.
 * @cssproperty {content} [--c2-table-of-contents__marker--content=none] - Text before each entry, such as `counters(c2-toc, '.') '. '` for numbered sections (`c2-toc` is the counter of each list).
 * @cssproperty {color} [--c2-table-of-contents__marker--color=#71717a]
 * @cssproperty {pixel} [--c2-table-of-contents__track--width=1px] - `0` removes the rail; set `__indicator--width` to `0` as well to remove the indicator.
 * @cssproperty {color} [--c2-table-of-contents__track--background-color=#e4e4e7]
 * @cssproperty {pixel} [--c2-table-of-contents__indicator--width=2px]
 * @cssproperty {color} [--c2-table-of-contents__indicator--background-color=rgb(2, 101, 220)]
 * @cssproperty {border-radius} [--c2-table-of-contents__indicator--border-radius=999px]
 * @cssproperty {color} [--c2-table-of-contents__progress--background-color=transparent] - Fills the rail from the top down to the current entry, as reading progress.
 * @cssproperty {time} [--c2-table-of-contents--transition-duration=150ms] - How long the indicator takes to slide.
 */
@customElement('c2-table-of-contents')
export class TableOfContents extends LitElement {
  static override styles = unsafeCSS(styles)

  /** `id` of the element whose headings are listed. Without it the page's `<main>` is read, or the whole body. */
  @property({ type: String }) for = ''

  /** Which elements of that element are listed, in document order. The level of `h1`–`h6` is its number; any other element's is its `aria-level`, or 1. */
  @property({ type: String }) selector = 'h2, h3'

  /** The sections to list, in place of reading the headings. Each needs the `id` of an element on the page. */
  @property({ converter: jsonPropertyConverter }) items?: TableOfContentsItem[]

  /** Title of the list and name of the navigation landmark. Defaults to the translatable "On this page". */
  @property({ type: String }) label = ''

  /**
   * Distance in pixels from the top of the scroll area where a section becomes current, and where a link scrolls its
   * section to. Set it to the height of a sticky header.
   */
  @property({ type: Number }) offset = 0

  /** Leave the page URL alone when a link is activated, for an app that routes on the fragment. */
  @property({ type: Boolean, attribute: 'keep-url' }) keepUrl = false

  @state() private scanned: TableOfContentsItem[] = []
  @state() private current: string | null = null

  private readonly msg = new LocalizeController(this, tableOfContentsMessages)
  private mutationObserver?: MutationObserver
  private resizeObserver?: ResizeObserver
  private observedRoot?: Element
  /** What the MutationObserver watches: the headings of `observedRoot`, or the document for a `for` not there yet. */
  private observing: 'headings' | 'for' | null = null
  private mutationRoot?: Element
  private frame = 0
  private scanFrame = 0
  private scrollingTo: string | null = null
  private lockScroller: HTMLElement | null = null
  private unlockTimer = 0

  /** `id` of the current section. */
  get activeId(): string | null {
    return this.current
  }

  /** The entries listed: `items` when set, otherwise the headings read from the page. */
  get entries(): TableOfContentsItem[] {
    return Array.isArray(this.items) ? this.items : this.scanned
  }

  override connectedCallback() {
    super.connectedCallback()
    document.addEventListener('scroll', this.handleScroll, { capture: true, passive: true })
    window.addEventListener('resize', this.handleScroll, { passive: true })
    // The first scan waits for the first render, so a server-rendered list hydrates as it was rendered.
    if (this.hasUpdated) {
      this.resizeObserver?.observe(this)
      this.scheduleScan()
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    document.removeEventListener('scroll', this.handleScroll, { capture: true })
    window.removeEventListener('resize', this.handleScroll)
    this.mutationObserver?.disconnect()
    this.mutationObserver = undefined
    this.observing = null
    this.mutationRoot = undefined
    this.observedRoot = undefined
    this.resizeObserver?.disconnect()
    cancelAnimationFrame(this.frame)
    cancelAnimationFrame(this.scanFrame)
    this.frame = this.scanFrame = 0
    this.unlock()
  }

  protected override firstUpdated() {
    this.resizeObserver = new ResizeObserver(() => {
      this.measure()
      this.handleScroll()
    })
    this.resizeObserver.observe(this)
    this.scan()
    this.spy()
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>) {
    if (this.hasUpdated && (changed.has('for') || changed.has('selector') || changed.has('items'))) this.scheduleScan()
    // The spy reads the page, not this element's render, so the current entry is settled before rendering.
    // Not before the first render, so a server-rendered list hydrates as it was rendered.
    if (this.hasUpdated && (changed.has('items') || changed.has('scanned') || changed.has('offset'))) this.spy()
  }

  protected override updated() {
    this.measure()
  }

  override render() {
    const entries = this.entries
    if (entries.length === 0) return nothing
    const label = this.label || this.msg.t('label')
    const activeIndex = entries.findIndex((item) => item.id === this.current)
    return html`
      <nav class="c2-table-of-contents" part="nav" aria-labelledby="title">
        <div class="title" id="title" part="title">${label}</div>
        <div class="body">
          <div class="track" part="track"></div>
          <div class="progress" part="progress" hidden></div>
          <div class="indicator" part="indicator" hidden></div>
          ${this.renderList(buildTree(entries), activeIndex)}
        </div>
      </nav>
    `
  }

  private renderList(nodes: TocNode[], activeIndex: number): unknown {
    return html`<ul class="list" part="list" role="list">
      ${nodes.map(({ item, index, level, children }) => {
        const active = index === activeIndex
        return html`<li>
          <a
            class="link ${active ? 'active' : ''} ${activeIndex > index ? 'passed' : ''} ${level > 1 ? 'nested' : ''}"
            part=${active ? 'link active' : 'link'}
            href="#${encodeURIComponent(item.id)}"
            style="--level:${level - 1}"
            data-id=${item.id}
            aria-current=${active ? 'true' : nothing}
            @click=${(event: MouseEvent) => this.handleClick(event, item)}
            >${item.label}</a
          >
          ${children.length ? this.renderList(children, activeIndex) : nothing}
        </li>`
      })}
    </ul>`
  }

  /** Moves to the section `id`, as activating its link does. */
  scrollToSection(id: string, options: { focus?: boolean } = {}) {
    const target = this.resolveTarget(id)
    if (!target) return false
    this.setCurrent(id)
    this.lock(id, scrollParent(target))
    scrollTarget(target, this.offset)
    if (options.focus !== false) focusTarget(target)
    return true
  }

  private handleClick(event: MouseEvent, item: TableOfContentsItem) {
    // A modified click (new tab, new window, copy link) is the browser's to handle.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (!this.resolveTarget(item.id)) return
    event.preventDefault()
    this.scrollToSection(item.id)
    if (!this.keepUrl && decodeHash(location.hash) !== item.id) history.pushState(history.state, '', `#${encodeURIComponent(item.id)}`)
  }

  private readonly handleScroll = () => {
    // While a link's scroll runs, each of its frames pushes the end of the lock back.
    if (this.scrollingTo) this.armUnlock(SCROLL_IDLE)
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.spy()
    })
  }

  /** Marks current the last section whose top has passed the offset line. */
  private spy() {
    if (this.scrollingTo) return
    const entries = this.entries
    // A section that is not laid out (missing, or inside a hidden panel) has no position to compare.
    const targets = entries.map((item) => {
      const target = this.resolveTarget(item.id)
      return target && target.getClientRects().length > 0 ? target : null
    })
    const first = targets.find((target) => target !== null)
    if (!first) {
      this.setCurrent(entries[0]?.id ?? null)
      return
    }
    const scroller = scrollParent(first)
    const areaTop = scroller ? scroller.getBoundingClientRect().top : 0
    const line = areaTop + this.offset + 1
    let index = -1
    targets.forEach((target, i) => {
      if (target && target.getBoundingClientRect().top <= line) index = i
    })
    // At the very end the last sections may never reach the line: the one the reader scrolled to see is the last
    // section on show, as long as it is in view (content may go on well past the listed sections).
    let lastIndex = targets.length - 1
    while (lastIndex > 0 && !targets[lastIndex]) lastIndex--
    const last = targets[lastIndex]
    const areaBottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight
    if (last && isAtEnd(scroller) && last.getBoundingClientRect().top < areaBottom) index = Math.max(index, lastIndex)
    this.setCurrent(entries[Math.max(index, 0)]?.id ?? null)
  }

  private setCurrent(id: string | null) {
    if (id === this.current) return
    this.current = id
    const item = this.entries.find((entry) => entry.id === id) ?? null
    this.dispatchEvent(new CustomEvent<TableOfContentsActiveChangeEventDetail>('active-change', { detail: { id, item } }))
  }

  /** Holds the clicked section current while the page scrolls to it, so the sections passed on the way do not flash. */
  private lock(id: string, scroller: HTMLElement | null) {
    this.unlock()
    this.scrollingTo = id
    this.lockScroller = scroller
    document.addEventListener('scrollend', this.handleScrollEnd, { capture: true })
    // No scrollend fires when nothing had to scroll, or in an engine without the event: the lock then ends once no
    // scroll frame has come for a while.
    this.armUnlock(SCROLL_START)
  }

  private armUnlock(delay: number) {
    clearTimeout(this.unlockTimer)
    this.unlockTimer = window.setTimeout(() => this.unlock(), delay)
  }

  // Only the end of the scroll the link started counts, not a carousel or code block settling elsewhere. No spy here: a
  // section near the end of the page may stop below the line, and the reader asked for that one. The next scroll of
  // their own hands the list back to the spy.
  private readonly handleScrollEnd = (event: Event) => {
    const scroller = this.lockScroller
    const target = event.target
    if (scroller ? target !== scroller : target !== document && target !== document.scrollingElement && target !== window) return
    this.unlock()
  }

  private unlock() {
    this.scrollingTo = null
    this.lockScroller = null
    clearTimeout(this.unlockTimer)
    document.removeEventListener('scrollend', this.handleScrollEnd, { capture: true })
  }

  private measure() {
    const list = this.renderRoot.querySelector<HTMLElement>('.body')
    if (!list) return
    const link = list.querySelector<HTMLElement>('.link.active')
    const indicator = list.querySelector<HTMLElement>('.indicator')!
    const progress = list.querySelector<HTMLElement>('.progress')!
    indicator.hidden = progress.hidden = !link
    if (!link) return
    // Written straight to the shadow elements: the position follows layout, not a property, so it is no render state.
    const top = link.getBoundingClientRect().top - list.getBoundingClientRect().top
    indicator.style.transform = `translateY(${top}px)`
    indicator.style.blockSize = `${link.offsetHeight}px`
    progress.style.blockSize = `${top + link.offsetHeight}px`
    // A list taller than its box keeps the current entry in view, whether the element or a wrapper of it scrolls; never
    // the scroller of the content itself, which is the reader's.
    const box = scrollParent(link)
    const content = this.observedRoot
    if (box && !(content && box.contains(content))) {
      const area = box.getBoundingClientRect()
      const rect = link.getBoundingClientRect()
      if (rect.top < area.top) box.scrollTop -= area.top - rect.top
      else if (rect.bottom > area.bottom) box.scrollTop += rect.bottom - area.bottom
    }
  }

  private scheduleScan() {
    if (this.scanFrame) return
    this.scanFrame = requestAnimationFrame(() => {
      this.scanFrame = 0
      this.scan()
    })
  }

  private scan() {
    const root = this.resolveRoot()
    if (root !== this.observedRoot) {
      if (this.observedRoot) this.resizeObserver?.unobserve(this.observedRoot)
      this.observedRoot = root ?? undefined
      // Content that is shown, hidden or reflowed moves its headings without a scroll.
      if (root) this.resizeObserver?.observe(root)
    }
    // Headings are only watched while they are read; a `for` element that is not on the page yet is waited for.
    const observing = !root ? 'for' : Array.isArray(this.items) ? null : 'headings'
    if (observing !== this.observing || root !== this.mutationRoot) {
      this.mutationObserver?.disconnect()
      this.mutationObserver = undefined
      this.observing = observing
      this.mutationRoot = root ?? undefined
      if (observing === 'for') {
        this.mutationObserver = new MutationObserver(() => this.scheduleScan())
        this.mutationObserver.observe(this.getRootNode() as Document | ShadowRoot, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['id'],
        })
      } else if (observing === 'headings' && root) {
        this.mutationObserver = new MutationObserver(() => this.scheduleScan())
        this.mutationObserver.observe(root, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['id', 'aria-level', 'data-toc-label', 'data-toc-ignore'],
        })
      }
    }
    if (Array.isArray(this.items) || !root) {
      if (this.scanned.length) this.scanned = []
      return
    }
    let headings: Element[] = []
    try {
      headings = Array.from(root.querySelectorAll(this.selector))
    } catch {
      // An invalid selector lists nothing rather than breaking the page.
    }
    const next = headings
      .filter((heading) => heading.id && !heading.hasAttribute('data-toc-ignore') && !this.contains(heading))
      .map((heading) => ({
        id: heading.id,
        label: (heading.getAttribute('data-toc-label') ?? heading.textContent ?? '').replace(/\s+/g, ' ').trim(),
        level: headingLevel(heading),
      }))
    if (!sameItems(next, this.scanned)) this.scanned = next
  }

  private resolveRoot(): Element | null {
    const root = this.getRootNode() as Document | ShadowRoot
    if (this.for) return root.getElementById?.(this.for) ?? document.getElementById(this.for)
    return root.querySelector('main') ?? document.querySelector('main') ?? document.body
  }

  private resolveTarget(id: string): HTMLElement | null {
    if (!id) return null
    const root = this.getRootNode() as Document | ShadowRoot
    // The headings may live in another shadow root than the list, when `for` names an element there.
    const scope = this.observedRoot?.getRootNode() as Document | ShadowRoot | undefined
    return root.getElementById?.(id) ?? scope?.getElementById?.(id) ?? document.getElementById(id)
  }
}

/** How long a link's scroll may take to start, and how long a pause in its frames means it has ended (ms). */
const SCROLL_START = 300
const SCROLL_IDLE = 200

function buildTree(items: TableOfContentsItem[]): TocNode[] {
  const levels = items.map((item) => Math.max(1, Math.floor(Number(item.level) || 1)))
  const min = Math.min(...levels)
  const roots: TocNode[] = []
  const stack: TocNode[] = []
  items.forEach((item, index) => {
    const node: TocNode = { item, index, level: 1, children: [] }
    const level = levels[index] - min + 1
    while (stack.length && levels[stack[stack.length - 1].index] - min + 1 >= level) stack.pop()
    const parent = stack[stack.length - 1]
    // A level that skips one (an h4 right under an h2) nests one step, never two.
    node.level = parent ? parent.level + 1 : 1
    if (parent) parent.children.push(node)
    else roots.push(node)
    stack.push(node)
  })
  return roots
}

function headingLevel(heading: Element) {
  const match = /^H([1-6])$/.exec(heading.tagName)
  if (match) return Number(match[1])
  return Number(heading.getAttribute('aria-level')) || 1
}

function sameItems(a: TableOfContentsItem[], b: TableOfContentsItem[]) {
  return a.length === b.length && a.every((item, i) => item.id === b[i].id && item.label === b[i].label && item.level === b[i].level)
}

/** The nearest ancestor that scrolls vertically, crossing shadow roots, or `null` for the viewport. */
function scrollParent(element: Element): HTMLElement | null {
  let node: Node | null = element.parentNode as Node | null
  while (node) {
    if (node instanceof ShadowRoot) {
      node = node.host
      continue
    }
    if (!(node instanceof HTMLElement) || node === document.body || node === document.documentElement) break
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && node.scrollHeight > node.clientHeight) return node
    node = node.parentNode
  }
  return null
}

function isAtEnd(scroller: HTMLElement | null) {
  const element = scroller ?? document.scrollingElement ?? document.documentElement
  const height = scroller ? scroller.clientHeight : window.innerHeight
  // A box that does not scroll at all has no end to reach.
  if (element.scrollHeight <= height + 1) return false
  return element.scrollTop + height >= element.scrollHeight - 2
}

function scrollTarget(target: HTMLElement, offset: number) {
  const scroller = scrollParent(target)
  const areaTop = scroller ? scroller.getBoundingClientRect().top : 0
  const top = target.getBoundingClientRect().top - areaTop - offset
  const behavior: ScrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  ;(scroller ?? window).scrollBy({ top, behavior })
}

function focusTarget(target: HTMLElement) {
  target.focus({ preventScroll: true })
  if (isFocused(target) || target.hasAttribute('tabindex')) return
  // A heading cannot take focus: make it so only while it holds focus, so it never becomes a Tab stop.
  target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
  if (!isFocused(target)) {
    target.removeAttribute('tabindex')
    return
  }
  const release = () => {
    if (isFocused(target)) return
    target.removeAttribute('tabindex')
    target.removeEventListener('blur', release)
  }
  target.addEventListener('blur', release)
}

function isFocused(target: HTMLElement) {
  const root = target.getRootNode() as Document | ShadowRoot
  return root.activeElement === target
}

function decodeHash(hash: string) {
  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return hash.slice(1)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-table-of-contents': TableOfContents
  }
}
