import { notFound } from 'next/navigation'
import { telemetryDataset } from '../../../lib/data/dataset'
import { buildDatasetIndexes } from '../../../lib/data/indexes'
import { TraceDetail } from '../../../features/traces/TraceDetail'

const indexes = buildDatasetIndexes(telemetryDataset)
export function generateStaticParams() {
  return telemetryDataset.traces.map(({ id }) => ({ traceId: id }))
}

export default async function TraceDetailPage({ params }: Readonly<{ params: Promise<{ traceId: string }> }>) {
  const { traceId } = await params
  const trace = indexes.tracesById.get(traceId)
  if (!trace) notFound()
  const spans = indexes.spansByTrace.get(trace.id) ?? []
  const service = indexes.servicesById.get(trace.rootServiceId)
  const correlatedLogs = indexes.logsByTrace.get(trace.id) ?? []
  return <TraceDetail trace={trace} spans={spans} service={service ?? null} correlatedLogs={correlatedLogs} />
}
