# @c2n/mcp

[Model Context Protocol](https://modelcontextprotocol.io) server that exposes the c2n web components to AI agents: component APIs (attributes, slots, events, CSS variables with their theme tokens), usage and gallery examples, curated presets, the `@c2n/theme` tokens, variant code generation and the application workflow guides. Everything is bundled in `data/registry.json`, so it works offline in any project.

## Use

Claude Code (project `.mcp.json`, or `claude mcp add --transport stdio c2n -- npx -y @c2n/mcp`):

```json
{ "mcpServers": { "c2n": { "type": "stdio", "command": "npx", "args": ["-y", "@c2n/mcp"] } } }
```

Any stdio MCP client works the same way (`npx -y @c2n/mcp`). Run the server from a project directory: it reports which `@c2n/*` packages are installed and serves the API of the installed version when it differs.

The Claude Code plugin `@c2n/skill` bundles this server together with a skill that teaches the workflow.

## Tools

| Tool                 | Purpose                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------- |
| `list_components`    | Every component with tag, package, category, description, installed version             |
| `search_components`  | Free-text search across names, descriptions, attributes, slots, events, examples, icons |
| `get_component`      | Full API of one component, CSS variables grouped by part/state with their theme token   |
| `get_examples`       | Usage rows and gallery variants (markup + the CSS behind each look), paginated          |
| `get_presets`        | Curated presets as CSS variable values                                                  |
| `get_theme`          | The `--c2-theme--*` tokens, install/mapping snippets; per-component mapping with `tag`  |
| `generate_variant`   | CSS class / HTML + style / Lit subclass / JSON from variable + attribute overrides      |
| `get_workflow_guide` | `workflow`, `theming`, `variant-components`, `frameworks`                               |

Resources: `c2n://components`, `c2n://components/{tag}`, `c2n://theme`, `c2n://guide/{topic}`.

## Development

- `npm run build:tools` (repo root) regenerates `data/registry.json` from the component manifests, the docs content, the presets and the theme, then compiles `dist/`.
- `npm run smoke -w packages/tools/mcp` spawns the server over stdio and checks every tool.
- `npm run inspect -w packages/tools/mcp` opens the MCP Inspector against the source entry (`node src/cli.ts`, Node 24 type stripping).
