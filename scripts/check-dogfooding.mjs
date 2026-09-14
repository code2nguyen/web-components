/**
 * The docs site is the shop window for `@c2n/*`: its own chrome has to be built from `c2-*` elements, themed
 * through their CSS variables, not hand-rolled from bare HTML controls. That rule is written in CLAUDE.md and
 * AGENTS.md, but an instruction is only as good as the gate behind it — this is the gate.
 *
 * It scans the site's chrome for native interactive elements that have a c2n equivalent and fails on anything
 * that is not in `KNOWN`, the list of places that predate the rule. Shrink that list; never grow it.
 *
 * Escape hatches, in order of preference:
 *   1. Use the c2 component.
 *   2. `<!-- dogfood-exempt: why -->` on the line before, when plain HTML is the point (an example showing that a
 *      slot takes any markup, a control the component library genuinely has no answer for).
 *   3. Add to `KNOWN` — only when adopting the component is real work you are deferring, with the reason.
 *
 * Whichever of 2 or 3 you reach for, say what the component was missing in `COMPONENT-FEEDBACK.md`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

// Chrome only. `src/data/*` is example markup quoted in the docs, where plain HTML is often exactly the lesson.
const ROOTS = ['apps/ui/src/components', 'apps/ui/src/layouts', 'apps/ui/src/pages']

/** Native element → the c2n component that should replace it. */
const REPLACEMENTS = [
  [/<button[\s>]/g, '<button>', 'c2-button / c2-icon-button'],
  [/<select[\s>]/g, '<select>', 'c2-select'],
  [/<textarea[\s>]/g, '<textarea>', 'c2-textarea'],
  [/<dialog[\s>]/g, '<dialog>', 'c2-modal'],
  [/<details[\s>]/g, '<details>', 'c2-details'],
  [/<progress[\s>]/g, '<progress>', 'c2-progress'],
  [/<input[^>]*type="(?:text|search|email|url|tel|password|number)"/g, '<input type="text">', 'c2-text-field'],
  [/<input[^>]*type="checkbox"/g, '<input type="checkbox">', 'c2-checkbox'],
  [/<input[^>]*type="radio"/g, '<input type="radio">', 'c2-radio'],
  [/<input[^>]*type="range"/g, '<input type="range">', 'c2-slider'],
]

/** Pre-existing chrome that has not been converted yet: `file:element`. Remove entries, do not add them. */
const KNOWN = new Set([])

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(astro|ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

/** Strips what is not markup, so a tag named in a comment or a selector string is not a finding. */
function strip(source) {
  return (
    source
      .replace(/\/\*[\s\S]*?\*\//g, (match) => (match.includes('dogfood-exempt') ? match : ''))
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
      // Keep the exemption markers; a comment is where the reason lives.
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, (match) => (match.includes('dogfood-exempt') ? match : ''))
      .replace(/<!--[\s\S]*?-->/g, (match) => (match.includes('dogfood-exempt') ? match : ''))
  )
}

const findings = []
const used = new Set()

for (const root of ROOTS) {
  const absolute = join(repoRoot, root)
  if (!existsSync(absolute)) continue
  for (const file of walk(absolute)) {
    const path = relative(repoRoot, file)
    const source = readFileSync(file, 'utf8')
    const lines = strip(source).split('\n')
    for (const [pattern, element, replacement] of REPLACEMENTS) {
      lines.forEach((line, index) => {
        pattern.lastIndex = 0
        if (!pattern.test(line)) return
        // An exemption sits on the line itself, or in a comment just above it — which may wrap.
        if (/dogfood-exempt/.test(lines.slice(Math.max(0, index - 3), index + 1).join('\n'))) return
        const id = `${path}:${element}`
        if (KNOWN.has(id)) {
          used.add(id)
          return
        }
        findings.push(`${path}:${index + 1}  ${element} → use ${replacement}`)
      })
    }
  }
}

const stale = [...KNOWN].filter((id) => !used.has(id))

for (const finding of findings) console.error(`[dogfood] ${finding}`)
for (const id of stale) console.error(`[dogfood] ${id} is in KNOWN but no longer found — delete the entry`)

if (findings.length > 0 || stale.length > 0) {
  console.error(
    `\n[dogfood] The docs site builds its chrome from c2n components (see CLAUDE.md / AGENTS.md).\n` +
      `          Use the c2 element, or mark the line \`<!-- dogfood-exempt: why -->\` when plain HTML is the point —\n` +
      `          and log what the component was missing in COMPONENT-FEEDBACK.md.`,
  )
  process.exit(1)
}

console.log(`[dogfood] site chrome uses c2n components${KNOWN.size ? ` (${KNOWN.size} known exceptions left to convert)` : ''}`)
