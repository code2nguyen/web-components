import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement, eventOptions, property, query, state } from 'lit/decorators.js'
import styles from './chat-input.scss?inline'
import { redispatchEvent } from '@c2n/wc-utils/dom-helper.js'
import { live } from 'lit/directives/live.js'
import { styleMap, type StyleInfo } from 'lit/directives/style-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { addClasses } from '@c2n/wc-utils/css-helper.js'
import { classMap } from 'lit/directives/class-map.js'

/**
 * @tag c2-chat-input
 *
 * @slot send-icon
 *
 * @event {CustomEvent} submit-message
 * @cssproperty {border-radius} [--c2-chat-input--border-top-left-radius=4px]
 * @cssproperty {border-radius} [--c2-chat-input--border-top-right-radius=4px]
 * @cssproperty {border-radius} [--c2-chat-input--border-bottom-left-radius=4px]
 * @cssproperty {border-radius} [--c2-chat-input--border-bottom-right-radius=4px]
 *
 * @cssproperty {padding} [--c2-chat-input--padding-top=8px]
 * @cssproperty {padding} [--c2-chat-input--padding-right=8px]
 * @cssproperty {padding} [--c2-chat-input--padding-bottom=8px]
 * @cssproperty {padding} [--c2-chat-input--padding-left=8px]
 *
 * @cssproperty {border} [--c2-chat-input--border-top=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-chat-input--border-right=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-chat-input--border-bottom=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-chat-input--border-left=1px solid rgb(177, 177, 177)]
 *
 * @cssproperty {color} [--c2-chat-input--color=rgb(34, 34, 34)]
 * @cssproperty {background} [--c2-chat-input--background=rgb(255, 255, 255)]
 *
 * @cssproperty {font-size} [--c2-chat-input--font-size=14px]
 * @cssproperty {font-weight} --c2-chat-input--font-weight
 * @cssproperty {font-style} --c2-chat-input--font-style
 * @cssproperty {font-family} --c2-chat-input--font-family
 * @cssproperty {line-height} [--c2-chat-input--line-height=24px]
 * @cssproperty {max-height} [--c2-chat-input--max-height=25vh]
 *
 * @cssproperty {opacity} [--c2-chat-input__placeholder--opacity=0.5]
 * @cssproperty {font-weight} --c2-chat-input__placeholder--font-weight
 * @cssproperty {font-style} --c2-chat-input__placeholder--font-style
 * @cssproperty {color} --c2-chat-input__placeholder--color
 *
 * @cssproperty {pixel} [--c2-chat-input__send-icon--width=24px]
 * @cssproperty {pixel} [--c2-chat-input__send-icon--height=24px]
 * @cssproperty {opacity} [--c2-chat-input__send-icon--opacity=0.5]
 * @cssproperty {color} --c2-chat-input__send-icon--color
 * @cssproperty {color} --c2-chat-input__send-icon__active--color
 *
 * @cssproperty {border} --c2-chat-input__focus--border-top
 * @cssproperty {border} --c2-chat-input__focus--border-right
 * @cssproperty {border} --c2-chat-input__focus--border-bottom
 * @cssproperty {border} --c2-chat-input__focus--border-left
 *
 * @cssproperty {color} --c2-chat-input__focus--color
 * @cssproperty {background} --c2-chat-input__focus--background
 *
 *
 */
@customElement('c2-chat-input')
export class ChatInput extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: String }) name = 'Example property'

  @property({ type: String }) placeholder = ''

  @property({ type: String }) value = ''

  // State
  @state() private dirty = false
  @state() private scrollBarPosition = 0
  @state() private scrollBarHeight = 0
  @state() private focused = false

  // Query
  @query('.input') private readonly input?: HTMLTextAreaElement | null

  handleFocus = () => {
    this.focus()
  }

  isDirty() {
    return this.dirty
  }
  private inputDimensions: { top: number; bottom: number } | null = null

  override focus(options?: FocusOptions | undefined): void {
    this.focused = true
    this.input?.focus(options)
  }

  private async handleKeydown(event: KeyboardEvent) {
    if (event.altKey) {
      if (event.key == 'Enter') {
        this.dirty = true
        this.value = this.value + '\n'
        event.preventDefault()
        await this.updateComplete
        this.updateInputHeight()
      }
    } else if (event.key == 'Enter') {
      this.dispatchSubmitEvent()
      this.value = ''
      event.preventDefault()
      await this.updateComplete
      this.updateInputHeight()
    }
  }

  protected async handleInput(event: InputEvent) {
    this.value = (event.target as HTMLInputElement).value
    this.updateInputHeight()
    redispatchEvent(this, event)
  }

  private updateInputHeight() {
    const input = this.input
    if (input) {
      if (!this.inputDimensions) {
        const computedStyleMap = input.computedStyleMap()
        this.inputDimensions = {
          top: (computedStyleMap.get('padding-top') as CSSUnitValue).value,
          bottom: (computedStyleMap.get('padding-bottom') as CSSUnitValue).value,
        }
      }
      this.input.style.height = ''
      this.input.style.height = `${this.input?.scrollHeight - this.inputDimensions.top - this.inputDimensions.bottom}px`
      this.calculateScrollbarPostion()
    }
  }
  protected handleFocusin(event: Event) {
    this.focused = true
    redispatchEvent(this, event)
  }

  protected forwardFocusin(event: Event) {
    if (!event.defaultPrevented) this.focus()
  }

  private redispatchEvent(event: Event) {
    redispatchEvent(this, event)
  }

  protected handleFocusout(event: Event) {
    this.focused = false
    redispatchEvent(this, event)
  }

  private async handleSendClickEvent() {
    this.dispatchSubmitEvent()
    this.value = ''
    await this.updateComplete
    this.updateInputHeight()
  }

  private dispatchSubmitEvent() {
    this.dispatchEvent(
      new CustomEvent('submit-message', {
        bubbles: true,
        cancelable: true,
        detail: this.value,
      }),
    )
  }
  @eventOptions({ passive: true })
  private handleNavContentScroll() {
    this.calculateScrollbarPostion()
  }

  private calculateScrollbarPostion() {
    const traceWidth = this.input!.scrollHeight - this.input!.clientHeight
    if (traceWidth > 0) {
      const ratio = this.input!.clientHeight / this.input!.scrollHeight
      this.scrollBarHeight = this.input!.clientHeight * ratio
      this.scrollBarPosition = this.input!.scrollTop * ratio
    } else {
      this.scrollBarHeight = 0
    }
  }

  private renderScrollbar() {
    if (!this.scrollBarHeight) {
      return nothing
    }

    const style: StyleInfo = {
      transform: `translate3d(0px, ${this.scrollBarPosition}px,  0px)`,
      height: `${this.scrollBarHeight}px`,
    }

    return html`<div class="scrollbar-track">
      <div class="scrollbar-thumb" style="${styleMap(style)}"></div>
    </div>`
  }

  renderSendIcon() {
    return html`<button active=${ifDefined(this.value ? true : null)} @click=${this.handleSendClickEvent}>
      <slot name="send-icon">
        <svg fill="currentColor" viewBox="0 0 256 256">
          <path
            d="M237.9,200.1,141.85,32.18a16,16,0,0,0-27.89,0l-95.89,168a16,16,0,0,0,19.26,22.92L128,192.45l90.67,30.63A16.22,16.22,0,0,0,224,224a16,16,0,0,0,13.86-23.9Zm-14.05,7.84L136,178.26V120a8,8,0,0,0-16,0v58.26L32.16,207.94,32,208,127.86,40,224,208Z"
          ></path>
        </svg>
      </slot>
    </button>`
  }

  override attributeChangedCallback(attribute: string, newValue: string | null, oldValue: string | null) {
    if (attribute === 'value' && this.dirty) {
      // After user input, changing the value attribute no longer updates the
      // text field's value (until reset). This matches native <input> behavior.
      return
    }

    super.attributeChangedCallback(attribute, newValue, oldValue)
  }

  override render() {
    const classes = {
      'focus-within': this.focused,
    }
    addClasses(this, classes)
    return html`
      <div class="c2-chat-input ${classMap(classes)}">
        <div class="c2-chat-input-wrapper">
          <textarea
            class="input"
            tabindex="0"
            .value=${live(this.value)}
            placeholder=${this.placeholder || nothing}
            autocomplete="off"
            rows="1"
            @change=${this.redispatchEvent}
            @select=${this.redispatchEvent}
            @focusin=${this.handleFocusin}
            @focusout=${this.handleFocusout}
            @keydown=${this.handleKeydown}
            @input=${this.handleInput}
            @scroll=${this.handleNavContentScroll}
          >
          </textarea>
          <div class="send-button-wrapper">${this.renderSendIcon()}</div>
          ${this.renderScrollbar()}
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-chat-input': ChatInput
  }
}
