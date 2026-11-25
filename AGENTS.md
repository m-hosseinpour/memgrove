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

- **Every finished change set that users receive ships.** A change set is one feature, one fix set,
  one shipped-documentation set, or one packaging change — a group of related commits, not each
  commit. Once it is verified, this section is the standing authorization (user decision,
  2026-11-25) to bump the version, commit, tag, push both, and let the workflow publish; do not
  wait for a separate release request or leave it for a later session.
- **User-facing means** code and CLI/MCP behavior, anything inside the wheel (including
  `memgrove/PROTOCOL.md`), the PyPI page (`README.md` and the metadata in `pyproject.toml`), or a
  packaging change that alters the built artifacts. A batch that only edits `AGENTS.md`, `docs/`,
  tests, or CI configuration is committed and pushed without a release. If the changelog entry
  could not name what a user receives, do not release.
- **Version levels while the project is 0.x:** patch for a fix, a shipped wording, help or protocol
  correction, or an internal correction that still changes the program or artifacts; minor for a
  new user-facing capability, a compatible extension, or a breaking contract, store-format or
  behavior change (0.4.0 renamed the distribution and moved the store, and was a minor). A mixed
  batch takes the highest level. 1.0.0 is a deliberate user decision, not an automatic bump. A
  published version is never reused, even after a yank.
- **Before the tag:** the suite is green locally, README and `docs/` describe what ships, any
  migration a user has to perform is written down, and the artifacts carry no secrets or local
  scratch data. The release workflow reruns the suite on Linux and Windows before publishing.
  `__version__` in `memgrove/__init__.py` is the only version literal, and the tag must be exactly
  `v<version>`; `release.yml` stops otherwise.
- **To release a batch:**
  1. Add the version's section with the date to `docs/roadmap.md`: what it added, and plainly when
     behavior did not change.
  2. Set `__version__` to the new version, commit version and changelog together as
     `Release <version>`, and push `main`.
  3. Tag that commit `v<version>` and push the tag. `origin` has both push URLs, so the branch and
     the tag reach our git server and GitHub.
  4. Watch the release run: tests on Linux and Windows, the tag/version check, the wheel and sdist
     installed into clean environments, PyPI through Trusted Publishing, then the GitHub Release
     with both files attached. Confirm the version on PyPI and the assets.
  5. Run `uv tool install --reinstall .` so the `memgrove` on `PATH` is the released code.
- **When it fails:** before PyPI takes the version, rerun a failed run; if the fix needs new code,
  do not move the pushed tag — ship the next version, or ask before deleting a tag PyPI never
  received. After PyPI takes the version, fix forward with a new version; never delete or reuse it.
  Publishing is irreversible — rehearse a risky packaging change on TestPyPI.
- Trusted Publishing is configured on PyPI for this repository, workflow `release.yml` and
  environment `pypi`; no token is stored. If either name changes, update that PyPI record instead
  of adding a token. Changing `.github/workflows/` needs a token with the workflow scope; the
  current one has it.

## Git

- Push after every commit.
- Merge, rebase, and branch deletion only on an explicit request from the user.
