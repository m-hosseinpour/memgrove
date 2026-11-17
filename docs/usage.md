# Usage: CLI, store and consolidation

The `memgrove` command is the same store by hand, and the MCP server goes through the same code, so
every rule here applies to both. For the first run, see the [README](../README.md); for the design
and the options that were rejected, see [design.md](design.md).

## Command line

`--scope` defaults to `project` and `--cwd` to the current directory, so a command run inside a
project needs neither:

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

`if_version` is mandatory so a blind overwrite cannot lose a newer note; `--force` is the explicit
way to write without it. `read` and `forget` take a flat `.md` name: `..`, absolute paths, and
`MEMORY.md` in any casing are refused, and a hand-written file that is not valid UTF-8 is decoded
with replacement characters instead of failing the command.

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

The root defaults to `~/.agents/memgrove`; `MEMGROVE_ROOT` or the global `--root` option points
the whole tool at another one (the test suite uses a scratch root):

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

