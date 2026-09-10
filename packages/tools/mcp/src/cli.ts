#!/usr/bin/env node
/** stdio entry point: `npx -y @c2n/mcp` or `node dist/cli.js`. */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.ts'

const server = createServer()
await server.connect(new StdioServerTransport())
