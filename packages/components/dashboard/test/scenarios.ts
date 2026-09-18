import '../src/dashboard'
import type { Dashboard, DashboardLayoutChangeDetail } from '../src/dashboard'
import type { DashCard, DashCardExpandChangeDetail } from '../src/dash-card'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
const output = document.querySelector('output')!

const STORAGE_KEY = 'c2n-dashboard-test'

// Each scenario owns its markup; the spec drives the grid through real pointer and keyboard input.
const markup: Record<string, string> = {
  default: `<c2-dashboard id="subject" columns="2" rows="1">
      <c2-dash-card id="one" col="1" row="1"><div class="pane">One</div></c2-dash-card>
      <c2-dash-card id="two" col="2" row="1"><div class="pane">Two</div></c2-dash-card>
    </c2-dashboard>`,
  // The second card asks for 240px, which is what stops a drag long before the grid's own floor of 50px.
  'min-width': `<c2-dashboard id="subject" columns="2" rows="1">
      <c2-dash-card id="one" col="1" row="1"><div class="pane">One</div></c2-dash-card>
      <c2-dash-card id="two" col="2" row="1" min-width="240"><div class="pane">Two</div></c2-dash-card>
    </c2-dashboard>`,
  grid: `<c2-dashboard id="subject" columns="2" rows="2">
      <c2-dash-card id="one" col="1" row="1" row-span="2" expand-full><span slot="header">One</span><div class="pane">One</div></c2-dash-card>
      <c2-dash-card id="two" col="2" row="1" expand-width expand-height><span slot="header">Two</span><div class="pane">Two</div></c2-dash-card>
      <c2-dash-card id="three" col="2" row="2"><span slot="header">Three</span><div class="pane">Three</div></c2-dash-card>
    </c2-dashboard>`,
  // Nothing flexes here, so a drag can only take the free space that is left.
  'fixed-tracks': `<c2-dashboard id="subject" columns="200px 200px" rows="1">
      <c2-dash-card id="one" col="1" row="1"><div class="pane">One</div></c2-dash-card>
      <c2-dash-card id="two" col="2" row="1"><div class="pane">Two</div></c2-dash-card>
    </c2-dashboard>`,
  // Everything a consumer can put around the built-in controls: own actions, own buttons in the group, a footer,
  // and its own icon for the state on screen.
  slots: `<c2-dashboard id="subject" columns="2" rows="1">
      <c2-dash-card id="one" col="1" row="1" expand-full>
        <span slot="header">One</span>
        <button slot="actions" type="button">Refresh</button>
        <button slot="controls" type="button" aria-label="Close pane">x</button>
        <svg slot="expand-full-icon" data-testid="icon-expand" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z" /></svg>
        <svg slot="collapse-full-icon" data-testid="icon-collapse" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h8v8H8z" /></svg>
        <div class="pane">One</div>
        <span slot="footer">Updated 2 minutes ago</span>
      </c2-dash-card>
      <c2-dash-card id="two" col="2" row="1"><div class="pane">Two</div></c2-dash-card>
    </c2-dashboard>`,
  fixed: `<c2-dashboard id="subject" columns="2" rows="1">
      <c2-dash-card id="one" col="1" row="1" resize="none"><div class="pane">One</div></c2-dash-card>
      <c2-dash-card id="two" col="2" row="1" resize="none"><div class="pane">Two</div></c2-dash-card>
    </c2-dashboard>`,
  // Two scenarios over one storage key: the spec resizes in the first and reloads into the second.
  storage: `<c2-dashboard id="subject" columns="2" rows="1" storage-key="${STORAGE_KEY}">
      <c2-dash-card id="one" col="1" row="1"><div class="pane">One</div></c2-dash-card>
      <c2-dash-card id="two" col="2" row="1"><div class="pane">Two</div></c2-dash-card>
    </c2-dashboard>`,
  layout: `<c2-dashboard id="subject" columns="2" rows="1">
      <c2-dash-card id="one" card-id="one" col="1" row="1"><div class="pane">One</div></c2-dash-card>
      <c2-dash-card id="two" card-id="two" col="2" row="1"><div class="pane">Two</div></c2-dash-card>
    </c2-dashboard>`,
  // A card appended after the grid is alive has to find it and get its handles.
  late: `<c2-dashboard id="subject" columns="2" rows="1">
      <c2-dash-card id="one" col="1" row="1"><div class="pane">One</div></c2-dash-card>
    </c2-dashboard>`,
  // Two columns by default, one column of two rows under 600px; the spec resizes the viewport across that line.
  responsive: `<c2-dashboard id="subject" columns="2" rows="1" storage-key="${STORAGE_KEY}">
      <c2-dash-card id="one" card-id="one" col="1" row="1"><div class="pane">One</div></c2-dash-card>
      <c2-dash-card id="two" card-id="two" col="2" row="1"><div class="pane">Two</div></c2-dash-card>
    </c2-dashboard>`,
}

markup['storage-restored'] = markup.storage
markup.motion = markup.layout

if (scenario !== 'storage-restored') {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(`${STORAGE_KEY}@(max-width: 600px)`)
}

main.innerHTML = markup[scenario] ?? markup.default

const subject = document.querySelector<Dashboard>('#subject')!

if (scenario === 'layout') {
  subject.layout = { one: { col: 2 }, two: { visible: false } }
}

// Buttons the spec drives: hide and show `#two` through the layout record, and dismiss it.
if (scenario === 'motion') {
  const controls = document.createElement('div')
  controls.innerHTML = `<button id="hide" type="button">Hide</button><button id="show" type="button">Show</button><button id="dismiss" type="button">Dismiss</button>`
  main.after(controls)
  controls.querySelector('#hide')!.addEventListener('click', () => (subject.layout = { two: { visible: false } }))
  controls.querySelector('#show')!.addEventListener('click', () => (subject.layout = { two: { visible: true } }))
  controls.querySelector('#dismiss')!.addEventListener('click', () => {
    void document
      .querySelector<DashCard>('#two')!
      .dismiss()
      .then(() => (output.textContent = 'dismissed'))
  })
}

if (scenario === 'responsive') {
  subject.layouts = [{ media: '(max-width: 600px)', columns: 1, rows: 2, layout: { one: { col: 1, row: 1 }, two: { col: 1, row: 2 } } }]
}

let changes = 0
subject.addEventListener('layout-change', (event: CustomEvent<DashboardLayoutChangeDetail>) => {
  changes += 1
  output.textContent = `${changes} ${event.detail.columns.join('|')} ${event.detail.rows.join('|')}`
})

for (const card of main.querySelectorAll('c2-dash-card')) {
  card.addEventListener('expand-change', (event: CustomEvent<DashCardExpandChangeDetail>) => {
    output.textContent = `${card.id} ${event.detail.expanded}`
  })
}

if (scenario === 'late') {
  // After the grid's first render, as a card added by the app at runtime would be.
  await subject.updateComplete
  const card = document.createElement('c2-dash-card')
  card.id = 'two'
  card.col = 2
  card.innerHTML = '<div class="pane">Two</div>'
  subject.append(card)
  await card.updateComplete
}

await subject.updateComplete
main.dataset.ready = 'true'
