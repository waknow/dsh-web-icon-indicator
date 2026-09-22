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
 *   - A lost `tools/result` cannot pin `asking` forever either: the hold keeps
 *     re-arming while the agent is still `running` (the user may be deciding),
 *     and force-releases against live status once the turn ends.
 *   - `reconcile()` (on every status request) watches `agents.list()` for
 *     running→idle transitions as a fallback.
 *   - The status endpoint also reports `active` — the number of non-idle
 *     agents (asking / running / done). While more than one agent is active
 *     the favicon shows that count as a full-frame number block (filled with
 *     the aggregate state's color/effect, "满幅数字" per demo/badge.html)
 *     instead of the whale; with 0–1 active agents the whale is drawn as
 *     before.
 *
 * No Client half: the browser script runs outside the sandbox by being
 * injected into the served index.html, where `document` is freely available.
 *
 * Configuration object (all optional):
 *   iconsDir       Absolute directory holding base.svg. Default `<package>/icons/`.
 *   statusPath     JSON status endpoint path. Default `/dsh-web-icon-status.json`.
 *                  Registration-time (non-volatile): composition entry only.
 *   iconPathPrefix URL prefix for static icon files. Default `/dsh-web-icon-indicator`.
 *                  Registration-time (non-volatile): composition entry only.
 *   askingHoldMs   Minimum visibility for the asking state (ms). Default 3500.
 *   doneHoldMs     How long the done state stays before falling back to idle.
 *                  Default 5000.
 *   defaultColor   Default icon color — the idle whale's primary color, as
 *                  `#rgb` / `#rrggbb`. Absent = the idle state's own colors[0]
 *                  (today's behavior). Give each DSH instance (its own profile /
 *                  user settings layer) a different value to tell their browser
 *                  tabs apart. A value perceptually too close to another state's
 *                  color raises a WARNING — surfaced in the settings card, in
 *                  the host log, and as `warnings` on the status endpoint — but
 *                  is still honored.
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
 * The whole config surface is the plugin's Cordis `Config` schema (exported as
 * both `Config` and `CONFIG_SCHEMA`), and the same schema is registered with
 * the LEGACY settings service when the running host still exposes
 * `installSection` — one bundle serves every published host generation:
 *
 *   - DSH ≥ 0.1.7: the settings service projects the schema's `.volatile()`
 *     fields into a live form, persisted into the profile patch
 *     (`~/.dsh/profiles/<profile>/cordis.patch.yml`); a write mutates the
 *     running plugin's config references in place and emits
 *     `loader/volatile-update` instead of restarting it.
 *   - DSH ≤ 0.1.6-alpha.1: the plugin registers the namespace itself under
 *     `web-icon-indicator` and the service drives it through
 *     `setSource`/`onChange`, persisted into `~/.dsh/settings.yaml`.
 *
 * `statusPath` / `iconPathPrefix` stay non-volatile in both. When the profile
 * composes no settings service at all, the plugin keeps working on the
 * composition entry + defaults it was mounted with.
 *
 * @module dsh-web-icon-indicator
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";

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
 * Settings namespace of this plugin on the MODERN host line (DSH ≥ 0.1.7):
 * the settings namespace IS the profile entry id (`schema(entry)` reads
 * `entry.fiber.runtime.Config` and `describe()` keys every form by
 * `entry.options.id`), and this plugin's bundle patch declares exactly one row:
 * `dsh-web-icon-indicator`. The browser half reads the same namespace through
 * `ctx.configForms.get(...)`, so the two halves must keep this literal in sync
 * (it is also the row id in `cordis.patch.yml`).
 */
const SETTINGS_NAMESPACE = "dsh-web-icon-indicator";

/**
 * Settings namespace on the LEGACY host line (DSH ≤ 0.1.6-alpha.1), where the
 * consumer-owned namespace is an arbitrary string it passes to
 * `settings.installSection` and the settings document section is named after
 * it. Kept at the historical value so an existing 0.5.x user's
 * `web-icon-indicator:` section keeps working after this upgrade; the browser
 * half binds its legacy scope to the same string.
 */
const LEGACY_SETTINGS_NAMESPACE = "web-icon-indicator";

/**
 * Mark one field as LIVE when the resolved schemastery supports it.
 *
 * `.volatile()` exists since schemastery 3.18.3 and is what makes the modern
 * settings service render a field at all (`volatileForm()` keeps volatile
 * fields only) and what makes a settings write mutate the running plugin's
 * references + emit `loader/volatile-update` instead of restarting it. On the
 * legacy host line the installed schemastery (3.18.2) has no `.volatile()`,
 * and the legacy settings service owns the whole live-form lifecycle through
 * `installSection`/`setSource`/`onChange`, so the same schema object works
 * unwrapped there.
 */
const LIVE = (schema) => (typeof schema.volatile === "function" ? schema.volatile() : schema);

/**
 * Schemastery schema mirroring `DEFAULTS`. Exported as the plugin's `Config`,
 * which is what the Cordis loader validates the composition row against and
 * what the modern host settings service projects into its live form
 * (`volatileForm` keeps only `.volatile()` fields, so the settings page can
 * never advertise a key it cannot honor).
 *
 * `.volatile()` marks a field as LIVE: the loader commits a settings write
 * into the running fiber's references and emits `loader/volatile-update`
 * instead of restarting the plugin (see `apply`). Ordinary (non-volatile)
 * fields — `statusPath` / `iconPathPrefix` — are baked into the route table
 * and the injected script at registration time, so a document change to them
 * could never take effect; keeping them non-volatile removes them from the
 * live form while still validating the composition entry.
 */
const STATE_CONFIG_SCHEMA = z.object({
  effect: z.union(EFFECT_NAMES).default("static"),
  colors: z.array(z.string()).default(["#1a1a1a"]),
  // Missing keys are omitted by schemastery, so an absent `speed` stays
  // unset (the browser falls back to DEFAULT_SPEED).
  speed: z.number().min(1),
});

const CONFIG_SCHEMA = z.object({
  askingHoldMs: LIVE(z.number().min(0).default(DEFAULTS.askingHoldMs)),
  doneHoldMs: LIVE(z.number().min(0).default(DEFAULTS.doneHoldMs)),
  // Default icon color (`#rgb` / `#rrggbb`). Deliberately WITHOUT a schema
  // default: an absent value keeps the idle state's own colors[0], exactly as
  // before this key existed. `resolveConfig` folds a valid value into
  // `states.idle.colors[0]` and drops an invalid one with a warning.
  defaultColor: LIVE(z.string()),
  iconsDir: LIVE(z.string()),
  // dict (not a four-key object): the user layer may override only some
  // states; the plugin merges the resolved value over DEFAULTS anyway. The
  // whole dict is one volatile field, so the custom card can stage and write
  // it atomically through `scope.mutate([{ op: 'set', path: ['states'], … }])`.
  states: LIVE(z.dict(STATE_CONFIG_SCHEMA).default(DEFAULTS.states)),
  // Registration-time keys: route table + injected script URLs are built in
  // apply(), so they are composition-entry only (non-volatile ⇒ absent from
  // the live settings form). See the README config table.
  statusPath: z.string().default(DEFAULTS.statusPath),
  iconPathPrefix: z.string().default(DEFAULTS.iconPathPrefix),
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
    var PREV_KEY = null;     // render key (state + "|" + active count) the current loop was started for
    var ACTIVE = 0;          // non-idle agent count from the status poll; >= BIG_NUM_MIN switches to the count block
    var BIG_NUM_MIN = 2;     // show the full-frame number while more than one agent is active
    var BIG_NUM_RX = 11;     // count-block corner radius (demo/badge.html bigNum channel)
    var ANIM_START = null;   // wall-clock start of the current loop (hidden-tab fallback)
    var FAILED = false;      // status poll currently failing (restore once per outage)
    var STATUS_PATH = "__STATUS_PATH__";
    var BASE_PATH = "__BASE_PATH__";
    var CFG = __CFG__;          // { states: { idle:{effect,colors,speed}, running:…, asking:…, done:… } }
    var CFG_JSON = null;        // serialized states last seen; null = not synced yet
    var BASE = null;            // base.svg text; __COLOR__ replaced per frame
    var RE = /__COLOR__/g;
    var DEF_SPEED = 1200;       // per-state cycle fallback when speed is omitted
    var DEF_COLOR = "#1a1a1a";  // fallback primary color when a state has no colors

    // Whale geometry (used as the transform pivot for scale/translate effects).
    var CX = 27.889625, CY = 24.952640;

    // Every request this script makes is deadline-bounded: a fetch that hangs
    // (half-open TCP, a suspended host, a captive portal) would otherwise hold
    // the poll chain and the base.svg load forever, freezing the icon with no
    // recovery. Aborting surfaces as a rejection, so the existing retry paths
    // (poll keeps its interval; base.svg retries on the next tick) take over.
    function timedFetch(url, init) {
      if (typeof AbortController === "undefined") return fetch(url, init);
      var ctrl = new AbortController();
      var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 8000);
      var opts = init || {};
      opts.signal = ctrl.signal;
      return fetch(url, opts).then(
        function (r) { clearTimeout(timer); return r; },
        function (e) { clearTimeout(timer); throw e; }
      );
    }

    // Capture the shell's own favicon ONCE, together with an offline-safe
    // data-URI copy of it. The copy matters: while the DSH host is stopped
    // the original href (a URL served by that same host) is unreachable, so
    // writing it back would blank the tab — the "backend stopped, icon lost"
    // bug. data: URIs render without any network, so restore() below only
    // ever writes those.
    function captureOriginal() {
      if (ORIGINAL) return;
      var link = document.querySelector("link[rel='icon']");
      if (!link) return;
      var href = link.getAttribute("href") || "";
      ORIGINAL = { href: href, type: link.getAttribute("type") || "", data: null };
      if (/^data:/i.test(href)) { ORIGINAL.data = href; return; }
      // Best effort: fetch the original icon and convert it to a data: URI
      // (any image type — blob -> FileReader). Environments without
      // Blob/FileReader, or a failed fetch, leave data null; restore() then
      // keeps the last plugin frame instead of risking a dead URL.
      try {
        if (!href || typeof Blob === "undefined" || typeof FileReader === "undefined") return;
        timedFetch(href)
          .then(function (r) { if (!r.ok) throw new Error("orig " + r.status); return r.blob(); })
          .then(function (blob) {
            return new Promise(function (resolve, reject) {
              var fr = new FileReader();
              fr.onload = function () { resolve(String(fr.result)); };
              fr.onerror = function () { reject(fr.error || new Error("read failed")); };
              fr.readAsDataURL(blob);
            });
          })
          .then(function (uri) {
            if (ORIGINAL && uri && uri.lastIndexOf("data:", 0) === 0) ORIGINAL.data = uri;
          })
          .catch(function () {});
      } catch (e) {}
    }
    // Offline-safe restore: prefer the cached data-URI copy of the original
    // icon, then the original href when it is itself a data: URI. With
    // neither available, keep the current frame (also a data: URI) — never
    // write a server URL here, it is unreachable exactly when this runs.
    function restore() {
      var link = document.querySelector("link[rel='icon']");
      if (!link || !ORIGINAL) return;
      var uri = ORIGINAL.data || (/^data:/i.test(ORIGINAL.href) ? ORIGINAL.href : null);
      if (!uri) return;
      try { link.setAttribute("href", uri); if (ORIGINAL.type) link.setAttribute("type", ORIGINAL.type); } catch (e) {}
    }
    function linkEl() { return document.querySelector("link[rel='icon']"); }
    function setHref(uri) {
      var link = linkEl();
      if (!link) return;
      try { link.setAttribute("href", uri); link.setAttribute("type", "image/svg+xml"); } catch (e) {}
    }
    // Some browsers (notably Safari) do NOT repaint a dynamically-changed
    // favicon — they only read the <link rel=icon> at page load. Replacing the
    // element on a STATE change forces every browser to re-evaluate the favicon
    // without touching the per-frame animation path (which mutates in place).
    function setHrefFresh(uri) {
      var link = linkEl();
      if (!link) return;
      try {
        var parent = link.parentNode;
        if (!parent) { link.setAttribute("href", uri); link.setAttribute("type", "image/svg+xml"); return; }
        var fresh = document.createElement("link");
        fresh.setAttribute("rel", "icon");
        fresh.setAttribute("type", "image/svg+xml");
        fresh.setAttribute("href", uri);
        parent.replaceChild(fresh, link);
      } catch (e) {}
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
    // Frame-URI cache. The base template is re-read and re-encoded on every
    // animation frame, but most effects cycle through a tiny set of fills
    // (static → 1, blink → 2, breath/geometric effects → 1 per color pair), so
    // the encoded data URI is stable and can be memoized. rainbow is the
    // exception — its fill is a fresh hue every frame — and is left uncached so
    // the map can never grow without bound.
    var URI_CACHE = new Map();
    function cachedUri(kind, fill, build) {
      var key = kind + "|" + fill;
      var hit = URI_CACHE.get(key);
      if (hit === undefined) {
        hit = build();
        // Keep the cache small (state count × a handful of colors); a settings
        // edit can introduce new colors, and this script runs for the life of
        // the tab.
        if (URI_CACHE.size > 64) URI_CACHE.clear();
        URI_CACHE.set(key, hit);
      }
      return hit;
    }

    // Full-frame activity count ("满幅数字", per demo/badge.html bigNum
    // channel): while more than one agent is active the whole icon becomes a
    // state-colored rounded block with a bold count — no whale is drawn, so
    // count changes never show the whale through the number. Digit size shrinks
    // by width (31%–52% of the icon height), readable at 16px and in pinned
    // tabs; cap at "99+". The fill comes from the SAME per-frame state effect
    // as the whale, so blink/breath/rainbow animate the block identically;
    // geometric transform effects (heartbeat/bounce) only wrap the whale and
    // are deliberately skipped here — a full-frame rect cannot scale without
    // cropping (mirrors the demo's svgFrame showWhale=false branch).
    function bigNumUri(fill) {
      var text = String(ACTIVE > 99 ? "99+" : ACTIVE);
      return cachedUri("n" + text, fill, function () {
        var chars = text.length;
        var fs = chars === 1 ? 26 : chars === 2 ? 20 : 15.5;
        var rgb = hexToRgb(fill);
        var lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
        var fg = lum > 0.6 ? "#111111" : "#FFFFFF"; // auto-contrast on the state color
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50" fill="none">' +
          '<rect x="0" y="0" width="50" height="50" rx="' + BIG_NUM_RX + '" fill="' + fill + '"/>' +
          '<text x="25" y="' + (25 + fs * 0.34).toFixed(1) + '" text-anchor="middle" font-family="system-ui, sans-serif" font-size="' + fs + '" font-weight="800" fill="' + fg + '">' + text + '</text>' +
          '</svg>';
        return "data:image/svg+xml," + encodeURIComponent(svg);
      });
    }

    // Reuses the fetched base template; replaces its __COLOR__ token (and,
    // for scale/translate effects, wraps the whale in a <g transform>).
    function frameUri(fill, effect, t, speed) {
      if (!BASE) return null;
      if (effect === "static") {
        // No time component: one URI per color for the life of the tab.
        return cachedUri("w", fill, function () { return "data:image/svg+xml," + encodeURIComponent(BASE.replace(RE, fill)); });
      }
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
      var fill = frameColor(cols, effect, t, speed);
      // More than one active agent: the count block replaces the whale frame.
      if (ACTIVE >= BIG_NUM_MIN) return bigNumUri(fill);
      return frameUri(fill, effect, t, speed);
    }
    function stopAnim() { if (RAF) { cancelAnimationFrame(RAF); RAF = null; } }
    function apply(state) {
      var link = linkEl();
      if (!link) return;
      if (state == null) { stopAnim(); return; }
      // Unchanged state AND unchanged activity count: keep the running loop
      // (don't reset the phase) — the 1 s poll would otherwise restart
      // animated effects from phase 0 every second. Browsers PAUSE
      // requestAnimationFrame in hidden tabs, so a background tab would freeze
      // on the last frame: repaint here instead — animated states get a
      // wall-clock frame (coarse ~1 Hz animation), static states repaint
      // (self-heal / pick up changes that happened while hidden). A state
      // change that happens while the tab is away (like the done hold
      // expiring) paints on the next poll; the visibilitychange listener at
      // the bottom fetches immediately when the tab comes back to the
      // foreground, so that revert shows at once instead of waiting for a
      // background-throttled tick.
      if (BASE && state + "|" + ACTIVE === PREV_KEY) {
        if (isStatic(state)) {
          var sframe = frameAt(state, 0);
          if (sframe && link.isConnected) setHref(sframe);
        } else if (ANIM_START !== null) {
          var aframe = frameAt(state, Date.now() - ANIM_START);
          if (aframe && link.isConnected) setHref(aframe);
        }
        return;
      }
      PREV_KEY = state + "|" + ACTIVE;
      stopAnim();
      // The count block is drawn from scratch, so it needs no base.svg: only the
      // whale path waits for the template. Loading it here (and retrying on the
      // next poll, since PREV_KEY was already set) keeps a failed/timed-out
      // template fetch from blanking the tab while agents are busy.
      if (!BASE && ACTIVE < BIG_NUM_MIN) {
        timedFetch(location.origin + BASE_PATH + "?t=" + Date.now(), { cache: "no-store" })
          .then(function (r) { if (!r.ok) throw new Error("base " + r.status); return r.text(); })
          .then(function (txt) { BASE = txt; PREV_KEY = null; apply(state); })
          .catch(function () {});
        return;
      }
      var t0 = null;
      ANIM_START = Date.now();
      // Paint the first frame synchronously so a state change shows even when
      // rAF never fires (e.g. the tab is hidden); the rAF loop then takes over
      // and drives the effect when the tab is visible. Use a fresh <link> node
      // so browsers that don't repaint a mutated favicon still show the change.
      var initial = frameAt(state, 0);
      if (initial && link.isConnected) setHrefFresh(initial);
      // rAF drives every effect. For "static" we paint one frame and stop;
      // animated effects keep looping. Re-query the current link each frame
      // (setHrefFresh may have swapped it) and mutate it in place.
      var step = function (now) {
        if (t0 === null) t0 = now;
        var uri = frameAt(state, now - t0);
        var cur = linkEl();
        if (uri && cur && cur.isConnected) setHref(uri);
        if (isStatic(state)) return; // single frame, no loop
        RAF = requestAnimationFrame(step);
      };
      RAF = requestAnimationFrame(step);
    }
    // Live config sync: the status response carries the current per-state
    // visual config (the "states" field). When it differs from what this tab
    // renders, swap it in and reset the animation phase so the next apply()
    // repaints from scratch — a settings-card save takes effect within one
    // poll tick, no tab reload needed. A response without "states" (older
    // host) leaves the baked __CFG__ in place.
    function syncCfg(j) {
      if (!j || typeof j.states !== "object" || j.states === null) return;
      var next = JSON.stringify(j.states);
      if (next === CFG_JSON) return;
      CFG_JSON = next;
      CFG = { states: j.states };
      PREV_KEY = null; // force a full repaint on the next apply
    }
    function poll() {
      timedFetch(location.origin + STATUS_PATH, { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); })
        .then(function (j) {
          syncCfg(j);
          // Non-idle agent count: >= BIG_NUM_MIN switches the frame to the
          // full-frame number. Older hosts omit the field; keep the last
          // known count (initial 0 → whale only).
          if (typeof j.active === "number") ACTIVE = j.active;
          apply(j.state || "idle");
          FAILED = false; // back online — the next outage may restore again
        })
        // Transient failures (host stopped/restarting, network blip) must NOT
        // kill the poll: swap the shell's own icon back in ONCE per outage via
        // the offline-safe restore() and keep retrying every tick. The SPA
        // reconnects in place, so the live icon returns by itself once the
        // endpoint answers again. restore() only ever writes data: URIs —
        // never the original server URL, which is unreachable exactly while
        // the host is down — so the tab cannot lose its icon mid-outage.
        .catch(function () {
          stopAnim();
          if (FAILED) return; // already restored for this outage
          FAILED = true;
          restore();
        });
    }
    captureOriginal();
    TIMER = setInterval(poll, 1000);
    poll();
    // A BACKGROUND tab's timers are throttled (Chrome clamps setInterval to
    // ~1/min after ~5 min hidden) and rAF is paused, so a state change that
    // happened while the tab was away may take a while to reach the favicon —
    // e.g. the green "done" frame sits there until the next poll finally fires.
    // The moment the tab becomes visible again, fetch the fresh status and
    // repaint right away instead of waiting for the next (possibly throttled)
    // poll tick. Cheap, idempotent, and it also covers browsers that froze the
    // page entirely while hidden (their first task on unfreeze is this poll).
    function onVisible() { if (document.visibilityState === "visible") poll(); }
    window.addEventListener("visibilitychange", onVisible);
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

// ---- Color math for the default-color similarity check ---------------------
// lib/client.js carries its OWN copy of this block: the two halves run in
// different processes, there is no shared module and no build step (docs/main.js
// already duplicates the same color math for the showcase site). Keep the
// thresholds in sync when tuning either copy.
/** Accepted defaultColor shape: `#rgb` or `#rrggbb` (case-insensitive). */
const DEFAULT_COLOR_RX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** CIE76 ΔE below which two colors are practically the same. */
const SIMILAR_DE_STRONG = 12;
/** CIE76 ΔE below which two colors are easily confused at favicon size. */
const SIMILAR_DE_WARN = 25;
/** Lab chroma above which a default color collides with a rainbow sweep. */
const RAINBOW_CHROMA_MIN = 15;
/** The states a default color is compared against (idle is the default itself). */
const OTHER_STATES = STATE_NAMES.filter((name) => name !== "idle");

/** `#rgb` / `#rrggbb` → lowercase 6-digit hex, or null when malformed. */
function normalizeHex(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!DEFAULT_COLOR_RX.test(text)) return null;
  const body = text.slice(1).toLowerCase();
  return body.length === 3
    ? "#" + body[0] + body[0] + body[1] + body[1] + body[2] + body[2]
    : "#" + body;
}

function hexToRgb(hex) {
  let body = String(hex).replace("#", "");
  // Expand #rgb exactly like the browser half does — every host caller feeds
  // normalizeHex()'s 6-digit output today, but the shortcut is a trap for the
  // next caller (and this copy must stay equivalent to lib/client.js's).
  if (body.length === 3) body = body[0] + body[0] + body[1] + body[1] + body[2] + body[2];
  const n = parseInt(body, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => {
    const c = Math.max(0, Math.min(255, Math.round(v)));
    return ("0" + c.toString(16)).slice(-2);
  }).join("");
}

/** Linear blend between two hex colors (mirrors the browser's `mix()`). */
function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
}

/** CIELAB (D65) for an sRGB hex color. */
function labOf(hex) {
  const rgb = hexToRgb(hex);
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = lin(rgb[0]);
  const g = lin(rgb[1]);
  const b = lin(rgb[2]);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 ΔE (Euclidean distance in CIELAB). */
function deltaE(a, b) {
  const la = labOf(a);
  const lb = labOf(b);
  return Math.sqrt(
    Math.pow(la[0] - lb[0], 2) + Math.pow(la[1] - lb[1], 2) + Math.pow(la[2] - lb[2], 2)
  );
}

function labChroma(hex) {
  const l = labOf(hex);
  return Math.sqrt(l[1] * l[1] + l[2] * l[2]);
}

/**
 * The fills a state actually paints, mirroring the browser's `frameColor()`:
 * `blink` toggles colors[0] ⇄ colors[1] (a darker second color is derived when
 * colors[1] is omitted), `breath` interpolates between them, everything else
 * uses colors[0]. `rainbow` is flagged instead — it sweeps every hue.
 */
function stateFills(state) {
  const cols = Array.isArray(state?.colors) ? state.colors : [];
  const effect = state?.effect || "static";
  const c0 = normalizeHex(cols[0] || "");
  const rainbow = effect === "rainbow";
  // A rainbow state never paints its own colors[0] literally (that value is
  // only the starting hue — the sweep covers the whole wheel), so it has no
  // comparable fills: the chroma rule in colorWarnings() covers it instead.
  if (!c0 || rainbow) return { fills: [], rainbow };
  const c1 = normalizeHex(cols[1] || "") || mixHex(c0, "#000000", 0.35);
  if (effect === "blink") return { fills: [c0, c1], rainbow: false };
  if (effect === "breath") {
    // The browser paints the CONTINUOUS mix, so a sparse sample can only ever
    // over-estimate the distance: a blue->green breath was reported ΔE 37 away
    // from a default colour it actually passes through (ΔE 0). 33 samples keep
    // the worst reported-vs-true gap around 5 ΔE (see lib/client.js's copy).
    const fills = [];
    for (let i = 0; i <= 32; i += 1) fills.push(mixHex(c0, c1, i / 32));
    return { fills, rainbow: false };
  }
  return { fills: [c0], rainbow };
}

/**
 * Similarity warnings for the effective default color (the idle primary).
 * Only the default is compared against the other states — NOT the states
 * against each other: the shipped defaults deliberately share #FACC15 between
 * `running` and the `asking` blink, so a pairwise check would warn forever.
 */
function colorWarnings(states) {
  const warnings = [];
  const base = normalizeHex(states?.idle?.colors?.[0] || "");
  if (!base) return warnings;
  // Idle itself on `rainbow` (composition entry / hand-written settings.yaml —
  // the card never exposes it): the idle icon sweeps every hue, so the default
  // colour can never stay distinguishable from it. One advisory replaces the
  // pairwise pass, which would judge a colour idle never paints literally.
  if ((states?.idle?.effect || "static") === "rainbow") {
    if (labChroma(base) >= RAINBOW_CHROMA_MIN) {
      warnings.push({ code: "rainbow-overlap", state: "idle", base, level: "warn" });
    }
    return warnings;
  }
  for (const name of OTHER_STATES) {
    const { fills, rainbow } = stateFills(states?.[name]);
    if (rainbow && labChroma(base) >= RAINBOW_CHROMA_MIN) {
      warnings.push({ code: "rainbow-overlap", state: name, base, level: "warn" });
    }
    let closest = null;
    for (const fill of fills) {
      const de = deltaE(base, fill);
      if (closest === null || de < closest.deltaE) closest = { color: fill, deltaE: de };
    }
    if (closest && closest.deltaE < SIMILAR_DE_WARN) {
      warnings.push({
        code: "color-too-close",
        state: name,
        base,
        color: closest.color,
        deltaE: Math.round(closest.deltaE * 10) / 10,
        level: closest.deltaE < SIMILAR_DE_STRONG ? "strong" : "warn",
      });
    }
  }
  return warnings;
}

/**
 * Cordis plugin entry. Returns the standard `{ apply, inject, Config }`
 * shape so the host composition can mount it once at startup. `Config` (the
 * schemastery schema) is what the loader validates the row against and what
 * the host settings service projects into its live form — a plugin without it
 * has no server-declared configuration surface at all. One bundle serves both
 * host lines: the legacy `settings.installSection` path is feature-detected at
 * runtime (see `apply`).
 */
export default {
  name: "dsh-web-icon-indicator",
  inject: ["webServer", "timer", "agents", "fs"],
  Config: CONFIG_SCHEMA,
  /** Settings namespace (the profile entry id on ≥0.1.7) + schema, for tooling. */
  SETTINGS_NAMESPACE,
  /** Settings namespace used on the legacy (≤0.1.6-alpha.1) settings service. */
  LEGACY_SETTINGS_NAMESPACE,
  CONFIG_SCHEMA,
  apply(ctx, config) {
    // Cordis passes the schema-resolved config as the second argument
    // (`apply(ctx, config)`). Every `.volatile()` field arrives as a live
    // reference (`config.states.get()`), and the loader mutates those
    // references in place when a settings write lands — that is what
    // `loader/volatile-update` below reacts to. Unwrap the references once per
    // read so the rest of this file keeps working on plain values. The
    // `ctx.get("config")` fallback keeps the zero-dependency test harness (and
    // any host that hands the row config through the service container) working.
    const readRef = (value) =>
      value !== null && typeof value === "object" && typeof value.get === "function" ? value.get() : value;
    const readConfig = (raw) => {
      const out = {};
      for (const [key, value] of Object.entries(raw || {})) {
        const plain = readRef(value);
        if (plain !== undefined) out[key] = plain;
      }
      return out;
    };
    // Legacy host line (DSH ≤ 0.1.6-alpha.1): `settings.installSection` owns the
    // namespace lifecycle and hands this plugin a live source through
    // `setSource`. Until it does, the composition config passed to `apply` (or
    // the zero-dep test harness's `ctx.get("config")`) is the source.
    let legacySource = null;
    const source = () =>
      readConfig(legacySource ? legacySource() : config ?? ctx.get("config") ?? {});
    // Merge each configured state over its default: { effect, colors, speed }.
    // Idempotent on schema-resolved values, so it doubles as the fallback
    // normalization when the profile composes no settings service.
    const resolveConfig = (raw) => {
      const stateConfigs = {};
      const warnings = [];
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
        // Strict `#rgb` / `#rrggbb` only — the same rule normalizeHex() and the
        // card use. The old lenient 3-6 digit test let a "#1234" through and
        // parseInt() painted a bogus colour from it, which the card (correctly)
        // refused to reason about.
        cols = cols.filter((c) => typeof c === "string" && DEFAULT_COLOR_RX.test(c.trim()));
        merged.colors = cols.length ? cols : [...(DEFAULTS.states[name]?.colors || ["#1a1a1a"])];
        // speed: must be a positive number; otherwise use the default (1200).
        if (typeof merged.speed !== "number" || !(merged.speed > 0)) delete merged.speed;
        stateConfigs[name] = merged;
      }
      // `undefined` values must not shadow a DEFAULTS entry: the plugin's own
      // static `config` row carries `iconsDir: undefined` by design, and a
      // schema-resolved settings value may omit optional keys entirely. Only
      // keys the caller actually set may override a default.
      const defined = {};
      for (const [key, value] of Object.entries(raw || {})) {
        if (value !== undefined) defined[key] = value;
      }
      const resolved = { ...DEFAULTS, ...defined, states: stateConfigs };
      // `defaultColor` is sugar for the idle state's PRIMARY color. Fold it into
      // `states.idle.colors[0]` here instead of teaching the browser a second
      // rendering path: the injected script, the baked `__CFG__` payload and
      // even an already-baked older bundle therefore keep working unchanged,
      // and the live settings sync (`cfg.states = next.states`) carries it for
      // free. A malformed value is dropped with a warning, never painted.
      delete resolved.defaultColor;
      const requestedDefault = typeof defined.defaultColor === "string"
        ? defined.defaultColor.trim()
        : defined.defaultColor;
      // "" / whitespace written by hand into the composition entry means "not
      // set" — not a malformed color to warn about. Neither does an empty YAML
      // value, which parses as null (`defaultColor:`).
      if (requestedDefault != null && requestedDefault !== "") {
        const normalized = normalizeHex(requestedDefault);
        if (normalized) {
          const idle = stateConfigs.idle;
          stateConfigs.idle = { ...idle, colors: [normalized, ...(idle.colors || []).slice(1)] };
          resolved.defaultColor = normalized;
        } else {
          warnings.push({ code: "invalid-color", value: String(requestedDefault) });
        }
      }
      warnings.push(...colorWarnings(stateConfigs));
      resolved.warnings = warnings;
      return resolved;
    };
    // Surface the similarity / validity warnings on the host as well: the
    // settings card computes its own live copy, while this covers configs that
    // arrive through the composition entry (a hand-written cordis.yml) and
    // leaves a server-side record. `ctx.logger` is cordis' core logging
    // service — guard it, since the zero-dep test harness drives `apply()`
    // with a ctx that has none.
    const logWarnings = (list) => {
      if (!Array.isArray(list) || list.length === 0) return;
      try {
        if (typeof ctx.logger !== "function") return;
        const logger = ctx.logger("dsh-web-icon-indicator");
        for (const w of list) {
          const text = w.code === "invalid-color"
            ? `defaultColor ${JSON.stringify(w.value)} is not a 3- or 6-digit hex color — ignored`
            : w.code === "rainbow-overlap"
              ? `defaultColor ${w.base} is too close to the "${w.state}" state: its rainbow effect sweeps every hue`
              : `defaultColor ${w.base} is ${w.level === "strong" ? "nearly identical to" : "too close to"} the "${w.state}" state color ${w.color} (ΔE ${w.deltaE})`;
          if (logger && typeof logger.warn === "function") logger.warn(text);
        }
      } catch (e) {}
    };
    let cfg = resolveConfig(source());
    logWarnings(cfg.warnings);
    // The injected script bakes config at injection time; rebuild it whenever
    // the live config changes so the NEXT page load picks the new values up
    // (reload the tab — the running tab is already carried by the status poll's
    // `states` echo).
    const buildScript = (c) => INJECTED_SCRIPT
      .replace("__STATUS_PATH__", c.statusPath)
      .replace("__BASE_PATH__", c.iconPathPrefix + "/base.svg")
      .replace("__CFG__", JSON.stringify({ states: c.states }));
    let script = buildScript(cfg);
    let iconsDir = resolveIconsDir(cfg.iconsDir);
    // Live settings, modern line (DSH ≥ 0.1.7). The host owns the whole
    // configuration lifecycle: the loader validates the composition row against
    // `Config`, the `settings` service (`SettingsForms`) derives the live form
    // from the schema's `.volatile()` fields and writes them into the profile
    // patch, and a volatile-only write is committed into the running fiber's
    // references with a `loader/volatile-update` event instead of a restart.
    // This listener rebuilds the cached `cfg` and the injected script from the
    // same references; the legacy line below drives it through `onChange`
    // instead. `statusPath` / `iconPathPrefix` are NOT volatile: they are baked
    // into the route table and the injected script at registration time, so a
    // document change to them re-applies the whole plugin instead (they stay
    // outside the live form — see CONFIG_SCHEMA).
    const refreshFromConfig = () => {
      const next = resolveConfig(source());
      cfg.askingHoldMs = next.askingHoldMs;
      cfg.doneHoldMs = next.doneHoldMs;
      if (next.iconsDir !== undefined) cfg.iconsDir = next.iconsDir;
      cfg.states = next.states;
      // `defaultColor` / `warnings` ride along with `states`: the color is
      // already folded into `states.idle.colors[0]`, so the browser needs no
      // new key — they are kept for observability (status echo + log).
      cfg.defaultColor = next.defaultColor;
      cfg.warnings = next.warnings;
      iconsDir = resolveIconsDir(cfg.iconsDir);
      script = buildScript(cfg);
      logWarnings(cfg.warnings);
    };
    // A plain `ctx.on` listener is enough: the loader emits this event on the
    // owning fiber's context only, so a volatile write to another plugin's
    // config never reaches here. Guard for the zero-dep test harness, whose
    // fake ctx carries no event bus.
    if (typeof ctx.on === "function") ctx.on("loader/volatile-update", refreshFromConfig);
    // Legacy host line (DSH ≤ 0.1.6-alpha.1): the `settings` service exposes
    // `installSection`, and the plugin must register its namespace itself —
    // that service method was removed in 0.1.7, where the exported `Config`
    // schema plus `loader/volatile-update` carry the same lifecycle. Feature-
    // detect instead of switching on a version: whichever service the running
    // host provides decides the path, so one bundle serves both lines.
    // The base layer is a RESOLVED PLAIN COPY (`resolveConfig(source())`), not
    // the raw `apply` config: the legacy loader deep-freezes the config it
    // resolved against the exported `Config` schema, and the legacy settings
    // service resolves the schema over the base IN PLACE (its `mergeLayers`
    // returns the base unchanged when no user section exists) — handing it a
    // frozen object throws "Cannot assign to read only property".
    if (typeof ctx.inject === "function") {
      ctx.inject(["settings"], (settingsCtx) => {
        const settings = settingsCtx.settings;
        if (!settings || typeof settings.installSection !== "function") return;
        settings.installSection(ctx, LEGACY_SETTINGS_NAMESPACE, CONFIG_SCHEMA, resolveConfig(source()), {
          setSource: (next) => { legacySource = next; },
          onChange: refreshFromConfig,
        });
      });
    }
    const webServer = ctx.webServer;
    const agents = ctx.agents;
    const fs = ctx.fs;
    const lastSeen = new Map();

    // -- State machine -------------------------------------------------------
    const states = new Map();        // agentId -> { state, since }
    const asking = new Set();        // agentIds whose icon is currently pinned to asking
    const askDone = new Set();       // agentIds whose ask_user_question tool call already returned
    const askTimers = new Map();     // agentId -> ctx.timer.timeout disposer
    const pendingApprovals = new Set(); // agentIds with an open approval/asked (waiting on the user)
    // Per-agent done-hold disposers, keyed like the other maps. Tracking them
    // explicitly (instead of firing a never-cancelled timeout) lets a state
    // leaving `done` cancel the hold, and `agent/disposed` cancel it too; a
    // done→running→done round-trip no longer stacks two timers that race to
    // truncate the hold early.
    const doneTimers = new Map();    // agentId -> ctx.timer.timeout disposer

    const cancelDoneHold = (id) => {
      const d = doneTimers.get(id);
      if (d) { try { d(); } catch (e) {} doneTimers.delete(id); }
    };

    const setState = (id, state) => {
      const prev = states.get(id);
      const now = Date.now();
      if (state === "asking") asking.add(id);
      // Same-state transition: keep `since` and — for done — the already-armed
      // hold untouched (never stack a second timer; never cancel the live one).
      if (prev && prev.state === state) { states.set(id, { state, since: prev.since }); return; }
      // Leaving `done` (to running/idle/asking) cancels any in-flight hold so a
      // stale timer can't later force the state back to idle.
      if (prev && prev.state === "done") cancelDoneHold(id);
      states.set(id, { state, since: now });
      if (state === "done") {
        const handle = ctx.timer.timeout(() => {
          const cur = states.get(id);
          if (cur && cur.state === "done") states.set(id, { state: "idle", since: Date.now() });
          doneTimers.delete(id);
        }, cfg.doneHoldMs);
        doneTimers.set(id, handle);
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

    // Asking: visible minimum (askingHoldMs). Re-arm timer while the user is
    // still answering; clean up to live agent status once returned.
    // A call for a brand-new pin cancels any still-pending timer first, so a
    // fast pre-execute→idle→pre-execute round-trip can't stack two timers.
    // The pin is kept alive as long as the agent is still `running` — the user
    // may be reading a long question, and a fixed re-arm budget would drop the
    // icon mid-think. It force-releases against live status once the agent
    // leaves `running`, so a lost `tools/result` cannot pin `asking` forever.
    const scheduleAskCheck = (id) => {
      const prevHandle = askTimers.get(id);
      // Never cancel a handle whose callback is executing right now: it is the
      // very call re-arming the pin, and its `finally` would then delete the
      // fresh handle and leave the session pinned to `asking` with no timer to
      // release it. A stale (non-running) handle is still cancelled, so a
      // repeated pre-execute cannot stack two timers.
      if (prevHandle && !prevHandle.running()) {
        try { prevHandle(); } catch (e) {}
        askTimers.delete(id);
      }
      let running = false;
      const handle = ctx.timer.timeout(() => {
        running = true;
        askTimers.delete(id);
        try {
          if (!asking.has(id)) return;
          if (!askDone.has(id)) {
            const live = agents.get(id);
            // Result not yet reported AND the agent is still mid-turn: the user
            // may still be deciding — keep the pin (no re-arm budget; a human
            // question can legitimately outlast many hold windows).
            if (live && live.status === "running") { scheduleAskCheck(id); return; }
            // Result never arrived and the turn ended (agent idle / gone): a lost
            // tools/result cannot keep the icon blinking forever — force-release
            // the pin against live status.
            asking.delete(id);
            askDone.delete(id);
            if (live) setState(id, live.status === "running" ? "running" : "idle");
            else setState(id, "idle");
            return;
          }
          asking.delete(id);
          askDone.delete(id);
          const live = agents.get(id);
          if (live) setState(id, live.status === "running" ? "running" : "idle");
          else setState(id, "idle");
        } finally {
          running = false;
        }
      }, cfg.askingHoldMs);
      handle.running = () => running;
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
      approvalCursor.delete(id);
      lastSeen.delete(id);
      cancelDoneHold(id);
      const t = askTimers.get(id);
      if (t) { try { t(); } catch (e) {} askTimers.delete(id); }
    });

    // Authoritative pending-approval check: fold the live session's event log
    // for an `approval/asked` that no `approval/decided` has closed. Since DSH
    // 0.1.2-alpha.4 `Session.events` is gone — read the log on demand through
    // `session.snapshotEvents()` (a frozen half-open range snapshot). Guard on
    // the method so older/newer hosts degrade gracefully.
    //
    // The fold is INCREMENTAL: `snapshotEvents()` deep-freezes every event it
    // returns, and reconcile runs on every 1 s status poll, so re-reading the
    // whole log per poll would clone the entire history each second. A per-agent
    // cursor keeps only the delta (the log is append-only, so the open-approval
    // set is a pure fold over the events seen so far).
    const approvalCursor = new Map(); // agentId -> { seq, open: Set<approvalId> }
    const hasPendingApproval = (live) => {
      const session = live?.session;
      if (!session || typeof session.snapshotEvents !== "function") return false;
      const id = live?.id ?? null;
      const cursor = (id != null && approvalCursor.get(id)) || { seq: 0, open: new Set() };
      let events;
      try {
        events = session.snapshotEvents(cursor.seq);
      } catch (e) {
        return cursor.open.size > 0; // keep the last good fold on a read failure
      }
      if (!Array.isArray(events)) return cursor.open.size > 0;
      let seq = cursor.seq;
      for (const ev of events) {
        if (typeof ev?.seq === "number" && ev.seq >= seq) seq = ev.seq + 1;
        if (ev?.type === "approval/asked") cursor.open.add(ev.data?.id);
        else if (ev?.type === "approval/decided") cursor.open.delete(ev.data?.id);
      }
      cursor.seq = seq;
      if (id != null) approvalCursor.set(id, cursor);
      return cursor.open.size > 0;
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
      // Non-idle agent count (asking / running / done): the favicon shows this
      // as a full-frame number block while more than one agent is active.
      let active = 0;
      const counted = new Set();
      for (const a of agents.list()) {
        const id = a.id;
        const s = agentStateOf(id);
        if (s !== "idle") {
          if (!counted.has(id)) { active++; counted.add(id); }
        }
        const rank = order.indexOf(s);
        if (rank === -1) continue;
        if (best === null || rank < best.rank) best = { rank, id, state: s };
      }
      for (const [id, rec] of states) {
        if (rec.state === "done") {
          const rank = order.indexOf("done");
          if (!counted.has(id)) active++; // done-hold agents not yet live-non-idle
          if (best === null || rank < best.rank) best = { rank, id, state: "done" };
        }
      }
      return best
        ? { state: best.state, since: (states.get(best.id) || {}).since || Date.now(), active }
        : { state: "idle", since: Date.now(), active };
    };

    // -- Routes --------------------------------------------------------------
    // The status endpoint also echoes the current per-state visual config
    // (`states`): the injected script syncs it on every poll, so a settings
    // save changes the favicon within ~1 s without a tab reload. `no-store`
    // keeps every poll reading the freshest config.
    ctx.effect(() => webServer.register({
      kind: "exact",
      path: cfg.statusPath,
      handler: (_req, res) => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        // `defaultColor` + `warnings` are additive: older browser bundles ignore
        // unknown keys, and the live config sync only reads `states`.
        // `defaultColor` is echoed as null when none is configured so the
        // documented shape has the key unconditionally.
        res.end(JSON.stringify({
          ...aggregate(),
          states: cfg.states,
          defaultColor: cfg.defaultColor ?? null,
          warnings: cfg.warnings || [],
        }));
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
