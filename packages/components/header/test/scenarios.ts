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

await subject.updateComplete
main.dataset.ready = 'true'
