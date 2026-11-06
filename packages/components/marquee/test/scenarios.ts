import '../src/marquee'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const count = scenario === 'short' ? 2 : 6
const items = Array.from({ length: count }, (_, index) =>
  index === 1 ? `<a class="logo" href="#item-2">Item 2</a>` : `<span class="logo">Item ${index + 1}</span>`,
).join('')

const attributes: Record<string, string> = {
  paused: 'paused',
  reverse: 'reverse',
  vertical: 'orientation="vertical"',
}
if (scenario === 'rtl') main.dir = 'rtl'
main.innerHTML = `<c2-marquee aria-label="Partners" ${attributes[scenario] ?? ''}>${items}</c2-marquee>`

const subject = document.querySelector('c2-marquee')!
await subject.updateComplete
// The first measurement runs on the next animation frame; the items move once it has.
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
await subject.updateComplete
main.dataset.ready = 'true'
