import '../src/upload'
import type { Upload } from '../src/upload'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML =
  scenario === 'form'
    ? '<form><c2-upload id="subject" name="documents" multiple required auto-upload="false"></c2-upload></form>'
    : '<c2-upload id="subject" aria-label="Project files"></c2-upload>'

const subject = document.querySelector<Upload>('#subject')!
let selectedEvents = 0
let inputEvents = 0
let changeEvents = 0
subject.addEventListener('files-selected', () => {
  selectedEvents += 1
  subject.dataset.selectedEvents = String(selectedEvents)
})
subject.addEventListener('input', () => {
  inputEvents += 1
  subject.dataset.inputEvents = String(inputEvents)
})
subject.addEventListener('change', () => {
  changeEvents += 1
  subject.dataset.changeEvents = String(changeEvents)
})
subject.addEventListener('file-reject', (event) => {
  subject.dataset.rejections = event.detail.rejections.map((rejection) => rejection.reason).join(',')
})

if (scenario === 'progress') {
  subject.multiple = true
  const finish = document.createElement('button')
  finish.type = 'button'
  finish.textContent = 'Finish uploads'
  main.append(finish)
  const pending: Array<() => void> = []
  subject.uploadHandler = (_file, { onProgress, signal }) =>
    new Promise((resolve, reject) => {
      onProgress(42)
      pending.push(() => resolve({ uploaded: true }))
      signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })
    })
  finish.addEventListener('click', () => pending.splice(0).forEach((resolve) => resolve()))
}

if (scenario === 'retry') {
  let attempts = 0
  subject.uploadHandler = async (_file, { onProgress }) => {
    attempts += 1
    subject.dataset.attempts = String(attempts)
    if (attempts === 1) throw new Error('Network unavailable')
    onProgress(75)
    return { uploaded: true }
  }
}

if (scenario === 'validation') {
  subject.multiple = true
  subject.accept = '.pdf,image/*'
  subject.maxFiles = 2
  subject.maxSize = 4
  subject.autoUpload = false
}

if (scenario === 'drop') {
  subject.multiple = true
  subject.autoUpload = false
}

if (scenario === 'compact') {
  subject.variant = 'compact'
  subject.multiple = true
  subject.maxFiles = 3
  subject.autoUpload = false
}

if (scenario === 'multiple-capacity') {
  subject.multiple = true
  subject.maxFiles = 3
  subject.autoUpload = false
}

if (scenario === 'disabled') subject.disabled = true

await subject.updateComplete
main.dataset.ready = 'true'
