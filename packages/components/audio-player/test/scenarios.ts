import '../src/audio-player'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML = `<c2-audio-player id="subject"></c2-audio-player>`

const subject = document.querySelector('c2-audio-player')!
// Branch on `scenario` to set up each state the spec drives, rather than mutating the element from the test.
if (scenario === 'disabled') subject.toggleAttribute('disabled', true)

await subject.updateComplete
main.dataset.ready = 'true'
