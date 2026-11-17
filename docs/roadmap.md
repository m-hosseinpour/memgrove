# Changelog

What each released version added, newest first. Design decisions and the options that were
rejected live in [`design.md`](design.md); the evidence behind them in [`research.md`](research.md).
Versions before 0.4.0 were not tagged, so those sections group the work by the version in the code
at the end of each phase.

## 0.4.0 — first public release (2026-11-17)

- Published as `memgrove` on PyPI, with the wheel and the sdist attached to the GitHub Release.
  The previous name, `agent-memory`, was refused by PyPI's similarity check: `ultranormalize_name`
  drops `.`, `_` and `-` and maps `l`/`i` to `1` and `o` to `0`, so it collided with the existing
  `agentmemory` project. Every punctuation variant was blocked the same way.
- The rename covers the whole surface: distribution and module `memgrove`, console script
  `memgrove`, MCP server `memgrove`, tools `memgrove_index` / `memgrove_read` / `memgrove_write`,
  and the inputs `MEMGROVE_ROOT` / `MEMGROVE_PROJECT_CWD`.
- The store root moved to `~/.agents/memgrove`. The data contract did not move with it:
  `MEMORY.md`, the note format and the cwd-derived scope slug are unchanged, so an existing store
  only needs the directory renamed.
- Packaging and release: `hatchling` metadata, `memgrove protocol` so an installed wheel carries
  the hand-wiring guide, a Linux/Windows suite matrix on Python 3.11–3.14, and a tag-triggered
  `release.yml` that publishes through Trusted Publishing and attaches both artifacts to the
  GitHub Release.
- Fixed on the way to the release: the `--cwd` fallback in `migrate` compared Claude Code's
  project directory case-sensitively, which never matched on Windows; both sides are now
  normalized.

## 0.3.0 — Windows support

- The scope lock is one byte of `.memgrove.lock` on Windows, because Windows cannot lock a
  directory handle; POSIX keeps the directory inode and creates no file.
- Writes are always LF and reads accept CRLF, so one note has the same bytes on every OS.
- `MEMORY.md` is reserved in any casing, because on a case-insensitive volume `memory.md` *is* the
  index.
- Scope slugs are built through `normcase`, so one project cannot get two scopes from two
  spellings.
- The CLI speaks UTF-8 on every stream, and `bin/memgrove.cmd` runs the checkout without
  installing.
- README restructured; MIT license and full package metadata added.

## 0.2.0 — imports and consolidation rules

- `memgrove migrate` imports Claude Code's per-project notes into their own scope, skips the
  generated index, and runs every note through the store's write path.
- A rewrite changes only the fields the caller sends; an omitted `name`, `description` or `type`
  keeps the file's value.
- Duplicate descriptions merge at word-set equality (Jaccard 0.95 over at most 19 distinct words);
  anything longer is left apart rather than guessed at.
- An MCP tool call with an unknown argument is rejected instead of silently dropping it.

## 0.1.0 — the store, the CLI and MCP

- The markdown store: one note per file, a generated `MEMORY.md` index, and the four note types.
- CLI: `write`, `read`, `list`, `forget`, `index`, `mcp`, `dream`.
- MCP server with `memory_index` / `memory_read` / `memory_write` (renamed in 0.4.0), one stdio
  surface for every client.
- Optimistic versioning via `if_version`, a secret-pattern refusal, and a 100KB body cap.
- An earlier iteration also shipped per-agent hooks and plugins, background transcript extraction,
  and a git history for the store; all were removed because each added a moving part without
  improving retrieval or writing.
