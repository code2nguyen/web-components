import '../src/border-beam'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
const controls =
  scenario === 'controls'
    ? 'style="--c2-border-beam__beam--duration:2.5s;--c2-border-beam__beam--delay:-1s;--c2-border-beam__beam--size:72px;--c2-border-beam__beam--width:2px" count="2" reverse paused'
    : ''
const side = scenario === 'side' ? 'side="top"' : ''

main.innerHTML = `
  <div class="surface">
    <strong>Workspace overview</strong>
    <p>Review task status and deployment health.</p>
    <c2-border-beam ${controls} ${side}></c2-border-beam>
  </div>
`

const subject = document.querySelector('c2-border-beam')!
await subject.updateComplete
main.dataset.ready = 'true'
