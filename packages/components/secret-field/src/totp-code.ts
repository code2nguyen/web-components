import { html, svg, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { SecretField, type SecretFieldEventMap } from './secret-field'
import { totpCodeMessages } from './totp-code-messages'
import type { TotpAlgorithm, TotpKey } from './totp'
import styles from './totp-code.scss?inline'

export type { TotpAlgorithm } from './totp'

/** Events fired by {@link TotpCode}, keyed for `addEventListener`. */
export interface TotpCodeEventMap extends SecretFieldEventMap {
  'code-change': Event
}

export interface TotpCode {
  addEventListener: TypedAddEventListener<TotpCode, TotpCodeEventMap>
  removeEventListener: TypedRemoveEventListener<TotpCode, TotpCodeEventMap>
}

type Text = LocalizeController<(typeof totpCodeMessages)['en']>

/**
 * The rotating one-time code of an authenticator app, computed in the browser from a TOTP secret (RFC 6238) with Web
 * Crypto: the digits in two groups, a countdown ring that turns to the warning colour near the end, a new code on each
 * period boundary, and the secret field's show and copy buttons. `secret` is base32 or an `otpauth://totp/` URI, whose
 * parameters win over the attributes. `value` is the current code; nothing runs without a secret.
 *
 * @tag c2-totp-code
 *
 * @slot label - Label above the code, such as the account. Falls back to the `label` attribute.
 * @slot help - Text under the code.
 *
 * @event {Event} code-change - A new code was computed; read `value`.
 * @event {Event} reveal-change - The user showed or hid the code; read `revealed`.
 * @event {Event} copied - The code was copied. It has no detail.
 * @event {Event} copy-error - The clipboard refused the copy.
 *
 * @csspart group - Each half of the shown code.
 * @csspart countdown - The ring showing the time left.
 *
 * @cssproperty {pixel} [--c2-totp-code__group--gap=8px] - Space between the two halves.
 * @cssproperty {pixel} [--c2-totp-code__countdown--size=18px]
 * @cssproperty {pixel} [--c2-totp-code__countdown--stroke-width=3px]
 * @cssproperty {color} [--c2-totp-code__countdown--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-totp-code__countdown__track--color=#e4e4e7]
 * @cssproperty {color} [--c2-totp-code__countdown__warning--color=#dc2626] - Ring and code in the last `warning-time` seconds.
 */
@customElement('c2-totp-code')
export class TotpCode extends SecretField {
  static override styles = [SecretField.styles, unsafeCSS(styles)]

  /** The current code, set by the element. */
  @property() override value = ''

  /** Base32 secret or `otpauth://totp/` URI. Set the property to keep it out of the DOM. */
  @property() secret = ''

  /** Digits of the code, 6 to 10. */
  @property({ type: Number }) digits = 6

  /** Seconds each code lasts. */
  @property({ type: Number }) period = 30

  /** HMAC hash: `SHA-1`, `SHA-256` or `SHA-512`. */
  @property() algorithm: TotpAlgorithm = 'SHA-1'

  /** Seconds left at which the ring and code turn to the warning colour. */
  @property({ type: Number, attribute: 'warning-time' }) warningTime = 5

  @state() private warning = false
  @state() private failed = false

  private key?: Promise<TotpKey>
  private step = -1
  private generation = 0
  private timer?: ReturnType<typeof setTimeout>
  private ringPeriod = 0

  protected override get messages() {
    return totpCodeMessages
  }

  override connectedCallback() {
    super.connectedCallback()
    document.addEventListener('visibilitychange', this.refresh)
    if (this.hasUpdated) this.refresh()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    document.removeEventListener('visibilitychange', this.refresh)
    clearTimeout(this.timer)
    this.generation++
    this.step = -1
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    super.willUpdate(changed)
    if (changed.has('secret') || changed.has('digits') || changed.has('period') || changed.has('algorithm')) {
      this.key = undefined
      this.step = -1
      this.refresh()
    } else if (changed.has('warningTime')) this.refresh()
  }

  /** Computes the code of the current period and sleeps until the warning moment or the next period. */
  private refresh = async () => {
    clearTimeout(this.timer)
    const generation = ++this.generation
    if (!this.isConnected || !this.secret) {
      this.value = ''
      this.failed = false
      return
    }
    // A background tab's timers are throttled; the code is brought up to date when it shows again.
    if (document.hidden) return
    try {
      // The HMAC code loads on first use: an element without a secret never pays for it.
      const totp = await import('./totp')
      if (generation !== this.generation) return
      this.key ??= totp.importTotpKey(this.secret, { digits: this.digits, period: this.period, algorithm: this.algorithm })
      const key = await this.key
      const tick = await totp.totpTick(key, this.step, this.warningTime)
      if (generation !== this.generation) return
      if (tick.code) {
        this.step = tick.step
        this.ringPeriod = key.period
        this.value = tick.code
        this.failed = false
        this.dispatchEvent(new Event('code-change'))
      }
      this.warning = tick.warning
      this.timer = setTimeout(this.refresh, tick.wait)
    } catch {
      // The error is not logged: its message could carry the secret.
      if (generation !== this.generation) return
      this.value = ''
      this.failed = true
    }
  }

  protected override renderValue() {
    const value = this.value
    const text = this.msg as unknown as Text
    if (this.failed) return html`<code class="value unavailable" part="value">${text.t('unavailable')}</code>`
    if (!value || !this.revealed) return super.renderValue()
    const half = Math.ceil(value.length / 2)
    const warning = this.warning ? 'is-warning' : ''
    const circle = (name: string) => svg`<circle class=${name} cx="10" cy="10" r="8" pathLength="100"></circle>`
    return html`<code class="value code ${warning}" part="value"
        ><span part="group">${value.slice(0, half)}</span><span part="group">${value.slice(half)}</span></code
      ><span class="countdown ${warning}" part="countdown"
        ><svg viewBox="0 0 20 20" aria-hidden="true">${circle('track')}${circle('ring')}</svg
        ><span class="sr-only">${text.t('period', this.ringPeriod)}</span></span
      >`
  }

  protected override updated(changed: PropertyValues<this>) {
    super.updated(changed)
    // The ring drains over each period in step with the clock: one endless animation, started at the right offset.
    const ring = this.renderRoot.querySelector('.ring')
    const ms = this.ringPeriod * 1000
    const running = ring?.getAnimations()[0]
    if (!ring || running?.effect?.getTiming().duration === ms) return
    running?.cancel()
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const animation = ring.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: 100 }], {
      duration: ms,
      iterations: Infinity,
      easing: reduce ? `steps(${this.ringPeriod})` : 'linear',
    })
    animation.currentTime = Date.now() % ms
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-totp-code': TotpCode
  }
}
