'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useElementProperties } from '../../components/c2n/element-bindings'
import { useCustomEvent } from '../../components/c2n/useCustomEvent'
import { useDemoState } from '../../providers/DemoStateProvider'
import { useAppContext } from '../../providers/AppProviders'
import { useScope } from '../../providers/ScopeProvider'
import { useReplay } from '../../providers/ReplayProvider'
import type { TelemetryDataset } from '../../lib/domain/telemetry'
import { scopeSearchParams } from '../../lib/query/navigation-state'
import { AlertActions } from './AlertActions'
import { useAlertStore } from './useAlertStore'
import { projectAlertScope } from './alert-scope'
import styles from './alerts.module.css'

type AlertsView = 'rules' | 'incidents'

function labelForService(dataset: TelemetryDataset, id: string): string {
  return dataset.services.find((service) => service.id === id)?.name ?? id
}

export function AlertsWorkspace({ dataset }: Readonly<{ dataset: TelemetryDataset }>) {
  const router = useRouter()
  const [searchString, setSearchString] = useState('')
  const search = useMemo(() => new URLSearchParams(searchString), [searchString])
  const { demoState, setDemoState } = useDemoState()
  const { announce } = useAppContext()
  const { scope } = useScope()
  const replay = useReplay()
  const { rules, setEnabled, reset } = useAlertStore()
  const tabsRef = useRef<HTMLElementTagNameMap['c2-tabs']>(null)
  const stateRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const severityRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const serviceRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const ownerRef = useRef<HTMLElementTagNameMap['c2-text-field']>(null)
  const demoRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const rulesTableRef = useRef<HTMLElementTagNameMap['c2-table']>(null)
  const incidentsTableRef = useRef<HTMLElementTagNameMap['c2-table']>(null)
  const view: AlertsView = search.get('view') === 'incidents' ? 'incidents' : 'rules'
  const collectionHref = `/alerts/${search.size ? `?${search}` : ''}`
  const ruleHref = (id?: string) => {
    const params = scopeSearchParams({ environmentId: scope.environmentId, range: scope.range })
    params.set('return', collectionHref)
    if (!id || id.startsWith('local-rule-')) {
      if (id) params.set('edit', id)
      return `/alerts/rules/new/?${params}`
    }
    return `/alerts/rules/${id}/?${params}`
  }
  const incidentHref = (id: string) => {
    const params = scopeSearchParams({ environmentId: scope.environmentId, range: scope.range })
    params.set('return', collectionHref)
    return `/incidents/${id}/?${params}`
  }

  useEffect(() => {
    const baseline = document.getElementById('alerts-server-baseline')
    if (baseline) baseline.hidden = true
    const synchronize = () => setSearchString(window.location.search.slice(1))
    synchronize()
    window.addEventListener('popstate', synchronize)
    return () => window.removeEventListener('popstate', synchronize)
  }, [scope.environmentId, scope.range])

  const update = (changes: Record<string, string>) => {
    const parameters = new URLSearchParams(search.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value) parameters.set(key, value)
      else parameters.delete(key)
    }
    setSearchString(parameters.toString())
    router.replace(`/alerts/${parameters.size ? `?${parameters.toString()}` : ''}`, { scroll: false })
  }

  useElementProperties(tabsRef, 'c2-tabs', { selectedTab: view }, [view])
  useCustomEvent(tabsRef, 'selection-change', (event) => update({ view: event.detail.value === 'incidents' ? 'incidents' : '' }))
  useCustomEvent(stateRef, 'selection-change', (event) => update({ state: event.detail.value[0] ?? '' }))
  useCustomEvent(severityRef, 'selection-change', (event) => update({ severity: event.detail.value[0] ?? '' }))
  useCustomEvent(serviceRef, 'selection-change', (event) => update({ service: event.detail.value[0] ?? '' }))
  useCustomEvent(ownerRef, 'input', () => update({ owner: ownerRef.current?.value.trim() ?? '' }))
  useCustomEvent(demoRef, 'selection-change', (event) => {
    const state = event.detail.value[0]
    if (state === 'normal' || state === 'loading' || state === 'empty' || state === 'error') setDemoState(state)
  })

  const filters = {
    state: search.get('state') ?? '',
    severity: search.get('severity') ?? '',
    service: search.get('service') ?? '',
    owner: (search.get('owner') ?? '').toLocaleLowerCase(),
  }
  const snapshot = useMemo(
    () => ({ baselineInstant: dataset.baselineInstant, tick: replay.tick, status: replay.status, stepMs: replay.stepMs }),
    [dataset.baselineInstant, replay.status, replay.stepMs, replay.tick],
  )
  const scoped = useMemo(() => projectAlertScope(dataset, rules, snapshot, scope), [dataset, rules, scope, snapshot])
  const scopedServices = scoped.services
  const filteredRules = useMemo(
    () =>
      scoped.rules.filter(
        (rule) =>
          (!filters.state || (filters.state === 'enabled' ? rule.enabled : !rule.enabled)) &&
          (!filters.severity || rule.severity === filters.severity) &&
          (!filters.service || rule.serviceIds.includes(filters.service)) &&
          (!filters.owner || rule.owner.toLocaleLowerCase().includes(filters.owner)),
      ),
    [filters.owner, filters.service, filters.severity, filters.state, scoped.rules],
  )
  const filteredIncidents = useMemo(
    () =>
      scoped.incidents.filter(
        (incident) =>
          (!filters.state || incident.state === filters.state) &&
          (!filters.severity || incident.severity === filters.severity) &&
          (!filters.service || incident.serviceIds.includes(filters.service)) &&
          (!filters.owner || (incident.owner ?? '').toLocaleLowerCase().includes(filters.owner)),
      ),
    [filters.owner, filters.service, filters.severity, filters.state, scoped.incidents],
  )

  const ruleRows = useMemo(
    () =>
      filteredRules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        signal: rule.signal,
        severity: rule.severity,
        owner: rule.owner,
        state: rule.enabled ? 'Enabled' : 'Disabled',
        delivery: 'Synthetic destinations only',
      })),
    [filteredRules],
  )
  const incidentRows = useMemo(
    () =>
      filteredIncidents.map((incident) => ({
        id: incident.id,
        state: incident.state,
        severity: incident.severity,
        services: incident.serviceIds.map((id) => labelForService(dataset, id)).join(', '),
        owner: incident.owner ?? 'Unassigned',
      })),
    [dataset, filteredIncidents],
  )
  useElementProperties(
    rulesTableRef,
    'c2-table',
    {
      rows: ruleRows,
      rowKey: 'id',
      columns: [
        { field: 'name', header: 'Rule', minWidth: 230 },
        { field: 'signal', header: 'Signal', width: '120px' },
        { field: 'severity', header: 'Severity', width: '110px' },
        { field: 'owner', header: 'Owner', minWidth: 140 },
        { field: 'state', header: 'State', width: '100px' },
        { field: 'delivery', header: 'Delivery', minWidth: 180 },
      ],
    },
    [ruleRows],
  )
  useElementProperties(
    incidentsTableRef,
    'c2-table',
    {
      rows: incidentRows,
      rowKey: 'id',
      columns: [
        { field: 'id', header: 'Incident', minWidth: 150 },
        { field: 'state', header: 'State', width: '120px' },
        { field: 'severity', header: 'Severity', width: '110px' },
        { field: 'services', header: 'Affected services', minWidth: 220 },
        { field: 'owner', header: 'Owner', minWidth: 140 },
      ],
    },
    [incidentRows],
  )
  useCustomEvent(rulesTableRef, 'row-click', (event) => {
    const id = String((event.detail.row as { id: string }).id)
    router.push(ruleHref(id))
  })
  useCustomEvent(incidentsTableRef, 'row-click', (event) => {
    router.push(incidentHref(String((event.detail.row as { id: string }).id)))
  })

  const shownCount = view === 'rules' ? filteredRules.length : filteredIncidents.length

  return (
    <div className={styles.page}>
      <header className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Operational response</p>
          <h1>Alerts and incidents</h1>
          <p className={styles.lede}>
            Inspect alert policy, simulated delivery outcomes, and complete incident lifecycles without contacting an external system.
          </p>
        </div>
        <c2-button
          onClick={() => {
            router.push(ruleHref())
          }}
        >
          Create alert rule
        </c2-button>
      </header>

      <section className={styles.workspace} aria-label="Alert workspace">
        <c2-tabs ref={tabsRef} selected-tab={view} aria-label="Alert workspace views">
          <c2-tab for="rules" selected={view === 'rules'}>
            Rules
          </c2-tab>
          <c2-tab for="incidents" selected={view === 'incidents'}>
            Incidents
          </c2-tab>
          <div id="rules" aria-hidden={view !== 'rules'} />
          <div id="incidents" aria-hidden={view !== 'incidents'} />
        </c2-tabs>

        <div className={styles.filters} aria-label="Alert filters">
          <label className={styles.field}>
            <span>State</span>
            <c2-select ref={stateRef} aria-label="State" value={filters.state ? [filters.state] : []} placeholder="All states">
              <c2-list-item value="">All states</c2-list-item>
              {view === 'rules' ? (
                <>
                  <c2-list-item value="enabled">Enabled</c2-list-item>
                  <c2-list-item value="disabled">Disabled</c2-list-item>
                </>
              ) : (
                <>
                  <c2-list-item value="active">Active</c2-list-item>
                  <c2-list-item value="acknowledged">Acknowledged</c2-list-item>
                  <c2-list-item value="muted">Muted</c2-list-item>
                  <c2-list-item value="resolved">Resolved</c2-list-item>
                </>
              )}
            </c2-select>
          </label>
          <label className={styles.field}>
            <span>Severity</span>
            <c2-select ref={severityRef} aria-label="Severity" value={filters.severity ? [filters.severity] : []} placeholder="All severities">
              <c2-list-item value="">All severities</c2-list-item>
              <c2-list-item value="warning">Warning</c2-list-item>
              <c2-list-item value="critical">Critical</c2-list-item>
            </c2-select>
          </label>
          <label className={styles.field}>
            <span>Service</span>
            <c2-select ref={serviceRef} aria-label="Service" value={filters.service ? [filters.service] : []} placeholder="All services">
              <c2-list-item value="">All services</c2-list-item>
              {scopedServices.map((service) => (
                <c2-list-item key={service.id} value={service.id}>
                  {service.name}
                </c2-list-item>
              ))}
            </c2-select>
          </label>
          <label className={styles.field}>
            <span>Owner</span>
            <c2-text-field ref={ownerRef} aria-label="Owner" value={search.get('owner') ?? ''} placeholder="Filter owner" clearable />
          </label>
          <label className={styles.field}>
            <span>Demo state</span>
            <c2-select ref={demoRef} aria-label="Demo state" value={[demoState]}>
              <c2-list-item value="normal">Normal</c2-list-item>
              <c2-list-item value="loading">Loading</c2-list-item>
              <c2-list-item value="empty">Empty</c2-list-item>
              <c2-list-item value="error">Recoverable error</c2-list-item>
            </c2-select>
          </label>
        </div>

        <p role="status" aria-live="polite">
          {shownCount} {view === 'rules' ? 'rules' : 'incidents'} shown.
        </p>

        {demoState === 'loading' ? (
          <c2-status-panel status="info" heading="Loading synthetic alert data" description="The deterministic dataset will remain unchanged." />
        ) : demoState === 'error' ? (
          <c2-status-panel status="error" heading="Alert data could not be shown" description="This is a recoverable demonstration state.">
            <c2-button slot="actions" onClick={() => setDemoState('normal')}>
              Return to normal
            </c2-button>
          </c2-status-panel>
        ) : demoState === 'empty' ? (
          <c2-status-panel status="neutral" heading="No synthetic alert data" description="The active alert filters and investigation scope are unchanged.">
            <c2-button slot="actions" onClick={() => setDemoState('normal')}>
              Return to normal
            </c2-button>
          </c2-status-panel>
        ) : shownCount === 0 ? (
          <c2-status-panel status="neutral" heading="No matching alert data" description="Clear filters or return the demonstration to Normal.">
            <c2-button
              slot="actions"
              onClick={() => {
                setDemoState('normal')
                update({ state: '', severity: '', service: '', owner: '' })
              }}
            >
              Clear criteria
            </c2-button>
          </c2-status-panel>
        ) : view === 'rules' ? (
          <>
            <c2-table ref={rulesTableRef} aria-label="Alert rules" stripe empty-message="No alert rules match" />
            <div className={styles.rulesList} aria-label="Alert rule actions">
              {filteredRules.map((rule) => (
                <article className={styles.ruleRow} key={rule.id}>
                  <strong className={styles.rowTitle}>Actions for {rule.name}</strong>
                  <span>{rule.enabled ? 'Enabled' : 'Disabled'}</span>
                  <span>Delivery is simulated locally</span>
                  <div className={styles.actions}>
                    <c2-switch
                      checked={rule.enabled}
                      label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`}
                      onClick={() => {
                        const result = setEnabled(rule.id, !rule.enabled)
                        announce(result.message)
                      }}
                    />
                    <c2-button onClick={() => router.push(ruleHref(rule.id))}>Edit</c2-button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <>
            <c2-table ref={incidentsTableRef} aria-label="Incidents" stripe empty-message="No incidents match" />
            <div className={styles.incidentList} aria-label="Incident actions">
              {filteredIncidents.map((incident) => (
                <article className={styles.incidentRow} key={incident.id}>
                  <strong>{incident.id}</strong>
                  <span>{incident.state}</span>
                  <span>{incident.owner ?? 'Unassigned'}</span>
                  <c2-button onClick={() => router.push(incidentHref(incident.id))}>Open incident {incident.id}</c2-button>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <AlertActions onReset={reset} />
    </div>
  )
}
