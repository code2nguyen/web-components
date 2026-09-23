import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { telemetryDataset } from '../../../lib/data/dataset'
import { IncidentDetail } from '../../../features/alerts/IncidentDetail'

interface IncidentPageProps {
  params: Promise<{ incidentId: string }>
}

export function generateStaticParams() {
  return telemetryDataset.incidents.map(({ id: incidentId }) => ({ incidentId }))
}

export async function generateMetadata({ params }: IncidentPageProps): Promise<Metadata> {
  const { incidentId } = await params
  const incident = telemetryDataset.incidents.find(({ id }) => id === incidentId)
  return { title: incident ? `Incident ${incident.id}` : 'Incident not found' }
}

export default async function IncidentPage({ params }: IncidentPageProps) {
  const { incidentId } = await params
  const incident = telemetryDataset.incidents.find(({ id }) => id === incidentId)
  if (!incident) notFound()
  return <IncidentDetail incident={incident} dataset={telemetryDataset} />
}
