import '../src/truncate'

const LONG =
  'Quarterly revenue grew 18% year over year, led by the enterprise segment, while churn in the self-serve tier fell for the third ' +
  'quarter in a row. Gross margin held at 72% despite higher infrastructure spend, and the team expects the new pricing to lift ' +
  'average contract value in the second half once the migration of legacy plans is complete.'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
const attributes: Record<string, string> = {
  default: 'expandable',
  short: 'expandable',
  'single-line': 'expandable',
  expanded: 'expandable expanded',
  labels: 'expandable more-label="Read more" less-label="Read less"',
}
const text = scenario === 'short' ? 'Fits on one line.' : LONG
main.innerHTML = `<button id="before">Before</button>
  <c2-truncate id="subject" ${attributes[scenario] ?? ''} class="${scenario === 'single-line' ? 'single' : ''}">${text}</c2-truncate>
  <button id="after">After</button>
  <output aria-label="Events"></output>`

const subject = document.querySelector('c2-truncate')!
const output = document.querySelector('output')!
const log: string[] = []
subject.addEventListener('toggle', (event) => {
  log.push(`toggle:${event.newState}`)
  output.textContent = log.join(' ')
})
subject.addEventListener('truncation-change', (event) => {
  log.push(`truncated:${event.detail}`)
  output.textContent = log.join(' ')
})

// Grows the text past the clamp, the way streamed or edited content would.
document.querySelector('#after')!.addEventListener('click', () => {
  subject.textContent = LONG
})

await subject.updateComplete
// The first measurement runs on the next animation frame.
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
main.dataset.ready = 'true'
