import '../src/timeline'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const entries = `
  <c2-timeline-item label="Order placed" timestamp="Sep 12, 09:14" datetime="2026-09-12T09:14" tone="success">Paid with a card ending 4242.</c2-timeline-item>
  <c2-timeline-item label="Shipped" timestamp="Sep 13, 16:02" datetime="2026-09-13T16:02" tone="primary">Handed to the carrier.</c2-timeline-item>
  <c2-timeline-item label="Delivery delayed" timestamp="Sep 15, 08:30" tone="warning"></c2-timeline-item>
`

const markup: Record<string, string> = {
  default: `<c2-timeline aria-label="Order history">${entries}</c2-timeline>`,
  split: `<c2-timeline aria-label="Order history" layout="split">${entries}</c2-timeline>`,
  // Entries behind a wrapper, the way an Astro island or a framework component delivers them.
  wrapped: `<c2-timeline aria-label="Order history"><div>${entries}</div></c2-timeline>`,
  slots: `<c2-timeline aria-label="Releases">
    <c2-timeline-item tone="danger">
      <svg slot="marker" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6" /></svg>
      <span slot="label"><a href="#v2">v2.0.0</a> breaking release</span>
      <span slot="timestamp">two days ago</span>
      <p>Dropped the legacy API.</p>
    </c2-timeline-item>
    <c2-timeline-item label="v1.9.0"></c2-timeline-item>
  </c2-timeline>`,
}
main.innerHTML = markup[scenario] ?? markup.default

const timeline = document.querySelector('c2-timeline')!
await timeline.updateComplete
await Promise.all([...document.querySelectorAll('c2-timeline-item')].map((item) => item.updateComplete))
main.dataset.ready = 'true'

if (scenario === 'default') {
  const button = document.createElement('button')
  button.id = 'append'
  button.textContent = 'Add entry'
  button.addEventListener('click', () => {
    const item = document.createElement('c2-timeline-item')
    item.label = 'Delivered'
    timeline.append(item)
  })
  main.after(button)
}
