import { test, expect } from '@playwright/test'
import { checkObservableEffect } from './assertions'
import { prepareReviewedContext } from './context'

test('activated hover and focus paths change only their intended target', async ({ page }) => {
  await page.setContent(`<c2-state-probe><button class="target">Focus or hover</button></c2-state-probe>
    <style>.target { border: 2px solid black } .target:hover, .target:focus { border-color: var(--c2-state-probe--border-color, black) }</style>`)
  for (const state of ['hover', 'focus'] as const) {
    const result = await checkObservableEffect(page, {
      host: 'c2-state-probe',
      name: '--c2-state-probe--border-color',
      value: 'red',
      target: '.target',
      declaration: 'border-color',
      assertion: 'computed-style',
      state,
    })
    expect(result.kind).toBe('changed')
  }
})

test('selected and disabled host states reach the target', async ({ page }) => {
  await page.setContent(`<c2-state-probe><span class="target">State</span></c2-state-probe>
    <style>.target { color: black } c2-state-probe[selected] .target, c2-state-probe[disabled] .target { color: var(--c2-state-probe--color, black) }</style>`)
  for (const state of ['selected', 'disabled'] as const) {
    const result = await checkObservableEffect(page, {
      host: 'c2-state-probe',
      name: '--c2-state-probe--color',
      value: 'red',
      target: '.target',
      declaration: 'color',
      assertion: 'computed-style',
      state,
    })
    expect(result.kind).toBe('changed')
  }
})

test('reviewed keyword controls cover justify-content and font-style', async ({ page }) => {
  await page.setContent(`<c2-keyword-probe><span class="target">Keyword</span></c2-keyword-probe>
    <style>.target { display: flex; width: 100px; justify-content: var(--c2-keyword-probe--justify-content, flex-start);
      font-style: var(--c2-keyword-probe--font-style, normal) }</style>`)
  for (const [name, value, controlValue, declaration] of [
    ['--c2-keyword-probe--justify-content', 'center', 'flex-end', 'justify-content'],
    ['--c2-keyword-probe--font-style', 'italic', 'oblique', 'font-style'],
  ] as const) {
    const result = await checkObservableEffect(page, {
      host: 'c2-keyword-probe',
      name,
      value,
      controlValue,
      target: '.target',
      assertion: 'computed-style',
      declaration,
      publishedType: declaration,
    })
    expect(result.kind, name).toBe('changed')
  }
  const invalid = await checkObservableEffect(page, {
    host: 'c2-keyword-probe',
    name: '--c2-keyword-probe--justify-content',
    value: 'center',
    controlValue: 'italic',
    target: '.target',
    assertion: 'computed-style',
    declaration: 'justify-content',
    publishedType: 'justify-content',
  })
  expect(invalid.kind).toBe('invalid-test-value')
})

test('pseudo-element and slotted targets are inspected at their actual boundary', async ({ page }) => {
  await page.setContent(`<c2-special-probe><span class="slotted">Slotted</span></c2-special-probe>`)
  await page.evaluate(() => {
    customElements.define(
      'c2-special-probe',
      class extends HTMLElement {
        constructor() {
          super()
          this.attachShadow({ mode: 'open' }).innerHTML = `<style>
            .pseudo::before { content: 'x'; color: var(--c2-special-probe--pseudo-color, black) }
            ::slotted(.slotted) { color: var(--c2-special-probe--slot-color, black) }
          </style><span class="pseudo"></span><slot></slot>`
        }
      },
    )
  })
  for (const [name, target, assertion, pseudo] of [
    ['--c2-special-probe--pseudo-color', 'c2-special-probe .pseudo', 'pseudo-style', '::before'],
    ['--c2-special-probe--slot-color', '.slotted', 'slotted-style', undefined],
  ] as const) {
    expect((await checkObservableEffect(page, { host: 'c2-special-probe', name, value: 'red', target, declaration: 'color', assertion, pseudo })).kind).toBe(
      'changed',
    )
  }
})

test('delegated child and programmatic output require downstream change', async ({ page }) => {
  await page.setContent(`<c2-delegating-probe></c2-delegating-probe><c2-canvas-probe></c2-canvas-probe>`)
  await page.evaluate(() => {
    customElements.define(
      'c2-child-probe',
      class extends HTMLElement {
        constructor() {
          super()
          this.attachShadow({ mode: 'open' }).innerHTML =
            `<style>.target { color: var(--c2-child-probe--color, black) }</style><span class="target">Child</span>`
        }
      },
    )
    customElements.define(
      'c2-delegating-probe',
      class extends HTMLElement {
        constructor() {
          super()
          this.attachShadow({ mode: 'open' }).innerHTML =
            `<style>c2-child-probe { --c2-child-probe--color: var(--c2-delegating-probe--child-color, black) }</style><c2-child-probe></c2-child-probe>`
        }
      },
    )
    customElements.define(
      'c2-canvas-probe',
      class extends HTMLElement {
        observer = new MutationObserver(() => this.draw())
        connectedCallback() {
          this.attachShadow({ mode: 'open' }).innerHTML = '<canvas width="10" height="10"></canvas>'
          this.observer.observe(this, { attributes: true, attributeFilter: ['style'] })
          this.draw()
        }
        disconnectedCallback() {
          this.observer.disconnect()
        }
        draw() {
          const canvas = this.shadowRoot?.querySelector('canvas')
          const context = canvas?.getContext('2d')
          if (!context) return
          context.fillStyle = getComputedStyle(this).getPropertyValue('--c2-canvas-probe--color').trim() || 'black'
          context.fillRect(0, 0, 10, 10)
        }
      },
    )
  })
  expect(
    (
      await checkObservableEffect(page, {
        host: 'c2-delegating-probe',
        name: '--c2-delegating-probe--child-color',
        value: 'red',
        target: 'c2-delegating-probe c2-child-probe .target',
        declaration: 'color',
        assertion: 'delegated-style',
        childTag: 'c2-child-probe',
      })
    ).kind,
  ).toBe('changed')
  const canvas = await checkObservableEffect(page, {
    host: 'c2-canvas-probe',
    name: '--c2-canvas-probe--color',
    value: 'red',
    target: 'c2-canvas-probe canvas',
    assertion: 'programmatic-output',
    valueSyntax: 'color',
    outputProbe: 'canvas-bitmap',
  })
  expect(canvas.kind).toBe('changed')
})

test('invalid geometry and programmatic values are classified as test errors', async ({ page }) => {
  await page.setContent('<c2-value-probe><span class="target"></span><canvas width="10" height="10"></canvas></c2-value-probe>')
  for (const [assertion, target, valueSyntax] of [
    ['geometry', '.target', 'width'],
    ['programmatic-output', 'canvas', 'color'],
  ] as const) {
    const result = await checkObservableEffect(page, {
      host: 'c2-value-probe',
      name: '--c2-value-probe--value',
      value: 'not-a-valid-value',
      target,
      assertion,
      valueSyntax,
      geometryMetric: assertion === 'geometry' ? 'width' : undefined,
      outputProbe: assertion === 'programmatic-output' ? 'canvas-bitmap' : undefined,
    })
    expect(result.kind).toBe('invalid-test-value')
  }
})

test('reviewed context setup applies semantic state and dimensions to a data-backed fixture', async ({ page }) => {
  await page.setContent('<main></main>')
  await page.evaluate(() => customElements.define('c2-context-probe', class extends HTMLElement {}))
  await prepareReviewedContext(page, {
    id: 'state-and-size',
    tag: 'c2-context-probe',
    fixture: '<c2-context-probe data-record="42"><span>Record 42</span></c2-context-probe><div id="related">Related</div>',
    settledWhen: 'c2-context-probe span',
    stateSetup: [{ target: 'c2-context-probe', attribute: 'selected', value: '' }],
    dimensions: [{ target: 'c2-context-probe', width: '123px', height: '45px' }],
  })
  await expect(page.locator('c2-context-probe')).toHaveAttribute('selected', '')
  await expect(page.locator('c2-context-probe')).toHaveCSS('width', '123px')
  await expect(page.locator('c2-context-probe')).toHaveCSS('height', '45px')
  await expect(page.locator('c2-context-probe')).toHaveAttribute('data-record', '42')
  await expect(page.locator('#related')).toHaveText('Related')
  await expect(
    prepareReviewedContext(page, {
      id: 'missing-target',
      tag: 'c2-context-probe',
      fixture: '<c2-context-probe></c2-context-probe>',
      settledWhen: 'c2-context-probe',
      stateSetup: [{ target: '#absent', attribute: 'selected', value: '' }],
    }),
  ).rejects.toThrow(/missing state target/)
})

test('programmatic assertions reject host markup echoes and unrelated changing output', async ({ page }) => {
  await page.setContent('<c2-output-probe><span class="output">Still</span></c2-output-probe>')
  await expect(
    checkObservableEffect(page, {
      host: 'c2-output-probe',
      name: '--c2-output-probe--color',
      value: 'red',
      target: 'c2-output-probe',
      assertion: 'programmatic-output',
      valueSyntax: 'color',
      outputProbe: 'text-content',
    }),
  ).rejects.toThrow(/target/)
  await page.evaluate(() => {
    const output = document.querySelector('.output')
    let count = 0
    const tick = () => {
      if (!output) return
      output.textContent = String(++count)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const unrelated = await checkObservableEffect(page, {
    host: 'c2-output-probe',
    name: '--c2-output-probe--color',
    value: 'red',
    target: '.output',
    assertion: 'programmatic-output',
    valueSyntax: 'color',
    outputProbe: 'text-content',
  })
  expect(unrelated.kind).toBe('unstable-output')
})

test('slotted and delegated assertions reject unrelated matching targets', async ({ page }) => {
  await page.setContent('<c2-boundary-probe><span class="fake">Not assigned</span></c2-boundary-probe>')
  await page.evaluate(() => {
    const host = document.querySelector('c2-boundary-probe')
    host?.attachShadow({ mode: 'open' }).append(document.createElement('slot'))
    const slot = host?.shadowRoot?.querySelector('slot')
    if (slot) slot.name = 'real'
  })
  await page.addStyleTag({ content: 'c2-boundary-probe .fake { color: var(--c2-boundary-probe--color, black) }' })
  for (const assertion of ['slotted-style', 'delegated-style'] as const) {
    await expect(
      checkObservableEffect(page, {
        host: 'c2-boundary-probe',
        name: '--c2-boundary-probe--color',
        value: 'red',
        target: 'c2-boundary-probe .fake',
        assertion,
        declaration: 'color',
        childTag: assertion === 'delegated-style' ? 'c2-child-probe' : undefined,
      }),
    ).rejects.toThrow(/target/)
  }
})

test('every assertion rejects a target outside the tested host boundary', async ({ page }) => {
  await page.setContent('<c2-owner-probe></c2-owner-probe><span class="outside">Outside</span><canvas class="outside-canvas"></canvas>')
  for (const [assertion, target, declaration, outputProbe] of [
    ['computed-style', '.outside', 'color', undefined],
    ['pseudo-style', '.outside', 'color', undefined],
    ['geometry', '.outside', undefined, undefined],
    ['programmatic-output', '.outside-canvas', undefined, 'canvas-bitmap'],
  ] as const) {
    await expect(
      checkObservableEffect(page, {
        host: 'c2-owner-probe',
        name: '--c2-owner-probe--color',
        value: 'red',
        target,
        assertion,
        declaration,
        valueSyntax: 'color',
        pseudo: assertion === 'pseudo-style' ? '::before' : undefined,
        outputProbe,
        geometryMetric: assertion === 'geometry' ? 'width' : undefined,
      }),
    ).rejects.toThrow(/boundary/)
  }
})

test('an independently changing computed target cannot prove a property effect', async ({ page }) => {
  await page.setContent('<c2-animation-probe><span class="target">Changing</span></c2-animation-probe>')
  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>('.target')
    let count = 0
    const tick = () => {
      if (!target) return
      target.style.width = `${20 + ++count}px`
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const unstable = await checkObservableEffect(page, {
    host: 'c2-animation-probe',
    name: '--c2-animation-probe--width',
    value: '70px',
    target: '.target',
    assertion: 'computed-style',
    declaration: 'width',
  })
  expect(unstable.kind).toBe('unstable-output')
})

test('a stable motion declaration remains a valid observable effect', async ({ page }) => {
  await page.setContent(`<c2-motion-probe><span class="target">Moving</span></c2-motion-probe>
    <style>@keyframes slide { from { transform: translateX(0) } to { transform: translateX(10px) } }
      .target { animation: slide var(--c2-motion-probe--duration, 1s) linear infinite }</style>`)
  const result = await checkObservableEffect(page, {
    host: 'c2-motion-probe',
    name: '--c2-motion-probe--duration',
    value: '2s',
    target: '.target',
    assertion: 'computed-style',
    declaration: 'animation-duration',
    stabilityWindowMs: 250,
  })
  expect(result.kind).toBe('changed')
})

test('unrelated pseudo, slotted, delegated, and geometry changes cannot pass', async ({ page }) => {
  await page.setContent('<c2-changing-probe><span class="slotted">Slot</span></c2-changing-probe>')
  await page.evaluate(() => {
    customElements.define(
      'c2-changing-child',
      class extends HTMLElement {
        constructor() {
          super()
          this.attachShadow({ mode: 'open' }).innerHTML = '<style>.target { color: var(--noise, black) }</style><span class="target">Child</span>'
        }
      },
    )
    customElements.define(
      'c2-changing-probe',
      class extends HTMLElement {
        constructor() {
          super()
          this.attachShadow({ mode: 'open' }).innerHTML = `<style>
            .pseudo::before { content: 'x'; color: var(--noise, black) }
            ::slotted(.slotted) { color: var(--noise, black) }
            .box { display: inline-block }
          </style><span class="pseudo"></span><slot></slot><c2-changing-child></c2-changing-child><span class="box"></span>`
        }
      },
    )
    const host = document.querySelector<HTMLElement>('c2-changing-probe')
    const box = host?.shadowRoot?.querySelector<HTMLElement>('.box')
    let count = 0
    const tick = () => {
      if (!host || !box) return
      count++
      host.style.setProperty('--noise', `rgb(${count % 255}, 0, 0)`)
      box.style.width = `${20 + count}px`
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  for (const [assertion, target, declaration, extra] of [
    ['pseudo-style', 'c2-changing-probe .pseudo', 'color', { pseudo: '::before' }],
    ['slotted-style', 'c2-changing-probe .slotted', 'color', {}],
    ['delegated-style', 'c2-changing-probe c2-changing-child .target', 'color', { childTag: 'c2-changing-child' }],
    ['geometry', 'c2-changing-probe .box', undefined, { valueSyntax: 'width', geometryMetric: 'width' }],
  ] as const) {
    const result = await checkObservableEffect(page, {
      host: 'c2-changing-probe',
      name: '--c2-changing-probe--color',
      value: assertion === 'geometry' ? '70px' : 'red',
      target,
      assertion,
      declaration,
      ...extra,
    })
    expect(result.kind, assertion).toBe('unstable-output')
  }
})

test('geometry observes the reviewed dimension, not unrelated movement', async ({ page }) => {
  await page.setContent(`<c2-geometry-probe><span class="target">Box</span></c2-geometry-probe>
    <style>.target { display: block; width: 30px; height: 10px }</style>`)
  await page.evaluate(() => {
    const host = document.querySelector('c2-geometry-probe')
    const target = host?.querySelector<HTMLElement>('.target')
    if (!host || !target) return
    new MutationObserver(() => {
      target.style.transform = host.getAttribute('style') ? 'translateX(20px)' : ''
    }).observe(host, { attributes: true, attributeFilter: ['style'] })
  })
  const unrelated = await checkObservableEffect(page, {
    host: 'c2-geometry-probe',
    name: '--c2-geometry-probe--width',
    value: '70px',
    target: '.target',
    assertion: 'geometry',
    valueSyntax: 'width',
    geometryMetric: 'width',
  })
  expect(unrelated.kind).toBe('no-observable-change')
  await page.setContent(`<c2-geometry-probe><span class="target">Box</span></c2-geometry-probe>
    <style>.target { display: block; width: var(--c2-geometry-probe--width, 30px); height: 10px }</style>`)
  const intended = await checkObservableEffect(page, {
    host: 'c2-geometry-probe',
    name: '--c2-geometry-probe--width',
    value: '70px',
    target: '.target',
    assertion: 'geometry',
    valueSyntax: 'width',
    geometryMetric: 'width',
  })
  expect(intended.kind).toBe('changed')
})

test('SVG and image probes compare rendered pixels rather than metadata or source strings', async ({ page }) => {
  await page.setContent(`<c2-raster-probe>
    <svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" fill="blue"></rect></svg>
    <img width="10" height="10" alt="Sample">
  </c2-raster-probe>`)
  await page.evaluate(() => {
    const host = document.querySelector('c2-raster-probe')
    const svg = host?.querySelector('svg')
    const image = host?.querySelector('img')
    if (!host || !svg || !image) return
    const svgData = (id: string, fill: string) =>
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" data-id="${id}"><rect width="10" height="10" fill="${fill}"/></svg>`)}`
    image.src = svgData('one', 'blue')
    new MutationObserver(() => {
      const changed = host.getAttribute('style')?.includes('--c2-raster-probe--color')
      svg.setAttribute('data-id', changed ? 'two' : 'one')
      image.src = svgData(changed ? 'two' : 'one', 'blue')
    }).observe(host, { attributes: true, attributeFilter: ['style'] })
  })
  for (const [target, outputProbe] of [
    ['c2-raster-probe svg', 'svg-bitmap'],
    ['c2-raster-probe img', 'image-bitmap'],
  ] as const) {
    const result = await checkObservableEffect(page, {
      host: 'c2-raster-probe',
      name: '--c2-raster-probe--color',
      value: 'red',
      target,
      assertion: 'programmatic-output',
      valueSyntax: 'color',
      outputProbe,
    })
    expect(result.kind, outputProbe).toBe('no-observable-change')
  }
  await page.evaluate(() => {
    const host = document.querySelector('c2-raster-probe')
    const svg = host?.querySelector('svg rect')
    const image = host?.querySelector('img')
    if (!host || !svg || !image) return
    const svgData = (fill: string) =>
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="${fill}"/></svg>`)}`
    new MutationObserver(() => {
      const paint = getComputedStyle(host).getPropertyValue('--c2-raster-probe--paint').trim() || 'blue'
      svg.setAttribute('fill', paint)
      image.src = svgData(paint)
    }).observe(host, { attributes: true, attributeFilter: ['style'] })
  })
  for (const [target, outputProbe] of [
    ['c2-raster-probe svg', 'svg-bitmap'],
    ['c2-raster-probe img', 'image-bitmap'],
  ] as const) {
    const result = await checkObservableEffect(page, {
      host: 'c2-raster-probe',
      name: '--c2-raster-probe--paint',
      value: 'red',
      target,
      assertion: 'programmatic-output',
      valueSyntax: 'color',
      outputProbe,
    })
    expect(result.kind, outputProbe).toBe('changed')
  }
})

test('a reviewed stability window rejects delayed stepped output', async ({ page }) => {
  await page.setContent('<c2-step-probe><span class="target">First</span></c2-step-probe>')
  await page.evaluate(() => {
    const target = document.querySelector('.target')
    let step = 0
    setInterval(() => {
      if (target) target.textContent = ++step % 2 ? 'Second' : 'First'
    }, 120)
  })
  const result = await checkObservableEffect(page, {
    host: 'c2-step-probe',
    name: '--c2-step-probe--color',
    value: 'red',
    target: '.target',
    assertion: 'programmatic-output',
    valueSyntax: 'color',
    outputProbe: 'text-content',
    stabilityWindowMs: 300,
  })
  expect(result.kind).toBe('unstable-output')
})

test('style-attribute mutation alone cannot prove computed or programmatic value effects', async ({ page }) => {
  await page.setContent('<c2-causal-probe><span class="target">Before</span><canvas width="10" height="10"></canvas></c2-causal-probe>')
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('c2-causal-probe')
    const target = host?.querySelector<HTMLElement>('.target')
    const canvas = host?.querySelector('canvas')
    const paint = () => {
      if (!host || !target || !canvas) return
      const changed = host.style.getPropertyValue('--c2-causal-probe--color') !== ''
      target.style.color = changed ? 'red' : 'blue'
      target.textContent = changed ? 'After' : 'Before'
      const context = canvas.getContext('2d')
      if (context) {
        context.fillStyle = changed ? 'red' : 'blue'
        context.fillRect(0, 0, 10, 10)
      }
    }
    new MutationObserver(paint).observe(host!, { attributes: true, attributeFilter: ['style'] })
    paint()
  })
  for (const [assertion, target, declaration, outputProbe] of [
    ['computed-style', '.target', 'color', undefined],
    ['programmatic-output', 'canvas', undefined, 'canvas-bitmap'],
  ] as const) {
    const result = await checkObservableEffect(page, {
      host: 'c2-causal-probe',
      name: '--c2-causal-probe--color',
      value: 'red',
      target,
      assertion,
      declaration,
      valueSyntax: 'color',
      outputProbe,
    })
    expect(result.kind, assertion).not.toBe('changed')
  }
})

test('hidden computed and text changes are not observable presentation', async ({ page }) => {
  await page.setContent(`<c2-hidden-probe><span class="target">Before</span></c2-hidden-probe>
    <style>.target { display: none; color: var(--c2-hidden-probe--color, blue) }</style>`)
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('c2-hidden-probe')
    const target = host?.querySelector('.target')
    if (!host || !target) return
    new MutationObserver(() => {
      target.textContent = host.style.getPropertyValue('--c2-hidden-probe--color') ? 'After' : 'Before'
    }).observe(host, { attributes: true, attributeFilter: ['style'] })
  })
  for (const [assertion, declaration, outputProbe] of [
    ['computed-style', 'color', undefined],
    ['programmatic-output', undefined, 'text-content'],
  ] as const) {
    const result = await checkObservableEffect(page, {
      host: 'c2-hidden-probe',
      name: '--c2-hidden-probe--color',
      value: 'red',
      target: '.target',
      assertion,
      declaration,
      outputProbe,
      valueSyntax: 'color',
    })
    expect(result.kind, assertion).not.toBe('changed')
  }
})

test('SVG bitmap observes externally styled filter, clipping, and transform effects', async ({ page }) => {
  await page.setContent(`<c2-svg-effect-probe>
    <svg width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" fill="blue"></rect></svg>
  </c2-svg-effect-probe>
  <style>
    c2-svg-effect-probe rect {
      filter: var(--c2-svg-effect-probe--filter, none);
      clip-path: var(--c2-svg-effect-probe--clip-path, none);
      transform: var(--c2-svg-effect-probe--transform, none);
    }
  </style>`)
  for (const [name, value, valueSyntax] of [
    ['--c2-svg-effect-probe--filter', 'invert(1)', 'filter'],
    ['--c2-svg-effect-probe--clip-path', 'inset(50% 0 0 0)', 'clip-path'],
    ['--c2-svg-effect-probe--transform', 'translateX(10px)', 'transform'],
  ] as const) {
    const result = await checkObservableEffect(page, {
      host: 'c2-svg-effect-probe',
      name,
      value,
      target: 'c2-svg-effect-probe svg',
      assertion: 'programmatic-output',
      outputProbe: 'svg-bitmap',
      valueSyntax,
    })
    expect(result.kind, name).toBe('changed')
  }
})

test('hidden bitmap surfaces cannot prove an effect; visible output can', async ({ page }) => {
  await page.setContent(`<c2-hidden-bitmap-probe>
    <div class="output-wrapper" style="display: none">
      <canvas width="10" height="10"></canvas>
      <img width="10" height="10" alt="Rendered output">
      <svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" fill="blue"></rect></svg>
    </div>
  </c2-hidden-bitmap-probe>`)
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('c2-hidden-bitmap-probe')
    const canvas = host?.querySelector('canvas')
    const image = host?.querySelector('img')
    const rect = host?.querySelector('svg rect')
    if (!host || !canvas || !image || !rect) return
    const paint = () => {
      const color = getComputedStyle(host).getPropertyValue('--c2-hidden-bitmap-probe--color').trim() || 'blue'
      const context = canvas.getContext('2d')
      if (context) {
        context.fillStyle = color
        context.fillRect(0, 0, 10, 10)
      }
      rect.setAttribute('fill', color)
      image.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="${color}"/></svg>`)}`
    }
    new MutationObserver(paint).observe(host, { attributes: true, attributeFilter: ['style'] })
    paint()
  })
  const probes = [
    ['canvas', 'canvas-bitmap'],
    ['img', 'image-bitmap'],
    ['svg', 'svg-bitmap'],
  ] as const
  for (const [target, outputProbe] of probes) {
    const result = await checkObservableEffect(page, {
      host: 'c2-hidden-bitmap-probe',
      name: '--c2-hidden-bitmap-probe--color',
      value: 'red',
      target: `c2-hidden-bitmap-probe ${target}`,
      assertion: 'programmatic-output',
      outputProbe,
      valueSyntax: 'color',
    })
    expect(result.kind, `hidden ${outputProbe}`).not.toBe('changed')
  }
  await page.locator('.output-wrapper').evaluate((element) => (element as HTMLElement).style.removeProperty('display'))
  for (const [target, outputProbe] of probes) {
    const result = await checkObservableEffect(page, {
      host: 'c2-hidden-bitmap-probe',
      name: '--c2-hidden-bitmap-probe--color',
      value: 'red',
      target: `c2-hidden-bitmap-probe ${target}`,
      assertion: 'programmatic-output',
      outputProbe,
      valueSyntax: 'color',
    })
    expect(result.kind, `visible ${outputProbe}`).toBe('changed')
  }
})

test('zero-area bitmap surfaces cannot prove an effect despite changing intrinsic pixels', async ({ page }) => {
  await page.setContent(`<c2-zero-bitmap-probe>
    <canvas width="10" height="10"></canvas>
    <img width="10" height="10" alt="Bitmap">
    <svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" fill="blue"></rect></svg>
  </c2-zero-bitmap-probe>`)
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('c2-zero-bitmap-probe')!
    const canvas = host.querySelector('canvas')!
    const image = host.querySelector('img')!
    const rect = host.querySelector('svg rect')!
    const paint = () => {
      const color = getComputedStyle(host).getPropertyValue('--c2-zero-bitmap-probe--color').trim() || 'blue'
      const context = canvas.getContext('2d')!
      context.fillStyle = color
      context.fillRect(0, 0, 10, 10)
      rect.setAttribute('fill', color)
      image.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="${color}"/></svg>`)}`
    }
    new MutationObserver(paint).observe(host, { attributes: true, attributeFilter: ['style'] })
    paint()
  })
  const probes = [
    ['canvas', 'canvas-bitmap'],
    ['img', 'image-bitmap'],
    ['svg', 'svg-bitmap'],
  ] as const
  for (const zeroDimension of ['width', 'height'] as const) {
    await page.locator('c2-zero-bitmap-probe').evaluate((host, dimension) => {
      for (const target of host.children) (target as HTMLElement).style.setProperty(dimension, '0px')
    }, zeroDimension)
    for (const [target, outputProbe] of probes) {
      const result = await checkObservableEffect(page, {
        host: 'c2-zero-bitmap-probe',
        name: '--c2-zero-bitmap-probe--color',
        value: 'red',
        target: `c2-zero-bitmap-probe ${target}`,
        assertion: 'programmatic-output',
        valueSyntax: 'color',
        outputProbe,
      })
      expect(result.kind, `${zeroDimension} ${outputProbe}`).not.toBe('changed')
    }
    await page.locator('c2-zero-bitmap-probe').evaluate((host, dimension) => {
      for (const target of host.children) (target as HTMLElement).style.removeProperty(dimension)
    }, zeroDimension)
  }
  for (const [target, outputProbe] of probes) {
    const result = await checkObservableEffect(page, {
      host: 'c2-zero-bitmap-probe',
      name: '--c2-zero-bitmap-probe--color',
      value: 'red',
      target: `c2-zero-bitmap-probe ${target}`,
      assertion: 'programmatic-output',
      valueSyntax: 'color',
      outputProbe,
    })
    expect(result.kind, `visible ${outputProbe}`).toBe('changed')
  }
})
