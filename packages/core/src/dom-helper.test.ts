import assert from 'node:assert/strict'
import { test } from 'node:test'

import { composedSelectionRange, composedSelectionRanges, findWrapped, isFormControl, isIslandWrapper, isLayoutWrapper, unwrapContents } from './dom-helper.ts'

/** Just enough of an element for the tree walks: these helpers read no other DOM API (and Node has no DOM). */
class FakeElement {
  readonly localName: string
  readonly children: FakeElement[]
  readonly attributes: Record<string, string>
  constructor(localName: string, children: FakeElement[] = [], attributes: Record<string, string> = {}) {
    this.localName = localName
    this.children = children
    this.attributes = attributes
  }
  get childElementCount() {
    return this.children.length
  }
  get firstElementChild() {
    return this.children[0] ?? null
  }
  getAttribute(name: string) {
    return this.attributes[name] ?? null
  }
}

class FormAssociated extends FakeElement {
  static formAssociated = true
}

const el = (name: string, ...children: FakeElement[]) => new FakeElement(name, children) as unknown as Element & FakeElement
const asElement = (fake: FakeElement) => fake as unknown as Element

test('island wrappers are recognised by tag, also as layout wrappers on the server', () => {
  for (const name of ['astro-island', 'astro-slot', 'astro-static-slot']) {
    assert.equal(isIslandWrapper(el(name)), true)
    assert.equal(isLayoutWrapper(el(name)), true)
  }
  assert.equal(isIslandWrapper(el('div')), false)
  // No styles in Node (the server): only the tag counts.
  assert.equal(isLayoutWrapper(el('span')), false)
})

test('unwrapContents looks through single-child wrappers only, by default', () => {
  const icon = el('svg')
  assert.equal(unwrapContents(el('astro-island', el('astro-slot', icon))), icon)
  const crowded = el('astro-island', el('svg'), el('span'))
  assert.equal(unwrapContents(crowded), crowded)
  const plain = el('div', icon)
  assert.equal(unwrapContents(plain), plain)
  assert.equal(unwrapContents(null), null)
  assert.equal(unwrapContents(undefined), undefined)
})

test('unwrapContents takes another wrapper test, and can step into the first of several children', () => {
  const button = el('c2-button')
  const label = el('label', button)
  assert.equal(unwrapContents(label, { wrapper: (element) => element.localName === 'label' }), button)
  assert.equal(unwrapContents(el('astro-island', button, el('span')), { onlyChild: false }), button)
  const empty = el('astro-island')
  assert.equal(unwrapContents(empty, { onlyChild: false }), empty)
  // A stop: the wrapper test refuses the element, so it is the answer.
  const svg = el('svg', el('g'))
  assert.equal(unwrapContents(svg, { wrapper: (element) => element.localName !== 'svg' }), svg)
})

test('findWrapped finds the element itself or the first match within the depth, skipping where told', () => {
  const isItem = (element: Element): element is Element => element.localName === 'c2-list-item'
  const item = el('c2-list-item')
  assert.equal(findWrapped(item, isItem), item)
  assert.equal(findWrapped(el('astro-island', el('span'), item), isItem), item)
  const deep = el('astro-island', el('c2-swipe-action', el('astro-island', item)))
  assert.equal(findWrapped(deep, isItem), undefined)
  assert.equal(findWrapped(deep, isItem, { depth: 3 }), item)
  const nested = el('div', el('c2-list', item))
  assert.equal(findWrapped(nested, isItem, { depth: 3, skip: (element) => element.localName === 'c2-list' }), undefined)
  assert.equal(findWrapped(el('c2-list', item), isItem, { depth: 3, skip: (element) => element.localName === 'c2-list' }), undefined)
})

test('isFormControl: native controls and form-associated elements; entryOnly drops buttons and hidden inputs', () => {
  const input = (type?: string) => asElement(new FakeElement('input', [], type === undefined ? {} : { type }))
  assert.equal(isFormControl(input()), true)
  assert.equal(isFormControl(el('select')), true)
  assert.equal(isFormControl(el('textarea')), true)
  assert.equal(isFormControl(el('div')), false)
  assert.equal(isFormControl(el('button')), false)
  assert.equal(isFormControl(null), false)
  assert.equal(isFormControl(asElement(new FormAssociated('c2-text-field'))), true)
  assert.equal(isFormControl(asElement(new FormAssociated('c2-button'))), true)

  for (const type of ['hidden', 'submit', 'reset', 'image', 'button', 'SUBMIT']) {
    assert.equal(isFormControl(input(type)), true)
    assert.equal(isFormControl(input(type), { entryOnly: true }), false)
  }
  assert.equal(isFormControl(input('email'), { entryOnly: true }), true)
  assert.equal(isFormControl(input(), { entryOnly: true }), true)
  assert.equal(isFormControl(asElement(new FormAssociated('c2-button')), { entryOnly: true }), false)
  assert.equal(isFormControl(asElement(new FormAssociated('c2-split-button')), { entryOnly: true }), false)
  assert.equal(isFormControl(asElement(new FormAssociated('c2-select')), { entryOnly: true }), true)
})

test('composedSelectionRanges takes the options object, then the roots as arguments', () => {
  const root = {} as ShadowRoot
  const range = {} as StaticRange
  const standard = {
    getComposedRanges(options: { shadowRoots: ShadowRoot[] }) {
      assert.deepEqual(options.shadowRoots, [root])
      return [range]
    },
  } as unknown as Selection
  assert.deepEqual(composedSelectionRanges(standard, [root]), [range])
  assert.equal(composedSelectionRange(standard, [root]), range)

  // Safari 17: the roots as arguments, and a TypeError for anything else.
  const variadic = {
    getComposedRanges(...roots: unknown[]) {
      if (roots.some((candidate) => candidate !== root)) throw new TypeError('not a ShadowRoot')
      return [range]
    },
  } as unknown as Selection
  assert.equal(composedSelectionRange(variadic, [root]), range)

  const broken = {
    getComposedRanges() {
      throw new TypeError('nope')
    },
  } as unknown as Selection
  assert.equal(composedSelectionRanges(broken, [root]), undefined)
  assert.equal(composedSelectionRanges({} as Selection, [root]), undefined)
  assert.equal(composedSelectionRange({ getComposedRanges: () => [] } as unknown as Selection, [root]), undefined)
})
