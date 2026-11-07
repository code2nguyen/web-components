import { defineMessages } from '@c2n/core/localize.js'

// Its own module rather than `messages.ts`, which every chart imports: only the bullet chart loads this text.
const bulletEn = {
  actual: 'Actual',
  target: 'Target',
  band: 'Band',
  measure: 'Measure',
  ofTargetHeader: '% of target',
  // The default band names, one message per name and band count, poorest first: a language names the bands of a
  // two-band row differently from those of a five-band one.
  band1Of1: 'Range',
  band1Of2: 'Poor',
  band2Of2: 'Good',
  band1Of3: 'Poor',
  band2Of3: 'Satisfactory',
  band3Of3: 'Good',
  band1Of4: 'Poor',
  band2Of4: 'Fair',
  band3Of4: 'Good',
  band4Of4: 'Excellent',
  band1Of5: 'Very poor',
  band2Of5: 'Poor',
  band3Of5: 'Satisfactory',
  band4Of5: 'Good',
  band5Of5: 'Excellent',
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

/** The message naming band `position` (from 1, poorest first) of a row with `count` bands. */
export type BulletBandNameKey = `band${1 | 2 | 3 | 4 | 5}Of${1 | 2 | 3 | 4 | 5}` & keyof typeof bulletEn

/** The key of the default name of band `position` (from 1, poorest first) of `count`, both clamped to 1–5. */
export function bandNameKey(position: number, count: number): BulletBandNameKey {
  const of = Math.min(5, Math.max(1, Math.trunc(count)))
  const at = Math.min(of, Math.max(1, Math.trunc(position)))
  return `band${at}Of${of}` as BulletBandNameKey
}
