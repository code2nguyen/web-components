import '../src/theme-select'
import type { ThemeSelectChangeDetail } from '../src/theme-select'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

// Each scenario owns its markup; the spec drives the element through real pointer and keyboard input.
const markup: Record<string, string> = {
  default: `<c2-theme-select id="subject"></c2-theme-select>`,
  'show-label': `<c2-theme-select id="subject" show-label></c2-theme-select>`,
  'two-modes': `<c2-theme-select id="subject" modes="light,dark" show-label></c2-theme-select>`,
  'menu-always': `<c2-theme-select id="subject" modes="light,dark" menu="always" show-label></c2-theme-select>`,
  'menu-never': `<c2-theme-select id="subject" menu="never" show-label></c2-theme-select>`,
  disabled: `<c2-theme-select id="subject" disabled></c2-theme-select>`,
  manual: `<c2-theme-select id="subject" manual show-label></c2-theme-select>`,
  scoped: `<c2-theme-select id="subject" target="scoped" show-label></c2-theme-select><div id="scoped">Scoped</div>`,
  restored: `<c2-theme-select id="subject" show-label></c2-theme-select>`,
  custom: `<c2-theme-select id="subject" show-label></c2-theme-select>`,
  themed: `<c2-theme-select id="subject" class="themed" show-label></c2-theme-select>`,
  // One slot per mode, filled with a marked icon so the spec can find it in the trigger and in the matching row.
  'slotted-icons': `<c2-theme-select id="subject" show-label>
    <svg slot="system-icon" data-testid="icon-system" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H4z" stroke="currentColor" fill="none" /></svg>
    <svg slot="light-icon" data-testid="icon-light" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16" stroke="currentColor" fill="none" /></svg>
    <svg slot="dark-icon" data-testid="icon-dark" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16" stroke="currentColor" fill="none" /></svg>
  </c2-theme-select>`,
}

// A stored mode must be picked up before the element upgrades, which is what a reload looks like.
if (scenario === 'restored') localStorage.setItem('c2n-theme', 'dark')
else localStorage.removeItem('c2n-theme')

main.innerHTML = `
  <button id="before">Before</button>
  ${markup[scenario] ?? markup.default}
  <button id="after">After</button>
  <output aria-label="Changes">0</output>
`

const subject = document.querySelector('c2-theme-select')!
const output = document.querySelector('output')!

if (scenario === 'custom') {
  subject.modes = [
    { value: 'system', label: 'Follow system' },
    { value: 'light', label: 'Daylight' },
    { value: 'sepia', label: 'Sepia', scheme: 'light' },
    { value: 'dark', label: 'Midnight' },
  ]
}

let count = 0
subject.addEventListener('theme-change', (event: CustomEvent<ThemeSelectChangeDetail>) => {
  count += 1
  output.textContent = `${count} ${event.detail.value} ${event.detail.theme}`
})

await subject.updateComplete
main.dataset.ready = 'true'
