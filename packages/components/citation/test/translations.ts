import { addTranslations } from '@c2n/core/localize.js'
import { citationMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof citationMessages.en = {
  source: 'Source',
  numbered: (index) => `Source ${index}`,
  named: (source, title) => `${source} : ${title}`,
}

addTranslations({ fr: { citation: fr } })
