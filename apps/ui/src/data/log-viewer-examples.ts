import type { LogViewer, LogEntry } from '@c2n/components/log-viewer'

const accessRoutes = [
  'GET /health 200 2ms',
  'GET /api/products?category=home 200 18ms',
  'GET /assets/storefront.js 304 1ms',
  'POST /api/cart/items 201 26ms',
  'GET /api/orders/ORD-10428 200 12ms',
  'POST /api/checkout 200 184ms',
]

function serverLogs(count: number): LogEntry[] {
  return Array.from({ length: count }, (_, index) => {
    const level = index % 37 === 12 ? 'ERROR' : index % 19 === 8 ? 'WARN' : 'INFO'
    return {
      timestamp: `${14 + Math.floor(index / 3600)}:${String(Math.floor(index / 60) % 60).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}`,
      level,
      source: 'edge-eu-01',
      message:
        level === 'ERROR'
          ? `POST /api/checkout 502 5002ms\n  upstream: payments / connect ETIMEDOUT\n  request: req-${String(index + 1).padStart(5, '0')} / retry in 500ms`
          : level === 'WARN'
            ? 'GET /api/products 429 4ms\n  rate limit: 100 requests/min / client: 192.0.2.24'
            : index % 6 === 0
              ? accessRoutes[0]
              : index % 6 === 0
                ? accessRoutes[0]
                : `${accessRoutes[index % accessRoutes.length]}\n  req-${String(index + 1).padStart(5, '0')} / client: 192.0.2.${(index % 200) + 1}`,
    }
  })
}

const trace: LogEntry[] = [
  {
    timestamp: '14:08:32',
    level: 'ERROR',
    source: 'checkout',
    message: [
      'Checkout failed · order ORD-10428',
      'Payment provider did not respond within 5000ms.',
      '',
      'Request context',
      '  request_id: req-00842',
      '  route: POST /api/checkout',
      '  customer: guest / session: sess-demo-7f2a',
      '  currency: EUR / total: 129.90',
      '  items:',
      '    - SKU-COFFEE-01 / Ceramic coffee set / qty 1',
      '    - SKU-LINEN-03 / Linen table runner / qty 2',
      '  inventory: reserved for 15 minutes',
      '  shipping: standard / destination: FR',
      '  payment: card / token: tok_demo_••••4242',
      '',
      'Error: PaymentGatewayTimeout',
      '  at PaymentClient.authorize (payments/client.ts:184)',
      '  at PaymentService.charge (payments/service.ts:92)',
      '  at CheckoutService.placeOrder (checkout/service.ts:217)',
      '  at OrderRepository.transaction (orders/repository.ts:68)',
      '  at CheckoutController.create (checkout/controller.ts:43)',
      '  at Router.dispatch (http/router.ts:126)',
      '  at AuthMiddleware.handle (middleware/auth.ts:71)',
      '  at RequestLogger.handle (middleware/logger.ts:38)',
      '',
      'Upstream diagnostics',
      '  provider: sandbox.payments.example',
      '  region: eu-west-1 / connection pool: 24 of 32',
      '  dns lookup: 3ms / tls handshake: 41ms',
      '  first byte: not received / deadline exceeded',
      '  idempotency key: checkout-ORD-10428',
      '  last successful request: 14:08:27',
      '',
      'Retry timeline',
      '  14:08:22 attempt 1 → timeout / wait 500ms',
      '  14:08:27 attempt 2 → timeout / wait 1000ms',
      '  14:08:32 attempt 3 → timeout / circuit opened',
      '  14:08:32 order status → payment_pending',
      '  14:08:32 inventory reservation retained',
      '  14:08:33 retry job enqueued → job-00842',
      '',
      'Customer impact',
      '  Confirmation page shows payment pending.',
      '  Cart contents are preserved.',
      '  No duplicate charge: idempotency key reused.',
      '  Recovery email will be sent after authorization.',
    ].join('\n'),
  },
  { timestamp: '14:09:02', level: 'INFO', source: 'payments', message: 'Payment provider recovered\nCircuit breaker closed / retry job-00842 resumed' },
  {
    timestamp: '14:09:03',
    level: 'INFO',
    source: 'checkout',
    message: 'Order ORD-10428 confirmed · EUR 129.90\nPayment authorized / inventory committed / confirmation email queued',
  },
]

const commerceEntries: LogEntry[] = [
  { timestamp: '14:08:11', level: 'INFO', source: 'storefront', message: 'Product added to cart · SKU-COFFEE-01 / qty 1' },
  { timestamp: '14:08:14', level: 'INFO', source: 'storefront', message: 'Cart updated · 3 items / subtotal EUR 119.90' },
  { timestamp: '14:08:18', level: 'INFO', source: 'checkout', message: 'Checkout started · ORD-10428\nGuest session / shipping EUR 10.00 / total EUR 129.90' },
  { timestamp: '14:08:19', level: 'INFO', source: 'inventory', message: 'Stock reserved · 3 items / expires 14:23:19' },
  { timestamp: '14:08:22', level: 'WARN', source: 'payments', message: 'Payment authorization delayed\nProvider timeout / retry scheduled / cart preserved' },
  ...trace,
]
// Live demo: 1,000 entries over five minutes (one every 300 ms on average, with the occasional burst), like a running service.
const LIVE_TOTAL = 1000
const LIVE_INTERVAL = 300
const liveServices = ['api', 'worker', 'payments', 'inventory']
const liveRoutes = ['GET /api/products', 'GET /api/cart', 'POST /api/cart/items', 'GET /api/orders', 'POST /api/checkout', 'GET /health']

function liveEntry(index: number, at: Date): LogEntry {
  const timestamp = at.toISOString().slice(11, 23)
  const source = liveServices[index % liveServices.length]
  const request = `req-${String(index + 1).padStart(5, '0')}`
  if (index % 53 === 41)
    return {
      timestamp,
      level: 'ERROR',
      source: 'payments',
      message: `POST /api/checkout 502 5002ms\n  upstream: payments / connect ETIMEDOUT\n  request: ${request} / retry in 500ms`,
    }
  if (index % 17 === 9)
    return { timestamp, level: 'WARN', source, message: `Slow query · ${120 + (index % 400)}ms\n  ${request} / pool: ${18 + (index % 14)} of 32` }
  if (source === 'worker') return { timestamp, level: 'INFO', source, message: `Job email.confirmation completed · ${request} / ${4 + (index % 40)}ms` }
  const route = liveRoutes[index % liveRoutes.length]
  return { timestamp, level: 'INFO', source, message: `${route} 200 ${2 + ((index * 7) % 180)}ms · ${request} / client: 192.0.2.${(index % 200) + 1}` }
}

function startLiveDemo(viewer: LogViewer): void {
  const demo = viewer.closest<HTMLElement>('[data-log-demo]')!
  const badge = demo.querySelector<HTMLElement>('[data-log-live-count]')
  const toggle = demo.querySelector<HTMLElement>('[data-log-action="toggle"]')
  viewer.columns = ['timestamp', 'level', 'source', 'message']
  let count = 0
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const render = () => {
    if (badge)
      badge.textContent =
        count >= LIVE_TOTAL ? `${LIVE_TOTAL.toLocaleString('en')} entries · done` : `${count.toLocaleString('en')} / ${LIVE_TOTAL.toLocaleString('en')}`
    if (toggle) toggle.textContent = count >= LIVE_TOTAL ? 'Replay' : running ? 'Pause' : 'Resume'
  }
  const tick = () => {
    // Append only the new entries: the viewer keeps everything it already has.
    const burst = Math.random() < 0.1 ? 2 + Math.floor(Math.random() * 3) : 1
    const batch: LogEntry[] = []
    for (let i = 0; i < burst && count < LIVE_TOTAL; i++) batch.push(liveEntry(count++, new Date()))
    viewer.appendEntries(batch)
    if (count >= LIVE_TOTAL) running = false
    else timer = setTimeout(tick, LIVE_INTERVAL * burst * (0.5 + Math.random()))
    render()
  }
  const play = () => {
    if (running) return
    if (count >= LIVE_TOTAL) {
      count = 0
      viewer.clear()
    }
    running = true
    viewer.scrollToEnd()
    timer = setTimeout(tick, LIVE_INTERVAL)
    render()
  }
  const pause = () => {
    running = false
    clearTimeout(timer)
    render()
  }
  let offscreen = false
  toggle?.addEventListener('click', () => (running ? pause() : play()))
  // Stream only while the example is on screen, so a reader scrolling past does not come back to a finished demo.
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && (count === 0 || offscreen)) {
      offscreen = false
      play()
    } else if (!entry.isIntersecting && running) {
      offscreen = true
      pause()
    }
  }).observe(viewer)
  render()
}

const virtualEntries = serverLogs(10000)
const serverEntries = serverLogs(64)
const seeded = new WeakSet<LogViewer>()

function seedExamples(): void {
  document.querySelectorAll<LogViewer>('c2-log-viewer[data-log-viewer-demo]').forEach((viewer) => {
    if (viewer.dataset.logViewerDemo === 'preview' || seeded.has(viewer)) return
    seeded.add(viewer)
    if (viewer.dataset.logViewerDemo === 'live') return startLiveDemo(viewer)
    viewer.columns = ['timestamp', 'level', 'message']
    viewer.appendEntries(
      viewer.dataset.logViewerDemo === 'sticky'
        ? trace
        : viewer.dataset.logViewerDemo === 'virtual'
          ? virtualEntries
          : ['commerce', 'matches'].includes(viewer.dataset.logViewerDemo ?? '')
            ? commerceEntries
            : serverEntries,
    )
    // Start with content visible at the beginning, including the metadata of the tall trace.
    viewer.setFilter(null)
    if (viewer.dataset.logViewerDemo === 'matches') viewer.setFilter({ attributes: { level: ['WARN', 'ERROR'] } }, 'highlight')
  })
}

void customElements.whenDefined('c2-log-viewer').then(() => {
  seedExamples()
  new MutationObserver(seedExamples).observe(document.documentElement, { childList: true, subtree: true })
  document.addEventListener('astro:page-load', seedExamples)
  document.addEventListener('click', (event) => {
    const action = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute('data-log-action'))
    const viewer = action?.closest('[data-log-demo]')?.querySelector<LogViewer>('c2-log-viewer')
    if (!viewer) return
    if (action?.dataset.logAction === 'start') viewer.setFilter(null)
    if (action?.dataset.logAction === 'end') viewer.scrollToEnd()
    if (action?.dataset.logAction === 'highlight') viewer.setFilter({ attributes: { level: ['WARN', 'ERROR'] } }, 'highlight')
    if (action?.dataset.logAction === 'filter') viewer.setFilter({ attributes: { level: ['WARN', 'ERROR'] } }, 'filter')
  })
})
