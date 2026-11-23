// The packages of this pnpm workspace, read from `pnpm-workspace.yaml`. Build scripts that walk every `@c2n/*` package
// (the theme and framework-types generators, the style-contract audit) use it: pnpm links a package's own dependencies
// into its `node_modules`, not every workspace package into the root one, so there is no `node_modules/@c2n` directory
// listing them all.
import { existsSync, globSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

/** The repository root: the directory holding `pnpm-workspace.yaml`. */
export const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * `pnpm-workspace.yaml` of `root`, parsed.
 *
 * @param {string} [root]
 * @returns {{ packages?: string[], catalog?: Record<string, string> }}
 */
export function readWorkspace(root = workspaceRoot) {
  const file = join(root, 'pnpm-workspace.yaml')
  const workspace = parse(readFileSync(file, 'utf8'))
  if (!workspace || typeof workspace !== 'object') throw new Error(`${file} is not a YAML mapping`)
  return workspace
}

/**
 * The `packages:` globs of `pnpm-workspace.yaml`. A negated glob (`!dir`) is not supported: none is used, and
 * silently ignoring one would list a package pnpm leaves out.
 *
 * @param {string} [root]
 * @returns {string[]}
 */
export function workspacePatterns(root = workspaceRoot) {
  const { packages } = readWorkspace(root)
  if (!Array.isArray(packages) || packages.length === 0) throw new Error(`pnpm-workspace.yaml in ${root} lists no packages`)
  for (const pattern of packages) {
    if (typeof pattern !== 'string' || pattern.startsWith('!')) throw new Error(`pnpm-workspace.yaml: unsupported packages entry ${JSON.stringify(pattern)}`)
  }
  return packages
}

/**
 * Every workspace package as `{ name, dir }`, sorted by name. `dir` is absolute.
 *
 * @param {string} [root]
 * @returns {{ name: string, dir: string }[]}
 */
export function workspacePackages(root = workspaceRoot) {
  const packages = []
  for (const pattern of workspacePatterns(root)) {
    for (const relative of globSync(pattern, { cwd: root })) {
      const packageJson = join(root, relative, 'package.json')
      if (!existsSync(packageJson)) continue
      const { name } = JSON.parse(readFileSync(packageJson, 'utf8'))
      if (name) packages.push({ name, dir: join(root, relative) })
    }
  }
  return packages.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
