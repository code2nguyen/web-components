import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

function readJson(path, description) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${description}: cannot read valid JSON at ${path}: ${error.message}`, { cause: error })
  }
}

function workspaceDirectories(repoRoot, pattern) {
  if (!pattern.endsWith('/*')) return [resolve(repoRoot, pattern)]
  const parent = resolve(repoRoot, pattern.slice(0, -2))
  if (!existsSync(parent)) return []
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(parent, entry.name))
    .sort()
}

/** Discover exact published element identities from the workspace declaration and checked-in manifests. */
export function discoverPublishableContracts(repoRoot) {
  const rootPackage = readJson(join(repoRoot, 'package.json'), 'root package metadata')
  const workspaces = Array.isArray(rootPackage.workspaces) ? rootPackage.workspaces : rootPackage.workspaces?.packages
  if (!Array.isArray(workspaces)) throw new Error('root package metadata: missing workspaces array')

  const packageDirectories = new Set()
  for (const workspace of workspaces) {
    if (!['packages/components/*', 'packages/icons/*', 'open-packages/*'].includes(workspace)) continue
    for (const directory of workspaceDirectories(repoRoot, workspace)) packageDirectories.add(directory)
  }

  const packages = []
  const tags = []
  const seenTags = new Map()
  for (const directory of [...packageDirectories].sort()) {
    const packageFile = join(directory, 'package.json')
    if (!existsSync(packageFile)) continue
    const metadata = readJson(packageFile, 'package metadata')
    if (metadata.private === true) continue
    if (typeof metadata.name !== 'string' || !metadata.name) throw new Error(`publishable package at ${directory}: missing name`)
    const manifestFile = resolve(directory, metadata.customElements ?? 'custom-elements.json')
    if (!existsSync(manifestFile)) throw new Error(`${metadata.name}: missing manifest ${manifestFile}`)
    const manifest = readJson(manifestFile, `${metadata.name} manifest`)
    if (!Array.isArray(manifest.modules)) throw new Error(`${metadata.name}: manifest has no modules array: ${manifestFile}`)
    const packageTags = []
    for (const module of manifest.modules) {
      for (const declaration of module.declarations ?? []) {
        if (!declaration.tagName) continue
        const tag = declaration.tagName
        const previous = seenTags.get(tag)
        if (previous) throw new Error(`duplicate tag ${tag}: ${previous} and ${manifestFile}`)
        seenTags.set(tag, manifestFile)
        const record = {
          tag,
          packageName: metadata.name,
          packagePath: directory,
          manifestFile,
          packageManifest: manifest,
          modulePath: module.path,
          declaration,
        }
        packageTags.push(record)
        tags.push(record)
      }
    }
    packages.push({ name: metadata.name, path: directory, manifestFile, manifest, tags: packageTags })
  }
  packages.sort((a, b) => a.name.localeCompare(b.name))
  tags.sort((a, b) => a.tag.localeCompare(b.tag))
  return { packages, tags }
}
