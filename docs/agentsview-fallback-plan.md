# AgentsView fallback implementation plan

## Design

Keep every prompt in the rail. An explicit click or numbered/find command tries
the native transcript scroll first. Only `nothing drawn` can fall back to the
local AgentsView archive; transient scroll refusals keep their existing behavior.
Next/previous keyboard stepping remains terminal-only so holding a shortcut
cannot open browser tabs. The terminal reading marker changes only after a
successful terminal jump.

Resolve the current session with the installed `agentsview` CLI, preserving its
returned local `web_url` and dynamic port. Read user-message pages on demand,
match the full source UUID or the transcript timestamp and normalized full text,
and reject ambiguous matches. When a timestamp is missing, allow a sufficiently
long full text only when unique in both session indexes. Known timestamp
conflicts never use that fallback. Retain the entry timestamp when indexing the
transcript. Never fall back to a same-text message from another session.

Append the verified `msg` ordinal query parameter to the returned URL. Chrome
also receives a short, unique text fragment when one can be verified against a
complete user-message scan: the installed viewer can select the correct ordinal
but leave it above the viewport after measuring variable-height rows. A live
comparison reproduced that drift and verified the text fragment brings the
selected message into view. Fragment text stays in browser history; it is not
sent to the local server. No external service or model is involved.

Bound CLI time, page count and accumulated output; report missing, stale,
ambiguous and unavailable archives clearly. Coalesce repeated clicks, suppress
stale completions after a newer click or conversation change, and use argument
vectors without a shell. A configuration switch disables the fallback. Chrome
is the macOS browser used for this personal fork; absence is reported.

## Execution

The main agent executes this plan inline using the executing-plans workflow.
Work stays in an isolated worktree until verification, then follows the existing
personal-fork and user-scoped installation pattern.

- [x] Add a failing real-hook regression for a missing terminal row opening the
  matching archived message, while preserving the real reading marker.
- [x] Implement the bounded CLI resolver in `hooks/agentsview.ts` and share the
  navigation handler between explicit clicks and direct commands.
- [x] Cover legacy timestamps, duplicate text, malformed URLs, ordinal gaps,
  stale reads, failures, disabled fallback, successful native jumps, and rapid
  clicks in deterministic tests.
- [x] Run the required plugin, type, navigation, large-transcript and six-order
  integration checks. Verify the real resolver against the supplied session and
  inspect the target in Chrome without changing the archive.
  The real resolver matched a current source prompt. The earlier ordinal-link
  experiment displayed its selected message with a text fragment. The final
  fresh-browser check stayed on the viewer's loading screen, both with and
  without a text fragment; final painting is not claimed as verified.
- [x] Document results and limits, bump the plugin version, commit, push the
  personal fork, update the global installation and verify its source/version.
