import { defineMessages } from '@c2n/core/localize.js'

/** The default band names, poorest first, by band count. */
const BAND_NAMES = ['', 'Range', 'Poor, Good', 'Poor, Satisfactory, Good', 'Poor, Fair, Good, Excellent', 'Very poor, Poor, Satisfactory, Good, Excellent']

// Its own module rather than `messages.ts`, which every chart imports: only the bullet chart loads this text.
const bulletEn = {
  actual: 'Actual',
  target: 'Target',
  band: 'Band',
  measure: 'Measure',
  ofTargetHeader: '% of target',
  /** The band names, poorest first, as a comma list, for a row with this many bands. */
  bandNames: (count: number) => BAND_NAMES[count] ?? BAND_NAMES[3],
  reached: (percent: string) => `${percent} reached`,
  ofTarget: (percent: string) => `${percent} of target`,
  range: (from: string, to: string) => `${from}–${to}`,
  bandRange: (band: string, range: string) => `${band}, ${range}`,
  summary: (count: number, onTarget: string) =>
    count === 1 ? `Bullet chart, 1 measure, ${onTarget} on target` : `Bullet chart, ${count} measures, ${onTarget} on target`,
  summaryNoTargets: (count: number) => (count === 1 ? 'Bullet chart, 1 measure' : `Bullet chart, ${count} measures`),
  announcement: (label: string, value: string, percent: string, target: string, band: string) =>
    `${label}: ${value}, ${percent} of the ${target} target${band ? `, ${band}` : ''}`,
  announcementNoTarget: (label: string, value: string, band: string) => `${label}: ${value}${band ? `, ${band}` : ''}`,
  noValue: 'no value',
}

/** The bullet chart's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const bulletMessages = defineMessages('bullet-chart', bulletEn)
