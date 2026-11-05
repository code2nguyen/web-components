import '../src/quick-time-menu'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML = `<c2-quick-time-menu id="subject"></c2-quick-time-menu>`

const subject = document.querySelector('c2-quick-time-menu')!
// Branch on `scenario` to set up each state the spec drives, rather than mutating the element from the test.
if (scenario === 'disabled') subject.toggleAttribute('disabled', true)

await subject.updateComplete
main.dataset.ready = 'true'
