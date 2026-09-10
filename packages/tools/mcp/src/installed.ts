/**
 * Detects which `@c2n/*` packages the current project has installed (resolved from `C2N_PROJECT_ROOT` or the cwd,
 * which is the project directory when an MCP client spawns the server) and reads their manifests so the API served
 * for an installed component matches the installed version.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { ElementEntry } from './registry-types.ts'

export interface InstalledInfo {
  version: string
  /** Elements from the installed `custom-elements.json`, keyed by tag, when the package ships one. */
  elements?: Map<string, Pick<ElementEntry, 'attributes' | 'slots' | 'events' | 'cssProperties'>>
}

const TTL = 10_000
let cache: { at: number; root: string; packages: Map<string, InstalledInfo | null> } | undefined

export function projectRoot(): string {
  return process.env.C2N_PROJECT_ROOT ?? process.cwd()
}

export function installedPackage(name: string): InstalledInfo | null {
  const root = projectRoot()
  if (!cache || cache.root !== root || Date.now() - cache.at > TTL) cache = { at: Date.now(), root, packages: new Map() }
  if (cache.packages.has(name)) return cache.packages.get(name) ?? null
  let info: InstalledInfo | null
  try {
    const req = createRequire(join(root, 'noop.js'))
    const pkgJsonPath = req.resolve(`${name}/package.json`)
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { version: string; customElements?: string }
    info = { version: pkg.version }
    if (pkg.customElements) {
      try {
        const manifest = JSON.parse(readFileSync(join(pkgJsonPath, '..', pkg.customElements), 'utf8')) as {
          modules?: {
            declarations?: { tagName?: string; attributes?: unknown[]; slots?: unknown[]; events?: unknown[]; cssProperties?: { name?: string }[] }[]
          }[]
        }
        const elements = new Map<string, Pick<ElementEntry, 'attributes' | 'slots' | 'events' | 'cssProperties'>>()
        for (const mod of manifest.modules ?? []) {
          for (const decl of mod.declarations ?? []) {
            if (!decl.tagName) continue
            elements.set(decl.tagName, {
              attributes: (decl.attributes ?? []) as ElementEntry['attributes'],
              slots: (decl.slots ?? []) as ElementEntry['slots'],
              events: (decl.events ?? []) as ElementEntry['events'],
              cssProperties: (decl.cssProperties ?? []).filter((p) => p.name) as ElementEntry['cssProperties'],
            })
          }
        }
        info.elements = elements
      } catch {
        /* manifest unreadable: keep the bundled API */
      }
    }
  } catch {
    info = null
  }
  cache.packages.set(name, info)
  return info
}
