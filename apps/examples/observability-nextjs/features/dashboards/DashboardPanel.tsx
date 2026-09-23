'use client'

import type { AreaChart } from '@c2n/chart/area-chart.js'
import type { BarChart } from '@c2n/chart/bar-chart.js'
import type { LineChart } from '@c2n/chart/line-chart.js'
import type { Sparkline } from '@c2n/chart/sparkline.js'
import { useRef } from 'react'
import { useElementProperties } from '@/components/c2n/element-bindings'
import type { DemoState } from '@/providers/DemoStateProvider'
import type { DashboardProjection } from './dashboard-selectors'
import styles from './dashboard.module.css'

interface ChartViewProps {
  projection: DashboardProjection
  chart: 'line' | 'area' | 'bar'
}

function ChartView({ projection, chart }: ChartViewProps) {
  const lineRef = useRef<LineChart>(null)
  const areaRef = useRef<AreaChart>(null)
  const barRef = useRef<BarChart>(null)
  const data = projection.chartRows.map(({ offsetMs, value, label }) => ({ offsetMs, value, label }))
  const revision = Number(projection.updateKey.split(':')[2]) || 0
  useElementProperties(lineRef, 'c2-line-chart', { data, revision }, [data, revision])
  useElementProperties(areaRef, 'c2-area-chart', { data, revision }, [data, revision])
  useElementProperties(barRef, 'c2-bar-chart', { data, revision }, [data, revision])

  const series = <c2-chart-series field="value" label={`${projection.title} (${projection.unit})`} />
  const attributes = {
    'x-field': 'offsetMs',
    'x-type': projection.chartRows.some(({ label }) => label) ? ('category' as const) : ('linear' as const),
    'label-field': projection.chartRows.some(({ label }) => label) ? 'label' : '',
    legend: 'bottom' as const,
    tooltip: 'axis' as const,
    animation: 'auto' as const,
    'empty-message': 'No scoped values',
    'aria-label': `${projection.title} chart`,
  }

  return (
    <figure className={styles.chartFigure} aria-labelledby={`${projection.panelId}-title`} aria-describedby={`${projection.panelId}-summary`}>
      <div className={styles.chartCanvas} role="img" aria-label={`${projection.title}. ${projection.summary}`}>
        {chart === 'line' ? (
          <c2-line-chart ref={lineRef} {...attributes}>
            {series}
          </c2-line-chart>
        ) : chart === 'area' ? (
          <c2-area-chart ref={areaRef} {...attributes}>
            {series}
          </c2-area-chart>
        ) : (
          <c2-bar-chart ref={barRef} {...attributes}>
            {series}
          </c2-bar-chart>
        )}
      </div>
      <figcaption id={`${projection.panelId}-summary`} className={styles.chartSummary}>
        <strong>Text summary:</strong> {projection.summary}
      </figcaption>
      <div className={styles.dataAlternative} data-chart-alternative>
        <table>
          <caption>{projection.title} data</caption>
          <thead>
            <tr>
              <th scope="col">Point</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {projection.chartRows.slice(-8).map(({ offsetMs, value, label }) => (
              <tr key={`${offsetMs}-${label ?? ''}`}>
                <th scope="row">{label ?? `T${Math.round(offsetMs / 60_000)} min`}</th>
                <td>
                  {value.toLocaleString('en-US', { maximumFractionDigits: 2 })} {projection.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

function MiniTrend({ projection }: Readonly<{ projection: DashboardProjection }>) {
  const ref = useRef<Sparkline>(null)
  const values = projection.chartRows.map(({ value }) => value)
  useElementProperties(ref, 'c2-sparkline', { data: values, revision: Number(projection.updateKey.split(':')[2]) || 0 }, [projection.updateKey, values])
  return <c2-sparkline ref={ref} aria-label={`${projection.title} compact trend`} />
}

function NormalPanel({ projection }: Readonly<{ projection: DashboardProjection }>) {
  if (projection.kind === 'stat') {
    return (
      <div className={styles.statPanel}>
        <c2-stat
          value={projection.formattedValue}
          label={projection.title}
          tone={projection.panelId === 'incident-count' && (projection.value ?? 0) > 0 ? 'warning' : 'neutral'}
        >
          <span slot="description">{projection.summary}</span>
        </c2-stat>
        {projection.chartRows.length > 0 ? <MiniTrend projection={projection} /> : null}
      </div>
    )
  }
  if (projection.kind === 'ranked-table') {
    return (
      <div className={styles.ranking} data-chart-alternative>
        <p id={`${projection.panelId}-summary`}>
          <strong>Text summary:</strong> {projection.summary}
        </p>
        <ol>
          {projection.rankedRows.map((row) => (
            <li key={row.id}>
              <span>{row.label}</span>
              <strong>{row.formattedValue}</strong>
            </li>
          ))}
        </ol>
      </div>
    )
  }
  return <ChartView projection={projection} chart={projection.kind === 'line' ? 'line' : projection.kind === 'area' ? 'area' : 'bar'} />
}

export function DashboardPanel({ projection, demoState }: Readonly<{ projection: DashboardProjection; demoState: DemoState }>) {
  if (demoState === 'loading') {
    return (
      <div className={styles.panelState} aria-busy="true">
        <c2-skeleton variant="text" lines={4} label="Loading scoped panel data" />
        <span>Loading scoped panel data</span>
      </div>
    )
  }
  if (demoState === 'empty') {
    return (
      <c2-status-panel
        status="neutral"
        align="start"
        heading="No scoped values"
        description="Try another environment or time range. This state is synthetic."
      />
    )
  }
  if (demoState === 'error') {
    return (
      <c2-status-panel
        status="error"
        align="start"
        heading="Panel data unavailable"
        description="The recoverable demonstration error affects this panel only."
      />
    )
  }
  return <NormalPanel projection={projection} />
}
