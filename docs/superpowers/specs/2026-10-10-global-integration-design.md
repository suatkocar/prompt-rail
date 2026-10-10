# Prompt Rail Global Integration

The user approved fixing, testing, forking, relocating, publishing and globally enabling Prompt Rail after the source review. This document records that approved scope; no additional approval gate is needed.

## Behavior

- Keep horizontal navigation as the default. Clicking a bar, Enter on a focused bar, and numbered/search commands must request a scroll to the corresponding message in the same conversation.
- Preserve real viewport reports across a jump. A temporary jump highlight must not erase still-visible messages or introduce a synthetic row that survives the next turn.
- Preserve other plugins' AbovePrompt content. Prompt Rail, Inbox and Image View must render together regardless of hook ordering, preserve element ownership and continue yielding to surveys.
- Keep model calls, transcript contents, credentials and user-specific absolute paths out of added diagnostics and committed artifacts.
- Validate large transcript reading using actual files and child processes, including incremental reads, Unicode, partial lines, rewrites and reader failure recovery. Do not infer large-file performance from mocked reads alone.

## Delivery

The canonical repository lives alongside the user's other accepted mods. Its old path remains a compatibility symlink for the existing trial. Origin is the user's fork and upstream remains the original repository. Work occurs in isolated worktrees until verification, then merges into each fork's main branch.

Global installation uses the existing user-level local-marketplace pattern with a backup of every changed configuration file. Verify enabled state and the effective source path; do not disable unrelated plugins or close the Prompt Rail trial session.

## Verification limits

Use the installed Claude Code plugin test runtime, TypeScript checks and plugin validation, plus real-process transcript tests. Test the actual three plugin modules together in an isolated test fixture. No live model call is necessary. GUI access restrictions must be reported rather than bypassed or treated as proof of a physical click.
