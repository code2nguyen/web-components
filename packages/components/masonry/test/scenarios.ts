import '../src/masonry'
import type { MasonryLayoutChangeDetail } from '../src/masonry-model'

declare global {
  interface Window {
    masonryEvents: MasonryLayoutChangeDetail[]
  }
}
window.masonryEvents = []

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
const tile = (index: number, rows = 8, cols = 2) =>
  `<c2-masonry-item item-id="tile-${index}" label="Tile ${index}" rows="${rows}" cols="${cols}" cols-sm="${cols}" cols-md="${cols + 1}" cols-lg="${cols + 2}"><article><h2>Tile ${index}</h2><p>Dashboard metric ${index}</p></article></c2-masonry-item>`

if (scenario === 'empty') {
  main.innerHTML = '<c2-masonry id="subject"></c2-masonry>'
} else if (scenario === 'overflow' || scenario === 'overflow-editing') {
  main.innerHTML = `<c2-masonry id="subject" ${scenario === 'overflow-editing' ? 'editable' : ''}><c2-masonry-item item-id="long" label="Long notes" rows="4" cols="3"><div style="height: 320px"><button type="button" id="content-button">Open notes</button><p>Long notes</p></div></c2-masonry-item></c2-masonry><output id="content-activations">0</output>`
  main.querySelector<HTMLButtonElement>('#content-button')!.addEventListener('click', () => {
    main.querySelector('output')!.textContent = String(Number(main.querySelector('output')!.textContent) + 1)
  })
} else if (scenario === 'own-handle') {
  const own = (index: number) =>
    `<c2-masonry-item item-id="tile-${index}" label="Tile ${index}" rows="6" cols="2" move-handle="grip-${index}"><article><header><button type="button" id="grip-${index}" aria-label="Move Tile ${index}" style="touch-action: none">Grip</button><h2>Tile ${index}</h2></header></article></c2-masonry-item>`
  main.innerHTML = `<c2-masonry id="subject" editable>${[1, 2, 3].map(own).join('')}</c2-masonry><output id="changes">0</output>`
} else if (scenario === 'pinned') {
  const tile = (index: number, pinned: boolean) =>
    `<c2-masonry-item item-id="tile-${index}" label="Tile ${index}" rows="5" cols="2" ${pinned ? 'pinned' : ''}><article><h2>Tile ${index}</h2></article></c2-masonry-item>`
  main.innerHTML = `<c2-masonry id="subject" editable>${[1, 2, 3, 4].map((index) => tile(index, index % 2 === 0)).join('')}</c2-masonry><output id="changes">0</output>`
} else if (scenario === 'actions' || scenario === 'actions-editing') {
  const withActions = (index: number) =>
    `<c2-masonry-item item-id="tile-${index}" label="Tile ${index}" rows="6" cols="2"><a href="#tile-${index}"><h2>Tile ${index}</h2></a><button type="button" slot="actions" id="menu-${index}" aria-label="Tile ${index} options">⋮</button></c2-masonry-item>`
  main.innerHTML = `<c2-masonry id="subject" ${scenario === 'actions-editing' ? 'editable' : ''}>${[1, 2, 3].map(withActions).join('')}</c2-masonry><output id="changes">0</output><output id="menu-clicks">0</output>`
  main.querySelector<HTMLButtonElement>('#menu-1')!.addEventListener('click', () => {
    main.querySelector('#menu-clicks')!.textContent = String(Number(main.querySelector('#menu-clicks')!.textContent) + 1)
  })
} else {
  const count = scenario === 'small' || scenario === 'editing' ? 3 : 12
  const editable = scenario === 'editing' || scenario === 'editing-long'
  main.innerHTML = `<div class="width-control" ${scenario === 'editing-long' ? 'style="width:500px;height:240px;overflow:auto"' : ''}><c2-masonry id="subject" ${editable ? 'editable' : ''}>${Array.from({ length: count }, (_, i) => tile(i + 1, 5 + (i % 3) * 3, 1 + (i % 3))).join('')}</c2-masonry></div><output id="changes">0</output>`
}

const subject = main.querySelector('c2-masonry')!
subject.addEventListener('layout-change', (event) => {
  window.masonryEvents.push((event as CustomEvent<MasonryLayoutChangeDetail>).detail)
  const output = main.querySelector<HTMLOutputElement>('#changes')
  if (output) output.textContent = String(Number(output.textContent) + 1)
})
await subject.updateComplete
await new Promise<void>((resolve, reject) => {
  const started = performance.now()
  const ready = () => {
    if (subject.shadowRoot?.querySelectorAll('.tile').length === subject.querySelectorAll(':scope > c2-masonry-item').length) resolve()
    else if (performance.now() - started > 2000) reject(new Error('Masonry scenario did not complete its first layout'))
    else requestAnimationFrame(ready)
  }
  requestAnimationFrame(ready)
})
main.dataset.ready = 'true'
