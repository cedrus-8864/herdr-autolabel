# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A [herdr](https://herdr.dev) plugin (herdr = terminal multiplexer for AI agents). herdr invokes
`bun sync-labels.js` on subscribed events; the script renames agent panes and tabs to the agent's
live topic. No build step, no dependencies, no `package.json` — just bun + node stdlib.

## Commands

```sh
bun test                                        # all tests
bun test -t "a name the user chose"             # single test by name

herdr plugin action invoke cedrus.autolabel.sync    # manual sync (the correct way to run it)
herdr plugin log list --plugin cedrus.autolabel --limit 5
herdr server reload-config                      # REQUIRED after editing herdr-plugin.toml
herdr plugin link ~/repos/herdr-autolabel       # install for local dev
herdr plugin config-dir cedrus.autolabel        # where config.toml goes
```

**Never test by running `bun sync-labels.js` directly.** herdr supplies `HERDR_PLUGIN_CONFIG_DIR`
and `HERDR_PLUGIN_STATE_DIR`; without them the run silently falls back to default formats and a
`/tmp` state file, and relabels every tab in the session. Use the action invoke.

## Architecture

`sync-labels.js` is a **one-shot script, not a daemon**. Every event spawns a fresh process that
re-reads the whole world (`herdr pane list`, `herdr tab list` as JSON via `spawnSync`), diffs, writes,
exits. There is no in-memory state between runs — only the JSON state file.

Three interlocking mechanisms make that safe; changing any one of them can break the others:

1. **No feedback loop.** `herdr-plugin.toml` deliberately does not subscribe to `*.renamed` events.
   Adding one would make the plugin's own writes re-trigger it.
2. **Change gating.** `pane list` / `tab list` report the *live* label, and `rename` is only called
   when the computed label differs. Keeps the event storm cheap.
3. **Ownership state** (`$HERDR_PLUGIN_STATE_DIR/autolabel-state.json`). Records which labels this
   plugin wrote, so a label the user set by hand is never overwritten or cleared on revert. herdr
   exposes no provenance for a label, so this file is the only way to tell "mine" from "theirs".

**Revert asymmetry** — the subtlest part of the code. When an agent exits:
- a *pane* goes back to herdr's default via `pane rename --clear`;
- a *tab* has no `--clear`, so the plugin restores the label it captured before its first rename.
  If that captured label was a bare number (herdr's positional default) it is re-derived from the
  tab's *current* position, since tabs may have moved since. That is `restoreTabLabel()`, the one
  pure function and the only thing under test.

Other constraints worth knowing before changing behavior:
- Only panes with `p.agent` set are considered; plain shells are never a topic source, so a tab is
  never named after a shell prompt.
- herdr 0.7.5 **rejects** `pane.updated` / `pane.output_changed` as plugin events (`herdr plugin list`
  reports "unknown event"). A topic change without an idle↔working flip therefore has no hook and
  lands on the next focus / agent-status event. Don't "fix" this by subscribing to them.
- Config is read by `parseFlatToml()`, a ~10-line flat `key = value` reader — not a TOML library.
  Keep the config schema flat. New keys need a default in `DEFAULTS`, coercion in `loadConfig()`,
  docs in `examples/default-config.toml`, and a row in the README table.
- Format tokens are substituted by `applyFormat()`; unknown `{tokens}` are left literal. Truncation
  (`cap()`) runs *after* formatting and counts code points, not UTF-16 units.

## Repo conventions

- README documents where herdr's built-in config already covers what the plugin does (sidebar rows,
  pane borders) — only the tab bar has no native equivalent. Keep that section honest if scope shifts.
- Conventional commits (`feat(panes):`, `fix(tabs):`, `docs:`).
