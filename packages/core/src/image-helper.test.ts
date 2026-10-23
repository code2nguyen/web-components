import assert from 'node:assert/strict'
import { test } from 'node:test'

import { imageFromMarkdown, imageToMarkdown, MIN_IMAGE_WIDTH } from './image-helper.ts'

test('an image reads back from the Markdown line it is written as', () => {
  for (const image of [
    { src: 'app-image:4f2a', alt: '', width: null },
    { src: 'https://example.com/a.png', alt: 'A chart', width: 320 },
    { src: 'data:image/png;base64,iVBORw0KGgo=', alt: 'tricky [alt] | with \\ marks', width: 480 },
    { src: 'images/my photo (1).png', alt: 'spaces', width: null },
    { src: 'notes/a <draft>.png', alt: 'angle brackets', width: null },
    { src: 'files/a%3Cb c.png', alt: 'a percent sign', width: null },
  ]) {
    const line = imageToMarkdown(image)
    assert.deepEqual(imageFromMarkdown(line), image, line)
  }
})

test('the width follows a bar in the alt text, as Obsidian writes it', () => {
  assert.equal(imageToMarkdown({ src: 'a.png', alt: 'Cat', width: 300.4 }), '![Cat|300](a.png)')
  assert.deepEqual(imageFromMarkdown('![|200](a.png)'), { src: 'a.png', alt: '', width: 200 })
  assert.deepEqual(imageFromMarkdown('![x|2](a.png)'), { src: 'a.png', alt: 'x', width: MIN_IMAGE_WIDTH })
})

test('only an image alone on its line is an image block', () => {
  assert.equal(imageFromMarkdown('Look: ![x](a.png)'), null)
  assert.equal(imageFromMarkdown('![x](a.png) and more'), null)
  assert.equal(imageFromMarkdown('[x](a.png)'), null)
  assert.equal(imageFromMarkdown('![x]()'), null)
  assert.deepEqual(imageFromMarkdown('  ![x](a.png)  '), { src: 'a.png', alt: 'x', width: null })
})
