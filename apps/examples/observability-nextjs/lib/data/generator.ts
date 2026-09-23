import type {
  AlertRule,
  DashboardPanel,
  Environment,
  Incident,
  IncidentEvent,
  LogRecord,
  LogSeverity,
  MetricSeries,
  MetricUnit,
  NotificationDestination,
  Service,
  Span,
  TelemetryDataset,
  Trace,
} from '../domain/telemetry.ts'
import { DATASET_BASELINE_INSTANT, DATASET_SCHEMA_VERSION, DATASET_SEED, createSeededRandom, stableId } from './seed.ts'

const serviceNames = [
  'edge-gateway',
  'checkout-api',
  'catalog-service',
  'payment-orchestrator',
  'inventory-service',
  'identity-service',
  'notification-worker',
  'recommendation-engine-with-an-intentionally-long-name',
]
const owners = ['Edge Systems', 'Commerce Core', 'Catalog', 'Payments', 'Supply', 'Identity', 'Messaging', 'Discovery']
const operations = ['GET /health', 'GET /v1/items', 'POST /v1/checkout', 'SELECT inventory']
const severities: readonly LogSeverity[] = ['debug', 'info', 'warn', 'error', 'fatal']

function generateEnvironments(): Environment[] {
  return [
    { id: 'production', name: 'Production', region: 'eu-west synthetic', isDefault: true },
    { id: 'staging', name: 'Staging', region: 'us-east synthetic', isDefault: false },
  ]
}

function generateServices(random: ReturnType<typeof createSeededRandom>, environments: Environment[]): Service[] {
  return environments.flatMap((environment) =>
    serviceNames.map((baseName, index) => {
      const p50 = random.integer(18, 180)
      const p95 = p50 + random.integer(25, 420)
      const p99 = p95 + random.integer(30, 650)
      const errorRate = Number((index === 3 && environment.isDefault ? 0.087 : random.next() * 0.025).toFixed(4))
      const id = `${environment.id}-${baseName}`
      const environmentServices = serviceNames.map((name) => `${environment.id}-${name}`)
      const dependencies = index === 0 ? [] : index === 1 ? [environmentServices[0]] : [environmentServices[index - 1], environmentServices[index - 2]]

      return {
        id,
        name: baseName,
        environmentId: environment.id,
        owner: owners[index],
        health: errorRate > 0.06 ? 'critical' : errorRate > 0.018 ? 'warning' : 'healthy',
        throughputPerMinute: random.integer(120, 7_500),
        latencyP50Ms: p50,
        latencyP95Ms: p95,
        latencyP99Ms: p99,
        errorRate,
        dependencies,
        operations: operations.map((name, operationIndex) => ({
          name,
          throughputPerMinute: random.integer(20, 1_800),
          latencyP95Ms: p95 + operationIndex * 17,
          errorRate: Number(Math.min(1, errorRate + operationIndex * 0.001).toFixed(4)),
        })),
        deployments: [
          { id: `${id}-deploy-1`, version: `2026.8.${index}`, timestampOffsetMs: -6_600_000, summary: 'Routine dependency refresh' },
          { id: `${id}-deploy-2`, version: `2026.8.${index + 1}`, timestampOffsetMs: -1_800_000, summary: 'Traffic policy tuning' },
        ],
      } satisfies Service
    }),
  )
}

function generateMetrics(random: ReturnType<typeof createSeededRandom>, services: Service[]): MetricSeries[] {
  const definitions: ReadonlyArray<{ metric: string; unit: MetricUnit; base: (service: Service) => number }> = [
    { metric: 'request-rate', unit: 'requests-per-second', base: (service) => service.throughputPerMinute / 60 },
    { metric: 'latency-p95', unit: 'milliseconds', base: (service) => service.latencyP95Ms },
    { metric: 'error-rate', unit: 'percent', base: (service) => service.errorRate * 100 },
    { metric: 'saturation', unit: 'percent', base: (service) => 35 + service.errorRate * 400 },
  ]

  return services.flatMap((service, serviceIndex) =>
    definitions.map((definition, definitionIndex) => ({
      id: `metric-${service.id}-${definition.metric}`,
      metric: definition.metric,
      unit: definition.unit,
      environmentId: service.environmentId,
      serviceId: service.id,
      dimensions: { service: service.name, source: 'synthetic' },
      points: [
        ...Array.from({ length: 25 }, (_, pointIndex) => ({
          offsetMs: -7_200_000 + pointIndex * 300_000,
          value: Number((definition.base(service) * (0.88 + random.next() * 0.24) + definitionIndex).toFixed(3)),
        })),
        ...Array.from({ length: 12 }, (_, replayIndex) => {
          const tick = replayIndex + 1
          const factor = 0.9 + ((serviceIndex * 7 + definitionIndex * 3 + tick * 2) % 13) * 0.02
          return { offsetMs: tick * 15_000, value: Number((definition.base(service) * factor + definitionIndex).toFixed(3)) }
        }),
      ],
    })),
  )
}

function generateTraces(random: ReturnType<typeof createSeededRandom>, services: Service[]): { traces: Trace[]; spans: Span[] } {
  const traces: Trace[] = []
  const spans: Span[] = []

  for (let index = 0; index < 192; index += 1) {
    const rootService = services[index % services.length]
    const traceId = stableId('trace', index, 5)
    const replayIndex = index - 180
    const isReplayTrace = replayIndex >= 0
    const startOffsetMs = isReplayTrace ? (replayIndex + 1) * 15_000 : -7_100_000 + index * 38_000 + random.integer(0, 4_000)
    const durationMs = isReplayTrace ? 900 + (replayIndex % 5) * 240 : random.integer(320, 3_200)
    const isError = isReplayTrace ? replayIndex % 3 === 0 : index % 7 === 0
    const spanIds = Array.from({ length: 4 }, (_, spanIndex) => `${traceId}-span-${spanIndex + 1}`)
    const childDuration = Math.max(30, Math.floor(durationMs / 5))
    const childStarts = [Math.floor(durationMs * 0.12), Math.floor(durationMs * 0.38), Math.floor(durationMs * 0.66)]

    traces.push({
      id: traceId,
      environmentId: rootService.environmentId,
      rootServiceId: rootService.id,
      rootOperation: operations[index % operations.length],
      startOffsetMs,
      durationMs,
      status: isError ? 'error' : 'ok',
      rootSpanId: spanIds[0],
      spanIds,
      attributes: { 'http.method': index % 3 === 0 ? 'POST' : 'GET', 'demo.synthetic': true },
    })

    spans.push({
      id: spanIds[0],
      traceId,
      parentSpanId: null,
      serviceId: rootService.id,
      operation: operations[index % operations.length],
      startOffsetMs,
      durationMs,
      status: 'ok',
      attributes: { route: '/synthetic', sample: index },
      events: [{ name: 'request.received', offsetMs: startOffsetMs + 1, attributes: {} }],
      error: null,
    })

    for (let childIndex = 0; childIndex < 3; childIndex += 1) {
      const servicePosition = services.indexOf(rootService)
      const candidate = services[(servicePosition + childIndex + 1) % services.length]
      const childService = candidate.environmentId === rootService.environmentId ? candidate : rootService
      const failed = isError && childIndex === 2
      const childStart = startOffsetMs + childStarts[childIndex]
      spans.push({
        id: spanIds[childIndex + 1],
        traceId,
        parentSpanId: spanIds[0],
        serviceId: childService.id,
        operation: operations[(index + childIndex + 1) % operations.length],
        startOffsetMs: childStart,
        durationMs: Math.min(childDuration, startOffsetMs + durationMs - childStart),
        status: failed ? 'error' : 'ok',
        attributes: { 'peer.service': childService.name, attempt: 1 },
        events: [{ name: failed ? 'exception' : 'response.received', offsetMs: childStart + 1, attributes: { synthetic: true } }],
        error: failed ? { type: 'SyntheticTimeout', message: 'The simulated downstream call exceeded its budget', stack: null } : null,
      })
    }
  }

  return { traces, spans }
}

function generateLogs(random: ReturnType<typeof createSeededRandom>, traces: Trace[], spans: Span[], services: Service[]): LogRecord[] {
  const spansByTrace = new Map<string, Span[]>()
  for (const span of spans) spansByTrace.set(span.traceId, [...(spansByTrace.get(span.traceId) ?? []), span])

  const historical = Array.from({ length: 1_200 }, (_, index) => {
    const correlated = index % 4 !== 0
    const trace = correlated ? traces[index % traces.length] : null
    const traceSpans = trace ? spansByTrace.get(trace.id)! : []
    const span = trace ? traceSpans[index % traceSpans.length] : null
    const service = span ? services.find(({ id }) => id === span.serviceId)! : services[index % services.length]
    const severity = index % 29 === 0 ? 'fatal' : index % 11 === 0 ? 'error' : index % 5 === 0 ? 'warn' : severities[index % 2]
    const uncorrelatedOffset = index % 24 === 0 ? random.integer(1, 60_000) : -7_200_000 + index * 5_900

    return {
      id: stableId('log', index, 5),
      timestampOffsetMs: trace ? trace.startOffsetMs + Math.min(trace.durationMs, index % Math.max(1, trace.durationMs)) : uncorrelatedOffset,
      environmentId: service.environmentId,
      serviceId: service.id,
      severity,
      message:
        index === 17
          ? 'Synthetic checkout reconciliation produced an intentionally long diagnostic message to exercise wrapping while preserving every structured correlation field and action.'
          : `${severity.toUpperCase()} synthetic ${service.name} event ${index + 1}`,
      traceId: trace?.id ?? null,
      spanId: span?.id ?? null,
      attributes: { source: 'local-generator', sequence: index + 1, retryable: severity === 'error' },
    }
  })
  const replay = traces
    .filter(({ startOffsetMs }) => startOffsetMs > 0)
    .map((trace, index) => {
      const span = spansByTrace.get(trace.id)![0]
      const service = services.find(({ id }) => id === trace.rootServiceId)!
      return {
        id: stableId('replay-log', index, 5),
        timestampOffsetMs: trace.startOffsetMs,
        environmentId: trace.environmentId,
        serviceId: service.id,
        severity: trace.status === 'error' ? ('error' as const) : ('info' as const),
        message: `${trace.status === 'error' ? 'ERROR' : 'INFO'} replay tick ${index + 1} for ${service.name}`,
        traceId: trace.id,
        spanId: span.id,
        attributes: { source: 'local-replay', replayTick: index + 1, synthetic: true },
      }
    })
  return [...historical, ...replay]
}

function generateDestinations(): NotificationDestination[] {
  return [
    { id: 'primary-on-call', label: 'Primary on-call (synthetic)', type: 'on-call', description: 'Simulated delivery to the fictional primary rotation.' },
    { id: 'commerce-team-chat', label: 'Commerce team chat (synthetic)', type: 'team-chat', description: 'Simulated delivery to a local-only team channel.' },
    {
      id: 'daily-email-summary',
      label: 'Daily email summary (synthetic)',
      type: 'email-summary',
      description: 'Simulated summary; no real address is stored.',
    },
  ]
}

function generateRules(services: Service[], destinations: NotificationDestination[]): AlertRule[] {
  const productionServices = services.filter(({ environmentId }) => environmentId === 'production')
  const signals: AlertRule['signal'][] = ['latency', 'error-rate', 'throughput', 'saturation']
  return Array.from({ length: 8 }, (_, index) => ({
    id: stableId('rule', index, 2),
    name: `${signals[index % signals.length]} guardrail for ${productionServices[index].name}`,
    signal: signals[index % signals.length],
    serviceIds: [productionServices[index].id],
    operator: index % 4 === 2 ? 'below' : 'above',
    threshold: index % 4 === 0 ? 750 : index % 4 === 1 ? 0.05 : index % 4 === 2 ? 50 : 85,
    evaluationWindowMinutes: [5, 10, 15, 30][index % 4],
    severity: index % 3 === 0 ? 'critical' : 'warning',
    owner: owners[index],
    destinationIds: [destinations[index % destinations.length].id],
    enabled: index !== 6,
    origin: 'baseline',
  }))
}

function event(incidentIndex: number, eventIndex: number, state: IncidentEvent['state'], offsetMs: number): IncidentEvent {
  return {
    id: `incident-${incidentIndex + 1}-event-${eventIndex + 1}`,
    state,
    offsetMs,
    actor: eventIndex === 0 ? 'Synthetic evaluator' : 'Demo on-call',
    note: `${state} in the local simulation`,
  }
}

function generateIncidents(rules: AlertRule[]): Incident[] {
  const historical = Array.from({ length: 6 }, (_, index) => {
    const rule = rules[index]
    const startedOffsetMs = -5_400_000 + index * 600_000
    const states: IncidentEvent['state'][] =
      index % 3 === 0 ? ['triggered'] : index % 3 === 1 ? ['triggered', 'acknowledged'] : ['triggered', 'acknowledged', 'resolved']
    const timeline = states.map((state, eventIndex) => event(index, eventIndex, state, startedOffsetMs + eventIndex * 180_000))
    const resolvedOffsetMs = states.at(-1) === 'resolved' ? timeline.at(-1)!.offsetMs : null
    return {
      id: stableId('incident', index, 2),
      ruleId: rule.id,
      serviceIds: [...rule.serviceIds],
      severity: rule.severity,
      state: states.at(-1) === 'triggered' ? 'active' : (states.at(-1) as Incident['state']),
      owner: index === 0 ? null : owners[index],
      startedOffsetMs,
      resolvedOffsetMs,
      timeline,
      annotations: [
        {
          id: `incident-${index + 1}-annotation-1`,
          offsetMs: startedOffsetMs + 90_000,
          author: 'Demo on-call',
          body: 'Synthetic investigation note; no external system was contacted.',
        },
      ],
    }
  })
  const replayRule = rules[6]
  const replayTimeline = [event(6, 0, 'triggered', 45_000), event(6, 1, 'acknowledged', 90_000), event(6, 2, 'resolved', 165_000)]
  const replayIncident: Incident = {
    id: stableId('incident', 6, 2),
    ruleId: replayRule.id,
    serviceIds: [...replayRule.serviceIds],
    severity: replayRule.severity,
    state: 'resolved',
    owner: owners[6],
    startedOffsetMs: 45_000,
    resolvedOffsetMs: 165_000,
    timeline: replayTimeline,
    annotations: [
      {
        id: 'incident-7-annotation-1',
        offsetMs: 120_000,
        author: 'Demo on-call',
        body: 'Replay investigation confirmed the correlated synthetic trace and log evidence.',
      },
    ],
  }
  return [...historical, replayIncident]
}

function generateDashboardPanels(): DashboardPanel[] {
  return [
    {
      id: 'traffic',
      title: 'Request traffic',
      kind: 'stat',
      metric: 'request-rate',
      unit: 'requests-per-second',
      defaultSize: 'small',
      supportedSizes: ['small', 'medium'],
      description: 'Current synthetic request volume.',
    },
    {
      id: 'latency',
      title: 'P95 latency',
      kind: 'line',
      metric: 'latency-p95',
      unit: 'milliseconds',
      defaultSize: 'large',
      supportedSizes: ['medium', 'large'],
      description: 'P95 service latency over the selected range.',
    },
    {
      id: 'errors',
      title: 'Error rate',
      kind: 'area',
      metric: 'error-rate',
      unit: 'percent',
      defaultSize: 'medium',
      supportedSizes: ['small', 'medium', 'large'],
      description: 'Synthetic error percentage by service.',
    },
    {
      id: 'saturation',
      title: 'Saturation',
      kind: 'bar',
      metric: 'saturation',
      unit: 'percent',
      defaultSize: 'medium',
      supportedSizes: ['medium', 'large'],
      description: 'Relative resource saturation.',
    },
    {
      id: 'duration-distribution',
      title: 'Trace duration',
      kind: 'distribution',
      metric: 'latency-p95',
      unit: 'milliseconds',
      defaultSize: 'medium',
      supportedSizes: ['medium', 'large'],
      description: 'Distribution of generated trace durations.',
    },
    {
      id: 'top-services',
      title: 'Top contributors',
      kind: 'ranked-table',
      metric: 'request-rate',
      unit: 'requests-per-second',
      defaultSize: 'large',
      supportedSizes: ['medium', 'large'],
      description: 'Services ranked by generated request traffic.',
    },
    {
      id: 'incident-count',
      title: 'Active incidents',
      kind: 'stat',
      metric: 'incident-count',
      unit: 'count',
      defaultSize: 'small',
      supportedSizes: ['small', 'medium'],
      description: 'Current unresolved synthetic incidents.',
    },
  ]
}

export function createTelemetryDataset(seed = DATASET_SEED): TelemetryDataset {
  const random = createSeededRandom(seed)
  const environments = generateEnvironments()
  const services = generateServices(random, environments)
  const { traces, spans } = generateTraces(random, services)
  const destinations = generateDestinations()
  const alertRules = generateRules(services, destinations)
  const dashboardPanels = generateDashboardPanels()

  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    seed,
    baselineInstant: DATASET_BASELINE_INSTANT,
    environments,
    services,
    metricSeries: generateMetrics(random, services),
    traces,
    spans,
    logs: generateLogs(random, traces, spans, services),
    alertRules,
    incidents: generateIncidents(alertRules),
    destinations,
    dashboard: { id: 'operations', name: 'Signal Forge operations', panelIds: dashboardPanels.map(({ id }) => id) },
    dashboardPanels,
  }
}
