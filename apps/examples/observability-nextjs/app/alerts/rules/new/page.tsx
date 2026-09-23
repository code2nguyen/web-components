import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AlertRuleForm } from '../../../../features/alerts/AlertRuleForm'

export const metadata: Metadata = {
  title: 'Create alert rule',
  description: 'Create or edit a locally persisted rule using fixed synthetic notification destinations.',
}

export default function NewAlertRulePage() {
  return (
    <Suspense fallback={<c2-status-panel status="info" heading="Preparing rule editor" description="Loading deterministic alert context." />}>
      <AlertRuleForm />
    </Suspense>
  )
}
