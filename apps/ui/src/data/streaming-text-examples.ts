import type { StreamingText } from '@c2n/components/streaming-text'

/**
 * Replays a canned answer into every `c2-streaming-text[data-streaming-text-demo]` the way a model streams one: chunks
 * of one to a dozen words separated by irregular pauses, so the docs show the element smoothing a bursty stream.
 * A `[data-streaming-action="replay"]` button in the same `[data-streaming-demo]` container starts it again. Doc
 * pages load this through `StreamingExamples.astro`, the landing page through `component-modules.ts`.
 */
const answers: Record<string, string> = {
  answer:
    'Revenue grew 12% quarter over quarter, driven mostly by the enterprise plan. Churn fell to 2.1% after the onboarding changes shipped in May, and expansion revenue now covers new-logo acquisition costs. The main risk is concentration: the five largest accounts make up 38% of recurring revenue, so a single renewal slipping would show in next quarter’s numbers.',
  summary: 'Three tickets mention the same checkout timeout. All started after the 14:02 deploy; rolling back the payments client should resolve them.',
  terminal: 'Installing dependencies…\nResolved 412 packages in 1.8s\nBuilding @c2n/components\n✓ 52 entries, 0 warnings\nDone in 6.4s',
  cjk: '季度收入环比增长百分之十二，主要来自企业版。客户流失率在五月上线新的引导流程后降至百分之二点一。',
}

const timers = new WeakMap<StreamingText, number>()

function play(element: StreamingText): void {
  const text = answers[element.dataset.streamingTextDemo ?? ''] ?? answers.answer
  window.clearTimeout(timers.get(element))
  element.clear()
  element.streaming = true
  const parts = text.split(/(?<=\s)/u)
  let index = 0
  const next = () => {
    if (index >= parts.length) {
      element.streaming = false
      return
    }
    const size = 1 + Math.floor(Math.random() * 12)
    element.appendText(parts.slice(index, index + size).join(''))
    index += size
    timers.set(element, window.setTimeout(next, 40 + Math.random() * 360))
  }
  timers.set(element, window.setTimeout(next, 300))
}

function wire(element: StreamingText): void {
  if (element.dataset.streamingWired) return
  element.dataset.streamingWired = 'true'
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return
    observer.disconnect()
    play(element)
  })
  observer.observe(element)
}

void customElements.whenDefined('c2-streaming-text').then(() => {
  const scan = () => document.querySelectorAll<StreamingText>('c2-streaming-text[data-streaming-text-demo]').forEach(wire)
  scan()
  document.addEventListener('astro:page-load', scan)
  // One listener for every Replay button: it works whichever of the button and the element hydrates first.
  document.addEventListener('click', (event) => {
    const button = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.dataset.streamingAction === 'replay')
    const element = button?.closest('[data-streaming-demo]')?.querySelector<StreamingText>('c2-streaming-text[data-streaming-text-demo]')
    if (element) play(element)
  })
})
