import '../src/date-selector'
import type { DateRangeChangeDetail } from '../src/date-selector'
import './translations'
import { addTranslations } from '@c2n/core/localize.js'

// Lets a test add a language after the first render, as an app loading its translations lazily does.
Object.assign(window, { addTranslations })

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
if (scenario === 'single' || scenario === 'multiple') {
  subject.mode = scenario
  subject.from = ''
  subject.value = scenario === 'single' ? '2026-09-10' : '2026-09-10,2026-09-03'
}
if (scenario === 'multiple-empty') {
  subject.mode = 'multiple'
  subject.from = ''
}
if (scenario === 'marked') subject.setAttribute('marked', '2026-09-10;2026-09-14')
if (scenario === 'render-day') {
  subject.marked = ['2026-09-14']
  subject.renderDay = ({ day, marked }) => (day % 5 === 0 ? `$${day * 10}` : marked ? 'event' : undefined)
}
if (scenario.startsWith('compare-')) {
  subject.to = '2026-09-15'
  subject.compare = scenario === 'compare-year' ? 'previous-year' : 'previous-period'
}
if (scenario === 'compare-editing') subject.editing = 'compare'
if (scenario === 'footer') {
  const select = document.createElement('button')
  select.type = 'button'
  select.slot = 'footer'
  select.textContent = 'Compare to'
  const toggle = document.createElement('label')
  toggle.slot = 'footer'
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  toggle.append(checkbox, ' Compare')
  subject.append(select, toggle)
  // A control in the footer reports its own change; the selector's listeners never hear it.
  toggle.querySelector('input')!.addEventListener('change', () => (output.value = 'footer change'))
}
if (scenario === 'compare-lang') {
  // No `locale`: the built-in text follows the nearest `lang`, as the dates follow the document's.
  subject.locale = ''
  main.setAttribute('lang', 'fr')
}
if (scenario === 'no-locale') subject.locale = ''
subject.addEventListener('change', (event) => {
  const { from, to, value, compareFrom, compareTo } = (event as CustomEvent<DateRangeChangeDetail>).detail
  output.value = value === undefined ? `${from}/${to}` : `value:${value}`
  if (compareFrom !== undefined) output.value += ` vs ${compareFrom}/${compareTo}`
})
document.querySelector('form')!.addEventListener('submit', (event) => {
  event.preventDefault()
  output.value = JSON.stringify(Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)))
})

await subject.updateComplete
main.dataset.ready = 'true'
