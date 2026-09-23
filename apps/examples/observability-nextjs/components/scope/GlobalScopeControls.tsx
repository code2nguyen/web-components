'use client'

import type { ButtonGroup } from '@c2n/button-group'
import type { DateInput } from '@c2n/date-input'
import type { Select } from '@c2n/select'
import type { ThemeSelect } from '@c2n/theme-select'
import { useEffect, useRef, useState } from 'react'
import { useReplay } from '@/providers/ReplayProvider'
import { ENVIRONMENT_IDS, RELATIVE_RANGES, useScope, type EnvironmentId, type RelativeRange } from '@/providers/ScopeProvider'
import { useAppContext, type ThemePreference } from '@/providers/AppProviders'
import { useCustomEvent } from '@/components/c2n/useCustomEvent'
import { useElementProperties } from '@/components/c2n/element-bindings'
import { DEFAULT_REPLAY_MAX_TICK } from '@/lib/replay/replay-clock'

const ENVIRONMENT_LABELS: Record<EnvironmentId, string> = { production: 'Production', staging: 'Staging' }
const RANGE_LABELS: Record<RelativeRange, string> = { '30m': 'Last 30 minutes', '2h': 'Last 2 hours', '24h': 'Last 24 hours' }

function datePart(value: string): string {
  return value.slice(0, 10)
}

export function GlobalScopeControls({ navigationOpen, onNavigationToggle }: Readonly<{ navigationOpen: boolean; onNavigationToggle: () => void }>) {
  const { scope, setEnvironment, setRelativeRange, setAbsoluteRange } = useScope()
  const replay = useReplay()
  const { theme, setTheme, announce } = useAppContext()
  const environmentRef = useRef<Select>(null)
  const rangeRef = useRef<Select>(null)
  const modeRef = useRef<ButtonGroup>(null)
  const fromRef = useRef<DateInput>(null)
  const toRef = useRef<DateInput>(null)
  const themeRef = useRef<ThemeSelect>(null)
  const [rangeMode, setRangeMode] = useState<'relative' | 'absolute'>(scope.range.kind)
  const [from, setFrom] = useState(scope.range.kind === 'absolute' ? datePart(scope.range.from) : '2026-08-16')
  const [to, setTo] = useState(scope.range.kind === 'absolute' ? datePart(scope.range.to) : '2026-08-17')
  const replayComplete = replay.tick >= DEFAULT_REPLAY_MAX_TICK

  useEffect(() => setRangeMode(scope.range.kind), [scope.range.kind])
  useElementProperties(environmentRef, 'c2-select', { value: [scope.environmentId] }, [scope.environmentId])
  useElementProperties(rangeRef, 'c2-select', { value: [scope.range.kind === 'relative' ? scope.range.value : '2h'] }, [scope.range])
  useElementProperties(modeRef, 'c2-button-group', { value: rangeMode === 'absolute' ? '1' : '0' }, [rangeMode])
  useElementProperties(themeRef, 'c2-theme-select', { modes: ['system', 'light', 'dark'], value: theme }, [theme])

  useCustomEvent(environmentRef, 'selection-change', (event) => {
    const value = event.detail.value[0]
    if (ENVIRONMENT_IDS.some((candidate) => candidate === value)) {
      setEnvironment(value as EnvironmentId)
      announce(`Environment changed to ${ENVIRONMENT_LABELS[value as EnvironmentId]}.`)
    }
  })

  useCustomEvent(rangeRef, 'selection-change', (event) => {
    const value = event.detail.value[0]
    if (RELATIVE_RANGES.some((candidate) => candidate === value)) {
      setRelativeRange(value as RelativeRange)
      announce(`Time range changed to ${RANGE_LABELS[value as RelativeRange]}.`)
    }
  })

  useCustomEvent(modeRef, 'change', (event) => {
    const nextMode = event.detail.value === '1' ? 'absolute' : 'relative'
    setRangeMode(nextMode)
    if (nextMode === 'relative') setRelativeRange(scope.range.kind === 'relative' ? scope.range.value : '2h')
  })

  useCustomEvent(fromRef, 'input', () => setFrom(fromRef.current?.value ?? ''))
  useCustomEvent(toRef, 'input', () => setTo(toRef.current?.value ?? ''))
  useCustomEvent(themeRef, 'theme-change', (event) => {
    const value = event.detail.value
    if (value === 'system' || value === 'light' || value === 'dark') {
      setTheme(value as ThemePreference)
      announce(`Theme changed to ${value}.`)
    }
  })

  const applyAbsoluteRange = () => {
    const accepted = setAbsoluteRange(`${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`)
    announce(accepted ? `Absolute range applied from ${from} to ${to}.` : 'The end date must be after the start date.')
  }

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
        <c2-button-group ref={modeRef} selection="single" appearance="segmented" size="s" aria-label="Time range mode">
          <c2-button selected={rangeMode === 'relative'}>Relative</c2-button>
          <c2-button selected={rangeMode === 'absolute'}>Absolute</c2-button>
        </c2-button-group>
        {rangeMode === 'relative' ? (
          <c2-select ref={rangeRef} aria-label="Relative time range" placeholder="Time range">
            {RELATIVE_RANGES.map((range) => (
              <c2-list-item key={range} value={range} selected={scope.range.kind === 'relative' && scope.range.value === range}>
                {RANGE_LABELS[range]}
              </c2-list-item>
            ))}
          </c2-select>
        ) : (
          <div className="absolute-range">
            <c2-date-input ref={fromRef} aria-label="Start date" value={from} max={to} />
            <span aria-hidden="true">–</span>
            <c2-date-input ref={toRef} aria-label="End date" value={to} min={from} />
            <c2-button onClick={applyAbsoluteRange}>Apply</c2-button>
          </div>
        )}
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
