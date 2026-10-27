import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/avatar'
import '@c2n/relative-time'
import '@c2n/badge'
import { notificationCenterMessages } from './messages'
import styles from './notification-center.scss?inline'

export { notificationCenterMessages } from './messages'

/** One notification. */
export interface NotificationItem {
  /** A stable id, carried by the events: a string or a number, as a database gives it. */
  id: string | number
  /** The line that says what happened. */
  title: string
  /** A second line with more detail. */
  body?: string
  /** When it happened: a `Date`, a timestamp or an ISO string. */
  time: Date | string | number
  /** Whether the user has seen it. */
  read?: boolean
  /** Makes the item a link. Only http(s) and relative addresses are followed. */
  href?: string
  /** Who or what it is from, drawn as a `c2-avatar`. */
  avatar?: { name?: string; src?: string }
  /** The group it is listed under with `group-by="field"`. */
  group?: string
}

/** Events fired by {@link NotificationCenter}, keyed for `addEventListener`. */
export interface NotificationCenterEventMap {
  'notification-click': CustomEvent<{ notification: NotificationItem }>
  'read-change': CustomEvent<{ ids: (string | number)[]; read: boolean }>
  'filter-change': CustomEvent<{ filter: 'all' | 'unread' }>
  'load-more': Event
}

export interface NotificationCenter {
  addEventListener: TypedAddEventListener<NotificationCenter, NotificationCenterEventMap>
  removeEventListener: TypedRemoveEventListener<NotificationCenter, NotificationCenterEventMap>
}

/** An address an item may follow: http(s), or relative to the page, once the characters a browser drops are removed. */
function safeUrl(value: string | undefined): string {
  // eslint-disable-next-line no-control-regex
  const url = (value ?? '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '')
  if (!url) return ''
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase()
  return scheme === undefined || scheme === 'http' || scheme === 'https' ? url : ''
}

function toDate(value: NotificationItem['time']): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** A local day key, `YYYY-MM-DD`. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

interface Group {
  key: string
  title: string
  items: NotificationItem[]
}

/**
 * An inbox panel of notifications, like GitHub's notifications, Linear's inbox and the Carbon notification panel:
 * newest first, grouped by day, the unread ones marked, with an All / Unread filter and "Mark all as read". It is a
 * panel only; put it in a `c2-overlay` for a bell-icon dropdown, in a `c2-sheet`, or in a page column.
 *
 * Each item shows who it is from (`avatar`), what happened (`title`, `body`) and when (a `c2-relative-time`). The whole
 * item is one link (with `href`) or button, and activating it fires a cancelable `notification-click`, then marks it
 * read. A toggle beside it marks it read or unread. Every change of read state fires a cancelable `read-change` with
 * the ids, then updates `notifications`; cancel it to keep the panel controlled, for example to wait for a server.
 *
 * `has-more` adds a Load more button that fires `load-more`, with `loading` while the next page arrives. The `empty`
 * slot replaces the message shown when there is nothing to list.
 *
 * The panel is a region named by its title; each day is a list named by its title; an unread item reads as
 * "Unread: …", and a live region confirms "All notifications marked as read".
 *
 * @tag c2-notification-center
 *
 * @slot empty - Replaces the message shown when there is nothing to list.
 * @slot header-actions - More controls at the end of the header, such as a settings button.
 *
 * @event {CustomEvent<{ notification: NotificationItem }>} notification-click - An item was activated. Cancelable: cancelling it keeps the item unread and stops a link from being followed.
 * @event {CustomEvent<{ ids: (string | number)[]; read: boolean }>} read-change - The user marked items read or unread. Cancelable: cancel it to leave `notifications` unchanged.
 * @event {Event} load-more - The Load more button was pressed.
 * @event {CustomEvent<{ filter: 'all' | 'unread' }>} filter-change - The user switched between All and Unread; `filter` is already updated.
 *
 * @csspart header - The row with the title, the unread count and the actions.
 * @csspart title - The title.
 * @csspart filters - The All / Unread buttons.
 * @csspart mark-all - The Mark all as read button.
 * @csspart group-title - A day's (or group's) title.
 * @csspart item - One notification.
 * @csspart dot - The unread dot.
 * @csspart item-title - An item's title.
 * @csspart body - An item's second line.
 * @csspart time - An item's time.
 * @csspart toggle - An item's read / unread toggle.
 * @csspart empty - The message shown when there is nothing to list.
 * @csspart load-more - The Load more button.
 *
 * @cssproperty {pixel} [--c2-notification-center--width=380px]
 * @cssproperty {pixel} [--c2-notification-center--max-height=520px] - The list scrolls past it.
 * @cssproperty {color} [--c2-notification-center--background-color=#ffffff]
 * @cssproperty {border} [--c2-notification-center--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-notification-center--border-radius=8px]
 * @cssproperty {shadow} [--c2-notification-center--box-shadow=none]
 * @cssproperty {color} [--c2-notification-center--color=#18181b]
 * @cssproperty {font-size} [--c2-notification-center--font-size=14px]
 * @cssproperty {padding} [--c2-notification-center__header--padding=12px 16px 8px]
 * @cssproperty {font-weight} [--c2-notification-center__title--font-weight=600]
 * @cssproperty {color} [--c2-notification-center__group-title--color=#71717a]
 * @cssproperty {font-size} [--c2-notification-center__group-title--font-size=12px]
 * @cssproperty {padding} [--c2-notification-center__item--padding=10px 16px]
 * @cssproperty {pixel} [--c2-notification-center__item--gap=12px]
 * @cssproperty {color} [--c2-notification-center__item__hover--background-color=#fafafa]
 * @cssproperty {color} [--c2-notification-center__item__unread--background-color=#edf1fe] - An unread item's background.
 * @cssproperty {color} [--c2-notification-center__dot--color=rgb(2, 101, 220)]
 * @cssproperty {pixel} [--c2-notification-center__dot--size=8px]
 * @cssproperty {font-weight} [--c2-notification-center__item-title__unread--font-weight=600]
 * @cssproperty {color} [--c2-notification-center__body--color=#52525b]
 * @cssproperty {font-size} [--c2-notification-center__body--font-size=13px]
 * @cssproperty {color} [--c2-notification-center__time--color=#52525b]
 * @cssproperty {font-size} [--c2-notification-center__time--font-size=12px]
 * @cssproperty {border} [--c2-notification-center__divider--border=1px solid #e4e4e7] - Between the header and the list, and between the groups.
 * @cssproperty {color} [--c2-notification-center__filter__selected--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-notification-center__link--color=rgb(2, 101, 220)] - The Mark all as read and Load more buttons.
 * @cssproperty {outline} [--c2-notification-center__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-notification-center')
export class NotificationCenter extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The notifications. As an attribute, a JSON array of `{ id, title, body, time, read, href, avatar, group }`. */
  @property({ converter: jsonPropertyConverter }) notifications: NotificationItem[] = []

  /** Which notifications are listed. The All / Unread buttons set it. */
  @property({ reflect: true }) filter: 'all' | 'unread' = 'all'

  /** How the list is grouped: by day (Today, Yesterday, then the date), by each item's `group`, or not at all. */
  @property({ attribute: 'group-by' }) groupBy: 'day' | 'field' | 'none' = 'day'

  /** Adds a Load more button at the end of the list, which fires `load-more`. */
  @property({ type: Boolean, attribute: 'has-more' }) hasMore = false

  /** Marks the Load more button busy while the next page arrives. */
  @property({ type: Boolean }) loading = false

  /** The title. Defaults to "Notifications" in the page's language. */
  @property() label = ''

  private announcementTimer?: ReturnType<typeof setTimeout>
  /** What the live region says, cleared after it has been read. */
  @state() private announcement = ''

  private readonly msg = new LocalizeController(this, notificationCenterMessages)
  private readonly internals = this.attachInternals()

  override connectedCallback(): void {
    super.connectedCallback()
    this.internals.role = 'region'
  }

  protected override updated(): void {
    this.internals.ariaLabel = this.label || this.msg.t('title')
  }

  /** The items that can be shown: an id (string or number) and a title. Others stay in `notifications` untouched. */
  private get list(): NotificationItem[] {
    return (Array.isArray(this.notifications) ? this.notifications : []).filter(
      (item) => item && (typeof item.id === 'string' || typeof item.id === 'number') && typeof item.title === 'string',
    )
  }

  private groups(items: NotificationItem[]): Group[] {
    const sorted = [...items].sort((a, b) => (toDate(b.time)?.getTime() ?? 0) - (toDate(a.time)?.getTime() ?? 0))
    if (this.groupBy === 'none') return [{ key: '', title: '', items: sorted }]
    const groups = new Map<string, Group>()
    const now = new Date()
    const today = dayKey(now)
    const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12))
    const dateFormat = (date: Date) =>
      new Intl.DateTimeFormat(this.msg.locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
      }).format(date)
    for (const item of sorted) {
      let key: string
      let title: string
      if (this.groupBy === 'field') {
        key = item.group ?? ''
        title = item.group ?? ''
      } else {
        const date = toDate(item.time)
        key = date ? dayKey(date) : ''
        title = !date ? '' : key === today ? this.msg.t('today') : key === yesterday ? this.msg.t('yesterday') : dateFormat(date)
      }
      if (!groups.has(key)) groups.set(key, { key, title, items: [] })
      groups.get(key)!.items.push(item)
    }
    return [...groups.values()]
  }

  /** Announces a read change about to happen, then applies it unless the event was cancelled. */
  private setRead(ids: (string | number)[], read: boolean): boolean {
    if (!ids.length) return true
    const allowed = this.dispatchEvent(new CustomEvent('read-change', { cancelable: true, detail: { ids: [...ids], read } }))
    if (!allowed) return false
    const set = new Set(ids.map(String))
    // Map over every entry, not only the ones shown, so nothing the app passed in is dropped.
    this.notifications = (Array.isArray(this.notifications) ? this.notifications : []).map((item) =>
      item && set.has(String(item.id)) ? { ...item, read } : item,
    )
    return true
  }

  private markAllRead(): void {
    const ids = this.list.filter((item) => !item.read).map((item) => item.id)
    if (this.setRead(ids, true)) {
      this.announcement = this.msg.t('allMarked')
      clearTimeout(this.announcementTimer)
      this.announcementTimer = setTimeout(() => (this.announcement = ''), 3000)
    }
  }

  private activate(event: Event, item: NotificationItem): void {
    const allowed = this.dispatchEvent(new CustomEvent('notification-click', { cancelable: true, detail: { notification: item } }))
    if (!allowed) {
      event.preventDefault()
      return
    }
    if (!item.read) this.setRead([item.id], true)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    clearTimeout(this.announcementTimer)
  }

  private setFilter(filter: 'all' | 'unread'): void {
    if (filter === this.filter) return
    this.filter = filter
    this.dispatchEvent(new CustomEvent('filter-change', { detail: { filter } }))
  }

  override render() {
    const title = this.label || this.msg.t('title')
    const all = this.list
    const unread = all.filter((item) => !item.read).length
    const shown = this.filter === 'unread' ? all.filter((item) => !item.read) : all
    const groups = this.groups(shown)
    return html`<div class="panel">
      <div class="header" part="header">
        <div class="heading">
          <span class="title" part="title">${title}</span>
          ${
            unread
              ? // The badge has no role a name could go on, so the number is read from hidden text next to it.
                html`<c2-badge class="count" tone="primary" .count=${unread} aria-hidden="true"></c2-badge
                  ><span class="visually-hidden">${this.msg.t('unreadCount', unread)}</span>`
              : nothing
          }
          <span class="header-actions">
            <button class="link" part="mark-all" type="button" ?disabled=${!unread} @click=${this.markAllRead}>${this.msg.t('markAllRead')}</button>
            <slot name="header-actions"></slot>
          </span>
        </div>
        <div class="filters" part="filters" role="group" aria-label=${this.msg.t('filter')}>
          <button class="filter" type="button" aria-pressed=${this.filter !== 'unread' ? 'true' : 'false'} @click=${() => this.setFilter('all')}>
            ${this.msg.t('all')}
          </button>
          <button class="filter" type="button" aria-pressed=${this.filter === 'unread' ? 'true' : 'false'} @click=${() => this.setFilter('unread')}>
            ${this.msg.t('unread')}
          </button>
        </div>
      </div>
      <div class="scroller">
        ${
          shown.length
            ? groups.map((group, at) => this.renderGroup(group, at))
            : html`<div class="empty" part="empty">
                <slot name="empty">${this.msg.t(this.filter === 'unread' ? 'emptyUnread' : 'empty')}</slot>
              </div>`
        }
        ${
          this.hasMore
            ? html`<button
                class="link load-more"
                part="load-more"
                type="button"
                aria-busy=${this.loading ? 'true' : 'false'}
                ?disabled=${this.loading}
                @click=${() => this.dispatchEvent(new Event('load-more'))}
              >
                ${this.msg.t('loadMore')}
              </button>`
            : nothing
        }
      </div>
      <div class="visually-hidden" role="status">${this.announcement}</div>
    </div>`
  }

  private renderGroup(group: Group, at: number) {
    const titleId = `group-${at}`
    return html`<section class="group">
      ${group.title ? html`<div class="group-title" part="group-title" id=${titleId}>${group.title}</div>` : nothing}
      <ul class="items" aria-labelledby=${group.title ? titleId : nothing}>
        ${group.items.map((item) => this.renderItem(item))}
      </ul>
    </section>`
  }

  private renderItem(item: NotificationItem) {
    const href = safeUrl(item.href)
    const name = item.read ? item.title : this.msg.t('unreadItem', item.title)
    const date = toDate(item.time)
    const content = html`<span class="item-title" part="item-title">${item.title}</span>`
    return html`<li class="item ${item.read ? '' : 'item--unread'}" part="item">
      <span class="dot" part="dot" aria-hidden="true"></span>
      ${
        item.avatar
          ? html`<c2-avatar class="avatar" name=${item.avatar.name ?? ''} src=${item.avatar.src || nothing} auto-color aria-hidden="true"></c2-avatar>`
          : nothing
      }
      <div class="content">
        ${
          href
            ? html`<a class="main" href=${href} aria-label=${name} @click=${(event: Event) => this.activate(event, item)}>${content}</a>`
            : html`<button class="main" type="button" aria-label=${name} @click=${(event: Event) => this.activate(event, item)}>${content}</button>`
        }
        ${item.body ? html`<span class="body" part="body">${item.body}</span>` : nothing}
        ${date ? html`<c2-relative-time class="time" part="time" .date=${date} format="short"></c2-relative-time>` : nothing}
      </div>
      <button
        class="toggle"
        part="toggle"
        type="button"
        aria-label=${item.read ? this.msg.t('markUnread') : this.msg.t('markRead')}
        title=${item.read ? this.msg.t('markUnread') : this.msg.t('markRead')}
        @click=${() => this.setRead([item.id], !item.read)}
      >
        ${
          item.read
            ? html`<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.5" /></svg>`
            : html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" /></svg>`
        }
      </button>
    </li>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-notification-center': NotificationCenter
  }
}
