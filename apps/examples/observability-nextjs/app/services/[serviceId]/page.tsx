import { notFound } from 'next/navigation'
import { telemetryDataset } from '../../../lib/data/dataset'
import { ServiceDetail } from '../../../features/services/ServiceDetail'

export function generateStaticParams() {
  return telemetryDataset.services.map(({ id }) => ({ serviceId: id }))
}

export default async function ServiceDetailPage({ params }: Readonly<{ params: Promise<{ serviceId: string }> }>) {
  const { serviceId } = await params
  if (!telemetryDataset.services.some(({ id }) => id === serviceId)) notFound()
  return <ServiceDetail serviceId={serviceId} />
}
