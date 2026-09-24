'use client'

import { useMemo, useRef } from 'react'
import type { MetricSeries } from '../../lib/domain/telemetry'
import { useElementProperties } from '../../components/c2n/element-bindings'

export function ServiceMetrics({ metrics }: Readonly<{ metrics: readonly MetricSeries[] }>) {
  const latency = metrics.find(({ metric }) => metric === 'latency-p95')
  const errors = metrics.find(({ metric }) => metric === 'error-rate')
  const chartRef = useRef<HTMLElementTagNameMap['c2-line-chart']>(null)
  const data = useMemo(
    () =>
      (latency?.points ?? []).map((point, index) => ({
        time: point.offsetMs,
        latency: point.value,
        errors: errors?.points[index]?.value ?? null,
      })),
    [errors, latency],
  )
  useElementProperties(chartRef, 'c2-line-chart', { data }, [data])
  if (!latency) return <c2-status-panel status="neutral" heading="Metrics unavailable" description="No service time series matched this snapshot." />
  const validLatency = latency.points.flatMap(({ value }) => (value === null ? [] : [value]))
  const validErrors = (errors?.points ?? []).flatMap(({ value }) => (value === null ? [] : [value]))
  return (
    <section aria-labelledby="service-metrics-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Last two hours</p>
          <h2 id="service-metrics-heading">Latency and error trend</h2>
        </div>
      </div>
      <c2-line-chart
        ref={chartRef}
        x-field="time"
        x-type="time"
        axes="both"
        grid="y"
        legend="bottom"
        tooltip="axis"
        aria-label="Service latency and error rate trend"
      >
        <c2-chart-series field="latency" label="p95 latency (ms)" />
        <c2-chart-series field="errors" label="Error rate (%)" axis="right" />
      </c2-line-chart>
      <p className="chart-summary">
        Text summary: p95 latency ranges from {Math.min(...validLatency).toFixed(0)} to {Math.max(...validLatency).toFixed(0)} milliseconds; error rate ranges
        from {Math.min(...validErrors).toFixed(2)} to {Math.max(...validErrors).toFixed(2)} percent.
      </p>
    </section>
  )
}
