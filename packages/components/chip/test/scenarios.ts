import '../src/chip'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
const icon = `<svg slot="prefix" data-testid="prefix" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="currentColor" /></svg>`

const markup: Record<string, string> = {
  default: `<c2-chip id="subject">Design</c2-chip>`,
  prefix: `<c2-chip id="subject">${icon}Design</c2-chip>`,
  selectable: `<c2-chip id="subject" selectable value="design">Design</c2-chip>`,
  selected: `<c2-chip id="subject" selectable selected value="design">Design</c2-chip>`,
  removable: `<c2-chip id="subject" removable value="design">Design</c2-chip>`,
  'selectable-removable': `<c2-chip id="subject" selectable removable value="design">Design</c2-chip>`,
  disabled: `<c2-chip id="subject" selectable removable disabled value="design">Design</c2-chip>`,
  'remove-label': `<c2-chip id="subject" removable remove-label="Clear filter">Status: Active</c2-chip>`,
  list: `<c2-chip selectable removable value="design">Design</c2-chip>
    <c2-chip selectable removable value="research">Research</c2-chip>
    <c2-chip selectable removable value="ops">Operations</c2-chip>`,
}

main.innerHTML = `<button id="before">Before</button>
  <div class="chips">${markup[scenario] ?? markup.default}</div>
  <button id="after">After</button>
  <output aria-label="Events"></output>`

const output = document.querySelector('output')!
const log = (entry: string) => (output.textContent = output.textContent ? `${output.textContent} ${entry}` : entry)
const chips = main.querySelector('.chips')!
chips.addEventListener('change', (event) => {
  const chip = event.target as HTMLElementTagNameMap['c2-chip']
  log(`change:${chip.value}:${chip.selected}`)
})
chips.addEventListener('remove', (event) => {
  const { value } = (event as CustomEvent<{ value: string }>).detail
  log(`remove:${value}`)
  // The application owns the list: the list scenario drops the chip and moves focus to its neighbour.
  if (scenario === 'list') {
    const chip = event.target as HTMLElement
    const next = (chip.nextElementSibling ?? chip.previousElementSibling) as HTMLElement | null
    chip.remove()
    next?.focus()
  }
})

await Promise.all([...document.querySelectorAll('c2-chip')].map((chip) => chip.updateComplete))
main.dataset.ready = 'true'
