import type { Page } from '@playwright/test'

export type ObservableCase = {
  host: string
  name: string
  value: string
  controlValue?: string
  target: string
  assertion: 'computed-style' | 'geometry' | 'pseudo-style' | 'slotted-style' | 'delegated-style' | 'programmatic-output'
  declaration?: string
  valueSyntax?: string
  pseudo?: string
  state?: string
  outputProbe?: 'canvas-bitmap' | 'svg-bitmap' | 'image-bitmap' | 'text-content'
  geometryMetric?: 'width' | 'height' | 'x' | 'y' | 'area'
  stabilityWindowMs?: number
  childTag?: string
  publishedType?: string
}

export type ObservableResult = {
  kind: 'changed' | 'no-observable-change' | 'invalid-test-value' | 'unstable-output'
  before?: string
  after?: string
  hostEcho?: string
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
}

async function readStableTarget(page: Page, options: ObservableCase): Promise<string | null> {
  let previous = await readTarget(page, options)
  let matchingFrames = 0
  let stableSince: number | null = null
  const observationWindow = options.stabilityWindowMs ?? (options.assertion === 'programmatic-output' ? 200 : 0)
  const maxFrames = Math.max(90, Math.ceil(observationWindow / 16) + 90)
  for (let frame = 0; frame < maxFrames; frame++) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    const current = await readTarget(page, options)
    matchingFrames = current === previous ? matchingFrames + 1 : 0
    if (matchingFrames === 3) stableSince = Date.now()
    if (matchingFrames === 0) stableSince = null
    if (stableSince !== null && Date.now() - stableSince >= observationWindow) return current
    previous = current
  }
  return null
}

const CONTROL_VALUES = [
  'rgb(17, 73, 231)',
  '11px',
  '1px solid rgb(17, 73, 231)',
  '0.73',
  '1200ms',
  'sans-serif',
  'inset(25% 0 0 0)',
  'translateX(3px)',
  'invert(0.2)',
  'none',
]

async function contrastingControlValue(page: Page, syntax: string, typeSyntax: string | null, value: string): Promise<string> {
  const control = await page.evaluate(
    ([observedSyntax, publishedSyntax, original, candidates]) =>
      candidates.find(
        (candidate) => candidate !== original && CSS.supports(observedSyntax, candidate) && (!publishedSyntax || CSS.supports(publishedSyntax, candidate)),
      ),
    [syntax, typeSyntax, value, CONTROL_VALUES] as const,
  )
  if (!control) throw new Error(`no independent valid control value for ${syntax}; use a supported value syntax`)
  return control
}

async function readTarget(page: Page, options: ObservableCase): Promise<string> {
  const target = page.locator(options.target).first()
  if (options.assertion === 'geometry') {
    const box = await target.boundingBox()
    if (!box || !options.geometryMetric) throw new Error(`${options.name}: geometry requires a visible target and geometryMetric`)
    return String(options.geometryMetric === 'area' ? box.width * box.height : box[options.geometryMetric])
  }
  if (options.assertion === 'programmatic-output') {
    return target.evaluate(async (element, probe) => {
      const visiblyRendered = (target: Element) => {
        let current: Element | null = target
        while (current) {
          const style = getComputedStyle(current)
          if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return false
          const root: Node = current.getRootNode()
          current = current.assignedSlot ?? current.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
        }
        return Array.from(target.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0)
      }
      if (['canvas-bitmap', 'image-bitmap', 'svg-bitmap'].includes(probe ?? '') && !visiblyRendered(element)) return '[non-rendered]'
      if (probe === 'canvas-bitmap' && element instanceof HTMLCanvasElement) return element.toDataURL()
      if (probe === 'text-content') return visiblyRendered(element) ? JSON.stringify({ rendered: true, value: element.textContent ?? '' }) : '[non-rendered]'
      const renderedBitmap = async (image: HTMLImageElement, width: number, height: number) => {
        await image.decode()
        if (!width || !height || width > 2048 || height > 2048) throw new Error('rendered bitmap has unsupported dimensions')
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width)
        canvas.height = Math.round(height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('rendered bitmap canvas is unavailable')
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        try {
          return canvas.toDataURL('image/png')
        } catch {
          throw new Error('rendered bitmap is not observable (cross-origin or protected pixels)')
        }
      }
      if (probe === 'image-bitmap' && element instanceof HTMLImageElement) return renderedBitmap(element, element.naturalWidth, element.naturalHeight)
      if (probe === 'svg-bitmap' && element instanceof SVGElement) {
        const live = [element, ...element.querySelectorAll('*')]
        const clone = element.cloneNode(true) as SVGElement
        const copied = [clone, ...clone.querySelectorAll('*')]
        for (const [index, original] of live.entries()) {
          const computed = getComputedStyle(original)
          const replica = copied[index]
          if (!(replica instanceof SVGElement)) continue
          for (let propertyIndex = 0; propertyIndex < computed.length; propertyIndex++) {
            const property = computed.item(propertyIndex)
            replica.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property))
          }
        }
        const bounds = element.getBoundingClientRect()
        clone.setAttribute('width', String(bounds.width))
        clone.setAttribute('height', String(bounds.height))
        const markup = new XMLSerializer().serializeToString(clone)
        const image = new Image()
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
        return renderedBitmap(image, bounds.width, bounds.height)
      }
      throw new Error(`output probe ${probe} does not match its rendered target`)
    }, options.outputProbe)
  }
  if (!options.declaration) throw new Error(`${options.name}: ${options.assertion} requires a declaration`)
  return target.evaluate(
    (element, { declaration, pseudo }) => {
      let current: Element | null = element
      while (current) {
        const style = getComputedStyle(current)
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return '[non-rendered]'
        const root: Node = current.getRootNode()
        current = current.assignedSlot ?? current.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
      }
      if (!element.getClientRects().length) return '[non-rendered]'
      const style = getComputedStyle(element, pseudo)
      if (
        pseudo &&
        (style.content === 'none' || style.content === 'normal' || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)
      )
        return '[non-rendered]'
      return JSON.stringify({ rendered: true, value: style.getPropertyValue(declaration).trim() })
    },
    {
      declaration: options.declaration,
      pseudo: options.pseudo,
    },
  )
}

async function assertTargetBoundary(page: Page, options: ObservableCase) {
  const host = await page.locator(options.host).first().elementHandle()
  if (!host) throw new Error(`${options.name}: missing host target`)
  const valid = await page
    .locator(options.target)
    .first()
    .evaluate(
      (element, { host, assertion, childTag }) => {
        const belongsToHost = () => {
          let node: Element | null = element
          while (node) {
            if (node === host) return true
            const root: Node = node.getRootNode()
            node = node.assignedSlot ?? node.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
          }
          return false
        }
        if (!belongsToHost()) return false
        if (assertion === 'programmatic-output') return element !== host
        if (assertion === 'slotted-style') {
          for (let node: Element | null = element; node && node !== host; node = node.parentElement) {
            const slot = node.assignedSlot
            const slotRoot = slot?.getRootNode()
            if (slotRoot instanceof ShadowRoot && slotRoot.host === host) return true
          }
          return false
        }
        if (assertion !== 'delegated-style') return true
        if (!childTag) return false
        let sawChild = false
        let node: Element | null = element
        while (node && node !== host) {
          if (node.localName === childTag) sawChild = true
          const root: Node = node.getRootNode()
          node = node.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
        }
        return node === host && sawChild
      },
      { host, assertion: options.assertion, childTag: options.childTag },
    )
  if (!valid) throw new Error(`${options.name}: ${options.assertion} target is outside the declared public boundary`)
}

const PUBLISHED_TYPE_SYNTAX: Record<string, string> = {
  color: 'color',
  pixel: 'width',
  length: 'width',
  border: 'border',
  'border-radius': 'border-radius',
  'font-family': 'font-family',
  number: 'stroke-width',
  opacity: 'opacity',
  time: 'animation-duration',
  duration: 'animation-duration',
}

async function activateState(page: Page, options: ObservableCase) {
  if (options.state === 'hover') await page.locator(options.target).first().hover()
  else if (options.state === 'focus') await page.locator(options.target).first().focus()
  else if (options.state && options.state !== 'base')
    await page.locator(options.host).evaluate((element, state) => element.setAttribute(state, ''), options.state)
}

/** Compare the intended rendered target, not the custom-property echo on the host. */
export async function checkObservableEffect(page: Page, options: ObservableCase): Promise<ObservableResult> {
  if (options.assertion === 'pseudo-style' && !['::before', '::after'].includes(options.pseudo ?? ''))
    throw new Error(`${options.name}: pseudo-style requires a pseudo target`)
  const syntax = options.valueSyntax ?? options.declaration
  if (!syntax) throw new Error(`${options.name}: a value syntax is required before observing an effect`)
  if (options.assertion === 'programmatic-output' && !options.outputProbe) throw new Error(`${options.name}: programmatic target requires an outputProbe`)
  if (options.assertion === 'geometry' && !options.geometryMetric) throw new Error(`${options.name}: geometry requires geometryMetric`)
  await assertTargetBoundary(page, options)
  if (/\b(?:var|env|attr)\s*\(/i.test(options.value)) return { kind: 'invalid-test-value' }
  const typeSyntax = options.publishedType ? (PUBLISHED_TYPE_SYNTAX[options.publishedType] ?? options.publishedType) : null
  const valueIsValid = await page.evaluate(
    ([observedSyntax, typeSyntax, value]) => CSS.supports(observedSyntax, value) && (!typeSyntax || CSS.supports(typeSyntax, value)),
    [syntax, typeSyntax, options.value] as const,
  )
  if (!valueIsValid) {
    return { kind: 'invalid-test-value' }
  }
  if (options.controlValue !== undefined) {
    if (options.controlValue.trim() === options.value.trim() || /\b(?:var|env|attr)\s*\(/i.test(options.controlValue)) return { kind: 'invalid-test-value' }
    const controlIsValid = await page.evaluate(
      ([observedSyntax, publishedSyntax, value]) => CSS.supports(observedSyntax, value) && (!publishedSyntax || CSS.supports(publishedSyntax, value)),
      [syntax, typeSyntax, options.controlValue] as const,
    )
    if (!controlIsValid) return { kind: 'invalid-test-value' }
  }
  const controlValue = options.controlValue ?? (await contrastingControlValue(page, syntax, typeSyntax, options.value))
  const host = page.locator(options.host).first()
  const previous = await host.evaluate((element, name) => (element as HTMLElement).style.getPropertyValue(name), options.name)
  const placeboName = '--c2-style-contract-placebo'
  const previousPlacebo = await host.evaluate((element, name) => (element as HTMLElement).style.getPropertyValue(name), placeboName)
  const hadState = options.state && options.state !== 'base' && !['hover', 'focus'].includes(options.state) ? await host.getAttribute(options.state) : null
  const restoreValue = () =>
    host.evaluate(
      (element, { name, previous }) => {
        if (previous) (element as HTMLElement).style.setProperty(name, previous)
        else (element as HTMLElement).style.removeProperty(name)
      },
      { name: options.name, previous },
    )
  try {
    await activateState(page, options)
    await settle(page)
    const before = await readStableTarget(page, options)
    if (before === null) return { kind: 'unstable-output' }
    await host.evaluate((element, { name, value }) => (element as HTMLElement).style.setProperty(name, value), {
      name: placeboName,
      value: options.value,
    })
    await settle(page)
    const placebo = await readStableTarget(page, options)
    if (placebo === null || placebo !== before) return { kind: 'unstable-output', before, after: placebo ?? undefined }
    await host.evaluate(
      (element, { name, previous }) => {
        if (previous) (element as HTMLElement).style.setProperty(name, previous)
        else (element as HTMLElement).style.removeProperty(name)
      },
      { name: placeboName, previous: previousPlacebo },
    )
    await settle(page)
    if ((await readStableTarget(page, options)) !== before) return { kind: 'unstable-output', before }
    await host.evaluate((element, { name, value }) => (element as HTMLElement).style.setProperty(name, value), { name: options.name, value: options.value })
    await settle(page)
    const after = await readStableTarget(page, options)
    if (after === null) return { kind: 'unstable-output', before }
    const hostEcho = await host.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name).trim(), options.name)
    if (before !== after) {
      await host.evaluate((element, { name, value }) => (element as HTMLElement).style.setProperty(name, value), { name: options.name, value: controlValue })
      await settle(page)
      const control = await readStableTarget(page, options)
      if (control === null) return { kind: 'unstable-output', before, after, hostEcho }
      if (control === after) return { kind: 'no-observable-change', before, after, hostEcho }
      await restoreValue()
      await settle(page)
      if ((await readStableTarget(page, options)) !== before) return { kind: 'unstable-output', before, after, hostEcho }
    }
    return { kind: before === after ? 'no-observable-change' : 'changed', before, after, hostEcho }
  } finally {
    await restoreValue()
    await host.evaluate(
      (element, { name, previous }) => {
        if (previous) (element as HTMLElement).style.setProperty(name, previous)
        else (element as HTMLElement).style.removeProperty(name)
      },
      { name: placeboName, previous: previousPlacebo },
    )
    if (options.state && options.state !== 'base' && !['hover', 'focus'].includes(options.state)) {
      await host.evaluate(
        (element, { state, prior }) => {
          if (prior === null) element.removeAttribute(state)
          else element.setAttribute(state, prior)
        },
        { state: options.state, prior: hadState },
      )
    }
  }
}
