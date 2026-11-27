/**
 * Load the memgrove index into an OpenCode session's system context.
 *
 * MCP has no channel that pushes data into a session, and a client that defers
 * MCP tool discovery can hide the server's instructions until the model
 * searches. This plugin asks the memgrove CLI for the rendered index and adds
 * it to the system instructions of each model request: no instruction-entry
 * size limit, and a compaction that drops the index is covered by the next
 * request. The store logic stays in Python; this file only moves text across.
 *
 * `memgrove hooks install opencode` installs this file, a generated launcher
 * next to it, and replaces the command below with that launcher.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
// The installer replaces this with the generated launcher, which adds
// "hooks run" itself. MEMGROVE_BIN is an escape hatch for a moved install.
const MEMGROVE = process.env.MEMGROVE_BIN
  ? [process.env.MEMGROVE_BIN, "hooks", "run"]
  : /* @memgrove-command */ ["memgrove", "hooks", "run"];
const TIMEOUT_MS = 10_000;
const SESSION_LOOKUP_MS = 2_000;
const MAX_OUTPUT = 16 * 1024 * 1024;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_CACHED_SESSIONS = 200;

export default {
  id: "memgrove",

  async setup(ctx) {
    const warned = new Set();
    /** Latest rendered index per session; the prompt hook refreshes it. */
    const cache = new Map();
    let cachedBytes = 0;

    function warnOnce(key, message) {
      if (warned.has(key)) return;
      warned.add(key);
      console.warn(`memgrove: ${message}`);
    }

    // Keep the current session's text even when it alone exceeds the budget:
    // dropping it would make the next request render again.
    function remember(sessionID, text) {
      if (cache.has(sessionID)) {
        cachedBytes -= Buffer.byteLength(cache.get(sessionID), "utf8");
        cache.delete(sessionID);
      }
      cache.set(sessionID, text);
      cachedBytes += Buffer.byteLength(text, "utf8");
      while (
        cache.size > 1 &&
        (cachedBytes > MAX_CACHE_BYTES || cache.size > MAX_CACHED_SESSIONS)
      ) {
        const [key, value] = cache.entries().next().value;
        cache.delete(key);
        cachedBytes -= Buffer.byteLength(value, "utf8");
      }
    }

    async function sessionDirectory(sessionID) {
      try {
        const session = await Promise.race([
          ctx.session.get({ sessionID }),
          new Promise((_, reject) => {
            const timer = setTimeout(
              () => reject(new Error("session lookup timed out")),
              SESSION_LOOKUP_MS,
            );
            timer.unref?.();
          }),
        ]);
        const directory = session.location?.directory;
        if (typeof directory === "string" && directory !== "") return directory;
      } catch (error) {
        warnOnce("session-read", `reading session ${sessionID} failed: ${error?.message ?? error}`);
      }
      return ctx.location?.directory ?? process.cwd();
    }

    async function renderIndex(sessionID) {
      const cwd = await sessionDirectory(sessionID);
      try {
        const { stdout } = await run(
          MEMGROVE[0],
          [...MEMGROVE.slice(1), "context", "--cwd", cwd],
          { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT, windowsHide: true },
        );
        const text = stdout.trimEnd();
        remember(sessionID, text);
        return text;
      } catch (error) {
        warnOnce("index", `loading the index failed: ${error?.message ?? error}`);
        const fallback = cache.get(sessionID) ?? "";
        // Cache the fallback too: a broken launcher must not spawn on every
        // model request in the turn. The next prompt retries.
        remember(sessionID, fallback);
        return fallback;
      }
    }

    // Refresh on every prompt, not only the first: a write in this session or
    // from another agent must appear on the next request. The text is cached
    // for the context hook, which runs before every model request.
    const prompt = await ctx.session.hook("prompt", async (event) => {
      const sessionID = event.sessionID ?? event.session?.id;
      if (typeof sessionID !== "string" || sessionID === "") return;
      await renderIndex(sessionID);
    });

    const context = await ctx.session.hook("context", async (event) => {
      const sessionID = event.sessionID;
      if (typeof sessionID !== "string" || sessionID === "") return;
      const text = cache.has(sessionID)
        ? cache.get(sessionID)
        : await renderIndex(sessionID);
      if (text === "") return;
      const already = event.system.some(
        (part) => part.type === "text" && part.text === text,
      );
      if (!already) event.system.push({ type: "text", text });
    });

    return () => {
      prompt?.dispose?.();
      context?.dispose?.();
    };
  },
};
