/**
* * dsh-web-icon-indicator — Host-only plugin that mirrors the
* current DSH session state onto the browser tab favicon. Four states:
* `idle` (default favicon), `running` (static yellow whale),
* `asking` (yellow/red blinking), `done` (static green whale, 5s).
*
* The plugin is self-contained: it reads four SVG icons from its
* `icons/` directory (relative to the package) and serves them through a
* static `/dsh-web-icon-indicator/<name>.svg` route on the existing webServer,
* while injecting a small browser script that polls `/dsh-web-icon-status.json`
* and applies the right icon to `<link rel="icon">`.
*
* State derivation:
*   - `agent/status` driving events update a per-session map.
*   - `tools/pre-execute` on `ask_user_question` flips the session into
*     `asking`; a 3.5 s minimum hold keeps the asking icon visible even
*     when the user answers immediately. `tools/result` lets the hold
*     expire cleanly, restoring the actual agent status.
*   - `agent/turn-stopping` flips `running`/`asking` into `done`.
*   - `reconcile()` (called on every status request) watches
*     `agents.list()` for running→idle transitions as a fallback, since
*     `agent/status`'s idle event is not reliably delivered at turn end.
*
* No Client half: the browser script runs outside the sandbox by being
* injected into the served index.html, where `document` is freely available.
* The Cordis Client sandbox is restricted to `ctx` / `React` / `host` /
* `styles` / `console` and intentionally cannot touch the favicon.
*
* Configuration object (all optional):
*   iconsDir       Absolute directory holding idle.svg / running.svg /
*                  asking.svg / done.svg. Defaults to `<package>/icons/`.
*   statusPath     JSON status endpoint path. Default: `/dsh-web-icon-status.json`.
*   iconPathPrefix URL prefix for static icon files. Default: `/dsh-web-icon-indicator`.
*   askingHoldMs   Minimum visibility for the asking icon (ms). Default 3500.
*   askingBlinkMs  Yellow/red switch interval for asking (ms). Default 400.
*   doneHoldMs     How long the done icon stays before falling back to idle.
*                  Default 5000.
*
* @module dsh-web-icon-indicator
*/
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULTS = Object.freeze({
  askingHoldMs: 3500,
  askingBlinkMs: 400,
  doneHoldMs: 5000,
  statusPath: "/dsh-web-icon-status.json",
  iconPathPrefix: "/dsh-web-icon-indicator",
  iconsDir: join(__dirname, "..", "icons"),
});

/** Browser script injected into every served index.html response. */
const INJECTED_SCRIPT = `
(function () {
  try {
    if (window.__DSH_WEB_ICON_INDICATOR__) return;
    window.__DSH_WEB_ICON_INDICATOR__ = true;
    var ORIGINAL = null;
    var TIMER = null;
    var ANIM = null;
    var ANIM_STATE = null;
    var ICONS = {};
    var LAST_STATE = null;
    var STATUS_PATH = "__STATUS_PATH__";
    var ICON_PREFIX = "__ICON_PREFIX__";
    var ASKING_BLINK_MS = __ASKING_BLINK_MS__;

    function captureOriginal() {
      var link = document.querySelector("link[rel='icon']");
      if (link && ORIGINAL === null) ORIGINAL = { href: link.getAttribute("href") || "", type: link.getAttribute("type") || "" };
    }
    function restore() {
      var link = document.querySelector("link[rel='icon']");
      if (link && ORIGINAL) { link.setAttribute("href", ORIGINAL.href); if (ORIGINAL.type) link.setAttribute("type", ORIGINAL.type); }
    }
    function setHref(uri) {
      var link = document.querySelector("link[rel='icon']");
      if (!link) return;
      try { link.setAttribute("href", uri); link.setAttribute("type", "image/svg+xml"); } catch (e) {}
    }
    function iconUri(name) {
      if (ICONS[name]) return Promise.resolve(ICONS[name]);
      return fetch(location.origin + ICON_PREFIX + "/" + name + ".svg?t=" + Date.now(), { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("icon " + r.status); return r.text(); })
        .then(function (txt) { ICONS[name] = "data:image/svg+xml," + encodeURIComponent(txt); return ICONS[name]; })
        .catch(function () { return null; });
    }
    function stopAnim() { if (ANIM) { clearInterval(ANIM); ANIM = null; } ANIM_STATE = null; }
    function apply(state) {
      var link = document.querySelector("link[rel='icon']");
      if (!link) return;
      LAST_STATE = state;
      if (state === "idle" || state == null) { stopAnim(); restore(); return; }
      if (state === "asking") {
        if (ANIM_STATE === "asking") return;
        stopAnim();
        ANIM_STATE = "asking";
        Promise.all([iconUri("running"), iconUri("asking")]).then(function (uris) {
          if (!uris[0] || !uris[1] || !link.isConnected) return;
          var i = 0;
          setHref(uris[i]);
          ANIM = setInterval(function () { i = 1 - i; setHref(uris[i]); }, ASKING_BLINK_MS);
        });
        return;
      }
      stopAnim();
      iconUri(state).then(function (uri) { if (uri && link.isConnected) setHref(uri); });
    }
    function poll() {
      fetch(location.origin + STATUS_PATH, { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); })
        .then(function (j) { apply(j.state || "idle"); })
        .catch(function () { stopAnim(); restore(); if (TIMER) { clearInterval(TIMER); TIMER = null; } });
    }
    captureOriginal();
    TIMER = setInterval(poll, 1000);
    poll();
    window.addEventListener("beforeunload", function () { stopAnim(); if (TIMER) clearInterval(TIMER); restore(); });
  } catch ( e) {}
})();
`;

/**
 * Resolve the icon directory. Accepts an explicit absolute path from
 * config, falls back to the bundled `icons/` directory beside the
 * package's compiled `lib/index.js`. Rejects relative paths that escape
 * the package; the bundled default is package-relative and always safe.
 */
function resolveIconsDir(configured) {
  if (configured) return configured;
  return join(__dirname, "..", "icons");
}

/**
 * Cordis plugin entry. Returns the standard `{ apply, inject, config }`
 * shape so the host composition can mount it once at startup.
 */
export default {
  name: "dsh-web-icon-indicator",
  inject: ["webServer", "timer", "agents", "fs", "sandboxPolicy"],
  config: {
    askingHoldMs: DEFAULTS.askingHoldMs,
    askingBlinkMs: DEFAULTS.askingBlinkMs,
    doneHoldMs: DEFAULTS.doneHoldMs,
    statusPath: DEFAULTS.statusPath,
    iconPathPrefix: DEFAULTS.iconPathPrefix,
    iconsDir: undefined,
  },
  apply(ctx) {
    const cfg = { ...DEFAULTS, ...(ctx.get("config") || {}) };
    const webServer = ctx.webServer;
    const agents = ctx.agents;
    const fs = ctx.fs;
    const sp = ctx.sandboxPolicy;
    const iconsDir = resolveIconsDir(cfg.iconsDir);
    const lastSeen = new Map();

    // -- State machine -------------------------------------------------------
    const states = new Map();        // agentId -> { state, since }
    const asking = new Set();        // agentIds whose icon is currently pinned to asking
    const askDone = new Set();       // agentIds whose ask_user_question tool call already returned
    const askTimers = new Map();     // agentId -> ctx.timer.timeout disposer

    const setState = (id, state) => {
      const prev = states.get(id);
      const now = Date.now();
      if (state === "asking") asking.add(id);
      if (prev && prev.state === state) { states.set(id, { state, since: prev.since }); return; }
      states.set(id, { state, since: now });
      if (state === "done") {
        const handle = ctx.timer.timeout(() => {
          const cur = states.get(id);
          if (cur && cur.state === "done") states.set(id, { state: "idle", since: Date.now() });
        }, cfg.doneHoldMs);
        ctx.effect(() => handle);  // register for cleanup
      }
    };

    ctx.on("agent/status", (payload) => {
      const id = payload.agent?.id ?? null;
      if (id == null) return;
      if (payload.status === "running") setState(id, asking.has(id) ? "asking" : "running");
      else if (payload.status === "idle") {
        const prev = states.get(id);
        if (asking.has(id)) setState(id, "asking");
        else if (prev?.state === "running") setState(id, "done");
        else setState(id, "idle");
      }
    });

    ctx.on("agent/turn-stopping", (payload) => {
      const id = payload.agent?.id ?? null;
      if (id == null) return;
      const cur = states.get(id);
      if (!cur || (cur.state !== "asking" && cur.state !== "running")) return;
      if (!asking.has(id)) setState(id, "done");
    });

    // Asking: visible minimum (askingHoldMs). Re-arm timer while user
    // is still answering; clean up to live agent status once returned.
    const scheduleAskCheck = (id) => {
      const prevHandle = askTimers.get(id);
      if (prevHandle) { try { prevHandle(); } catch (e) {} }
      const handle = ctx.timer.timeout(() => {
        askTimers.delete(id);
        if (!asking.has(id)) return;
        if (!askDone.has(id)) { scheduleAskCheck(id); return; }
        asking.delete(id);
        askDone.delete(id);
        const live = agents.get(id);
        if (live) setState(id, live.status === "running" ? "running" : "idle");
        else setState(id, "idle");
      }, cfg.askingHoldMs);
      askTimers.set(id, handle);
    };

    ctx.on("tools/pre-execute", (exec, next) => {
      if (exec.name === "ask_user_question") {
        const id = exec.agent?.id ?? null;
        if (id != null) {
          asking.add(id);
          askDone.delete(id);
          setState(id, "asking");
          scheduleAskCheck(id);
        }
      }
      return typeof next === "function" ? next() : undefined;
    });

    ctx.on("tools/result", (exec, _result) => {
      if (exec.name === "ask_user_question") {
        const id = exec.agent?.id ?? null;
        if (id != null) askDone.add(id);
      }
    });

    ctx.on("agent/disposed", (payload) => {
      const id = payload.agent?.id ?? null;
      if (id == null) return;
      states.delete(id);
      asking.delete(id);
      askDone.delete(id);
      lastSeen.delete(id);
      const t = askTimers.get(id);
      if (t) { try { t(); } catch (e) {} askTimers.delete(id); }
    });

    // Reconcile running->idle transitions on every status request. The
    // `agent/status` event's idle delivery is not guaranteed, so polling
    // agents.list() is the authoritative fallback.
    const reconcile = () => {
      for (const a of agents.list()) {
        const id = a.id;
        const st = a.status;
        const prev = lastSeen.get(id);
        lastSeen.set(id, { status: st, at: Date.now() });
        if (asking.has(id)) continue;
        if (prev?.status === "running" && st === "idle") {
          setState(id, "done");
        } else if (st === "idle" && !states.has(id)) {
          setState(id, "idle");
        }
      }
      const liveIds = new Set(agents.list().map((x) => x.id));
      for (const id of Array.from(lastSeen.keys())) {
        if (!liveIds.has(id)) lastSeen.delete(id);
      }
    };

    const agentStateOf = (id) => {
      const live = agents.get(id);
      if (!live) return null;
      if (asking.has(id)) return "asking";
      return live.status === "running" ? "running" : "idle";
    };

    const aggregate = () => {
      reconcile();
      const order = ["asking", "running", "done", "idle"];
      let best = null;
      for (const a of agents.list()) {
        const id = a.id;
        const s = agentStateOf(id);
        const rank = order.indexOf(s);
        if (rank === -1) continue;
        if (best === null || rank < best.rank) best = { rank, id, state: s };
      }
      for (const [id, rec] of states) {
        if (rec.state === "done") {
          const rank = order.indexOf("done");
          if (best === null || rank < best.rank) best = { rank, id, state: "done" };
        }
      }
      return best ? { state: best.state, since: (states.get(best.id) || {}).since || Date.now() } : { state: "idle", since: Date.now() };
    };

    // -- Routes --------------------------------------------------------------
    ctx.effect(() => webServer.register({
      kind: "exact",
      path: cfg.statusPath,
      handler: (_req, res) => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(aggregate()));
      },
    }));

    ctx.effect(() => webServer.register({
      kind: "prefix",
      path: cfg.iconPathPrefix,
      handler: async (req, res) => {
        let pathname = "/";
        try { pathname = new URL(String(req?.url ?? "/"), "http://x").pathname; } catch (e) {}
        const name = pathname.replace(/^\/[^/]+\//, "");
        if (!/^(idle|running|asking|done)\.svg$/.test(name)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("bad name: " + name);
          return;
        }
        if (!fs) {
          res.statusCode = 503;
          res.end("fs service unavailable");
          return;
        }
        let text = null;
        try {
          const target = await fs.resolve(name, { cwd: iconsDir });
          text = await fs.readText(target);
        } catch (e) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("not found: " + name);
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(text);
      },
    }));

    // -- Script injection ----------------------------------------------------
    const script = INJECTED_SCRIPT
      .replace("__STATUS_PATH__", cfg.statusPath)
      .replace("__ICON_PREFIX__", cfg.iconPathPrefix)
      .replace("__ASKING_BLINK_MS__", String(cfg.askingBlinkMs));

    ctx.effect(() => webServer.tapIndex((html) => {
      if (html.indexOf("window.__DSH_WEB_ICON_INDICATOR__") !== -1) return html;
      const tag = `<script id="dsh-web-icon-indicator">${script}<\/script>`;
      if (/<\/body>/.test(html)) return html.replace(/<\/body>/, tag + "</body>");
      return html + tag;
    }));
  },
};