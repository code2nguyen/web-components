import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'chat-message-list': {
      label: 'Conversation',
      jump: 'Aller au dernier message',
      loading: 'Chargement des messages précédents…',
    },
  },
})
