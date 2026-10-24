import '../src/swipe-action'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
if (scenario === 'rtl') main.dir = 'rtl'
const flags = [scenario === 'full-swipe' || scenario === 'wrapped' ? 'full-swipe' : '', scenario === 'disabled' ? 'disabled' : ''].join(' ')
const startActions = scenario === 'end-only' ? '' : `<button slot="start" id="archive" style="width: 80px">Archive</button>`
main.innerHTML = `
  <c2-swipe-action id="subject" ${flags}>
    ${startActions}
    <span>Quarterly report</span>
    <button slot="end" id="flag" style="width: 72px">Flag</button>
    ${
      scenario === 'wrapped'
        ? `<div slot="end" style="display: contents"><button id="delete" style="width: 80px">Delete</button></div>`
        : `<button slot="end" id="delete" style="width: 80px">Delete</button>`
    }
  </c2-swipe-action>
  <button id="outside">Outside</button>
  <output id="log"></output>
`

if (scenario === 'list') {
  await Promise.all([import('@c2n/list'), import('@c2n/list-item')])
  // Rows of a c2-list, formatted with whitespace, each with keyboard shortcuts for its actions.
  const row = (value: string, label: string) => `
    <c2-swipe-action>
      <c2-list-item value="${value}">${label}</c2-list-item>
      <button slot="start" id="archive-${value}" aria-keyshortcuts="A">Archive</button>
      <button slot="end" id="delete-${value}" aria-keyshortcuts="Delete Backspace">Delete</button>
    </c2-swipe-action>`
  main.innerHTML = `
    <c2-list aria-label="Inbox">${row('a', 'Apple')}${row('b', 'Banana')}${row('c', 'Cherry')}</c2-list>
    <button id="outside">Outside</button>
    <output id="log"></output>`
}

const subject = document.querySelector('c2-swipe-action')!
const log = document.querySelector('output')!
const write = (text: string) => (log.textContent = `${log.textContent ? `${log.textContent},` : ''}${text}`)
subject.addEventListener('open-change', (event) => write(`open:${event.detail.open || 'none'}`))
subject.addEventListener('full-swipe', (event) => write(`full:${event.detail.side}`))
for (const button of main.querySelectorAll('c2-swipe-action button')) button.addEventListener('click', () => write(`click:${button.id}`))
subject.querySelector('span')?.addEventListener('click', () => write('click:content'))
main.querySelector('c2-list')?.addEventListener('selection-change', (event) => write(`select:${event.detail.value.join('|')}`))

await subject.updateComplete
await main.querySelector('c2-list')?.updateComplete
main.dataset.ready = 'true'
