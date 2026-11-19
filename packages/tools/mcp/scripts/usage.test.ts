import assert from 'node:assert/strict'
import { test } from 'node:test'
import { usageRows } from './usage.ts'

test('reads every row, whatever other attributes its div carries and in any order', () => {
  const rows = usageRows(`
<div data-label="Plain">
  <c2-a></c2-a>
</div>
<div data-label="With a layout" class="fields">
  <div class="inner"><c2-b></c2-b></div>
</div>
<div class="feature-row" data-label="Label second">
  <c2-c></c2-c>
</div>`)
  assert.deepEqual(
    rows.map((row) => row.label),
    ['Plain', 'With a layout', 'Label second'],
  )
  assert.equal(rows[0].html, '<c2-a></c2-a>')
  // The layout the block's CSS styles stays around the markup; the nested div does not end the row.
  assert.equal(rows[1].html, '<div class="fields">\n  <div class="inner"><c2-b></c2-b></div>\n</div>')
  assert.equal(rows[2].html, '<div class="feature-row">\n  <c2-c></c2-c>\n</div>')
})
