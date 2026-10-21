'use client'

import type { Select } from '@c2n/components/select'
import type { ThemeSelect } from '@c2n/components/theme-select'
import type { TimeRangePicker, TimeRangePreset } from '@c2n/components/time-range-picker'
import { useRef } from 'react'
import { useReplay } from '@/providers/ReplayProvider'
import { ENVIRONMENT_IDS, RELATIVE_RANGES, useScope, type EnvironmentId, type InvestigationRange, type RelativeRange } from '@/providers/ScopeProvider'
import { useAppContext, type ThemePreference } from '@/providers/AppProviders'
import { useCustomEvent } from '@/components/c2n/useCustomEvent'
import { useElementProperties } from '@/components/c2n/element-bindings'
import { DEFAULT_REPLAY_MAX_TICK } from '@/lib/replay/replay-clock'

const ENVIRONMENT_LABELS: Record<EnvironmentId, string> = { production: 'Production', staging: 'Staging' }
const RANGE_LABELS: Record<RelativeRange, string> = { '30m': 'Last 30 minutes', '2h': 'Last 2 hours', '24h': 'Last 24 hours' }
const RANGE_PRESETS: TimeRangePreset[] = RELATIVE_RANGES.map((range) => ({ from: `now-${range}`, to: 'now', label: RANGE_LABELS[range] }))
const DAY_START = 'T00:00:00.000Z'
const DAY_END = 'T23:59:59.999Z'

/** The picker's ends for a scope range: whole UTC days as dates, so the trigger reads "Aug 16 → Aug 17". */
function pickerRange(range: InvestigationRange): { from: string; to: string } {
  if (range.kind === 'relative') return { from: `now-${range.value}`, to: 'now' }
  if (range.from.endsWith(DAY_START) && range.to.endsWith(DAY_END)) return { from: range.from.slice(0, 10), to: range.to.slice(0, 10) }
  return { from: range.from, to: range.to }
}

// The picker only applies ends it could read, so a date-shaped end here is a real date. (The module is not imported
// at runtime: elements are registered on the client by C2Registry, and this file also renders on the server.)
const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

export function GlobalScopeControls({ navigationOpen, onNavigationToggle }: Readonly<{ navigationOpen: boolean; onNavigationToggle: () => void }>) {
  const { scope, setEnvironment, setRelativeRange, setAbsoluteRange } = useScope()
  const replay = useReplay()
  const { theme, setTheme, announce } = useAppContext()
  const environmentRef = useRef<Select>(null)
  const rangeRef = useRef<TimeRangePicker>(null)
  const themeRef = useRef<ThemeSelect>(null)
  const replayComplete = replay.tick >= DEFAULT_REPLAY_MAX_TICK
  const range = pickerRange(scope.range)

  useElementProperties(environmentRef, 'c2-select', { value: [scope.environmentId] }, [scope.environmentId])
  useElementProperties(rangeRef, 'c2-time-range-picker', { presets: RANGE_PRESETS, from: range.from, to: range.to }, [range.from, range.to])
  useElementProperties(themeRef, 'c2-theme-select', { modes: ['system', 'light', 'dark'], value: theme }, [theme])

  useCustomEvent(environmentRef, 'selection-change', (event) => {
    const value = event.detail.value[0]
    if (ENVIRONMENT_IDS.some((candidate) => candidate === value)) {
      setEnvironment(value as EnvironmentId)
      announce(`Environment changed to ${ENVIRONMENT_LABELS[value as EnvironmentId]}.`)
    }
  })

  useCustomEvent(rangeRef, 'change', (event) => {
    const { from, to } = event.detail
    const relative = RELATIVE_RANGES.find((candidate) => from === `now-${candidate}` && to === 'now')
    if (relative) {
      setRelativeRange(relative)
      announce(`Time range changed to ${RANGE_LABELS[relative]}.`)
      return
    }
    // Any other range (a typed span, a shift, two calendar days) is pinned to the instants it covers now.
    const resolved = rangeRef.current?.resolve()
    if (!resolved) return
    const start = isDateOnly(from) ? `${from}${DAY_START}` : resolved.from.toISOString()
    const end = isDateOnly(to) ? `${to}${DAY_END}` : resolved.to.toISOString()
    if (setAbsoluteRange(start, end)) {
      announce(`Absolute range applied from ${start.slice(0, 16)} to ${end.slice(0, 16)} UTC.`)
      return
    }
    // The scope kept its range, so the picker goes back to showing it.
    Object.assign(event.currentTarget as TimeRangePicker, pickerRange(scope.range))
    announce('The end must be after the start.')
  })

  useCustomEvent(themeRef, 'theme-change', (event) => {
    const value = event.detail.value
    if (value === 'system' || value === 'light' || value === 'dark') {
      setTheme(value as ThemePreference)
      announce(`Theme changed to ${value}.`)
    }
  })

  return (
    <section className="global-scope" aria-label="Global investigation controls">
      <c2-icon-button
        className="scope-navigation-toggle"
        aria-label={navigationOpen ? 'Close navigation' : 'Open navigation'}
        tooltip={navigationOpen ? 'Close navigation' : 'Open navigation'}
        selected={navigationOpen}
        toggle
        onClick={onNavigationToggle}
      >
        {navigationOpen ? <c2-feather-x /> : <c2-feather-menu />}
      </c2-icon-button>

      <div className="scope-field scope-environment">
        <span className="scope-label">Environment</span>
        <c2-select ref={environmentRef} aria-label="Environment" placeholder="Environment">
          {ENVIRONMENT_IDS.map((environment) => (
            <c2-list-item key={environment} value={environment} selected={environment === scope.environmentId}>
              {ENVIRONMENT_LABELS[environment]}
            </c2-list-item>
          ))}
        </c2-select>
      </div>

      <div className="scope-field scope-time">
        <span className="scope-label">Time</span>
        <c2-time-range-picker ref={rangeRef} aria-label="Time range" time-zone="UTC" nav />
      </div>

      <div className="replay-controls" aria-label="Deterministic replay">
        <span className="scope-label">Replay</span>
        <c2-button-group appearance="joined" size="s" aria-label="Replay controls">
          <c2-button disabled={replayComplete} onClick={replay.status === 'playing' ? replay.pause : replay.play}>
            {replay.status === 'playing' ? <c2-feather-pause slot="prefix-icon" /> : <c2-feather-play slot="prefix-icon" />}
            {replayComplete ? 'Complete' : replay.status === 'playing' ? 'Pause' : 'Play'}
          </c2-button>
          <c2-icon-button
            aria-label="Refresh replay from baseline"
            tooltip="Refresh replay from baseline"
            onClick={() => {
              replay.refresh()
              announce('Replay refreshed to the paused baseline.')
            }}
          >
            <c2-feather-refresh-cw />
          </c2-icon-button>
        </c2-button-group>
        <span className="replay-status" data-status={replay.status}>
          {replayComplete ? 'Complete' : replay.status === 'playing' ? 'Playing' : 'Paused'} · tick {replay.tick}
        </span>
      </div>

      <div className="scope-theme">
        <span className="scope-label">Theme</span>
        <c2-theme-select ref={themeRef} manual show-label aria-label="Color theme" />
      </div>

      <p className="synthetic-disclosure">Synthetic telemetry · deterministic local replay · no external data</p>
    </section>
  )
}
