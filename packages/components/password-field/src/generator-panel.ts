import { html, nothing } from 'lit'
import { LocalizeController } from '@c2n/core/localize.js'
import '@c2n/overlay'
import '@c2n/button'
import '@c2n/button-group'
import '@c2n/checkbox'
import '@c2n/copy-button'
import '@c2n/icon-button'
import '@c2n/slider'
import type { PasswordField } from './password-field.js'
import { passwordFieldMessages } from './messages.js'
import {
  acceptsFor,
  CHARACTER_CLASSES,
  internals,
  prepare,
  resolveSettings,
  suggest,
  type CharacterClass,
  type Generator,
  type GeneratorSettings,
} from './password-generator.js'
import styles from './generator-panel.scss?inline'

/** One sheet for every field: a constructed sheet is made to be shared between shadow roots. */
let sheet: CSSStyleSheet | undefined

/** At the generator's own ceiling the field sets no `maxlength`, and the length slider stops at 64. */
const MAX_SLIDER = 256

const SEPARATORS = ['-', '.', '_']

const MESSAGE_OF: Record<CharacterClass, 'lowercase' | 'uppercase' | 'numbers' | 'symbols'> = {
  lowercase: 'lowercase',
  uppercase: 'uppercase',
  numbers: 'numbers',
  symbols: 'symbols',
}

const refreshIcon = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"></path>
  <path d="M21 3v5h-5"></path>
</svg>`

/**
 * The generator popover of `generator`: a suggestion with its strength, password or passphrase options, and Use
 * password. This module, the word list and the components it composes load the first time the generator opens.
 */
export function createGeneratorPanel(field: PasswordField) {
  const internal = internals(field)
  const accepts = acceptsFor(field)
  const msg = new LocalizeController(field, passwordFieldMessages)
  const root = field.renderRoot as ShadowRoot
  if (!sheet) {
    sheet = new CSSStyleSheet()
    sheet.replaceSync(styles)
  }
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]

  let settings: GeneratorSettings | undefined
  let generator: Generator | undefined
  let suggestion = ''
  /** Counts the draws, so a slow word-list load never overwrites a newer suggestion. */
  let draw = 0
  let open = false
  let wasOpen = false
  /** Use password closed the popover: focus goes to the field rather than back to the generate button. */
  let focusAfterUse = false

  const toggle = (next: boolean) => {
    if (open === next) return
    open = next
    field.requestUpdate()
  }

  const regenerate = async (changes?: Partial<GeneratorSettings>) => {
    const current = (settings = { ...(settings ?? resolveSettings(field.generatorOptions, field)), ...changes })
    // The last enabled character class cannot be switched off: a password needs at least one.
    if (!CHARACTER_CLASSES.some((name) => current[name])) current.lowercase = true
    const ticket = ++draw
    try {
      const next = await prepare(current)
      if (ticket !== draw) return
      generator = next
      suggestion = suggest(next, accepts)
    } catch (error) {
      // The word list could not be loaded (offline, a stale deploy): the next change tries again.
      if (ticket === draw) console.warn('[c2-password-field] the passphrase word list could not be loaded', error)
    }
    field.requestUpdate()
  }

  /** Whether focus was in the popover as it started to close: the browser may have moved it by the time it closed. */
  let hadFocus = false
  const handleBeforeToggle = (event: ToggleEvent) => {
    if (event.newState === 'closed') hadFocus = !!root.activeElement && !!root.querySelector('.generator')?.contains(root.activeElement)
  }
  /** Focus is still in the closed popover, or nowhere: not on something the user pressed outside it. */
  const focusLost = () => {
    const outer = (field.getRootNode() as Document | ShadowRoot).activeElement
    const inner = root.activeElement
    return !outer || outer === document.body || (outer === field && (!inner || !!root.querySelector('.generator')?.contains(inner)))
  }
  const handleToggle = (event: ToggleEvent) => {
    const opened = event.newState === 'open'
    if (opened) void field.updateComplete.then(() => root.querySelector<HTMLElement>('.generator-use')?.focus())
    else if (focusAfterUse) internal.input?.focus()
    // Escape, or a close by code: focus goes back to the generate button, unless the user pressed something outside.
    else if (hadFocus && focusLost()) root.querySelector<HTMLElement>('.generate')?.focus()
    focusAfterUse = hadFocus = false
    toggle(opened)
  }

  /** Puts the suggestion in the field as typing it would: `input`, then `change`, as the value is committed. */
  const use = () => {
    if (!suggestion) return
    internal.dirty = true
    field.value = suggestion
    focusAfterUse = true
    toggle(false)
    field.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText' }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const renderStrength = () => {
    const score = suggestion ? internal.strengthOf(suggestion) : 0
    const label = suggestion ? internal.strengthLabel(score) : ''
    const level = ['', 'weak', 'fair', 'good', 'strong'][score]
    return html`<div class="meter-row generator-strength">
      <div
        class="meter ${level}"
        role="meter"
        aria-label=${msg.t('strength')}
        aria-valuemin="0"
        aria-valuemax="4"
        aria-valuenow=${score}
        aria-valuetext=${label || nothing}
      >
        ${[1, 2, 3, 4].map((segment) => html`<span class="segment ${segment <= score ? 'filled' : ''}"></span>`)}
      </div>
      <span class="meter-label">${label}${generator ? html` · ${msg.t('entropy', generator.bits)}` : nothing}</span>
    </div>`
  }

  const renderPasswordOptions = (current: GeneratorSettings) => {
    const enabled = CHARACTER_CLASSES.filter((name) => current[name])
    return html`<div class="generator-option">
        <span class="generator-label">${msg.t('length')}</span>
        <c2-slider
          aria-label=${msg.t('length')}
          min=${current.minLength}
          max=${current.maxLength >= MAX_SLIDER ? Math.max(64, current.length) : current.maxLength}
          .value=${current.length}
          @input=${(event: Event) => {
            event.stopPropagation()
            void regenerate({ length: Number((event.target as HTMLElement & { value: number }).value) })
          }}
          @change=${(event: Event) => event.stopPropagation()}
        ></c2-slider>
        <span class="generator-value" aria-hidden="true">${current.length}</span>
      </div>
      <div class="generator-classes">
        ${CHARACTER_CLASSES.map(
          (name) =>
            html`<c2-checkbox
              data-class=${name}
              ?checked=${current[name]}
              ?disabled=${current.locked.includes(name) || (current[name] && enabled.length === 1)}
              @change=${(event: Event) => {
                event.stopPropagation()
                void regenerate({ [name]: (event.target as HTMLInputElement).checked })
              }}
              >${msg.t(MESSAGE_OF[name])}</c2-checkbox
            >`,
        )}
      </div>`
  }

  const renderPassphraseOptions = (current: GeneratorSettings) => {
    const separators = SEPARATORS.includes(current.separator) ? SEPARATORS : [...SEPARATORS, current.separator]
    return html`<div class="generator-option">
        <span class="generator-label">${msg.t('words')}</span>
        <c2-slider
          aria-label=${msg.t('words')}
          min="3"
          max=${Math.max(10, current.words)}
          .value=${current.words}
          @input=${(event: Event) => {
            event.stopPropagation()
            void regenerate({ words: Number((event.target as HTMLElement & { value: number }).value) })
          }}
          @change=${(event: Event) => event.stopPropagation()}
        ></c2-slider>
        <span class="generator-value" aria-hidden="true">${current.words}</span>
      </div>
      <div class="generator-option">
        <span class="generator-label">${msg.t('separator')}</span>
        <c2-button-group
          class="generator-separators"
          appearance="segmented"
          selection="single"
          aria-label=${msg.t('separator')}
          .value=${String(separators.indexOf(current.separator))}
          @input=${(event: Event) => event.stopPropagation()}
          @change=${(event: CustomEvent<{ value: string }>) => {
            event.stopPropagation()
            const picked = separators[Number(event.detail.value)]
            if (picked !== undefined) void regenerate({ separator: picked })
          }}
        >
          ${separators.map((value, index) => html`<c2-button value=${index}>${value === ' ' ? '␣' : value}</c2-button>`)}
        </c2-button-group>
      </div>
      <div class="generator-classes">
        <c2-checkbox
          data-option="capitalize"
          ?checked=${current.capitalize}
          @change=${(event: Event) => {
            event.stopPropagation()
            void regenerate({ capitalize: (event.target as HTMLInputElement).checked })
          }}
          >${msg.t('capitalize')}</c2-checkbox
        >
        <c2-checkbox
          data-option="include-number"
          ?checked=${current.includeNumber}
          @change=${(event: Event) => {
            event.stopPropagation()
            void regenerate({ includeNumber: (event.target as HTMLInputElement).checked })
          }}
          >${msg.t('includeNumber')}</c2-checkbox
        >
      </div>`
  }

  return {
    /** Whether the popover is open. Turning `generator` off or disabling the field closes it. */
    get open() {
      return open && field.generator && !internal.effectiveDisabled
    },
    toggle,
    render() {
      // Turning `generator` off or disabling the field closes the popover.
      if (open && (!field.generator || internal.effectiveDisabled)) open = false
      if (open && !wasOpen) {
        // Each opening starts from the field's options and draws a fresh suggestion.
        settings = undefined
        suggestion = ''
        generator = undefined
        void regenerate()
      }
      wasOpen = open
      const current = settings
      return html`<c2-overlay
        id="generator"
        placement="bottom-end"
        free-width
        .anchor=${root.querySelector<HTMLElement>('.field') ?? undefined}
        ?open=${open}
        @beforetoggle=${handleBeforeToggle}
        @toggle=${handleToggle}
      >
        <div class="generator" part="generator" role="dialog" aria-label=${msg.t('generate')}>
          <div class="generator-suggestion">
            <span class="generator-label">${msg.t('suggestion')}</span>
            <div class="generator-preview">
              <span class="generator-text">${suggestion}</span>
              <c2-icon-button class="generator-regenerate" aria-label=${msg.t('regenerate')} @click=${() => regenerate()}>${refreshIcon}</c2-icon-button>
              <c2-copy-button class="generator-copy" reveal="always" .value=${suggestion} label=${msg.t('copy')}></c2-copy-button>
            </div>
            ${renderStrength()}
          </div>
          ${
            current
              ? html`<c2-button-group
                    class="generator-kind"
                    appearance="segmented"
                    selection="single"
                    stretched
                    aria-label=${msg.t('kind')}
                    .value=${current.kind}
                    @input=${(event: Event) => event.stopPropagation()}
                    @change=${(event: CustomEvent<{ value: string }>) => {
                      event.stopPropagation()
                      void regenerate({ kind: event.detail.value === 'passphrase' ? 'passphrase' : 'password' })
                    }}
                  >
                    <c2-button value="password">${msg.t('password')}</c2-button>
                    <c2-button value="passphrase">${msg.t('passphrase')}</c2-button>
                  </c2-button-group>
                  ${current.kind === 'password' ? renderPasswordOptions(current) : renderPassphraseOptions(current)}`
              : nothing
          }
          <div class="generator-actions" part="generator-actions">
            <slot name="generator-actions"></slot>
            <c2-button class="generator-use" @click=${use}>${msg.t('use')}</c2-button>
          </div>
        </div>
      </c2-overlay>`
    },
  }
}

export type GeneratorPanel = ReturnType<typeof createGeneratorPanel>
