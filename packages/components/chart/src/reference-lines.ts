/**
 * The line chart's `reference-lines`, loaded with `import()` the first time a chart has any: horizontal rules and
 * bands drawn on uPlot's canvas, the y range that reaches them, and the text that reads them out. A line chart without
 * reference lines never downloads this module.
 */
import { formatMessage, localeOf } from '@c2n/core/localize.js'
import type uPlot from 'uplot'
import type { Options } from 'uplot'
import type { ChartBuildContext } from './chart-adapter.js'
import type { ChartReferenceLine } from './chart-types.js'
import { referenceLineMessages } from './reference-line-messages.js'
import { loadedUplot } from './engines/uplot-loader.js'

const TONES = ['neutral', 'info', 'success', 'warning', 'danger'] as const
const TONE_DEFAULTS: Record<(typeof TONES)[number], string> = {
  neutral: '#71717a',
  info: '#0265dc',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
}

/** A reference line with its numbers checked and its band ordered, ready to draw. */
interface ResolvedReferenceLine {
  low: number
  high: number
  band: boolean
  value: number
  label: string
  tone: (typeof TONES)[number]
}

/** The line chart, as this module reads it: its lines, its fixed bounds and its locale. */
export interface ReferenceLineHost extends HTMLElement {
  referenceLines?: ChartReferenceLine[]
  yMin?: number | null
  yMax?: number | null
  locale?: string
}

interface Paint {
  lines: ResolvedReferenceLine[]
  colors: string[]
  opacity: number
  width: number
  dash: string
  fontSize: number
  fontFamily: string
  halo: string
}

/** The valid entries: a finite `value`, a finite `value2` for a band, a known tone. */
function resolve(lines: ChartReferenceLine[] | undefined): ResolvedReferenceLine[] {
  return (Array.isArray(lines) ? lines : []).flatMap((line) => {
    if (line?.value === null || line?.value === undefined) return []
    const value = Number(line.value)
    if (!Number.isFinite(value)) return []
    const end = line.value2 === null || line.value2 === undefined ? NaN : Number(line.value2)
    const band = Number.isFinite(end) && end !== value
    const tone = TONES.find((name) => name === line.tone) ?? 'neutral'
    const label = typeof line.label === 'string' ? line.label : ''
    return [{ low: band ? Math.min(value, end) : value, high: band ? Math.max(value, end) : value, band, value, label, tone }]
  })
}

/** The option object with the y range reaching every line, and the hooks that draw them. Unchanged when none is valid. */
export function decorateReferenceLines(
  options: Options,
  context: ChartBuildContext,
  host: ReferenceLineHost,
  resolveColor: (expression: string, fallback: string) => string,
): Options {
  const lines = resolve(host.referenceLines)
  if (lines.length === 0) return options
  const style = getComputedStyle(host)
  const number = (name: string, fallback: number) => {
    const value = parseFloat(style.getPropertyValue(name))
    return Number.isFinite(value) ? value : fallback
  }
  const paint: Paint = {
    lines,
    colors: lines.map((line) =>
      resolveColor(
        line.tone === 'neutral'
          ? `var(--c2-chart__annotation--color, ${TONE_DEFAULTS.neutral})`
          : `var(--c2-chart__annotation__${line.tone}--color, ${TONE_DEFAULTS[line.tone]})`,
        context.theme.mutedColor,
      ),
    ),
    opacity: number('--c2-chart__annotation-range--opacity', 0.12),
    width: number('--c2-chart__annotation-line--border-width', 1),
    dash: style.getPropertyValue('--c2-chart__annotation-line--border-style').trim() || 'dashed',
    fontSize: context.theme.axisFontSize,
    fontFamily: context.theme.fontFamily === 'inherit' ? 'system-ui, sans-serif' : context.theme.fontFamily,
    halo: context.theme.surface,
  }
  // A bound removed from markup reads as null: auto, like undefined.
  const fixedMin = host.yMin ?? undefined
  const fixedMax = host.yMax ?? undefined
  const scales = options.scales ?? {}
  return {
    ...options,
    scales: {
      ...scales,
      // The y scale reaches every rule and band, so a limit the data never crosses — the usual case — is still drawn.
      y: {
        ...scales.y,
        range: (_self: uPlot, min: number | null, max: number | null): [number, number] => {
          let low = fixedMin ?? Infinity
          let high = fixedMax ?? -Infinity
          const reach = (value: number | null) => {
            if (value === null || !Number.isFinite(value)) return
            if (fixedMin === undefined) low = Math.min(low, value)
            if (fixedMax === undefined) high = Math.max(high, value)
          }
          reach(min)
          reach(max)
          for (const line of lines) {
            reach(line.low)
            reach(line.high)
          }
          if (!Number.isFinite(low) || !Number.isFinite(high)) return [fixedMin ?? 0, fixedMax ?? 1]
          // uPlot's own rounding, as its auto range does, with the room on top a label above the highest rule needs.
          const [niceLow, niceHigh] = loadedUplot()?.rangeNum(low, high, {
            min: { pad: 0.1, soft: 0, mode: 3 },
            max: { pad: 0.15, soft: 0, mode: 3 },
          }) ?? [low, high]
          return [fixedMin ?? niceLow ?? low, fixedMax ?? niceHigh ?? high]
        },
      },
    },
    hooks: {
      ...options.hooks,
      // Bands and rules go under the series, after the grid; their labels go on top, so a line never crosses one.
      drawAxes: [...(options.hooks?.drawAxes ?? []), (self: uPlot) => draw(self, paint, false)],
      draw: [...(options.hooks?.draw ?? []), (self: uPlot) => draw(self, paint, true)],
    },
  }
}

function draw(self: uPlot, paint: Paint, labels: boolean): void {
  const context = self.ctx
  const ratio = self.bbox.width / Math.max(1, self.over.clientWidth || self.bbox.width)
  const { left, top, width, height } = self.bbox
  context.save()
  context.beginPath()
  context.rect(left, top, width, height)
  context.clip()
  context.font = `${paint.fontSize * ratio}px ${paint.fontFamily}`
  context.textAlign = 'right'
  paint.lines.forEach((line, index) => {
    const color = paint.colors[index]
    const y1 = self.valToPos(line.low, 'y', true)
    const y2 = self.valToPos(line.high, 'y', true)
    if (!Number.isFinite(y1) || !Number.isFinite(y2)) return
    if (labels) {
      if (line.band || !line.label) return
      // Above the rule, or below it when there is no room above; a halo in the surface colour keeps it legible over the data.
      const below = y1 - (paint.fontSize + 2) * ratio < top
      context.textBaseline = below ? 'top' : 'bottom'
      const x = left + width - 4 * ratio
      const y = Math.round(y1) + (below ? 3 : -2) * ratio
      context.lineJoin = 'round'
      context.lineWidth = 3 * ratio
      context.strokeStyle = paint.halo
      context.strokeText(line.label, x, y)
      context.fillStyle = color
      context.fillText(line.label, x, y)
      return
    }
    if (line.band) {
      context.globalAlpha = paint.opacity
      context.fillStyle = color
      context.fillRect(left, Math.min(y1, y2), width, Math.abs(y2 - y1))
      context.globalAlpha = 1
      return
    }
    const lineWidth = Math.max(1, paint.width * ratio)
    context.strokeStyle = color
    context.lineWidth = lineWidth
    context.setLineDash(paint.dash === 'solid' ? [] : paint.dash === 'dotted' ? [lineWidth, 2 * lineWidth] : [5 * ratio, 4 * ratio])
    const y = Math.round(y1) + (Math.round(lineWidth) % 2 ? 0.5 : 0)
    context.beginPath()
    context.moveTo(left, y)
    context.lineTo(left + width, y)
    context.stroke()
  })
  context.restore()
}

/** `summary` followed by the labelled rules and bands, which are canvas marks with no text of their own. */
export function describeReferenceLines(summary: string, host: ReferenceLineHost, format: (value: number) => string): string {
  const named = resolve(host.referenceLines).filter((line) => line.label)
  const locale = host.locale || localeOf(host)
  if (named.length === 0) return summary
  const list = named
    .map((line) =>
      line.band
        ? formatMessage(referenceLineMessages, locale, 'referenceBand', line.label, format(line.low), format(line.high))
        : formatMessage(referenceLineMessages, locale, 'referenceLine', line.label, format(line.value)),
    )
    .join(', ')
  return formatMessage(referenceLineMessages, locale, 'withReferenceLines', summary, list)
}
