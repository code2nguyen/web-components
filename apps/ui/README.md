# @c2n/ui

The Astro documentation application for c2n components. It publishes component docs, galleries, API manifests, icon sets and long-form guides.

## Development

From the repository root:

```bash
pnpm run ui       # build packages, then start Astro
pnpm run ui:dev   # start Astro using existing package builds
pnpm run ui:build # build packages and the static site
```

## AI tooling documentation

The public setup guide for `@c2n/skill` and `@c2n/mcp` is `src/content/guides/ai-tools.mdx`. Guide files are discovered automatically by the `guides` content collection and appear in the Guides sidebar and search palette according to their frontmatter `order`.

Keep user-facing installation and usage instructions in that guide. Keep package-specific CLI and development details in `packages/tools/skill/README.md` and `packages/tools/mcp/README.md`.
