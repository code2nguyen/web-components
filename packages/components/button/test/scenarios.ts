import '../src/button'
import { customElement } from '@c2n/core/element-helper.js'

// Exposed for the duplicate-registration test: this is what a second copy of a @c2n package does when it is
// evaluated — two versions in one dependency tree, two micro-frontends, or a hot reload.
declare global {
  interface Window {
    defineButtonAgain: () => void
  }
}
window.defineButtonAgain = () => {
  class SecondButton extends HTMLElement {}
  customElement('c2-button')(SecondButton)
}

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
const icon = (slot: string) =>
  `<svg slot="${slot}" data-testid="${slot}" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16" stroke="currentColor" /></svg>`
main.innerHTML = `
  <button id="before">Before</button>
  <c2-button id="subject">Save</c2-button>
  <button id="after">After</button>
  <output aria-label="Activations">0</output>
`
const button = document.querySelector('c2-button')!
const output = document.querySelector('output')!
let count = 0
button.disabled = scenario === 'disabled'
button.running = scenario === 'running'
button.toggle = scenario === 'toggle'
button.selected = scenario === 'selected'
if (scenario === 'themed') button.className = 'themed'
if (['icons', 'custom-running'].includes(scenario)) {
  button.innerHTML = `${icon('prefix-icon')}Save${icon('suffix-icon')}${scenario === 'custom-running' ? icon('running-icon') : ''}`
}
button.addEventListener('click', () => {
  output.textContent = String(++count)
  if (scenario === 'toggle') button.selected = !button.selected
  if (scenario === 'async' || scenario === 'custom-running') button.running = true
})
if (['async', 'custom-running', 'running', 'disabled'].includes(scenario)) {
  const complete = document.createElement('button')
  complete.textContent = 'Complete operation'
  complete.addEventListener('click', () => {
    button.running = false
    button.disabled = false
  })
  main.append(complete)
}
await button.updateComplete
main.dataset.ready = 'true'
