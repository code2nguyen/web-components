import '../src/marquee'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const count = scenario === 'short' ? 2 : 6
// The link is the one focusable item: the second, or in `far-link` the last, which starts outside the strip.
const linkAt = scenario === 'far-link' ? count - 1 : 1
const items = Array.from({ length: count }, (_, index) =>
  index === linkAt ? `<a class="logo" href="#item-${index + 1}">Item ${index + 1}</a>` : `<span class="logo">Item ${index + 1}</span>`,
).join('')

const attributes: Record<string, string> = {
  paused: 'paused',
  reverse: 'reverse',
  vertical: 'orientation="vertical"',
}
if (scenario === 'rtl') main.dir = 'rtl'
// Non-rendering children take no place in the loop.
const extras = scenario === 'extras' ? '<template><span>Template</span></template><style>.unused {}</style>' : ''
// `far-link` has a button after the strip, so Tab has somewhere to go when it leaves the last item.
const after = scenario === 'far-link' ? '<button type="button">After</button>' : ''
main.innerHTML = `<c2-marquee aria-label="Partners" ${attributes[scenario] ?? ''}>${extras}${items}</c2-marquee>${after}`
if (scenario === 'scaled') main.style.transform = 'scale(0.5)'
if (scenario === 'vertical-centred' || scenario === 'vertical-centred-still') {
  main.querySelector('c2-marquee')!.setAttribute('orientation', 'vertical')
  main.querySelector<HTMLElement>('c2-marquee')!.style.setProperty('--c2-marquee__item--align', 'center')
}

const subject = document.querySelector('c2-marquee')!
await subject.updateComplete
// The items move once the strip has measured them, a frame or two after the first render.
// Under reduced motion the strip still measures (the CSS keeps it at rest), so the wait is the same.
for (let frame = 0; !subject.shadowRoot!.querySelector('.track.running'); frame++) {
  if (frame > 60) throw new Error('c2-marquee did not measure its items within 60 frames')
  await new Promise((resolve) => requestAnimationFrame(resolve))
  await subject.updateComplete
}
main.dataset.ready = 'true'
