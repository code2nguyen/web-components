import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { consume } from '@lit/context'
import { accordionContext, type AccordionContext } from './details-context'
import { customElement, property, query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import styles from './details.scss?inline'

/**
 * Collapsible disclosure built on native `<details>` / `<summary>`, so keyboard access, screen-reader semantics and
 * find-in-page auto-expand come from the browser. Panels that share a `name` form an exclusive accordion. Open and
 * close animate the content height (plus a fade) with the Web Animations API, so the motion is identical in every
 * browser; the native `open` attribute is only removed once the close animation has finished.
 *
 * @tag c2-details
 *
 * @slot title - Header label. Falls back to the `label` attribute.
 * @slot header-content - Second header row under the title (description, badges, actions). Stays visible when
 *   collapsed; clicks inside it do not toggle the panel, so buttons and links work there.
 * @slot icon - Chevron shown in the header; rotates when open. Defaults to an inline SVG.
 * @slot expanded-icon - Alternative icon shown only while open (replaces the rotation).
 * @slot - Collapsible content.
 *
 * @event {ToggleEvent} toggle - Re-dispatched from the native details after it opens or closes (`newState` is `open` or `closed`).
 *
 * @cssproperty {border} [--c2-details--border-top=1px solid rgb(213, 213, 213)]
 * @cssproperty {border} [--c2-details--border-right=1px solid rgb(213, 213, 213)]
 * @cssproperty {border} [--c2-details--border-bottom=1px solid rgb(213, 213, 213)]
 * @cssproperty {border} [--c2-details--border-left=1px solid rgb(213, 213, 213)]
 *
 * @cssproperty {border-radius} [--c2-details--border-top-left-radius=8px]
 * @cssproperty {border-radius} [--c2-details--border-top-right-radius=8px]
 * @cssproperty {border-radius} [--c2-details--border-bottom-left-radius=8px]
 * @cssproperty {border-radius} [--c2-details--border-bottom-right-radius=8px]
 *
 * @cssproperty {background} [--c2-details--background=rgb(255, 255, 255)]
 * @cssproperty {box-shadow} --c2-details--box-shadow
 * @cssproperty {time} [--c2-details--transition-duration=250ms] - Open and close animation length; `0ms` disables it. Respects `prefers-reduced-motion`.
 *
 * @cssproperty {padding} [--c2-details__header--padding-top=12px]
 * @cssproperty {padding} [--c2-details__header--padding-right=16px]
 * @cssproperty {padding} [--c2-details__header--padding-bottom=12px]
 * @cssproperty {padding} [--c2-details__header--padding-left=16px]
 *
 * @cssproperty {background} --c2-details__header--background
 * @cssproperty {color} --c2-details__header--color
 * @cssproperty {font-weight} [--c2-details__header--font-weight=500]
 * @cssproperty {font-size} --c2-details__header--font-size
 * @cssproperty {pixel} [--c2-details__header--gap=12px]
 * @cssproperty {flex-direction-row} [--c2-details__header--flex-direction=row] - `row-reverse` puts the icon first.
 *
 * @cssproperty {pixel} [--c2-details__header__icon--width=20px]
 * @cssproperty {pixel} [--c2-details__header__icon--height=20px]
 * @cssproperty {pixel} [--c2-details__header__icon--rotate=180deg]
 * @cssproperty {color} [--c2-details__header__icon--color=rgb(109, 109, 109)]
 *
 * @cssproperty {pixel} [--c2-details__header__content--margin-top=4px]
 * @cssproperty {color} [--c2-details__header__content--color=rgb(109, 109, 109)]
 * @cssproperty {font-size} [--c2-details__header__content--font-size=13px]
 * @cssproperty {font-weight} [--c2-details__header__content--font-weight=400]
 *
 * @cssproperty {background} [--c2-details__header__hover--background=rgb(248, 248, 248)]
 * @cssproperty {color} --c2-details__header__hover--color
 * @cssproperty {background} --c2-details__header__open--background
 * @cssproperty {color} --c2-details__header__open--color
 * @cssproperty {outline} [--c2-details__header__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-details__header__focus--outline-offset=-2px]
 * @cssproperty {opacity} [--c2-details__header__disabled--opacity=0.38]
 *
 * @cssproperty {padding} [--c2-details__content--padding-top=4px]
 * @cssproperty {padding} --c2-details__content--padding-right - Falls back to the header padding.
 * @cssproperty {padding} --c2-details__content--padding-bottom - Falls back to the header padding.
 * @cssproperty {padding} --c2-details__content--padding-left - Falls back to the header padding.
 * @cssproperty {color} --c2-details__content--color
 * @cssproperty {border} --c2-details__content--border-top - Divider between header and content.
 */
@customElement('c2-details')
export class Details extends LitElement {
  static override styles = unsafeCSS(styles)

  @query('details') protected detailsElement!: HTMLDetailsElement
  @query('.c2-details-content') private contentElement!: HTMLElement
  @query('.c2-details-body') private bodyElement!: HTMLElement

  /** Open state, kept in sync with the native `open` attribute. */
  @property({ type: Boolean, reflect: true }) expanded = false

  /** Header text when the `title` slot is empty. */
  @property() label = ''

  /**
   * Accordion group: opening a panel closes every other `c2-details` with the same name in the same document or shadow
   * root. (The native `name` attribute cannot be used: each panel's `<details>` sits in its own shadow tree.)
   */
  @property() name: string | undefined = undefined

  /** Only the icon toggles the panel; clicking the title does nothing. */
  @property({ type: Boolean, reflect: true, attribute: 'title-not-clickable' }) titleNotClickable = false

  /** Dims the header and blocks toggling (pointer and keyboard). */
  @property({ type: Boolean, reflect: true }) disabled = false

  @state() private hasHeaderContent = false
  @state() private hasExpandedIcon = false
  /** Keeps the native `open` attribute while the close animation plays; the content is hidden by the browser otherwise. */
  @state() private closing = false

  private contentAnimations: Animation[] = []

  @consume({ context: accordionContext, subscribe: true })
  private accordion: AccordionContext | undefined

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.accordion = undefined
    this.cancelContentAnimations()
    this.closing = false
  }

  override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('expanded') && this.hasUpdated) {
      if (this.expanded) this.closing = false
      else if (changed.get('expanded')) this.closing = true
    }
  }

  override updated(changed: PropertyValues<this>) {
    if (this.isConnected && changed.has('expanded') && changed.get('expanded') !== undefined) {
      this.animateContent(this.expanded)
      this.accordion?.expandedChanged(this)
    }
  }

  private cancelContentAnimations() {
    for (const animation of this.contentAnimations) animation.cancel()
    this.contentAnimations = []
    if (this.contentElement) this.contentElement.style.overflow = ''
  }

  /**
   * Slides the content between collapsed and its natural height, fading the body along the way. Duration and easing
   * come from the `transition-*` values the stylesheet puts on the content element, so `--c2-details--transition-duration`
   * and `prefers-reduced-motion` both apply. Reversing mid-flight starts from the current rendered height.
   */
  private animateContent(open: boolean) {
    const content = this.contentElement
    const body = this.bodyElement
    if (!content || !body) return

    // Measure before cancelling so a reversed animation continues from where it is.
    const from = this.contentAnimations.length ? content.getBoundingClientRect().height : open ? 0 : content.scrollHeight
    const fromOpacity = this.contentAnimations.length ? parseFloat(getComputedStyle(body).opacity) : open ? 0 : 1
    this.cancelContentAnimations()

    const style = getComputedStyle(content)
    const duration = parseDuration(firstListEntry(style.transitionDuration))
    const easing = firstListEntry(style.transitionTimingFunction) || 'ease'
    if (duration <= 0 || typeof content.animate !== 'function') {
      this.closing = false
      return
    }

    const to = open ? content.scrollHeight : 0
    content.style.overflow = 'hidden'
    const height = content.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing })
    const fade = body.animate([{ opacity: fromOpacity }, { opacity: open ? 1 : 0 }], { duration, easing })
    this.contentAnimations = [height, fade]

    height.finished
      .then(() => {
        this.contentAnimations = []
        content.style.overflow = ''
        if (!open) this.closing = false
      })
      .catch(() => {
        // Cancelled by a newer toggle; that toggle owns the cleanup.
      })
  }

  /** `slotchange` does not fire for server-rendered slots, so read them once after the first render. */
  override firstUpdated() {
    for (const slot of this.renderRoot.querySelectorAll('slot')) this.updateSlot(slot)
  }

  private handleSlotChange(event: Event) {
    this.updateSlot(event.target as HTMLSlotElement)
  }

  private updateSlot(slot: HTMLSlotElement) {
    const filled = slot.assignedNodes({ flatten: true }).some((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== '')
    if (slot.name === 'header-content') this.hasHeaderContent = filled
    else if (slot.name === 'expanded-icon') this.hasExpandedIcon = filled
  }

  private handleSummaryClick(event: MouseEvent) {
    if (this.disabled) {
      event.preventDefault()
      return
    }
    const path = event.composedPath()
    const inHeaderContent = path.some((el) => el instanceof HTMLElement && el.classList.contains('c2-details-header-content'))
    const onIcon = path.some((el) => el instanceof HTMLElement && el.classList.contains('c2-details-icons'))
    // Interactive header content keeps working, and with `title-not-clickable` only the icon toggles.
    event.preventDefault()
    if (inHeaderContent || (this.titleNotClickable && !onIcon)) return
    // Drive `open` from `expanded` ourselves so closing can animate before the browser hides the content.
    this.toggle()
  }

  private handleSummaryKeydown(event: KeyboardEvent) {
    if (this.disabled && (event.key === 'Enter' || event.key === ' ')) event.preventDefault()
  }

  private handleDetailsToggle(event: Event) {
    this.expanded = this.detailsElement.open
    redispatchEvent(this, event)
  }

  /** Opens or closes the panel. */
  toggle(force?: boolean) {
    if (this.disabled) return
    this.expanded = force ?? !this.expanded
  }

  protected renderIcon() {
    return html`
      <span class=${classMap({ 'c2-details-icons': true, 'has-expanded-icon': this.hasExpandedIcon })}>
        <slot name="expanded-icon" @slotchange=${this.handleSlotChange}></slot>
        <slot name="icon">
          <svg class="default-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </slot>
      </span>
    `
  }

  override render() {
    return html`
      <details class="c2-details" ?open=${this.expanded || this.closing} @toggle=${this.handleDetailsToggle}>
        <summary
          class=${classMap({ 'has-header-content': this.hasHeaderContent })}
          tabindex=${this.disabled ? '-1' : nothing}
          aria-disabled=${this.disabled ? 'true' : nothing}
          @click=${this.handleSummaryClick}
          @keydown=${this.handleSummaryKeydown}
        >
          <div class="c2-details-summary-row">
            <div class="c2-details-summary-content"><slot name="title">${this.label}</slot></div>
            ${this.renderIcon()}
          </div>
          <div class="c2-details-header-content" ?hidden=${!this.hasHeaderContent}>
            <slot name="header-content" @slotchange=${this.handleSlotChange}></slot>
          </div>
        </summary>
        <div class="c2-details-content">
          <div class="c2-details-body">
            <slot></slot>
          </div>
        </div>
      </details>
    `
  }
}

/** First top-level entry of a comma-separated CSS list; commas inside `cubic-bezier(...)` are kept. */
function firstListEntry(value: string): string {
  let depth = 0
  for (let i = 0; i < value.length; i++) {
    const char = value[i]
    if (char === '(') depth++
    else if (char === ')') depth--
    else if (char === ',' && depth === 0) return value.slice(0, i).trim()
  }
  return value.trim()
}

/** Parses a computed `transition-duration` value (`0.25s`, `250ms`) into milliseconds. */
function parseDuration(value: string): number {
  const amount = parseFloat(value)
  if (Number.isNaN(amount)) return 0
  return value.endsWith('ms') ? amount : amount * 1000
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-details': Details
  }
}
