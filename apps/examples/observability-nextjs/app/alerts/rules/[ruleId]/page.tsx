import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { telemetryDataset } from '../../../../lib/data/dataset'
import { AlertRuleForm } from '../../../../features/alerts/AlertRuleForm'

interface AlertRulePageProps {
  params: Promise<{ ruleId: string }>
}

export function generateStaticParams() {
  return telemetryDataset.alertRules.map(({ id: ruleId }) => ({ ruleId }))
}

export async function generateMetadata({ params }: AlertRulePageProps): Promise<Metadata> {
  const { ruleId } = await params
  const rule = telemetryDataset.alertRules.find(({ id }) => id === ruleId)
  return { title: rule ? `Edit ${rule.name}` : 'Alert rule not found' }
}

export default async function AlertRulePage({ params }: AlertRulePageProps) {
  const { ruleId } = await params
  const rule = telemetryDataset.alertRules.find(({ id }) => id === ruleId)
  if (!rule) notFound()
  return (
    <Suspense fallback={<c2-status-panel status="info" heading="Preparing rule editor" description="Loading deterministic alert context." />}>
      <AlertRuleForm initialRule={rule} />
    </Suspense>
  )
}
