import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const contentRoot = join(repoRoot, 'apps/ui/src/content')

function frontmatter(source) {
  const match = /^---\n([\s\S]*?)\n---/.exec(source)
  if (!match) return {}
  return Object.fromEntries(
    match[1]
      .split('\n')
      .map((line) => /^([a-zA-Z_-]+):\s*(['"]?)(.*?)\2$/.exec(line.trim()))
      .filter(Boolean)
      .map((match) => [match[1], match[3]]),
  )
}

const documentedPackages = new Set()
for (const directory of ['components', 'oepn-components']) {
  const root = join(contentRoot, directory)
  for (const file of existsSync(root) ? readdirSync(root).filter((name) => name.endsWith('.mdx')) : []) {
    const data = frontmatter(readFileSync(join(root, file), 'utf8'))
    documentedPackages.add(data.package ?? `@c2n/${basename(file, '.mdx')}`)
  }
}

const stats = {
  elements: [0, 0],
  attributes: [0, 0],
  slots: [0, 0],
  events: [0, 0],
  cssParts: [0, 0],
}
const missing = []
const validEvent = (name) => typeof name === 'string' && name !== 'undefined' && /^[a-z][a-z0-9-]*$/.test(name)

for (const root of ['packages/components', 'open-packages']) {
  const absolute = join(repoRoot, root)
  for (const directory of existsSync(absolute) ? readdirSync(absolute) : []) {
    const packageFile = join(absolute, directory, 'package.json')
    const manifestFile = join(absolute, directory, 'custom-elements.json')
    if (!existsSync(packageFile) || !existsSync(manifestFile)) continue
    const packageName = JSON.parse(readFileSync(packageFile, 'utf8')).name
    if (!documentedPackages.has(packageName)) continue
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
    for (const module of manifest.modules ?? []) {
      for (const element of module.declarations ?? []) {
        if (!element.tagName) continue
        record('elements', element, element.tagName)
        for (const attribute of element.attributes ?? []) record('attributes', attribute, `${element.tagName} attribute ${attribute.name}`)
        for (const slot of element.slots ?? []) record('slots', slot, `${element.tagName} slot ${slot.name || '(default)'}`)
        for (const event of (element.events ?? []).filter((item) => validEvent(item.name))) record('events', event, `${element.tagName} event ${event.name}`)
        for (const part of element.cssParts ?? []) record('cssParts', part, `${element.tagName} CSS part ${part.name}`)
      }
    }
  }
}

function record(kind, item, label) {
  stats[kind][1] += 1
  if (item.description?.trim()) stats[kind][0] += 1
  else missing.push(label)
}

const galleryProblems = []
const galleryRoot = join(contentRoot, 'gallery')
for (const file of readdirSync(galleryRoot)
  .filter((name) => name.endsWith('.mdx'))
  .sort()) {
  const source = readFileSync(join(galleryRoot, file), 'utf8')
  const fences = [...source.matchAll(/```html\s+([^\n]*\btag=MdxCodeBlock[^\n]*)\n([\s\S]*?)```/g)]
  const baseline = fences.find((match) => /(?:^|[,;\s])label=Default(?:[,;]|$)/.test(match[1]))
  if (!baseline) galleryProblems.push(`${file}: missing a Default gallery sample`)
  else if (/--c2-[a-z0-9-]+/.test(baseline[2])) galleryProblems.push(`${file}: Default sample changes a c2n CSS variable`)
}

const minimumCoverage = { elements: 1, attributes: 1, slots: 1, events: 1, cssParts: 1 }
const coverageProblems = []
for (const [kind, [described, total]] of Object.entries(stats)) {
  const coverage = total ? described / total : 1
  console.log(`[docs] ${kind}: ${described}/${total} described (${Math.round(coverage * 100)}%)`)
  if (coverage < minimumCoverage[kind]) coverageProblems.push(`${kind}: ${Math.round(coverage * 100)}% is below ${minimumCoverage[kind] * 100}%`)
}

if (missing.length) console.warn(`[docs] ${missing.length} descriptions still need enrichment:\n  ${missing.join('\n  ')}`)
const failures = [...coverageProblems, ...galleryProblems]
if (failures.length) {
  console.error(`[docs] validation failed:\n  ${failures.join('\n  ')}`)
  process.exitCode = 1
} else {
  console.log(`[docs] gallery baselines: ${readdirSync(galleryRoot).filter((name) => name.endsWith('.mdx')).length} valid`)
}
