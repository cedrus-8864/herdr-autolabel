# herdr-autolabel

A [herdr](https://herdr.dev) plugin that auto-names your panes and tabs after
what each agent is actually working on — no more tabs labeled `1`, `2`, `3`.

On every relevant herdr event it:

1. **Renames each agent pane** to its live topic — the `terminal_title_stripped`
   that Claude Code (and other agents) emit via the terminal title. A pane name
   shows on the pane border. (herdr can do this natively — see
   [Overlap with herdr's built-in config](#overlap-with-herdrs-built-in-config).)
2. **Renames each tab** to the topic of one of its panes — by default the
   **first** one (top-left, reading order); `tab_source = "active"` uses the pane
   you last focused in that tab instead. If the chosen pane is a plain shell, the
   first *agent* pane's topic is used, so a tab is never named after a shell
   prompt.

Both labels go through a format template, so a tab can read
`3 · my-api · claude` and its pane `▸ my-api` (the `▸` marking the focused pane).

Plain (non-agent) shell panes are left untouched.

## How it works

- Subscribes to `pane.*` / `tab.focused` / `tab.moved` / `workspace.focused` events (see
  `herdr-plugin.toml`). `pane.agent_status_changed` fires when an agent flips
  idle↔working; `pane.exited` fires when an agent session ends, so the tab can
  revert. A topic that changes *without* a status flip has no hook of its own on
  herdr 0.7.5 (`pane.updated` is rejected as a plugin event), so it's picked up
  on the next focus or agent-status event.
- When an agent session ends, the label this plugin set is reverted. A pane goes
  back to herdr's default via `pane rename --clear`. A tab has no such flag, so
  the plugin restores the label it captured before its first rename — and if
  that label was herdr's positional default (a bare number), it re-derives the
  number from the tab's *current* position, since tabs may have moved or closed
  in between.
- Deliberately does **not** subscribe to `*.renamed` events, so its own renames
  can't feed back into a loop.
- Only calls `rename` when a label actually changed — no churn. Both `tab list`
  and `pane list` report the live label, so that's what the comparison uses. The
  state file (`$HERDR_PLUGIN_STATE_DIR/autolabel-state.json`) records which
  labels are the plugin's own, so a label you set by hand is never overwritten
  or cleared. A `pane_format` using `{focus}` is the one case that writes on
  plain navigation: each focus change renames two panes (the one you left, the
  one you entered) and nothing else.
- "First pane" is resolved from `herdr pane layout` rect coordinates, sorted by
  `(y, x)`, so it's the visually top-left pane regardless of split order.

## Install

Local (development):

```sh
git clone https://github.com/cedrus-8864/herdr-autolabel ~/repos/herdr-autolabel
herdr plugin link ~/repos/herdr-autolabel
herdr server reload-config
```

Requires [bun](https://bun.sh) on `PATH` (herdr runs `bun sync-labels.js`).

## Manual sync / debugging

```sh
herdr plugin action invoke cedrus.autolabel.sync
herdr plugin log list --plugin cedrus.autolabel --limit 5
bun test
```

Invoke the action rather than running `bun sync-labels.js` by hand — herdr passes
`HERDR_PLUGIN_CONFIG_DIR`, and without it the run falls back to the default
formats and relabels every tab.

## Configuration

Optional. Drop a `config.toml` in the plugin's config dir (find it with
`herdr plugin config-dir cedrus.autolabel`). All keys are optional; see
[`examples/default-config.toml`](examples/default-config.toml) for the full
documented set. Summary:

| Key | Default | Meaning |
|-----|---------|---------|
| `sync_panes` | `true` | Rename agent panes to their topic. |
| `sync_tabs` | `true` | Rename tabs. |
| `tab_source` | `"first"` | Which pane names a multi-pane tab: `"first"` (top-left) or `"active"` (the pane you last focused *within that tab* — herdr tracks this per tab). |
| `max_label_length` | `60` | Truncate longer labels (applied after formatting). |
| `tab_format` | `"{topic}"` | Template; tokens `{topic}` `{agent}` `{workspace}` `{cwd}` `{n}` (tab switch number). |
| `pane_format` | `"{topic}"` | Template; tokens `{topic}` `{agent}` `{workspace}` `{cwd}` `{focus}`. |

Examples: `tab_format = "{n}· {topic}"` keeps the tab switch number;
`pane_format = "{agent}: {topic}"` prefixes the agent name;
`tab_format = "{cwd} — {topic}"` prefixes the directory name (basename of the
source pane's working directory).

`{focus}` expands to `▸ ` on the focused pane and to nothing everywhere else —
a text stand-in for the focus highlight herdr's agent rows don't have (see
below). It is a pane token only: a tab has no single focused pane.

### Overlap with herdr's built-in config

herdr ≥ 0.7 can already surface an agent's topic in two of the three places this
plugin writes to, without any plugin. Only the **tab bar** has no config for it —
that is the plugin's real reason to exist.

| Where | herdr config | Plugin needed? |
|-------|--------------|----------------|
| Agents sidebar | `[ui.sidebar.agents] rows` — use the `terminal_title_stripped` token | No (unless you want cwd or a focus cue — see below) |
| Pane border | `[ui] show_agent_labels_on_pane_borders = true` | No |
| Tab bar | *(nothing)* | Yes — `sync_tabs` |

The pane case is worth a closer look: the native flag only applies *when no
manual pane name is set*, and `sync_panes` sets one. So turning `sync_panes` on
replaces herdr's always-live label with one this plugin has to keep fresh — if
the plugin stops running, the border goes stale instead of falling back. Prefer
`sync_panes = false` unless you want the sidebar arrangement below, or need a
`pane_format` herdr can't express (e.g. `"{agent}: {topic}"`).

Sidebar rows have no `cwd` token, and the `tab` token drags in whatever prefix
your `tab_format` has (`{n}` is useful in the tab bar, noise in the sidebar). The
pane label sidesteps both — with `pane_format = "{focus}{cwd}"`:

```toml
[ui.sidebar.agents]
rows = [
  ["state_icon", { token = "pane", fg = "#cdd6f4", bold = true }],
  [{ token = "agent", dim = true }, { token = "terminal_title_stripped", dim = true }],
]
```

Note what that `pane_format` leaves out: the topic. Row 2 already renders
`terminal_title_stripped` for every agent, including agents in tabs you can't
see — whereas a pane border is on screen only when its pane is, right next to
the transcript it summarises. So the border carries what the sidebar can't
(cwd, focus cue) and nothing the sidebar already has.

Two sidebar limits on 0.7.5 that this arrangement works around, both worth
knowing before you try something more direct:

- **Agent rows have no focus highlight.** A token's style is `{ token, fg, bold,
  dim }` with no focused/unfocused variant, and the defaults are per-token-kind,
  not per-row-state — deleting `fg` does not reveal a contextual color, the
  focused agent's row simply renders like every other. (The spaces list *does*
  highlight its focused entry; the asymmetry is herdr's, not a config mistake.)
  Hence `{focus}`.
- **Custom tokens can't be styled.** herdr accepts `$name` tokens fed by
  `pane report-metadata --token name=…`, which would supply cwd without touching
  the pane name — but they render only as a bare string. The styled form
  `{ token = "$cwd", … }` passes `herdr config check` and then renders nothing,
  so a custom token is stuck with a dimmer default. That is the whole reason
  row 1 goes through the pane label instead.

### A note on manual renames

The plugin auto-clobbers tab names on the next event, because herdr exposes no
provenance for a label (it can't tell a human-set name from a plugin-set one).
If you need a tab to keep a fixed name, either set `sync_tabs = false`, or open
an issue — a `pin_prefix` opt-out (skip labels starting with a chosen char) is
the clean way to support this without unreliable heuristics.

## License

MIT
