# Connecting agents

Register the server once per agent; there is nothing else to install per agent. Installation is in
the [README](../README.md#install).

## Client configuration

Claude Code:

```bash
claude mcp add memgrove memgrove mcp --scope user
```

The same registration by hand, in `~/.claude.json` (user scope):

```json
{ "mcpServers": { "memgrove": { "command": "memgrove", "args": ["mcp"] } } }
```

Also set `"autoMemoryEnabled": false` in `~/.claude/settings.json`, or its native memory keeps
writing a separate store ([why](design.md#9-integration-with-agents)).

OpenCode — `~/.config/opencode/opencode.json`:

```json
{ "mcp": { "servers": { "memgrove": { "type": "local", "command": ["memgrove", "mcp"] } } } }
```

DSH — `~/.dsh/cordis.patch.yml` (rewrite the file live, no restart needed):

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

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `memgrove_index` | `cwd?` | the table of contents of the global and the project store |
| `memgrove_read` | `store`, `path`, `cwd?` | name, body, version, modified, type, description |
| `memgrove_write` | `store`, `path`, `content`, `if_version`, `name?`, `description?`, `type?`, `cwd?` | the new version, after the touched scope is consolidated |

The server's usage contract — the two scopes, the four types, what not to save, `if_version` —
travels in the MCP `instructions` field of `initialize` / `server/discover`, which is what that
field is for. It opens with the session bootstrap: on the first user turn in the context, before
acting on it — even when the turn begins by loading a skill or reading files — call
`memgrove_index` with `cwd`; **once per conversation**, since a later user message is not a new
session, and again only after a compaction or a resume that did not carry the index, when it is no
longer in context. MCP has no channel that pushes the index into a client's context, so this
contract is the portable way to get it in front of the model without an adapter per client. No
`AGENTS.md` section is needed.

## Choosing the project

`cwd` exists for clients that run one server for several projects (DSH does); a per-project client
can omit it and the server uses its own working directory. `MEMGROVE_PROJECT_CWD` sets that
fallback for a client that cannot pass `cwd` at all.

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
