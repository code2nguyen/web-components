import { addTranslations } from '@c2n/core/localize.js'
import { notificationCenterMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof notificationCenterMessages.en = {
  title: 'Notifications',
  filter: 'Afficher',
  all: 'Toutes',
  unread: 'Non lues',
  unreadCount: (count) => (count === 1 ? '1 non lue' : `${count} non lues`),
  markAllRead: 'Tout marquer comme lu',
  markRead: 'Marquer comme lue',
  markUnread: 'Marquer comme non lue',
  allMarked: 'Toutes les notifications sont lues',
  unreadItem: (title) => `Non lue : ${title}`,
  today: 'Aujourd’hui',
  yesterday: 'Hier',
  empty: 'Aucune notification',
  emptyUnread: 'Vous êtes à jour',
  loadMore: 'Charger plus',
}

addTranslations({ fr: { 'notification-center': fr } })
