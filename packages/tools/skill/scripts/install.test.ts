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

    assert.equal(first.skills.length, 2)
    assert.deepEqual(second.agents, ['claude', 'codex', 'antigravity'])
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
