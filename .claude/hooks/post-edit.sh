#!/usr/bin/env bash
# PostToolUse hook after Write/Edit/MultiEdit (registered in .claude/settings.json).
#
# 1. Formats the written file with the repo's prettier, so formatting is right as the agent goes instead of at
#    commit time (lint-staged still runs). The extensions `format:check` covers; .prettierignore applies. Not .astro or
#    .scss: some of those files are not prettier-clean, and a one-line edit would reformat the whole file.
# 2. For application code checks the c2 markup with `c2n-mcp validate --hook`: an unknown tag, attribute, slot or CSS
#    variable, or a native control where a c2 element exists. Exit code 2 hands the findings back to the agent.
#    Errors only: the validator reports a whole file, and these apps carry accepted warnings (native controls the
#    `check:dogfood` ratchet governs, prose about them), so warnings would hand the agent problems unrelated to its
#    edit. `npm run check:app-markup` keeps all three trees at 0 errors.
#
# Never fails the edit for its own reasons: a missing prettier, registry or file exits 0.
set -u
payload=$(cat)
root=${CLAUDE_PROJECT_DIR:-$(pwd)}
file=$(printf '%s' "$payload" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).tool_input?.file_path??'')}catch{}})")
[ -n "$file" ] && [ -f "$file" ] || exit 0
case "$file" in "$root"/*) ;; *) exit 0 ;; esac
rel=${file#"$root"/}
cd "$root" || exit 0

case "$rel" in
  node_modules/* | */node_modules/* | */dist/*) exit 0 ;;
esac

case "$rel" in
  *.cjs | *.html | *.js | *.json | *.md | *.ts | *.tsx | *.vue)
    [ -L "$rel" ] || [ ! -x node_modules/.bin/prettier ] || node_modules/.bin/prettier --write --log-level=silent "$rel" >/dev/null 2>&1
    ;;
esac

case "$rel" in
  apps/examples/* | lab/apps/* | apps/ui/src/*)
    [ -f packages/tools/mcp/data/registry.json ] || exit 0
    printf '%s' "$payload" | node packages/tools/mcp/src/cli.ts validate --hook --errors-only
    status=$?
    # 2 is "findings for the agent"; anything else is the validator failing (an old Node, a stale registry), not the edit.
    [ "$status" -eq 2 ] && exit 2
    exit 0
    ;;
esac
exit 0
