/**
 * * dsh-web-icon-indicator — Host-only plugin that mirrors the
 * current DSH session state onto the browser tab favicon. Four states:
 * `idle` (default favicon), `running` (static), `asking` (blinks),
 * `done` (static, 5s hold).
 *
 * Unlike a per-state-SVG icon set, this plugin ships ONE base SVG
 * (`icons/base.svg` — the DeepSeek whale outline with a `__COLOR__`
 * placeholder) and recolors / animates it **directly in the browser**.
 * The injected script builds each favicon frame as a `data:image/svg+xml,…`
 * URI by replacing the fill color (and, for animated effects, injecting a
 * transform) on every frame. Because a favicon is a plain image, SVG CSS
 * animations never run inside the tab, so all motion is JS-driven: each
 * state maps to a user-configurable color + effect.
 *
 * State derivation (unchanged):
 *   - `agent/status` driving events update a per-session map.
 *   - `tools/pre-execute` on `ask_user_question` flips the session into
 *     `asking`; a minimum hold keeps the asking effect visible even when the
 *     user answers immediately. `tools/result` lets the hold expire cleanly.
 *   - `session/event` on `approval/asked` / `approval/decided` pins the
 *     session into `asking` while the agent waits on the user for a
 *     permission decision (covers sandbox escalations too).
 *   - `agent/turn-stopping` flips `running`/`asking` into `done`.
 *   - `reconcile()` (on every status request) watches `agents.list()` for
 *     running→idle transitions as a fallback.
 *
 * No Client half: the browser script runs outside the sandbox by being
 * injected into the served index.html, where `document` is freely available.
 *
 * Configuration object (all optional):
 *   iconsDir       Absolute directory holding base.svg. Default `<package>/icons/`.
 *   statusPath     JSON status endpoint path. Default `/dsh-web-icon-status.json`.
 *   iconPathPrefix URL prefix for static icon files. Default `/dsh-web-icon-indicator`.
 *   askingHoldMs   Minimum visibility for the asking state (ms). Default 3500.
 *   askingBlinkMs  Frame interval for the `blink` effect (ms). Default 400.
 *   doneHoldMs     How long the done state stays before falling back to idle.
 *                  Default 5000.
 *   effectSpeedMs  Cycle length for breath/rainbow/heartbeat/bounce (ms).
 *                  Default 1200.
 *   colors         Per-state fill color: { idle, running, asking, done }. Hex.
 *   effects        Per-state animation: { idle, running, asking, done }, each one
 *                  of `static | blink | breath | rainbow | heartbeat | bounce`.
 *                  Defaults: idle/running/done = static, asking = blink.
 *   blinkColor     The second color of a `blink` effect (hex). Default = running color.
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
  effectSpeedMs: 1200,
  statusPath: "/dsh-web-icon-status.json",
  iconPathPrefix: "/dsh-web-icon-indicator",
  iconsDir: join(__dirname, "..", "icons"),
  colors: { idle: "#1a1a1a", running: "#FACC15", asking: "#E5484D", done: "#22A06B" },
  effects: { idle: "static", running: "static", asking: "blink", done: "static" },
  blinkColor: "#FACC15",
});

const EFFECT_NAMES = ["static", "blink", "breath", "rainbow", "heartbeat", "bounce"];
const STATE_NAMES = ["idle", "running", "asking", "done"];

/** Browser script injected into every served index.html response. */
const INJECTED_SCRIPT = `
(function () {
  try {
    if (window.__DSH_WEB_ICON_INDICATOR__) return;
    window.__DSH_WEB_ICON_INDICATOR__ = true;
    var ORIGINAL = null;
    var TIMER = null;
    var RAF = null;
    var PREV_STATE = null;   // state the current animation loop was started for
    var STATUS_PATH = "__STATUS_PATH__";
    var BASE_PATH = "__BASE_PATH__";
    var CFG = __CFG__;          // { colors, effects, blinkColor, askingBlinkMs, effectSpeedMs }
    var BASE = null;            // base.svg text; __COLOR__ replaced per frame
    var RE = /__COLOR__/g;

    // Whale geometry (used as the transform pivot for scale/translate effects).
    var CX = 27.889625, CY = 24.952640;

    function captureOriginal() {
      var link = document.querySelector("link[rel='icon']");
      if (link && ORIGINAL === null) ORIGINAL = { href: link.getAttribute("href") || "", type: link.getAttribute("type") || "" };
    }
    function restore() {
      var link = document.querySelector("link[rel='icon']");
      if (link && ORIGINAL) { link.setAttribute("href", ORIGINAL.href); if (ORIGINAL.type) link.setAttribute("type", ORIGINAL.type); }
    }
    function linkEl() { return document.querySelector("link[rel='icon']"); }
    function setHref(uri) {
      var link = linkEl();
      if (!link) return;
      try { link.setAttribute("href", uri); link.setAttribute("type", "image/svg+xml"); } catch (e) {}
    }

    // ---- color helpers ------------------------------------------------------
    function hexToRgb(h) {
      h = String(h).replace('#', '');
      if (h.length === 3) h = h.charAt(0)+h.charAt(0)+h.charAt(1)+h.charAt(1)+h.charAt(2)+h.charAt(2);
      var n = parseInt(h, 16);
      return [(n>>16)&255, (n>>8)&255, n&255];
    }
    function rgbToHex(r, g, b) {
      return '#' + [r, g, b].map(function (v) {
        v = Math.round(v); if (v < 0) v = 0; if (v > 255) v = 255;
        return ('0' + v.toString(16)).slice(-2);
      }).join('');
    }
    function mix(a, b, t) {
      var ca = hexToRgb(a), cb = hexToRgb(b);
      return rgbToHex(ca[0]+(cb[0]-ca[0])*t, ca[1]+(cb[1]-ca[1])*t, ca[2]+(cb[2]-ca[2])*t);
    }
    function hslToHex(h, s, l) {
      h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
      var c = (1 - Math.abs(2*l - 1)) * s, x = c * (1 - Math.abs((h/60)%2 - 1)), m = l - c/2, r = 0, g = 0, b = 0;
      if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
      else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
      return rgbToHex((r+m)*255, (g+m)*255, (b+m)*255);
    }
    function hueOf(hex) {
      var c = hexToRgb(hex).map(function (v) { return v/255; });
      var max = Math.max.apply(null, c), min = Math.min.apply(null, c), d = max - min, h = 0;
      if (d) {
        if (max === c[0]) h = ((c[1] - c[2]) / d) % 6;
        else if (max === c[1]) h = (c[2] - c[0]) / d + 2;
        else h = (c[0] - c[1]) / d + 4;
        h *= 60; if (h < 0) h += 360;
      }
      return h;
    }

    // ---- svg frame builder --------------------------------------------------
    // Reuses the fetched base template; replaces its __COLOR__ token (and,
    // for scale/translate effects, wraps the whale in a <g transform>).
    function frameUri(fill, effect, t) {
      if (!BASE) return null;
      var inner = BASE.replace(RE, fill);
      if (effect === "heartbeat" || effect === "bounce") {
        var gattr = "";
        if (effect === "heartbeat") {
          var tt = (t % CFG.effectSpeedMs) / CFG.effectSpeedMs;
          var s = 1;
          if (tt < 0.12) s = 1 + 0.16 * Math.sin(tt / 0.12 * Math.PI);
          else if (tt < 0.25) s = 1 + 0.10 * Math.sin((tt - 0.12) / 0.13 * Math.PI);
          gattr = 'transform="translate(' + CX + ' ' + CY + ') scale(' + s + ') translate(' + (-CX) + ' ' + (-CY) + ')"';
        } else {
          var dy = -Math.abs(Math.sin((t / CFG.effectSpeedMs) * 2 * Math.PI * 1.6)) * 6;
          gattr = 'transform="translate(0 ' + dy.toFixed(2) + ')"';
        }
        inner = inner.replace('<path id="p"', '<g ' + gattr + '><path id="p"');
        inner = inner.replace('</svg>', '</g></svg>');
      }
      return "data:image/svg+xml," + encodeURIComponent(inner);
    }

    function frameColor(fill, effect, t) {
      switch (effect) {
        case "blink":
          return ((t / CFG.askingBlinkMs) >> 0) % 2 === 0 ? fill : CFG.blinkColor;
        case "breath": {
          var dark = mix(fill, "#000000", 0.35);
          var k = 0.5 + 0.5 * Math.sin((t / CFG.effectSpeedMs) * 2 * Math.PI);
          return mix(dark, fill, k);
        }
        case "rainbow": {
          var base = hueOf(fill);
          return hslToHex(base + (t / CFG.effectSpeedMs) * 360, 70, 58);
        }
        default:
          return fill;
      }
    }

    // ---- effects loop -------------------------------------------------------
    function frameAt(state, t) {
      var fill = (CFG.colors && CFG.colors[state]) || "#1a1a1a";
      var effect = (CFG.effects && CFG.effects[state]) || "static";
      return frameUri(frameColor(fill, effect, t), effect, t);
    }
    function stopAnim() { if (RAF) { cancelAnimationFrame(RAF); RAF = null; } }
    function apply(state) {
      var link = linkEl();
      if (!link) return;
      if (state == null) { stopAnim(); return; }
      // Only (re)start the animation loop when the state actually changed.
      // poll() fires every second; without this guard continuous effects
      // (breath/rainbow/heartbeat/bounce) would reset their phase each second.
      if (BASE && state === PREV_STATE) return;
      PREV_STATE = state;
      stopAnim();
      if (!BASE) { // base.svg not loaded yet — fetch once, then start
        fetch(location.origin + BASE_PATH + "?t=" + Date.now(), { cache: "no-store" })
          .then(function (r) { if (!r.ok) throw new Error("base " + r.status); return r.text(); })
          .then(function (txt) { BASE = txt; PREV_STATE = null; apply(state); })
          .catch(function () {});
        return;
      }
      var t0 = null;
      // rAF drives every effect. For "static" we paint one frame and stop;
      // animated effects keep looping.
      var step = function (now) {
        if (t0 === null) t0 = now;
        var uri = frameAt(state, now - t0);
        if (uri && link.isConnected) setHref(uri);
        if (CFG.effects[state] === "static") return; // single frame, no loop
        RAF = requestAnimationFrame(step);
      };
      RAF = requestAnimationFrame(step);
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
  } catch (e) { }
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
    effectSpeedMs: DEFAULTS.effectSpeedMs,
    statusPath: DEFAULTS.statusPath,
    iconPathPrefix: DEFAULTS.iconPathPrefix,
    iconsDir: undefined,
    colors: DEFAULTS.colors,
    effects: DEFAULTS.effects,
    blinkColor: DEFAULTS.blinkColor,
  },
  apply(ctx) {
    const cfg = {
      ...DEFAULTS,
      ...(ctx.get("config") || {}),
      colors: { ...DEFAULTS.colors, ...((ctx.get("config") || {}).colors || {}) },
      effects: { ...DEFAULTS.effects, ...((ctx.get("config") || {}).effects || {}) },
    };
    const webServer = ctx.webServer;
    const agents = ctx.agents;
    const fs = ctx.fs;
    const sp = ctx.sandboxPolicy;
    const iconsDir = resolveIconsDir(cfg.iconsDir);
    const lastSeen = new Map();
    void sp; // sandboxPolicy injection is currently unused — reserved for future file-access policy

    // -- State machine -------------------------------------------------------
    const states = new Map();        // agentId -> { state, since }
    const asking = new Set();        // agentIds whose icon is currently pinned to asking
    const askDone = new Set();       // agentIds whose ask_user_question tool call already returned
    const askTimers = new Map();     // agentId -> ctx.timer.timeout disposer
    const pendingApprovals = new Set(); // agentIds with an open approval/asked (waiting on the user)

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

    // Approval waits (sandbox interceptions, permission prompts): the agent
    // blocks on the user for an `approval/asked` decision, so pin the session
    // into `asking` exactly like ask_user_question.
    ctx.on("session/event", (session, event) => {
      const id = session?.id ?? event?.sessionId ?? null;
      if (id == null || !event || (event.type !== "approval/asked" && event.type !== "approval/decided")) return;
      if (event.type === "approval/asked") {
        if (pendingApprovals.has(id)) return;
        pendingApprovals.add(id);
        asking.add(id);
        askDone.delete(id);
        setState(id, "asking");
      } else {
        if (!pendingApprovals.has(id)) return;
        pendingApprovals.delete(id);
        asking.delete(id);
        const live = agents.get(id);
        setState(id, live && live.status === "running" ? "running" : "idle");
      }
    });

    ctx.on("agent/disposed", (payload) => {
      const id = payload.agent?.id ?? null;
      if (id == null) return;
      states.delete(id);
      asking.delete(id);
      askDone.delete(id);
      pendingApprovals.delete(id);
      lastSeen.delete(id);
      const t = askTimers.get(id);
      if (t) { try { t(); } catch (e) {} askTimers.delete(id); }
    });

    // Authoritative pending-approval check: fold the live session's event log
    // for an `approval/asked` that no `approval/decided` has closed.
    const hasPendingApproval = (live) => {
      const events = live?.session?.events;
      if (!Array.isArray(events)) return false;
      const open = new Set();
      for (const ev of events) {
        if (ev.type === "approval/asked") open.add(ev.data?.id);
        else if (ev.type === "approval/decided") open.delete(ev.data?.id);
      }
      return open.size > 0;
    };

    // Reconcile running->idle transitions on every status request.
    const reconcile = () => {
      for (const a of agents.list()) {
        const id = a.id;
        const st = a.status;
        const prev = lastSeen.get(id);
        lastSeen.set(id, { status: st, at: Date.now() });
        if (asking.has(id) || hasPendingApproval(a)) continue;
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
      if (asking.has(id) || hasPendingApproval(live)) return "asking";
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

    // Serve ONLY the base template (base.svg). The browser recolors/animate it.
    ctx.effect(() => webServer.register({
      kind: "prefix",
      path: cfg.iconPathPrefix,
      handler: async (req, res) => {
        let pathname = "/";
        try { pathname = new URL(String(req?.url ?? "/"), "http://x").pathname; } catch (e) {}
        const name = pathname.replace(/^\/[^/]+\//, "");
        if (!/^base\.svg$/.test(name)) {
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
      .replace("__BASE_PATH__", cfg.iconPathPrefix + "/base.svg")
      .replace("__CFG__", JSON.stringify({
        colors: cfg.colors,
        effects: cfg.effects,
        blinkColor: cfg.blinkColor,
        askingBlinkMs: cfg.askingBlinkMs,
        effectSpeedMs: cfg.effectSpeedMs,
      }));

    ctx.effect(() => webServer.tapIndex((html) => {
      if (html.indexOf("window.__DSH_WEB_ICON_INDICATOR__") !== -1) return html;
      const tag = `<script id="dsh-web-icon-indicator">${script}<\/script>`;
      if (/<\/body>/.test(html)) return html.replace(/<\/body>/, tag + "</body>");
      return html + tag;
    }));
  },
};
