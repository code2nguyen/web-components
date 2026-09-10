export type ToastVariant = 'neutral' | 'info' | 'success' | 'warning' | 'error'
export type ToastDismissReason = 'timeout' | 'close' | 'action' | 'programmatic' | 'clear'

export interface ToastOptions {
  /** Reusing an ID updates the existing toast instead of adding a duplicate. */
  id?: string
  message: string
  heading?: string
  variant?: ToastVariant
  /** Visible lifetime in milliseconds; 0 keeps the toast until dismissed. */
  duration?: number
  dismissible?: boolean
  /** Hide the leading icon. */
  noIcon?: boolean
  /** Overrides the region countdown-bar setting for this toast. */
  showProgress?: boolean
  actionLabel?: string
}

export interface ToastRecord {
  id: string
  message: string
  heading: string
  variant: ToastVariant
  duration: number
  dismissible: boolean
  noIcon: boolean
  showProgress?: boolean
  actionLabel: string
}

interface Entry {
  toast: ToastRecord
  remaining: number
  started: number
  closing?: object
  timer?: ReturnType<typeof setTimeout>
}

/** FIFO queue. Timers run only for visible entries and preserve remaining time while paused. */
export class ToastController {
  private entries: Entry[] = []
  private sequence = 0
  private limit = 3
  private pauses = new Set<string>()
  private listeners = new Set<() => void>()

  private onDismiss: (toast: ToastRecord, reason: ToastDismissReason) => void

  private beforeDismiss?: (toast: ToastRecord) => Promise<unknown> | undefined

  constructor(
    onDismiss: (toast: ToastRecord, reason: ToastDismissReason) => void = () => {},
    beforeDismiss?: (toast: ToastRecord) => Promise<unknown> | undefined,
  ) {
    this.beforeDismiss = beforeDismiss
    this.onDismiss = onDismiss
  }

  get visible(): readonly ToastRecord[] {
    return this.entries.slice(0, this.limit).map((entry) => ({ ...entry.toast }))
  }
  get queuedCount() {
    return Math.max(0, this.entries.length - this.limit)
  }
  get count() {
    return this.entries.length
  }

  set maxVisible(value: number) {
    this.limit = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 3
    this.sync()
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  show(options: ToastOptions): string {
    let id = options.id
    if (!id) {
      do {
        id = `toast-${++this.sequence}`
      } while (this.entries.some((entry) => entry.toast.id === id))
    }
    if (this.entries.some((entry) => entry.toast.id === id)) {
      this.update(id, options)
      return id
    }
    const duration = this.normalizeDuration(options.duration ?? 5000)
    this.entries.push({
      toast: {
        id,
        message: options.message,
        heading: options.heading ?? '',
        variant: options.variant ?? 'neutral',
        duration,
        dismissible: options.dismissible ?? true,
        noIcon: options.noIcon ?? false,
        showProgress: options.showProgress,
        actionLabel: options.actionLabel ?? '',
      },
      remaining: duration,
      started: 0,
    })
    this.sync()
    return id
  }

  /** Updates in place and restarts its visible lifetime. Queued entries retain their place. */
  update(id: string, options: Partial<Omit<ToastOptions, 'id'>>): boolean {
    const entry = this.entries.find((item) => item.toast.id === id)
    if (!entry) return false
    this.stop(entry)
    entry.closing = undefined
    // Ignore undefined fields so partial options never erase defaults.
    const defined = Object.fromEntries(Object.entries(options).filter(([key, value]) => key !== 'id' && value !== undefined))
    entry.toast = { ...entry.toast, ...defined, id }
    entry.toast.duration = this.normalizeDuration(entry.toast.duration)
    entry.remaining = entry.toast.duration
    this.sync()
    return true
  }

  /** Current visible lifetime, derived from the same clock used for dismissal. */
  getTiming(id: string): { remaining: number; duration: number; running: boolean } | undefined {
    const entry = this.entries.find((entry) => entry.toast.id === id)
    if (!entry) return
    const running = entry.timer !== undefined && !entry.closing
    return {
      duration: entry.toast.duration,
      remaining: Math.max(0, entry.remaining - (running ? Date.now() - entry.started : 0)),
      running,
    }
  }

  isClosing(id: string) {
    return !!this.entries.find((entry) => entry.toast.id === id)?.closing
  }

  dismiss(id: string, reason: ToastDismissReason = 'programmatic'): boolean {
    const index = this.entries.findIndex((entry) => entry.toast.id === id)
    if (index < 0 || this.entries[index].closing) return false
    const entry = this.entries[index]
    const token = {}
    entry.closing = token
    this.stop(entry)
    const finish = () => {
      if (entry.closing !== token) return
      const current = this.entries.indexOf(entry)
      if (current < 0) return
      this.entries.splice(current, 1)
      this.sync()
      this.onDismiss({ ...entry.toast }, reason)
    }
    const exit = index < this.limit ? this.beforeDismiss?.({ ...entry.toast }) : undefined
    if (exit) {
      this.sync()
      void exit.then(finish, finish)
    } else finish()
    return true
  }

  clear() {
    // Remove queued entries first so clearing never promotes them into visible slots.
    this.entries
      .slice()
      .reverse()
      .forEach((entry) => this.dismiss(entry.toast.id, 'clear'))
  }

  pause(reason = 'manual') {
    if (this.pauses.has(reason)) return
    this.pauses.add(reason)
    this.sync()
  }
  resume(reason = 'manual') {
    if (!this.pauses.delete(reason)) return
    this.sync()
  }

  private normalizeDuration(value: number) {
    return Number.isFinite(value) ? Math.max(0, value) : 5000
  }
  private stop(entry: Entry) {
    if (entry.timer === undefined) return
    clearTimeout(entry.timer)
    entry.timer = undefined
    entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.started))
  }
  private sync() {
    this.entries.forEach((entry, index) => {
      if (entry.closing || this.pauses.size || index >= this.limit || entry.toast.duration === 0) {
        this.stop(entry)
      } else if (entry.timer === undefined) {
        entry.started = Date.now()
        entry.timer = setTimeout(() => this.dismiss(entry.toast.id, 'timeout'), entry.remaining)
      }
    })
    this.listeners.forEach((listener) => listener())
  }
}
