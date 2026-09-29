import '../src/carousel'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const count = scenario === 'multi' ? 7 : scenario === 'single' ? 1 : scenario === 'default' ? 5 : 3
const slides = Array.from({ length: count }, (_, index) =>
  scenario === 'labelled' && index === 0
    ? `<div class="slide" aria-label="Cover">Slide ${index + 1}</div>`
    : `<div class="slide">Slide ${index + 1}<a href="#link-${index + 1}">Link ${index + 1}</a></div>`,
).join('')

const attributes = {
  loop: 'loop',
  autoplay: 'autoplay interval="400"',
  rtl: 'dir="rtl"',
  start: 'index="2"',
  'no-drag': 'mouse-drag="false"',
  'hover-controls': 'style="--c2-carousel__control--opacity: 0"',
  peek: 'style="--c2-carousel__slide--width: 80%; --c2-carousel__control--display: none"',
  'side-controls': 'loop style="--c2-carousel__control--opacity: 0; --c2-carousel__control__opposite--opacity: 0"',
  'side-controls-rtl': 'loop dir="rtl" style="--c2-carousel__control--opacity: 0; --c2-carousel__control__opposite--opacity: 0"',
}[scenario]

main.innerHTML = `<button id="before">Before</button>
  <c2-carousel id="subject" label="Featured" class="${scenario}" ${attributes ?? ''}>${slides}</c2-carousel>
  <output aria-label="Changes"></output>`

const subject = document.querySelector('c2-carousel')!
const output = document.querySelector('output')!
subject.addEventListener('slide-change', (event) => {
  output.textContent = `${output.textContent ? output.textContent + ',' : ''}${event.detail.previousIndex}->${event.detail.index}/${event.detail.count}`
})

await subject.updateComplete
// The slot settles on the next update; wait for it so positions are measured before the test drives the element.
await new Promise(requestAnimationFrame)
await subject.updateComplete
main.dataset.ready = 'true'
