import '../src/chip-group'
import '../../chip/src/chip'
import '../../badge/src/badge'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
const labels = ['Design', 'Engineering', 'Product', 'Marketing', 'Customer success', 'Finance']
const chips = labels.map((label) => `<c2-chip>${label}</c2-chip>`).join('')
const badges = labels.map((label) => `<c2-badge tone="primary">${label}</c2-badge>`).join('')
const spans = labels.map((label) => `<span class="plain">${label}</span>`).join('')

const markup: Record<string, string> = {
  declarative: `<c2-chip-group id="subject" aria-label="Topics">${chips}</c2-chip-group>`,
  default: `<c2-chip-group id="subject" aria-label="Topics">${chips}</c2-chip-group>`,
  badges: `<c2-chip-group id="subject" aria-label="Topics">${badges}</c2-chip-group>`,
  max: `<c2-chip-group id="subject" aria-label="Topics" max="2">${chips}</c2-chip-group>`,
  expandable: `<c2-chip-group id="subject" aria-label="Topics" expandable>${chips}</c2-chip-group>`,
  plain: `<c2-chip-group id="subject" aria-label="Topics">${spans}</c2-chip-group>`,
}

// A declarative shadow root (server rendering) is in named mode: the group routes collapsed items by `slot` instead.
const declarative = (html: string) => html.replace('<c2-chip-group id="subject" aria-label="Topics">', '$&<template shadowrootmode="open"></template>')

const content = `<div class="frame" style="width: ${scenario === 'wide' ? 1200 : 320}px">${markup[scenario] ?? markup.default}</div>
  <div class="controls">
    <button id="narrow">Narrow</button>
    <button id="widen">Widen</button>
    <button id="add">Add chip</button>
    <button id="remove">Remove first</button>
    <button id="rename">Rename first</button>
  </div>
  <output aria-label="Events"></output>`
if (scenario === 'declarative') main.setHTMLUnsafe(declarative(content))
else main.innerHTML = content

const frame = main.querySelector<HTMLElement>('.frame')!
const group = main.querySelector('c2-chip-group')!
const output = main.querySelector('output')!
const log = (entry: string) => (output.textContent = output.textContent ? `${output.textContent} ${entry}` : entry)
group.addEventListener('overflow-change', (event) => log(`overflow:${event.detail.visibleCount}/${event.detail.hiddenCount}`))
group.addEventListener('expanded-change', () => log(`expanded:${group.expanded}`))

main.querySelector('#narrow')!.addEventListener('click', () => (frame.style.width = '160px'))
main.querySelector('#widen')!.addEventListener('click', () => (frame.style.width = '1200px'))
main.querySelector('#add')!.addEventListener('click', () => {
  const chip = document.createElement('c2-chip')
  chip.textContent = 'Legal'
  group.append(chip)
})
main.querySelector('#remove')!.addEventListener('click', () => group.firstElementChild?.remove())
main.querySelector('#rename')!.addEventListener('click', () => {
  const first = group.firstElementChild!
  first.textContent = first.textContent === 'Design' ? 'Design systems and tokens' : 'Design'
})

await group.updateComplete
main.dataset.ready = 'true'
