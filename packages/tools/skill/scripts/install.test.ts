import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { installProject } from '../bin/install.js'

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

test('installs and updates every project-scoped agent configuration', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'c2n-skill-'))
  try {
    writeFileSync(join(projectRoot, '.mcp.json'), '{"mcpServers":{"existing":{"command":"existing"}}}\n')
    mkdirSync(join(projectRoot, '.codex'), { recursive: true })
    writeFileSync(join(projectRoot, '.codex/config.toml'), 'model = "test"\n\n[mcp_servers.c2n]\ncommand = "old"\n\n[[skills.config]]\npath = "keep"\n')
    const first = installProject({ projectRoot })
    const second = installProject({ projectRoot })

    assert.equal(first.skills.length, 3)
    assert.deepEqual(second.agents, ['claude', 'codex', 'antigravity', 'copilot'])
    assert.equal(second.mcp, 'npx')
    assert.match(readFileSync(join(projectRoot, '.claude/skills/c2n-components/SKILL.md'), 'utf8'), /^name: c2n-components$/m)
    assert.match(readFileSync(join(projectRoot, '.agents/skills/c2n-components/SKILL.md'), 'utf8'), /^name: c2n-components$/m)
    assert.equal(existsSync(join(projectRoot, '.agents/skills/c2n-components/references/component-catalog.md')), true)
    assert.equal(existsSync(join(projectRoot, '.agents/skills/c2n-components/references/components-cheatsheet.md')), false)

    const claude = JSON.parse(readFileSync(join(projectRoot, '.mcp.json'), 'utf8'))
    assert.equal(claude.mcpServers.existing.command, 'existing')
    assert.deepEqual(claude.mcpServers.c2n.args, ['-y', `@c2n/mcp@${version}`])

    const antigravity = JSON.parse(readFileSync(join(projectRoot, '.agents/mcp_config.json'), 'utf8'))
    assert.equal(antigravity.mcpServers.c2n.command, 'npx')
    assert.equal(antigravity.mcpServers.c2n.type, undefined)

    const codex = readFileSync(join(projectRoot, '.codex/config.toml'), 'utf8')
    assert.equal(codex.match(/\[mcp_servers\.c2n\]/g)?.length, 1)
    assert.match(codex, new RegExp(`@c2n/mcp@${version.replaceAll('.', '\\.')}`))
    assert.match(codex, /\[\[skills\.config\]\]\npath = "keep"/)

    assert.match(readFileSync(join(projectRoot, '.github/skills/c2n-components/SKILL.md'), 'utf8'), /^name: c2n-components$/m)
    const vscode = JSON.parse(readFileSync(join(projectRoot, '.vscode/mcp.json'), 'utf8'))
    assert.deepEqual(vscode.servers.c2n, { type: 'stdio', command: 'npx', args: ['-y', `@c2n/mcp@${version}`] })
    assert.equal(vscode.mcpServers, undefined)
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('can install the skill without MCP configuration', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'c2n-skill-'))
  try {
    const result = installProject({ projectRoot, agents: ['codex'], includeMcp: false })
    assert.equal(result.skills.length, 1)
    assert.deepEqual(result.configs, [])
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('merges the Copilot rules block without touching the rest of the file', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'c2n-skill-'))
  try {
    mkdirSync(join(projectRoot, '.github'), { recursive: true })
    mkdirSync(join(projectRoot, '.vscode'), { recursive: true })
    writeFileSync(join(projectRoot, '.github/copilot-instructions.md'), '# Team rules\n\nUse tabs.\n')
    writeFileSync(join(projectRoot, '.vscode/mcp.json'), '{"servers":{"other":{"command":"other"}},"inputs":[]}\n')
    installProject({ projectRoot, agents: ['copilot'] })
    installProject({ projectRoot, agents: ['copilot'] })

    const rules = readFileSync(join(projectRoot, '.github/copilot-instructions.md'), 'utf8')
    assert.match(rules, /^# Team rules\n\nUse tabs\.\n\n<!-- c2n:start/)
    assert.equal(rules.match(/<!-- c2n:start/g)?.length, 1)
    assert.match(rules, /get_component/)
    const vscode = JSON.parse(readFileSync(join(projectRoot, '.vscode/mcp.json'), 'utf8'))
    assert.equal(vscode.servers.other.command, 'other')
    assert.deepEqual(vscode.inputs, [])
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('merges the c2n rules into CLAUDE.md and AGENTS.md, which each agent loads in every session', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'c2n-skill-'))
  try {
    writeFileSync(join(projectRoot, 'CLAUDE.md'), '# Project\n')
    const result = installProject({ projectRoot, agents: ['claude', 'codex', 'antigravity'], includeMcp: false })
    installProject({ projectRoot, agents: ['claude', 'codex'], includeMcp: false })

    assert.deepEqual(result.instructions, [join(projectRoot, 'CLAUDE.md'), join(projectRoot, 'AGENTS.md')])
    const claude = readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8')
    assert.match(claude, /^# Project\n\n<!-- c2n:start/)
    assert.equal(claude.match(/<!-- c2n:start/g)?.length, 1)
    assert.match(claude, /instead of a native element/)
    assert.match(claude, /\.claude\/skills\/c2n-components\/SKILL\.md/)
    assert.match(readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8'), /\.agents\/skills\/c2n-components\/SKILL\.md/)
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('runs the project-installed MCP server when there is one, so starting it needs no network', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'c2n-skill-'))
  try {
    assert.throws(() => installProject({ projectRoot, agents: ['copilot'], mcp: 'local' }), /npm i -D @c2n\/mcp/)
    mkdirSync(join(projectRoot, 'node_modules/@c2n/mcp/dist'), { recursive: true })
    writeFileSync(join(projectRoot, 'node_modules/@c2n/mcp/dist/cli.js'), '')
    const result = installProject({ projectRoot, agents: ['copilot', 'claude', 'codex'] })

    assert.equal(result.mcp, 'local')
    const vscode = JSON.parse(readFileSync(join(projectRoot, '.vscode/mcp.json'), 'utf8'))
    assert.deepEqual(vscode.servers.c2n, { type: 'stdio', command: 'node', args: ['${workspaceFolder}/node_modules/@c2n/mcp/dist/cli.js'] })
    const claude = JSON.parse(readFileSync(join(projectRoot, '.mcp.json'), 'utf8'))
    assert.deepEqual(claude.mcpServers.c2n.args, ['node_modules/@c2n/mcp/dist/cli.js'])
    assert.match(readFileSync(join(projectRoot, '.codex/config.toml'), 'utf8'), /command = "node"\nargs = \["node_modules\/@c2n\/mcp\/dist\/cli\.js"\]/)

    assert.equal(installProject({ projectRoot, agents: ['claude'], mcp: 'npx' }).mcp, 'npx')
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})
