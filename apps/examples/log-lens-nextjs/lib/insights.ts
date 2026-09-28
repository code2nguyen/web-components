/** Derived, view-ready answers on top of an {@link Analysis}. */
import type { Analysis, AttributeLift, Chapter } from './analysis.ts'
import { isProblem, journeyLift } from './analysis.ts'
import type { Focus } from './focus.ts'
import { formatClock, formatDuration, formatPercent, shorten } from './format.ts'
import type { LogRecord, SeverityBand } from './otlp.ts'
import type { Pattern } from './patterns.ts'

export interface QuickAnswer {
  question: string
  answer: string
  focus?: Focus
  patternId?: string
}

/** Where problems concentrate: infrastructure keys say more than message-level ones such as the status code. */
const PLACE_KEY = /^(k8s\.|host\.|cloud\.|container\.|service\.instance|service\.version|deployment\.|faas\.|process\.)/

export function placeOfFailure(analysis: Analysis): AttributeLift | undefined {
  const lifts = journeyLift(analysis.records, analysis.journeys, analysis.divergence.entry, 20)
  return lifts.find((lift) => PLACE_KEY.test(lift.key))
}

export function quickAnswers(analysis: Analysis): QuickAnswer[] {
  const answers: QuickAnswer[] = []
  const topError = analysis.patterns.filter((pattern) => isProblem(pattern.severity)).sort((a, b) => b.count - a.count)[0]
  if (!topError) {
    answers.push({ question: 'Is anything failing?', answer: 'No record in this file is an error or fatal.' })
  } else {
    answers.push({
      question: 'What fails most?',
      answer: `${topError.services.join(', ')}: “${shorten(topError.template, 70)}”, ${topError.count}×.`,
      patternId: topError.id,
    })
  }
  const surge = analysis.chapters.find((chapter) => chapter.kind === 'surge')
  if (surge) {
    answers.push({
      question: 'When did it go wrong?',
      answer: `${formatClock(surge.start)} to ${formatClock(surge.end)}, for ${formatDuration(surge.end - surge.start)}.`,
      focus: surge.focus,
    })
    const trigger = surge.patternIds
      .map((id) => analysis.patternById.get(id))
      .find((pattern) => pattern && !isProblem(pattern.severity) && pattern.first <= surge.start)
    if (trigger)
      answers.push({
        question: 'What changed right before?',
        answer: `${trigger.services[0]} logged “${shorten(trigger.template, 70)}” for the first time.`,
        patternId: trigger.id,
      })
  }
  const place = topError ? placeOfFailure(analysis) : undefined
  if (place)
    answers.push({
      question: 'Where does it happen?',
      answer: `${place.key} = ${place.value} — in ${formatPercent(place.targetShare)} of failed requests, ${formatPercent(place.restShare)} of successful ones.`,
      focus: { attribute: { key: place.key, value: place.value } },
    })
  const silence = analysis.chapters.find((chapter) => chapter.kind === 'silence')
  if (silence)
    answers.push({
      question: 'Did anything stop logging?',
      answer: `${silence.title.replace(' goes quiet', '')}, for ${formatDuration(silence.end - silence.start)} from ${formatClock(silence.start)}.`,
      focus: silence.focus,
    })
  return answers
}

/** Occurrences of each pattern per timeline bucket, for sparklines. */
export function patternHistograms(analysis: Analysis, records: readonly LogRecord[]): Map<string, number[]> {
  const { timeline, patternOf } = analysis
  const size = timeline.buckets.length
  const histograms = new Map<string, number[]>()
  for (const record of records) {
    const id = patternOf[record.index]
    let histogram = histograms.get(id)
    if (!histogram) histograms.set(id, (histogram = new Array<number>(size).fill(0)))
    histogram[Math.min(size - 1, Math.max(0, Math.floor((record.time - timeline.start) / timeline.bucketMs)))]++
  }
  return histograms
}

export const SEVERITY_TONE: Record<SeverityBand, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  fatal: 'danger',
  error: 'danger',
  warn: 'warning',
  info: 'info',
  debug: 'neutral',
  trace: 'neutral',
  unset: 'neutral',
}

export const SEVERITY_LABEL: Record<SeverityBand, string> = {
  fatal: 'Fatal',
  error: 'Error',
  warn: 'Warn',
  info: 'Info',
  debug: 'Debug',
  trace: 'Trace',
  unset: 'Unset',
}

export const CHAPTER_ICON: Record<Chapter['kind'], string> = {
  opening: 'book-open',
  surge: 'zap',
  'new-behaviour': 'activity',
  silence: 'clock',
  recovery: 'crosshair',
  closing: 'file-text',
}

export function patternLabel(pattern: Pattern, max = 60): string {
  return shorten(pattern.template, max)
}
