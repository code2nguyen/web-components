import type { Locator, Page } from '@playwright/test'

/**
 * The element's API as the spec uses it. Importing the source module instead would pull the built declarations of the
 * lazily loaded siblings (c2-math, c2-mermaid) into the test program next to their own specs' source declarations.
 */
type Markdown = HTMLElement & {
  value: string
  streaming: boolean
  appendText(chunk: string): void
  urlTransform?: (url: string, kind: 'link' | 'image') => string | null | undefined
  updateComplete: Promise<boolean>
}
import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

const md = (page: Page) => page.locator('c2-markdown')

/** Runs a query inside the element's shadow root and returns the matches' outer HTML. */
const query = (locator: Locator, selector: string) =>
  locator.evaluate((element, css) => [...element.shadowRoot!.querySelectorAll(css)].map((node) => node.outerHTML), selector)

const count = (locator: Locator, selector: string) => locator.evaluate((element, css) => element.shadowRoot!.querySelectorAll(css).length, selector)

const bodyText = (locator: Locator) => locator.evaluate((element) => (element.shadowRoot!.querySelector('.body') as HTMLElement).innerText)

const setValue = (locator: Locator, value: string) =>
  locator.evaluate(async (element: Markdown, text) => {
    element.value = text
    await element.updateComplete
  }, value)

/** Fake time that only moves when the test runs it, so frames cannot fire between a feed and the next assertion. */
async function pausedClock(page: Page, html: string, render: (html: string) => Promise<void>) {
  await page.clock.install({ time: 0 })
  await render(html)
  await page.clock.pauseAt(60_000)
}

const feed = (page: Page, chunk: string) =>
  md(page).evaluate(async (element: Markdown, text) => {
    element.appendText(text)
    await element.updateComplete
  }, chunk)

test('renders CommonMark and GFM blocks from a script source', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-markdown><script type="text/markdown">
    # Release notes

    Text with **bold**, *emphasis*, ~~removed~~, \`code\` and a [link](https://example.com "Example").

    3. third
    4. fourth

    - [x] shipped
    - [ ] pending

    > Quoted

    | Name | Count |
    | :--- | ----: |
    | Alpha | 12 |

    ---
  </script></c2-markdown>`)
  const element = md(page)
  expect(await query(element, 'h1')).toEqual([expect.stringContaining('Release notes')])
  expect(await count(element, 'strong, em, del, code.code')).toBe(4)
  const link = await element.evaluate((node) => {
    const anchor = node.shadowRoot!.querySelector('a.link')!
    return { href: anchor.getAttribute('href'), target: anchor.getAttribute('target'), rel: anchor.getAttribute('rel'), title: anchor.getAttribute('title') }
  })
  expect(link).toEqual({ href: 'https://example.com', target: '_blank', rel: 'noopener noreferrer nofollow', title: 'Example' })
  expect(await element.evaluate((node) => node.shadowRoot!.querySelector('ol')!.getAttribute('start'))).toBe('3')
  expect(await count(element, '[role="checkbox"][aria-checked="true"]')).toBe(1)
  expect(await count(element, '[role="checkbox"][aria-checked="false"]')).toBe(1)
  expect(await count(element, 'blockquote')).toBe(1)
  expect(await count(element, 'td.align-right')).toBe(1)
  expect(await count(element, 'hr')).toBe(1)
  await accessible(page)
})

test('raw HTML is shown as code and never interpreted', async ({ page, renderScenario }) => {
  // Plain code blocks keep the block's text in this shadow root: a c2-code-viewer, which may load mid-test, holds it in its own.
  await renderScenario('<c2-markdown code="plain"></c2-markdown>')
  const element = md(page)
  await setValue(
    element,
    'Inline <img src=x onerror="alert(1)"> and <b>bold</b>.\n\n<script>alert(1)</script>\n\n<iframe src="https://attacker.test"></iframe>\n\n<div onclick="alert(1)">block</div>',
  )
  expect(await count(element, 'img, script, iframe, b, [onclick], [onerror]')).toBe(0)
  const text = await bodyText(element)
  expect(text).toContain('<img src=x onerror="alert(1)">')
  expect(text).toContain('<script>alert(1)</script>')
  expect(await count(element, 'code.raw-html')).toBeGreaterThan(0)
  expect(await count(element, 'pre.raw-html-block')).toBe(3)
})

test('dangerous URLs never reach an href or src', async ({ page, renderScenario }) => {
  await renderScenario('<c2-markdown></c2-markdown>')
  const element = md(page)
  await setValue(
    element,
    [
      '[a](javascript:alert(1)) [b](java&#x09;script:alert(1)) [c](data:text/html,<b>x</b>) [d](vbscript:msgbox(1))',
      '<javascript:alert(1)> [e][ref] ![img](data:image/png;base64,AAAA)',
      '',
      '[ref]: javascript:alert(2)',
    ].join('\n'),
  )
  expect(await count(element, 'a[href]')).toBe(0)
  expect(await count(element, 'c2-image')).toBe(0)
  expect(await bodyText(element)).toContain('img')
})

test('urlTransform can proxy or drop URLs, and cannot reintroduce a dangerous one', async ({ page, renderScenario }) => {
  await renderScenario('<c2-markdown></c2-markdown>')
  const element = md(page)
  await element.evaluate((node: Markdown) => {
    node.urlTransform = (url, kind) => {
      if (url.includes('drop')) return null
      if (url.includes('evil')) return 'javascript:alert(1)'
      return kind === 'image' ? `/proxy?u=${encodeURIComponent(url)}` : url
    }
  })
  await setValue(element, '[keep](https://keep.test) [drop](https://drop.test) [evil](https://evil.test) ![pic](https://img.test/a.png)')
  expect(await query(element, 'a[href]')).toEqual([expect.stringContaining('href="https://keep.test"')])
  expect(await element.evaluate((node) => node.shadowRoot!.querySelector('c2-image')!.getAttribute('src'))).toBe('/proxy?u=https%3A%2F%2Fimg.test%2Fa.png')
})

test('images load lazily by default; image-policy="click" waits unless the origin is allowed', async ({ page, renderScenario }) => {
  const requests: string[] = []
  await page.route('https://img.test/**', (route) => {
    requests.push(new URL(route.request().url()).pathname)
    return route.fulfill({ status: 404 })
  })
  await renderScenario(`<c2-markdown id="load" value="![a](https://img.test/load.png)"></c2-markdown>
    <c2-markdown id="click" image-policy="click" image-origins="https://cdn.test" value="![b](https://img.test/blocked.png) ![c](https://cdn.test/ok.png)"></c2-markdown>`)
  const loading = (selector: string) =>
    page
      .locator(selector)
      .evaluate((node) => [...node.shadowRoot!.querySelectorAll('c2-image')].map((image) => [image.getAttribute('src'), image.getAttribute('loading')]))
  expect(await loading('#load')).toEqual([['https://img.test/load.png', 'lazy']])
  expect(await loading('#click')).toEqual([
    ['https://img.test/blocked.png', 'click'],
    ['https://cdn.test/ok.png', 'lazy'],
  ])
  await expect.poll(() => requests).toContain('/load.png')
  expect(requests).not.toContain('/blocked.png')
})

test('streaming keeps finished blocks in place and never shows raw markers', async ({ page, renderScenario }) => {
  await pausedClock(page, '<c2-markdown streaming></c2-markdown>', renderScenario)
  const element = md(page)
  const source = 'First paragraph is done.\n\nSecond has **bold text** and `code` and a [link](https://example.com/path) here.'
  // Feed the first paragraph and settle it, then remember its node.
  await feed(page, source.slice(0, 26))
  await page.clock.runFor(1000)
  await element.evaluate((node) => {
    ;(window as Window & { first?: Element }).first = node.shadowRoot!.querySelector('.body > p')!
  })
  const seen: string[] = []
  for (const char of source.slice(26)) {
    await feed(page, char)
    await page.clock.runFor(32)
    seen.push(await bodyText(element))
  }
  await props(element, { streaming: false })
  await page.clock.runFor(1000)
  for (const text of seen) {
    expect(text).not.toMatch(/\*\*|`|\]\(|\[link/)
  }
  expect(await element.evaluate((node) => node.shadowRoot!.querySelector('.body > p') === (window as Window & { first?: Element }).first)).toBe(true)
  expect(await bodyText(element)).toMatch(/^First paragraph is done\.\n+Second has bold text and code and a link here\.$/)
  expect(await count(element, 'a[href="https://example.com/path"]')).toBe(1)
})

test('an open fence shows as plain code, then highlights once it closes; the caret and reveal-end follow the stream', async ({ page, renderScenario }) => {
  await pausedClock(page, '<c2-markdown streaming></c2-markdown>', renderScenario)
  const element = md(page)
  await watch(element, 'reveal-end')
  await feed(page, 'Run this:\n\n```ts\nconst answer = ')
  await page.clock.runFor(1000)
  expect(await count(element, 'pre.code-block--pending')).toBe(1)
  expect(await count(element, 'c2-code-viewer')).toBe(0)
  expect(await count(element, '.caret')).toBe(1)
  await expect(element).toHaveHostAria('aria-busy', 'true')

  await feed(page, '42\n```\n')
  await props(element, { streaming: false })
  await page.clock.runFor(1000)
  await expect.poll(() => count(element, 'c2-code-viewer')).toBe(1)
  expect(await count(element, '.caret')).toBe(0)
  await expect(element).toHaveAttribute('data-events', '[null]')
  await expect(element).toHaveHostAria('aria-busy', null)
})

test('a streaming image is not requested before its markdown is complete', async ({ page, renderScenario }) => {
  const requests: string[] = []
  await page.route('https://img.test/**', (route) => {
    requests.push(route.request().url())
    return route.fulfill({ status: 404 })
  })
  await pausedClock(page, '<c2-markdown streaming reveal="instant"></c2-markdown>', renderScenario)
  const image = '![chart](https://img.test/chart.png?secret=abc)'
  for (let end = 1; end < image.length; end++) {
    await md(page).evaluate(
      async (node: Markdown, text) => {
        node.value = text
        await node.updateComplete
      },
      image.slice(0, end),
    )
    expect(await count(md(page), 'c2-image')).toBe(0)
  }
  expect(requests).toEqual([])
})

test('math delimiters follow the math attribute, and prices stay text', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-markdown id="dollar" value="Costs $5 and $10. Area $A = \\pi r^2$ and \\(x+1\\).

$$
E = mc^2
$$"></c2-markdown>
    <c2-markdown id="bracket" math="bracket" value="Price $x$ but \\(y\\)."></c2-markdown>`)
  await expect.poll(() => count(page.locator('#dollar'), 'c2-math')).toBe(3)
  expect(await bodyText(page.locator('#dollar'))).toContain('Costs $5 and $10.')
  expect(await count(page.locator('#dollar'), 'c2-math[display]')).toBe(1)
  await expect.poll(() => count(page.locator('#bracket'), 'c2-math')).toBe(1)
  expect(await bodyText(page.locator('#bracket'))).toContain('Price $x$')
})

test('a mermaid fence renders as a diagram', async ({ page, renderScenario }) => {
  await renderScenario('<c2-markdown value="```mermaid\nflowchart LR\n  A --> B\n```"></c2-markdown>')
  await expect.poll(() => count(md(page), 'c2-mermaid'), { timeout: 20_000 }).toBe(1)
})

test('documents without code, math or diagrams load none of those modules', async ({ page, renderScenario }) => {
  const modules: string[] = []
  page.on('request', (request) => {
    if (/packages\/components\/(code-viewer|math|mermaid)\/src/.test(request.url())) modules.push(request.url())
  })
  await renderScenario('<c2-markdown value="# Plain\n\nJust **text**, a [link](https://example.com) and a list:\n\n- one\n- two"></c2-markdown>')
  await page.waitForTimeout(300)
  expect(modules).toEqual([])
})

test('link-click is cancelable, and heading anchors scroll within the element', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-markdown heading-anchors heading-offset="1" value="[Go](https://example.com/away)\n\n[Jump](#details)\n\n## Details\n\nBody"></c2-markdown>',
  )
  const element = md(page)
  expect(await count(element, 'h3#details')).toBe(1)
  await element.evaluate((node) => node.addEventListener('link-click', (event) => event.preventDefault(), { once: true }))
  const popup = page.waitForEvent('popup', { timeout: 500 }).catch(() => null)
  await element.getByRole('link', { name: 'Go' }).click()
  expect(await popup).toBeNull()
  await element.getByRole('link', { name: 'Jump' }).click()
  expect(page.url()).not.toContain('#details')
})

test('character references are decoded in text and inline code', async ({ page, renderScenario }) => {
  await renderScenario('<c2-markdown value="Fish &amp; chips &copy; 2026 &#8212; `a &lt; b`"></c2-markdown>')
  expect(await bodyText(md(page))).toBe('Fish & chips © 2026 — a < b')
})

test('heal repairs the unfinished tail of a stream', async ({ page, renderScenario }) => {
  await renderScenario('<c2-markdown></c2-markdown>')
  const cases: [string, string][] = [
    ['Some **bold', 'Some **bold**'],
    ['Some **bold and *em', 'Some **bold and *em***'],
    ['Second has **', 'Second has '],
    ['Ends with `co', 'Ends with `co`'],
    ['Ends with `', 'Ends with '],
    ['~~gone', '~~gone~~'],
    ['snake_case stays', 'snake_case stays'],
    ['2 * 3 = 6', '2 * 3 = 6'],
    ['See [the docs](https://exa', 'See [the docs](c2-pending:)'],
    ['See [the do', 'See the do'],
    ['A picture ![chart](https://img.test/c', 'A picture '],
    ['A picture ![chart](https://img.test/c.png) done', 'A picture ![chart](https://img.test/c.png) done'],
    ['Intro\n\n- ', 'Intro'],
    ['```js\nconst a = 1', '```js c2-pending\nconst a = 1\n```'],
    ['$$\nE = mc', '```c2-pending-math\n\nE = mc\n```'],
  ]
  const results = await page.evaluate(
    (inputs) => inputs.map((input) => (window as unknown as { heal: (text: string) => string }).heal(input)),
    cases.map(([input]) => input),
  )
  expect(results).toEqual(cases.map(([, expected]) => expected))
})
