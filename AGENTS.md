# AGENTS.md

Only what a fresh session needs in order not to break something. Details live in `docs/`.

## Tests

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
```

- pytest is neither installed nor needed; new tests go in the four existing files under `tests/`
  and use `unittest`.
- Every `memgrove` command in a test or a check needs `MEMGROVE_ROOT=$(mktemp -d)`. The real
  store is `~/.agents/memgrove` and must not be touched.
- `./bin/memgrove` runs the checkout on POSIX, `bin\memgrove.cmd` on Windows; `python -m
  memgrove` works on both. `memgrove` on `PATH` is the installed copy and may be stale; to run the
  new code there you need `uv tool install --reinstall .` (see below).
- On Windows, drop the `PYTHONDONTWRITEBYTECODE=1`/`python3` shell prefix and run
  `python -m unittest discover -s tests -v`; a scratch root is `$env:MEMGROVE_ROOT`. The suite
  must stay green on Linux and Windows: anything POSIX-only (the `bin/memgrove` launcher) is
  guarded with `skipUnless`, and no module may import `fcntl` at the top level.

## Install

- If the tool is installed on this machine (`uv tool list` lists it), run
  `uv tool install --reinstall .` after every code change, so the `memgrove` on `PATH` that the
  agents call runs the new code.

## Documents

| File | Role |
|---|---|
| `README.md` | intro, install, MCP, manual usage, Windows |
| `memgrove/PROTOCOL.md` | guide for agents without an MCP client; `memgrove protocol` prints it |
| `.github/workflows/` | the suite on Linux and Windows, and the tag-triggered release |
| `docs/design.md` | the design and rejected options; §11 is the closed decisions |
| `docs/operations.md` | this machine's state and setup |
| `docs/roadmap.md` | history of what shipped |
| `HANDOFF.md` | only while work is open: the current work order. Not in the tree today; create it when work opens and delete it when the list is empty |
| `docs/research.md` | historical research on Claude Code and Qoder |

- README and PROTOCOL are English; everything else is Persian, and so are the answers to the user.
- Update README and `docs/` in the same change that alters behaviour, not in a later commit.
- Do not reopen §11 of `design.md` without a new reason: no keyword search, no line cap on the
  index, no config file, MCP-only, consolidation after every change, the store stays local to one
  machine (no remote or shared store), and `PROTOCOL.md` is not shown automatically.

## Code

- Python ≥ 3.11, standard library only; do not add dependencies.
- `memgrove/` is the only code package and `bin/memgrove` is just a launcher. CLI and MCP both go
  through `memgrove.store`, so do not build the same logic twice.
- Cross-platform rules: write files as UTF-8 with `newline="\n"` (use `store.replace_file`), read
  CRLF via `store.parse`, and keep the POSIX/Windows lock split inside `store._locked`. Windows
  cannot import `fcntl` or lock a directory handle, so a module-level `fcntl` import breaks the tool.

## Release

- The only version is `__version__` in `memgrove/__init__.py`, and the tag `v<version>` must equal
  it; `release.yml` stops on a mismatch. The workflow then builds, publishes to PyPI through
  Trusted Publishing, and creates the GitHub Release with the wheel and the sdist.
- Never upload by hand and never store a PyPI token: the one-time trusted-publisher setup is in
  `docs/operations.md`. Publishing is irreversible — a name and a version cannot be reused; rehearse
  on TestPyPI instead.
- The workflow runs on GitHub only. `origin` carries both push URLs (our own git server and
  GitHub), so `git push origin main` and `git push origin v<version>` update both — the tag has to
  be pushed too. A push that first adds `.github/workflows/` to GitHub needs a token with the
  `workflow` scope; without it GitHub rejects the push and the tag never lands, so no release runs.

## Git

- Push after every commit.
- Merge, rebase, and branch deletion only on an explicit request from the user.
