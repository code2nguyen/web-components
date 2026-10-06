/**
 * Checks markup and CSS an agent wrote against the registry: native controls a `c2-*` element replaces, unknown
 * `c2-*` tags, attributes, slots, events and `--c2-*` variables, and box styling on a `c2-*` host. It is a tolerant
 * scanner rather than a parser, so the same pass reads HTML, JSX, Vue, Svelte, Astro, Angular and Lit templates.
 *
 * A line holding `c2n-ignore` (or the line after it) is skipped, for the native element that is deliberate.
 */
import { resolveElement, suggest } from '../registry.ts'
import type { ElementEntry, Registry } from '../registry-types.ts'

export type Severity = 'error' | 'warning'

export interface Finding {
  line: number
  column: number
  severity: Severity
  rule: 'native-element' | 'unknown-element' | 'unknown-attribute' | 'unknown-slot' | 'unknown-event' | 'unknown-css-variable' | 'host-box-style'
  message: string
}

export interface ValidationResult {
  findings: Finding[]
  /** Every known `c2-*` tag the source uses, with the module that registers it. */
  elements: { tag: string; modulePath: string }[]
}

const CSS_FILE = /\.(css|scss|sass|less)$/i
/** MDX is JSX with Markdown around it: a prop is a property and `onClick` is React's. */
const JSX_FILE = /\.(jsx|tsx|mdx)$/i
const HTML_FILE = /\.html?$/i
const SCRIPT_FILE = /\.(jsx|tsx|[cm]?[jt]s)$/i
/** Markup with script inside: `<script>` blocks, Astro frontmatter and `{/* *\/}` expression comments. */
const MIXED_FILE = /\.(mdx|vue|svelte|astro)$/i

/** Native element → replacement tags, the first one that exists in the registry wins. `input` goes by `type`. */
const NATIVE: Record<string, string[]> = {
  button: ['c2-button', 'c2-icon-button'],
  textarea: ['c2-textarea'],
  select: ['c2-select', 'c2-autocomplete'],
  dialog: ['c2-modal', 'c2-sheet'],
  details: ['c2-details', 'c2-accordion'],
  progress: ['c2-progress'],
}
const INPUT: Record<string, string[]> = {
  checkbox: ['c2-checkbox', 'c2-switch'],
  radio: ['c2-radio'],
  range: ['c2-slider'],
  number: ['c2-number-input'],
  date: ['c2-date-input'],
  time: ['c2-time-input'],
  color: ['c2-color-select'],
  file: ['c2-upload'],
  submit: ['c2-button'],
  reset: ['c2-button'],
  button: ['c2-button'],
}
const TEXT_INPUT = ['c2-text-field']
const SKIPPED_INPUT = new Set(['hidden', 'image'])

const GLOBAL_ATTRIBUTES = new Set(
  'id class style slot part exportparts title lang dir hidden inert tabindex role is nonce autofocus draggable contenteditable spellcheck translate accesskey autocapitalize enterkeyhint inputmode popover popovertarget popovertargetaction key ref classname htmlfor suppresshydrationwarning dangerouslysetinnerhtml defer-hydration'.split(
    ' ',
  ),
)
const DOM_EVENTS = new Set(
  'click dblclick auxclick contextmenu input change submit reset invalid focus blur focusin focusout keydown keyup keypress pointerdown pointerup pointermove pointerenter pointerleave pointerover pointerout pointercancel mousedown mouseup mousemove mouseenter mouseleave mouseover mouseout wheel touchstart touchend touchmove touchcancel dragstart drag dragend dragenter dragleave dragover drop scroll scrollend copy cut paste select toggle beforetoggle load error animationstart animationend animationiteration transitionstart transitionend transitionrun transitioncancel beforeinput compositionstart compositionupdate compositionend gotpointercapture lostpointercapture selectstart selectionchange cancel close resize slotchange formdata animationcancel'.split(
    ' ',
  ),
)
/** React's own `on*` props, lowercased: DOM events minus those React has no prop for, with `onDoubleClick` for `dblclick`. */
const REACT_EVENTS = new Set([...DOM_EVENTS].filter((e) => !['dblclick', 'selectionchange', 'slotchange', 'formdata'].includes(e)).concat('doubleclick'))
/**
 * Rules on a `c2-*` host that draw a second box around the component's own: restyle through its variables. A radius
 * alone draws nothing (it rounds a host shadow), so it is not one of them.
 */
const BOX_PROPERTY = /^(border(?![a-z-]*radius)(-[a-z-]+)?|padding(-[a-z-]+)?|background(-[a-z-]+)?|box-shadow|outline)$/
// `|` is a Svelte event modifier (`on:click|once`).
const ATTRIBUTE_NAME = /^(?:[@.?:#*]|\[\(?|\()?[A-Za-z_][\w.:|-]*(?:\)?\]|\))?$/
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '))

interface Tag {
  name: string
  index: number
  end: number
  selfClosing: boolean
  attributes: { name: string; value?: string; index: number }[]
}

export function validateMarkup(registry: Registry, source: string, filename = 'snippet.html'): ValidationResult {
  const findings: Finding[] = []
  const lines = lineStarts(source)
  const isCss = CSS_FILE.test(filename)
  const jsx = JSX_FILE.test(filename)
  // Comments render nothing: blank them out, keeping offsets, so only code and markup are checked.
  const masked = maskComments(source, isCss ? 'css' : MIXED_FILE.test(filename) ? 'mixed' : SCRIPT_FILE.test(filename) ? 'script' : 'markup')
  const ignored = ignoredLines(source, masked, lines)
  const at = (index: number) => position(lines, index)
  const report = (index: number, severity: Severity, rule: Finding['rule'], message: string) => {
    const { line, column } = at(index)
    if (!ignored.has(line)) findings.push({ line, column, severity, rule, message })
  }
  const known = knownVariables(registry)
  const used = new Map<string, string>()
  source = masked

  if (!isCss) {
    const stack: string[] = []
    for (const tag of scanTags(source, HTML_FILE.test(filename))) {
      if (tag.name.startsWith('/')) {
        const name = tag.name.slice(1)
        const open = stack.lastIndexOf(name)
        if (open >= 0) stack.length = open
        continue
      }
      const parent = stack.at(-1)
      if (tag.name.startsWith('c2-')) checkElement(registry, tag, parent, jsx, report, used)
      else {
        checkNative(registry, tag, report)
        const slot = tag.attributes.find((a) => a.name.toLowerCase() === 'slot')
        if (slot && parent?.startsWith('c2-')) checkSlot(registry, parent, slot, report)
      }
      const style = tag.attributes.find((a) => a.name.toLowerCase() === 'style')
      if (style?.value && tag.name.startsWith('c2-')) checkDeclarations(style.value, style.index, `<${tag.name}>`, report)
      if (!tag.selfClosing && !VOID.has(tag.name)) stack.push(tag.name)
    }
  }

  for (const block of cssBlocks(source, isCss)) checkCss(block.css, block.offset, report)

  for (const match of source.matchAll(/--c2-[a-z0-9_-]*[a-z0-9]/g)) {
    // A name built in a template (`--c2-button__${part}--color`) is not checkable.
    if (known.has(match[0]) || /^[_-]*(\$\{|\{)/.test(source.slice(match.index + match[0].length, match.index + match[0].length + 4))) continue
    const declared = /^\s*:/.test(source.slice(match.index + match[0].length, match.index + match[0].length + 8))
    const read = /var\(\s*$/.test(source.slice(Math.max(0, match.index - 8), match.index))
    // A family named in prose (`--c2-chart__series-1…`, `--c2-details*`) is a prefix of real names; in code it is a typo.
    if (!declared && !read && prefixes(known).has(match[0])) continue
    const hint = suggest([...known], match[0], 2)
    // Setting an unknown variable does nothing; reading one may be a value the component publishes at runtime.
    report(
      match.index,
      declared ? 'error' : 'warning',
      'unknown-css-variable',
      `Unknown CSS variable \`${match[0]}\`.${didYouMean(hint)} Use get_component for the element's variables.`,
    )
  }

  const deduped = findings.filter(
    (f, i) => findings.findIndex((g) => g.line === f.line && g.column === f.column && g.rule === f.rule && g.message === f.message) === i,
  )
  return {
    findings: deduped.sort((a, b) => a.line - b.line || a.column - b.column),
    elements: [...used].map(([tag, modulePath]) => ({ tag, modulePath })),
  }
}

type Report = (index: number, severity: Severity, rule: Finding['rule'], message: string) => void

function checkElement(registry: Registry, tag: Tag, parent: string | undefined, jsx: boolean, report: Report, used: Map<string, string>) {
  const resolved = resolveElement(registry, tag.name)
  if (!resolved || (resolved.tag !== tag.name && !resolved.element.tag.includes('{name}'))) {
    const hint = suggest(Object.keys(registry.tagIndex), tag.name, 3)
    report(tag.index, 'error', 'unknown-element', `Unknown element \`<${tag.name}>\`.${didYouMean(hint)} Use search_components to find the component.`)
    return
  }
  used.set(resolved.tag, resolved.modulePath)
  const element = resolved.element
  for (const attribute of tag.attributes) checkAttribute(element, resolved.tag, attribute, jsx, report)
  const slot = tag.attributes.find((a) => a.name.toLowerCase() === 'slot')
  if (slot && parent?.startsWith('c2-')) checkSlot(registry, parent, slot, report)
}

function checkAttribute(element: ElementEntry, tag: string, attribute: Tag['attributes'][number], jsx: boolean, report: Report) {
  const binding = readBinding(attribute.name, jsx)
  if (!binding) return
  const events = element.events.map((e) => e.name)
  const list = events.length ? ` Its events: ${events.map((e) => `\`${e}\``).join(', ')}.` : ''
  if (binding.kind === 'event') {
    if (!events.includes(binding.name) && !DOM_EVENTS.has(binding.name) && !/^ng[A-Z]/.test(binding.name)) {
      report(attribute.index, 'warning', 'unknown-event', `\`<${tag}>\` fires no \`${binding.name}\` event.${list}`)
    }
    return
  }
  if (binding.kind === 'react-event') {
    // React 19 listens for the event named after `on` exactly as written; its own props (`onClick`) map to DOM events.
    if (events.includes(binding.name) || REACT_EVENTS.has(binding.name.toLowerCase())) return
    const kebab = binding.name.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
    report(
      attribute.index,
      'warning',
      'unknown-event',
      events.includes(kebab)
        ? `\`${attribute.name}\` listens for an event named \`${binding.name}\`; \`<${tag}>\` fires \`${kebab}\`: write \`on${kebab}\` or add the listener through a ref.`
        : `\`<${tag}>\` fires no \`${binding.name}\` event.${list}`,
    )
    return
  }
  if (binding.kind === 'handler') {
    // Inline `on…` attributes exist for built-in events only; a custom event needs addEventListener.
    if (DOM_EVENTS.has(binding.name)) return
    report(
      attribute.index,
      'warning',
      'unknown-event',
      events.includes(binding.name)
        ? `\`${attribute.name}\` does nothing: inline handlers exist only for built-in events. Listen for \`${binding.name}\` with addEventListener.`
        : `\`${attribute.name}\` is not an event handler: \`<${tag}>\` fires no \`${binding.name}\` event.${list}`,
    )
    return
  }
  const name = binding.name
  const lower = name.toLowerCase()
  const attributes = element.attributes.map((a) => a.name)
  if (attributes.includes(name)) return
  // The HTML parser lowercases a static attribute name, so `PLACEHOLDER` is `placeholder` (and `readOnly` is `readonly`).
  if (binding.kind === 'attribute' && attributes.includes(lower)) return
  if (binding.kind === 'property' && element.properties?.includes(name)) return
  // ARIA and data attributes, and Angular directives (`ngModel`, `formControlName`).
  if (GLOBAL_ATTRIBUTES.has(lower) || /^(aria|data-)/.test(lower) || /^(ng[A-Z]|formControl|formGroup)/.test(name)) return
  const flat = (value: string) => value.toLowerCase().replaceAll('-', '')
  const loose = attributes.find((a) => flat(a) === flat(name))
  // A property binding (and a JSX prop, which React 19 assigns as a property) may use the camelCase spelling.
  if (loose && binding.kind === 'property') return
  if (loose) {
    report(attribute.index, 'error', 'unknown-attribute', `\`<${tag}>\` observes the attribute \`${loose}\`, not \`${name}\`: a static \`${name}\` is ignored.`)
    return
  }
  const hint = suggest(attributes, name, 2)
  report(
    attribute.index,
    'error',
    'unknown-attribute',
    `Unknown attribute \`${name}\` on \`<${tag}>\`.${didYouMean(hint)}${attributes.length && !hint.length ? ` Attributes: ${attributes.map((a) => `\`${a}\``).join(', ')}.` : ''}`,
  )
}

/** Reads the framework binding syntaxes down to the attribute, property or event they name. */
function readBinding(raw: string, jsx: boolean): { kind: 'attribute' | 'property' | 'event' | 'react-event' | 'handler'; name: string } | undefined {
  if (raw.startsWith('@')) return { kind: 'event', name: raw.slice(1).split('.')[0] }
  if (raw.startsWith('v-on:')) return { kind: 'event', name: raw.slice(5).split('.')[0] }
  if (raw.startsWith('on:')) return { kind: 'event', name: raw.slice(3).split('|')[0] }
  if (/^\([^)]+\)$/.test(raw)) {
    // `(keydown.enter)` filters a key; `(window:resize)` listens on another target, not the element.
    const name = raw.slice(1, -1)
    return name.includes(':') ? undefined : { kind: 'event', name: name.split('.')[0] }
  }
  if (raw.startsWith('[attr.')) return { kind: 'attribute', name: raw.slice(6, -1) }
  // `[class.active]` and `[style.color]` set a class or a style, not a property of the element.
  if (/^\[(class|style)\./.test(raw)) return undefined
  if (/^\[[^\]]+\]$/.test(raw)) return raw.startsWith('[(') ? undefined : { kind: 'property', name: raw.slice(1, -1) }
  if (raw.startsWith('.')) return { kind: 'property', name: raw.slice(1).split('.')[0] }
  if (raw.startsWith('?')) return { kind: 'attribute', name: raw.slice(1) }
  if (raw.startsWith(':') || raw.startsWith('v-bind:')) {
    const [name, modifier] = raw.slice(raw.indexOf(':') + 1).split('.')
    return { kind: modifier === 'attr' ? 'attribute' : 'property', name }
  }
  if (raw.startsWith('bind:')) return raw === 'bind:this' ? undefined : { kind: 'property', name: raw.slice(5) }
  // Other prefixed names are directives (`v-model`, `client:load`, `#header`, `*ngIf`, `let-x`, spreads).
  if (/^(v-|#|\*|let-|\{|\.\.\.)/.test(raw) || raw.includes(':')) return undefined
  if (jsx && /^on[A-Za-z]/.test(raw)) return { kind: 'react-event', name: raw.slice(2) }
  if (!jsx && /^on[a-z]/i.test(raw)) return { kind: 'handler', name: raw.slice(2).toLowerCase() }
  return { kind: jsx ? 'property' : 'attribute', name: raw }
}

function checkSlot(registry: Registry, parent: string, slot: Tag['attributes'][number], report: Report) {
  const resolved = resolveElement(registry, parent)
  if (!resolved || !slot.value || /[{}$]/.test(slot.value)) return
  const slots = resolved.element.slots.map((s) => s.name).filter((s) => s && s !== 'default')
  // Templated slot names (`cell:{line}:{field}`) match any value in their placeholders.
  const pattern = (name: string) => new RegExp(`^${name.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^:]+')}$`)
  if (slots.some((name) => pattern(name).test(slot.value ?? ''))) return
  const hint = suggest(slots, slot.value, 2)
  const list = slots.length ? ` Named slots: ${slots.map((s) => `\`${s}\``).join(', ')}.` : ' It has no named slots.'
  report(slot.index, 'error', 'unknown-slot', `\`<${resolved.tag}>\` has no slot \`${slot.value}\`.${hint.length ? didYouMean(hint) : list}`)
}

/** `type` and `slot` are matched case-insensitively, as an HTML document reads `TYPE` and `SLOT`. */
function checkNative(registry: Registry, tag: Tag, report: Report) {
  let candidates = NATIVE[tag.name]
  if (tag.name === 'input') {
    // A bound type (`:type`, `[type]`, `type={t}`, `type=${t}`) is only known at runtime.
    if (tag.attributes.some((a) => a.name.toLowerCase() !== 'type' && readBinding(a.name, false)?.name === 'type')) return
    const type = tag.attributes.find((a) => a.name.toLowerCase() === 'type')?.value?.toLowerCase() ?? 'text'
    if (SKIPPED_INPUT.has(type) || /[{}$]/.test(type)) return
    candidates = INPUT[type] ?? TEXT_INPUT
  }
  const replacement = candidates?.filter((c) => registry.tagIndex[c])
  if (!replacement?.length) return
  report(
    tag.index,
    'warning',
    'native-element',
    `Native \`<${tag.name}>\`: use ${replacement.map((r) => `\`<${r}>\``).join(' or ')} (get_component for its API). Mark a deliberate native element with a \`c2n-ignore\` comment.`,
  )
}

function checkCss(css: string, offset: number, report: Report) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
  for (const rule of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const host = rule[1]
      .split(',')
      .map((s) => s.trim())
      .map((s) => s.split(/[\s>+~]+/).at(-1) ?? '')
      .find((compound) => /^c2-[a-z0-9-]+(?![a-z0-9-]*::part)/.test(compound) && !compound.includes('::'))
    if (host) checkDeclarations(rule[2], offset + rule.index + rule[1].length + 1, host.match(/^c2-[a-z0-9-]+/)?.[0] ?? host, report)
  }
}

function checkDeclarations(declarations: string, offset: number, host: string, report: Report) {
  declarations = declarations.replace(/\/\*[\s\S]*?\*\//g, (comment) => ' '.repeat(comment.length))
  // CSS text (`padding: 4px; …`) or a JSX style object (`{{ padding: 4, borderTop: '…' }}`).
  for (const declaration of declarations.matchAll(/(^|[;{,])\s*['"]?([a-zA-Z-]+)['"]?\s*:/g)) {
    const property = declaration[2].replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
    if (!BOX_PROPERTY.test(property)) continue
    report(
      offset + declaration.index + declaration[0].indexOf(declaration[2]),
      'warning',
      'host-box-style',
      `\`${declaration[2]}\` on the \`${host.replace(/[<>]/g, '')}\` host draws a second box around the component's own: set its \`--c2-…\` variables instead (get_component lists them).`,
    )
  }
}

/**
 * Blanks comments with spaces (newlines kept, so positions hold): `<!-- -->` in markup, `/* *\/` in CSS, and `//` and
 * `/* *\/` in scripts outside strings and template literals, whose text may be rendered markup. Markup's `<script>`
 * blocks are script; so are Astro frontmatter and `{/* *\/}` expressions in a mixed file (Vue, Svelte, Astro, MDX). In
 * every kind, the comments of embedded stylesheets (`<style>`, Lit `css\``) are blanked too.
 */
function maskComments(source: string, kind: 'css' | 'script' | 'markup' | 'mixed'): string {
  const out = source.split('')
  const blank = (from: number, to: number) => {
    for (let i = from; i < to && i < out.length; i++) if (out[i] !== '\n') out[i] = ' '
  }
  const blockComments = (open: string, close: string, from = 0, to = source.length) => {
    for (let i = source.indexOf(open, from); i >= 0 && i < to; i = source.indexOf(open, i + 1)) {
      const end = source.indexOf(close, i + open.length)
      const stop = end < 0 || end + close.length > to ? to : end + close.length
      blank(i, stop)
      i = stop - 1
    }
  }
  const scriptComments = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      const c = source[i]
      if (c === '"' || c === "'") {
        while (++i < to && source[i] !== c && source[i] !== '\n') if (source[i] === '\\') i++
      } else if (c === '`') i = skipTemplate(source, i)
      else if (c === '/' && source[i + 1] === '/') {
        const end = source.indexOf('\n', i)
        const stop = end < 0 || end > to ? to : end
        blank(i, stop)
        i = stop
      } else if (c === '/' && source[i + 1] === '*') {
        const end = source.indexOf('*/', i + 2)
        const stop = end < 0 || end + 2 > to ? to : end + 2
        blank(i, stop)
        i = stop - 1
      }
    }
  }
  if (kind === 'css') blockComments('/*', '*/')
  else if (kind === 'script') scriptComments(0, source.length)
  else {
    blockComments('<!--', '-->')
    for (const m of source.matchAll(/(<script\b[^>]*>)([\s\S]*?)<\/script>/g)) scriptComments(m.index + m[1].length, m.index + m[1].length + m[2].length)
    if (kind === 'mixed') {
      const frontmatter = /^---\r?\n[\s\S]*?\n---/.exec(source)
      if (frontmatter) scriptComments(3, frontmatter[0].length - 3)
      for (const m of source.matchAll(/\{\s*(\/\*[\s\S]*?\*\/)\s*\}/g)) blank(m.index + m[0].indexOf('/*'), m.index + m[0].indexOf('/*') + m[1].length)
    }
  }
  // `/* */` inside a `<style>` block or a Lit `css` template is CSS, whichever kind of file holds it.
  if (kind !== 'css') for (const block of cssBlocks(source, false)) blockComments('/*', '*/', block.offset, block.offset + block.css.length)
  return out.join('')
}

/** The stylesheet sources of a file: the whole file for CSS, else `<style>` blocks and Lit `css\`` templates. */
function cssBlocks(source: string, isCss: boolean): { css: string; offset: number }[] {
  if (isCss) return [{ css: source, offset: 0 }]
  const blocks: { css: string; offset: number }[] = []
  for (const m of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) blocks.push({ css: m[1], offset: m.index + m[0].indexOf('>') + 1 })
  for (const m of source.matchAll(/\bcss`([\s\S]*?)`/g)) blocks.push({ css: m[1], offset: m.index + 4 })
  return blocks
}

/** Opening and closing tags, skipping comments, `<style>`/`<script>` bodies and `{…}` attribute values. */
/** `caseless`: an HTML document, where `<BUTTON>` is `<button>`; elsewhere a capitalised tag is a framework component. */
function* scanTags(source: string, caseless = false): Generator<Tag> {
  let i = 0
  while (i < source.length) {
    const lt = source.indexOf('<', i)
    if (lt < 0) return
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4)
      i = end < 0 ? source.length : end + 3
      continue
    }
    const name = (caseless ? /^<(\/?[a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?=[\s/>])/i : /^<(\/?[a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?=[\s/>])/).exec(
      source.slice(lt, lt + 80),
    )
    if (!name) {
      i = lt + 1
      continue
    }
    const tag: Tag = { name: name[1].toLowerCase(), index: lt, end: lt, selfClosing: false, attributes: [] }
    let j = lt + name[0].length
    while (j < source.length) {
      while (/\s/.test(source[j] ?? '')) j++
      const c = source[j]
      if (c === undefined) break
      if (c === '>') {
        j++
        break
      }
      if (c === '/' && source[j + 1] === '>') {
        tag.selfClosing = true
        j += 2
        break
      }
      if (c === '{') {
        j = skipBalanced(source, j, '{', '}')
        continue
      }
      // A slash ends a name: `<c2-button disabled/>` is self-closing, not an attribute `disabled/`.
      const attr = /^(?:[:@#]|v-bind:|v-on:)?\[[^\]]*\][^\s=>"'{}/]*|^[^\s=>"'{}/]+/.exec(source.slice(j, j + 120))
      if (!attr || (attr[0] === '/' && source[j + 1] !== '>')) {
        j++
        continue
      }
      const entry: Tag['attributes'][number] = { name: attr[0], index: j }
      j += attr[0].length
      let k = j
      while (/\s/.test(source[k] ?? '')) k++
      if (source[k] === '=') {
        k++
        while (/\s/.test(source[k] ?? '')) k++
        const quote = source[k]
        if (quote === '"' || quote === "'") {
          const end = closingQuote(source, k)
          entry.value = source.slice(k + 1, end)
          if (entry.name.toLowerCase() === 'style') entry.index = k + 1
          j = end + 1
        } else if (quote === '{') {
          const end = skipBalanced(source, k, '{', '}')
          entry.value = source.slice(k, end)
          if (entry.name.toLowerCase() === 'style') entry.index = k
          j = end
        } else if (source.startsWith('${', k)) {
          const end = skipBalanced(source, k + 1, '{', '}')
          entry.value = source.slice(k, end)
          j = end
        } else {
          const unquoted = /^[^\s>]+/.exec(source.slice(k, k + 200))
          entry.value = unquoted?.[0] ?? ''
          j = k + entry.value.length
        }
      }
      // A runtime name (Vue `:[key]`, `@[event]`) or expression text is not checkable, but its value was consumed.
      if (ATTRIBUTE_NAME.test(entry.name)) tag.attributes.push(entry)
    }
    tag.end = j
    yield tag
    i = j
    if (tag.name === 'script' || tag.name === 'style') {
      const close = source.indexOf(`</${tag.name}`, j)
      i = close < 0 ? source.length : close
    }
  }
}

/** End of a quoted attribute value; a Lit `${…}` inside it may hold the same quote. */
function closingQuote(source: string, start: number): number {
  const quote = source[start]
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === quote) return i
    if (source[i] === '$' && source[i + 1] === '{') i = skipBalanced(source, i + 1, '{', '}') - 1
  }
  return source.length
}

/** Index after the bracket closing the one at `start`, skipping strings and nested template literals. */
function skipBalanced(source: string, start: number, open: string, close: string): number {
  let depth = 0
  for (let i = start; i < source.length; i++) {
    const c = source[i]
    if (c === '"' || c === "'") {
      const end = source.indexOf(c, i + 1)
      if (end < 0) return source.length
      i = end
    } else if (c === '`') {
      i = skipTemplate(source, i)
    } else if (c === open) depth++
    else if (c === close && --depth === 0) return i + 1
  }
  return source.length
}

function skipTemplate(source: string, start: number): number {
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') i++
    else if (source[i] === '`') return i
    else if (source[i] === '$' && source[i + 1] === '{') i = skipBalanced(source, i + 1, '{', '}') - 1
  }
  return source.length
}

let variableCache: { registry: Registry; names: Set<string> } | undefined

function knownVariables(registry: Registry): Set<string> {
  if (variableCache?.registry === registry) return variableCache.names
  const names = new Set<string>(registry.theme.tokens.map((t) => t.name))
  for (const component of Object.values(registry.components)) for (const element of component.elements) for (const p of element.cssProperties) names.add(p.name)
  variableCache = { registry, names }
  return names
}

let prefixCache: { names: Set<string>; prefixes: Set<string> } | undefined

/** Every `__`/`--`/`-`-delimited prefix of a known variable (`--c2-chart`, `--c2-chart__series-1`). */
function prefixes(names: Set<string>): Set<string> {
  if (prefixCache?.names === names) return prefixCache.prefixes
  const result = new Set<string>()
  for (const name of names) for (const m of name.slice(2).matchAll(/[-_]+/g)) result.add(name.slice(0, m.index + 2))
  prefixCache = { names, prefixes: result }
  return result
}

function didYouMean(hints: string[]): string {
  return hints.length ? ` Did you mean ${hints.map((h) => `\`${h}\``).join(', ')}?` : ''
}

function lineStarts(source: string): number[] {
  const starts = [0]
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1)
  return starts
}

function position(starts: number[], index: number): { line: number; column: number } {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= index) lo = mid
    else hi = mid - 1
  }
  return { line: lo + 1, column: index - starts[lo] + 1 }
}

function ignoredLines(source: string, masked: string, starts: number[]): Set<number> {
  const ignored = new Set<number>()
  for (const m of source.matchAll(/c2n-ignore/g)) {
    const { line } = position(starts, m.index)
    const lineStart = starts[line - 1]
    // Only the marker inside a comment counts, not the word in a string or in prose: one the masking blanked (which
    // covers the continuation lines of a multi-line comment), or one after a comment opener on its own line.
    const opener = /(<!--|\/\*|\/\/)/.exec(source.slice(lineStart, m.index))
    const inComment = masked.slice(m.index, m.index + 10) !== 'c2n-ignore'
    if (!opener && !inComment) continue
    // The comment around the marker: the nearest opener not closed before it, up to its closer on any later line.
    const comment = [
      { opener: '<!--', closer: '-->' },
      { opener: '/*', closer: '*/' },
      { opener: '//', closer: '\n' },
    ]
      .map(({ opener, closer }) => ({ open: source.lastIndexOf(opener, m.index), closer }))
      .filter(({ open, closer }) => open >= 0 && (closer === '\n' ? open >= lineStart : !source.slice(open, m.index).includes(closer)))
      .sort((x, y) => y.open - x.open)[0]
    const open = comment?.open ?? m.index
    const found = comment ? source.indexOf(comment.closer, m.index) : -1
    const close = found < 0 ? (comment?.closer === '\n' ? source.length : m.index) : comment?.closer === '\n' ? found : found + (comment?.closer.length ?? 0)
    const first = position(starts, open).line
    const last = position(starts, close).line
    for (let l = Math.min(first, line); l <= Math.max(last, line); l++) ignored.add(l)
    // A comment on lines of its own covers the next line; one after (or before) an element covers only its own lines.
    const around = (source.slice(starts[first - 1], Math.max(open, starts[first - 1])) + source.slice(close, starts[last] ?? source.length)).replace(
      /\{\s*\}/g,
      '',
    )
    if (!/<(?!!--)[a-zA-Z]/.test(around)) ignored.add(last + 1)
  }
  return ignored
}

/** One line per finding, `file:line:column severity rule message`, as compilers print them. */
export function formatFindings(file: string, findings: Finding[]): string {
  return findings.map((f) => `${file}:${f.line}:${f.column} ${f.severity} ${f.rule} ${f.message}`).join('\n')
}
