'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { telemetryDataset } from '../../lib/data/dataset'
import type { AlertRule } from '../../lib/domain/telemetry'
import { useCustomEvent } from '../../components/c2n/useCustomEvent'
import { useElementProperties } from '../../components/c2n/element-bindings'
import { useAppContext } from '../../providers/AppProviders'
import { useScope } from '../../providers/ScopeProvider'
import { parseReturnContext, scopeSearchParams } from '../../lib/query/navigation-state'
import { parseDetailReturnContext } from '../../lib/query/internal-href'
import {
  ALERT_EVALUATION_WINDOWS,
  createAlertRuleDraft,
  previewAlertRule,
  validateAlertRuleDraft,
  type AlertRuleDraft,
  type AlertRuleErrors,
  type AlertRuleField,
} from './alert-rules'
import { AlertRulePreview } from './AlertRulePreview'
import { useAlertStore } from './useAlertStore'
import styles from './alerts.module.css'

interface AlertRuleFormProps {
  initialRule?: AlertRule
}

export function AlertRuleForm({ initialRule }: Readonly<AlertRuleFormProps>) {
  const router = useRouter()
  const { announce } = useAppContext()
  const { scope } = useScope()
  const store = useAlertStore()
  const [localRuleId, setLocalRuleId] = useState<string | undefined>()
  const localRule = localRuleId ? store.rules.find(({ id }) => id === localRuleId) : undefined
  const editingRule = initialRule ?? localRule
  const editingRuleId = initialRule?.id ?? localRuleId
  const [draft, setDraft] = useState<AlertRuleDraft>(() => createAlertRuleDraft(initialRule))
  const [errors, setErrors] = useState<AlertRuleErrors>({})
  const [previewed, setPreviewed] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [originHref, setOriginHref] = useState('')
  const loadedRuleRef = useRef(initialRule?.id)
  const nameRef = useRef<HTMLElementTagNameMap['c2-text-field']>(null)
  const ownerRef = useRef<HTMLElementTagNameMap['c2-text-field']>(null)
  const signalRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const operatorRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const thresholdRef = useRef<HTMLElementTagNameMap['c2-number-input']>(null)
  const windowRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const severityRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const enabledRef = useRef<HTMLElementTagNameMap['c2-switch']>(null)
  const serviceRefs = useRef(new Map<string, HTMLElementTagNameMap['c2-checkbox']>())
  const destinationRefs = useRef(new Map<string, HTMLElementTagNameMap['c2-checkbox']>())
  const scopedServices = useMemo(
    () => telemetryDataset.services.filter(({ environmentId, id }) => environmentId === scope.environmentId || draft.serviceIds.includes(id)),
    [draft.serviceIds, scope.environmentId],
  )

  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    if (!initialRule) setLocalRuleId(search.get('edit') ?? undefined)
    setOriginHref(parseDetailReturnContext(search) ?? parseReturnContext(search, ['/alerts', '/alerts/']) ?? '')
  }, [initialRule])

  useEffect(() => {
    if (editingRule && loadedRuleRef.current !== editingRule.id) {
      loadedRuleRef.current = editingRule.id
      setDraft(createAlertRuleDraft(editingRule))
    }
  }, [editingRule])

  const setField = <Key extends AlertRuleField>(field: Key, value: AlertRuleDraft[Key]) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setPreviewed(false)
  }
  useCustomEvent(nameRef, 'input', () => setField('name', nameRef.current?.value ?? ''))
  useCustomEvent(ownerRef, 'input', () => setField('owner', ownerRef.current?.value ?? ''))
  useCustomEvent(signalRef, 'selection-change', (event) => setField('signal', (event.detail.value[0] ?? 'latency') as AlertRuleDraft['signal']))
  useCustomEvent(operatorRef, 'selection-change', (event) => setField('operator', event.detail.value[0] === 'below' ? 'below' : 'above'))
  useCustomEvent(thresholdRef, 'input', () => setField('threshold', thresholdRef.current?.valueAsNumber ?? Number.NaN))
  useCustomEvent(windowRef, 'selection-change', (event) => setField('evaluationWindowMinutes', Number(event.detail.value[0])))
  useCustomEvent(severityRef, 'selection-change', (event) => setField('severity', (event.detail.value[0] ?? '') as AlertRuleDraft['severity']))
  useCustomEvent(enabledRef, 'change', () => setField('enabled', enabledRef.current?.checked ?? false))

  useElementProperties(signalRef, 'c2-select', { value: [draft.signal] }, [draft.signal])
  useElementProperties(operatorRef, 'c2-select', { value: [draft.operator] }, [draft.operator])
  useElementProperties(windowRef, 'c2-select', { value: [String(draft.evaluationWindowMinutes)] }, [draft.evaluationWindowMinutes])
  useElementProperties(severityRef, 'c2-select', { value: draft.severity ? [draft.severity] : [] }, [draft.severity])
  useElementProperties(enabledRef, 'c2-switch', { checked: draft.enabled === true }, [draft.enabled])

  const focusFirstError = (field: AlertRuleField | null) => {
    if (!field) return
    const elements: Partial<Record<AlertRuleField, HTMLElement | null>> = {
      name: nameRef.current,
      signal: signalRef.current,
      operator: operatorRef.current,
      threshold: thresholdRef.current,
      evaluationWindowMinutes: windowRef.current,
      severity: severityRef.current,
      owner: ownerRef.current,
      enabled: enabledRef.current,
      serviceIds: serviceRefs.current.values().next().value ?? null,
      destinationIds: destinationRefs.current.values().next().value ?? null,
    }
    elements[field]?.focus()
  }

  const validate = () => {
    const result = validateAlertRuleDraft(draft, {
      services: telemetryDataset.services,
      destinations: telemetryDataset.destinations,
      rules: store.rules,
      editingRuleId,
    })
    setErrors(result.errors)
    if (!result.valid) {
      setFeedback('Fix all highlighted fields. Your valid input has been preserved.')
      announce('Alert rule has validation errors. Focus moved to the first invalid field.')
      window.requestAnimationFrame(() => focusFirstError(result.firstInvalidField))
    }
    return result
  }

  const preview = useMemo(() => previewAlertRule(draft, telemetryDataset), [draft])
  const handlePreview = () => {
    if (!validate().valid) return
    setPreviewed(true)
    setFeedback('Preview calculated from deterministic synthetic history.')
    announce('Historical threshold preview updated.')
  }
  const handleSave = () => {
    if (!validate().valid) return
    const result = store.save(draft, editingRuleId)
    setErrors(result.validation.errors)
    setFeedback(result.message)
    announce(result.message)
    if (result.rule && result.persisted) window.setTimeout(() => router.push(alertsHref()), 350)
  }

  const alertsHref = () => {
    if (originHref) return originHref
    const params = scopeSearchParams({ environmentId: scope.environmentId, range: scope.range })
    return `/alerts/${params.size ? `?${params}` : ''}`
  }

  if (localRuleId && !editingRule) {
    return (
      <c2-status-panel status="error" heading="Alert rule not found" description="The local rule may have been reset or its stored record was invalid.">
        <c2-button slot="actions" onClick={() => router.push(alertsHref())}>
          Return to alerts
        </c2-button>
      </c2-status-panel>
    )
  }

  const toggleListValue = (field: 'serviceIds' | 'destinationIds', id: string, checked: boolean) => {
    const values = new Set(draft[field])
    if (checked) values.add(id)
    else values.delete(id)
    setField(field, [...values])
  }

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>{editingRule ? 'Edit policy' : 'New policy'}</p>
        <h1>{editingRule ? `Edit ${editingRule.name}` : 'Create alert rule'}</h1>
        <p className={styles.lede}>
          Rules are evaluated only against local synthetic history. Destinations are fixed simulations; this form never accepts real addresses or credentials.
        </p>
      </header>

      {Object.keys(errors).length > 0 && (
        <section className={styles.errorSummary} role="alert" aria-labelledby="rule-errors-heading">
          <h2 id="rule-errors-heading">Fix these fields</h2>
          <ul>
            {Object.entries(errors)
              .filter(([, message]) => message)
              .map(([field, message]) => (
                <li key={field}>{message}</li>
              ))}
          </ul>
        </section>
      )}

      <form
        className={`${styles.panel} ${styles.form}`}
        onSubmit={(event) => {
          event.preventDefault()
          handleSave()
        }}
        noValidate
      >
        <div className={styles.formGrid}>
          <label className={styles.fieldWide}>
            <span>Rule name</span>
            <c2-text-field ref={nameRef} value={draft.name} required error={Boolean(errors.name)} error-text={errors.name ?? ''} aria-label="Rule name" />
          </label>
          <label className={styles.fieldWide}>
            <span>Owner</span>
            <c2-text-field ref={ownerRef} value={draft.owner} required error={Boolean(errors.owner)} error-text={errors.owner ?? ''} aria-label="Owner" />
          </label>
          <label className={styles.field}>
            <span>Signal</span>
            <c2-select ref={signalRef} aria-label="Signal" required>
              <c2-list-item value="latency">Latency</c2-list-item>
              <c2-list-item value="error-rate">Error rate</c2-list-item>
              <c2-list-item value="throughput">Throughput</c2-list-item>
              <c2-list-item value="saturation">Saturation</c2-list-item>
            </c2-select>
            {errors.signal && <p className={styles.errorText}>{errors.signal}</p>}
          </label>
          <label className={styles.field}>
            <span>Condition</span>
            <c2-select ref={operatorRef} aria-label="Condition">
              <c2-list-item value="above">Above</c2-list-item>
              <c2-list-item value="below">Below</c2-list-item>
            </c2-select>
          </label>
          <label className={styles.field}>
            <span>Threshold</span>
            <c2-number-input
              ref={thresholdRef}
              value={String(draft.threshold)}
              min={0}
              step="any"
              required
              error={Boolean(errors.threshold)}
              error-text={errors.threshold ?? ''}
              aria-label="Threshold"
            />
          </label>
          <label className={styles.field}>
            <span>Evaluation window</span>
            <c2-select ref={windowRef} aria-label="Evaluation window" required>
              {ALERT_EVALUATION_WINDOWS.map((minutes) => (
                <c2-list-item key={minutes} value={String(minutes)}>
                  {minutes} minutes
                </c2-list-item>
              ))}
            </c2-select>
            {errors.evaluationWindowMinutes && <p className={styles.errorText}>{errors.evaluationWindowMinutes}</p>}
          </label>
          <label className={styles.field}>
            <span>Severity</span>
            <c2-select ref={severityRef} aria-label="Severity" required>
              <c2-list-item value="warning">Warning</c2-list-item>
              <c2-list-item value="critical">Critical</c2-list-item>
            </c2-select>
            {errors.severity && <p className={styles.errorText}>{errors.severity}</p>}
          </label>
          <label className={styles.field}>
            <span>Rule state</span>
            <c2-switch ref={enabledRef} checked={draft.enabled === true} label="Enabled" />
            {errors.enabled && <p className={styles.errorText}>{errors.enabled}</p>}
          </label>
        </div>

        <fieldset className={styles.choiceField}>
          <legend>Services</legend>
          <div className={styles.choiceGrid}>
            {scopedServices.map((service) => (
              <label className={styles.choiceCard} key={service.id}>
                <c2-checkbox
                  ref={(element) => {
                    if (element) serviceRefs.current.set(service.id, element)
                    else serviceRefs.current.delete(service.id)
                  }}
                  checked={draft.serviceIds.includes(service.id)}
                  onClick={() => toggleListValue('serviceIds', service.id, !draft.serviceIds.includes(service.id))}
                  aria-label={`Monitor ${service.name}`}
                />
                <strong>{service.name}</strong>
                <small>{service.owner}</small>
              </label>
            ))}
          </div>
          {errors.serviceIds && <p className={styles.errorText}>{errors.serviceIds}</p>}
        </fieldset>

        <fieldset className={styles.choiceField}>
          <legend>Synthetic notification destinations</legend>
          <p className={styles.help}>These fixed presets simulate delivery locally. No real address, endpoint, or credential is accepted or retained.</p>
          <div className={styles.choiceGrid}>
            {telemetryDataset.destinations.map((destination) => (
              <label className={styles.choiceCard} key={destination.id}>
                <c2-checkbox
                  ref={(element) => {
                    if (element) destinationRefs.current.set(destination.id, element)
                    else destinationRefs.current.delete(destination.id)
                  }}
                  checked={draft.destinationIds.includes(destination.id)}
                  onClick={() => toggleListValue('destinationIds', destination.id, !draft.destinationIds.includes(destination.id))}
                  aria-label={`Notify ${destination.label}`}
                />
                <strong>{destination.label}</strong>
                <small>{destination.description}</small>
              </label>
            ))}
          </div>
          {errors.destinationIds && <p className={styles.errorText}>{errors.destinationIds}</p>}
        </fieldset>

        {feedback && (
          <c2-toast variant={errors && Object.keys(errors).length ? 'warning' : 'info'} message={feedback} heading="Alert rule status" dismissible />
        )}

        <div className={styles.formActions}>
          <c2-button onClick={() => router.push(alertsHref())}>Cancel</c2-button>
          <c2-button onClick={handlePreview}>Preview historical data</c2-button>
          <c2-button onClick={handleSave}>Save alert rule</c2-button>
        </div>
      </form>

      {previewed && <AlertRulePreview preview={preview} />}
    </div>
  )
}
