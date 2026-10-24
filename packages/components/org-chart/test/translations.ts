import { addTranslations } from '@c2n/core/localize.js'
import { orgChartMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof orgChartMessages.en = {
  label: 'Organigramme',
  expand: (count: number) => `Déplier (${count})`,
  collapse: 'Replier',
}

addTranslations({ fr: { 'org-chart': fr } })
