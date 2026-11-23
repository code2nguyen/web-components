#!/bin/bash
# Prepares a Claude Code on the web container: installs the workspaces and builds the `@c2n/mcp` registry, so the
# `c2n` server in `.mcp.json` (`node packages/tools/mcp/src/cli.ts`) can start. A fresh clone has neither
# `node_modules` nor the gitignored `packages/tools/mcp/data/registry.json`, and the server exits without them.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Every step writes to stderr: a SessionStart hook's stdout is added to the session's context.
# pnpm at the version of the root `packageManager` field, through Corepack when Node ships it, else from npm.
if ! command -v pnpm >/dev/null 2>&1; then
  pnpm_version="$(node -p "require('./package.json').packageManager.split('@')[1].split('+')[0]")"
  # Corepack asks before downloading pnpm, and a hook has no TTY to answer it.
  export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  corepack enable pnpm >&2 2>/dev/null || npm install --global "pnpm@$pnpm_version" >&2
fi
# A plain install reuses the cached container's node_modules and only brings it in line with the lockfile. A container
# cached before the move to pnpm has npm's node_modules, which pnpm replaces: without a TTY it would ask first and abort.
pnpm install --config.confirmModulesPurge=false >&2

# The container ships one Chromium outside Playwright's cache, usually not the revision this repo's Playwright pins.
# `playwright.config.ts` and `apps/ui/scripts/gallery-shots.mjs` launch `CHROMIUM_PATH` when it is set.
if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export CHROMIUM_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi

# Wireit caches every step, so on a resumed container this only rebuilds what changed.
pnpm --dir packages/tools/mcp run build:registry >&2
