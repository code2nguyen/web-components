/**
 * A deterministic OTLP JSON sample: fifteen minutes of a shop's checkout, with a story to discover.
 *
 * - 09:07:00 one payment pod reloads its config and lowers the gateway timeout to 800 ms.
 * - Requests routed to that pod start timing out, retry, fail; the circuit breaker opens.
 * - 09:10:30 a fixed config (3000 ms) is reloaded and the breaker closes.
 * - 09:11:30–09:13:30 inventory restarts and goes silent; checkout falls back to optimistic stock.
 *
 * Nothing in the file says "incident"; Log Lens has to find it.
 */

type AnyValue = { stringValue: string } | { intValue: string } | { doubleValue: number } | { boolValue: boolean }
interface KeyValue {
  key: string
  value: AnyValue
}
interface OtlpLogRecord {
  timeUnixNano: string
  observedTimeUnixNano: string
  severityNumber: number
  severityText: string
  body: { stringValue: string }
  attributes: KeyValue[]
  traceId: string
  spanId: string
}

export interface OtlpLogsDocument {
  resourceLogs: Array<{
    resource: { attributes: KeyValue[] }
    scopeLogs: Array<{ scope: { name: string; version?: string }; logRecords: OtlpLogRecord[] }>
  }>
}

const START = Date.UTC(2026, 8, 28, 9, 0, 0)
const DURATION = 15 * 60_000

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
const LEVEL_NUMBER: Record<Level, number> = { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 }

interface Resource {
  service: string
  version: string
  pod: string
  host: string
  scope: string
}

const RESOURCES: Record<string, Resource> = {
  frontend: { service: 'frontend', version: '3.12.0', pod: 'frontend-6d8b7-q4t', host: 'node-a1', scope: '@opentelemetry/instrumentation-http' },
  cart: { service: 'cart', version: '2.3.4', pod: 'cart-7c9d4-h2m', host: 'node-a2', scope: 'cart.api' },
  checkout: { service: 'checkout', version: '5.0.1', pod: 'checkout-58f6c-r7v', host: 'node-a1', scope: 'checkout.orders' },
  paymentA: { service: 'payment', version: '4.8.0', pod: 'payment-5f7c9-m8p', host: 'node-b1', scope: 'payment.gateway' },
  paymentB: { service: 'payment', version: '4.8.0', pod: 'payment-5f7c9-x2k', host: 'node-b2', scope: 'payment.gateway' },
  inventory: { service: 'inventory', version: '1.9.0', pod: 'inventory-66b8d-z9c', host: 'node-a2', scope: 'inventory.stock' },
  notification: { service: 'notification', version: '1.4.2', pod: 'notification-7d5f-k1s', host: 'node-b1', scope: 'notification.mailer' },
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createSampleDocument(seed = 20260928): OtlpLogsDocument {
  const rand = random(seed)
  const hex = (length: number) => Array.from({ length }, () => Math.floor(rand() * 16).toString(16)).join('')
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min))

  const logs = new Map<Resource, OtlpLogRecord[]>()
  const emit = (resource: Resource, time: number, level: Level, body: string, attributes: Record<string, string | number> = {}, traceId = '', spanId = '') => {
    if (time > START + DURATION) return
    // Inventory is restarting between 09:11:30 and 09:13:30.
    if (resource === RESOURCES.inventory && time >= START + 690_000 && time < START + 810_000) return
    const nanos = `${Math.round(time)}${String(between(0, 999999)).padStart(6, '0')}`
    const list = logs.get(resource) ?? []
    list.push({
      timeUnixNano: nanos,
      observedTimeUnixNano: nanos,
      severityNumber: LEVEL_NUMBER[level],
      severityText: level,
      body: { stringValue: body },
      attributes: Object.entries(attributes).map(([key, value]) => ({
        key,
        value: typeof value === 'number' ? (Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value }) : { stringValue: value },
      })),
      traceId,
      spanId,
    })
    logs.set(resource, list)
  }

  const badConfigFrom = START + 420_000
  const fixedAt = START + 630_000
  const inventoryDown = (t: number) => t >= START + 690_000 && t < START + 810_000
  let breakerOpen = false
  let breakerFailures = 0

  // Background chatter ------------------------------------------------------------------------------------------
  for (let t = START; t < START + DURATION; t += 15_000) {
    for (const resource of Object.values(RESOURCES)) {
      emit(resource, t + between(0, 900), 'DEBUG', `health check ok status=200 latency=${between(1, 9)}ms`, { 'http.route': '/healthz' })
    }
    emit(RESOURCES.cart, t + 5000, 'DEBUG', `cache stats hits=${between(900, 1400)} misses=${between(20, 80)} evictions=${between(0, 5)}`)
    emit(RESOURCES.checkout, t + 7000, 'DEBUG', `gc pause ${between(3, 40)}ms heap=${between(180, 260)}MB`)
    emit(RESOURCES.notification, t + 9000, 'INFO', `email queue depth=${between(0, 12)} workers=4`)
  }
  emit(RESOURCES.paymentB, badConfigFrom, 'INFO', 'config reloaded source=configmap version=2.4.1 gateway.timeout=800ms', { 'config.version': '2.4.1' })
  emit(RESOURCES.paymentB, fixedAt, 'INFO', 'config reloaded source=configmap version=2.4.2 gateway.timeout=3000ms', { 'config.version': '2.4.2' })
  emit(RESOURCES.inventory, START + 690_000 - 400, 'WARN', 'received SIGTERM, draining 12 in-flight requests')
  emit(RESOURCES.inventory, START + 810_000, 'INFO', 'inventory service started in 4.2s version=1.9.1 port=8080', { 'service.version': '1.9.1' })

  // Requests ----------------------------------------------------------------------------------------------------
  const products = Array.from({ length: 40 }, (_, i) => 1000 + i * 37)
  let orderNumber = 10400
  for (let t = START + 800; t < START + DURATION - 4000; t += between(250, 1100)) {
    const traceId = hex(32)
    const span = () => hex(16)
    if (rand() < 0.62) {
      // Browsing
      const product = pick(products)
      const latency = between(18, 90)
      emit(
        RESOURCES.frontend,
        t,
        'INFO',
        `GET /products/${product} 200 in ${latency}ms`,
        { 'http.method': 'GET', 'http.route': '/products/:id', 'http.status_code': 200 },
        traceId,
        span(),
      )
      if (!inventoryDown(t)) emit(RESOURCES.inventory, t + 6, 'DEBUG', `stock lookup sku=SKU-${product} available=${between(0, 40)}`, {}, traceId, span())
      continue
    }

    // Checkout
    const order = `ORD-${++orderNumber}`
    const cartId = hex(12)
    const items = between(1, 5)
    const amount = (items * between(900, 6000)) / 100
    const payment = rand() < 0.5 ? RESOURCES.paymentA : RESOURCES.paymentB
    let at = t
    emit(
      RESOURCES.frontend,
      at,
      'INFO',
      `POST /api/checkout received cart_id=${cartId}`,
      { 'http.method': 'POST', 'http.route': '/api/checkout' },
      traceId,
      span(),
    )
    at += between(4, 15)
    emit(RESOURCES.cart, at, 'INFO', `loaded cart cart_id=${cartId} items=${items} total=${amount.toFixed(2)}`, { 'cart.items': items }, traceId, span())
    at += between(5, 20)
    if (inventoryDown(at)) {
      emit(
        RESOURCES.checkout,
        at + 1000,
        'WARN',
        `inventory reservation skipped: inventory unavailable, using optimistic stock for order ${order}`,
        { 'order.id': order },
        traceId,
        span(),
      )
      at += 1000
    } else {
      emit(RESOURCES.inventory, at, 'INFO', `reserved ${items} items for order ${order}`, { 'order.id': order }, traceId, span())
    }
    at += between(5, 20)
    emit(
      RESOURCES.checkout,
      at,
      'INFO',
      `created order ${order} amount=${amount.toFixed(2)} currency=EUR`,
      { 'order.id': order, 'order.amount': amount },
      traceId,
      span(),
    )
    at += between(2, 8)
    const paymentSpan = span()
    const payAttrs = { 'order.id': order, 'payment.provider': 'adyen', 'k8s.node.zone': payment === RESOURCES.paymentB ? 'eu-west-1b' : 'eu-west-1a' }
    emit(payment, at, 'INFO', `authorizing payment for order ${order} provider=adyen amount=${amount.toFixed(2)}`, payAttrs, traceId, paymentSpan)

    const degraded = payment === RESOURCES.paymentB && at >= badConfigFrom + 5000 && at < fixedAt
    const fails = degraded && rand() < 0.72
    if (degraded && breakerOpen) {
      at += between(1, 3)
      emit(
        payment,
        at,
        'ERROR',
        `payment authorization failed order_id=${order} reason=circuit_open`,
        { ...payAttrs, 'error.type': 'CircuitOpen' },
        traceId,
        paymentSpan,
      )
    } else if (fails) {
      at += 800
      emit(
        payment,
        at,
        'WARN',
        `gateway request timed out after 800ms provider=adyen attempt=1`,
        { ...payAttrs, 'error.type': 'Timeout' },
        traceId,
        paymentSpan,
      )
      at += 200
      emit(payment, at, 'WARN', `retrying payment authorization attempt=2 backoff=200ms`, payAttrs, traceId, paymentSpan)
      at += 800
      emit(
        payment,
        at,
        'ERROR',
        `payment authorization failed order_id=${order} reason=upstream_timeout`,
        { ...payAttrs, 'error.type': 'Timeout' },
        traceId,
        paymentSpan,
      )
      breakerFailures++
      if (breakerFailures === 20) {
        breakerOpen = true
        emit(payment, at + 2, 'WARN', `circuit breaker opened for provider=adyen failures=20 window=60s`, payAttrs)
      }
    } else {
      const latency = degraded ? between(600, 790) : between(180, 420)
      at += latency
      emit(payment, at, 'INFO', `payment authorized order_id=${order} in ${latency}ms`, payAttrs, traceId, paymentSpan)
    }
    if (breakerOpen && at >= fixedAt) {
      breakerOpen = false
      emit(RESOURCES.paymentB, fixedAt + 1500, 'INFO', 'circuit breaker closed for provider=adyen after successful probe', { 'payment.provider': 'adyen' })
    }

    const failed = (degraded && breakerOpen) || fails
    at += between(3, 10)
    if (failed) {
      emit(RESOURCES.checkout, at, 'ERROR', `checkout failed for order ${order}: payment declined by upstream`, { 'order.id': order }, traceId, span())
      at += between(2, 6)
      const total = at - t
      emit(
        RESOURCES.frontend,
        at,
        'ERROR',
        `POST /api/checkout 502 in ${total}ms`,
        { 'http.method': 'POST', 'http.route': '/api/checkout', 'http.status_code': 502 },
        traceId,
        span(),
      )
    } else {
      emit(RESOURCES.notification, at + between(5, 30), 'INFO', `queued confirmation email for order ${order}`, { 'order.id': order }, traceId, span())
      at += between(2, 6)
      const total = at - t
      emit(
        RESOURCES.frontend,
        at,
        'INFO',
        `POST /api/checkout 200 in ${total}ms`,
        { 'http.method': 'POST', 'http.route': '/api/checkout', 'http.status_code': 200 },
        traceId,
        span(),
      )
    }
  }
  // The closing circuit breaker line only exists if it opened.
  if (breakerOpen)
    emit(RESOURCES.paymentB, fixedAt + 1500, 'INFO', 'circuit breaker closed for provider=adyen after successful probe', { 'payment.provider': 'adyen' })

  return {
    resourceLogs: [...logs].map(([resource, records]) => ({
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: resource.service } },
          { key: 'service.version', value: { stringValue: resource.version } },
          { key: 'service.namespace', value: { stringValue: 'shop' } },
          { key: 'deployment.environment', value: { stringValue: 'production' } },
          { key: 'k8s.pod.name', value: { stringValue: resource.pod } },
          { key: 'host.name', value: { stringValue: resource.host } },
          { key: 'cloud.region', value: { stringValue: 'eu-west-1' } },
        ],
      },
      scopeLogs: [{ scope: { name: resource.scope }, logRecords: records.sort((a, b) => (a.timeUnixNano < b.timeUnixNano ? -1 : 1)) }],
    })),
  }
}

/** The sample as JSON Lines, the collector file exporter's format (one request per line). */
export function createSampleJsonl(seed?: number): string {
  const document = createSampleDocument(seed)
  return document.resourceLogs.map((resourceLog) => JSON.stringify({ resourceLogs: [resourceLog] })).join('\n')
}
