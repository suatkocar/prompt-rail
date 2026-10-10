#!/bin/sh
# Required local checks. The optional sibling integration has explicit inputs.
set -eu
cd "$(CDPATH='' cd "$(dirname "$0")/.." && pwd -P)"

types=plugins/prompt-rail/.claude-plugin/types
if [ ! -f "$types/tsconfig.json" ]; then
    main=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
    if [ -f "$main/$types/tsconfig.json" ]; then
        cp -R "$main/$types" "$types"
    else
        echo 'Missing SDK types: first load this checkout with claude --plugin-dir plugins/prompt-rail' >&2
        exit 1
    fi
fi

claude plugin validate . --strict
claude plugin validate plugins/prompt-rail --strict
npm run typecheck
npm test
npm run test:navigation
npm run test:archive
npm run test:transcripts
if [ -n "${INBOX_DIR:-}" ] && [ -n "${IMAGE_VIEW_DIR:-}" ]; then
    npm run test:integration
fi
git diff --check
