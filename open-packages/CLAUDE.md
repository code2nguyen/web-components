# Open packages

Guidance for `open-packages/*`. Claude Code loads this file when it works in this directory; the repo-wide rules are in the root `CLAUDE.md`. Paths are relative to the repository root.

`open-packages/*` — same structure, but MIT-licensed / "open" components (currently `chatbot`). Composed of `packages/components/*` components. Note these sit one directory _shallower_ than the component packages, so every repo-relative path in them (wireit deps, the cem plugin import) differs by one `../` level.

Components here follow every rule in `packages/components/CLAUDE.md` (foundation, theming, conventions, modern web platform). That file is not loaded automatically from this directory: read it before changing a component here.
