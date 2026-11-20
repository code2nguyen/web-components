import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    avatar: {
      subject: 'avatar de {0}',
      subjectUnnamed: "l'avatar",
      upload: 'Téléverser {0}',
      change: 'Changer {0}',
      remove: 'Retirer {0}',
      group: "Groupe d'avatars",
      hidden: { one: '{0} autre avatar', other: '{0} autres avatars' },
      total: '{0} avatars au total',
      online: 'En ligne',
      away: 'Absent',
      busy: 'Occupé',
      offline: 'Hors ligne',
    },
  },
})
