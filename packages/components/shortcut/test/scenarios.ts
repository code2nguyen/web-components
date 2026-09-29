import '../src/shortcut'
import type { ShortcutBinding } from '../src/shortcut'

// A control whose click handling lives on an input inside its shadow root, as `c2-switch` does.
customElements.define(
  'fake-switch',
  class extends HTMLElement {
    constructor() {
      super()
      this.attachShadow({ mode: 'open' }).innerHTML = '<input type="checkbox" role="switch" aria-label="Switch" />'
    }
  },
)

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML = `
  <c2-shortcut id="subject"></c2-shortcut>
  <label>Field <input id="field" /></label>
  <button id="target" type="button">Target</button>
  <div class="panel"><button id="inside" type="button">Inside</button></div>
  <div id="claimer" tabindex="0" aria-label="Claimer">Claimer</div>
  <fake-switch id="switch"></fake-switch>
  <output id="log" role="status"></output>
`

const subject = document.querySelector('c2-shortcut')!
const log = document.querySelector<HTMLOutputElement>('#log')!
const write = (entry: string) => {
  log.textContent = log.textContent ? `${log.textContent} ${entry}` : entry
}

const bindings: ShortcutBinding[] = [
  { keys: 'mod+k, mod+/', action: 'search', description: 'Open search' },
  { keys: 'mod+s', action: 'save' },
  { keys: 'alt+g alt+d', action: 'go' },
  { keys: 'alt+d', action: 'lone-d' },
  { keys: 'escape', action: 'close-global' },
  { keys: 'escape', action: 'close-panel', scope: '.panel' },
  { keys: 'alt+t', action: 'open', for: 'target' },
  { keys: 'alt+f', for: 'field' },
  { keys: 'alt+h', action: 'held' },
  { keys: 'alt+r', action: 'repeat', repeat: true },
  { keys: 'alt+q', action: 'claimed' },
  { keys: 'alt+x', action: 'off', disabled: true },
  { keys: 'alt+j', handler: () => write('handled') },
  { keys: 'b, g d, shift+b', action: 'bare' },
  { keys: 'f2', action: 'function-key' },
  { keys: 'alt+w', for: 'switch' },
]

subject.addEventListener('shortcut', (event) => {
  write(event.detail.action ?? `(${event.detail.keys})`)
  log.dataset.prevented = String(event.detail.originalEvent.defaultPrevented)
  if (scenario === 'cancel') event.preventDefault()
})
document.querySelector('#target')!.addEventListener('click', () => write('clicked'))
// A component that handles a key itself claims it with preventDefault().
document.querySelector('#claimer')!.addEventListener('keydown', (event) => {
  if ((event as KeyboardEvent).code === 'KeyQ') event.preventDefault()
})

if (scenario === 'attribute') subject.setAttribute('bindings', JSON.stringify([{ keys: 'mod+k', action: 'from-attribute' }]))
else subject.bindings = bindings
if (scenario === 'disabled') subject.toggleAttribute('disabled', true)

await subject.updateComplete
main.dataset.ready = 'true'
