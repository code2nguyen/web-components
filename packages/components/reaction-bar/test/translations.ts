import { addTranslations } from '@c2n/core/localize.js'
import { reactionBarMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const reactions = (count: number) => (count === 1 ? '1 réaction' : `${count} réactions`)

const fr: typeof reactionBarMessages.en = {
  label: 'Réactions',
  add: 'Ajouter une réaction',
  quick: 'Réactions rapides',
  reaction: (emoji, count) => `${emoji}, ${reactions(count)}`,
  readonlyReaction: (emoji, count, reacted) => `${emoji}, ${reactions(count)}${reacted ? ', dont la vôtre' : ''}`,
}

addTranslations({ fr: { 'reaction-bar': fr } })
