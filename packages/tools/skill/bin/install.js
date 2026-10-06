#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const allAgents = ['claude', 'codex', 'antigravity', 'copilot']
const supportedAgents = new Set(allAgents)

// The skill and the MCP server only help once the model decides to use them, and a prompt such as "build the settings
// form" never mentions c2n, so the model reaches for native elements. Each agent's always-loaded instructions file
// (`CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`) is the one place guaranteed to reach the model, so the
// installer merges a short rules block there. The block is replaced in place on every install, and nothing outside
// the markers is touched.
const instructionsStart = '<!-- c2n:start (managed by `npx c2n-skill install`, edits inside are replaced) -->'
const instructionsEnd = '<!-- c2n:end -->'
const instructionFiles = {
  claude: { file: 'CLAUDE.md', skill: '.claude/skills/c2n-components/SKILL.md' },
  codex: { file: 'AGENTS.md', skill: '.agents/skills/c2n-components/SKILL.md' },
  copilot: { file: '.github/copilot-instructions.md', skill: '.github/skills/c2n-components/SKILL.md' },
}

/**
 * `mcp`: whether this install configured the c2n MCP server. Without it (`--no-mcp`) the rules name the fallbacks the
 * agent does have: the installed manifest for the API and the `@c2n/mcp validate` command for the check.
 */
function instructionsBlock(skill, mcp) {
  const manifest = '`node_modules/@c2n/components/custom-elements.json`'
  const search = mcp
    ? 'Call the c2n MCP tool `search_components` before concluding none fits.'
    : `Search ${manifest} (or the skill's \`references/component-catalog.md\`) before concluding none fits.`
  const api = mcp
    ? `Before using a component, call \`get_component\` for its API and \`get_examples\` for markup; call \`get_theme\` before writing CSS. Without the MCP tools, read ${manifest}.`
    : `Before using a component, read its API (tags, attributes, slots, events, CSS variables) from ${manifest}.`
  const children = `${mcp ? '`get_component`' : "the skill's `references/component-catalog.md`"} lists them under "Children"`
  const parts = mcp ? 'parts `get_component` lists' : 'parts the manifest lists'
  const validate = mcp
    ? 'check what you wrote with the MCP tool `validate_markup` (or `npx -y @c2n/mcp validate src`)'
    : 'check what you wrote with `npx -y @c2n/mcp validate src`'
  return `${instructionsStart}
## UI components: use c2n (\`c2-*\` elements from \`@c2n/*\`)

This project builds its UI from the c2n web components. **Before writing any UI markup, use a \`c2-*\` element instead of a native element or a hand-rolled widget**, even when the task does not mention c2n:

- \`<button>\` → \`c2-button\` / \`c2-icon-button\`; \`<input>\` → \`c2-text-field\`, \`c2-number-input\`, \`c2-date-input\`, \`c2-checkbox\`, \`c2-radio\`, \`c2-switch\`, \`c2-slider\`; \`<textarea>\` → \`c2-textarea\`; \`<select>\` → \`c2-select\` / \`c2-autocomplete\`
- \`<dialog>\` → \`c2-modal\` / \`c2-sheet\`; \`<details>\` → \`c2-details\` / \`c2-accordion\`; \`<progress>\` → \`c2-progress\`; a data grid (sorting, selection, many rows) → \`c2-table\` (a short static \`<table>\` can stay native); tabs, menus, tooltips, toasts, cards, badges, pagination → their \`c2-*\` element
- Not listed here? ${search} Write plain HTML only when nothing fits, and say so.

Then:

- Never write a \`c2-*\` tag, attribute, slot, event or \`--c2-*\` variable from memory. ${api}
- Build the child elements a container expects: ${children} (\`c2-dashboard\` holds \`c2-dash-card\`, \`c2-tabs\` holds \`c2-tab\`).
- Restyle a component only through its documented CSS variables, \`--c2-<component>__<part>[__<state>]--<property>\`, set on a class or the element. Do not put \`border\`, \`padding\`, \`background\`, \`color\` or size rules on a \`c2-*\` host, do not reach into its shadow DOM, and use \`::part()\` only for ${parts}.
- Theme once: import \`@c2n/components/theme.css\` at the app root and set \`--c2-theme--*\` tokens on \`:root\`.
- Before finishing, ${validate} and fix what it reports. Mark a deliberate native element with a \`c2n-ignore\` comment.
- The \`c2n-components\` skill (\`${skill}\`) has the full workflow.
${instructionsEnd}`
}

function mergeInstructions(file, block) {
  mkdirSync(dirname(file), { recursive: true })
  const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const start = current.indexOf(instructionsStart)
  const end = current.indexOf(instructionsEnd)
  const next =
    start >= 0 && end > start
      ? current.slice(0, start) + block + current.slice(end + instructionsEnd.length)
      : `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}\n`
  writeFileSync(file, next)
}

/**
 * Claude Code runs a `PostToolUse` hook after every file the agent writes; exit code 2 hands its stderr back to the
 * agent. `c2n-mcp validate --hook` uses that to report native controls and unknown c2 APIs in the file just written,
 * so the agent fixes them in the same turn instead of waiting to be asked. Earlier c2n entries are replaced.
 */
function mergeClaudeHook(file, command) {
  if (!command && !existsSync(file)) return false
  mkdirSync(dirname(file), { recursive: true })
  const value = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const hooks = (value.hooks ??= {})
  const before = JSON.stringify(hooks.PostToolUse ?? [])
  const entries = (hooks.PostToolUse ?? [])
    .map((entry) => ({ ...entry, hooks: (entry.hooks ?? []).filter((hook) => !isC2nHook(hook)) }))
    .filter((entry) => entry.hooks.length > 0)
  if (command) entries.push({ matcher: 'Write|Edit|MultiEdit', hooks: [{ type: 'command', command, timeout: 30 }] })
  if (!command && JSON.stringify(entries) === before) return false
  if (entries.length) hooks.PostToolUse = entries
  else delete hooks.PostToolUse
  if (Object.keys(hooks).length === 0) delete value.hooks
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
  return true
}

/** The hook this installer writes, whichever way it starts the server. */
function isC2nHook(hook) {
  return /@c2n\/mcp\b.*\bvalidate --hook\b/.test(String(hook.command ?? ''))
}

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

function mergeJsonServer(file, server, key = 'mcpServers') {
  mkdirSync(dirname(file), { recursive: true })
  const value = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  value[key] = { ...(value[key] ?? {}), c2n: server }
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

function mergeCodexServer(file, command) {
  mkdirSync(dirname(file), { recursive: true })
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : []
  const start = lines.findIndex((line) => line.trim() === '[mcp_servers.c2n]')
  if (start >= 0) {
    let end = start + 1
    while (end < lines.length && !/^\s*\[\[?[^\]]+\]\]?\s*$/.test(lines[end])) end += 1
    lines.splice(start, end - start)
  }
  const current = lines.join('\n').trimEnd()
  const section = `[mcp_servers.c2n]\ncommand = ${JSON.stringify(command.command)}\nargs = [${command.args.map((arg) => JSON.stringify(arg)).join(', ')}]`
  writeFileSync(file, `${current}${current ? '\n\n' : ''}${section}\n`)
}

/**
 * `npx -y @c2n/mcp@<version>` downloads the server every time the agent starts it, which fails silently behind a
 * proxy the agent's environment does not know about. A project that installed `@c2n/mcp` itself runs that copy
 * instead: no network at startup, and the registry matches the installed components.
 */
const localServer = 'node_modules/@c2n/mcp/dist/cli.js'

export function installProject({ projectRoot = process.cwd(), agents = allAgents, includeMcp = true, includeHook = true, mcp = 'auto' } = {}) {
  const selected = [...new Set(agents)]
  for (const agent of selected) {
    if (!supportedAgents.has(agent)) throw new Error(`Unknown agent "${agent}". Use ${allAgents.join(', ')}, or all.`)
  }
  if (!['auto', 'local', 'npx'].includes(mcp)) throw new Error(`Unknown --mcp "${mcp}". Use auto, local or npx.`)

  const root = resolve(projectRoot)
  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  const local = mcp === 'local' || (mcp === 'auto' && existsSync(join(root, localServer)))
  if (local && (includeMcp || includeHook) && !existsSync(join(root, localServer))) {
    throw new Error(`--mcp local needs @c2n/mcp in the project: npm i -D @c2n/mcp@${packageJson.version}`)
  }
  const command = local ? { command: 'node', args: [localServer] } : { command: 'npx', args: ['-y', `@c2n/mcp@${packageJson.version}`] }
  const server = { type: 'stdio', ...command }
  const installedSkills = new Set()

  if (selected.includes('claude')) installedSkills.add(installSkill(root, '.claude/skills'))
  if (selected.includes('codex') || selected.includes('antigravity')) installedSkills.add(installSkill(root, '.agents/skills'))
  if (selected.includes('copilot')) installedSkills.add(installSkill(root, '.github/skills'))

  const configs = []
  if (includeMcp && selected.includes('claude')) {
    const file = join(root, '.mcp.json')
    mergeJsonServer(file, server)
    configs.push(file)
  }
  if (includeMcp && selected.includes('codex')) {
    const file = join(root, '.codex/config.toml')
    mergeCodexServer(file, command)
    configs.push(file)
  }
  if (includeMcp && selected.includes('antigravity')) {
    const file = join(root, '.agents/mcp_config.json')
    mergeJsonServer(file, command)
    configs.push(file)
  }
  if (includeMcp && selected.includes('copilot')) {
    const file = join(root, '.vscode/mcp.json')
    // VS Code does not promise the workspace as the server's working directory; its variable pins the local path.
    const args = local ? [`\${workspaceFolder}/${localServer}`] : server.args
    mergeJsonServer(file, { ...server, args }, 'servers')
    configs.push(file)
  }
  const hooks = []
  if (selected.includes('claude')) {
    // --no-hook also takes out a hook an earlier install added.
    const file = join(root, '.claude/settings.json')
    const validate = local ? `node "$CLAUDE_PROJECT_DIR/${localServer}"` : `npx -y @c2n/mcp@${packageJson.version}`
    if (mergeClaudeHook(file, includeHook ? `${validate} validate --hook` : undefined) && includeHook) hooks.push(file)
  }
  const instructions = []
  for (const agent of selected) {
    const target = instructionFiles[agent]
    if (!target) continue
    const file = join(root, target.file)
    mergeInstructions(file, instructionsBlock(target.skill, includeMcp))
    instructions.push(file)
  }

  return { agents: selected, skills: [...installedSkills], configs, hooks, instructions, mcp: local ? 'local' : 'npx' }
}

function usage() {
  return `Install the c2n skill and MCP server into a project.\n\nUsage:\n  c2n-skill install [--agent all|claude|codex|antigravity|copilot] [--project <path>] [--mcp auto|local|npx] [--no-mcp] [--no-hook]\n\nThe default is --agent all --project . --mcp auto.\n--mcp local runs the project's own node_modules/@c2n/mcp (no download when the agent starts it, which is what works\nbehind a proxy); npx fetches @c2n/mcp on start; auto picks local when @c2n/mcp is installed in the project.\n--no-hook leaves out (or removes) the Claude Code hook that checks every file the agent writes with \`c2n-mcp validate\`.`
}

export function run(argv = process.argv.slice(2)) {
  const args = [...argv]
  if (args[0] === 'install') args.shift()
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage())
    return
  }

  let projectRoot = process.cwd()
  let agents = allAgents
  let includeMcp = true
  let includeHook = true
  let mcp = 'auto'
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--no-mcp') includeMcp = false
    else if (argument === '--no-hook') includeHook = false
    else if (argument === '--project') projectRoot = args[++index]
    else if (argument.startsWith('--project=')) projectRoot = argument.slice('--project='.length)
    else if (argument === '--mcp') mcp = args[++index] ?? ''
    else if (argument.startsWith('--mcp=')) mcp = argument.slice('--mcp='.length)
    else if (argument === '--agent') agents = (args[++index] ?? '').split(',')
    else if (argument.startsWith('--agent=')) agents = argument.slice('--agent='.length).split(',')
    else throw new Error(`Unknown argument "${argument}".\n\n${usage()}`)
  }
  if (!projectRoot) throw new Error('--project requires a path')
  if (agents.includes('all')) agents = allAgents

  const result = installProject({ projectRoot, agents, includeMcp, includeHook, mcp })
  console.log(`Installed c2n for ${result.agents.join(', ')} in ${resolve(projectRoot)}`)
  for (const skill of result.skills) console.log(`  skill: ${skill}`)
  for (const config of result.configs) console.log(`  MCP:   ${config} (${result.mcp === 'local' ? 'runs node_modules/@c2n/mcp' : 'npx -y @c2n/mcp'})`)
  for (const file of result.hooks) console.log(`  hook:  ${file} (c2n-mcp validate after each edit)`)
  for (const file of result.instructions) console.log(`  rules: ${file}`)
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
