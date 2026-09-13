# @c2n/mcp

[Model Context Protocol](https://modelcontextprotocol.io) server that exposes the c2n web components to AI agents: component APIs (attributes, slots, events, native CSS parts, CSS variables with their theme tokens), usage and gallery examples, curated presets, the `@c2n/theme` tokens, variant code generation and the application workflow guides. Everything is bundled in `data/registry.json`, so it works offline in any project.

## Use

The server uses stdio and can be launched by any MCP host:

```bash
npx -y @c2n/mcp
```

Claude Code project `.mcp.json`:

```json
{ "mcpServers": { "c2n": { "type": "stdio", "command": "npx", "args": ["-y", "@c2n/mcp"] } } }
```

Codex project `.codex/config.toml`:

```toml
[mcp_servers.c2n]
command = "npx"
args = ["-y", "@c2n/mcp"]
```

Google Antigravity project `.agents/mcp_config.json` uses the same `mcpServers` command/args structure as the Claude example. The `@c2n/skill` package can install the skill and merge these configurations automatically.

Run the server from a project directory: it reports which `@c2n/*` packages are installed and serves the bundled API when the installed version differs. The registry is packaged locally, so tool calls do not require network access after installation.

Use `c2n-mcp --version` to inspect the installed server version and `c2n-mcp --help` for CLI usage.

The MCP server supplies structured component facts; it does not install component packages or edit an application by itself. Pair it with `@c2n/skill` when you also want the agent to follow c2n's application, theming and variant conventions. See the [AI tools guide](https://code2nguyen.github.io/web-components/guides/ai-tools) for the complete setup and example prompts.

## Verify the connection

Restart the agent after adding its MCP configuration, then ask it to use the c2n MCP server to list components or inspect `c2-button`. A connected client should expose the tools below and report `@c2n/*` packages installed in the current project. If the server cannot start, run `npx -y @c2n/mcp --version` in that project to distinguish an npm/runtime problem from an MCP client configuration problem.

## Tools

| Tool                 | Purpose                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------- |
| `list_components`    | Every component with tag, package, category, description, installed version             |
| `search_components`  | Free-text search across names, descriptions, attributes, slots, events, examples, icons |
| `get_component`      | Full API of one component, CSS variables grouped by part/state with their theme token   |
| `get_examples`       | Searchable usage/gallery markup, CSS, intent and accessibility notes, paginated         |
| `get_presets`        | Curated presets as CSS variable values                                                  |
| `get_theme`          | The `--c2-theme--*` tokens, install/mapping snippets; per-component mapping with `tag`  |
| `generate_variant`   | CSS class / HTML + style / Lit subclass / JSON from variable + attribute overrides      |
| `get_workflow_guide` | `workflow`, `theming`, `variant-components`, `frameworks`                               |

Resources: `c2n://components`, `c2n://components/{tag}`, `c2n://theme`, `c2n://guide/{topic}`.

## Development

- `data/registry.json` is an ignored build artifact. `npm run build:tools` (repo root) regenerates it from the component manifests, docs content, presets and theme, then compiles `dist/` and refreshes the committed skill fallback.
- `dev`, `inspect`, `smoke` and `npm pack` automatically build the registry when needed.
- `npm run smoke -w packages/tools/mcp` spawns the server over stdio and checks every tool.
- `npm run inspect -w packages/tools/mcp` opens the MCP Inspector against the source entry (`node src/cli.ts`, Node 24 type stripping).
