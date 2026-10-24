import '../src/sticky'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const paragraphs = (count: number, label: string) =>
  Array.from({ length: count }, (_, i) => `<p>${label} paragraph ${i + 1}. Content scrolls beneath the pinned toolbar.</p>`).join('')

const edge = scenario === 'bottom' || scenario === 'grow' ? ' edge="bottom"' : ''
const hide = scenario === 'hide' ? ' hide-on-scroll' : ''
const sticky = `<c2-sticky id="subject"${edge}${hide}>
  <div class="toolbar" role="toolbar" aria-label="Formatting"><button>Bold</button><button>Italic</button></div>
</c2-sticky>`

// A panel whose scroll box lives in its shadow root and is rendered a microtask after upgrade, as a Lit parent does:
// the sticky element connects before that scroller exists.
customElements.define(
  'scenario-panel',
  class extends HTMLElement {
    connectedCallback() {
      queueMicrotask(() => {
        const root = this.attachShadow({ mode: 'open' })
        root.innerHTML = `<div class="scroller" style="height: 300px; overflow: auto"><slot></slot></div>`
      })
    }
  },
)

let content: string
if (scenario === 'bottom') content = `${paragraphs(30, 'Body')}${sticky}${paragraphs(2, 'Footer')}`
else if (scenario === 'grow') content = `${paragraphs(1, 'Body')}<div id="more"></div>${sticky}`
else content = `${paragraphs(2, 'Intro')}${sticky}${paragraphs(30, 'Body')}`

if (scenario === 'body') {
  // App shell: the root element clips, the body scrolls.
  document.documentElement.style.cssText = 'height: 100%; overflow: hidden'
  document.body.style.cssText = 'height: 100%; margin: 0; padding: 0; overflow: auto'
  main.innerHTML = `${content}<output id="log"></output>`
} else if (scenario === 'shadow') {
  main.innerHTML = `<scenario-panel>${content}</scenario-panel><output id="log"></output>`
} else {
  main.innerHTML = `<div class="scroller" tabindex="0" aria-label="Document">${content}</div>
<output id="log"></output>`
}
if (scenario === 'grow') main.insertAdjacentHTML('afterbegin', '<button id="load">Load more</button>')
document.querySelector('#load')?.addEventListener('click', () => {
  document.querySelector('#more')!.innerHTML = paragraphs(30, 'Loaded')
})

const subject = document.querySelector('c2-sticky')!
const log = document.querySelector<HTMLOutputElement>('#log')!
subject.addEventListener('stuck-change', (event) => (log.dataset.stuck = String(event.detail.stuck)))
subject.addEventListener('retract-change', (event) => (log.dataset.retracted = String(event.detail.retracted)))

// Branch on `scenario` to set up each state the spec drives, rather than mutating the element from the test.
if (scenario === 'static') subject.style.setProperty('--c2-sticky--position', 'static')
if (scenario === 'offset') subject.style.setProperty('--c2-sticky--offset', '24px')

await subject.updateComplete
main.dataset.ready = 'true'
