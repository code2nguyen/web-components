import '../src/attachment'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

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
}

main.innerHTML = examples[scenario] ?? examples.default
await Promise.all(
  [...main.querySelectorAll('c2-attachment, c2-attachment-group')].map(
    (element) => (element as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete,
  ),
)
main.dataset.ready = 'true'
