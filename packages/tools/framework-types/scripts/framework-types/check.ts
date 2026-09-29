/**
 * Compiles every generated `react.d.ts` and `vue.d.ts` with `skipLibCheck` off.
 *
 * Consumers almost always compile with `skipLibCheck` on, and then a broken declaration file does not fail their
 * build: whatever it declares silently becomes `any`. So a generator bug — importing an event map a package does
 * not export, say — is only ever visible here. Only diagnostics inside the generated files count; the component
 * declarations they import are checked by each package's own type-check.
 */
import { resolve } from 'node:path'
import ts from 'typescript'
import { readPackages } from './manifests.ts'

const files = readPackages().flatMap((pkg) => [resolve(pkg.dir, 'react.d.ts'), resolve(pkg.dir, 'vue.d.ts')])
const generated = new Set(files)

const program = ts.createProgram({
  rootNames: files,
  options: {
    noEmit: true,
    strict: true,
    skipLibCheck: false,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: [],
  },
})

const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => diagnostic.file && generated.has(resolve(diagnostic.file.fileName)))
if (diagnostics.length > 0) {
  const host = { getCanonicalFileName: (name: string) => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host))
}
console.log(`[framework-types] checked ${files.length} declaration files, ${diagnostics.length} error(s)`)
process.exit(diagnostics.length > 0 ? 1 : 0)
