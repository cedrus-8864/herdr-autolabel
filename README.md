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
`3 · my-api · claude` and its pane `my-api · Fix the parser bug`.

Plain (non-agent) shell panes are left untouched.

## How it works

- Subscribes to `pane.*` / `tab.focused` / `tab.moved` / `workspace.focused` events (see
  `herdr-plugin.toml`). The key trigger is `pane.agent_status_changed`, which
  fires when an agent flips idle↔working — i.e. when it sets a fresh topic.
- Deliberately does **not** subscribe to `*.renamed` events, so its own renames
  can't feed back into a loop.
- Only calls `rename` when a label actually changed — no churn. Tabs compare
  against the live label from `herdr tab list`; pane labels aren't in `pane list`,
  so those are remembered in a state file
  (`$HERDR_PLUGIN_STATE_DIR/autolabel-state.json`).
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
```

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
| `pane_format` | `"{topic}"` | Template; tokens `{topic}` `{agent}` `{workspace}` `{cwd}`. |

Examples: `tab_format = "{n}· {topic}"` keeps the tab switch number;
`pane_format = "{agent}: {topic}"` prefixes the agent name;
`tab_format = "{cwd} — {topic}"` prefixes the directory name (basename of the
source pane's working directory).

### Overlap with herdr's built-in config

herdr ≥ 0.7 can already surface an agent's topic in two of the three places this
plugin writes to, without any plugin. Only the **tab bar** has no config for it —
that is the plugin's real reason to exist.

| Where | herdr config | Plugin needed? |
|-------|--------------|----------------|
| Agents sidebar | `[ui.sidebar.agents] rows` — use the `terminal_title_stripped` token | No |
| Pane border | `[ui] show_agent_labels_on_pane_borders = true` | No |
| Tab bar | *(nothing)* | Yes — `sync_tabs` |

The pane case is worth a closer look: the native flag only applies *when no
manual pane name is set*, and `sync_panes` sets one. So turning `sync_panes` on
replaces herdr's always-live label with one this plugin has to keep fresh — if
the plugin stops running, the border goes stale instead of falling back. Prefer
`sync_panes = false` unless you need a `pane_format` herdr can't express (e.g.
`"{agent}: {topic}"` or a `{cwd}` prefix).

Sidebar rows have no `cwd` token, and the `tab` token drags in whatever prefix
your `tab_format` has (`{n}` is useful in the tab bar, noise in the sidebar). The
pane label sidesteps both — with `pane_format = "{cwd} · {topic}"`:

```toml
[ui.sidebar.agents]
rows = [
  ["state_icon", { token = "pane", fg = "#cdd6f4", bold = true, dim = false }],
  [{ token = "workspace", fg = "#6c7086", dim = true }, { token = "agent", fg = "#6c7086", dim = true }],
]
```

Brightness comes from `fg`; `bold`/`dim` alone won't override a token's
contextual default color.

### A note on manual renames

The plugin auto-clobbers tab names on the next event, because herdr exposes no
provenance for a label (it can't tell a human-set name from a plugin-set one).
If you need a tab to keep a fixed name, either set `sync_tabs = false`, or open
an issue — a `pin_prefix` opt-out (skip labels starting with a chosen char) is
the clean way to support this without unreliable heuristics.

## License

MIT
