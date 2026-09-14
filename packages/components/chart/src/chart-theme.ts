/**
 * Turns the element's own CSS custom properties into plain values a canvas engine can use.
 *
 * This is the one place the package has to work around the fact that a chart is not DOM: `::part()` and
 * `var()` never reach a canvas, so the theme has to be *read* and handed over as strings and numbers.
 *
 * Colours are read through hidden probe elements rather than `getPropertyValue`, because a custom
 * property whose value is a `var()` chain or a `color-mix()` comes back from `getPropertyValue` as the
 * author's literal text — which no engine can parse. The computed `color` of a probe is always a resolved
 * `rgb(…)`. The probes live in the shadow root under `display: none`, so they cost no layout.
 */
import { isServer, type ReactiveController, type ReactiveControllerHost } from 'lit'

/** The slice of the host this controller needs: a reactive element with a shadow root to probe. */
type ThemeHost = ReactiveControllerHost & HTMLElement & { readonly renderRoot?: ParentNode }

/** Number of series colours in the palette; matches `--c2-chart__series-1…8--color`. */
export const PALETTE_SIZE = 8

/**
 * The colours the probe block exposes, in DOM order. `chart.scss` emits one `i:nth-child(n)` rule per
 * entry, so this list and that loop must stay in step.
 */
export const PROBE_COLORS = [
  'series-1',
  'series-2',
  'series-3',
  'series-4',
  'series-5',
  'series-6',
  'series-7',
  'series-8',
  'axis',
  'grid',
  'text',
  'muted',
  'tooltip-background',
  'tooltip-text',
  'crosshair',
  'positive',
  'negative',
  'surface',
] as const

/** Resolved, engine-ready theme values. Every colour is a computed `rgb(…)`. */
export interface ChartTheme {
  /** The categorical series palette, longest-lived of the chart tokens. */
  palette: string[]
  /** Primary text colour, used for labels the chart draws itself. */
  color: string
  /** Secondary text colour, used for axis tick labels. */
  mutedColor: string
  axisColor: string
  gridColor: string
  surface: string
  tooltipBackground: string
  tooltipColor: string
  crosshairColor: string
  /** Colours for charts with an inherent direction (candlestick, gauge thresholds). */
  positive: string
  negative: string
  fontFamily: string
  fontSize: number
  lineWidth: number
  pointRadius: number
}

const FALLBACK: ChartTheme = {
  palette: ['#0265dc', '#ea580c', '#0f766e', '#db2777', '#a16207', '#7c3aed', '#0891b2', '#52525b'],
  color: '#18181b',
  mutedColor: '#71717a',
  axisColor: '#71717a',
  gridColor: '#e4e4e7',
  surface: '#ffffff',
  tooltipBackground: '#18181b',
  tooltipColor: '#fafafa',
  crosshairColor: '#a1a1aa',
  positive: '#16a34a',
  negative: '#dc2626',
  fontFamily: 'inherit',
  fontSize: 12,
  lineWidth: 2,
  pointRadius: 2.5,
}

/**
 * Resolves and caches the host's chart theme, and invalidates it whenever the page's colour scheme moves.
 *
 * Three independent triggers, because an app may use any of them: the `data-theme` / `class` attribute on
 * `<html>` (what a site toggle sets), the OS preference, and the `c2n-theme-change` event the docs site
 * happens to fire. None of them is required for the component to work.
 */
export class ChartThemeController implements ReactiveController {
  #host: ThemeHost
  #onChange: () => void
  #theme?: ChartTheme
  #observer?: MutationObserver
  #media?: MediaQueryList

  constructor(host: ThemeHost, onChange: () => void) {
    this.#host = host
    this.#onChange = onChange
    host.addController(this)
  }

  /** The resolved theme, computed on first read after each invalidation. */
  get theme(): ChartTheme {
    if (!this.#theme) this.#theme = this.#resolve()
    return this.#theme
  }

  /** Drops the cached theme and tells the host to rebuild its engine options. */
  invalidate(): void {
    this.#theme = undefined
    this.#onChange()
  }

  hostConnected(): void {
    if (isServer) return
    window.addEventListener('c2n-theme-change', this.#handle)
    if (typeof MutationObserver !== 'undefined') {
      if (!this.#observer) this.#observer = new MutationObserver(this.#handle)
      this.#observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    }
    if (typeof matchMedia !== 'undefined') {
      if (!this.#media) this.#media = matchMedia('(prefers-color-scheme: dark)')
      this.#media.addEventListener('change', this.#handle)
    }
  }

  hostDisconnected(): void {
    if (isServer) return
    window.removeEventListener('c2n-theme-change', this.#handle)
    this.#observer?.disconnect()
    this.#media?.removeEventListener('change', this.#handle)
    // The cached theme is dropped too: the element may reconnect under a different theme.
    this.#theme = undefined
  }

  #handle = () => this.invalidate()

  #resolve(): ChartTheme {
    if (isServer || typeof getComputedStyle !== 'function') return FALLBACK

    const style = getComputedStyle(this.#host)
    const probes = this.#host.renderRoot?.querySelectorAll<HTMLElement>('.theme-probe > i')
    // Before the first render there are no probes; the fallback keeps the first paint sane and the
    // controller is invalidated again once the shadow root exists.
    if (!probes || probes.length < PROBE_COLORS.length) return FALLBACK

    const at = (name: (typeof PROBE_COLORS)[number], fallback: string): string => {
      const index = PROBE_COLORS.indexOf(name)
      const probe = probes[index]
      const value = probe ? getComputedStyle(probe).color : ''
      return value || fallback
    }
    const scalar = (name: string, fallback: number): number => {
      const value = parseFloat(style.getPropertyValue(name))
      return Number.isFinite(value) ? value : fallback
    }

    return {
      palette: PROBE_COLORS.slice(0, PALETTE_SIZE).map((name, index) => at(name, FALLBACK.palette[index])),
      color: at('text', FALLBACK.color),
      mutedColor: at('muted', FALLBACK.mutedColor),
      axisColor: at('axis', FALLBACK.axisColor),
      gridColor: at('grid', FALLBACK.gridColor),
      surface: at('surface', FALLBACK.surface),
      tooltipBackground: at('tooltip-background', FALLBACK.tooltipBackground),
      tooltipColor: at('tooltip-text', FALLBACK.tooltipColor),
      crosshairColor: at('crosshair', FALLBACK.crosshairColor),
      positive: at('positive', FALLBACK.positive),
      negative: at('negative', FALLBACK.negative),
      fontFamily: style.getPropertyValue('--c2-chart--font-family').trim() || FALLBACK.fontFamily,
      fontSize: scalar('--c2-chart--font-size', FALLBACK.fontSize),
      lineWidth: scalar('--c2-chart__line--width', FALLBACK.lineWidth),
      pointRadius: scalar('--c2-chart__point--radius', FALLBACK.pointRadius),
    }
  }
}
