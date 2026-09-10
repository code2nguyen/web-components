# @c2n/skill

Claude Code plugin for the c2n web components: the `c2n-components` skill (how to theme, use and wrap the `c2-*` elements in any project) plus the `@c2n/mcp` server that gives the agent the component APIs, examples, presets and theme tokens.

## Install

**Marketplace (recommended)** — in Claude Code:

```
/plugin marketplace add code2nguyen/web-components
/plugin install c2n@c2n
```

The skill is available as `/c2n:c2n-components`, and the `c2n` MCP server starts with `npx -y @c2n/mcp`.

**Local plugin directory** — from a clone of the repository, or from the npm package:

```bash
npm i -D @c2n/skill
claude --plugin-dir node_modules/@c2n/skill
```

**Without plugins** — copy the skill into a project (or `~/.claude/skills/` for every project) and add the server:

```bash
cp -r node_modules/@c2n/skill/skills/c2n-components .claude/skills/
claude mcp add --transport stdio c2n -- npx -y @c2n/mcp
```

**MCP only** (Cursor, other clients): any stdio MCP client can run `npx -y @c2n/mcp`; see `@c2n/mcp`.

## What the skill does

1. Detects the project (framework, installed `@c2n/*` packages, existing theme bridge and variants).
2. Gets facts from the MCP tools (`get_component`, `get_examples`, `get_theme`), falling back to `references/components-cheatsheet.md` and the installed `custom-elements.json` files.
3. Themes once with `@c2n/theme`, uses the tags directly, and turns every repeated pattern into a CSS-class variant, a wrapper component, a Lit subclass or a composed component.

`references/` holds the workflow, theming, variant and framework guides; `components-cheatsheet.md` is generated from the MCP registry.

## Development

`npm run build:tools` at the repository root regenerates the cheatsheet and syncs the plugin version and the `@c2n/mcp` pin in `.mcp.json` from `package.json`; `lerna publish` runs the same script through the `version` lifecycle.
