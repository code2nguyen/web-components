import '../src/calendar'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML = `
  <form>
    <c2-calendar id="subject" locale="en-US" value="2026-09-10" name="day" required></c2-calendar>
    <button type="reset">Reset</button>
    <button type="submit">Submit</button>
    <output aria-label="Selection"></output>
  </form>
`

const subject = document.querySelector('c2-calendar')!
const output = document.querySelector('output')!
if (scenario === 'empty') subject.removeAttribute('value')
if (scenario === 'constrained') {
  subject.min = '2026-09-08'
  subject.max = '2026-09-20'
}
if (scenario === 'disabled') subject.disabled = true
if (scenario === 'sunday') subject.weekStart = 'sunday'
subject.addEventListener('change', () => (output.value = subject.value))
document.querySelector('form')!.addEventListener('submit', (event) => {
  event.preventDefault()
  output.value = JSON.stringify(Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)))
})

await subject.updateComplete
main.dataset.ready = 'true'
