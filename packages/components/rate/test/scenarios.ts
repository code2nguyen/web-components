import '../src/rate'
import type { Rate } from '../src/rate'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML =
  scenario === 'form'
    ? '<form><c2-rate id="subject" name="score" required aria-label="Product rating"></c2-rate></form>'
    : '<c2-rate id="subject" value="2" aria-label="Product rating"></c2-rate>'

const subject = document.querySelector<Rate>('#subject')!
if (scenario === 'half') subject.allowHalf = true
if (scenario === 'clearable') subject.clearable = true
if (scenario === 'readonly') subject.readonly = true
if (scenario === 'disabled') subject.disabled = true

subject.addEventListener('rate-change', (event) => {
  subject.dataset.change = String(event.detail.value)
})

await subject.updateComplete
main.dataset.ready = 'true'
