import '../src/date-selector'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML = `
  <form>
    <c2-date-selector id="subject" locale="en-US" months="1" from="2026-09-10" name="trip" required></c2-date-selector>
    <button type="reset">Reset</button>
    <button type="submit">Submit</button>
    <output aria-label="Selection"></output>
  </form>
`

const subject = document.querySelector('c2-date-selector')!
const output = document.querySelector('output')!
if (scenario === 'complete') subject.to = '2026-09-15'
if (scenario === 'constrained') {
  subject.min = '2026-09-08'
  subject.max = '2026-09-20'
}
if (scenario === 'disabled') subject.disabled = true
subject.addEventListener('change', (event) => {
  const { from, to } = (event as CustomEvent<{ from: string; to: string }>).detail
  output.value = `${from}/${to}`
})
document.querySelector('form')!.addEventListener('submit', (event) => {
  event.preventDefault()
  output.value = JSON.stringify(Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)))
})

await subject.updateComplete
main.dataset.ready = 'true'
