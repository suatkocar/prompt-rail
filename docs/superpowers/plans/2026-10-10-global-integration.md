# Prompt Rail Global Integration Implementation Plan

> Execute inline using the executing-plans workflow. The user requested main-agent work; do not delegate.

**Goal:** Deliver and globally enable the user's Prompt Rail fork with reliable navigation and shared prompt-band rendering.

**Architecture:** Preserve actual viewport observations instead of replacing them with a synthetic jump row. Compose each plugin's own AbovePrompt tree with `await next(e)`. Keep the transcript reader's incremental path and verify it against actual synthetic JSONL files.

**Tech Stack:** TypeScript/TSX, Claude Code function hooks and test kit, Node.js, macOS tail, Git/GitHub CLI.

## Constraints

- No model calls in tests; all fixtures contain synthetic data.
- Preserve the existing untracked plugin tsconfig and all other working changes.
- Main worktree and configuration updates follow successful isolated verification.
- Keep upstream attribution, compatibility paths and rollback records.

## Tasks

- [x] Inspect both repositories and back up installation metadata; move the canonical Prompt Rail checkout and preserve the old path with a symlink.
- [x] Create the user's GitHub fork and isolated worktrees for Prompt Rail and the Inbox compatibility fix.
- [x] Reproduce the four existing test harness failures; make void hooks return valid results and mock required timers without changing product behavior.
- [x] Add failing tests for a jump followed by a new turn, unchanged whole rows, a departing target and subsequent viewport movement. Remove synthetic viewport state, retain actual reports and verify the full suite.
- [x] Add failing composition tests for horizontal/vertical/off/survey rendering, preserving another plugin's content and press routing. Compose Prompt Rail and Inbox with downstream trees, then run each repository's required checks.
- [x] Add an isolated integration fixture using the real Prompt Rail, Inbox and Image View hooks in both load orders; exercise image controls and a prompt jump without a model call.
- [x] Run real-file transcript checks for large initial reads, incremental appends, Unicode boundaries, incomplete records, rewrites and retries. Record measured size/timing and distinguish them from live terminal rendering.
- [ ] Update fork metadata, version, development checks and validation documentation. Review diffs, run final checks and commit the verified changes.
- [ ] Merge and push the verified commits to the user's forks; register the local marketplace and globally enable Prompt Rail. Update Inbox's installed source as needed and verify effective paths plus unchanged unrelated settings.
- [ ] Report the installed version, fork/path, checks and any remaining physical UI verification limit.
