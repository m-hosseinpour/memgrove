# Windows notes

Everything in the [README](../README.md) and [usage.md](usage.md) works unchanged; the
differences are the shell and a few file-system rules.

- Install with `uv tool install memgrove` (or `pipx install memgrove`) in PowerShell;
  `uv tool install .` is the checkout form from the [README](../README.md#development).
  `memgrove.exe` lands on `PATH`; open a new terminal so the PATH update is visible
  (`Get-Command memgrove` confirms it).
- There is no bash requirement. Use the installed `memgrove`, `python -m memgrove`, or
  `bin\memgrove.cmd` as the no-install launcher.
- The examples in [usage.md](usage.md) use bash heredocs. In PowerShell, pass the body inline or
  from a file:

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
  under the home directory, with the same JSON/YAML as in
  [docs/agents.md](agents.md#client-configuration).
- The CLI prints UTF-8 JSON regardless of the console code page. Windows PowerShell 5.1 can
  still garble non-ASCII output when it reads a native command; use PowerShell 7+, or run
  `[Console]::OutputEncoding = [Text.Encoding]::UTF8` once per session. The same applies to
  saving the guide: PS 5.1's `>` writes UTF-16, so use

  ```powershell
  New-Item -ItemType Directory -Force -Path $HOME\.agents\memgrove
  memgrove protocol | Out-File -Encoding utf8 $HOME\.agents\memgrove\PROTOCOL.md
  ```

