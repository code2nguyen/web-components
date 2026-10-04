/// <reference types="google.maps" />
import { LitElement, html, nothing, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { AUTH_FAILURE_EVENT, CONFIG_EVENT, GoogleMapsError, hasAuthFailed, type GoogleMapsErrorReason } from './google-maps-loader.js'

export interface GoogleMapsErrorEventDetail {
  reason: GoogleMapsErrorReason
  message: string
}

type Status = 'loading' | 'ready' | 'error'

const AUTH_MESSAGE = 'Google Maps rejected the API key. Check its HTTP referrer and API restrictions.'

/**
 * What a map and a street view share: the key, the load, and the message shown instead of the map while it loads
 * or when it cannot be shown. Google owns everything inside the canvas; Lit renders it once and never touches it.
 *
 * @attr api-key - A browser API key. Ignored when `configureGoogleMaps({ apiKey })` was called.
 *
 * @event {CustomEvent<GoogleMapsErrorEventDetail>} map-error - Fired when the map cannot be shown. `detail.reason` is `missing-key`, `load-failed`, `auth-failed` or `no-imagery`.
 *
 * @csspart canvas - The element the Google Maps API draws into.
 * @csspart message - The notice shown while the map loads or when it cannot be shown.
 */
export abstract class GoogleMapsElement extends LitElement {
  /** A browser API key, restricted to your HTTP referrers. Ignored when `configureGoogleMaps({ apiKey })` was called. */
  @property({ type: String, attribute: 'api-key' }) apiKey?: string

  @state() protected status: Status = 'loading'
  @state() protected message = ''

  /** Where Google draws. Present from the first render on. */
  protected get canvas(): HTMLElement {
    return this.renderRoot.querySelector<HTMLElement>('.canvas')!
  }

  #started = false
  #errorReason?: GoogleMapsErrorReason

  /** Builds the Google object inside {@link canvas} and sets `status` to `ready` when it shows. Called once, after the first render. */
  protected abstract initialize(): Promise<void>

  /** What to say while loading, e.g. "Loading map…". */
  protected abstract readonly loadingMessage: string

  override connectedCallback(): void {
    super.connectedCallback()
    window.addEventListener(AUTH_FAILURE_EVENT, this.#handleAuthFailure)
    window.addEventListener(CONFIG_EVENT, this.#retry)
    if (this.hasUpdated) this.#start()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    window.removeEventListener(AUTH_FAILURE_EVENT, this.#handleAuthFailure)
    window.removeEventListener(CONFIG_EVENT, this.#retry)
  }

  protected override firstUpdated(): void {
    this.#start()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('apiKey')) this.#retry()
  }

  /** Starts again after a missing key: one set from script, or configured once an app has read its settings. */
  #retry = (): void => {
    if (this.#errorReason !== 'missing-key') return
    this.#started = false
    this.#start()
  }

  #start(): void {
    if (this.#started || !this.isConnected) return
    this.#started = true
    this.#errorReason = undefined
    // Only what changed, so the first start does not schedule a second render from `firstUpdated`.
    if (this.status !== 'loading') this.status = 'loading'
    if (this.message) this.message = ''
    this.initialize().then(
      () => {
        if (hasAuthFailed()) this.fail(new GoogleMapsError('auth-failed', AUTH_MESSAGE))
      },
      (error: unknown) => this.fail(error),
    )
  }

  /** Shows `error` in place of the map and reports it through `map-error`. */
  protected fail(error: unknown): void {
    const reason = error instanceof GoogleMapsError ? error.reason : 'load-failed'
    const message = error instanceof Error ? error.message : String(error)
    this.#errorReason = reason
    this.status = 'error'
    this.message = message
    this.dispatchEvent(new CustomEvent<GoogleMapsErrorEventDetail>('map-error', { detail: { reason, message } }))
  }

  #handleAuthFailure = (): void => {
    if (this.#started) this.fail(new GoogleMapsError('auth-failed', AUTH_MESSAGE))
  }

  override render() {
    return html`
      <div class="canvas" part="canvas"></div>
      ${
        this.status === 'ready'
          ? nothing
          : html`<div class="message ${this.status}" part="message" role=${this.status === 'error' ? 'alert' : 'status'}>
              ${this.message || this.loadingMessage}
            </div>`
      }
      <slot></slot>
    `
  }
}
