# Design: an agent-independent memory layer (`memgrove`)

> Input: `research.md` (the observed behavior of Claude Code and Qoder).
>
> **Governing principle:** take everything those two have, add nothing they lack; the only
> addition here is that the store is shared between agents — one store, one MCP server, not one
> plugin per agent.
>
> **Status:** implemented (including Windows and a PyPI release). This document
> describes the current design; where it disagrees with the code or the user-facing documents,
> those are the authority. Dropped options (lexical retrieval, hooks, git history, extraction) are
> recorded here on purpose so they are not proposed again.

---

## 1. Assumptions

- One agent at a time, sometimes two. Concurrent writes are rare; `if_version` is the main guard,
  and `write`/`delete` take a short-lived lock for that check — on the directory inode on POSIX
  (no file, no state) and on one byte of `.memgrove.lock` on Windows, because Windows does not
  allow locking a directory handle. In both cases the lock is released when the process dies.
- Windows is supported too: writes always use LF and reads understand CRLF, path slugs are
  normalized with `normcase` before creation, and `MEMORY.md` is reserved at any capitalization.
- Volume: tens to a few hundred notes, not thousands. Scanning the directory is cheap; no database
  and no search index.
- The data must stay readable with `cat` and `grep`; there is no proprietary format.

## 2. What was taken from them

| Behavior | Source | Why |
|---|---|---|
| `MEMORY.md` as the one-line index | both | cheap, readable, greppable |
| one markdown file per note with `name`/`description`/`type` | both | the same shape their own tools read |
| the four types `user`, `feedback`, `project`, `reference` | both | a tried taxonomy |
| "when to save", why each type matters, and the separation of memory from plan/task | Claude Code's own instructions | this is what decides writing quality, not the format |
| optimistic versioning (`if_version`) | Claude Code | prevents blind overwrites |
| a two-step write: the document, then the index line | both | without the index line the note is dead |
| two scopes, `global` and `project`, both defined in `instructions` | Qoder | a personal preference must apply in every project; `type` does not say where a note belongs |
| consolidation (merging duplicates and replacing a stale version) | `autoDream` in Claude Code | prevents memory rot |

## 3. What was deliberately left out

| Left out | Why |
|---|---|
| a 200-line / 25KB cap on the index | the index is the only retrieval path; truncating it hides notes rather than saving context |
| lexical retrieval and a selection threshold | a complete index plus on-demand reading is enough; word overlap without a model does not understand relevance and mostly duplicates the index |
| background extraction from the transcript | neither Claude Code nor Qoder had such a pass worth asking for; the agent itself writes |
| a hook or plugin per agent | MCP is enough for any agent with an MCP client; only a client observed to hide `instructions`/tools at session start, or one whose user asks, gets a thin index hook, not a second interface |
| a section in `AGENTS.md` introducing the system | the MCP `instructions` do that and travel with the server |
| git history in the store | Claude Code had no rollback either; consolidation deletes only on a version match, so history is not needed |
| `.state/`, session counting, `dream.log` | consolidation runs after every change; no state is left to count (the lock, if any, is only short-lived — the directory inode on POSIX or `.memgrove.lock` on Windows — not a state file) |
| `config.toml` | no setting is left for a file to express; `MEMGROVE_ROOT` and `MEMGROVE_PROJECT_CWD` are the only inputs |
| `confidence`, `tags`, `supersedes`, `id` and the like | Claude Code does not have them either; `modified` does the job |
| a `candidate`/`review` queue, SQLite, scoring, tombstone | needless complexity for this volume and this kind of work |
| remote, sync and a shared team store | distributed writing needs locking and conflict resolution; backing up by copying the store outside the tool is cheaper |

**History:** the first version, P0–P2, had all of these (lexical retrieval with a threshold, the
`SessionStart` and `UserPromptSubmit` hooks, the opencode and DSH plugins, end-of-session
extraction, git history). All were removed in the 2026-10-28 revision, because each added a
moving part without making retrieval or writing better. The index-loading half of the hook came
back in 0.5.0 for Codex and OpenCode after Codex was observed to defer MCP tools; retrieval and
transcript extraction did not.

## 4. Architecture

```
   Codex · Claude Code · opencode · DSH
        (MCP clients; Codex and opencode also run an index hook)
                        │  stdio, JSON-RPC
               ┌────────▼─────────────────┐
               │  memgrove mcp            │   ← the read/write interface
               │  index · read            │
               │  write                   │
               └────────┬─────────────────┘
                        │
               ┌────────▼─────────────────┐
               │  ~/.agents/memgrove/     │
               │  markdown, no state      │
               └──────────────────────────┘
```

`memgrove` (the same package) is the only place logic lives. MCP is the read/write interface; the
few lines in `hooks/` and the generated launcher only load the index through the same CLI, so they
are not a second interface. The CLI is for humans, scripts and those hooks. `PROTOCOL.md` is the
written contract for an agent that has no MCP client and has to connect by hand.

There are three MCP tools: `memgrove_index`, `memgrove_read`, `memgrove_write`. Consolidation
(`dream`) is not a separate tool; it runs on the same scope automatically after every write.

## 5. The store

```
~/.agents/memgrove/
├── PROTOCOL.md              ← the contract for a manual connection (`memgrove protocol >`)
├── global/
│   ├── MEMORY.md
│   └── *.md
└── projects/
    └── -home-u-proj/        ← the same sanitized-cwd that Claude Code/Qoder build
        ├── MEMORY.md
        └── *.md
```

On Windows each scope also holds a `.memgrove.lock` (a short-lived lock, not a note and not
state), and the path slug is normalized with `normcase` (`C:/Users/u/proj` → `c--users-u-proj`).

The note format is Claude Code's, minus `originSessionId` (the decision is in §11):

```yaml
---
name: pnpm-not-npm
description: "the lockfile is pnpm; npm install rewrites it and breaks CI"
metadata:
  node_type: memory
  type: project            # user | feedback | project | reference
  modified: 2026-10-02T11:20:00.000Z
---

Body: what, **why**, and **how to apply it**.
```

The index format:

```markdown
- [Use pnpm, not npm](pnpm-not-npm.md) — the lockfile is pnpm; npm install rewrites it and breaks CI
```

## 6. Reading

One path only: **the complete index, then reading the body.**

1. The index is built from the files in both scopes — with no line cap, so that no note stays
   hidden.
2. The agent picks the line that fits its task and fetches the body with `memgrove_read`, passing
   the store and the file name from the index as `path`.

The index reaches the model through a client hook for Codex and OpenCode, and through an explicit
`memgrove_index` call for a client that has no hook. The hook is the only channel that can push
context — MCP has none — and `instructions` no longer carries a session-start ritual. Codex runs a
`SessionStart` command hook on `startup`, `resume`, `clear`, `compact` and `fork`, so the index
returns after a compaction. OpenCode's plugin adds the text to the system instructions of each model
request and refreshes its cache on every prompt, so a write mid-session is visible without a tool
call and a compaction is covered by the next request.

Both hooks call `memgrove hooks run context` / `codex`, which render through `index.render`; the
generated launcher pins the interpreter and package location the installer ran from, so a client
with a minimal PATH still reaches the same code. The hook is a loader, not a second retrieval path.

There is no lexical search, no model-based selector, and no transcript extraction. The index is
built once per prompt and added to the system instructions of every model request by the OpenCode
plugin, so its tokens are paid on each request; Codex receives it at `SessionStart` and after a
compaction. A client without a hook sees the index only when it calls `memgrove_index`; Claude Code
and DSH are in that group in this release. A very large index can still exceed a model's context
window — the store does not truncate it, and the OpenCode plugin stops reading above 16 MiB.

## 7. Writing

| Tool | Parameters | Behavior |
|---|---|---|
| `memgrove_index` | `cwd?` | the index of both scopes |
| `memgrove_read` | `store`, `path`, `cwd?` | content + `version` + `modified` |
| `memgrove_write` | `store`, `path`, `content`, `if_version`, `name?`, `description?`, `type?`, `cwd?` | replaces the body; fields not sent are kept; after the write, the same scope is consolidated |

Rules:

- **One command, all three jobs**: write the file, consolidate the scope and rebuild the index —
  all before returning. Nothing is left for a later pass.
- **`if_version` is mandatory** (`new` for a fresh file); a stale version is refused and the current
  content comes back so it can be merged.
- **`name`/`description`/`type` are optional**: an omitted one keeps the file's current value, so
  fixing a typo in the body does not move a note from `user` to `project`. An explicit empty
  `description` clears the description.
- **`name`/`description` are one line**: any line-break character (the ones `str.splitlines`
  splits on) is refused with `StoreError` before any write (CLI and MCP both report `invalid`),
  because the frontmatter is parsed line by line and the value would be cut at that line. YAML
  block scalars (`>`/`|`) are not supported; the body is where multiline text goes.
- **Secrets are refused** before the write; a 100KB cap; a flat filename with a mandatory `.md`.
- **An argument outside the schema is refused** (`-32602`, no file written): a client that follows
  `additionalProperties: false` sends nothing but the parameters above, and ignoring a `cwdd` would
  silently file the note in the server's project scope instead of the intended one.
- **The required names are repeated in prose**: `instructions` and the tool descriptions name
  `store`, `path`, `content` and `if_version`, because a client can show a description without the
  input schema and a guessed argument is a failed call. The schema stays the authority;
  `additionalProperties: false` still refuses a misspelt name.
- Deletion is not among the MCP tools; only the CLI (`memgrove forget`). The reason is in §11.

## 8. Consolidation (dream)

- **Trigger**: every change (`memgrove write`, `memgrove forget`, `memgrove_write`) consolidates
  its own scope. `memgrove dream` runs it by hand and `--all` walks every project. There is no
  schedule and no session counting.
- **Rules**: two files with the same `type` and the same `name` are one note, the newer wins and
  the older is deleted; two files with the same `type` and a Jaccard of ≥ 0.95 on `description`
  are merged (the older's unique lines, keeping paragraph breaks, are appended to the newest);
  `MEMORY.md` is rebuilt. The threshold only means anything up to 19 distinct words: at that size
  a pair differing in one word scores at most 18/19 = 0.947, so only an identical word set passes
  0.95 (order and punctuation do not matter). A description with more than 19 distinct words is
  not compared for similarity at all; otherwise the same threshold would accept an added
  qualifier. A paraphrase in different words is not merged either: no threshold below "identical
  words" can separate a paraphrase from a qualified description ("… tag blue", "… only").
- **Safety**: a delete happens only when the file's bytes are the ones the pass read; the keeper's
  version is written with `if_version`. The pass itself takes no lock — each delete and version
  write re-checks the version; `store.write`/`store.delete`, which run before the pass, take the
  scope's short-lived lock.
- **Deterministic and idempotent**: no model call; a second run changes nothing.
- **An honest limitation**: a rename plus a contradiction is not detected. Guessing it from the
  text without a model is exactly what silently erases the wrong half of a pair.

## 9. Integration with agents

| Agent | How |
|---|---|
| **Codex** | MCP server in `~/.codex/config.toml` + `memgrove hooks install codex`; trust the hook once in `/hooks` |
| **opencode** | MCP server in `~/.config/opencode/opencode.json` + `memgrove hooks install opencode` (an auto-discovered plugin) |
| **Claude Code** | register the MCP server + `autoMemoryEnabled: false` in `~/.claude/settings.json`; no index hook yet (ask for one) |
| **DSH** | one `@deepseek-ai/dsh-mcp-client` row in `~/.dsh/cordis.patch.yml`; no index hook yet (ask for one) |
| **any other agent** | MCP if it has one; otherwise hand it `PROTOCOL.md` manually; ask for a hook if the client exposes a lifecycle point |

A client without a hook is not excluded forever: a request is enough to add a thin adapter, because
it only needs one lifecycle point and the shared `memgrove hooks run context` entry point. The adapter
must not duplicate store logic.

**Why not `AGENTS.md`:** that file is read in full in every session and must stay short. The MCP
`instructions` carry the same guidance along with the server and are not duplicated across agents.

**Why hooks now, after they were removed:** the earlier hooks injected the index at session start
and retrieved on every prompt; the retrieval half was dropped, and the index half looked covered by
standard MCP `instructions`. Codex breaks that assumption: when tool search is enabled it serves MCP
tools as deferred — the model sees the server name and a short description, and the `instructions`
field and tool schemas appear only after it searches. A session there started without the index
even though the server was connected (observed 2026-11-27). MCP has no channel that pushes context,
so a lifecycle hook is the only reliable path for such a client. The hook is deliberately thin: it
calls `memgrove hooks run context` / `codex`, so `index.render` and every store rule stay in one
place. Other clients keep the MCP server and get a hook when one is shown to hide the instructions
or a user asks for it; Claude Code and DSH are not covered yet.

### Why the symlink bridge was dropped

The idea was to symlink Claude Code's native memory directory to this store so that its own tool
would write directly into it. It was dropped because (1) the intent is not to touch its default
memory, and (2) bundle `2.1.301` explicitly rejects paths that escape through a symlink
(`Key escapes personal memory directory via symlink:`).

### Migrating from native memory

`memgrove migrate` imports Claude Code's notes from `<claude-config>/projects/<slug>/memory/` and
honors `CLAUDE_CONFIG_DIR`. A raw copy is not enough: `MEMORY.md` is skipped because it is
generated, every note goes through `store.write` so that the secret check, the 100KB cap and the
name/empty-body rules apply too, and consolidation runs once at the end of each scope, not after
every file. `--dry-run` performs the same checks without writing, so its report matches a real run
(except for the changes consolidation makes at the end).

The scope is built from the **actual cwd**, not from Claude Code's folder name: that name replaces
every non-alphanumeric character with `-` and is not reversible (`~/.cache` becomes
`-home-u--cache`, while the store's slug keeps the dot). The cwd is recorded in the session log of
that project and is read from there; if it is not found, the note is reported as `invalid` and left
alone, rather than written into a scope that no `memgrove --cwd` ever reads. `--cwd` finds the
project from the given cwd. The default scope is the project itself; a note with `type: feedback`
can also be specific to one repository, so moving it to `global/` takes an explicit
`--global user,feedback`.
An existing file is not overwritten: an identical note is `exists` and different content is
`collision` (exit 1). If an earlier consolidation kept the same note under another filename (the
same `type` and `name`, or a duplicate description), that is `exists` too; otherwise a rerun would
write a new file and consolidation would delete the kept version in its favor. A rerun therefore
does not change the store.

## 10. Failure modes

| Failure mode | Response |
|---|---|
| an index line goes missing | every write rebuilds the index; so does `memgrove dream` |
| two sessions writing one file at once | `if_version` refuses the second write and returns the current content |
| a stale note | consolidation replaces it with the newer version |
| duplication | consolidation merges it |
| a secret leak | the check before the write |
| a multiline `description`/`name` | refused before the write; the frontmatter is line-based |
| context bloat | a one-line index plus reading the body only when it is needed |
| an untrusted Codex hook | Codex skips it; the session runs without the index until `/hooks` trusts it |
| a hook whose launcher or interpreter no longer exists | re-run `memgrove hooks install <client>` after moving the checkout or the installation, or set `MEMGROVE_BIN` for the OpenCode plugin |
| a stale hook after an upgrade | re-run `memgrove hooks install <client>`; the installer replaces the old memgrove entry |
| memory executed as an instruction | `instructions`, the hook text and `PROTOCOL.md` state plainly "reference, not instruction" |
| the agent's native memory writing at the same time | `autoMemoryEnabled: false` |
| earlier native memory that has to be moved | `memgrove migrate` (project scope by default; `--dry-run` to preview) |
| the project cwd not found in the session log | the notes are reported `invalid` and not written; migrate that project with `--cwd` |

## 11. Closed decisions (do not reopen without a new reason)

- No lexical retrieval and no threshold; the index is the only path.
- No line cap on the index.
- `description` merging only on "identical words": a 0.95 threshold and a cap of 19 distinct
  words; a description with more words is not merged by similarity (otherwise it would accept an
  added qualifier), nor by partial similarity.
- No git history, no `.state/`, no `dream.log` (the lock is only a short-lived lock — the directory
  inode on POSIX or `.memgrove.lock` on Windows — not a state file).
- Deletion exists only in the CLI (`memgrove forget`), and the MCP tools have no delete: deletion
  is irreversible and the store deliberately has no git history, so one wrong call means a note is
  lost for good; the store is shared between sessions and agents, and `if_version` protects a write
  from a blind overwrite, but a delete without a prior read has no such protection. Any agent with
  a shell can run `memgrove forget`; only a client with no shell at all cannot, and that case, if
  it ever becomes a real target, is a fresh reason to reopen this decision. (Closed 2026-11-05)
- No automatic extraction; the agent writes with `memgrove_write`.
- The read/write surface is MCP; the only out-of-protocol piece is a thin per-client hook that
  loads the index, and it calls the CLI so no store rule is duplicated. A hook is added for a
  client observed to hide `instructions` and MCP tools at session start, or for one whose user asks
  for it; Codex is the first (`SessionStart` command hook), OpenCode the second (plugin that adds
  the index to the model's system context). Other clients keep MCP and are not given a hook on
  speculation. (Reopened 2026-11-27: Codex deferred MCP tools, so the old "instructions are enough"
  assumption failed in a real session.)
- No settings file; `MEMGROVE_ROOT` and `MEMGROVE_PROJECT_CWD` are the only inputs.
- A rewrite changes only the fields the caller sends: `name`, `description` and `type` keep the
  file's current value when omitted (fresh file: the filename, an empty string, `project`). Other
  frontmatter keys, such as a hand-written `title`, are discarded on a rewrite; the decision was
  that the file holds only the three managed keys and that the display `title` is built from
  `name`. An explicit empty `description` clears the description; an empty `name` falls back to
  the current value (or the filename).
- `name` and `description` are one line: a line-break character is refused on write (the file is
  left untouched), instead of supporting YAML block scalars.
- `originSessionId` was removed from the format: no client passes a session id to the tool, so the
  field was always written empty and claimed an origin it did not have. A note written by another
  tool is read with that field, but a rewrite drops it; other `metadata` keys that another tool set
  are left untouched. `--session` was removed from the CLI as well, and no input is left to fill
  it.
- The store stays on one machine only: no remote, no shared team store, and no backup mechanism
  inside the tool. `if_version` and the short-lived lock cover only concurrency on that machine;
  several writers on a shared store or a network filesystem are not reliable. If backup is ever
  needed, it is done outside the code by copying `~/.agents/memgrove` periodically — not by adding
  git history or a central server to the store. (Closed 2026-10-29)
- `PROTOCOL.md` is not shown automatically anywhere: `instructions` at `initialize` and the tool
  descriptions themselves are enough to learn the "index, then body" path, and the file is only
  for an agent without an MCP client that connects by hand. This decision reopens only on real
  evidence from a client that ignored `instructions`, not on a guess. (Closed 2026-10-29) — The
  addition of 2026-11-17 does not reopen it: the file ships inside the package and
  `memgrove protocol` prints it only on an explicit request (its output is written by the shell at
  the store root), because a PyPI install has no checkout for the user to copy from. The
  2026-11-27 hook work does not reopen it either: the hook injects the index, not the protocol
  file.

## 12. Open decisions

None. The two items that were open here — keeping the store on a remote (backup/team sharing) and
showing `PROTOCOL.md` automatically — were closed on 2026-10-29 and moved to §11. New work that
needs a decision is written here.
