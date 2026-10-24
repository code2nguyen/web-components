import '../src/header'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML = `<c2-header id="subject" navigation-label="Product">
  <strong slot="brand">Northstar</strong>
  <a href="#markets">Markets</a>
  <button slot="actions">Sign in</button>
  <button slot="mobile-trigger">Menu</button>
</c2-header>`

const subject = document.querySelector('c2-header')!
// Branch on `scenario` to set up each state the spec drives, rather than mutating the element from the test.
if (scenario === 'glass') {
  subject.toggleAttribute('sticky', true)
  subject.toggleAttribute('blurred', true)
  subject.style.setProperty('--c2-header__content--max-width', '640px')
}
if (scenario === 'scroll') {
  subject.toggleAttribute('sticky', true)
  subject.toggleAttribute('hide-on-scroll', true)
  subject.style.setProperty('--c2-header__stuck--box-shadow', '0 1px 3px rgba(0, 0, 0, 0.18)')
  // The header sticks within its parent, so the page content goes in the same block.
  main.style.display = 'block'
  main.insertAdjacentHTML('beforeend', Array.from({ length: 60 }, (_, i) => `<p>Article paragraph ${i + 1}.</p>`).join(''))
  const log = document.createElement('output')
  log.id = 'log'
  document.body.append(log)
  subject.addEventListener('stuck-change', (event) => (log.dataset.stuck = String(event.detail.stuck)))
  subject.addEventListener('retract-change', (event) => (log.dataset.retracted = String(event.detail.retracted)))
}

await subject.updateComplete
main.dataset.ready = 'true'
