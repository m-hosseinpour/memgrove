# memgrove

**Persistent, local-first Markdown memory for AI coding agents.**

Give Claude Code, OpenCode, DeepSeek Harness (DSH), and other
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) clients one shared store for
useful notes across projects and sessions. Notes are ordinary Markdown files in
`~/.agents/memgrove` — not a database — and the agent decides what is worth saving and reads a
note back when it is relevant.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/m-hosseinpour/memgrove/blob/main/LICENSE)
[![PyPI](https://img.shields.io/pypi/v/memgrove.svg)](https://pypi.org/project/memgrove/)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/)

- **One store, every agent:** project notes stay separate from user-wide preferences, and every
  connected client sees both.
- **Readable and portable:** inspect, edit, or back up the files with ordinary tools. There is no
  config file, no runtime state, and no database.
- **Cross-platform:** Python 3.11+, standard library only; Linux, macOS, and Windows.
- **Safer edits:** version checks refuse stale writes instead of overwriting a newer note, and a
  basic secret-pattern guard blocks common credentials before they are stored. It is not a full
  secret scanner.

> **Data note:** Notes are unencrypted local files. The tool does not sync or back them up, and
> when an agent reads a note, that text may be sent to its model provider.

## Install

Requires Python 3.11 or newer and either [uv](https://docs.astral.sh/uv/) or
[pipx](https://pipx.pypa.io/):

```bash
uv tool install memgrove      # or: pipx install memgrove
memgrove --version
```

Upgrade with `uv tool upgrade memgrove` (or `pipx upgrade memgrove`), pin a release with
`memgrove==<version>`, and run the server without installing it with
`uvx --from memgrove memgrove mcp`. Already have notes in Claude Code?
[Import them](https://github.com/m-hosseinpour/memgrove/blob/main/docs/usage.md#migrating-from-claude-code).
On Windows the same commands work in PowerShell; see
[Windows notes](https://github.com/m-hosseinpour/memgrove/blob/main/docs/windows.md).

## Connect an agent

Claude Code:

```bash
claude mcp add memgrove memgrove mcp --scope user
```

Also set `"autoMemoryEnabled": false` in `~/.claude/settings.json`; otherwise Claude Code's native
memory keeps writing a separate store.

OpenCode — `~/.config/opencode/opencode.json`:

```json
{ "mcp": { "servers": { "memgrove": { "type": "local", "command": ["memgrove", "mcp"] } } } }
```

DSH, an agent with no MCP client, and the details of how the server's usage contract reaches the
model are in [docs/agents.md](https://github.com/m-hosseinpour/memgrove/blob/main/docs/agents.md).

## Check it works

In a new session, ask the agent to remember something — "remember that this project uses pnpm" —
then, from that project directory, look at the store (`--cwd` acts on another project):

```bash
memgrove list
memgrove index
```

On the next session's first turn the agent should call `memgrove_index` and see that note. If
nothing arrives, check `memgrove --version` and the client's MCP log.

## How it works

Retrieval *is* the index. `memgrove_index` returns the whole table of contents, `memgrove_read`
loads one note, and `memgrove_write` saves one and consolidates its scope before returning: no
keyword search, no model call, and nothing injected behind the agent's back. The server does not
record conversations by itself; the agent chooses what is worth saving and when to read it back.

Each note is one Markdown file with a `name`, a one-line `description`, and one of four types
(`user`, `feedback`, `project`, `reference`), in one of two scopes: `global` for what applies
everywhere and `projects/<slug>` for one working directory. A rewrite changes only the fields you
pass, so fixing a body cannot move a note to another section of the index.

## Documentation

| Document | Contents |
|---|---|
| [docs/agents.md](https://github.com/m-hosseinpour/memgrove/blob/main/docs/agents.md) | MCP setup per client, the `instructions` contract, manual connection |
| [docs/usage.md](https://github.com/m-hosseinpour/memgrove/blob/main/docs/usage.md) | CLI reference, exit codes, consolidation, store layout, importing Claude Code notes |
| [docs/windows.md](https://github.com/m-hosseinpour/memgrove/blob/main/docs/windows.md) | Windows install and shell differences |
| [docs/design.md](https://github.com/m-hosseinpour/memgrove/blob/main/docs/design.md) | the design, the alternatives dropped, and the closed decisions |
| [docs/roadmap.md](https://github.com/m-hosseinpour/memgrove/blob/main/docs/roadmap.md) | the changelog |
| [docs/research.md](https://github.com/m-hosseinpour/memgrove/blob/main/docs/research.md) | how Claude Code and Qoder actually work |

## Development

```bash
git clone https://github.com/m-hosseinpour/memgrove.git
cd memgrove
uv tool install .                       # refresh after a pull: uv tool install --reinstall .
export MEMGROVE_ROOT=$(mktemp -d)       # the suite must not touch the real store
python3 -m unittest discover -s tests -v
```

`python -m memgrove` and `bin/memgrove` run the checkout without installing. Repository rules,
the Windows test command, and the release process are in
[AGENTS.md](https://github.com/m-hosseinpour/memgrove/blob/main/AGENTS.md).

## License

MIT — see [`LICENSE`](https://github.com/m-hosseinpour/memgrove/blob/main/LICENSE).

If memgrove is useful in your workflow, consider starring the repository to help other
developers looking for shared memory for their coding agents find it.
