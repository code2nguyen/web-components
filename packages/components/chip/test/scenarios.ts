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
  'removable-label': `<c2-chip id="subject" removable><span slot="prefix" aria-hidden="true">#</span>Design</c2-chip>`,
  'comment-markers': `<c2-chip id="subject" removable><!--?lit$123$-->Design<!--?--></c2-chip>
  <c2-chip removable value="status"><!--?lit$123$--><c2-chip-part name="field"><!--?lit$123$-->Status</c2-chip-part><!--?--><c2-chip-part name="value" interactive>Active</c2-chip-part></c2-chip>`,
  'remove-label': `<c2-chip id="subject" removable remove-label="Clear filter">Status: Active</c2-chip>`,
  parts: `<c2-chip id="subject" removable value="status">
    <c2-chip-part name="field">Status</c2-chip-part>
    <c2-chip-part name="operator" interactive haspopup="listbox">is any of</c2-chip-part>
    <c2-chip-part name="value" interactive haspopup="listbox" label="Status values: Active, Paused"><span slot="prefix" aria-hidden="true">●</span>Active, Paused</c2-chip-part>
  </c2-chip>`,
  'parts-disabled-part': `<c2-chip id="subject" removable value="status">
    <c2-chip-part name="field" interactive>Status</c2-chip-part>
    <c2-chip-part name="operator" interactive disabled>is</c2-chip-part>
    <c2-chip-part name="value" interactive>Active</c2-chip-part>
  </c2-chip>`,
  'parts-selectable': `<c2-chip id="subject" selectable selected>
    <c2-chip-part name="field">Status</c2-chip-part>
    <c2-chip-part name="value" interactive>Active</c2-chip-part>
  </c2-chip>`,
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
chips.addEventListener('part-click', (event) => {
  const { name } = (event as CustomEvent<{ name: string }>).detail
  log(`part:${name}`)
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

await Promise.all(
  [...document.querySelectorAll<HTMLElementTagNameMap['c2-chip'] | HTMLElementTagNameMap['c2-chip-part']>('c2-chip, c2-chip-part')].map(
    (chip) => chip.updateComplete,
  ),
)
main.dataset.ready = 'true'
