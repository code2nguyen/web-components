'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { telemetryDataset } from '../../lib/data/dataset'
import type { AlertRule } from '../../lib/domain/telemetry'
import { createAlertStore, type AlertSaveResult } from './alert-store'
import type { AlertRuleDraft } from './alert-rules'

export function useAlertStore() {
  const storeRef = useRef<ReturnType<typeof createAlertStore> | null>(null)
  storeRef.current ??= createAlertStore(telemetryDataset)
  const store = storeRef.current
  const [rules, setRules] = useState<AlertRule[]>(() => store.effectiveRules())

  useEffect(() => {
    store.hydrate()
    setRules(store.effectiveRules())
  }, [store])

  const save = useCallback(
    (draft: AlertRuleDraft, editingRuleId?: string): AlertSaveResult => {
      const result = store.save(draft, editingRuleId)
      setRules(store.effectiveRules())
      return result
    },
    [store],
  )
  const setEnabled = useCallback(
    (id: string, enabled: boolean) => {
      const result = store.setEnabled(id, enabled)
      setRules(store.effectiveRules())
      return result
    },
    [store],
  )
  const reset = useCallback(() => {
    const persisted = store.reset()
    setRules(store.effectiveRules())
    return persisted
  }, [store])

  return { rules, save, setEnabled, reset }
}
