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

| Tool                 | Purpose                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `list_components`    | Every component with tag, package, category, description, installed version                             |
| `search_components`  | Free-text search across names, descriptions, attributes, slots, events, examples, icons                 |
| `get_component`      | Full API of one component, CSS variables grouped by part/state with their theme token                   |
| `get_examples`       | Usage rows and gallery cards; `view: "index"` lists every look (summary, screenshot)                    |
| `search_examples`    | Find a look across every component's gallery ("glass", "pill", "underline")                             |
| `get_presets`        | Curated presets as CSS variable values                                                                  |
| `get_theme`          | The `--c2-theme--*` tokens, install/mapping snippets; per-component mapping with `tag`                  |
| `generate_variant`   | CSS class / HTML + style / Lit subclass / JSON from overrides, a preset or a gallery card               |
| `validate_markup`    | Checks markup/CSS you wrote: native controls to replace, unknown tags/attributes/slots/events/variables |
| `get_workflow_guide` | `workflow`, `theming`, `variant-components`, `frameworks`                                               |

Gallery cards are served with a generated summary of what they change and CSS whose colours follow the `--c2-theme--*` tokens wherever a literal equals a token's value (`var(--c2-theme--color-outline, #d4d4d8)`), so a copied card follows the application's theme and dark mode. Each card also links light and dark PNG captures hosted with the docs site (`gallery-shots/<component>/<slug>.<theme>.png`, written by `apps/ui/scripts/gallery-shots.mjs` in the Pages deploy).

## Validate from the command line

`validate_markup` is also a CLI, for CI and editor hooks. It reads HTML, JSX/TSX, Vue, Svelte, Astro, Angular and Lit templates and CSS, and checks them against the API of the `@c2n/*` packages the project has installed:

```bash
npx -y @c2n/mcp validate src            # exit 1 on errors
npx -y @c2n/mcp validate src --strict   # warnings fail too (native controls, box styling on a c2 host)
npx -y @c2n/mcp validate --hook         # Claude Code PostToolUse hook: reads the payload on stdin
```

It reports native `<button>`/`<input>`/`<select>`/`<textarea>`/`<dialog>`/`<details>`/`<progress>` elements that a `c2-*` element replaces, unknown `c2-*` tags, attributes, slots and `--c2-*` variables (with "did you mean"), events a `c2-*` element does not fire (with its event list), a static camelCase attribute the element ignores (`rowKey` for `row-key`), and box styling on a `c2-*` host (`border`, `padding`, `background`, `box-shadow`, `outline`; a radius alone is fine). A line holding `c2n-ignore`, or the line after a comment holding it, is skipped. In hook mode the findings go to stderr with exit code 2, which Claude Code hands back to the agent; `npx -y @c2n/skill install` registers that hook in `.claude/settings.json`.

Resources: `c2n://components`, `c2n://components/{tag}`, `c2n://theme`, `c2n://guide/{topic}`.

## Development

- `data/registry.json` is an ignored build artifact. `npm run build:tools` (repo root) regenerates it from the component manifests, docs content, presets and theme, then compiles `dist/` and refreshes the committed skill fallback.
- `dev`, `inspect`, `smoke` and `npm pack` automatically build the registry when needed.
- `npm run smoke -w packages/tools/mcp` spawns the server over stdio and checks every tool.
- `npm run inspect -w packages/tools/mcp` opens the MCP Inspector against the source entry (`node src/cli.ts`, Node 24 type stripping).
