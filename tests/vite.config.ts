import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))

// Resolve sibling component imports to source so tests never depend on stale dist files.
const components = ['packages/components', 'open-packages'].flatMap((directory) =>
  readdirSync(resolve(root, directory), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const packageRoot = resolve(root, directory, entry.name)
      const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
        name: string
        exports?: Record<string, string | { default?: string }>
      }
      return Object.entries(manifest.exports ?? {}).flatMap(([subpath, entry]) => {
        const target = typeof entry === 'string' ? entry : entry.default
        if (!target?.startsWith('./dist/') || !target.endsWith('.js')) return []
        const source = resolve(packageRoot, target.replace('./dist/', './src/').replace(/\.js$/, '.ts'))
        if (!existsSync(source)) return []
        const name = manifest.name + (subpath === '.' ? '' : subpath.slice(1))
        return [{ find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), replacement: source }]
      })
    }),
)

export default defineConfig({
  root,
  publicDir: false,
  appType: 'mpa',
  resolve: {
    alias: [...components, { find: /^@c2n\/core\/(.+)\.js$/, replacement: `${resolve(root, 'packages/core/src')}/$1.ts` }],
    dedupe: ['lit', 'lit-html', 'lit-element'],
  },
  optimizeDeps: { entries: ['packages/components/*/test/*.html', 'open-packages/*/test/*.html'] },
  server: { host: '127.0.0.1', port: 4175, strictPort: true },
})
