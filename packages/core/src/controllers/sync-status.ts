import type { ReactiveController, ReactiveControllerHost } from '@lit/reactive-element'
import { defineMessages, formatMessage, LocalizeController } from '../localize.js'
import { SyncStatus, syncStatusTone, type SyncSnapshot, type SyncState, type SyncStatusOptions } from '../sync-status.js'

export { SyncStatus, syncStatusTone } from '../sync-status.js'
export type { SyncSnapshot, SyncState, SyncStatusOptions, SyncTask } from '../sync-status.js'

const en = {
  saved: 'Saved',
  savedAt: (time: string) => `Saved at ${time}`,
  pending: (count: number) => (count === 1 ? '1 unsaved change' : `${count} unsaved changes`),
  saving: 'Saving…',
  offline: 'Offline',
  offlinePending: (count: number) => (count === 1 ? 'Offline, 1 change waiting' : `Offline, ${count} changes waiting`),
  error: 'Couldn’t save',
  retry: 'Retry',
  backOnline: 'Back online',
}

/**
 * The text of a sync indicator, in English. An app translates it under `sync-status`:
 * `addTranslations({ fr: { 'sync-status': { saved: 'Enregistré', savedAt: 'Enregistré à {0}' } } })`.
 */
export const syncStatusMessages = defineMessages('sync-status', en)

const timeFormats = new Map<string, Intl.DateTimeFormat>()

function formatTime(date: Date, locale: string): string {
  let format = timeFormats.get(locale)
  if (!format) {
    try {
      format = new Intl.DateTimeFormat(locale, { timeStyle: 'short' })
    } catch {
      format = new Intl.DateTimeFormat('en', { timeStyle: 'short' })
    }
    timeFormats.set(locale, format)
  }
  return format.format(date)
}

/**
 * The one line that says a snapshot in `locale`: `Saved at 10:42`, `Saving…`, `3 unsaved changes`,
 * `Offline, 2 changes waiting`, `Couldn’t save`, or `Back online` for a while after the connection returned.
 * For code without a Lit host (a page script); a component reads `SyncStatusController.text`.
 */
export function formatSyncStatus(snapshot: SyncSnapshot, locale = 'en'): string {
  const catalog = syncStatusMessages
  switch (snapshot.state) {
    case 'error':
      return formatMessage(catalog, locale, 'error')
    case 'offline':
      return snapshot.pending > 0 ? formatMessage(catalog, locale, 'offlinePending', snapshot.pending) : formatMessage(catalog, locale, 'offline')
    case 'saving':
      return formatMessage(catalog, locale, 'saving')
    case 'pending':
      return formatMessage(catalog, locale, 'pending', snapshot.pending)
    default:
      if (snapshot.backOnline) return formatMessage(catalog, locale, 'backOnline')
      return snapshot.lastSaved ? formatMessage(catalog, locale, 'savedAt', formatTime(snapshot.lastSaved, locale)) : formatMessage(catalog, locale, 'saved')
  }
}

export interface SyncStatusControllerOptions extends SyncStatusOptions {
  /** Follow the browser's `online` and `offline` events while the host is connected. On by default. */
  connect?: boolean
}

/**
 * Binds a `SyncStatus` model to a Lit host: the host redraws on every change and reads the state, its text in the
 * host's language and the tone for a `c2-status-light`. Pass a model to share one between components (an editor and
 * the header showing its state), or options to have the controller make its own.
 *
 * ```ts
 * private readonly sync = new SyncStatusController(this, { retry: () => this.save() })
 *
 * render() {
 *   return html`<span role="status"><c2-status-light tone=${this.sync.tone} ?pulse=${this.sync.state === 'saving'}>
 *     ${this.sync.text}</c2-status-light></span>
 *     ${this.sync.state === 'error' ? html`<c2-button @click=${() => this.sync.model.retry()}>${this.sync.retryLabel}</c2-button>` : nothing}`
 * }
 * ```
 *
 * The controller draws and styles nothing: the host decides where the text goes and puts it in a live region.
 */
export class SyncStatusController implements ReactiveController {
  readonly model: SyncStatus

  private readonly host: ReactiveControllerHost & Element
  private readonly msg: LocalizeController<typeof en>
  private readonly follow: boolean

  constructor(host: ReactiveControllerHost & Element, modelOrOptions: SyncStatus | SyncStatusControllerOptions = {}) {
    this.host = host
    const options = modelOrOptions instanceof SyncStatus ? {} : modelOrOptions
    this.model = modelOrOptions instanceof SyncStatus ? modelOrOptions : new SyncStatus(options)
    // A shared model is the app's to connect; one the controller made follows the browser unless told not to.
    this.follow = modelOrOptions instanceof SyncStatus ? false : (options.connect ?? true)
    this.msg = new LocalizeController(host, syncStatusMessages)
    host.addController(this)
  }

  hostConnected(): void {
    this.model.addEventListener('change', this.handleChange)
    if (this.follow) this.model.connect()
    // The model may have changed while the host was away.
    this.host.requestUpdate()
  }

  hostDisconnected(): void {
    this.model.removeEventListener('change', this.handleChange)
    if (this.follow) this.model.disconnect()
  }

  private readonly handleChange = (): void => this.host.requestUpdate()

  get state(): SyncState {
    return this.model.state
  }

  get snapshot(): SyncSnapshot {
    return this.model.snapshot
  }

  /** The state as one line in the host's language. */
  get text(): string {
    return formatSyncStatus(this.model.snapshot, this.msg.locale)
  }

  /** The `c2-status-light` tone of the state. */
  get tone(): ReturnType<typeof syncStatusTone> {
    return syncStatusTone(this.model.state)
  }

  /** The label of a retry action, in the host's language. */
  get retryLabel(): string {
    return this.msg.t('retry')
  }
}
