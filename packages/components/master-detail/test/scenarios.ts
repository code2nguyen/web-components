import '../src/master-detail'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'split'
const main = document.querySelector('main')!

const widths: Record<string, number> = { split: 900, stack: 400, overlay: 600, cancel: 400, 'custom-back': 400, resize: 900, 'split-open': 900 }
const attributes: Record<string, string> = {
  overlay: 'collapse="overlay"',
  'split-open': 'open',
}
const records = [
  { id: 'ana', from: 'Ana Ruiz', subject: 'Invoice 2041 charged twice' },
  { id: 'kenji', from: 'Kenji Watanabe', subject: 'SSO login loops back' },
  { id: 'priya', from: 'Priya Natarajan', subject: 'CSV export drops a column' },
]

main.innerHTML = `<button id="before">Before</button>
  <div id="frame" style="width: ${widths[scenario] ?? 900}px; height: 360px; border: 1px solid #e4e4e7">
    <c2-master-detail id="subject" style="height: 100%" ${attributes[scenario] ?? ''}>
      <nav slot="master" aria-label="Inbox">
        ${records.map((record) => `<button type="button" data-id="${record.id}" style="display: block; width: 100%; padding: 12px; text-align: start">${record.from}</button>`).join('')}
      </nav>
      <article slot="detail">
        ${scenario === 'custom-back' ? '<button type="button" master-detail-back>Close record</button>' : ''}
        <h2 id="title">${records[0].subject}</h2>
        <p>Message body.</p>
        <button type="button">Reply</button>
      </article>
      <p slot="placeholder">Select a conversation</p>
    </c2-master-detail>
  </div>
  <output aria-label="Events"></output>`

if (scenario === 'custom-back') {
  const style = document.createElement('style')
  style.textContent = `c2-master-detail { --c2-master-detail__toolbar--display: none } c2-master-detail:state(split) [master-detail-back] { display: none }`
  document.head.append(style)
}

const subject = document.querySelector('c2-master-detail')!
const output = document.querySelector('output')!
const title = document.querySelector('#title')!
const log = (text: string) => (output.textContent = [output.textContent, text].filter(Boolean).join(' '))

// The master is the app's list: picking a record fills the detail and opens it.
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-id]')) {
  button.addEventListener('click', () => {
    title.textContent = records.find((record) => record.id === button.dataset.id)!.subject
    subject.open = true
  })
}
subject.addEventListener('close-request', (event) => {
  log(`close:${event.detail.reason}`)
  if (scenario === 'cancel') event.preventDefault()
})
subject.addEventListener('layout-change', (event) => log(`layout:${event.detail.layout}`))

await subject.updateComplete
// The first measurement lands on the next resize observation.
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
main.dataset.ready = 'true'
