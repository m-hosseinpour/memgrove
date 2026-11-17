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
| `README.md` | intro, install, connect an agent, first check, doc map |
| `docs/agents.md` | MCP configuration per client, the `instructions` contract, manual connection |
| `docs/usage.md` | CLI, exit codes, consolidation, store layout, Claude Code import |
| `docs/windows.md` | Windows install and shell/file-system differences |
| `memgrove/PROTOCOL.md` | guide for agents without an MCP client; `memgrove protocol` prints it |
| `.github/workflows/` | the suite on Linux and Windows, and the tag-triggered release |
| `docs/design.md` | the design and rejected options; §11 is the closed decisions |
| `docs/roadmap.md` | the changelog: what each released version added |
| `HANDOFF.md` | only while work is open: the current work order. Not in the tree today; create it when work opens and delete it when the list is empty |
| `docs/research.md` | historical research on Claude Code and Qoder |

- README, PROTOCOL and `docs/` are English; the answers to the user are Persian.
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

- The version lives only in `__version__` in `memgrove/__init__.py`; the tag `v<version>` must equal
  it, and `release.yml` stops on a mismatch. The workflow runs the suite on Linux and Windows,
  builds the wheel and the sdist, publishes to PyPI through Trusted Publishing, and creates the
  GitHub Release with both files attached.
- Cut a release after a **complete change set** — one feature, one fix set, or one packaging change
  that is finished and reviewed — not per commit. While the project is 0.x, a feature bumps the
  minor version and a fix bumps the patch; a published version and name are never reused.
- Before tagging: the suite is green on both operating systems, README and `docs/` describe what
  ships, and any migration a user has to perform is written down. After tagging, watch the release
  run; if it fails before the upload, rerun it, and if PyPI already took the version, fix forward
  with a new version instead of deleting it.
- Trusted Publishing is configured on PyPI for this repository, workflow `release.yml` and
  environment `pypi`; no token is stored. If either name changes, update that PyPI record instead
  of adding a token. Publishing is irreversible — rehearse a risky change on TestPyPI.
- `origin` carries both push URLs (our git server and GitHub), so `git push origin main` and
  `git push origin v<version>` update both; the tag has to be pushed too. Changing
  `.github/workflows/` needs a token with the workflow scope; the current one has it.

## Git

- Push after every commit.
- Merge, rebase, and branch deletion only on an explicit request from the user.
