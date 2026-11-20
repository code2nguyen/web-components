import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** What the avatar's buttons act on: `{0}` is the avatar's name. */
  subject: (name: string) => `${name} avatar`,
  /** What the avatar's buttons act on when it has no name. */
  subjectUnnamed: 'avatar',
  /** Accessible names of the edit buttons, `{0}` being the subject above. */
  upload: (subject: string) => `Upload ${subject}`,
  change: (subject: string) => `Change ${subject}`,
  remove: (subject: string) => `Remove ${subject}`,
  /** Accessible name of `c2-avatar-group` when it has no `aria-label`. */
  group: 'Avatar group',
  /** The group's `+N` indicator: how many avatars are hidden, or with `count-mode="total"` how many there are. */
  hidden: (count: number) => `${count} more avatar${count === 1 ? '' : 's'}`,
  total: (count: number) => `${count} avatars total`,
  /** Accessible names of the status dot, one per `status`. */
  online: 'Online',
  away: 'Away',
  busy: 'Busy',
  offline: 'Offline',
}

/** The avatar's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const avatarMessages = defineMessages('avatar', en)
