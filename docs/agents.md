# Connecting agents

Two pieces: the MCP server, which provides the read/write tools, and — for Codex and OpenCode — a
hook that loads the memory index into each new session. Installation is in the
[README](../README.md#install).

## Client configuration

### Codex (CLI and ChatGPT desktop)

Register the server in `~/.codex/config.toml`:

```toml
[mcp_servers.memgrove]
command = "memgrove"
args = ["mcp"]
```

Then install the index hook:

```bash
memgrove hooks install codex
```

Codex does not run a user hook until it is reviewed and trusted. Open `/hooks` in the CLI (or
**Settings > Hooks** in the desktop app) and trust the memgrove entry once. Until then the hook is
skipped and the index does not arrive.

The installer merges into `$CODEX_HOME/hooks.json` (`~/.codex/hooks.json` by default) and writes the
launcher `memgrove_hook.py` beside it. It replaces an earlier memgrove entry instead of adding a
second one, and leaves every other hook alone. If `config.toml` already declares `[hooks]` inline,
Codex loads both sources and warns at startup; keep the hooks in one place.

### OpenCode

Register the server in `~/.config/opencode/opencode.json`:

```json
{ "mcp": { "servers": { "memgrove": { "type": "local", "command": ["memgrove", "mcp"] } } } }
```

Then install the plugin:

```bash
memgrove hooks install opencode
```

This writes `index.js` and a generated `hook.py` launcher under
`~/.config/opencode/plugins/memgrove/`. OpenCode discovers plugin directories under its global
config directory itself, so `opencode.json` is not edited — it may be JSONC, and preserving its
comments matters. The plugin adds the index to the session's system context on each model request
and refreshes it on every prompt, so a note written during the session (or by another agent)
appears without a manual `memgrove_index` call, and a compaction that drops it is covered by the
next request. It reads up to 16 MiB of index text; a larger index logs a warning and keeps the
previous text. The per-session cache is capped at 16 MiB and evicts older sessions silently.

### Claude Code

```bash
claude mcp add memgrove memgrove mcp --scope user
```

The same registration by hand, in `~/.claude.json` (user scope):

```json
{ "mcpServers": { "memgrove": { "command": "memgrove", "args": ["mcp"] } } }
```

Also set `"autoMemoryEnabled": false` in `~/.claude/settings.json`, or its native memory keeps
writing a separate store ([why](design.md#9-integration-with-agents)). Claude Code has no index hook
in this release; its MCP tools still read and write the store.

### DSH

`~/.dsh/cordis.patch.yml` (rewrite the file live, no restart needed):

```yaml
- insert:
    - id: mcp-memgrove
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: memgrove
        transport: stdio
        command: memgrove
        args: ['mcp']
```

DSH has no index hook in this release.

## Hooks

Both hooks call back into the same CLI entry points, so index rendering and every store rule stay
in one place:

| Client | Installed by | Runtime |
|---|---|---|
| Codex | `memgrove hooks install codex` | the generated `memgrove_hook.py` calls `memgrove hooks run codex` from a `SessionStart` command hook |
| OpenCode | `memgrove hooks install opencode` | the plugin calls the generated `hook.py`, which runs `memgrove hooks run context --cwd …` |

`memgrove hooks run context` prints the index plus the short read/write contract.
`memgrove hooks run codex` reads the Codex event JSON on stdin and prints
`hookSpecificOutput.additionalContext`. The Codex matcher covers `startup`, `resume`, `clear`,
`compact`, and `fork`, so the index is restored after a compaction.

The installer writes a tiny launcher next to the hook and stores the absolute interpreter plus that
launcher, so a GUI client that starts a hook with a minimal PATH still reaches the same code; it
works both from an installed tool and from a checkout run through `bin/memgrove`. The launcher
checks that its package is still there and exits with a clear message instead of importing another
`memgrove`. Run the installer again after moving the checkout or the installation. Codex records
trust against the hook definition, not the launcher's contents, so if only the launcher changed it
may not ask again; review the hook in `/hooks` after a reinstall if you want to re-approve it.
`memgrove hooks install … --dry-run` reports what would change without writing. To remove a hook,
delete the memgrove entry and its generated launcher from the client's directory; there is no
uninstall command yet.

## The instructions contract

The MCP `instructions` field carries the usage contract — the two scopes, the four types, what not
to save, and the required argument names — because that is what the field is for. It does not ask
the model to call `memgrove_index` at session start. A client that defers MCP tools (Codex does) can
hide the instructions until the model searches, so the hook, not the text, is the reliable path.

The tool descriptions repeat the required argument names, because a client can surface a
description without the full input schema; the schema stays the authority and still refuses a name
outside it.

## Choosing the project

`cwd` exists for clients that run one server for several projects (DSH does); a per-project client
can omit it and the server uses its own working directory. `MEMGROVE_PROJECT_CWD` sets that
fallback for a client that cannot pass `cwd` at all. The Codex hook reads the session cwd from the
event, and the OpenCode plugin reads the session's location directory, so both load the right
project scope.

## An agent without an MCP client

Write the manual connection guide into the store and hand it to the agent:

```bash
mkdir -p ~/.agents/memgrove
memgrove protocol > ~/.agents/memgrove/PROTOCOL.md
```

The file ships inside the package, so `memgrove protocol` also works from a PyPI install with no
checkout. It is not shown automatically: the MCP `instructions` are the onboarding path, the
server never exposes it as a tool or a resource, and the protocol file is only for an agent that
has to connect by hand. The store itself is created on the first write at `~/.agents/memgrove`.
