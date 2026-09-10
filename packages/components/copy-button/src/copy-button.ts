import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import styles from './copy-button.scss?inline'

/** Elements that carry their text on a property rather than in their child nodes. */
const TEXT_PROPERTY_TAGS = ['input', 'textarea', 'select']

/** Corners `pin` can anchor to. The bare `pin` attribute means `top-right`. */
export type CopyButtonPin = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

const SCROLLABLE_OVERFLOW = ['auto', 'scroll', 'overlay']

/**
 * Copies text to the clipboard.
 *
 * Drop it inside the element you want to copy and it copies that element: `<pre><c2-copy-button></c2-copy-button>…</pre>`
 * copies the `<pre>`. Point it somewhere else with `for` (the `id` of the source), or give it the literal text with
 * `value`. It reads the source the way that source stores its text — the `source` of a `c2-code-viewer`, the `value`
 * of an `<input>`/`<textarea>` or of a field that keeps its input in a shadow root (`c2-text-field`), otherwise the
 * rendered text — and never copies its own label, so a button sitting inside its source does not end up in the result.
 *
 * Renders a real `<button>` (focus is delegated to it). With no content it is an icon-only button; slot text to get
 * an icon and a label. After a successful copy it flips to the `copied` state for `copied-duration` ms.
 *
 * By default it only appears while the pointer is over its source (`reveal="always"` opts out), and `pin` puts it in
 * a corner of the source where it stays put even while the source scrolls.
 *
 * @tag c2-copy-button
 *
 * @slot - Optional label beside the icon. Empty by default, which gives an icon-only button.
 * @slot copy-icon - Replaces the default copy icon.
 * @slot copied-icon - Replaces the default check icon shown after a copy.
 * @slot copied-label - Replaces the default slot's text while in the `copied` state.
 *
 * @event {CustomEvent<{ text: string }>} copied - Fired after the text reached the clipboard. `detail.text` is what was copied.
 * @event {CustomEvent<{ error: unknown }>} copy-error - Fired when the clipboard write failed (denied permission, or no clipboard at all).
 *
 * @cssproperty {color} --c2-copy-button__container--background-color
 * @cssproperty {color} [--c2-copy-button__container--color=rgb(34, 34, 34)]
 * @cssproperty {border} [--c2-copy-button__container--border=none]
 * @cssproperty {border-radius} [--c2-copy-button__container--border-radius=6px]
 * @cssproperty {pixel} [--c2-copy-button__container--height=28px]
 * @cssproperty {pixel} [--c2-copy-button__container--min-width=28px]
 * @cssproperty {padding} [--c2-copy-button__container--padding-left=6px]
 * @cssproperty {padding} [--c2-copy-button__container--padding-right=6px]
 * @cssproperty {pixel} [--c2-copy-button__container--gap=6px]
 * @cssproperty {font-size} [--c2-copy-button__container--font-size=12px]
 * @cssproperty {font-weight} [--c2-copy-button__container--font-weight=500]
 * @cssproperty {font-family} --c2-copy-button__container--font-family
 *
 * @cssproperty {color} [--c2-copy-button__container__hover--background-color=rgb(230, 230, 230)]
 * @cssproperty {color} --c2-copy-button__container__hover--color
 * @cssproperty {border} --c2-copy-button__container__hover--border
 * @cssproperty {color} [--c2-copy-button__container__active--background-color=rgb(213, 213, 213)]
 * @cssproperty {outline} [--c2-copy-button__container__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-copy-button__container__focus--outline-offset=2px]
 * @cssproperty {opacity} [--c2-copy-button__container__disabled--opacity=0.38]
 *
 * @cssproperty {color} [--c2-copy-button__container__copied--color=rgb(0, 122, 77)] - Applied for `copied-duration` after a successful copy.
 * @cssproperty {color} --c2-copy-button__container__copied--background-color
 * @cssproperty {border} --c2-copy-button__container__copied--border
 *
 * @cssproperty {pixel} [--c2-copy-button__icon--size=16px]
 * @cssproperty {color} --c2-copy-button__icon--color - Defaults to the button's text colour.
 * @cssproperty {color} --c2-copy-button__icon__copied--color
 *
 * @cssproperty {time} [--c2-copy-button--transition-duration=150ms] - Fade of the hover reveal.
 * @cssproperty {pixel} [--c2-copy-button__pin--offset-x=6px] - Inset from the pinned corner, horizontally.
 * @cssproperty {pixel} [--c2-copy-button__pin--offset-y=6px] - Inset from the pinned corner, vertically.
 */
@customElement('c2-copy-button')
export class CopyButton extends LitElement {
  static override styles = unsafeCSS(styles)

  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  /** Literal text to copy. Takes precedence over `for` and over the parent element. */
  @property() value: string | undefined = undefined

  /** `id` of the element to copy, looked up in the containing document or shadow root. Overrides the parent element. */
  @property() for: string | undefined = undefined

  /** Disables the button: no pointer events, no focus, reduced opacity. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** True for `copied-duration` after a successful copy. Reflected, so `c2-copy-button[copied]` is styleable. */
  @property({ type: Boolean, reflect: true }) copied = false

  /** How long the `copied` state lasts, in ms. */
  @property({ type: Number, attribute: 'copied-duration' }) copiedDuration = 2000

  /** Accessible name of the button while idle. */
  @property() label = 'Copy'

  /** Accessible name (and `copied-label` fallback) after a successful copy. */
  @property({ attribute: 'copied-label' }) copiedLabel = 'Copied'

  /**
   * `hover` (default) keeps the button transparent until the pointer is over its source, or focus lands inside it.
   * `always` shows it permanently. A hover-only button still appears on keyboard focus, on devices with no hover at
   * all, and for as long as the `copied` confirmation is showing.
   */
  @property({ reflect: true }) reveal: 'hover' | 'always' = 'hover'

  /**
   * Pins the button to a corner of its containing block, staying put while the source scrolls under it.
   *
   * The bare attribute means `top-right`. The containing block must be positioned (`position: relative` on the
   * element the button sits in), as with any absolutely positioned child.
   */
  @property({ reflect: true }) pin: CopyButtonPin | '' | undefined = undefined

  /** Set when the last copy attempt failed, so the failure is visible rather than silent. */
  @state() private failed = false

  /** Whether a `hover`-reveal button is currently showing. Always true when `reveal` is `always`. */
  @state() private revealed = false

  private timer: ReturnType<typeof setTimeout> | undefined

  /** The element whose hover reveals the button, and whose focus keeps it revealed. */
  private hoverTarget: HTMLElement | null = null

  /** The scroll container whose offset the pin compensates for. */
  private scroller: HTMLElement | null = null

  private scrollFrame = 0

  /**
   * Devices without hover (touch) never fire `pointerenter`, so a hover-only button would be unreachable there.
   * `matchMedia` is read once per instance and kept live, because a hybrid device can gain or lose a pointer.
   */
  private hoverQuery: MediaQueryList | undefined

  override connectedCallback() {
    super.connectedCallback()
    this.hoverQuery ??= window.matchMedia?.('(hover: hover)')
    this.hoverQuery?.addEventListener('change', this.handleHoverQueryChange)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    clearTimeout(this.timer)
    cancelAnimationFrame(this.scrollFrame)
    this.hoverQuery?.removeEventListener('change', this.handleHoverQueryChange)
    this.detachHoverTarget()
    this.detachScroller()
  }

  override firstUpdated() {
    this.attachHoverTarget()
    this.attachScroller()
  }

  override willUpdate(changed: PropertyValues<this>) {
    // `for` repoints the source, so the hover target moves with it.
    if (changed.has('for') && this.hasUpdated) this.attachHoverTarget()
    if (changed.has('pin') && this.hasUpdated) this.attachScroller()
  }

  private handleHoverQueryChange = () => this.requestUpdate()

  /** True when the button should be visible: `always`, no hover support, revealed, or mid-confirmation. */
  private get isVisible(): boolean {
    if (this.reveal === 'always') return true
    if (this.hoverQuery && !this.hoverQuery.matches) return true
    return this.revealed || this.copied || this.failed
  }

  // ---------------------------------------------------------------------------
  // Hover / focus reveal
  // ---------------------------------------------------------------------------

  private attachHoverTarget() {
    const next = this.sourceElement
    if (next === this.hoverTarget) return
    this.detachHoverTarget()
    this.hoverTarget = next
    if (!next) return
    next.addEventListener('pointerenter', this.handleReveal)
    next.addEventListener('pointerleave', this.handleConceal)
    next.addEventListener('focusin', this.handleReveal)
    next.addEventListener('focusout', this.handleConceal)
  }

  private detachHoverTarget() {
    const target = this.hoverTarget
    if (!target) return
    target.removeEventListener('pointerenter', this.handleReveal)
    target.removeEventListener('pointerleave', this.handleConceal)
    target.removeEventListener('focusin', this.handleReveal)
    target.removeEventListener('focusout', this.handleConceal)
    this.hoverTarget = null
  }

  private handleReveal = () => (this.revealed = true)
  private handleConceal = () => (this.revealed = false)

  // ---------------------------------------------------------------------------
  // Pinning: stay in the corner while the source scrolls
  // ---------------------------------------------------------------------------

  private attachScroller() {
    this.detachScroller()
    if (!this.pin && this.pin !== '') return
    this.scroller = nearestScrollable(this)
    this.scroller?.addEventListener('scroll', this.handleScroll, { passive: true })
    this.syncPinOffset()
  }

  private detachScroller() {
    this.scroller?.removeEventListener('scroll', this.handleScroll)
    this.scroller = null
    this.style.removeProperty('--_c2-copy-button-scroll-x')
    this.style.removeProperty('--_c2-copy-button-scroll-y')
  }

  private handleScroll = () => {
    cancelAnimationFrame(this.scrollFrame)
    this.scrollFrame = requestAnimationFrame(() => this.syncPinOffset())
  }

  /**
   * Cancels out the scroll offset of the container.
   *
   * A pinned button is an absolutely positioned child of the scroll container, which puts it in the container's
   * scrollable overflow — so it scrolls away with the content, exactly when the user needs it (long or wide text is
   * the reason there is a scrollbar at all). Translating by the scroll offset holds it against the visible box.
   * The same sign works for all four corners: `right`/`bottom` are resolved against the padding box, whose size is
   * the client size, so every corner needs to move *with* the scroll.
   */
  private syncPinOffset() {
    const scroller = this.scroller
    if (!scroller) return
    this.style.setProperty('--_c2-copy-button-scroll-x', `${scroller.scrollLeft}px`)
    this.style.setProperty('--_c2-copy-button-scroll-y', `${scroller.scrollTop}px`)
  }

  /**
   * The element the text is read from: `for` by id, else the light-DOM parent.
   *
   * `parentElement` is deliberate — a button slotted into another custom element should copy the element it was
   * authored inside, not whatever shadow-DOM node it happens to be rendered in.
   */
  get sourceElement(): HTMLElement | null {
    if (this.for) {
      const root = this.getRootNode() as Document | ShadowRoot
      return (root.querySelector?.(`#${CSS.escape(this.for)}`) as HTMLElement | null) ?? null
    }
    return this.parentElement
  }

  /** The text that would be copied right now. */
  get text(): string {
    if (this.value !== undefined) return this.value
    const source = this.sourceElement
    if (!source) return ''
    return readText(source).trim()
  }

  /** Copies `text` to the clipboard and enters the `copied` state. Returns false when the write failed. */
  async copy(): Promise<boolean> {
    const text = this.text
    try {
      await writeToClipboard(text)
    } catch (error) {
      this.copied = false
      this.failed = true
      clearTimeout(this.timer)
      this.timer = setTimeout(() => (this.failed = false), this.copiedDuration)
      this.dispatchEvent(new CustomEvent('copy-error', { detail: { error }, bubbles: true, composed: true }))
      return false
    }
    this.failed = false
    this.copied = true
    clearTimeout(this.timer)
    this.timer = setTimeout(() => (this.copied = false), this.copiedDuration)
    this.dispatchEvent(new CustomEvent('copied', { detail: { text }, bubbles: true, composed: true }))
    return true
  }

  private handleClick() {
    void this.copy()
  }

  private renderIcon() {
    if (this.copied) {
      return html`<slot name="copied-icon"
        ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"></polyline></svg
      ></slot>`
    }
    return html`<slot name="copy-icon"
      ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg
    ></slot>`
  }

  override render() {
    return html`
      <button
        class=${classMap({ 'c2-copy-button': true, 'is-copied': this.copied, 'is-failed': this.failed, 'is-visible': this.isVisible })}
        part="button"
        type="button"
        ?disabled=${this.disabled}
        aria-label=${this.copied ? this.copiedLabel : this.label}
        @click=${this.handleClick}
      >
        <span class="c2-copy-button-icon" part="icon">${this.renderIcon()}</span>
        <span class="c2-copy-button-label"> ${this.copied ? html`<slot name="copied-label"><slot></slot></slot>` : html`<slot></slot>`} </span>
      </button>
      ${
        // The state change is announced separately: a label swap on the button itself is not reliably read out.
        html`<span class="c2-copy-button-status" role="status" aria-live="polite"
          >${this.copied ? this.copiedLabel : this.failed ? 'Copy failed' : nothing}</span
        >`
      }
    `
  }
}

/**
 * The nearest ancestor that can scroll, starting at the button's parent.
 *
 * Deliberately keyed on the overflow *style* and not on whether the box currently overflows: this runs once on
 * first render, and content that grows later (a webfont finishing, a value being set) would otherwise leave the
 * button attached to nothing and scrolling away. A container that never overflows keeps `scrollTop`/`scrollLeft`
 * at 0, so compensating it costs nothing.
 */
function nearestScrollable(from: HTMLElement): HTMLElement | null {
  let element = from.parentElement
  while (element && element !== document.body && element !== document.documentElement) {
    const style = getComputedStyle(element)
    if (SCROLLABLE_OVERFLOW.includes(style.overflowY) || SCROLLABLE_OVERFLOW.includes(style.overflowX)) return element
    element = element.parentElement
  }
  return null
}

/**
 * Reads the text of a source element the way that element stores it.
 *
 * `c2-code-viewer` keeps the real (dedented) code on `source`, form fields keep it on `value`, and everything else
 * keeps it in its child nodes. Falling back to `textContent` for a code viewer would copy the syntax-highlighted
 * DOM, which is the same characters but assembled from dozens of token spans — and for a field it would copy nothing.
 */
function readText(element: HTMLElement): string {
  if (TEXT_PROPERTY_TAGS.includes(element.localName)) {
    return (element as HTMLInputElement).value ?? ''
  }
  const source = (element as HTMLElement & { source?: unknown }).source
  if (typeof source === 'string') return source

  const text = textExcludingCopyButtons(element)
  if (text.trim()) return text

  // No light-DOM text at all: a custom element that keeps its text on `value` and its input in a shadow root
  // (`c2-text-field`, `c2-textarea`). Only consulted as a last resort, so an element that has both real text and an
  // unrelated `value` property still copies its text.
  const value = (element as HTMLElement & { value?: unknown }).value
  return typeof value === 'string' ? value : text
}

/**
 * `textContent` of `element`, minus any `c2-copy-button` inside it.
 *
 * Without this, the common case in the component's own docstring — a button dropped inside the block it copies —
 * would copy the button's own label along with the content.
 */
function textExcludingCopyButtons(element: Element): string {
  let text = ''
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.nodeValue ?? ''
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element
      if (child.localName === 'c2-copy-button') continue
      text += textExcludingCopyButtons(child)
    }
  }
  return text
}

/**
 * Writes to the clipboard, falling back to a hidden `<textarea>` + `execCommand` when the async Clipboard API is
 * unavailable. That covers non-secure contexts, which includes plain-http dev servers and previews — where
 * `navigator.clipboard` is simply undefined and the button would otherwise never work.
 */
async function writeToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.setAttribute('aria-hidden', 'true')
  // Off-screen rather than `display: none`: the selection has to be real for `execCommand` to see it.
  area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
  document.body.append(area)
  try {
    area.select()
    if (!document.execCommand('copy')) throw new Error('Copying to the clipboard is not available')
  } finally {
    area.remove()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-copy-button': CopyButton
  }
}
