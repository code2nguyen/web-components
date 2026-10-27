import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The panel's title and accessible name when it has no `label`. */
  title: 'Notifications',
  /** The filter buttons, and the accessible name of the row they sit in. */
  filter: 'Show',
  all: 'All',
  unread: 'Unread',
  /** The header's count of unread notifications, as a screen reader hears it. */
  unreadCount: (count: number) => (count === 1 ? '1 unread' : `${count} unread`),
  /** The header button, the per-item toggle, and what the live region says after marking all. */
  markAllRead: 'Mark all as read',
  markRead: 'Mark as read',
  markUnread: 'Mark as unread',
  allMarked: 'All notifications marked as read',
  /** An unread item's main control, as a screen reader hears it. */
  unreadItem: (title: string) => `Unread: ${title}`,
  /** Group titles when grouped by day; older days show their date. */
  today: 'Today',
  yesterday: 'Yesterday',
  /** Shown when there is nothing to list, with the All and the Unread filter. */
  empty: 'No notifications',
  emptyUnread: 'You’re all caught up',
  /** The button that asks for older notifications. */
  loadMore: 'Load more',
}

/** The notification center's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const notificationCenterMessages = defineMessages('notification-center', en)
