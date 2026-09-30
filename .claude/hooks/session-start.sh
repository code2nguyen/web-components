#!/bin/bash
# Prepares a Claude Code on the web container: installs the workspaces and builds the `@c2n/mcp` registry, so the
# `c2n` server in `.mcp.json` (`node packages/tools/mcp/src/cli.ts`) can start. A fresh clone has neither
# `node_modules` nor the gitignored `packages/tools/mcp/data/registry.json`, and the server exits without them.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# `npm install` rather than `npm ci`: it reuses the cached container's node_modules instead of deleting them.
# Every step writes to stderr: a SessionStart hook's stdout is added to the session's context.
npm install --no-audit --no-fund >&2

# The container ships one Chromium outside Playwright's cache, usually not the revision this repo's Playwright pins.
# `playwright.config.ts` and `apps/ui/scripts/gallery-shots.mjs` launch `CHROMIUM_PATH` when it is set.
if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export CHROMIUM_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi

# Wireit caches every step, so on a resumed container this only rebuilds what changed.
npm run build:registry -w packages/tools/mcp >&2
