#!/usr/bin/env node
// Legacy-pattern scan for c2n components: flags the old web patterns the 2026-11 platform audit found, so new code
// does not bring them back. Each rule names the modern replacement and the modern-web-guidance guide to read.
//
//   node .claude/skills/modern-web-review/scripts/scan.mjs                      # files changed vs origin/develop (+ uncommitted)
//   node .claude/skills/modern-web-review/scripts/scan.mjs --all                # every component, core and open package
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

const SOURCE_ROOTS = ['packages/components', 'packages/core/src', 'open-packages']
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
    guide: 'prerendering-custom-elements, CLAUDE.md "Never write an attribute on the host"',
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
    guide: 'CLAUDE.md "Component conventions"',
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
]

function lines(text) {
  return text.split('\n')
}

const ignored = (all, i, id) => [all[i], all[i - 1] ?? ''].some((l) => new RegExp(`modern-web-ignore:\\s*(${id}|all)\\b`).test(l))

const findings = []
for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8')
  const all = lines(text)
  const ext = file.endsWith('.scss') ? 'scss' : 'ts'
  const touched = changedLines(file)
  for (const rule of rules.filter((r) => r.ext === ext)) {
    const hits = rule.file ? rule.file(text) : all.flatMap((l, i) => (rule.line.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l) ? [i] : []))
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
