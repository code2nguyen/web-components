import type { Markdown } from '@c2n/components/markdown'

/**
 * Streams a canned assistant answer into every `c2-markdown[data-markdown-demo]` the way a model sends one: chunks of
 * a few characters to a few words with irregular pauses, so the docs show the healing (bold, links, the code fence)
 * and the steady reveal. A `[data-markdown-action="replay"]` button in the same `[data-markdown-demo-box]` restarts it. Doc pages load this
 * through `StreamingExamples.astro`, the landing page through `component-modules.ts`.
 */
const answers: Record<string, string> = {
  preview: '**Checkout is slow** since the 14:02 deploy:\n\n- retries without backoff\n- a synchronous [risk check](https://example.com)',
  answer: [
    '## Why checkout slowed down',
    '',
    'The p95 latency of **`POST /checkout`** rose from 180 ms to 1.4 s right after the *14:02* deploy. Three things changed:',
    '',
    '1. The payments client now retries on `ETIMEDOUT` **without backoff**.',
    '2. A new fraud check calls the [risk API](https://example.com/risk) synchronously.',
    '3. ~~The cache warm-up~~ was not affected.',
    '',
    'Roll back the client, or add jittered backoff:',
    '',
    '```ts',
    'const delay = Math.min(1000, 100 * 2 ** attempt) * (0.5 + Math.random())',
    'await sleep(delay)',
    '```',
    '',
    '| Step | p95 before | p95 after |',
    '| :--- | ---: | ---: |',
    '| Fraud check | — | 620 ms |',
    '| Payment | 140 ms | 710 ms |',
    '',
    'The expected cost of a retry storm grows like $\\sum_{k=0}^{n} 2^k = 2^{n+1} - 1$ requests.',
  ].join('\n'),
}

const timers = new WeakMap<Markdown, number>()

function play(element: Markdown): void {
  const text = answers[element.dataset.markdownDemo ?? ''] ?? answers.answer
  window.clearTimeout(timers.get(element))
  element.clear()
  element.streaming = true
  let index = 0
  const next = () => {
    if (index >= text.length) {
      element.streaming = false
      return
    }
    const size = 2 + Math.floor(Math.random() * 24)
    element.appendText(text.slice(index, index + size))
    index += size
    timers.set(element, window.setTimeout(next, 30 + Math.random() * 260))
  }
  timers.set(element, window.setTimeout(next, 300))
}

function wire(element: Markdown): void {
  if (element.dataset.markdownWired) return
  element.dataset.markdownWired = 'true'
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return
    observer.disconnect()
    play(element)
  })
  observer.observe(element)
}

void customElements.whenDefined('c2-markdown').then(() => {
  const scan = () => document.querySelectorAll<Markdown>('c2-markdown[data-markdown-demo]').forEach(wire)
  scan()
  document.addEventListener('astro:page-load', scan)
  // One listener for every Replay button: it works whichever of the button and the element hydrates first.
  document.addEventListener('click', (event) => {
    const button = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.dataset.markdownAction === 'replay')
    const element = button?.closest('[data-markdown-demo-box]')?.querySelector<Markdown>('c2-markdown[data-markdown-demo]')
    if (element) play(element)
  })
})
