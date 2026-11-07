import { defineMessages } from '@c2n/core/localize.js'

const en = {
  min: 'Min',
  q1: 'Q1',
  median: 'Median',
  q3: 'Q3',
  max: 'Max',
  mean: 'Mean',
  outliers: 'Outliers',
  outlier: 'Outlier',
  samples: 'Samples',
  category: 'Category',
  series: 'Series',
  count: 'n',
  /** The tooltip's outlier row: how many, and the furthest of them. */
  outlierSummary: (count: string, furthest: string) => `${count}, up to ${furthest}`,
  /** A box's name where several series share a category. */
  boxName: (category: string, series: string) => `${category}, ${series}`,
  summary: (series: string, count: string) => `Box plot of ${series}, ${count} categories`,
  roleDescription: 'box plot',
  announcement: (name: string, median: string, q1: string, q3: string, min: string, max: string) =>
    `${name}: median ${median}, quartiles ${q1} to ${q3}, whiskers ${min} to ${max}`,
  outlierCount: (count: string) => `${count} outliers`,
  oneOutlier: '1 outlier',
  outlierAnnouncement: (name: string, value: string) => `${name}, outlier: ${value}`,
}

/** The box plot's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const boxplotMessages = defineMessages('boxplot-chart', en)
