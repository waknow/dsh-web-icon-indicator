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
 *   doneHoldMs     How long the done state stays before falling back to idle.
 *                  Default 5000.
 *   states         Per-state visual config, keyed by state name:
 *                    states[idle]    = { effect, colors[], speed? }
 *                    states[running] = { effect, colors[], speed? }
 *                    states[asking]  = { effect, colors[], speed? }
 *                    states[done]    = { effect, colors[], speed? }
 *                  - effect: one of `static | blink | breath | rainbow | heartbeat | bounce`.
 *                  - colors: an ARRAY of hex colors; `colors[0]` is the primary.
 *                    `blink` uses colors[0]⇄colors[1]; `breath` breathes colors[0]⇄colors[1]
 *                    (each derives a darker second color if omitted); `rainbow` uses
 *                    colors[0] only as the starting hue; the rest use colors[0].
 *                  - speed: optional per-state cycle in ms (blink toggle interval too).
 *                    Default 1200.
 *
 * The whole config surface is also registered with the DSH settings service
 * (namespace `web-icon-indicator`): validated against a schemastery schema,
 * persisted to the profile's `settings.yaml`, and editable from
 * 设置 → 插件 → 插件配置 in the Web GUI (see the `dsh.client` browser half).
 * While the profile composes no settings service, the plugin keeps working
 * exactly as before, reading the composition entry directly.
 *
 * @module dsh-web-icon-indicator
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULTS = Object.freeze({
  askingHoldMs: 3500,
  doneHoldMs: 5000,
  statusPath: "/dsh-web-icon-status.json",
  iconPathPrefix: "/dsh-web-icon-indicator",
  iconsDir: join(__dirname, "..", "icons"),
  // One entry per state. `colors` is an ARRAY so multi-color effects (blink,
  // breath, rainbow) can configure as many colors as they need. `speed` is the
  // per-state cycle length in ms (blink toggle interval too); defaults to 1200.
  states: {
    idle: { effect: "static", colors: ["#1a1a1a"] },
    running: { effect: "static", colors: ["#FACC15"] },
    asking: { effect: "blink", colors: ["#E5484D", "#FACC15"], speed: 400 },
    done: { effect: "static", colors: ["#22A06B"] },
  },
});

const DEFAULT_SPEED = 1200; // fallback cycle when a state omits `speed`
const EFFECT_NAMES = ["static", "blink", "breath", "rainbow", "heartbeat", "bounce"];
const STATE_NAMES = ["idle", "running", "asking", "done"];

/**
 * Settings namespace under which this plugin's config is registered (the
 * `web-icon-indicator:` section of the profile's settings.yaml, surfaced in
 * 设置 → 插件 → 插件配置). Lowercase kebab, per the settings domain's rule.
 */
const SETTINGS_NAMESPACE = settingsNamespace("web-icon-indicator");

/**
 * Schemastery schema mirroring `DEFAULTS`. Registered with the settings
 * service so the config is validated, persisted, and editable from the Web
 * settings page; resolution order is schema defaults → composition `base`
 * → user layer (`~/.dsh/settings.yaml`).
 */
const STATE_CONFIG_SCHEMA = z.object({
  effect: z.union(EFFECT_NAMES).default("static"),
  colors: z.array(z.string()).default(["#1a1a1a"]),
  // Missing keys are omitted by schemastery, so an absent `speed` stays
  // unset (the browser falls back to DEFAULT_SPEED).
  speed: z.number().min(1),
});

const CONFIG_SCHEMA = z.object({
  askingHoldMs: z.number().min(0).default(DEFAULTS.askingHoldMs),
  doneHoldMs: z.number().min(0).default(DEFAULTS.doneHoldMs),
  statusPath: z.string().default(DEFAULTS.statusPath),
  iconPathPrefix: z.string().default(DEFAULTS.iconPathPrefix),
  iconsDir: z.string(),
  // dict (not a four-key object): the user layer may override only some
  // states; the plugin merges the resolved value over DEFAULTS anyway.
  states: z.dict(STATE_CONFIG_SCHEMA).default(DEFAULTS.states),
});

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
    var CFG = __CFG__;          // { states: { idle:{effect,colors,speed}, running:…, asking:…, done:… } }
    var BASE = null;            // base.svg text; __COLOR__ replaced per frame
    var RE = /__COLOR__/g;
    var DEF_SPEED = 1200;       // per-state cycle fallback when speed is omitted
    var DEF_COLOR = "#1a1a1a";  // fallback primary color when a state has no colors

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
    function frameUri(fill, effect, t, speed) {
      if (!BASE) return null;
      var inner = BASE.replace(RE, fill);
      if (effect === "heartbeat" || effect === "bounce") {
        var gattr = "";
        if (effect === "heartbeat") {
          var tt = (t % speed) / speed;
          var s = 1;
          if (tt < 0.12) s = 1 + 0.16 * Math.sin(tt / 0.12 * Math.PI);
          else if (tt < 0.25) s = 1 + 0.10 * Math.sin((tt - 0.12) / 0.13 * Math.PI);
          gattr = 'transform="translate(' + CX + ' ' + CY + ') scale(' + s + ') translate(' + (-CX) + ' ' + (-CY) + ')"';
        } else {
          var dy = -Math.abs(Math.sin((t / speed) * 2 * Math.PI * 1.6)) * 6;
          gattr = 'transform="translate(0 ' + dy.toFixed(2) + ')"';
        }
        inner = inner.replace('<path id="p"', '<g ' + gattr + '><path id="p"');
        inner = inner.replace('</svg>', '</g></svg>');
      }
      return "data:image/svg+xml," + encodeURIComponent(inner);
    }

    // Consume a state's colors[] per effect. colors[0] is the primary color;
    // multi-color effects read more entries and derive a fallback when absent.
    function frameColor(cols, effect, t, speed) {
      var c0 = cols[0] || DEF_COLOR;
      var c1 = cols[1] || mix(c0, "#000000", 0.35); // derived second color if not provided
      switch (effect) {
        case "blink":
          return ((t / speed) >> 0) % 2 === 0 ? c0 : c1;
        case "breath": {
          var k = 0.5 + 0.5 * Math.sin((t / speed) * 2 * Math.PI);
          return mix(c0, c1, k);
        }
        case "rainbow":
          return hslToHex(hueOf(c0) + (t / speed) * 360, 70, 58);
        default:
          return c0;
      }
    }

    // ---- effects loop -------------------------------------------------------
    function stateCfg(state) { return (CFG.states && CFG.states[state]) || {}; }
    function isStatic(state) { return (stateCfg(state).effect || "static") === "static"; }
    function frameAt(state, t) {
      var st = stateCfg(state);
      var effect = st.effect || "static";
      var speed = st.speed || DEF_SPEED;
      var cols = (st.colors && st.colors.length) ? st.colors : [DEF_COLOR];
      return frameUri(frameColor(cols, effect, t, speed), effect, t, speed);
    }
    function stopAnim() { if (RAF) { cancelAnimationFrame(RAF); RAF = null; } }
    function apply(state) {
      var link = linkEl();
      if (!link) return;
      if (state == null) { stopAnim(); return; }
      // Animated states: keep the running loop (don't reset the phase) when the
      // state is unchanged — poll() fires every second, and without this guard
      // breath/rainbow/heartbeat/bounce would restart from phase 0 each second.
      // Static states: repaint one frame every poll so the favicon self-heals
      // if anything else (SPA re-render, another script) clobbers the href.
      if (BASE && state === PREV_STATE && !isStatic(state)) return;
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
        if (isStatic(state)) return; // single frame, no loop
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
    doneHoldMs: DEFAULTS.doneHoldMs,
    statusPath: DEFAULTS.statusPath,
    iconPathPrefix: DEFAULTS.iconPathPrefix,
    iconsDir: undefined,
    states: DEFAULTS.states,
  },
  /** Settings namespace + validation schema (exported for reuse/tooling). */
  SETTINGS_NAMESPACE,
  CONFIG_SCHEMA,
  apply(ctx) {
    const entry = ctx.get("config") || {};
    let source = () => entry;
    // Merge each configured state over its default: { effect, colors, speed }.
    // Idempotent on schema-resolved values, so it doubles as the fallback
    // normalization when the profile composes no settings service.
    const resolveConfig = (raw) => {
      const stateConfigs = {};
      for (const name of STATE_NAMES) {
        const merged = { ...(DEFAULTS.states[name] || {}), ...(raw.states?.[name] || {}) };
        // Guard against unknown effect names: fall back to "static" so the
        // browser never spins a pointless frame loop on a typo.
        if (merged.effect && EFFECT_NAMES.indexOf(merged.effect) === -1) merged.effect = "static";
        // colors: coerce a lone string into an array, drop invalid hex values,
        // and fall back to the state default when nothing valid remains.
        let cols = merged.colors;
        if (typeof cols === "string") cols = [cols];
        if (!Array.isArray(cols)) cols = [];
        cols = cols.filter((c) => typeof c === "string" && /^#[0-9a-fA-F]{3,6}$/.test(c.trim()));
        merged.colors = cols.length ? cols : [...(DEFAULTS.states[name]?.colors || ["#1a1a1a"])];
        // speed: must be a positive number; otherwise use the default (1200).
        if (typeof merged.speed !== "number" || !(merged.speed > 0)) delete merged.speed;
        stateConfigs[name] = merged;
      }
      return { ...DEFAULTS, ...raw, states: stateConfigs };
    };
    let cfg = resolveConfig(entry);
    // The injected script bakes config at injection time; rebuild it whenever
    // the settings section changes so the NEXT page load picks the new values
    // up (reload the tab — same contract as before this registration).
    const buildScript = (c) => INJECTED_SCRIPT
      .replace("__STATUS_PATH__", c.statusPath)
      .replace("__BASE_PATH__", c.iconPathPrefix + "/base.svg")
      .replace("__CFG__", JSON.stringify({ states: c.states }));
    let script = buildScript(cfg);
    let iconsDir = resolveIconsDir(cfg.iconsDir);
    installSettingsSection(ctx, SETTINGS_NAMESPACE, CONFIG_SCHEMA, entry, {
      setSource: (next) => { source = next; },
      onChange: () => {
        // Settings service mounted, or the section changed: re-resolve, then
        // mutate cfg in place so the state-machine closures (asking/done hold)
        // and the injected script see the new values immediately.
        const next = resolveConfig(source());
        cfg.askingHoldMs = next.askingHoldMs;
        cfg.doneHoldMs = next.doneHoldMs;
        cfg.statusPath = next.statusPath;
        cfg.iconPathPrefix = next.iconPathPrefix;
        if (next.iconsDir !== undefined) cfg.iconsDir = next.iconsDir;
        cfg.states = next.states;
        iconsDir = resolveIconsDir(cfg.iconsDir);
        script = buildScript(cfg);
      },
    });
    const webServer = ctx.webServer;
    const agents = ctx.agents;
    const fs = ctx.fs;
    const sp = ctx.sandboxPolicy;
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
    // `script` is rebuilt by the settings onChange hook; the tapIndex closure
    // reads the current value on every request, so a settings edit reaches the
    // next page load without a server restart.
    ctx.effect(() => webServer.tapIndex((html) => {
      if (html.indexOf("window.__DSH_WEB_ICON_INDICATOR__") !== -1) return html;
      const tag = `<script id="dsh-web-icon-indicator">${script}<\/script>`;
      if (/<\/body>/.test(html)) return html.replace(/<\/body>/, tag + "</body>");
      return html + tag;
    }));
  },
};
