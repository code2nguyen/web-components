/**
 * Discovery requirements taken from the component lab (`lab/`). Every build report row that the build met with c2n
 * components (`met` or `workaround`) is a requirement a real build had, answered by the components it named: the spec
 * gives the requirement's words, the report the components. They are written for a product, not for the benchmark, so
 * they measure discovery on text nobody tuned the search for. Rows built by hand (`hand-rolled`, `failed`) have no
 * component to find; they are gaps, which `lab/GAPS.md` tracks.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { validateMarkup } from '../../src/lib/validate.ts'
import { resolveElement } from '../../src/registry.ts'
import type { Registry } from '../../src/registry-types.ts'
import type { Task } from './score.ts'
// The lab's own readers, shared with lab/scripts/gaps.mjs and the docs site's /lab pages.
import { frontMatter, reportRows, specRequirements } from '../../../../../lab/scripts/lib/markdown.mjs'
import { labMarkdownFiles } from '../../../../../lab/scripts/lib/lab-files.mjs'
import { outsideApps, sourceFiles } from '../../../../../lab/scripts/lib/build-files.mjs'

interface SpecRequirement {
  id: string
  tags: string[]
  text: string
}
interface ReportRow {
  outcome: string
  components: string[]
}

/** Capabilities that cut across every component (a screen reader reading the page, a brand): no component to search for. */
const CROSS_CUTTING = /^(a11y|theme)\./

/**
 * Building blocks nobody searches for when a row also names something specific: a plain button and the glyph icon sets.
 * A button group, a split button or an illustration set is a real answer, so this is a list, not a category.
 */
const GENERIC = new Set(['button', 'icon-button', 'feather-icons', 'phosphor-icons', 'mat-icon'])

/** Content components (by id: `c2-avatar-group` is the `avatar` component's), never the answer to a requirement. */
const CONTENT = new Set(['badge', 'avatar', 'kbd', 'separator', 'link-button', 'status-light', 'list-item'])

/** The components a build's files use: the elements validate_markup finds in them, as the lab report reads them. */
function buildComponents(dir: string, registry: Registry): Set<string> {
  const found = new Set<string>()
  for (const file of sourceFiles(dir) as string[])
    for (const element of validateMarkup(registry, readFileSync(file, 'utf8'), file).elements) {
      const id = resolveElement(registry, element.tag)?.component.id
      if (id) found.add(id)
    }
  return found
}

/**
 * The lab requirements as discovery tasks: `expect` is the components the build used, minus the generic building blocks
 * (a plain button, glyph icons, badges, list items) when the row also used something specific, since nobody searches for a button.
 */
export function labTasks(registry: Registry, root: string): Task[] {
  const reports = join(root, 'lab/reports')
  const specs = join(root, 'lab/specs')
  if (!existsSync(reports) || !existsSync(specs)) return []
  const specFiles = new Map<string, string>()
  const duplicate = new Set<string>()
  // Found as gaps.mjs finds them (any depth, README and TEMPLATE left out).
  for (const path of labMarkdownFiles(specs) as string[]) {
    // The front matter's id names a spec; the file name is the fallback.
    const id = String(frontMatter(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).data.id || basename(path, '.md'))
    // An id used twice cannot say which spec a report belongs to: that id is left out, the rest of the lab counts.
    if (specFiles.has(id) || duplicate.has(id)) {
      if (!duplicate.has(id)) console.warn(`Lab requirements skip spec id "${id}": it exists twice (${specFiles.get(id)} and ${path})`)
      duplicate.add(id)
      specFiles.delete(id)
      continue
    }
    specFiles.set(id, path)
  }
  // A tag, a package name, or an icon's own tag (`c2-feather-x`, matched by its set's pattern).
  const idOf = (name: string): string | undefined => registry.tagIndex[name] ?? resolveElement(registry, name)?.component.id
  // A package name (`@c2n/chart`, documented on several pages) stands for the components of the package the build
  // uses, as `lab/scripts/readiness.mjs` reads it.
  let inBuild = new Set<string>()
  let buildDir = ''
  // Once per build and package: idsFor runs several times for one row.
  const warned = new Set<string>()
  const idsFor = (name: string): string[] => {
    if (!name.startsWith('@c2n/')) return [idOf(name) ?? ''].filter(Boolean)
    const all = Object.values(registry.components)
      .filter((c) => c.package === name)
      .map((c) => c.id)
    // Only what the build uses; a build that cannot be read names none (the report script refuses it too).
    const used = all.filter((id) => inBuild.has(id))
    // A build that creates the element from script hides it from the scan: say so rather than drop the row unseen.
    const warning = `Lab requirements: no element of ${name} found in ${buildDir}; the row names it only by package.`
    if (!used.length && !warned.has(warning)) {
      warned.add(warning)
      console.warn(warning)
    }
    return used
  }
  const content = (name: string) => idsFor(name).some((id) => CONTENT.has(id))
  // Tags and package names resolve to a component first, so `@c2n/badge` is as generic as `c2-badge`.
  const generic = (name: string) => content(name) || idsFor(name).some((id) => GENERIC.has(id))
  const tasks: Task[] = []
  // Sorted, so the tasks (and the report table) come out in one order on every file system.
  const folders = readdirSync(reports, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
  for (const folder of folders) {
    for (const file of readdirSync(join(reports, folder))
      .filter((f) => f.endsWith('.md'))
      .sort()) {
      const report = frontMatter(readFileSync(join(reports, folder, file), 'utf8').replace(/\r\n/g, '\n'))
      // The folder names the spec, as `lab/scripts/readiness.mjs` reads it; a front matter that disagrees is refused there
      // and here, so a report never counts in one and fails in the other.
      if (report.data.spec && report.data.spec !== folder) {
        // One broken report is left out, not the whole lab: the report script's --check gate fails on it in CI.
        console.warn(`Lab requirements skip lab/reports/${folder}/${file}: front matter spec ${report.data.spec} is not its folder ${folder}`)
        continue
      }
      const specId = folder
      if (!specFiles.has(specId)) continue
      const requirements = new Map(
        (specRequirements(frontMatter(readFileSync(specFiles.get(specId)!, 'utf8').replace(/\r\n/g, '\n')).body) as SpecRequirement[]).map((r) => [r.id, r]),
      )
      // The build as the report script checks it: under lab/apps/ and present, or the lab requirements are refused.
      const build = String(report.data.build || `lab/apps/${folder}/${file.slice(0, -3)}`)
      buildDir = join(root, build)
      const fromApps = relative(join(root, 'lab/apps'), buildDir)
      if (outsideApps(fromApps) || !existsSync(buildDir)) {
        console.warn(`Lab requirements skip lab/reports/${folder}/${file}: build ${build} is not a folder under lab/apps/`)
        continue
      }
      inBuild = buildComponents(buildDir, registry)
      const rows = reportRows(report.body) as Map<string, ReportRow>
      for (const [id, row] of rows) {
        const requirement = requirements.get(id)
        if (!requirement || !['met', 'workaround'].includes(row.outcome)) continue
        if (requirement.tags.every((c) => CROSS_CUTTING.test(c))) continue
        const idsOf = (names: string[]) => [...new Set(names.flatMap(idsFor))]
        const specific = idsOf(row.components.filter((name) => !generic(name)))
        // With nothing specific, the buttons or icons answer it; a badge or a list item never does.
        const expect = specific.length ? specific : idsOf(row.components.filter((name) => !content(name)))
        if (expect.length === 0) continue
        // One requirement counts once, however many directions built it: their components are pooled.
        const key = `lab:${specId}/${id}`
        const known = tasks.find((t) => t.id === key)
        if (known) known.expect = [...new Set([...known.expect, ...expect])]
        else tasks.push({ id: key, requirement: requirement.text.replace(/\*\*/g, ''), expect })
      }
    }
  }
  return tasks
}
