import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateMarkup, type Finding } from '../src/lib/validate.ts'
import { loadRegistry } from '../src/registry.ts'

const registry = loadRegistry()
const rules = (source: string, filename?: string) => validateMarkup(registry, source, filename).findings.map((f: Finding) => `${f.line}:${f.rule}`)

test('suggests the c2 element for a native control, by input type', () => {
  const findings = validateMarkup(registry, '<input type="email">\n<input type="checkbox">\n<input type="hidden">\n<button>Go</button>').findings
  assert.deepEqual(
    findings.map((f) => f.line),
    [1, 2, 4],
  )
  assert.match(findings[0].message, /c2-text-field/)
  assert.match(findings[1].message, /c2-checkbox/)
  assert.match(findings[2].message, /c2-button/)
})

test('c2n-ignore exempts its own line, or the next one from a line of its own', () => {
  assert.deepEqual(rules('<button>a</button> <!-- c2n-ignore -->\n<button>b</button>\n<!-- c2n-ignore -->\n<button>c</button>'), ['2:native-element'])
})

test('reports unknown tags, attributes, slots and events with suggestions', () => {
  const findings = validateMarkup(
    registry,
    '<c2-buton></c2-buton>\n<c2-button varient="x" disabled @click=${f} @nope=${g}><span slot="prefx-icon"></span><span slot="prefix-icon"></span></c2-button>',
  ).findings
  assert.deepEqual(
    findings.map((f) => f.rule),
    ['unknown-element', 'unknown-attribute', 'unknown-event', 'unknown-slot'],
  )
  assert.match(findings[0].message, /c2-button/)
  assert.match(findings[3].message, /prefix-icon/)
})

test('a static camelCase attribute is the silent no-op, a property binding is not', () => {
  const [finding] = validateMarkup(registry, '<c2-table rowKey="id"></c2-table>').findings
  assert.match(finding.message, /observes the attribute `row-key`/)
  assert.deepEqual(rules('<c2-table .rowKey=${k} :row-key="k" [rowKey]="k" .rows=${rows}></c2-table>'), [])
  assert.deepEqual(rules('export const A = () => <c2-table rowKey="id" rows={rows} onClick={() => {}} className="t" />', 'A.tsx'), [])
  // Properties without an attribute are only reachable through a binding.
  assert.deepEqual(rules('<c2-table-column [renderCell]="render"></c2-table-column>'), [])
  assert.deepEqual(rules('<c2-table-column renderCell="x"></c2-table-column>'), ['1:unknown-attribute'])
})

test('reads Lit expressions with quotes and nested templates as one value', () => {
  assert.deepEqual(
    rules('html`<c2-text-field placeholder="${a ? \'x\' : "y"}" .value=${b.map((c) => html`<i>${c}</i>`)} ?disabled=${d && e}></c2-text-field>`', 'a.ts'),
    [],
  )
})

test('accepts templated slot names and framework directives', () => {
  assert.deepEqual(rules('<c2-table><span slot="cell:3:change"></span></c2-table>'), [])
  assert.deepEqual(rules('<c2-text-field v-model="q" :value.prop="v" @input="f" client:load *ngIf="x" [(ngModel)]="m" ngModel></c2-text-field>'), [])
})

test('flags unknown CSS variables and box styling on a c2 host', () => {
  const findings = validateMarkup(
    registry,
    'c2-button { padding: 4px; margin: 0; color: red }\n.x c2-select::part(button) { padding: 1px }\n.y { --c2-button__container--background-color: red; --c2-buttn--x: 1px; width: var(--c2-theme--color-primary) }\n/* the --c2-chart__series-1… family */',
    'a.css',
  ).findings
  assert.deepEqual(
    findings.map((f) => `${f.line}:${f.rule}:${f.severity}`),
    ['1:host-box-style:warning', '3:unknown-css-variable:error'],
  )
})

test('lists the elements a source uses with their modules', () => {
  const { elements } = validateMarkup(registry, '<c2-tabs><c2-tab></c2-tab></c2-tabs><c2-feather-arrow-right></c2-feather-arrow-right>')
  assert.deepEqual(
    elements.map((e) => e.tag),
    ['c2-tabs', 'c2-tab', 'c2-feather-arrow-right'],
  )
  assert.ok(elements.every((e) => e.modulePath.startsWith('@c2n/')))
})
