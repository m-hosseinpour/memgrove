# Agent memory: Claude Code and Qoder — research

> This document is a **snapshot of research**, not a design. The final decisions live in
> `design.md`, and several things described here (model-based selection, synchronization,
> extraction) were deliberately left out of the implementation. Qoder is no longer installed on
> the machine used for this research; its section remains as a reference only.
>
> Research date: 2026-10-28 · Claude Code version `2.1.301` · Qoder version `1.1.75-hotfix.1`
> Method: reading the files on disk directly, extracting prompt strings from the installed bundle,
> and the official documentation. Wherever local evidence disagrees with the documentation, that is
> stated explicitly. Anything unconfirmed appears in the "Unconfirmed" section.

---

## 0. One distinction that clarifies everything

All three products that call something "memory" are in fact talking about three different things:

| Layer | What it is | Example | Who writes it |
|---|---|---|---|
| **Instructions** | fixed working rules every session must know | `CLAUDE.md`, `AGENTS.md`, `.qoder/rules` | a human |
| **Memory** | durable facts about the user/project, extracted from interaction | "this project is built with pnpm", "the user wants short answers" | the agent (or a human) |
| **Knowledge** (knowledge/RAG) | external or indexed code content | Repo Wiki, Knowledge Base, a vector index | the indexing tool |

The common mistake is to throw all three into one basket. Claude Code keeps layers 1 and 2 fairly
separate; Qoder merged layers 2 and 3 into a single "Memory/Knowledge Center" product. The design
in `design.md` deliberately targets layer 2 only and defines a contract, not an implementation, for
layers 1 and 3.

---

## 1. Claude Code

### 1.1 Two parallel systems

**a) Instruction files (`CLAUDE.md`)** — manual, always in the prompt.

There are four scopes, read from general to specific
([documentation](https://docs.claude.com/en/docs/claude-code/memory)):

1. managed policy: `/etc/claude-code/CLAUDE.md` (Linux)
2. user: `~/.claude/CLAUDE.md`
3. project: `./CLAUDE.md` or `./.claude/CLAUDE.md`
4. local: `./CLAUDE.local.md`

Important points also visible in the actual behavior:

- Files are **concatenated, not layered**; no scope overrides another. The one closest to the cwd
  is read last.
- Files in subdirectories are loaded **on demand**, when the agent reads or writes a file in that
  branch.
- `@path` imports, at most **4 hops**; an import does not reduce the token cost.
- A file larger than 4MiB is rejected outright; on-demand files are truncated at 40k/200k
  characters.
- `.claude/rules/*.md` with a `paths:` frontmatter, for path-scoped rules.
- `AGENTS.md` is read only when `CLAUDE.md` does not exist (setting `claude-md` |
  `claude-md-and-agents-md` | `managed-only`).
- After `/compact` the project-root path is read from disk again and injected — the file is live,
  not a snapshot.

On the machine used for this research, `~/.claude/CLAUDE.md` was a single line,
`@~/.agents/AGENTS.md`: the real instructions live in the agents' shared file and Claude Code only
refers to it. That is exactly the pattern the design should reinforce.

**b) Auto memory** — the agent writes by itself.

Path: `~/.claude/projects/<sanitized-cwd>/memory/` — that is, **per project and outside the code
repository**. The structure:

```
memory/
  MEMORY.md                     ← index: one reference line per memory
  websearch-dead-use-playwright.md
  kde-fontconfig-cache-crash.md
  feedback_commit_attribution.md
```

`MEMORY.md` is a flat list, not a document:

```markdown
- [WebSearch is dead — use Playwright](websearch-dead-use-playwright.md) — the built-in search tool returns nothing through the AvalAI proxy; drive DuckDuckGo in the browser instead
```

and each memory is a markdown file with frontmatter (a real sample from the research machine):

```yaml
---
name: websearch-dead-use-playwright
description: "The WebSearch tool returns zero results in this environment; search through the local SearXNG MCP instead."
metadata:
  node_type: memory
  type: project          # user | feedback | project | reference
  originSessionId: 507e6cf4-4818-4f6e-83ad-66883efd3283
  modified: 2026-10-16T08:43:29.540Z
---
```

The body is free-form, but in practice it follows a fixed pattern: **what + why + how to apply
it**. The file above even says "do not test this again with a VPN, it was tested in two countries"
— so memory records both the *result* and the *limit of retrying*.

### 1.2 Writing: two-step, versioned, with a safety gate

From the installed version (extracted from the bundle) — none of this is in the public
documentation, but it exists in the build:

- Model-facing tools named `MemoryRead` and `MemoryWrite`, with the parameters `store`, `path`,
  `content`, `if_version`.
- A read returns a **12-character version token** and the last-modified time.
- A write has **optimistic concurrency**: `if_version` is either the token from the last read or
  the word `new`. A write with `new` to a path that exists is **refused** — "so you do not
  overwrite content you have not seen". A conflict and a refusal both return the current content
  for merging.
- A 100KB cap per document; empty content is refused.
- A write containing a **secret/key** is refused; a write to a shared store may require a
  classifier review.
- **Path gate**: the memory backend has explicit errors for paths that escape the memory root —
  `Key escapes personal memory directory:`, `Key escapes personal memory directory via symlink:`,
  `Key targets an excluded personal-memory subtree:` and
  `LocalDirectoryBackend: write refused on read-only mount`. Relevant to this design: any scheme
  that connects native memory to an outside folder must be compatible with these checks.
- **Two steps**: the document is written first, then a reference line is added to `MEMORY.md`. If
  the second step is missed, the memory exists but is never retrieved — a real failure mode Qoder
  struggles with as well.

Concepts that are in the build but not in the documentation:

- **store**: several separate stores. "The personal store of this machine" (the project folder),
  and a **shared/team store** that is sometimes read-only.
- **Synchronization** between the local folder and the shared store, with conflict handling ("the
  local version was replaced by the server version"), and protection against mass deletion ("if n
  files disappear at once, the folder was probably wiped, not deliberately deleted").
- **`CLAUDE_MEMORY_STORES`** for mounting a team store, confirmed in the official changelog.
- The `autoDreamEnabled` key and the nightly consolidation pass.
- A "stop auto-memory for this session" switch in `/memory`.

Three settings keys that the bundle documents and that settle the question:

| Key | The build's own description |
|---|---|
| `autoMemoryEnabled` | "Enable auto-memory for this project. When false, Claude will not read from or write to the auto-memory directory." |
| `autoMemoryDirectory` | a custom memory path; defaults to `~/.claude/projects/<sanitized-cwd>/memory/`. Ignored in `projectSettings` for security reasons. |
| `autoDreamEnabled` | "Enable background memory consolidation (auto-dream). When set, overrides the server-side default." |

A practical note: turning native memory off for real is done with `autoMemoryEnabled: false` — not
by writing into `CLAUDE.md`. Instruction text steers the model but does not take the tool away
from it.

### 1.3 Reading: selection, not vector search

There is no vector index involved. Two mechanisms:

1. **Selection**: a model-driven selection step that sees only each memory's `name` and
   `description` and picks ones for the current prompt (its prompt in the bundle begins "You are
   selecting memories that will be useful…"). Whether this step is a separate subagent or an
   inline call was **not confirmed**; that the step exists is certain. Two explicit rules in that
   prompt: "only select memories you are sure will help; if in doubt, do not select" and "match on
   the *topic* of the prompt, not on keyword overlap".
2. **Mandatory citation**: retrieved content comes with a citation instruction — a sentence drawn
   from memory must be wrapped in a `<cc-memory filenames="...">` tag. (The `</ccmemory>` tag is
   confirmed in the official changelog; the details of `filenames` come only from the bundle.)

`MEMORY.md` is read at session start (cap ~200 lines / 25KB) and the rest on demand.

### 1.4 Consolidation: `autoDream`

A background pass that runs once every few sessions and merges/prunes memories. Bundle strings:
counting "sessions since the last consolidation", "minimum required", "files written", "lock
acquired", "if killed midway, roll back". It has no page in the official documentation; the
changelog shows only its effect.

This is the direct answer to "memory rot": without consolidation, `MEMORY.md` fills with stale facts
and the agent is confidently wrong — worse than having no memory.

### 1.5 Hooks

The contract: JSON on stdin, JSON output on stdout, exit code 2 = block. Text injection goes
through `hookSpecificOutput.additionalContext` with a **10,000-character cap**
([documentation](https://docs.claude.com/en/docs/claude-code/hooks)).

| Event | What it does for memory |
|---|---|
| `SessionStart` | injects the index; it also runs again on `resume` (`source: resume`) |
| `UserPromptSubmit` | injects memories relevant to this prompt; it can block |
| `Stop` / `SubagentStop` | end-of-turn extraction (`decision: block` + `reason` continues the turn) |
| `SessionEnd` | records/summarizes only; its JSON is discarded |
| `PreCompact` | a chance to save state before compaction |

An important design note: in `Stop`, `additionalContext` goes to the **subagent**, not the parent;
and injected text is stored in the transcript and replayed on `--resume` — so an injection that
depends on time is stale when it is resumed.

### 1.6 What it saves and what it does not

The official taxonomy is those four `type`s:

- `user` — role, expertise, preferences
- `feedback` — corrections and approved approaches
- `project` — current work, decisions, deadlines, things the code does not show
- `reference` — where to look for something

And it explicitly **does not save**: anything inferable from the code or git, anything `CLAUDE.md`
already says, and "not every session saves something".

### 1.7 Limitations and criticism

- **Memory is not shared across projects** — issues
  [#36561](https://github.com/anthropics/claude-code/issues/36561),
  [#39195](https://github.com/anthropics/claude-code/issues/39195),
  [#44056](https://github.com/anthropics/claude-code/issues/44056).
- **There is no team memory** — [#38536](https://github.com/anthropics/claude-code/issues/38536).
- **Memory does not reach subagents** (except forks) — its own documentation says so.
- **A bloated `CLAUDE.md`** — the documentation itself recommends under 200 lines; the practical
  advice is progressive disclosure and moving procedures into skills.
- **The `#` shortcut was removed** in v2.0.70 →
  [#14868](https://github.com/anthropics/claude-code/issues/14868).
- **A fixed token cost** in every session, regardless of relevance.
- **No real retrieval layer** (BM25/vector) — reliance on LLM selection over descriptions.

---

## 2. Qoder

Qoder has two **separate** memory products, which must not be confused with each other.

### 2.1 IDE Memory

In `Settings → Memory`, two scopes with independent switches
([documentation](https://docs.qoder.com/qoder/memory)):

- **Global memory**: "preferences, habits and long-term context across all projects".
- **Project memory**: "codebase rules, learned procedures and per-project context".

The UI shows the number of files, the last update time, "open memory folder" and "clear memory".
Writing is **proactive**: in Agent mode you say "remember this" and Qoder saves it; later you have
to ask it to retrieve. Review happens in the Knowledge Center with maturity/category/project
filters.

On disk: `~/.qoder/memory/` (global) and `~/.qoder/projects/<slug>/memory/` (project) — both were
empty on the research machine because auto-memory was off.

### 2.2 CLI auto-memory — an almost word-for-word port of Claude Code

This is the most important finding of the research: the Qoder CLI has the same structure as Claude
Code — `MEMORY.md`, the same **200 lines / 25KB** cap, the same four `type`s
(`user|feedback|project|reference`), the same `autoMemoryEnabled` settings key, the same injection
of the "head of MEMORY.md" at startup and on-demand loading of topic files
([CLI Memory](https://docs.qoder.com/cli/memory)).

The differences: off by default (`QODER_MEMORY=1`), a "Memory Management Subagent" for
adding/removing duplicates/routing, and `/remember`, which suggests **promoting to `AGENTS.md`**.
So Qoder itself knows that memory and instructions are two layers and offers a promotion path.

### 2.3 rules — Qoder's most mature layer

`AGENTS.md` + `.qoder/rules/**/*.md` with four triggers
([documentation](https://docs.qoder.com/cli/memory)):

| trigger | what is injected |
|---|---|
| `always_on` | the whole body, always |
| `model_decision` | **only the path + description**; the model itself decides whether to read it |
| `glob` | the body, after the first encounter with a matching file |
| `manual` | only on an explicit call |

`model_decision` is the right equivalent of "a light index + on-demand reading" and is used
directly in this design.

### 2.4 Knowledge engine — what Claude Code lacks

- **Repo Wiki**: generated knowledge for each repository, off by default, generated locally, with
  no upload of the whole codebase ([Repo Wiki](https://docs.qoder.com/qoder/repo-wiki)).
- **Knowledge Base**: user files (PDF/Word/Excel/… up to 500MB) in user or workspace scope.
- **Workspace index**: automatic under 10,000 files; vectors are built **in the cloud**
  ("uploaded files are destroyed once the vectors are built; only the vectors remain")
  ([Indexing](https://docs.qoder.com/qoder/indexing)).
- The `qoder-context` plugin with MCP tools: `SearchWorkspace` (an answer with file:line evidence)
  and `SearchKnowledge` (distilled knowledge: architecture, stack, rules) — both `alwaysLoad` and
  `alwaysAllow`.

### 2.5 The memory contract in the SDK (from the installed bundle)

`@qoder-ai/qoder-agent-sdk` has an explicit contract for memory — the most precise thing found in
this research:

```js
options.memory = {
  mode: "native" | "custom",
  projectScope: boolean,
  userScope: boolean,

  generation: {                 // writing
    enabled, roots: [{ path, indexFile }],
    prompt,                     // overridable extraction prompt
    turnComplete: { enabled, shouldGenerate(input), timeoutMs, onGateError }
  },

  consumption: {                // reading/injection
    enabled,
    files: [{ id, path, required }],
    maxTokens,                  // token budget
    overflow: "truncate" | "fail_query",
    failureMode: "best_effort" | "fail_query"
  }
}
```

And the reporting channel: `memory_generation` / `memory_consumption` system messages with a
callback, plus the `flush_memory` and `refresh_memory` commands.

Three things in this contract are worth imitating:

1. **Separating generation from consumption** — writing and reading are two independent cycles with
   independent settings.
2. **An explicit token budget** for injection, with a defined overflow policy.
3. **The `shouldGenerate` gate** — before each extraction, a function decides "is it worth it",
   with a timeout and an error policy. Extraction therefore does not always run.

### 2.6 Four paths by which memory reaches the prompt

1. **Injection at startup**: `AGENTS.md` + always-on rules + the head of `MEMORY.md` (200
   lines/25KB).
2. **Lazy injection**: the `AGENTS.md` of a subdirectory after the first read; rules with `glob`;
   `model_decision` gives only the path + description.
3. **Per-turn injection through a hook**: the `qoder-context` plugin injects a "knowledge overview"
   at `SessionStart` and `UserPromptSubmit` — visible on every turn in the research machine's logs.
   So Qoder injects context on every prompt without any tool call.
4. **Tool calls**: `SearchWorkspace` / `SearchKnowledge`.

### 2.7 Limitations and complaints

- **Opaque memory**: the overview shows only part of the set; deleting one item reveals previously
  invisible items; there is no bulk management and no full list
  ([forum 10654](https://forum.qoder.com/t/topic/10654)).
- **`MEMORY.md` out of sync with a topic file**: if you edit the file but do not update the index
  line/description, the memory is never retrieved
  ([forum 13273](https://forum.qoder.com/t/topic/13273)) — the same "two-step" failure mode Claude
  Code has.
- **Moving the project folder = losing the memory**
  ([forum 3704](https://forum.qoder.com/t/where-do-memory-files-exist/3704)).
- **Privacy**: code vectorization in the cloud; the provider key stored in plaintext in
  `settings.json` (observed on the research machine as well — the value is not quoted).

### 2.8 Qoder versus Claude Code

| | Claude Code | Qoder |
|---|---|---|
| instructions | `CLAUDE.md` + imports + `.claude/rules` | `AGENTS.md` + `.qoder/rules` with 4 triggers |
| memory | `projects/<slug>/memory/` + `MEMORY.md` + the `Memory*` tools | a port of the same + a separate IDE product (global/project) |
| retrieval | LLM selection over descriptions | the same + a vector knowledge engine for code |
| consolidation | `autoDream` | unknown/undocumented |
| synchronization | a shared store + a sync engine | cloud vectors and Knowledge Base; team memory not documented |
| model tools | `MemoryRead`/`MemoryWrite` | no memory tools; files only + `/memory manage` |

**Key conclusion:** these two are two implementations of one idea, and both share one gap — memory
is tied to the agent and to the project. Neither has a memory layer **independent of the agent**.
That is exactly what this design fills.

---

## 3. Landscape: what others have done

### 3.1 Standards: there is still no standard

- **`AGENTS.md`** is the only quasi-standard: plain markdown, no required fields, about 60 thousand
  repositories, and many readers (Codex, opencode, Cursor, Gemini CLI, Copilot, goose, Amp, …). It
  is stewarded by the Agentic AI Foundation (Linux Foundation) ([agents.md](https://agents.md/)).
- **Precedence is not uniform.** opencode itself has this order: local `AGENTS.md` →
  `~/.config/opencode/AGENTS.md` → `~/.claude/CLAUDE.md`, plus an `instructions[]` array that also
  accepts globs and remote URLs ([opencode rules](https://opencode.ai/docs/rules/)). So "the same
  shared file" is read with different rules.
- **MCP** is the standard for *transport*, but it treats two kinds of things differently: **tools**
  are called by the model and work everywhere; **resources** are attached by the host (the
  application) and their support is optional. For a portable layer, tools must be the main path and
  resources only a bonus.
- **Portable memory: there is no approved specification.** The OMPI (Open Memory Protocol
  Initiative) effort is at draft v0.2 (October 2026), with no reference implementation and no
  adoption. Cognee also built the `COGX` export format for migration between Mem0/Letta/Zep — so
  the ecosystem itself treats "a portable format" as an open problem.

The conclusion: the design should not wait for a standard, but must be **compatible with
`AGENTS.md` and MCP** — the two things everyone understands.

### 3.2 Prior art: who has done what

| System | Store | Writing | Retrieval | License |
|---|---|---|---|---|
| **mem0** | vector (+optional graph) | LLM extraction; since 2026, ADD only | semantic hybrid + BM25 + entities | Apache-2.0 |
| **Letta (MemGPT)** | in-context blocks + vector archive | agent tools + a "sleep" agent | blocks always present; vector archive | Apache-2.0 |
| **Zep/Graphiti** | a temporal graph with validity windows | extraction + dedupe; **invalidation instead of deletion** | semantic + BM25 + graph | Apache-2.0 |
| **basic-memory** | markdown + SQLite + FastEmbed | both a human and an LLM | FTS + vector | **AGPL-3.0** |
| **claude-mem** | SQLite + Chroma | **automatic**, via hooks → LLM summaries | three layers (index → summary → detail) | Apache-2.0 |
| **MemOS** | graph + Qdrant; local SQLite | LLM + an async scheduler | FTS5 + vector | Apache-2.0 |
| **cognee** | graph + vector | remember/improve | graph/vector/code routing | Apache-2.0 |
| **Memory Bank (Cline/Roo)** | markdown inside the repository | the agent **rewrites the whole file** | reading the whole file | community |

Two important observations:

1. **claude-mem** is almost exactly what this document proposes: hooks, SQLite, automatic
   summaries, and adapters for Claude Code and opencode and Qoder and DSH. Any design "from
   scratch" must explain why something new is built instead of using or forking it. (§3.6)
2. **Memory Bank** is the textbook anti-pattern: no dedupe, no index, whole-file rewrites — and it
   is where "memory rot" draws the most complaints.

### 3.3 Retrieval: the numbers and what actually matters

- In one evaluation, combining BM25 and vectors (0.694) was slightly better than BM25 alone (0.661)
  and vectors alone (0.645).
- **But on identifier-shaped questions (a function name, an error number, a CLI flag) BM25 won 40
  of 40, while vectors won 14 of 40.** And for that work, adding BM25 raised the time from 421ms to
  781ms.
- The budgets are small: mem0 about 7 thousand tokens per prompt; basic-memory turns reranking off
  by default to keep latency low.
- For a personal store (a few hundred to a few thousand memories) no independent head-to-head
  evaluation was found — that is a real gap in the literature.

**Lesson:** for coding work, questions are mostly identifier-shaped rather than semantic.
BM25/FTS5 should be the default, not vectors. That was consistent with the design at the time of
the research.

### 3.4 Integration levels (which constrain the design)

| Agent | context injection | recording/writing | tools |
|---|---|---|---|
| **Claude Code** | the `SessionStart`/`UserPromptSubmit` hooks with `additionalContext` | the `Stop`/`SessionEnd` hooks | MCP |
| **Qoder** | the same hook contract (in Codex form) | the same | MCP |
| **opencode** | **undocumented.** The only real channel: the `experimental.session.compacting` hook (it can fill `output.context` or replace the prompt). The rest: `event`, `tool{}` | the `event` hook | MCP + `instructions[]` |
| **DSH** | the `system-prompt/assemble` and `agent/created` events | `agent/turn-stopping`, `session/event` | `tools.register` |
| **anything else** | the instruction file | editing files | MCP |

This table forces one design choice: **for opencode, automatic per-turn injection cannot be
relied on.** The answer: `instructions[]` for fixed text + an MCP tool for retrieval + a compaction
hook for continuity.

### 3.5 Failure modes documented in practice

- **Rot and contradiction**: this is why "Dreams" exists in Anthropic's product — stores fill with
  duplicates, contradictions and stale entries.
- **Last write wins**: Letta documents that writing a block replaces the whole value. claude-mem
  deliberately keeps "one writer" so that conflicts between several agents do not arise.
- **Secret leakage**: Graphiti's reference servers ship explicitly without auth and without
  prompt-injection protection.
- **Unbounded extraction**: claude-mem captures every tool call and has been forced to add a
  `<private>` tag and per-project exclusion.
- **Losing memory on import**: OMPI has a separate threat model for "forgotten memories coming back
  through an import path" — exactly the problem the design at the time solved with a tombstone.

### 3.6 The lesson of building versus using

There are three real options:

1. **Use claude-mem** — mature, Apache-2.0, adapters for these same four agents. But: SQLite +
   Chroma, black-box-style automatic summaries, and the tool owns the data format.
2. **Fork/extend one of them** — faster, but every change to the format drifts the fork away from
   upstream.
3. **Build a thin layer on the shared file format** (this document's proposal) — a higher initial
   cost, but the data stays in markdown, any agent can read it even without this tool, and moving
   to any other tool is a `git clone`.

The selection criterion: if the goal is a better memory for yourself, option 1 is enough. If the
goal is "an infrastructure layer that stays independent of agent churn for years" — which is the
problem statement of this document — option 3 is justified.

---

## 4. Usable patterns (extracted from the two systems)

> **The "in this design" column is the plan at the time of the research, not the built state.**
> Since then, automatic extraction, BM25, session scope, the `decision`/`gotcha` types, the
> 200-line/25KB cap on the index, the nightly job and SQLite were dropped. What was actually built
> is [`design.md`](design.md).

| # | Pattern | Why it matters | In this design |
|---|---|---|---|
| 1 | **a small always-present index + on-demand bodies** | the 200-line/25KB cap in both systems is not arbitrary; it balances token cost and availability | the same, with a generated index and an explicit cap |
| 2 | **a two-step write (document + index line)** | a document without a reference = dead memory | the same, but the index is **regenerated** from the frontmatter so it cannot fall out of sync |
| 3 | **memory types** (`user/feedback/project/reference`) | gives selection and injection a priority | extended to `decision` and `gotcha` |
| 4 | **dual scope (global/project)** | the most benefit with the least leakage | the same + a session scope for a journal |
| 5 | **end-of-turn extraction, with a gate** | unbounded extraction = noise and cost | the same, with a heuristic gate + a session cap |
| 6 | **light selection/retrieval before injection** | injecting everything = context bloat | BM25 + priorities, no LLM on the hot path |
| 7 | **periodic consolidation** | without it, memory rots | a nightly job + a report |
| 8 | **version/provenance** | closes concurrent writes and blind overwrites | a content hash + `if_version` + origin |
| 9 | **anti-injection in memory text** | memory is a data input, not a command | normalizing markers + "data, not instruction" |
| 10 | **plain files on disk** | greppable, git-able, hand-editable | the same — with an index derived in SQLite |

---

## 5. Things that were not confirmed (and must not be quoted)

- `autoDream`'s thresholds (5 sessions? how many hours?) — a social source only.
- The exact name `/pause-memory` and the consolidation cycle's threshold.
- That the "selector" is a separate subagent with its own prompt — its prompt is in the bundle, but
  its execution architecture was not confirmed.
- The exact mapping of `Settings → Memory` in the IDE to those `~/.qoder/memory` folders (both were
  empty and auto-memory was off).
- The meaning of "maturity" in the Knowledge Center, and whether ranking happens server-side.
- The actual content of `knowledge-edit-upload` (metadata only, or content?).
- The 10,000 memories / 8 stores cap belongs to **Managed Agents**, not local Claude Code — the two
  must not be conflated.
- The existence of the `MemoryRead`/`MemoryWrite` tools was not confirmed in the documentation, but
  they are explicitly present in the `2.1.301` bundle; the official changelog also confirms "team
  memory", "memory extraction" and "memory write conflicts". So the documentation lags the build.
