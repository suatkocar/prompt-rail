# Validation and upstream review

Date: 2026-10-10. Local environment: macOS arm64, Claude Code 2.1.296.

## Changes

- A successful jump no longer replaces real viewport observations with a synthetic target row. This fixes the reproduced case where unchanged whole rows disappear from the reading indicator after the next turn.
- Prompt Rail composes its `AbovePrompt` content with the downstream tree. A companion fix in the Inbox fork does the same for its status, working, return and stopped states. Image View already composed the downstream tree and needs no change.
- Test fixtures now return valid void results, declare command presentation/origin, provide the host's empty prompt band, and mock required clocks. Hook and test code both pass the generated SDK type check.
- Version 0.7.2 uses the personal marketplace `suatkocar-prompt-rail`. Original authorship and the MIT license are retained.

## Observed checks

| Check | Result |
| --- | --- |
| Original upstream test baseline | 106 passed, 4 failed in host fixtures |
| `claude plugin test plugins/prompt-rail` after fixes | 113 passed, 0 failed |
| `npm run typecheck` | Passed with the locally generated SDK declarations |
| Navigation against the actual compiled hook module | 5 passed: command/click jumps, next-turn tracking, departing target, far-jump viewport reports and refused scroll |
| Three actual hook modules, all six registration orders | 6 passed: startup, idle/working/survey/stop/return/empty states, mode changes, jump target, image expansion/close/open/remove |
| Actual synthetic transcript through a real `tail` child | Passed initial reading, incremental appends, incomplete lines, Unicode, unchanged-file reuse, larger replacement, truncation, retries and process termination |
| Inbox `./scripts/check.sh` | Formatting, manifest, types, Claude tests, Codex bundles/types/tests passed |
| [GitHub Actions on Ubuntu / Node 22](https://github.com/suatkocar/prompt-rail/actions/runs/38013860645) | Passed with Claude Code 2.1.296: validation, 113 plugin tests, 5 navigation tests, real transcript reading and 6 integration orders |

The measured transcript was **67,422,799 bytes**, with 1,024 prompts and bulky tool/image records. One local run took **2,006 ms** for the initial read and **7 ms** for the next append. These are single-run fixture measurements, not general performance guarantees. The retained prompt labels occupied 52,053 serialized characters; this is not a process-memory measurement. The assertions separately verify that retained rows omit bulky tool/image payloads.

Before the production fix, all three new jump-regression cases failed, as did the horizontal/vertical composition checks and Inbox's downstream-band check. The new hook harness isolates engine boundaries; it does not replace the official test kit. No real model calls, personal transcripts or clipboard contents were used.

## Upstream findings and maintenance

Reviewed baseline: upstream `2ac50fb87fc426fed89ba0f09f1784ef6f289ae8` (0.7.1).

- [Issue #53](https://github.com/oikon48/prompt-rail/issues/53) reports a stuck position marker after jumping. The new tests cover the reproduced viewport-state failure; physical terminal behavior still needs a live check.
- [Issue #57](https://github.com/oikon48/prompt-rail/issues/57) reports large-file reading trouble. Four MiB is the host's single-file-read cap, not a transcript-size limit: the existing reader streams larger files with `tail`. The real-file test verifies that macOS path. Windows without `tail` remains unsupported by this fallback.
- There were no open upstream pull requests at the initial review. Fetch and review later changes before merging them into this fork.

Keep `origin` on the personal fork and `upstream` on the original repository. The CI workflow rechecks navigation, actual transcript reading and composition against the current Inbox and Image View forks. Local type checking additionally uses the declarations emitted by the installed Claude Code build.

## Installation verification

Version 0.7.2 was installed and enabled at user scope from the local directory marketplace, with `mode=horizontal`. `claude plugin list --json` resolved `readFromFolder` to the canonical checkout's `plugins/prompt-rail` directory. Its installed hook hash matched the tested checkout.

The compatible Inbox commit is `be0e0e09051183ca79e0f29fe028f7813aba777d`; its installed copy was updated and matched the canonical hook hash. Image View remained at `f913d484195f997472ba018a3fcde20b5b9dfc45` (0.3.1). Both changed repositories were pushed to their personal forks and their remote main commits matched locally.

Activation metadata was backed up before the CLI commands. A semantic comparison found only the new Prompt Rail marketplace, enabled entry and mode option, plus the new Prompt Rail and updated Inbox install records. Unrelated settings were unchanged. The previous trial path remains a compatibility symlink, and its pre-existing local TypeScript configuration retained the same SHA-256.

The CLI reports that existing sessions need a restart to apply the Inbox update. Fresh sessions use the globally enabled plugins without an extra `--plugin-dir` argument.

## Limits

The integration harness loads and executes the real hook modules, but its UI tree, state store, timers and engine actions are adapters. It proves content composition and requested action targets, not terminal painting, hit testing, host element ownership or scroll geometry. The official plugin tests cover each plugin's own dispatch path. A combined native-host check remains a manual step.

The computer-use tool previously refused access to Ghostty. That restriction was not bypassed, and no physical click is claimed here. After reloading plugins or starting a fresh session, check that a rail click scrolls to the intended prompt while Inbox and image controls remain usable. In a short terminal or with an expanded image, the combined `AbovePrompt` content can exceed `maxRows`; Claude Code then provides its normal band scroll window.
