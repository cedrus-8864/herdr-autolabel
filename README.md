# Pane Topic Sync

A [herdr](https://herdr.dev) plugin that auto-names your panes and tabs after
what each agent is actually working on — no more tabs labeled `1`, `2`, `3`.

On every relevant herdr event it:

1. **Renames each agent pane** to its live topic — the `terminal_title_stripped`
   that Claude Code (and other agents) emit via the terminal title. With
   `show_agent_labels_on_pane_borders = true` in your herdr config, that topic
   shows right on the pane border.
2. **Renames each tab** to the topic of its **first pane** (top-left, reading
   order). If the first pane is a plain shell, the first *agent* pane's topic is
   used instead, so a tab is never named after a shell prompt.

Plain (non-agent) shell panes are left untouched.

## How it works

- Subscribes to `pane.*` / `tab.focused` / `workspace.focused` events (see
  `herdr-plugin.toml`). The key trigger is `pane.agent_status_changed`, which
  fires when an agent flips idle↔working — i.e. when it sets a fresh topic.
- Deliberately does **not** subscribe to `*.renamed` events, so its own renames
  can't feed back into a loop.
- Gates all writes through a state file (`$HERDR_PLUGIN_STATE_DIR/pane-topic-sync-state.json`),
  so `rename` is only called when a topic actually changed — no churn.
- "First pane" is resolved from `herdr pane layout` rect coordinates, sorted by
  `(y, x)`, so it's the visually top-left pane regardless of split order.

## Install

Local (development):

```sh
git clone <this-repo> ~/repos/herdr-pane-topic-sync
herdr plugin link ~/repos/herdr-pane-topic-sync
herdr server reload-config
```

Requires [bun](https://bun.sh) on `PATH` (herdr runs `bun sync-labels.js`).

To see topics on pane borders too, add to `~/.config/herdr/config.toml`:

```toml
[ui]
show_agent_labels_on_pane_borders = true
```

## Manual sync / debugging

```sh
herdr plugin action invoke dan.pane-topic-sync.sync
herdr plugin log list --plugin dan.pane-topic-sync --limit 5
```

## Configuration

Optional. Drop a `config.toml` in the plugin's config dir (find it with
`herdr plugin config-dir dan.pane-topic-sync`). All keys are optional; see
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

### A note on manual renames

The plugin auto-clobbers tab names on the next event, because herdr exposes no
provenance for a label (it can't tell a human-set name from a plugin-set one).
If you need a tab to keep a fixed name, either set `sync_tabs = false`, or open
an issue — a `pin_prefix` opt-out (skip labels starting with a chosen char) is
the clean way to support this without unreliable heuristics.

## License

MIT
