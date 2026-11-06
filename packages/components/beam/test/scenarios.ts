import '../src/beam'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const attributes: Record<string, string> = {
  curved: 'curvature="40"',
  reverse: 'reverse',
}
const target = scenario === 'late' ? '' : '<div class="node" id="target">B</div>'
main.innerHTML = `
  <div class="diagram">
    <div class="node" id="source">A</div>
    ${target}
    <c2-beam from="source" to="target" ${attributes[scenario] ?? ''}></c2-beam>
  </div>
`

if (scenario === 'scaled') document.querySelector<HTMLElement>('.diagram')!.style.transform = 'scale(0.5)'

const subject = document.querySelector('c2-beam')!
await subject.updateComplete
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
await subject.updateComplete
main.dataset.ready = 'true'
