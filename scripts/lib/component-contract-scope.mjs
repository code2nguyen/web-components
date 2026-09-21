import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

export function documentedPackageNames(contentRoot) {
  const packages = new Set()
  for (const directory of ['components', 'oepn-components', 'icons']) {
    const root = join(contentRoot, directory)
    for (const file of existsSync(root) ? readdirSync(root).filter((name) => name.endsWith('.mdx')) : []) {
      const source = readFileSync(join(root, file), 'utf8')
      const frontmatter = /^---\n([\s\S]*?)\n---/.exec(source)?.[1] ?? ''
      const packageName = /^package:\s*['"]?([^'"\n]+)['"]?$/m.exec(frontmatter)?.[1]
      packages.add(packageName ?? `@c2n/${basename(file, '.mdx')}`)
    }
  }
  return packages
}

export function publishableComponentPackages(repoRoot) {
  const packages = []
  const errors = []
  for (const root of ['packages/components', 'open-packages']) {
    const absolute = join(repoRoot, root)
    for (const directory of existsSync(absolute) ? readdirSync(absolute).sort() : []) {
      const packageFile = join(absolute, directory, 'package.json')
      if (!existsSync(packageFile)) continue
      const packageJson = JSON.parse(readFileSync(packageFile, 'utf8'))
      if (packageJson.private) continue
      const manifestName = packageJson.customElements ?? 'custom-elements.json'
      const manifestFile = join(absolute, directory, manifestName)
      if (!existsSync(manifestFile)) {
        errors.push(`${packageJson.name ?? `${root}/${directory}`}: missing ${manifestName}`)
        continue
      }
      packages.push({ name: packageJson.name, manifest: JSON.parse(readFileSync(manifestFile, 'utf8')), manifestFile })
    }
  }
  return { packages, errors }
}

export function undocumentedPublishablePackages(packages, documentedPackages) {
  return packages.map(({ name }) => name).filter((name) => !documentedPackages.has(name))
}

export function uiExampleDocuments(contentRoot) {
  const documents = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.name.endsWith('.mdx')) documents.push({ path, source: readFileSync(path, 'utf8') })
    }
  }
  visit(contentRoot)
  return documents
}

export function exampleCoverageProblems(packages, documents) {
  const problems = []
  for (const { name, manifest } of packages) {
    const declarations = (manifest.modules ?? []).flatMap((module) => module.declarations ?? []).filter((declaration) => declaration.tagName)
    const tags = declarations.map(({ tagName }) => tagName)
    const properties = declarations.flatMap((declaration) => (declaration.cssProperties ?? []).map(({ name: property }) => property))
    const parts = declarations.flatMap((declaration) => (declaration.cssParts ?? []).map(({ name: part }) => part))
    const fences = documents
      .filter(({ source }) => source.includes(name))
      .flatMap(({ source }) => [...source.matchAll(/```html[^\n]*\btag=(?:UsageBlock|MdxCodeBlock)\b[^\n]*\n([\s\S]*?)```/g)].map((match) => match[1]))
    const runnable = fences.filter((source) => tags.some((tag) => new RegExp(`<${tag}(?:\\s|>)`).test(source)))

    if (!runnable.length) {
      problems.push(`${name}: no runnable UI example uses a published component tag`)
      continue
    }
    if (!runnable.some((source) => properties.some((property) => source.includes(property)) || parts.some((part) => source.includes(`::part(${part})`)))) {
      problems.push(`${name}: no substantial customization example uses a documented CSS custom property or CSS part`)
    }
  }
  return problems
}
