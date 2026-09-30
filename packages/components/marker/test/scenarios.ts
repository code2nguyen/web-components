import '../src/marker'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const markup: Record<string, string> = {
  default: `<p>Deploys are <c2-marker id="subject">fully automated</c2-marker> and reviewed.</p>`,
  variants: `
    <p>
      <c2-marker id="highlight">highlight</c2-marker>
      <c2-marker id="underline" variant="underline">underline</c2-marker>
      <c2-marker id="strike" variant="strike-through">strike-through</c2-marker>
      <c2-marker id="box" variant="box">box</c2-marker>
      <c2-marker id="circle" variant="circle">circle</c2-marker>
      <c2-marker id="unknown" variant="zigzag">unknown</c2-marker>
    </p>`,
  wrap: `<p style="width: 160px">Before <c2-marker id="subject">a marked run of text that wraps onto several lines</c2-marker> after.</p>`,
  themed: `<p><c2-marker id="subject" variant="box" style="--c2-marker__stroke--color: rgb(220, 38, 38); --c2-marker__stroke--width: 3px; --c2-marker__mark--padding: 0 6px">three days early</c2-marker></p>`,
  animated: `
    <p><c2-marker id="visible" animated variant="underline" style="--c2-marker__mark--transition-duration: 2s">in view</c2-marker></p>
    <div style="height: 200vh"></div>
    <p><c2-marker id="below" animated variant="circle">below the fold</c2-marker></p>`,
}

main.innerHTML = markup[scenario] ?? markup.default

await Promise.all([...document.querySelectorAll('c2-marker')].map((marker) => marker.updateComplete))
main.dataset.ready = 'true'
