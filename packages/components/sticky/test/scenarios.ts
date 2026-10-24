import '../src/sticky'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const paragraphs = (count: number, label: string) =>
  Array.from({ length: count }, (_, i) => `<p>${label} paragraph ${i + 1}. Content scrolls beneath the pinned toolbar.</p>`).join('')

const edge = scenario === 'bottom' ? ' edge="bottom"' : ''
const hide = scenario === 'hide' ? ' hide-on-scroll' : ''
const sticky = `<c2-sticky id="subject"${edge}${hide}>
  <div class="toolbar" role="toolbar" aria-label="Formatting"><button>Bold</button><button>Italic</button></div>
</c2-sticky>`

main.innerHTML = `<div class="scroller" tabindex="0" aria-label="Document">
  ${scenario === 'bottom' ? `${paragraphs(30, 'Body')}${sticky}${paragraphs(2, 'Footer')}` : `${paragraphs(2, 'Intro')}${sticky}${paragraphs(30, 'Body')}`}
</div>
<output id="log"></output>`

const subject = document.querySelector('c2-sticky')!
const log = document.querySelector<HTMLOutputElement>('#log')!
subject.addEventListener('stuck-change', (event) => (log.dataset.stuck = String(event.detail.stuck)))
subject.addEventListener('retract-change', (event) => (log.dataset.retracted = String(event.detail.retracted)))

// Branch on `scenario` to set up each state the spec drives, rather than mutating the element from the test.
if (scenario === 'static') subject.style.setProperty('--c2-sticky--position', 'static')
if (scenario === 'offset') subject.style.setProperty('--c2-sticky--offset', '24px')

await subject.updateComplete
main.dataset.ready = 'true'
