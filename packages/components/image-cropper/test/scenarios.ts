// The app's language: French, added as an app would.
import './translations.js'
import '../src/image-cropper'

/** A 400 × 300 image drawn in four coloured quadrants, so the suite needs no network. */
function quadrants() {
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 300
  const context = canvas.getContext('2d')!
  const colours = ['#ef4444', '#22c55e', '#3b82f6', '#eab308']
  colours.forEach((colour, index) => {
    context.fillStyle = colour
    context.fillRect((index % 2) * 200, Math.floor(index / 2) * 150, 200, 150)
  })
  return canvas.toDataURL('image/png')
}

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
const attributes: Record<string, string> = {
  default: '',
  square: 'aspect-ratio="1"',
  ellipse: 'aspect-ratio="1" shape="ellipse"',
  authored: `crop='{"x":10,"y":20,"width":100,"height":50}'`,
  disabled: 'disabled',
  french: 'lang="fr"',
  'authored-square': `aspect-ratio="1" crop='{"x":0,"y":0,"width":200,"height":100}'`,
  rtl: 'dir="rtl"',
}
const src = scenario === 'empty' ? '' : quadrants()
main.innerHTML = `<button id="before">Before</button>
  <c2-image-cropper id="subject" alt="Four coloured quadrants" ${attributes[scenario] ?? ''}>
    <p slot="placeholder">Choose an image</p>
  </c2-image-cropper>
  <pre aria-label="Crop events"></pre>`

const subject = document.querySelector('c2-image-cropper')!
const log = document.querySelector('pre')!
const counts = { 'crop-input': 0, 'crop-change': 0 }
for (const type of ['crop-input', 'crop-change'] as const) {
  subject.addEventListener(type, () => {
    counts[type]++
    log.textContent = `input:${counts['crop-input']} change:${counts['crop-change']}`
  })
}

if (src) {
  const loaded = new Promise((resolve) => subject.addEventListener('load', resolve, { once: true }))
  subject.src = src
  await loaded
}
await subject.updateComplete
main.dataset.ready = 'true'
