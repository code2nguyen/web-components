import { addTranslations } from '@c2n/core/localize.js'

/** The French an app would add: the library ships its text in English only. */
addTranslations({
  fr: {
    chart: {
      noData: 'Aucune donnée',
      loading: 'Chargement…',
      vennDiagram: 'Diagramme de Venn',
      vennSummary: 'Diagramme de Venn de {0}',
      vennOnly: '{0} seulement',
      vennRegion: 'Région',
      vennMembers: 'Membres',
      vennShare: 'Part',
      vennShareOfTotal: 'Part du total',
      vennNotIn: 'Hors de {0}',
      mapRegion: 'Région',
      mapScaleRange: '{0} : de {1} à {2}',
      price: 'Cours',
    },
  },
})
