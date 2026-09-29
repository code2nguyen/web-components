import '../src/banner'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const markup: Record<string, string> = {
  default: `<c2-banner message="Scheduled maintenance on Sunday."></c2-banner>`,
  variants: ['neutral', 'info', 'success', 'warning', 'error']
    .map((variant) => `<c2-banner variant="${variant}" heading="${variant}" message="A ${variant} message."></c2-banner>`)
    .join(''),
  dismissible: `<button type="button">Before</button><c2-banner dismissible close-label="Dismiss notice" message="Dashboards can now be shared."></c2-banner><button type="button">After</button><output>0</output>`,
  prevented: `<c2-banner dismissible close-label="Dismiss notice" message="Accept the terms to continue."></c2-banner><output>0</output>`,
  actions: `<c2-banner variant="warning" heading="Trial ending">Your trial ends in 3 days.<button slot="actions" type="button">Upgrade</button></c2-banner>`,
  'no-icon': `<c2-banner no-icon message="No icon here."></c2-banner>`,
}
main.innerHTML = markup[scenario] ?? markup.default

const output = main.querySelector('output')
main.addEventListener('banner-close', (event) => {
  if (output) output.textContent = String(Number(output.textContent) + 1)
  if (scenario === 'prevented') event.preventDefault()
})

await Promise.all(Array.from(main.querySelectorAll('c2-banner'), (banner) => banner.updateComplete))
main.dataset.ready = 'true'
