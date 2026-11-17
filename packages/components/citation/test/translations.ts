import { addTranslations } from '@c2n/core/localize.js'
import { citationMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof citationMessages.en = {
  source: 'Source',
  numbered: (index) => `Source ${index}`,
  named: (source, title) => `${source} : ${title}`,
}

addTranslations({
  fr: {
    citation: fr,
    // As JSON would hold it: a plural choice and `{0}` placeholders.
    'citation-list': { summary: { one: '{0} source utilisée', other: '{0} sources utilisées' }, label: 'Sources', card: 'Source {0} : {1}' },
  },
})
