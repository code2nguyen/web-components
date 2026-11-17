import type { Locator } from '@playwright/test'
import { accessible, expect, test } from '../../../../tests/component-fixture'
import type { DocumentChecklist, DocumentRequirement } from '../src/document-checklist'

const pdf = (name: string, contents = 'pdf') => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(contents) })

const requirements: DocumentRequirement[] = [
  { id: 'identity', label: 'Proof of identity', description: 'Passport or national ID card', status: 'approved', expires: '2031-03-03' },
  { id: 'address', label: 'Proof of address', status: 'in-review' },
  { id: 'statements', label: 'Bank statements', due: '2026-11-01', accept: '.pdf' },
  { id: 'payslip', label: 'Payslip', status: 'rejected', reason: 'the scan is blurry', due: '2026-11-30' },
  { id: 'insurance', label: 'Certificate of insurance', status: 'approved', expires: '2026-10-02' },
  { id: 'gift', label: 'Gift letter', optional: true },
]

const markup = (extra = '') =>
  `<c2-document-checklist today="2026-11-15" aria-label="Mortgage documents" ${extra} requirements='${JSON.stringify(requirements)}'></c2-document-checklist>`

const row = (checklist: Locator, id: string) => checklist.locator(`.row[data-id="${id}"]`)

test('shows each document with its status, dates and reason, and counts the required ones provided', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  const checklist = page.locator('c2-document-checklist')
  await expect(checklist.getByText('2 of 5 required documents provided')).toBeVisible()
  await expect(row(checklist, 'identity').locator('[part="status"]')).toHaveText('Approved')
  await expect(row(checklist, 'identity')).toContainText('Expires Mar 3, 2031')
  await expect(row(checklist, 'address').locator('[part="status"]')).toHaveText('In review')
  await expect(row(checklist, 'statements').locator('[part="status"]')).toHaveText('Needed')
  await expect(row(checklist, 'statements')).toContainText('Overdue · due Nov 1, 2026')
  await expect(row(checklist, 'payslip')).toContainText('Rejected: the scan is blurry')
  await expect(row(checklist, 'insurance').locator('[part="status"]')).toHaveText('Expired')
  await expect(row(checklist, 'insurance')).toContainText('Expired Oct 2, 2026')
  await expect(row(checklist, 'gift')).toContainText('(optional)')
  // Approved and in-review rows are settled: no upload button.
  await expect(checklist.getByRole('button', { name: 'Upload Proof of identity' })).toHaveCount(0)
  await expect(checklist.getByRole('button', { name: 'Replace Payslip' })).toBeVisible()
})

test('uploads a file to the row whose button was pressed from the keyboard', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<button>Before</button>${markup()}`)
  const checklist = page.locator('c2-document-checklist')
  await checklist.evaluate((element: DocumentChecklist) => {
    element.uploadHandler = (_file, { target, onProgress }) => {
      element.dataset.target = target
      onProgress(50)
      return { ok: true }
    }
  })
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(checklist.getByRole('button', { name: 'Upload Bank statements' })).toBeFocused()
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  const fileChooser = await chooser
  expect(fileChooser.isMultiple()).toBe(false)
  await fileChooser.setFiles(pdf('statements.pdf'))

  await expect(row(checklist, 'statements').locator('[part="status"]')).toHaveText('Uploaded')
  await expect(row(checklist, 'statements').getByText('statements.pdf')).toBeVisible()
  await expect(checklist).toHaveAttribute('data-target', 'statements')
  await expect(checklist.getByText('3 of 5 required documents provided')).toBeVisible()
  await expect(checklist.getByRole('button', { name: 'Replace Bank statements' })).toBeVisible()
})

test('a new file replaces the file of a single-file row; a wrong type is rejected', async ({ page, renderScenario }) => {
  await renderScenario(markup('auto-upload="false"'))
  const checklist = page.locator('c2-document-checklist')
  await checklist.evaluate((element: DocumentChecklist) => element.addFiles([new File(['a'], 'first.pdf', { type: 'application/pdf' })], 'statements'))
  await checklist.evaluate((element: DocumentChecklist) => element.addFiles([new File(['b'], 'second.pdf', { type: 'application/pdf' })], 'statements'))
  await expect
    .poll(() => checklist.evaluate((element: DocumentChecklist) => element.itemsFor('statements').map((item) => item.file.name)))
    .toEqual(['second.pdf'])

  await checklist.evaluate((element: DocumentChecklist) => element.addFiles([new File(['c'], 'photo.png', { type: 'image/png' })], 'statements'))
  await expect(checklist.getByText('photo.png is not an accepted file type.')).toBeVisible()
})

test('routes files without a row to the first documents still needed', async ({ page, renderScenario }) => {
  await renderScenario(markup('auto-upload="false"'))
  const checklist = page.locator('c2-document-checklist')
  await checklist.locator('input[type="file"]').setInputFiles([pdf('one.pdf'), pdf('two.pdf'), pdf('three.pdf')])
  const targets = await checklist.evaluate((element: DocumentChecklist) => element.items.map((item) => `${item.file.name}:${item.target}`))
  expect(targets).toEqual(['one.pdf:statements', 'two.pdf:payslip', 'three.pdf:insurance'])
  await expect(checklist.getByText('5 of 5 required documents provided')).toBeVisible()
})

test('accepts files dropped on a row', async ({ page, renderScenario }) => {
  await renderScenario(markup('auto-upload="false"'))
  const checklist = page.locator('c2-document-checklist')
  await row(checklist, 'payslip').evaluate((target) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['payslip'], 'payslip-oct.pdf', { type: 'application/pdf' }))
    target.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, composed: true, cancelable: true }))
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, composed: true, cancelable: true }))
  })
  await expect(row(checklist, 'payslip').getByText('payslip-oct.pdf')).toBeVisible()
  await expect(row(checklist, 'payslip').locator('[part="status"]')).toHaveText('Uploaded')
})

test('a reviewed row takes no file, by drop or from code', async ({ page, renderScenario }) => {
  await renderScenario(markup('auto-upload="false"'))
  const checklist = page.locator('c2-document-checklist')
  const accepted = await checklist.evaluate(
    (element: DocumentChecklist) => element.addFiles([new File(['a'], 'new-id.pdf', { type: 'application/pdf' })], 'identity').length,
  )
  expect(accepted).toBe(0)
  await expect(checklist.getByText('new-id.pdf was not added: Proof of identity is already reviewed.')).toBeVisible()
  await row(checklist, 'address').evaluate((target) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['x'], 'bill.pdf', { type: 'application/pdf' }))
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, composed: true, cancelable: true }))
  })
  await expect.poll(() => checklist.evaluate((element: DocumentChecklist) => element.items.length)).toBe(0)
})

test('submits each file under its row and drops the files of a row taken out', async ({ page, renderScenario }) => {
  await renderScenario(`<form>${markup('name="docs" auto-upload="false"')}</form>`)
  const checklist = page.locator('c2-document-checklist')
  await checklist.locator('input[type="file"]').setInputFiles([pdf('one.pdf'), pdf('two.pdf')])
  const entries = () =>
    page.locator('form').evaluate((form) => [...new FormData(form as HTMLFormElement).entries()].map(([key, value]) => `${key}=${(value as File).name}`))
  await expect.poll(entries).toEqual(['docs[statements]=one.pdf', 'docs[payslip]=two.pdf'])

  await checklist.evaluate((element: DocumentChecklist) => (element.requirements = element.requirements.filter((requirement) => requirement.id !== 'payslip')))
  await expect.poll(entries).toEqual(['docs[statements]=one.pdf'])
})

test('required asks for every non-optional document', async ({ page, renderScenario }) => {
  await renderScenario(`<form>${markup('name="documents" required auto-upload="false"')}</form>`)
  const checklist = page.locator('c2-document-checklist')
  await expect.poll(() => checklist.evaluate((element: DocumentChecklist) => element.validationMessage)).toBe('Please provide every required document.')
  await checklist.locator('input[type="file"]').setInputFiles([pdf('one.pdf'), pdf('two.pdf'), pdf('three.pdf')])
  await expect.poll(() => checklist.evaluate((element: DocumentChecklist) => element.validity.valid)).toBe(true)
})

test('renders application actions per row and the actions zone', async ({ page, renderScenario }) => {
  await renderScenario(markup().replace('></c2-document-checklist>', '><button slot="actions">Submit for review</button></c2-document-checklist>'))
  const checklist = page.locator('c2-document-checklist')
  await checklist.evaluate((element: DocumentChecklist) => {
    element.renderActions = ({ requirement, status }) => (status === 'approved' ? `View ${requirement.label}` : undefined)
  })
  await expect(row(checklist, 'identity').locator('.side')).toContainText('View Proof of identity')
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeVisible()
  await expect(checklist.locator('.actions')).toBeVisible()
})

test('reads in the language of the page', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${markup()}</div>`)
  const checklist = page.locator('c2-document-checklist')
  await expect(checklist.getByText('2 documents obligatoires fournis sur 5')).toBeVisible()
  await expect(row(checklist, 'statements')).toContainText('En retard · attendu le 1 nov. 2026')
  await expect(checklist.getByRole('button', { name: 'Envoyer : Bank statements' })).toBeVisible()
})

test('has no detectable accessibility violations', async ({ page, renderScenario }) => {
  await renderScenario(markup('auto-upload="false"'))
  await page
    .locator('c2-document-checklist')
    .evaluate((element: DocumentChecklist) => element.addFiles([new File(['a'], 'a.pdf', { type: 'application/pdf' })], 'statements'))
  await accessible(page)
})
