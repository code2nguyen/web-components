import '../src/attachment'
import type { FilePreview } from '../src/file-preview'
import './translations'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

// An 800×600 image, so zoom has room to grow.
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#93c5fd"/><circle cx="400" cy="300" r="120" fill="#1d4ed8"/></svg>')}`
// Another origin: the preview must never read it. Nothing listens there, so nothing is fetched either.
const elsewhere = 'http://127.0.0.1:9/'

const examples: Record<string, string> = {
  default: '<c2-attachment name="project-brief.pdf" type="PDF" size="2.4 MB" removable></c2-attachment>',
  uploading: '<c2-attachment name="video.mp4" type="MP4" size="18 MB" status="uploading" progress="42" removable></c2-attachment>',
  error: '<c2-attachment name="invoice.csv" type="CSV" size="84 KB" status="error" removable></c2-attachment>',
  disabled: '<c2-attachment name="locked.pdf" status="error" removable disabled></c2-attachment>',
  group: `<c2-attachment-group layout="grid" aria-label="Project files">
    <c2-attachment name="brief.pdf"></c2-attachment>
    <c2-attachment name="budget.xlsx"></c2-attachment>
  </c2-attachment-group>`,
  mixed: `<c2-attachment-group layout="mixed" aria-label="Mixed files">
    <c2-attachment layout="tile" name="cover.png"><span slot="media">Preview</span></c2-attachment>
    <c2-attachment name="brief.pdf"></c2-attachment>
  </c2-attachment-group>`,
  icons: `<c2-attachment-group>
    <c2-attachment name="archive.zip"></c2-attachment>
    <c2-attachment name="component.ts"></c2-attachment>
    <c2-attachment name="report.pdf"></c2-attachment>
    <c2-attachment name="unknown.bin"></c2-attachment>
  </c2-attachment-group>`,
  slots: `<c2-attachment name="fallback.txt">
    <span slot="media">CUSTOM</span>
    <span slot="name">Custom name</span>
    <span slot="metadata">Reviewed today</span>
    <button slot="actions">Download</button>
  </c2-attachment>`,
  'preview-group': `<c2-attachment-group aria-label="Shared files">
    <c2-attachment preview name="cover.svg" type="SVG" size="2 KB" src="${image}" layout="row"></c2-attachment>
    <c2-attachment preview name="notes.txt" type="Text" size="1 KB" href="./sample.txt"></c2-attachment>
    <c2-attachment name="budget.xlsx" type="Spreadsheet"></c2-attachment>
    <c2-attachment preview name="report.pdf" type="PDF" href="./sample.pdf"></c2-attachment>
  </c2-attachment-group>`,
  'preview-disabled': '<c2-attachment preview disabled name="notes.txt" href="./sample.txt"></c2-attachment>',
  'fp-image': `<c2-file-preview style="width:480px;--c2-file-preview--height:360px" items='${JSON.stringify([
    { name: 'cover.svg', src: image, type: 'image/svg+xml', size: '2 KB' },
    { name: 'notes.txt', src: './sample.txt' },
    { name: 'archive.zip', src: './archive.zip', size: '4 MB' },
  ])}'></c2-file-preview>`,
  'fp-single': `<c2-file-preview name="notes.txt" src="./sample.txt" size="1 KB"></c2-file-preview>`,
  'fp-text-file': '<c2-file-preview></c2-file-preview>',
  'fp-text-elsewhere': `<c2-file-preview name="secrets.txt" src="${elsewhere}secrets.txt"></c2-file-preview>`,
  'fp-pdf-file': '<c2-file-preview></c2-file-preview>',
  'fp-pdf-own': '<c2-file-preview name="report.pdf" src="./sample.pdf"></c2-file-preview>',
  'fp-pdf-elsewhere': `<c2-file-preview name="report.pdf" src="${elsewhere}report.pdf"></c2-file-preview>`,
  'fp-unsafe': `<c2-file-preview name="report.pdf" src="javascript:alert(1)"></c2-file-preview>`,
  'fp-empty': '<c2-file-preview></c2-file-preview>',
  'fp-lang': `<div lang="fr"><c2-file-preview items='${JSON.stringify([
    { name: 'a.txt', text: 'un' },
    { name: 'b.txt', text: 'deux' },
  ])}'></c2-file-preview></div>`,
  'fp-render': '<c2-file-preview name="report.pdf" src="./sample.pdf"></c2-file-preview>',
  'fp-modal': `<c2-file-preview modal name="notes.txt" src="./sample.txt"></c2-file-preview>`,
}

main.innerHTML = examples[scenario] ?? examples.default
if (scenario.startsWith('fp-')) await import('../src/file-preview')

const preview = main.querySelector('c2-file-preview') as FilePreview | null
if (preview && scenario === 'fp-text-file') {
  preview.items = [{ name: 'page.html', file: new File(['<script>window.ran = true</script><b>bold?</b>'], 'page.html', { type: 'text/html' }) }]
}
if (preview && scenario === 'fp-pdf-file') {
  preview.items = [{ name: 'upload.pdf', file: new File([await (await fetch('./sample.pdf')).blob()], 'upload.pdf') }]
}
if (preview && scenario === 'fp-render') {
  preview.renderViewer = ({ kind, item }) => (kind === 'pdf' ? Object.assign(document.createElement('p'), { textContent: `Custom ${item.name}` }) : undefined)
}

await Promise.all(
  [...main.querySelectorAll('c2-attachment, c2-attachment-group, c2-file-preview')].map(
    (element) => (element as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete,
  ),
)
main.dataset.ready = 'true'
