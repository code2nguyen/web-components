import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The hidden table's first column, which names each bin. */
  bin: 'Bin',
  /** A bin's name: its lower and upper edge. */
  range: (from: string, to: string) => `${from} to ${to}`,
  /** A percentile marker's label on the plot, such as `p90`. */
  percentile: (p: string) => `p${p}`,
  /** One percentile in the plot's name: the marker's label and its value. */
  percentileValue: (name: string, value: string) => `${name} ${value}`,
  summary: (series: string, count: string) => `Histogram of ${series}, ${count} bins`,
  /** Appended to the summary for each series that has percentile markers. */
  summaryPercentiles: (summary: string, series: string, values: string) => `${summary}. ${series}: ${values}`,
  /** Appended to the summary when a line is drawn over the bars. */
  withDensity: (summary: string) => `${summary}, with a density curve`,
  withCumulative: (summary: string) => `${summary}, with a cumulative share line`,
}

/** The histogram's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const histogramMessages = defineMessages('histogram-chart', en)
