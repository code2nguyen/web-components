# c2n/web-components

[![npm version](https://img.shields.io/npm/v/%40c2n%2Fcore?label=npm%20packages)](https://www.npmjs.com/org/c2n)
[![Component tests](https://github.com/code2nguyen/web-components/actions/workflows/component-tests.yml/badge.svg)](https://github.com/code2nguyen/web-components/actions/workflows/component-tests.yml)
[![npm downloads](https://img.shields.io/npm/dm/%40c2n%2Fcore?label=core%20downloads)](https://www.npmjs.com/package/@c2n/core)
[![License](https://img.shields.io/github/license/code2nguyen/web-components)](LICENSE)

A monorepo of Lit web components. Each component is released as a separate npm package, and all publishable packages share the same version.

Packages are grouped by role: `packages/components/*` (the web components), `packages/icons/*` (generated icon sets), `packages/core` (the shared runtime, published as `@c2n/core`) and `packages/tools/*` (`config`, `sass`, `playground`). npm package names stay flat, e.g. `packages/components/avatar` is published as `@c2n/avatar`.

## Development mode

Each package is a npm package and will try to limit maximum cross dependencies.

All packages have `@c2n/config` as dev dependencies and maybe link with `@c2n/core` to reuse the sharing code.

- npm workspace:
- each package uses vitejs as a build tool

### Generate empty web component

```
npm run generate
```

### UI app

The documentation / demo app lives in `apps/ui` and is a static site built with the [Astro Framework](https://astro.build/). It is the home for future app features (backend, database, …).

From root folder.

```

npm install

# Will build all web components first, then start the UI dev server

npm run ui

# Will start the UI dev server only

npm run ui:dev

```

### Develop components

```

npm run dev -w packages/components/checkbox

```

### Component tests

```bash
npx playwright install chromium # first run, or after a Playwright upgrade
npm run test:button             # focused button suite in Chromium
npm test                       # changed component suites in Chromium
npm run test:all                # Chromium, Firefox and WebKit (install all browsers first)
```

Tests use one shared Vite server and live beside their components. See [the testing guide](tests/README.md) for setup, focused runs, CI, and adding scenarios.

## Theme

`@c2n/theme` ships ~35 design tokens (`--c2-theme--*`) and a generated base theme that maps every component variable onto them. Import `@c2n/theme/theme.css` once, override a handful of tokens, done. Guide: https://code2nguyen.github.io/web-components/guides/theming

## For AI agents

- **MCP server** `@c2n/mcp`: `npx -y @c2n/mcp` (stdio) exposes component APIs, examples, presets, theme tokens and variant generation. `claude mcp add --transport stdio c2n -- npx -y @c2n/mcp`.
- **Claude Code plugin** `c2n` (skill + MCP): `/plugin marketplace add code2nguyen/web-components` then `/plugin install c2n@c2n`.

## Release

```

npm run build

npx lerna publish patch --no-private --exact --yes

# patch | major | minor | premajor | preminor | prepatch | prerelease

```
