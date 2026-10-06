#!/usr/bin/env node
/** stdio entry point: `npx -y @c2n/mcp` or `node dist/cli.js`; `c2n-mcp validate` runs the markup check instead. */
import { readFileSync } from 'node:fs'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.ts'

const args = process.argv.slice(2)
if (args[0] === 'validate') {
  // exitCode rather than exit(): piped stdout and stderr must flush before the process ends.
  const { runValidate } = await import('./validate-cli.ts')
  process.exitCode = await runValidate(args.slice(1))
} else if (args.includes('--help') || args.includes('-h')) {
  console.log(
    'c2n-mcp — c2n web-component documentation and generation tools over stdio\n\nUsage: c2n-mcp [--help] [--version]\n       c2n-mcp validate [paths…] [--strict] [--format json] [--hook]',
  )
} else if (args.includes('--version') || args.includes('-v')) {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  console.log(packageJson.version)
} else {
  const server = createServer()
  await server.connect(new StdioServerTransport())
}
