#!/usr/bin/env node
// Legacy-pattern scan for c2n components: flags the old web patterns the 2026-11 platform audit found, so new code
// does not bring them back. Each rule names the modern replacement and the modern-web-guidance guide to read.
//
//   node .claude/skills/modern-web-review/scripts/scan.mjs                      # files changed vs origin/develop (+ uncommitted)
//   node .claude/skills/modern-web-review/scripts/scan.mjs --all                # every component and core
//   node .claude/skills/modern-web-review/scripts/scan.mjs packages/components/tabs [more paths…]
//   node .claude/skills/modern-web-review/scripts/scan.mjs --base=<ref> --json
//
// Exit 1 when an `error` finding is reported; `warn` findings are for review and do not fail.
// Silence one finding with a comment on the same or the previous line:
//   // modern-web-ignore: <rule-id> <reason>        (in SCSS: // or /* */ works too)

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
const base = flag('base')?.split('=')[1] ?? 'origin/develop'
const asJson = Boolean(flag('json'))
const paths = args.filter((a) => !a.startsWith('--'))

const SOURCE_ROOTS = ['packages/components', 'packages/core/src']
const isSource = (file) =>
  /\.(ts|scss)$/.test(file) &&
  SOURCE_ROOTS.some((r) => file.startsWith(r)) &&
  !/\/(test|dist|types|node_modules)\//.test(file) &&
  !/\.(spec|test|d)\.ts$/.test(file) &&
  !file.includes('/design-board/')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'types', 'test'].includes(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(relative(root, full))
  }
  return out
}

function changedFiles() {
  const run = (...a) => {
    try {
      return execFileSync('git', a, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
    } catch {
      return []
    }
  }
  const mergeBase = run('merge-base', base, 'HEAD')[0]
  return [
    ...new Set([
      ...(mergeBase ? run('diff', '--name-only', '--diff-filter=ACMR', mergeBase) : []),
      ...run('diff', '--name-only', '--diff-filter=ACMR'),
      ...run('ls-files', '--others', '--exclude-standard'),
    ]),
  ]
}

// In the default (changed-files) mode only lines this branch added or changed are reported, so touching a file does
// not surface its old code. `null` means "every line" (untracked files, --all, explicit paths).
function changedLines(file) {
  if (flag('all') || paths.length) return null
  let diff
  try {
    const mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    diff = execFileSync('git', ['diff', '-U0', mergeBase, '--', file], { cwd: root, encoding: 'utf8' })
  } catch {
    return null
  }
  if (!diff) return null // untracked or new: all lines are new
  const set = new Set()
  for (const [, start, count] of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
    const n = count === undefined ? 1 : Number(count)
    for (let k = 0; k < n; k++) set.add(Number(start) + k)
  }
  return set
}

let files
if (flag('all')) files = SOURCE_ROOTS.filter((r) => existsSync(join(root, r))).flatMap((r) => walk(join(root, r)))
else if (paths.length)
  files = paths.flatMap((p) => {
    const full = join(root, p)
    return statSync(full).isDirectory() ? walk(full) : [relative(root, full)]
  })
else files = changedFiles()
files = files.filter(isSource).filter((f) => existsSync(join(root, f)))

// --- rules -------------------------------------------------------------------------------------------------------
// `line` rules test one line; `file` rules see the whole text and return the 0-based line indexes to report.
const rules = [
  {
    id: 'html-string-sink',
    level: 'error',
    ext: 'ts',
    line: /\.(innerHTML|outerHTML)\s*[+]?=|insertAdjacentHTML\s*\(|document\.write\s*\(/,
    message: 'HTML string sink: throws under Trusted Types and is an XSS risk. Render with Lit (`render(html`…`, el)`) or clone a <template>.',
    guide: 'trusted-types, sanitize-untrusted-html',
  },
  {
    id: 'host-style-write',
    level: 'error',
    ext: 'ts',
    line: /\bthis\.style\.(setProperty\s*\(|removeProperty\s*\(|[a-zA-Z]+\s*=(?!=))/,
    message: 'Writes inline style on the host (SSR hydration mismatch, overrides author styles). Style an element inside the shadow root.',
    guide: 'prerendering-custom-elements, packages/components/CLAUDE.md "Never write an attribute on the host"',
  },
  {
    id: 'host-attribute-write',
    level: 'error',
    ext: 'ts',
    line: /\bthis\.(setAttribute|toggleAttribute|removeAttribute)\(\s*['"`](?!tabindex|popover)/,
    message: 'Writes an attribute on the host. Use ElementInternals (role, aria*, states with :state()) or a shadow element; reflect through a @property.',
    guide: 'accessible-web-components, custom-elements',
  },
  {
    id: 'aria-attribute-on-other-element',
    level: 'warn',
    ext: 'ts',
    // Receivers that usually hold an author's light-DOM child or a target outside the shadow root.
    line: /\b(panel|panels?\[[^\]]*\]|slide|child|crumb|target|anchor|heading|trigger|item|tab|element|el|node|next)\.setAttribute\(\s*['"`](role|aria-[a-z]+|id)['"`]/,
    message:
      'Writes role/aria-*/id on an element that is likely an author light-DOM child or outside the shadow root: an SSR hydration mismatch, and id refs break across shadow roots. Prefer a shadow wrapper or ariaLabelledByElements/ariaDescribedByElements/ariaControlsElements.',
    guide: 'accessible-web-components',
  },
  {
    id: 'ime-enter',
    level: 'warn',
    ext: 'ts',
    file: (text) => {
      if (!/<input|<textarea|contenteditable/.test(text) || /isComposingKey|\.isComposing\b.*keyCode\s*===\s*229/.test(text)) return []
      return lines(text).flatMap((l, i) => (/(key\s*===?\s*['"]Enter['"]|case\s+['"]Enter['"])/.test(l) ? [i] : []))
    },
    message:
      "Enter handler in a file with a text field and no full IME guard. If this handler can run while typing in that field, confirming a CJK candidate submits: use `isComposingKey(event)` from '@c2n/core/dom-helper.js' (isComposing alone misses Safari).",
    guide: 'ime-safe-enter-submit',
  },
  {
    id: 'form-disabled-own-attribute',
    level: 'error',
    ext: 'ts',
    line: /disabledByForm\s*=\s*disabled\s*&&\s*!this\.hasAttribute\(['"]disabled['"]\)\s*$/,
    message:
      'Drops the fieldset state whenever the own `disabled` attribute is present: removing it inside a disabled <fieldset> re-enables the control. Also keep the fieldset check (see text-field formDisabledCallback).',
    guide: 'form-associated-custom-elements',
  },
  {
    id: 'lit-decorator-import',
    level: 'error',
    ext: 'ts',
    line: /import\s*\{[^}]*\b(customElement|property)\b[^}]*\}\s*from\s*['"]lit\/decorators\.js['"]/,
    message: "Import customElement from '@c2n/core/element-helper.js' and property from '@c2n/core/lit-helper.js' (repo convention).",
    guide: 'packages/components/CLAUDE.md "Component conventions"',
  },
  {
    id: 'document-pointer-drag',
    level: 'warn',
    ext: 'ts',
    line: /(document|window)\.addEventListener\(\s*['"](pointermove|mousemove|touchmove)['"]/,
    message: 'Drag tracked on document/window. Call setPointerCapture on pointerdown and listen on the element (plus touch-action).',
    guide: 'drag, swipe-to-reveal',
  },
  {
    id: 'scroll-listener-visual',
    level: 'warn',
    ext: 'ts',
    line: /addEventListener\(\s*['"]scroll['"]/,
    message:
      'Scroll listener: if it only drives a visual (progress, shadows, stuck state, reveal), use scroll-driven animations / scroll-state queries with this JS as the @supports fallback; for visibility use IntersectionObserver.',
    guide: 'scroll-progress-indicator, scrollability-affordance-hints, state-aware-sticky-headers',
  },
  {
    id: 'js-autosize',
    level: 'warn',
    ext: 'ts',
    file: (text) =>
      /scrollHeight/.test(text) && /style\.height\s*=/.test(text) && !/field-sizing/.test(text)
        ? lines(text).flatMap((l, i) => (/style\.height\s*=/.test(l) ? [i] : []))
        : [],
    message: 'Autosizes a field in JS. Use `field-sizing: content` with min/max block size; keep the JS only when CSS.supports fails.',
    guide: 'form-fields-automatically-fit-contents',
  },
  {
    id: 'locale-compare-in-sort',
    level: 'warn',
    ext: 'ts',
    line: /\.localeCompare\([^)]*,\s*[^)]*\{/,
    message: 'localeCompare with options builds a collator per call. Create one Intl.Collator and reuse `.compare`.',
    guide: 'sortable-table',
  },
  {
    id: 'slotted-complex-selector',
    level: 'error',
    ext: 'scss',
    file: (text) =>
      lines(text).flatMap((l, i) =>
        [...l.matchAll(/::slotted\(((?:[^()]|\([^()]*\))*)\)/g)].some(([, inner]) => /[+>~]|\S\s+\S/.test(inner.replace(/\([^()]*\)/g, '()').trim()))
          ? [i]
          : [],
      ),
    message: '::slotted() accepts a compound selector only; this rule is dropped entirely. Use :not(:first-child), a gap on the wrapper, etc.',
    guide: 'shadow-dom, styling-web-components',
  },
  {
    id: 'allow-discrete-in-shorthand',
    level: 'warn',
    ext: 'scss',
    line: /transition\s*:[^;]*allow-discrete/,
    message:
      'allow-discrete inside the `transition` shorthand: engines that do not parse it drop the whole declaration. Use a separate `transition-behavior: allow-discrete`.',
    guide: 'animate-to-from-top-layer, animate-element-entry-exit',
  },
  {
    id: 'closed-content-display-none',
    level: 'warn',
    ext: 'scss',
    file: (text) =>
      lines(text).flatMap((l, i, all) =>
        /:not\(\[(open|expanded)\]\)|[-_.]collapsed\b|:not\(\.(open|expanded)\)/.test(l) && /display:\s*none/.test(all.slice(i, i + 3).join(' ')) ? [i] : [],
      ),
    message:
      'Collapsed content hidden with display:none is invisible to find-in-page. Use <details>/::details-content or hidden="until-found" (content-visibility: hidden) so Ctrl+F can reveal it.',
    guide: 'search-hidden-content, accordion',
  },
  {
    id: 'focus-without-forced-colors',
    level: 'warn',
    ext: 'scss',
    file: (text) => {
      if (/forced-colors/.test(text)) return []
      return lines(text).flatMap((l, i) => (/focus[^:]*--outline:\s*none|:focus(-visible|-within)?[^{]*\{[^}]*outline:\s*(none|0)\b/.test(l) ? [i] : []))
    },
    message:
      "Focus without an outline and no forced-colors handling: in Windows High Contrast the border/background/box-shadow focus disappears. `@use '@c2n/sass/focus';` and `@include focus.forced-colors-ring;` on the focused element.",
    guide: 'color (Forced Colors Mode), accessibility',
  },
  {
    id: 'bare-focus-style',
    level: 'warn',
    ext: 'scss',
    line: /:focus(?![-\w])[^{,]*\{?\s*$/,
    message: 'Bare :focus drives a visible style on pointer focus too. Use :focus-visible (or :focus-within on a container).',
    guide: 'accessibility, natural-interactions',
  },
  {
    id: 'empty-text-child-part',
    level: 'warn',
    ext: 'ts',
    // A text binding whose fallback chain can still render an empty value: a `||` chain ending in `''` or a plain field
    // (`${this.label || this.value}`), a `(a ?? b) || c` chain ending the same way, or a `??` chain (no call in it)
    // ending in a field or a string literal — `??` passes `''` through. Only a binding in text position counts: after
    // `>`, `}`, a space, `(`, `#`, `/`, `:` or `html`/`svg`'s backtick, and not inside an open attribute quote. Known
    // gaps: a bare `${this.value}` and `${a ?? nothing}` are not flagged; a plain template string with a `??` is.
    line: (() => {
      const tick = '`'
      const body = String.raw`[^{}${tick}]`
      const field = String.raw`(?!nothing\b)[A-Za-z_$][\w$.?]*`
      const empty = String.raw`(?:''|""|${field})`
      const start = String.raw`(?<=^|[>}\s(#/:]|(?:html|svg)${tick})(?<!=["'][^"'>]*)\$\{`
      return new RegExp(
        start +
          '(?:' +
          // a `||` chain with no `??`
          String.raw`(?!${body}*\?\?)${body}*\|\|\s*${empty}\s*\}` +
          '|' +
          // `(a ?? b) || c`
          String.raw`\s*\([^(){}${tick}]*\?\?[^(){}${tick}]*\)\s*\|\|\s*${empty}\s*\}` +
          '|' +
          // a `??` chain with no call in it
          String.raw`[^(){}${tick}]*\?\?\s*(?:${empty}|'[^']+'|"[^"]+")\s*\}` +
          ')',
      )
    })(),
    message:
      "A text binding that can render '', undefined or null leaves no text node in a server render. If the element's first render after hydration is the one that fills it, Lit writes the text into the closing marker comment and it never shows. End the chain with `|| nothing` (a `??` chain in parentheses: `${(a ?? b) || nothing}`); for a number, test for null rather than using `||`, which hides 0. Text content only: in an attribute value, `nothing` removes the whole attribute.",
    guide: 'prerendering-custom-elements',
  },
  {
    id: 'empty-slot-fallback',
    level: 'warn',
    ext: 'ts',
    // The gap `empty-text-child-part` leaves: a slot whose whole fallback is one binding that can still be empty —
    // a field (`<slot>${this.label}</slot>`), a local (`${message}`), a ternary (`${cond ? nothing : this.help}`) or
    // `${x ?? nothing}` (which lets `''` through). A binding ending in `|| nothing`, a call (`${this.msg.t('key')}`)
    // and a template (`html\`…\``) are left alone. The slot's attributes may hold `${…}` bindings (an arrow's `=>`).
    line: (() => {
      const attrs = String.raw`(?:[^>$]|\$\{[^}]*\})*`
      // What can be empty: a field or member path (`this.label`, `texts.middle`), a local named for text, either one as
      // a ternary's last branch, or anything ending in `?? nothing`.
      const value = String.raw`(?:this\.[\w$]+(?:\??\.[\w$]+)*|[a-z][\w$]*(?:\??\.[\w$]+)+|(?:message|text|label|hint|help)\b)`
      const expr = String.raw`(?:(?:[^{}${'`'}?]*\?[^{}${'`'}:]*:\s*)?${value}|[^{}${'`'}]*\?\?\s*nothing)`
      return new RegExp(String.raw`<slot\b${attrs}>\s*\$\{\s*${expr}\s*\}\s*<\/slot>`)
    })(),
    message:
      "A slot's fallback text bound to a bare field renders nothing on the server while the field is empty, and a value set as the first render after hydration is written into Lit's closing marker comment. End it with `|| nothing`: `<slot>${this.label || nothing}</slot>`, `${cond ? nothing : this.help || nothing}`. For a number, test for null rather than using `||`, which hides 0.",
    guide: 'prerendering-custom-elements',
  },
  {
    id: 'fixed-overlay-z-index',
    level: 'warn',
    ext: 'scss',
    file: (text) =>
      /position:\s*fixed/.test(text) && /z-index/.test(text) && !/popover|:modal|::backdrop/.test(text)
        ? lines(text).flatMap((l, i) => (/position:\s*fixed/.test(l) ? [i] : []))
        : [],
    message:
      'A fixed + z-index layer sits under any open modal <dialog> and inside the inert document. If it must show above modals (toasts, banners), render it in the top layer (popover="manual" on a shadow element).',
    guide: 'persistent-toast-notifications, persistent-top-layer-ui',
  },
  {
    id: 'literal-interface-text',
    level: 'warn',
    ext: 'ts',
    // English in an html`…`/svg`…` template (text between tags, or a literal aria-label/placeholder/title/alt/label),
    // and an English string literal used as default text (`this.label || 'Close'`, `return 'No results'`). Not
    // messages.ts, which is where the text belongs, nor tests.
    file: (text, file) => {
      if (/(^|\/)messages\.ts$/.test(file)) return []
      const all = lines(text)
      const isComment = (i) => /^\s*(\/\/|\*|\/\*)/.test(all[i] ?? '')
      const hits = templateTextSegments(text)
        .filter((s) => looksLikeEnglish(s.text) && !isComment(s.index))
        .map((s) => s.index)
      // A default-text fallback or return: `|| 'Text'`, `?? 'Text'`, `return 'Two words'`, outside throw/console lines.
      const fallback = /(?:\|\||\?\?|\breturn)\s*(['"])([A-Z][a-z]+(?:[ \u00a0](?:(?!\1).)*)?)\1/
      all.forEach((l, i) => {
        if (isComment(i) || /\b(throw|console\.|new Error|warn\(|import |from ')/.test(l)) return
        const m = fallback.exec(l)
        if (m && (m[2].includes(' ') || /\|\||\?\?/.test(m[0]))) hits.push(i)
        // A public property whose default is English text: `@property() label = 'Close'`. It keeps an empty default
        // (or `undefined`) and falls back to its message at render time.
        else if (
          /@property\(/.test(l + (all[i - 1] ?? '')) &&
          /^\s*(?:@property\([^)]*\)\s*)?(?:override\s+|declare\s+)*\w+(?:\s*:[^=]+)?\s*=\s*(['"])([A-Z][^'"]*)\1\s*$/.test(l)
        ) {
          const value = /=\s*(['"])(.*)\1\s*$/.exec(l)[2]
          if (looksLikeEnglish(value)) hits.push(i)
        }
        // A text attribute bound to a template string with words in it: aria-label=${`Retry ${name}`}.
        else if (/(aria-label|aria-roledescription|title|placeholder|alt|label)=\$\{\s*`(?:[^`$]|\$\{[^}]*\})*?[A-Za-z]{3,}/.test(l)) {
          const literal = /=\$\{\s*`((?:[^`$]|\$\{[^}]*\})*)`/.exec(l)?.[1]?.replace(/\$\{[^}]*\}/g, ' ')
          if (literal && looksLikeEnglish(literal)) hits.push(i)
        }
      })
      return [...new Set(hits)].sort((a, b) => a - b)
    },
    message:
      "English interface text in the template or as a default: a page in another language cannot translate it. Put it in src/messages.ts (`defineMessages('<package>', en)`) and render `this.msg.t('<key>')` through a LocalizeController (docs/agents/component-foundation.md rule 6). Text that is not interface text (a unit symbol, a sample value) takes a modern-web-ignore comment with the reason.",
    guide: 'packages/components/CLAUDE.md "Built-in text is in English, and translatable"',
  },
]

function lines(text) {
  return text.split('\n')
}

// --- literal-interface-text --------------------------------------------------------------------------------------
// The static parts of every html`…`/svg`…` template: the text between tags (minus <style> and <!-- -->) and the
// literal values of the attributes that are read or shown (aria-label, placeholder, title, alt, …). Code inside ${…}
// is skipped, though an html`…` nested in it is visited on its own. Returns { index (0-based line), text }.
const TEXT_ATTRIBUTES = /^([\w-]+-label|aria-label|aria-roledescription|aria-valuetext|aria-placeholder|aria-description|placeholder|title|alt|label)$/

function templateTextSegments(text) {
  const out = []
  const lineAt = (offset) => text.slice(0, offset).split('\n').length - 1
  // A `/` starts a regex literal where an operand is expected: after an operator, an opening bracket, a comma or `${`.
  const startsRegex = (i) => {
    let j = i - 1
    while (j >= 0 && /\s/.test(text[j])) j--
    return j < 0 || /[(,=:[!&|?{};+\-*%<>~^]/.test(text[j])
  }
  // Skips a regex literal from `i` (just after its opening `/`), character classes included; returns the index after it.
  const skipRegex = (i) => {
    let inClass = false
    while (i < text.length && text[i] !== '\n') {
      const c = text[i]
      if (c === '\\') i += 2
      else {
        if (c === '[') inClass = true
        else if (c === ']') inClass = false
        else if (c === '/' && !inClass) return i + 1
        i++
      }
    }
    return i
  }
  // Skips a ${…} expression from `i` (just after `${`), honouring strings, comments and nested templates; returns the
  // index after the closing brace.
  const skipExpression = (i) => {
    let depth = 1
    while (i < text.length && depth) {
      const c = text[i]
      if (c === "'" || c === '"') {
        i++
        while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1
        i++
      } else if (c === '`') i = skipTemplate(i + 1)
      else if (c === '/' && text[i + 1] === '/') i = text.indexOf('\n', i) === -1 ? text.length : text.indexOf('\n', i)
      else if (c === '/' && text[i + 1] === '*') i = text.indexOf('*/', i) === -1 ? text.length : text.indexOf('*/', i) + 2
      else if (c === '/' && startsRegex(i)) i = skipRegex(i + 1)
      else {
        if (c === '{') depth++
        else if (c === '}') depth--
        i++
      }
    }
    return i
  }
  // Skips any template literal from `i` (just after the backtick); returns the index after the closing backtick.
  const skipTemplate = (i) => {
    while (i < text.length && text[i] !== '`') {
      if (text[i] === '\\') i += 2
      else if (text[i] === '$' && text[i + 1] === '{') i = skipExpression(i + 2)
      else i++
    }
    return i + 1
  }
  for (const match of text.matchAll(/(?<![.\w])(?:html|svg)`/g)) {
    // A template quoted in a comment (JSDoc usage) is not code.
    const lineStart = text.lastIndexOf('\n', match.index) + 1
    if (/^\s*(\/\/|\*|\/\*)/.test(text.slice(lineStart, match.index))) continue
    let i = match.index + match[0].length
    let state = 'text' // text | tag | comment | style
    let buffer = ''
    let bufferStart = i
    let attr = null // { name, quote, value, start }
    let tagName = ''
    const flush = () => {
      if (buffer.trim()) out.push({ index: lineAt(bufferStart), text: buffer.trim() })
      buffer = ''
    }
    while (i < text.length && text[i] !== '`') {
      if (text[i] === '\\') {
        i += 2
        continue
      }
      if (text[i] === '$' && text[i + 1] === '{') {
        if (state === 'text') flush()
        if (attr) attr.value += '\uE000' // an expression inside the value
        i = skipExpression(i + 2)
        bufferStart = i
        continue
      }
      const c = text[i]
      if (state === 'comment') {
        if (text.startsWith('-->', i)) state = 'text'
        i++
        continue
      }
      if (state === 'style') {
        if (/^<\/style/i.test(text.slice(i, i + 7))) state = 'tag'
        i++
        continue
      }
      if (state === 'text') {
        if (text.startsWith('<!--', i)) {
          flush()
          state = 'comment'
          i += 4
          continue
        }
        // `<${tag}` is a static-html tag.
        if (c === '<' && (/[a-zA-Z/]/.test(text[i + 1] ?? '') || text.startsWith('${', i + 1))) {
          flush()
          state = 'tag'
          tagName = /^<([a-zA-Z][\w-]*)/.exec(text.slice(i))?.[1]?.toLowerCase() ?? ''
          i++
          continue
        }
        if (!buffer) bufferStart = i
        buffer += c
        i++
        continue
      }
      // state === 'tag'
      if (attr) {
        if (c === attr.quote) {
          if (TEXT_ATTRIBUTES.test(attr.name)) {
            const literal = attr.value.split('\uE000').join(' ').trim()
            if (literal) out.push({ index: lineAt(attr.start), text: literal, attribute: attr.name })
          }
          attr = null
        } else attr.value += c
        i++
        continue
      }
      const name = /^\s([.?@]?[\w:-]+)=(["'])/.exec(text.slice(i - 1, i + 80))
      if (name && /\s/.test(text[i - 1])) {
        i += name[0].length - 1
        attr = { name: name[1], quote: name[2], value: '', start: i }
        continue
      }
      if (c === '>') {
        state = tagName === 'style' ? 'style' : 'text'
        tagName = ''
        bufferStart = i + 1
      }
      i++
    }
    if (state === 'text') flush()
  }
  return out
}

// Words that are UI text on their own, even alone and lower case.
const UI_WORDS =
  /^(close|cancel|ok|done|save|delete|remove|clear|search|loading|next|previous|back|more|less|show|hide|open|copy|copied|edit|add|apply|reset|submit|send|retry|undo|redo|today|yes|no|none|all|empty|error|selected|items?|of|and|or|page|results?|download|upload|browse|expand|collapse|menu|settings|filter|sort|required|optional)$/i

function looksLikeEnglish(literal) {
  const clean = literal
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\uE000/g, ' ')
    .trim()
  const words = clean.match(/[A-Za-z][A-Za-z']*/g) ?? []
  if (!words.length) return false
  if (/^[\w.-]+:\/\//.test(clean) || /^[\w-]+(\.[\w-]+)+$/.test(clean)) return false // URLs, file names
  if (words.length === 1) return words[0].length > 1 && (UI_WORDS.test(words[0]) || /^[A-Z][a-z]{2,}$/.test(words[0]))
  // Two or more words: prose, unless it is all identifiers or units (`px`, `kB`).
  return words.some((w) => w.length > 1) && /[a-z]{2,}/.test(clean)
}

const ignored = (all, i, id) => [all[i], all[i - 1] ?? ''].some((l) => new RegExp(`modern-web-ignore:\\s*(${id}|all)\\b`).test(l))

const findings = []
for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8')
  const all = lines(text)
  const ext = file.endsWith('.scss') ? 'scss' : 'ts'
  const touched = changedLines(file)
  for (const rule of rules.filter((r) => r.ext === ext)) {
    const hits = rule.file ? rule.file(text, file) : all.flatMap((l, i) => (rule.line.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l) ? [i] : []))
    for (const i of hits) {
      if (touched && !touched.has(i + 1)) continue
      if (ignored(all, i, rule.id)) continue
      findings.push({ file, line: i + 1, rule: rule.id, level: rule.level, message: rule.message, guide: rule.guide, code: all[i].trim().slice(0, 140) })
    }
  }
}

if (asJson) {
  console.log(JSON.stringify(findings, null, 2))
} else if (!findings.length) {
  console.log(`modern-web scan: ${files.length} source file(s), no findings.`)
} else {
  const byRule = Map.groupBy ? Map.groupBy(findings, (f) => f.rule) : new Map(findings.map((f) => [f.rule, findings.filter((g) => g.rule === f.rule)]))
  for (const [id, list] of byRule) {
    const { level, message, guide } = list[0]
    console.log(`\n${level.toUpperCase()} ${id} (${list.length})\n  ${message}\n  guide: ${guide}`)
    for (const f of list) console.log(`  ${f.file}:${f.line}  ${f.code}`)
  }
  const errors = findings.filter((f) => f.level === 'error').length
  console.log(`\nmodern-web scan: ${files.length} file(s), ${errors} error(s), ${findings.length - errors} warning(s).`)
}
// exitCode, not exit(): a large --json report is still being flushed to a pipe when the script ends.
process.exitCode = findings.some((f) => f.level === 'error') ? 1 : 0
