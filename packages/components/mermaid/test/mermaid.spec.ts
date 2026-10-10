import type { Locator, Page } from '@playwright/test'
import type { Mermaid } from '../src/mermaid'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const rendered = (locator: Locator) =>
  expect.poll(() => locator.evaluate((element) => element.shadowRoot!.querySelector('.diagram svg') !== null), { timeout: 20_000 })

const svgText = (locator: Locator) => locator.evaluate((element) => element.shadowRoot!.querySelector('.diagram svg')!.textContent ?? '')

const svgMarkup = (locator: Locator) => locator.evaluate((element) => element.shadowRoot!.querySelector('.diagram')!.innerHTML)

/** Fill colours used on the diagram's node shapes, as the browser resolves them. */
const nodeFills = (locator: Locator) =>
  locator.evaluate((element) =>
    [...element.shadowRoot!.querySelectorAll('.diagram .node rect, .diagram .node polygon')].map((shape) => getComputedStyle(shape).fill),
  )

test('draws a flowchart from its source and fires mermaid-render', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mermaid></c2-mermaid>')
  const diagram = page.locator('c2-mermaid')
  await watch(diagram, 'mermaid-render')
  await diagram.evaluate((element: Mermaid) => {
    element.value = 'flowchart LR\n  Cart --> Checkout --> Paid'
  })
  await rendered(diagram).toBe(true)
  expect(await svgText(diagram)).toContain('Checkout')
  const events = JSON.parse((await diagram.getAttribute('data-events')) ?? '[]') as { type: string }[]
  expect(events).toHaveLength(1)
  expect(events[0].type).toMatch(/flowchart/)
  // Until it is drawn the source shows as code; once drawn, only the diagram.
  expect(await diagram.evaluate((element) => element.shadowRoot!.querySelector('.source'))).toBeNull()
  await accessible(page)
})

test('reads a text/mermaid script and draws sequence and ER diagrams', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-mermaid id="sequence"><script type="text/mermaid">
      sequenceDiagram
        Client->>API: POST /orders
        API-->>Client: 201 Created
    </script></c2-mermaid>
    <c2-mermaid id="er" value="erDiagram
  CUSTOMER ||--o{ ORDER : places"></c2-mermaid>`)
  await rendered(page.locator('#sequence')).toBe(true)
  await rendered(page.locator('#er')).toBe(true)
  expect(await svgText(page.locator('#sequence'))).toContain('POST /orders')
  expect(await svgText(page.locator('#er'))).toContain('CUSTOMER')
})

test('a hostile source cannot script, embed HTML, link out or fetch', async ({ page, renderScenario }) => {
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('attacker.test')) requests.push(request.url())
  })
  const source = [
    '%%{init: {"securityLevel": "loose", "htmlLabels": true, "flowchart": {"htmlLabels": true}}}%%',
    'flowchart LR',
    '  A["<img src=https://attacker.test/x.png onerror=alert(1)>"] --> B',
    '  click A call alert(1)',
    '  click B href "javascript:alert(1)"',
  ].join('\n')
  await renderScenario('<c2-mermaid id="hostile"></c2-mermaid><c2-mermaid id="styled"></c2-mermaid>')
  const diagram = page.locator('#hostile')
  await diagram.evaluate((element: Mermaid, text) => {
    element.value = text
  }, source)
  await rendered(diagram).toBe(true)
  const markup = await svgMarkup(diagram)
  expect(markup).not.toMatch(/<script|<foreignObject|<img|<iframe/i)
  expect(markup).not.toMatch(/\son[a-z]+=/i)
  expect(markup).not.toMatch(/javascript:/i)
  expect(await diagram.evaluate((element) => element.shadowRoot!.querySelectorAll('.diagram [href]:not([href^="#"]), .diagram a').length)).toBe(0)

  // Mermaid's grammar rejects url() in styles; either way, no external url() reaches the shadow root.
  const styled = page.locator('#styled')
  await watch(styled, 'mermaid-error')
  await styled.evaluate((element: Mermaid) => {
    element.value = 'flowchart LR\n  A --> B\n  classDef evil fill:url(https://attacker.test/fill.png)\n  class A evil'
  })
  await expect.poll(() => styled.evaluate((element) => !!element.shadowRoot!.querySelector('.diagram svg, .error')), { timeout: 20_000 }).toBe(true)
  // (A failed source is shown as text, which may mention the URL; only the drawn diagram could fetch it.)
  expect(await svgMarkup(styled)).not.toMatch(/url\(\s*['"]?https?:/i)
  await page.waitForTimeout(300)
  expect(requests).toEqual([])
})

test('sanitizeSvg strips scripts, handlers, external references and animations', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mermaid></c2-mermaid>')
  const result = await page.evaluate(() => {
    const clean = (window as unknown as { sanitizeSvg: (markup: string) => SVGSVGElement | null }).sanitizeSvg
    const svg = clean(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">
      <style>@import url(https://attacker.test/a.css); .n { fill: url(https://attacker.test/f.png); stroke: url(#grad); }</style>
      <script>alert(1)</script>
      <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">html</div></foreignObject>
      <a href="https://attacker.test/"><text>link</text></a>
      <image xlink:href="https://attacker.test/i.png"/>
      <use href="#local"/>
      <rect id="local" style="fill:url('https://attacker.test/s.png')"/>
      <set attributeName="href" to="javascript:alert(1)"/>
    </svg>`)
    return {
      markup: svg?.outerHTML ?? '',
      notSvg: clean('<div>not svg</div>'),
      broken: clean('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>'),
    }
  })
  expect(result.markup).not.toMatch(/<script|<foreignObject|<set|onload|@import|attacker\.test/i)
  expect(result.markup).toContain('href="#local"')
  expect(result.markup).toContain('url(#grad)')
  expect(result.notSvg).toBeNull()
  expect(result.broken).toBeNull()
})

test('a parse error keeps the source, shows the message and fires mermaid-error', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mermaid></c2-mermaid>')
  const diagram = page.locator('c2-mermaid')
  await watch(diagram, 'mermaid-error')
  await diagram.evaluate((element: Mermaid) => {
    element.value = 'flowchart LR\n  A --> --> B ((('
  })
  await expect.poll(() => diagram.getAttribute('data-events'), { timeout: 20_000 }).not.toBe('[]')
  expect(await diagram.evaluate((element) => element.shadowRoot!.querySelector('.source')!.textContent)).toContain('A --> --> B')
  expect(await diagram.evaluate((element) => element.shadowRoot!.querySelector('.error')!.textContent!.length)).toBeGreaterThan(0)
})

test('each diagram uses its own colours, and a colour change re-renders', async ({ page, renderScenario }) => {
  await renderScenario(`<style>
      #red { --c2-mermaid__node--background: rgb(255, 0, 0); }
      #blue { --c2-mermaid__node--background: rgb(0, 0, 255); }
    </style>
    <c2-mermaid id="red" value="flowchart LR\n A --> B"></c2-mermaid>
    <c2-mermaid id="blue" value="flowchart LR\n A --> B"></c2-mermaid>`)
  await rendered(page.locator('#red')).toBe(true)
  await rendered(page.locator('#blue')).toBe(true)
  expect(await nodeFills(page.locator('#red'))).toContain('rgb(255, 0, 0)')
  expect(await nodeFills(page.locator('#blue'))).toContain('rgb(0, 0, 255)')

  await page.locator('#red').evaluate((element) => (element as HTMLElement).style.setProperty('--c2-mermaid__node--background', 'rgb(0, 128, 0)'))
  await expect.poll(() => nodeFills(page.locator('#red')), { timeout: 20_000 }).toContain('rgb(0, 128, 0)')
})

async function mermaidRequests(page: Page) {
  const urls: string[] = []
  page.on('request', (request) => {
    if (/node_modules\/(\.vite\/deps\/)?mermaid/.test(request.url())) urls.push(request.url())
  })
  return urls
}

test('mermaid loads only once a diagram has a source', async ({ page, renderScenario }) => {
  const urls = await mermaidRequests(page)
  await renderScenario('<c2-mermaid></c2-mermaid>')
  await page.waitForTimeout(300)
  expect(urls).toEqual([])
  await page.locator('c2-mermaid').evaluate((element: Mermaid) => {
    element.value = 'flowchart LR\n A --> B'
  })
  await rendered(page.locator('c2-mermaid')).toBe(true)
  expect(urls.length).toBeGreaterThan(0)
})
