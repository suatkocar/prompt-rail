<div align="center">

# prompt-rail

A rail of your prompts for Claude Code. Hover to read one, click to jump back to it.

![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-D97757)
![Claude Code 2.1.280+](https://img.shields.io/badge/Claude%20Code-2.1.280%2B-555)
![Function hooks](https://img.shields.io/badge/function%20hooks-experimental-orange)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)

<img src="docs/demo.gif" alt="prompt-rail demo: hovering the rail previews a prompt and its turn, clicking jumps the transcript to it" width="800">

</div>

## Personal fork

Based on [oikon48/prompt-rail](https://github.com/oikon48/prompt-rail). Version 0.7.2 preserves observed viewport rows across jumps and composes the prompt band with other mods instead of replacing it. Inbox also needs its shared-band compatibility fix; [validation and upstream notes](docs/validation.md) record the tested combination.

## Quick start

1. Turn on function hooks (early access, Claude Code 2.1.280+) in `~/.claude/settings.json`:

   ```json
   { "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
   ```

2. Install, from your shell or inside a session:

   ```bash
   claude plugin marketplace add suatkocar/prompt-rail
   claude plugin install prompt-rail@suatkocar-prompt-rail
   ```

   ```
   /plugin marketplace add suatkocar/prompt-rail
   /plugin install prompt-rail@suatkocar-prompt-rail
   ```

3. Start a new session. The rail opens on its own.

Mouse works best with `"tui": "fullscreen"`.

## Two layouts

### Horizontal, above the prompt (default)

<img src="docs/horizontal.png" alt="The horizontal rail: a text line with the hovered prompt and its turn summary over a row of bars" width="800">

### Vertical, beside the transcript

<img src="docs/vertical.png" alt="The vertical rail: one row per prompt in a pane beside the transcript, the prompt being read marked with a thick tick" width="480">

## Commands

| Command | |
| --- | --- |
| `/prompt-rail horizontal` | Bars above the prompt input |
| `/prompt-rail vertical` | A pane beside the transcript |
| `/prompt-rail off` | Hide the rail |
| `/prompt-rail next` | Jump to the next prompt |
| `/prompt-rail prev` | Jump to the previous prompt |
| `/prompt-rail first`, `last` | Jump to the first or the newest prompt |
| `/prompt-rail 12`, `#12` | Jump to prompt #12 |
| `/prompt-rail find <words>` | Jump to the newest prompt that holds the words |
| `/prompt-rail-next`, `/prompt-rail-prev` | Jump to the next or previous prompt, with no argument, for a keybinding |
| `/prompt-rail` | Reopen the rail in the current layout |

The layout is also the "Rail mode" row in `/config`, and it is kept across sessions.

### Keyboard

Bind the step commands in `~/.claude/keybindings.json`; they run mid-turn too:

```json
{
  "bindings": [
    { "context": "Chat", "bindings": { "ctrl+k": "command:prompt-rail-prev", "meta+j": "command:prompt-rail-next" } }
  ]
}
```

In the horizontal layout, `ctrl+x tab` moves the focus to the bars: the ring starts on the prompt you are reading, `←` `→` move it across the bars on screen and show its prompt, `Enter` jumps there, `Esc` returns to the prompt input.

## Tick legend

| Tick | Meaning |
| --- | --- |
| `━` `┃` | The prompt you are reading |
| `─` `│` | Any other prompt |
| `┄` `┆` | A prompt Claude Code refused to scroll to; `next` and `prev` skip it |

## How it works

<details>
<summary>From the transcript file to the rail</summary>

```mermaid
flowchart LR
  T[transcript .jsonl] -->|every prompt on the live branch| R[rail]
  S[rows on screen] -->|topmost row's prompt| R
  R -->|click, next/prev| J[scroll that prompt's row into view]
```

The rail lists the prompts of the live branch, so prompts abandoned with `/rewind` drop out, and prompts from before a resume are listed too. The prompt you are reading owns the topmost row on screen. The transcript is read again only when its size or time changed.

</details>

## Limitations

<details>
<summary>Known limits</summary>

- Function hooks are early access, and their API may change between Claude Code releases.
- The hover card with the turn summary is part of the horizontal rail.
- The Claude desktop app draws the horizontal rail and its hover cards, but a click cannot jump there. The app gives a plugin no way to scroll its transcript, so the rail says so once a session. The prompt being read is named beside the bars rather than on the line above them, since the app paints a card over that line without hiding what is under it. Checked with Claude Code 2.1.280, the app did not draw the vertical pane.
- The dock width is shared by all plugin panes; drag its edge to narrow it, down to 24 columns.
- A `/compact` command's own row cannot be jumped to; its tick turns dotted after the first try.
- Near the end of the transcript, `next` cannot scroll further.

</details>

## Development

```bash
claude --plugin-dir plugins/prompt-rail        # load this checkout; saving reloads it
npm ci
npm run check
```

An interactive session loading this checkout generates the SDK declarations in `plugins/prompt-rail/.claude-plugin/types/`. The root TypeScript configuration extends that generated configuration; the declarations stay untracked. The check script can copy them from the canonical checkout when running in a worktree. It fails explicitly if they are missing.

`npm run check` validates the marketplace and plugin, type-checks the hook and test code, runs the Claude Code test suite, tests jump routing against real hooks with deterministic engine boundaries, and reads actual synthetic large transcript files through `tail`. The latter requires macOS or Linux.

To exercise the actual Inbox and Image View modules in all six load orders:

```sh
INBOX_DIR=/path/to/inbox IMAGE_VIEW_DIR=/path/to/claude-image-view npm run test:integration
```

This check uses synthetic state and no model calls, personal transcripts or real application actions. It verifies hook composition and action routing, not terminal painting or physical mouse hit testing. A combined band taller than Claude Code's `maxRows` uses the host's built-in scroll window, including when an image preview is expanded.

Keep `origin` on the personal fork and `upstream` on the original repository. Fetch and review upstream changes and issues before merging; do not replace the working fork blindly. Bump the plugin version for each release so installed cache copies can update.

## License

[MIT](LICENSE)
