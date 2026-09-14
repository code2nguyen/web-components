# @c2n/skill

Portable Agent Skill and MCP configuration for building applications with the `c2-*` elements from `@c2n/*`. The same package supports Claude Code, Codex and Google Antigravity.

## Install in a project

Install the package, then let its project-scoped installer copy the skill and merge the MCP server without replacing unrelated configuration:

```bash
npm i -D @c2n/skill
npx c2n-skill install
```

The default installs all supported agents. Select one or disable MCP configuration when needed:

```bash
npx c2n-skill install --agent claude
npx c2n-skill install --agent codex
npx c2n-skill install --agent antigravity
npx c2n-skill install --agent codex,antigravity --no-mcp
```

Generated project files:

| Agent       | Skill                            | MCP configuration         |
| ----------- | -------------------------------- | ------------------------- |
| Claude      | `.claude/skills/c2n-components/` | `.mcp.json`               |
| Codex       | `.agents/skills/c2n-components/` | `.codex/config.toml`      |
| Antigravity | `.agents/skills/c2n-components/` | `.agents/mcp_config.json` |

Codex and Antigravity intentionally share the portable `.agents/skills/` copy. Re-running the installer updates c2n-owned files and preserves other MCP server entries.

Restart the selected agent after installation so it discovers both additions. The skill gives the agent c2n-specific workflow and theming guidance; the MCP server supplies the current component APIs, examples, presets and generated code. They work independently, but installing both gives the best result.

## Use with an agent

Ask the agent to use c2n explicitly when starting an application task, for example:

```text
Use the c2n skill and MCP server to build this settings form. Check each component API before writing markup, load @c2n/theme once, and create application variants for repeated styles.
```

You can also invoke the installed `c2n-components` skill by name in clients that support explicit skill invocation. The agent should consult MCP first and inspect the installed package manifest when MCP is unavailable.

## Plugin installation

The package root contains the portable Agent Plugins `plugin.json`, `mcp.json` and `skills/` layout used by Codex-compatible plugin hosts. Claude compatibility remains under `.claude-plugin/plugin.json` and `.mcp.json`.

From this repository, Claude Code can install the marketplace plugin:

```text
/plugin marketplace add code2nguyen/web-components
/plugin install c2n@c2n
```

The MCP server starts through the exact matching `@c2n/mcp` release. For an MCP-only setup, run `npx -y @c2n/mcp` from any stdio MCP client.

See the [AI tools guide](https://code2nguyen.github.io/web-components/guides/ai-tools) for installation, verification, manual configuration and troubleshooting in each supported agent.

## What the skill does

1. Detects the project (framework, installed `@c2n/*` packages, existing theme bridge and variants).
2. Gets facts from the MCP tools (`get_component`, `get_examples`, `get_theme`), falling back to a compact component catalog for discovery and the installed `custom-elements.json` files for exact APIs.
3. Themes once with `@c2n/theme`, uses the tags directly, and turns every repeated pattern into a CSS-class variant, a wrapper component, a Lit subclass or a composed component.

`references/` holds the workflow, theming, variant and framework guides. `component-catalog.md` is a generated discovery index, not an API reference; installed component manifests provide version-correct API facts when MCP is unavailable.

## Development

`npm run build:tools` at the repository root regenerates the compact catalog and synchronizes every plugin manifest and `@c2n/mcp` pin from `package.json`. `npm test -w packages/tools/skill` verifies idempotent installation in temporary projects.
