import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateMarkup, type Finding } from '../src/lib/validate.ts'
import { jsonList } from '../src/server.ts'
import type { ComponentEntry, ElementEntry, Registry } from '../src/registry-types.ts'

// A small registry of its own: `data/registry.json` is a build artifact, and deploy.yml runs these tests before it exists.
type Api = { attributes?: string[]; properties?: string[]; slots?: string[]; events?: string[]; css?: string[] }
function element(tag: string, pkg: string, api: Api = {}): ElementEntry {
  return {
    tag,
    className: '',
    modulePath: `@c2n/components/${pkg}`,
    description: '',
    attributes: (api.attributes ?? []).map((name) => ({ name, type: '' })),
    properties: api.properties,
    slots: (api.slots ?? []).map((name) => ({ name })),
    events: (api.events ?? []).map((name) => ({ name })),
    cssParts: [],
    cssProperties: (api.css ?? []).map((name) => ({ name, type: '', part: '', property: '' })),
  }
}
function component(id: string, elements: ElementEntry[], extra: Partial<ComponentEntry> = {}): ComponentEntry {
  return {
    id,
    package: `@c2n/${id}`,
    title: id,
    description: '',
    category: 'Test',
    status: 'stable',
    docsUrl: '',
    elements,
    composition: { internal: [], slotted: [], usedBy: [] },
    install: { npm: '', import: '', importClass: '' },
    examples: [],
    hasGallery: false,
    ...extra,
  }
}
const components = [
  component('button', [
    element('c2-button', 'button', {
      attributes: ['disabled', 'type', 'value', 'name'],
      slots: ['default', 'prefix-icon', 'suffix-icon'],
      css: ['--c2-button__container--background-color', '--c2-button__container--border'],
    }),
  ]),
  component('icon-button', [element('c2-icon-button', 'icon-button', { attributes: ['disabled'] })]),
  component('text-field', [
    element('c2-text-field', 'text-field', { attributes: ['placeholder', 'value', 'disabled', 'type', 'readonly'], events: ['input', 'change', 'clear'] }),
  ]),
  component('textarea', [element('c2-textarea', 'textarea')]),
  component('checkbox', [element('c2-checkbox', 'checkbox')]),
  component('switch', [element('c2-switch', 'switch')]),
  component('select', [element('c2-select', 'select', { slots: ['button-prefix-icon'] })]),
  component('table', [
    element('c2-table', 'table', {
      attributes: ['row-key', 'rows', 'selection'],
      properties: ['rows', 'rowKey', 'selection'],
      slots: ['toolbar', 'cell:{line}:{field}'],
      events: ['selection-change'],
    }),
    element('c2-table-column', 'table', { attributes: ['field', 'header', 'cell-slot'], properties: ['field', 'header', 'cellSlot', 'renderCell'] }),
  ]),
  component('tabs', [element('c2-tabs', 'tabs'), element('c2-tab', 'tabs')]),
  component(
    'feather-icons',
    [{ ...element('c2-feather-{name}', 'feather-icons'), modulePath: '@c2n/feather-icons/icons/{name}.js', className: 'Feather{Name}' }],
    {
      tagPattern: 'c2-feather-{name}',
      icons: ['arrow-right'],
    },
  ),
]
const registry: Registry = {
  schemaVersion: 1,
  c2nVersion: '0.0.0',
  categories: ['Test'],
  components: Object.fromEntries(components.map((c) => [c.id, c])),
  tagIndex: Object.fromEntries(components.flatMap((c) => (c.tagPattern ? [] : c.elements.map((e) => [e.tag, c.id])))),
  packageIndex: Object.fromEntries(components.map((c) => [c.package, c.id])),
  theme: {
    package: '@c2n/theme',
    install: { npm: '', imports: [] },
    tokens: [{ name: '--c2-theme--color-primary', category: 'color', light: '#000', description: '', usedBy: 1 }],
    mapping: {},
    darkMode: '',
  },
  guides: { workflow: '', theming: '', 'variant-components': '', frameworks: '' },
}
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
    'c2-button { padding: 4px; margin: 0; color: red; border-radius: 8px; border-top-left-radius: 2px }\n.x c2-select::part(button) { padding: 1px }\n.y { --c2-button__container--background-color: red; --c2-buttn--x: 1px; width: var(--c2-theme--color-primary) }\n/* the --c2-chart__series-1… family */',
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
  assert.deepEqual(
    elements.map((e) => e.modulePath),
    ['@c2n/components/tabs', '@c2n/components/tabs', '@c2n/feather-icons/icons/arrow-right.js'],
  )
})

test('ignores comments, but not markup in strings and templates', () => {
  const source = [
    '// <button>in a comment</button>',
    '/* <c2-buton> */',
    "const a = '<button>rendered</button>'",
    'const b = html`<input type="email">` // https://example.com',
    '{/* <c2-button varient="x"> */}',
  ].join('\n')
  assert.deepEqual(rules(source, 'a.tsx'), ['3:native-element', '4:native-element'])
  assert.deepEqual(rules('<!-- <button>old</button> -->\n<button>new</button>'), ['2:native-element'])
})

test('reports a variable family prefix used in code, not in prose', () => {
  assert.deepEqual(rules('.x { --c2-button__container: red; color: var(--c2-button__container) }', 'a.css'), [
    '1:unknown-css-variable',
    '1:unknown-css-variable',
  ])
  assert.deepEqual(rules('<p>The --c2-button__container… variables</p>'), [])
})

test('reads Vue dynamic arguments, Svelte bind:this, Angular key filters and bound input types', () => {
  assert.deepEqual(rules('<c2-text-field :[name]="v" @[event]="f" v-bind:[other]="w"></c2-text-field>', 'a.vue'), [])
  assert.deepEqual(rules('<c2-text-field bind:this={el} bind:value={v}></c2-text-field>', 'a.svelte'), [])
  assert.deepEqual(rules('<c2-text-field (keydown.enter)="go()" (window:resize)="r()"></c2-text-field>'), [])
  assert.deepEqual(rules('<input :type="kind"><input [type]="kind"><input type={kind}>'), [])
})

test('reads an HTML document case-insensitively, and a framework template case-sensitively', () => {
  const upper = validateMarkup(
    registry,
    '<BUTTON>Go</BUTTON>\n<INPUT TYPE="checkbox">\n<c2-button><SPAN SLOT="prefx-icon"></SPAN></c2-button>',
    'page.html',
  ).findings
  assert.deepEqual(
    upper.map((f) => `${f.line}:${f.rule}`),
    ['1:native-element', '2:native-element', '3:unknown-slot'],
  )
  assert.match(upper[1].message, /c2-checkbox/)
  assert.deepEqual(rules('<c2-text-field PLACEHOLDER="x" readOnly></c2-text-field>', 'page.html'), [])
  assert.deepEqual(rules('<Button>Go</Button>', 'App.vue'), [])
  // The camelCase spelling of a kebab-case attribute is still the silent no-op.
  assert.deepEqual(rules('<c2-table rowKey="id"></c2-table>', 'page.html'), ['1:unknown-attribute'])
})

test('treats a slash before > as self-closing, not as part of the last attribute', () => {
  assert.deepEqual(rules('<c2-table><c2-button disabled/><span slot="toolbar"></span></c2-table>'), [])
})

test('flags box styling in a JSX style object on a c2 host', () => {
  assert.deepEqual(rules('<c2-button style={{ padding: 4, borderTop: "1px solid", width: 10 }}>Go</c2-button>', 'A.tsx'), [
    '1:host-box-style',
    '1:host-box-style',
  ])
})

test('checks JSX on-props and HTML inline handlers against the events the element fires', () => {
  const tsx = validateMarkup(registry, '<c2-table onClick={f} onselection-change={g} onSelectionChange={h} onSelectionChnage={i} />', 'A.tsx').findings
  assert.deepEqual(
    tsx.map((f) => f.message.slice(0, 40)),
    ['`onSelectionChange` listens for an event', '`<c2-table>` fires no `SelectionChnage` '],
  )
  assert.deepEqual(rules('<c2-table onclick="f()" onselection-change="g()" onclik="h()"></c2-table>'), ['1:unknown-event', '1:unknown-event'])
  assert.deepEqual(rules('<c2-button onDoubleClick={f} onDblClick={g} />', 'A.tsx'), ['1:unknown-event'])
})

test('skips Angular class and style bindings, and does not treat name as global', () => {
  assert.deepEqual(rules('<c2-table [class.active]="a" [style.color]="c"></c2-table>'), [])
  assert.deepEqual(rules('<c2-table name="x"></c2-table>'), ['1:unknown-attribute'])
})

test('only a c2n-ignore inside a comment counts, and comments in an inline style are skipped', () => {
  assert.deepEqual(rules('<p>use c2n-ignore</p>\n<button>x</button>'), ['2:native-element'])
  assert.deepEqual(rules('<c2-button style="color: red; /* note */ padding: 4px">Go</c2-button>'), ['1:host-box-style'])
})

test('checks Svelte event modifiers against the events the element fires', () => {
  assert.deepEqual(rules('<c2-text-field on:nope|once={f} on:clear|preventDefault={g}></c2-text-field>', 'a.svelte'), ['1:unknown-event'])
})

test('skips CSS comments in a <style> block and a css template', () => {
  assert.deepEqual(rules('<style>\n/* .x { --c2-buttn--x: 1px } */\n.y { --c2-buttn--y: 1px }\n</style>'), ['3:unknown-css-variable'])
  assert.deepEqual(rules('const s = css`/* --c2-buttn--x: 1px */ .y { --c2-buttn--y: 1px }`', 'a.ts'), ['1:unknown-css-variable'])
  assert.deepEqual(rules('<template><c2-button></c2-button></template>\n<style>\n/* --c2-buttn--x */\n</style>', 'a.vue'), [])
})

test('a c2n-ignore on a continuation line of a multi-line comment counts', () => {
  assert.deepEqual(rules('<!--\n  deliberate: c2n-ignore\n-->\n<button>a</button>\n<button>b</button>'), ['5:native-element'])
  assert.deepEqual(rules('/*\n * c2n-ignore\n */\nconst a = html`<button>a</button>`\nconst b = html`<button>b</button>`', 'a.ts'), ['5:native-element'])

  // The marker covers its own line onward, not code before a comment that opened on an earlier line.
  assert.deepEqual(rules('<button>a</button> <!--\n  c2n-ignore\n-->\n<button>b</button>'), ['1:native-element'])
  // A `//` inside the enclosing block comment does not end it early.
  assert.deepEqual(rules('/* see https://example.com c2n-ignore\n */\nconst a = html`<button>a</button>`\nconst b = html`<button>b</button>`', 'a.ts'), [
    '4:native-element',
  ])
  assert.deepEqual(rules('<!-- https://example.com c2n-ignore\n-->\n<button>a</button>\n<button>b</button>'), ['4:native-element'])
})

test('masks script comments in Vue, Svelte, Astro and MDX, and keeps HTML comments masked', () => {
  const vue =
    '<script setup lang="ts">\n// <c2-buton>\n/* --c2-buttn--x: 1px */\n</script>\n<template>\n<!-- <button>old</button> -->\n<button>new</button>\n</template>'
  assert.deepEqual(rules(vue, 'a.vue'), ['7:native-element'])
  assert.deepEqual(rules('---\n// <c2-buton>\n---\n<!-- <button>x</button> -->\n{/* <button>y</button> */}\n<button>z</button>', 'a.astro'), [
    '6:native-element',
  ])
  assert.deepEqual(rules('{/* <c2-buton varient="x"> */}\n<button>z</button>', 'a.mdx'), ['2:native-element'])
  // Prose with `//` or `/*` in markup is not a comment.
  assert.deepEqual(rules('See https://example.com and src/**/*.ts <button>z</button>', 'a.svelte'), ['1:native-element'])
  assert.deepEqual(rules('<script>// <c2-buton></script><button>z</button>', 'a.svelte'), ['1:native-element'])
})

test('masks comments inside markup expressions, next to code', () => {
  assert.deepEqual(rules('<p>{ /* <button> */ value }</p>\n<button>z</button>', 'a.svelte'), ['2:native-element'])
  assert.deepEqual(rules('{items.map((i) => /* <c2-buton> */ i)}\n{a // <button>\n}', 'a.mdx'), [])
  assert.deepEqual(rules('<p>{{ value /* <button> */ }}</p>', 'a.vue'), [])
  // A string in the expression is not a comment, nor is markup after the expression closes.
  assert.deepEqual(rules('{ "/*" } <button>z</button> { "*/" }', 'a.svelte'), ['1:native-element'])
  // A `}` escaped in a regex literal does not close the expression early.
  assert.deepEqual(rules('<p>{ /\\}/.test(value) /* <button> */ }</p>', 'a.svelte'), [])
  // JSX text inside an expression is rendered, so its `//` is no comment and the markup after it is still checked.
  assert.deepEqual(rules('{<p>https://example.com</p>} <button>z</button>', 'a.mdx'), ['1:native-element'])
  assert.deepEqual(rules('const a = <p>https://example.com</p>; const b = <button>z</button>', 'a.tsx'), ['1:native-element'])
  // Division and comparison are not regexes or JSX.
  assert.deepEqual(rules('{ a / b /* <button> */ }{ a < b /* <button> */ }', 'a.svelte'), [])
  // `//` in a `<style>` block is CSS, not a script comment.
  assert.deepEqual(rules('<style>.a { background: url(https://x.test/a.png); --c2-buttn--x: 1px }</style>', 'a.svelte'), ['1:unknown-css-variable'])
})

test('reads an uppercase STYLE attribute as the inline style', () => {
  assert.deepEqual(rules('<c2-button STYLE="padding: 4px">Go</c2-button>', 'page.html'), ['1:host-box-style'])
})

test('reads MDX as JSX: camelCase props and React event props', () => {
  assert.deepEqual(rules('<c2-table rowKey="id" rows={rows} onClick={f} />', 'page.mdx'), [])
  assert.deepEqual(rules('<c2-table onSelectionChnage={f} />', 'page.mdx'), ['1:unknown-event'])
})

test('a long JSON result drops findings rather than cutting the document', () => {
  const findings = Array.from({ length: 2000 }, (_, i) => ({ line: i, message: 'x'.repeat(40) }))
  const text = jsonList('findings', findings, { elements: [] }, 10_000).content[0].text
  assert.ok(text.length <= 10_000)
  const parsed = JSON.parse(text) as { findings: unknown[]; truncated: boolean; total: number; shown: number }
  assert.equal(parsed.truncated, true)
  assert.equal(parsed.total, 2000)
  assert.equal(parsed.shown, parsed.findings.length)
  assert.equal(JSON.parse(jsonList('findings', findings.slice(0, 2)).content[0].text).truncated, undefined)
})

test('a long JSON result also shortens a long elements list, and says so', () => {
  const findings = [{ line: 1, message: 'x' }]
  const elements = Array.from({ length: 2000 }, (_, i) => ({ tag: `c2-el-${i}`, modulePath: `@c2n/components/el-${i}` }))
  const text = jsonList('findings', findings, { elements }, 10_000).content[0].text
  assert.ok(text.length <= 10_000)
  const parsed = JSON.parse(text) as {
    findings: unknown[]
    elements: unknown[]
    truncated: boolean
    total?: number
    truncatedLists: Record<string, { total: number; shown: number }>
  }
  assert.equal(parsed.findings.length, 1)
  assert.equal(parsed.total, undefined)
  assert.equal(parsed.truncated, true)
  assert.deepEqual(parsed.truncatedLists.elements, { total: 2000, shown: parsed.elements.length })
})
