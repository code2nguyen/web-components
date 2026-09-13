#!/usr/bin/env node
/** stdio entry point: `npx -y @c2n/mcp` or `node dist/cli.js`. */
import { readFileSync } from 'node:fs'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.ts'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log('c2n-mcp — c2n web-component documentation and generation tools over stdio\n\nUsage: c2n-mcp [--help] [--version]')
  process.exit(0)
}
if (args.includes('--version') || args.includes('-v')) {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  console.log(packageJson.version)
  process.exit(0)
}

const server = createServer()
await server.connect(new StdioServerTransport())
