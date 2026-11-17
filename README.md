# memgrove

**Persistent, local-first Markdown memory for AI coding agents.**

Give Claude Code, OpenCode, DeepSeek Harness (DSH), and other
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) clients one shared store for
useful notes across projects and sessions. Memories are ordinary Markdown files on your
machine—not a database or opaque binary format—and the `memgrove` CLI and MCP server read and
write the same store.

MCP gives connected agents tools to read and write notes; it does not record every conversation
automatically. Agents choose what is worth remembering and retrieve notes when relevant.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/)

- **One memory store, multiple agents:** keep project-specific notes separate from user-wide
  preferences and share both with every connected MCP client.
- **Readable and portable:** inspect, edit, or back up the Markdown files with ordinary tools.
- **No per-agent plugin:** connect through MCP, or use the `memgrove` command directly.
- **Safer concurrent edits:** version checks refuse stale writes instead of silently overwriting
  newer notes. A basic secret-pattern guard blocks some common credentials; it is not a full
  secret scanner.
- **Lightweight and cross-platform:** Python 3.11+, standard library only; Linux, macOS, and
  Windows.

> **Data note:** Notes are unencrypted local files. The tool does not sync or back them up. When
> an agent reads a note, that text may be sent to the model provider configured for that agent.

## Install

Requires Python 3.11 or newer and either [uv](https://docs.astral.sh/uv/) or
[pipx](https://pipx.pypa.io/):

```bash
uv tool install memgrove      # or: pipx install memgrove
memgrove --version
```

One console script, no per-agent plugin. Upgrade with `uv tool upgrade memgrove` (or
`pipx upgrade memgrove`), pin a release with `memgrove==<version>`, and run the server
without installing it with `uvx --from memgrove memgrove mcp`.

For Claude Code, connect the MCP server with:

```bash
claude mcp add memgrove memgrove mcp --scope user
```

For OpenCode, DSH, and other MCP clients, use the configuration examples in [MCP](#mcp).

For an agent without an MCP client, write the manual connection guide into the store:

```bash
mkdir -p ~/.agents/memgrove
memgrove protocol > ~/.agents/memgrove/PROTOCOL.md
```

The store is created on the first write at `~/.agents/memgrove`. See
[Migrating from Claude Code](#migrating-from-claude-code) to import existing notes.

For Claude Code, also set `"autoMemoryEnabled": false` in `~/.claude/settings.json`; otherwise its
native memory continues writing separately. More detail is in [`docs/design.md`](docs/design.md)
§9–§10.

To work on the code, use a checkout and install that instead:

```bash
git clone https://github.com/m-hosseinpour/memgrove.git
cd memgrove
uv tool install .
```

After pulling an update to the checkout, refresh the installed command:

```bash
uv tool install --reinstall .
```

The checkout also runs without any install:

```bash
python -m memgrove --help    # every platform
./bin/memgrove --help        # Linux/macOS
```

```powershell
bin\memgrove.cmd --help      # Windows
```

`MEMGROVE_ROOT` points `memgrove` at a different root (used by the tests).

## How it works

**Retrieval *is* the index.** No keyword search, no model call, and nothing injected behind the
agent's back. `memgrove_index` returns the whole table of contents, `memgrove_read` loads one note,
and `memgrove_write` saves one — then consolidates the store before it returns, so there is no
queued state and no background pass.

A rewrite changes only the fields the caller passes: `name`, `description` and `type` keep their
current values when omitted, so fixing a typo in the body cannot move a note to another section
of the index. A new note defaults to the filename stem, an empty description and `project`.

## MCP

Register the server once per agent; there is nothing else to install per agent.

```json
// Claude Code: ~/.claude.json (user scope), or `claude mcp add memgrove memgrove mcp --scope user`
{ "mcpServers": { "memgrove": { "command": "memgrove", "args": ["mcp"] } } }
```

```json
// opencode: ~/.config/opencode/opencode.json
{ "mcp": { "servers": { "memgrove": { "type": "local", "command": ["memgrove", "mcp"], "enabled": true } } } }
```

```yaml
# DSH: ~/.dsh/cordis.patch.yml (rewrite the file live, no restart needed)
- insert:
    - id: mcp-memgrove
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: memgrove
        transport: stdio
        command: memgrove
        args: ['mcp']
```

Tools:

| Tool | Arguments | Returns |
|---|---|---|
| `memgrove_index` | `cwd?` | the table of contents of the global and the project store |
| `memgrove_read` | `store`, `path`, `cwd?` | body, version, modified, type, description |
| `memgrove_write` | `store`, `path`, `content`, `if_version`, `name?`, `description?`, `type?`, `cwd?` | the new version; consolidates the store first |

The server's usage contract — the two scopes, the four types, what not to save, `if_version` —
travels in the MCP `instructions` field of `initialize` / `server/discover`, which is what that
field is for. It opens with the session bootstrap: on the first user turn in the context, before
acting on it — even when the turn begins by loading a skill or reading files — call `memgrove_index`
with `cwd`; **once per conversation**, since a later user message is not a new session, and again
only after a compaction or a resume that did not carry the index, when it is no longer in context.
MCP has no channel that pushes the index into a client's context, so this contract is the
portable way to get it in front of the model without an adapter per client. No `AGENTS.md`
section is needed.

`cwd` exists for clients that run one server for several projects (DSH does); a per-project
client can omit it and the server uses its own working directory.

## Manual usage

The CLI is the same store by hand. `--scope` defaults to `project` and `--cwd` to the current
directory, so a command run inside a project needs neither:

```bash
memgrove write --path pnpm-not-npm.md --name pnpm-not-npm \
  --description "the lockfile is pnpm; npm install breaks CI" --if-version new <<'EOF'
The lockfile is pnpm. `npm install` rewrites it and breaks CI.
EOF

memgrove read --path pnpm-not-npm.md
memgrove list
memgrove index                     # the table of contents of both scopes
memgrove forget --path pnpm-not-npm.md
memgrove dream                     # a manual consolidation pass
memgrove dream --all               # every project scope
memgrove migrate --dry-run         # Claude Code notes: preview, write nothing
memgrove mcp                       # the MCP server on stdio
memgrove protocol                  # print PROTOCOL.md, the hand-wiring guide
memgrove --version
```

Pass `--cwd /path/to/project` to act on another project, and `--scope global` for the global
store.

Exit codes: `0` ok, `1` invalid input, `2` version conflict (the current content is returned so
the caller can merge), `3` content looked like a secret and was refused. `migrate` uses the same
codes for a batch: `3` if any note was refused, `1` if any note was invalid or collided with a
different existing note, `0` otherwise.

## Migrating from Claude Code

Claude Code keeps auto memory per project under
`${CLAUDE_CONFIG_DIR:-~/.claude}/projects/<slug>/memory/`, in the note format this store reads.
`memgrove migrate` copies the notes in, skips the generated `MEMORY.md`, and lets this store rebuild
the index:

```bash
memgrove migrate --dry-run                  # the plan, no writes
memgrove migrate                            # every project, into projects/<slug>
memgrove migrate --global user,feedback     # promote those types to global/
memgrove migrate --cwd /path/to/project     # one project (e.g. a custom autoMemoryDirectory)
```

Claude Code's directory name cannot be decoded back to a path — it turns every non-alphanumeric
into `-`, so a dot is lost — so the importer reads the real cwd from the project's session logs
and builds the scope with the store's own slug. A project whose cwd cannot be recovered is
reported and skipped rather than written where no `memgrove` command would read it; `--cwd` resolves
a project from the cwd you already know.

Notes stay in their own project scope by default: one may say `type: feedback` and still be
about a single repository, and Claude Code kept it under one project. Each note goes through the
store's write path, so the filename rules, the size cap, the empty-body check and the secret
refusal apply, and `--dry-run` runs the same checks without writing. An existing file is never
overwritten: an identical note is `exists`, a different one is a `collision` (exit 1), and a
note the store already has under another filename — same type and name, or the same description
by the consolidation rule — is `exists` too, so a rerun cannot overturn what the first pass
kept. Consolidation then runs once per touched scope; `replaced` and `merged` say what the pass
deleted, and a migrated note it removed is reported as `removed`.

## Consolidation

Every `memgrove write`/`memgrove forget` and every `memgrove_write` consolidates the scope it
touched before returning. The rules are deterministic — no model call:

- two files of the same type with the same `name` are one note; the newer `modified` wins and
  the older file is removed (its body is **not** merged);
- two files of the same type whose descriptions use the same words are duplicates: word Jaccard
  0.95 over descriptions of at most 19 distinct words, where only an identical word set can reach
  it. The older's unique lines are appended to the newest body, then the older file is removed; a
  description with more distinct words is never merged on similarity;
- `MEMORY.md` is rebuilt from the files, so a line for a deleted file cannot survive.

A pass deletes a file only while its bytes still match what it read, and writes a merged keeper
with the version it read, so a concurrent agent either wins cleanly or leaves both files for the
next pass. The pass is idempotent: running it twice changes nothing. `memgrove dream` runs it by
hand (`--all` for every project).

A description with more than 19 distinct words is not compared for similarity at all: at that
size the same 0.95 would begin to accept a qualifier, so two notes that long are left apart rather
than guessed at (the same-`name` rule still applies).

A restatement in other words is **not** merged, and rename-and-contradict is **not** detected —
the same fact under a different `name` or in a differently worded `description` stays as two
notes. That is deliberate: one added qualifier ("… tag blue", "… only") is what turns a
duplicate into a different note, and guessing that from text without a model is how the wrong
half of a pair gets deleted.

## Store layout

```
$MEMGROVE_ROOT/
├── PROTOCOL.md                # optional, for hand-wired agents; `memgrove protocol` prints it
├── global/{MEMORY.md,*.md}    # user-wide preferences and facts
└── projects/<slug>/{MEMORY.md,*.md}
```

`<slug>` is the absolute cwd with every unsafe character replaced by `-` and `.`/`_` kept:
`/home/u/proj` becomes `-home-u-proj`. On Windows the path is case-folded first, so
`C:/Users/u/proj` becomes `c--users-u-proj` and the same project cannot get two scopes from two
spellings. Each project gets one directory and no path escapes `$MEMGROVE_ROOT`.

There is no config file, no runtime state, and no git repository: the store is the notes and the
index. On Windows each scope also holds a `.memgrove.lock` file; the OS releases the lock when the
process exits, the file is invisible to the index, and it can be deleted while `memgrove` is not
running.

## Windows

Everything above works unchanged; the differences are the shell and a few file-system rules.

- Install with `uv tool install memgrove` (or `pipx install memgrove`) in PowerShell;
  `uv tool install .` is the checkout form from [Install](#install). `memgrove.exe` lands on `PATH`;
  open a new terminal so the PATH update is visible (`Get-Command memgrove` confirms it).
- There is no bash requirement. Use the installed `memgrove`, `python -m memgrove`, or
  `bin\memgrove.cmd` as the no-install launcher.
- README shell examples use bash heredocs. In PowerShell, pass the body inline or from a file:

  ```powershell
  memgrove write --path pnpm-not-npm.md --name pnpm-not-npm `
    --description "the lockfile is pnpm; npm install breaks CI" `
    --if-version new --content-file body.md
  ```

- Notes written by Notepad or another CRLF editor are read correctly; the store writes LF, so
  one note has the same bytes on every OS. `memory.md` is reserved in any casing, because on a
  case-insensitive volume it *is* the generated `MEMORY.md`.
- Claude Code's user config is `%USERPROFILE%\.claude.json`; `claude mcp add memgrove memgrove
  mcp --scope user` works in PowerShell as written. opencode and DSH use their own config files
  under the home directory, with the same JSON/YAML shown above.
- The CLI prints UTF-8 JSON regardless of the console code page. Windows PowerShell 5.1 can
  still garble non-ASCII output when it reads a native command; use PowerShell 7+, or run
  `[Console]::OutputEncoding = [Text.Encoding]::UTF8` once per session. The same applies to
  saving the guide: PS 5.1's `>` writes UTF-16, so use

  ```powershell
  New-Item -ItemType Directory -Force -Path $HOME\.agents\memgrove
  memgrove protocol | Out-File -Encoding utf8 $HOME\.agents\memgrove\PROTOCOL.md
  ```

## Development

```
bin/memgrove           POSIX launcher for development (python3 -m memgrove, no install needed)
bin/memgrove.cmd       Windows launcher for development
memgrove/store.py      files, frontmatter, version tokens, conflicts, secret refusal, locking
memgrove/index.py      MEMORY.md generation (atomic, no line budget)
memgrove/dream.py      consolidation, called after every change and by `memgrove dream`
memgrove/mcp.py        MCP stdio server: memgrove_index / memgrove_read / memgrove_write
memgrove/migrate.py    import Claude Code's per-project notes and rebuild the index
memgrove/cli.py        argparse surface
memgrove/PROTOCOL.md  the agent-facing contract; `memgrove protocol` prints it, the shell saves it
.github/workflows/     the test suite on Linux and Windows, and the tag-triggered release
docs/                  research.md, design.md, roadmap.md, operations.md
tests/                 unittest (stdlib only)
```

Tests use the standard library only:

```bash
export MEMGROVE_ROOT=$(mktemp -d)          # tests refuse to touch the real store
python3 -m unittest discover -s tests -v
```

On Windows:

```powershell
$env:MEMGROVE_ROOT = Join-Path $env:TEMP "memgrove-test"
python -m unittest discover -s tests -v
```

A release is a tag. Bump `__version__` in `memgrove/__init__.py`, commit, and push `v<version>`:
GitHub Actions runs the suite on Linux and Windows, builds the wheel and the sdist, uploads them
to PyPI through Trusted Publishing, and creates the GitHub Release with both files attached
(`.github/workflows/release.yml`). The one-time PyPI setup is in
[`docs/operations.md`](docs/operations.md).

Background and rationale: [`docs/`](docs/) — `research.md` (how Claude Code and Qoder actually
work, and which claims are verified), `design.md` (the design and the alternatives dropped),
`roadmap.md` (history), and `operations.md` (setup, env vars, and how to verify this machine).
README and `PROTOCOL.md` are English; the documents under `docs/` are Persian.

## Design notes

- **No database, no search index.** The index is regenerated from the files by scanning the
  directory, which is cheap at this scale and makes drift impossible.
- **The index has no line budget.** It is the whole retrieval path, so truncating it would hide
  notes rather than save context.
- **`if_version` is mandatory** on write unless `--force` is passed: a blind overwrite is
  exactly what the token exists to prevent.
- **A rewrite keeps what it is not given.** `name`, `description` and `type` are the only
  optional fields; omitting one leaves the file's current value in place, so a body-only fix
  cannot move a note to another section of the index. An empty `--description` clears the
  description; an empty `--name` keeps the current one. The store writes exactly three
  frontmatter keys (`name`, `description`, `metadata`) and drops any other hand-written key.
- **`name` and `description` are one line.** A line break in either is refused before anything
  is written: the frontmatter is parsed line by line, so a value with a break would be cut there.
  Multiple lines belong in the body.
- **Schema is Claude Code's, minus session provenance.** Four types (`user`, `feedback`,
  `project`, `reference`) and the same frontmatter shape, but no `originSessionId`: no client
  hands the tool a session id, so the field was always empty and claimed a provenance the store
  could not have. Notes another tool wrote with that field are still read; the next rewrite drops
  it, while other metadata keys another tool added are left alone.
- **Concurrency rests on the version token, held under a short-lived lock.** `write` and `delete`
  take an exclusive lock on the scope for the read-check-replace, because a token check without a
  lock is check-then-act: two writers holding the same token would both pass. On POSIX the lock
  is the directory's own inode — no file, no state, gone with the process. Windows cannot lock a
  directory handle, so there the lock is one byte of a `.memgrove.lock` file in the scope; it is
  still kernel state rather than bookkeeping, and the OS drops it when the process dies.
- **`memgrove read` takes a flat `.md` name.** `..`, absolute paths and `MEMORY.md` (in any case)
  are refused; the generated index is `memgrove index`. A hand-written file with invalid UTF-8 is
  decoded with replacement characters instead of failing the command.
- **The store is local to one machine.** There is no remote, no sync and no backup inside the
  tool: the version token and the short-lived lock only protect writers on the same machine, and
  a shared or network-backed store is not safe to write from two agents. Copy
  `~/.agents/memgrove` elsewhere on a schedule if you want a backup; the tool will not do it.
- **`PROTOCOL.md` is not part of the agent's onboarding.** The MCP `instructions` field is. The
  protocol file is only for connecting an agent that has no MCP client; it ships inside the
  package and `memgrove protocol` prints it, but the server never exposes it as a tool or a
  resource.
- When testing, set `MEMGROVE_ROOT` to a scratch directory. The default root is the real store.

## License

MIT — see [`LICENSE`](LICENSE).

If memgrove is useful in your workflow, consider starring the repository to help other
developers looking for shared memory for their coding agents find it.
