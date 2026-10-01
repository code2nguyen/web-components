import '../src/split-panel'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
const attributes: Record<string, string> = {
  default: '',
  vertical: 'orientation="vertical"',
  bounded: 'min="20" max="70"',
  snap: 'snap="25 50 75" snap-threshold="20"',
  disabled: 'disabled',
  primary: 'primary="start" position="40"',
  rtl: 'dir="rtl"',
}
main.innerHTML = `<button id="before">Before</button>
  <c2-split-panel id="subject" ${attributes[scenario] ?? ''}>
    <div slot="start" class="pane">Files</div>
    <div slot="end" class="pane">Preview</div>
  </c2-split-panel>
  <output aria-label="Reposition events">0</output>`

const subject = document.querySelector('c2-split-panel')!
const output = document.querySelector('output')!
let count = 0
subject.addEventListener('reposition', (event) => {
  output.textContent = `${++count}:${Math.round(event.detail.position)}`
})

await subject.updateComplete
main.dataset.ready = 'true'
