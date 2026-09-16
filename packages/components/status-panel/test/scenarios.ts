import '../src/status-panel'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

if (scenario === 'custom') {
  main.innerHTML = `
    <c2-status-panel id="subject" status="error" align="start">
      <svg slot="media" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle></svg>
      <span slot="title">Import failed</span>
      <span slot="description">One row needs attention.</span>
      <button slot="actions">Review</button>
      <div slot="content">Row 42</div>
    </c2-status-panel>`
} else if (scenario === 'dynamic') {
  main.innerHTML = `<c2-status-panel id="subject" heading="Waiting"></c2-status-panel>`
} else {
  main.innerHTML = `<c2-status-panel id="subject" status="success" heading="Workspace ready" description="You can start inviting teammates."></c2-status-panel>`
}

const subject = document.querySelector('c2-status-panel')!
await subject.updateComplete
main.dataset.ready = 'true'
