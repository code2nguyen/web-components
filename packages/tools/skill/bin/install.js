#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const supportedAgents = new Set(['claude', 'codex', 'antigravity'])

function copyDirectory(source, destination) {
  mkdirSync(destination, { recursive: true })
  for (const name of readdirSync(source)) {
    const from = join(source, name)
    const to = join(destination, name)
    if (statSync(from).isDirectory()) copyDirectory(from, to)
    else copyFileSync(from, to)
  }
}

function installSkill(projectRoot, relativeDirectory) {
  const destination = join(projectRoot, relativeDirectory, 'c2n-components')
  const existingSkill = join(destination, 'SKILL.md')
  if (existsSync(existingSkill) && !/^name:\s*c2n-components\s*$/m.test(readFileSync(existingSkill, 'utf8'))) {
    throw new Error(`Refusing to replace a different skill at ${destination}`)
  }
  copyDirectory(join(packageRoot, 'skills/c2n-components'), destination)
  return destination
}

function mergeJsonServer(file, server) {
  mkdirSync(dirname(file), { recursive: true })
  const value = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  value.mcpServers = { ...(value.mcpServers ?? {}), c2n: server }
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

function mergeCodexServer(file, version) {
  mkdirSync(dirname(file), { recursive: true })
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : []
  const start = lines.findIndex((line) => line.trim() === '[mcp_servers.c2n]')
  if (start >= 0) {
    let end = start + 1
    while (end < lines.length && !/^\s*\[\[?[^\]]+\]\]?\s*$/.test(lines[end])) end += 1
    lines.splice(start, end - start)
  }
  const current = lines.join('\n').trimEnd()
  const section = `[mcp_servers.c2n]\ncommand = "npx"\nargs = ["-y", "@c2n/mcp@${version}"]`
  writeFileSync(file, `${current}${current ? '\n\n' : ''}${section}\n`)
}

export function installProject({ projectRoot = process.cwd(), agents = ['claude', 'codex', 'antigravity'], includeMcp = true } = {}) {
  const selected = [...new Set(agents)]
  for (const agent of selected) {
    if (!supportedAgents.has(agent)) throw new Error(`Unknown agent "${agent}". Use claude, codex, antigravity, or all.`)
  }

  const root = resolve(projectRoot)
  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  const command = { command: 'npx', args: ['-y', `@c2n/mcp@${packageJson.version}`] }
  const server = { type: 'stdio', ...command }
  const installedSkills = new Set()

  if (selected.includes('claude')) installedSkills.add(installSkill(root, '.claude/skills'))
  if (selected.includes('codex') || selected.includes('antigravity')) installedSkills.add(installSkill(root, '.agents/skills'))

  const configs = []
  if (includeMcp && selected.includes('claude')) {
    const file = join(root, '.mcp.json')
    mergeJsonServer(file, server)
    configs.push(file)
  }
  if (includeMcp && selected.includes('codex')) {
    const file = join(root, '.codex/config.toml')
    mergeCodexServer(file, packageJson.version)
    configs.push(file)
  }
  if (includeMcp && selected.includes('antigravity')) {
    const file = join(root, '.agents/mcp_config.json')
    mergeJsonServer(file, command)
    configs.push(file)
  }

  return { agents: selected, skills: [...installedSkills], configs }
}

function usage() {
  return `Install the c2n skill and MCP server into a project.\n\nUsage:\n  c2n-skill install [--agent all|claude|codex|antigravity] [--project <path>] [--no-mcp]\n\nThe default is --agent all --project .`
}

export function run(argv = process.argv.slice(2)) {
  const args = [...argv]
  if (args[0] === 'install') args.shift()
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage())
    return
  }

  let projectRoot = process.cwd()
  let agents = ['claude', 'codex', 'antigravity']
  let includeMcp = true
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--no-mcp') includeMcp = false
    else if (argument === '--project') projectRoot = args[++index]
    else if (argument.startsWith('--project=')) projectRoot = argument.slice('--project='.length)
    else if (argument === '--agent') agents = (args[++index] ?? '').split(',')
    else if (argument.startsWith('--agent=')) agents = argument.slice('--agent='.length).split(',')
    else throw new Error(`Unknown argument "${argument}".\n\n${usage()}`)
  }
  if (!projectRoot) throw new Error('--project requires a path')
  if (agents.includes('all')) agents = ['claude', 'codex', 'antigravity']

  const result = installProject({ projectRoot, agents, includeMcp })
  console.log(`Installed c2n for ${result.agents.join(', ')} in ${resolve(projectRoot)}`)
  for (const skill of result.skills) console.log(`  skill: ${skill}`)
  for (const config of result.configs) console.log(`  MCP:   ${config}`)
  console.log('Restart the selected agent so it discovers the skill and MCP server.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    run()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
