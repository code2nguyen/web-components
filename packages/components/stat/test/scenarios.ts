import '../src/stat'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML = `<c2-stat id="subject" value="2M+" label="Instruments" tone="positive">
  <svg slot="icon" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"></path></svg>
  <span slot="trend">+12%</span>
</c2-stat>`

const subject = document.querySelector('c2-stat')!
// Branch on `scenario` to set up each state the spec drives, rather than mutating the element from the test.
if (scenario === 'description') subject.innerHTML += '<span slot="description">Updated today</span>'

await subject.updateComplete
main.dataset.ready = 'true'
