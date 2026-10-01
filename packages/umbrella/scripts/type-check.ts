/**
 * Type-checks the umbrella's declarations and the consumer fixtures in `test/`.
 *
 * `skipLibCheck` has to be off, or the compiler never reads `index.d.ts` closely enough to report two packages
 * exporting the same name (it silently drops the name instead). With it off, the compiler also checks every
 * component's own declarations, and those have findings of their own, so only diagnostics in this package count.
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const testDir = join(packageDir, 'test')

const configPath = resolve(testDir, 'tsconfig.json')
const config = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (diagnostic) => report([diagnostic]) })
if (!config) process.exit(1)

const program = ts.createProgram({ rootNames: config.fileNames, options: config.options })
const own = ts
  .getPreEmitDiagnostics(program)
  .filter(
    (diagnostic) =>
      !diagnostic.file || (resolve(diagnostic.file.fileName).startsWith(`${packageDir}/`) && !diagnostic.file.fileName.includes('/node_modules/')),
  )

report(own)
console.log(`[@c2n/components] type-checked ${config.fileNames.length} files, ${own.length} error(s)`)
process.exit(own.length > 0 ? 1 : 0)

function report(diagnostics: readonly ts.Diagnostic[]): void {
  if (diagnostics.length === 0) return
  const host = { getCanonicalFileName: (name: string) => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host))
}
