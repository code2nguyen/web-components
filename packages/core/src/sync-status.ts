/**
 * The save and sync state of a document, a form or a record, shared by whatever shows it: an editor's header, a
 * `c2-status-light`, an offline `c2-banner`. The application reports what happens (a change, a save that starts, ends
 * or fails, the connection) and the model works out the one state to show, with the pending count, the time of the
 * last save, the error and a retry.
 *
 * Plain TypeScript over `EventTarget`: no DOM rendering, so one model can be shared by several components and by code
 * that is not a component at all. `SyncStatusController` in `@c2n/core/controllers/sync-status.js` binds it to a Lit
 * host and adds its text.
 */

/**
 * What to show, in order of precedence:
 * - `error`: the last save failed; `retry()` tries again;
 * - `offline`: the connection is down; changes wait (`pending`) and are retried when it is back;
 * - `saving`: a save is running;
 * - `pending`: changes are waiting for a save (a debounce, a manual Save);
 * - `saved`: everything is saved (or nothing was changed yet).
 */
export type SyncState = 'saved' | 'pending' | 'saving' | 'offline' | 'error'

/** One reading of the model, as `change` reports it. */
export interface SyncSnapshot {
  readonly state: SyncState
  /** Whether the connection is up, as the browser reports it or `setOnline` set it. */
  readonly online: boolean
  /** Changes not saved yet, including those of a save that is running. */
  readonly pending: number
  /** When the last save succeeded. */
  readonly lastSaved: Date | undefined
  /** What the last failed save threw, until a save succeeds. */
  readonly error: unknown
  /** For a short while after the connection came back, to show a "Back online" notice. */
  readonly backOnline: boolean
}

/** A save: the work itself, which resolves when the changes are stored and throws when they are not. */
export type SyncTask<T = unknown> = () => Promise<T> | T

export interface SyncStatusOptions {
  /**
   * What `retry()` runs, and what runs when the connection comes back with changes pending: usually the app's own
   * save. Without it, `retry()` reruns the last task given to `save()`.
   */
  retry?: SyncTask
  /** Retries by itself when the connection comes back and changes are waiting. On by default. */
  retryWhenOnline?: boolean
  /** How long `backOnline` stays true, in milliseconds. Default 4000; 0 never sets it. */
  backOnlineDuration?: number
  /** The connection state to start from. Default `navigator.onLine`, else online. */
  online?: boolean
}

/**
 * The model behind a sync indicator. Report changes with `change()`, wrap each save in `save(task)`, and listen for
 * `change` events (or read `snapshot`) to draw it:
 *
 * ```ts
 * const status = new SyncStatus({ retry: () => api.saveDraft(draft) })
 * status.connect() // follow the browser's online and offline events
 * editor.addEventListener('input', () => {
 *   status.change()
 *   debounceSave(() => status.save(() => api.saveDraft(draft)))
 * })
 * status.addEventListener('change', () => render(status.snapshot))
 * ```
 *
 * A save started while offline is not attempted: its changes stay pending and are saved when the connection is back.
 */
export class SyncStatus extends EventTarget {
  private _online: boolean
  private _pending = 0
  private _saving = 0
  private _lastSaved: Date | undefined
  private _error: unknown = undefined
  private _failed = false
  private _backOnline = false
  private backOnlineTimer: ReturnType<typeof setTimeout> | undefined
  private lastTask: SyncTask | undefined
  private connectedTo: EventTarget | undefined
  private readonly options: SyncStatusOptions

  constructor(options: SyncStatusOptions = {}) {
    super()
    this.options = options
    this._online = options.online ?? (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true)
  }

  get state(): SyncState {
    if (this._failed) return 'error'
    if (!this._online) return 'offline'
    if (this._saving > 0) return 'saving'
    if (this._pending > 0) return 'pending'
    return 'saved'
  }

  get online(): boolean {
    return this._online
  }

  get pending(): number {
    return this._pending
  }

  get lastSaved(): Date | undefined {
    return this._lastSaved
  }

  get error(): unknown {
    return this._error
  }

  get backOnline(): boolean {
    return this._backOnline
  }

  get snapshot(): SyncSnapshot {
    return {
      state: this.state,
      online: this._online,
      pending: this._pending,
      lastSaved: this._lastSaved,
      error: this._error,
      backOnline: this._backOnline,
    }
  }

  /** Records `count` local changes waiting to be saved. */
  change(count = 1): void {
    if (count <= 0) return
    this._pending += count
    this.notify()
  }

  /**
   * Runs a save of the changes pending now and tracks it: `saving` while it runs, then `saved` with the time, or
   * `error` with what it threw (the returned promise rejects with it too). Changes made while it runs stay pending.
   * Offline, the task is not run: the changes wait and the promise resolves to `undefined`.
   */
  async save<T>(task: SyncTask<T>): Promise<T | undefined> {
    this.lastTask = task
    if (!this._online) {
      this.notify()
      return undefined
    }
    const covered = this._pending
    this._saving += 1
    this.notify()
    try {
      const result = await task()
      this._saving -= 1
      this._pending = Math.max(0, this._pending - covered)
      this._lastSaved = new Date()
      this._error = undefined
      this._failed = false
      this.notify()
      return result
    } catch (error) {
      this._saving -= 1
      this._error = error
      this._failed = true
      this.notify()
      throw error
    }
  }

  /** Tries the failed or waiting save again: the `retry` option, else the last task given to `save()`. */
  async retry(): Promise<void> {
    const task = this.options.retry ?? this.lastTask
    if (!task) {
      this.clearError()
      return
    }
    this._failed = false
    try {
      await this.save(task)
    } catch {
      // The failure is the state now; the caller of retry() (a button) has nothing to catch.
    }
  }

  /** Marks everything saved without a task, for a save the app ran another way (a form post). */
  markSaved(at: Date = new Date()): void {
    this._pending = 0
    this._lastSaved = at
    this._error = undefined
    this._failed = false
    this.notify()
  }

  /** Drops the error, back to the state the other readings give, without saving. */
  clearError(): void {
    if (!this._failed && this._error === undefined) return
    this._failed = false
    this._error = undefined
    this.notify()
  }

  /** Sets the connection state, as the browser's `online` and `offline` events do once `connect()` is called. */
  setOnline(online: boolean): void {
    if (online === this._online) return
    this._online = online
    clearTimeout(this.backOnlineTimer)
    const duration = this.options.backOnlineDuration ?? 4000
    this._backOnline = online && duration > 0
    if (this._backOnline) {
      this.backOnlineTimer = setTimeout(() => {
        this._backOnline = false
        this.notify()
      }, duration)
    }
    this.notify()
    if (online && (this.options.retryWhenOnline ?? true) && (this._pending > 0 || this._failed)) void this.retry()
  }

  /** Follows the `online` and `offline` events of `target` (the window by default). Calling it again moves it. */
  connect(target: EventTarget | undefined = typeof window !== 'undefined' ? window : undefined): void {
    this.disconnect()
    if (!target) return
    target.addEventListener('online', this.handleOnline)
    target.addEventListener('offline', this.handleOffline)
    this.connectedTo = target
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' && target === (globalThis as { window?: unknown }).window) {
      this.setOnline(navigator.onLine)
    }
  }

  /** Stops following the connection, and the "back online" timer. */
  disconnect(): void {
    this.connectedTo?.removeEventListener('online', this.handleOnline)
    this.connectedTo?.removeEventListener('offline', this.handleOffline)
    this.connectedTo = undefined
    clearTimeout(this.backOnlineTimer)
  }

  private readonly handleOnline = (): void => this.setOnline(true)
  private readonly handleOffline = (): void => this.setOnline(false)

  private notify(): void {
    this.dispatchEvent(new Event('change'))
  }
}

/** The colour role a sync state reads as on a `c2-status-light`: green saved, blue saving, grey pending, amber offline, red error. */
export function syncStatusTone(state: SyncState): 'success' | 'info' | 'neutral' | 'warning' | 'danger' {
  switch (state) {
    case 'saved':
      return 'success'
    case 'saving':
      return 'info'
    case 'offline':
      return 'warning'
    case 'error':
      return 'danger'
    default:
      return 'neutral'
  }
}
