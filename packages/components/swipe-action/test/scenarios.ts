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

const subject = document.querySelector('c2-swipe-action')!
const log = document.querySelector('output')!
const write = (text: string) => (log.textContent = `${log.textContent ? `${log.textContent},` : ''}${text}`)
subject.addEventListener('open-change', (event) => write(`open:${event.detail.open || 'none'}`))
subject.addEventListener('full-swipe', (event) => write(`full:${event.detail.side}`))
for (const button of subject.querySelectorAll('button')) button.addEventListener('click', () => write(`click:${button.id}`))
subject.querySelector('span')!.addEventListener('click', () => write('click:content'))

await subject.updateComplete
main.dataset.ready = 'true'
