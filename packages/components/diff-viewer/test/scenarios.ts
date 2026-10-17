import '../src/diff-viewer'
import { diffLines } from '../src/diff-viewer'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

/** Twenty numbered lines, the tenth changed: folds above and below the change. */
const long = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)
const longModified = long.map((line, i) => (i === 9 ? 'line ten' : line))

const PLAN = `name: shop
start_url: https://shop.example/list
selectors:
  item: .card
  price: .price
`
const REPAIRED = `name: shop
start_url: https://shop.example/list
selectors:
  item: article.product
  price: .price
  title: h2
`

const texts: Record<string, [string, string, string?]> = {
  default: [PLAN, REPAIRED, 'line-numbers original-label="Current plan" modified-label="Repaired plan"'],
  split: [PLAN, REPAIRED, 'mode="split" line-numbers original-label="Current plan" modified-label="Repaired plan"'],
  narrow: [PLAN, REPAIRED, 'mode="split" line-numbers'],
  insert: ['a\nb\nc\n', 'a\nb\nX\nc\n', 'line-numbers'],
  delete: ['a\nb\nc\n', 'a\nc\n', 'line-numbers'],
  change: ['price: 10\n', 'price: 12\n'],
  rewrite: ['alpha beta\n', 'something else entirely\n'],
  identical: [long.join('\n') + '\n', long.join('\n') + '\n'],
  'empty-original': ['', 'a\nb\n', 'line-numbers'],
  'empty-modified': ['a\nb', '', 'line-numbers'],
  'both-empty': ['', ''],
  newline: ['a\nb', 'a\nb\n', 'line-numbers'],
  crlf: ['a\r\nb\r\n', 'a\nb\n'],
  fold: [long.join('\n') + '\n', longModified.join('\n') + '\n', 'line-numbers label="Plan changes"'],
  'fold-split': [long.join('\n') + '\n', longModified.join('\n') + '\n', 'mode="split" line-numbers'],
  'context-0': [long.join('\n') + '\n', longModified.join('\n') + '\n', 'context="0"'],
  'context-all': [long.join('\n') + '\n', longModified.join('\n') + '\n', 'context="-1"'],
  scroll: [long.join('\n') + '\n', longModified.map((l) => `${l} changed`).join('\n') + '\n', 'style="--c2-diff-viewer--max-height: 120px"'],
}

const [original, modified, attributes = ''] = texts[scenario] ?? texts.default
if (scenario === 'narrow') main.classList.add('narrow')

main.innerHTML = `<div>
    <button id="toggle-mode">Toggle layout</button>
    <button id="expand-all">Expand all</button>
    <button id="replace">Replace texts</button>
  </div>
  <c2-diff-viewer id="subject" ${attributes}></c2-diff-viewer>
  <output aria-label="Events"></output>`

const subject = document.querySelector('c2-diff-viewer')!
// The application owns the texts, as a review page that loads both versions would.
subject.original = original
subject.modified = modified

const output = document.querySelector('output')!
const log: string[] = []
subject.addEventListener('fold-expand', (event) => {
  log.push(`expand:${event.detail.originalStart}/${event.detail.modifiedStart}/${event.detail.count}`)
  output.textContent = log.join(' ')
})
document.querySelector('#toggle-mode')!.addEventListener('click', () => {
  subject.mode = subject.mode === 'split' ? 'unified' : 'split'
})
document.querySelector('#expand-all')!.addEventListener('click', () => subject.expandAll())
document.querySelector('#replace')!.addEventListener('click', () => {
  subject.original = 'one\n'
  subject.modified = 'two\n'
})

// Exposes the pure diff to the spec for cases the rendered table cannot show compactly.
;(window as unknown as { diffLines: typeof diffLines }).diffLines = diffLines

await subject.updateComplete
main.dataset.ready = 'true'
