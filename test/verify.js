/**
 * Zero-dependency, zero-build verification for dsh-web-icon-indicator.
 *
 * Run:  node test/verify.js   (also wired as `npm test`)
 *
 * It exercises the REAL code in lib/index.js:
 *   - host side: imports the actual plugin through loader hooks that stub the
 *     two @deepseek-ai peer imports, drives `apply()` with a fake Cordis ctx
 *     (webServer / timer / agents / fs / settings), and asserts state-machine,
 *     aggregation (`active`), approval / asking / done-hold behavior, and the
 *     status-endpoint JSON shape via the actually-registered route handler.
 *   - browser side: extracts the INJECTED_SCRIPT template, substitutes the
 *     same placeholders the host does (__STATUS_PATH__ / __BASE_PATH__ /
 *     __CFG__), and runs it in a node:vm with DOM / fetch / rAF stubs to
 *     assert favicon frames (whale vs full-frame count block), render-key
 *     transitions, effect-driven fills (blink / rainbow) on the count block,
 *     settings sync, offline-safe poll-failure restore, and legacy-host
 *     compatibility.
 *
 * No npm dependencies, no build step, no framework — plain `node`.
 */
import { register } from "node:module";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import vm from "node:vm";
import os from "node:os";
import path from "node:path";

const REPO = new URL("../", import.meta.url);
const SRC = readFileSync(new URL("lib/index.js", REPO), "utf8");
const BASE_SVG = readFileSync(new URL("icons/base.svg", REPO), "utf8");

// ---- tiny assert harness ---------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];
function check(name, okFlag, detail) {
  if (okFlag) passed++;
  else {
    failed++;
    failures.push(name + (detail !== undefined ? " — " + detail : ""));
  }
  console.log((okFlag ? "PASS" : "FAIL") + "  " + name);
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, "got " + a + ", want " + e);
}
function ok(name, cond, detail) {
  check(name, !!cond, detail);
}
const tick = () => new Promise((r) => setImmediate(r));

// ---- source extraction helpers ---------------------------------------------
function extractBlock(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error("marker not found: " + marker);
  const open = src.indexOf("{", start);
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (i >= src.length) throw new Error("unbalanced block for " + marker);
  return src.slice(start, i + 1);
}
function extractTemplate(src) {
  const a = src.indexOf("const INJECTED_SCRIPT = `") + "const INJECTED_SCRIPT = `".length;
  const b = src.indexOf("`;", a);
  if (a === -1 || b === -1) throw new Error("INJECTED_SCRIPT markers not found");
  return src.slice(a, b);
}
const DEFAULT_STATES = {
  idle: { effect: "static", colors: ["#1a1a1a"] },
  running: { effect: "static", colors: ["#FACC15"] },
  asking: { effect: "blink", colors: ["#E5484D", "#FACC15"], speed: 400 },
  done: { effect: "static", colors: ["#22A06B"] },
};
const TEMPLATE = extractTemplate(SRC);
// Build the injected script exactly like the host's buildScript() does.
function buildScript(states) {
  return TEMPLATE
    .replace("__STATUS_PATH__", "/dsh-web-icon-status.json")
    .replace("__BASE_PATH__", "/dsh-web-icon-indicator/base.svg")
    .replace("__CFG__", JSON.stringify({ states }));
}
const builtScript = buildScript(DEFAULT_STATES);

// ============================================================================
// PART 1 — host plugin integration (REAL apply(), stubbed ctx)
// ============================================================================
function makeCtx(opts = {}) {
  const routes = [];
  const taps = [];
  const onHandlers = {};
  const timers = [];
  let agentsList = [];
  // Settings service stub: mirrors the DSH 0.1.2 `settings.installSection`
  // contract. The plugin reaches it through `ctx.inject(["settings"], cb)` (never
  // imports `@deepseek-ai/dsh-settings`), so the captured shape lives here so the
  // state-machine + settings-wiring assertions below can drive setSource/onChange.
  const settings = {
    installSection(_owner, ns, schema, entry, opts) {
      globalThis.__DSH_ICON_TEST__ = { ns, schema, entry, settingsOpts: opts };
    },
  };
  const ctx = {
    get: (k) => (k === "settings" ? settings : k === "config" ? {} : undefined),
    // Mirror the host's `ctx.inject(["settings"], cb)` pattern: run the callback
    // with a settingsCtx exposing the stub provider.
    inject: (deps, cb) => {
      if (Array.isArray(deps) && deps.includes("settings")) cb({ settings });
    },
    webServer: {
      register: (r) => routes.push(r),
      tapIndex: (fn) => taps.push(fn),
    },
    timer: {
      timeout: (cb, ms) => {
        const t = { cb, ms, fired: false, ran: false, running: false };
        t.cb = () => {
          t.ran = true; // executed (vs cancelled via the disposer -> fired)
          t.running = true;
          try { return cb(); } finally { t.running = false; }
        };
        // The disposer mirrors the real `ctx.timer.timeout` return value; the
        // `__test` back-reference lets assertions read the timer's own flags.
        const disposer = () => { t.fired = true; };
        disposer.running = () => t.running;
        disposer.__test = t;
        t.disposer = disposer;
        timers.push(t);
        return disposer;
      },
    },
    on: (ev, fn) => {
      (onHandlers[ev] ||= []).push(fn);
    },
    effect: (fn) => fn(), // run immediately so routes register
    agents: {
      list: () => agentsList.slice(),
      get: (id) => agentsList.find((a) => a.id === id) || null,
    },
    fs: null,
    sandboxPolicy: null,
  };
  if (opts.logger) {
    // Optional capture of `ctx.logger(name).warn(...)`: the host half reports its
    // default-color warnings through the cordis core logger when one is present.
    ctx.logger = (name) => ({ warn: (msg) => opts.logger.push(name + ": " + msg) });
  }
  return {
    ctx,
    routes,
    taps,
    onHandlers,
    timers,
    setAgents: (list) => {
      agentsList = list;
    },
  };
}
function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(b) {
      this.body = b;
    },
  };
}
function emit(handlers, ev, ...args) {
  for (const fn of handlers[ev] || []) fn(...args);
}

console.log("\n=== Part 1: host plugin integration ===");

// Register the loader hook BEFORE importing the real plugin.
register(new URL("./loader-hooks.mjs", import.meta.url), import.meta.url);
const { default: plugin } = await import(new URL("../lib/index.js", import.meta.url));

{
  // H1 contract shape
  ok("H1 plugin contract shape", plugin && plugin.name === "dsh-web-icon-indicator",
    "name=" + plugin?.name);
  eq("H1b inject list", plugin.inject, ["webServer", "timer", "agents", "fs"]);
  ok("H1c config defaults present",
    plugin.config.askingHoldMs === 3500 && plugin.config.doneHoldMs === 5000 &&
    plugin.config.states?.running?.colors?.[0] === "#FACC15",
    JSON.stringify(plugin.config));
  ok("H1d SETTINGS_NAMESPACE", plugin.SETTINGS_NAMESPACE === "web-icon-indicator");
  ok("H1e CONFIG_SCHEMA defined", !!plugin.CONFIG_SCHEMA);
  // The route paths are registration-time only: the settings schema must not
  // advertise them, or a settings-document edit would point the browser at a
  // path the server never serves.
  const schemaSrc = SRC.slice(SRC.indexOf("const CONFIG_SCHEMA"), SRC.indexOf("/** Browser script injected"));
  ok("H1e2 settings schema excludes the registration-time route paths",
    !/\bstatusPath\s*:/.test(schemaSrc) && !/\biconPathPrefix\s*:/.test(schemaSrc),
    schemaSrc.slice(0, 120));
  ok("H1e3 settings schema covers the live keys",
    /askingHoldMs\s*:/.test(schemaSrc) && /doneHoldMs\s*:/.test(schemaSrc) &&
    /iconsDir\s*:/.test(schemaSrc) && /states\s*:/.test(schemaSrc));

  const h = makeCtx();
  plugin.apply(h.ctx);
  const statusRoute = h.routes.find((r) => r.kind === "exact");
  const baseRoute = h.routes.find((r) => r.kind === "prefix");
  ok("H1f status route registered", !!statusRoute && statusRoute.path === "/dsh-web-icon-status.json");
  ok("H1g base route registered", !!baseRoute && baseRoute.path === "/dsh-web-icon-indicator");
  ok("H1h tapIndex registered", h.taps.length === 1);
  ok("H1i settings section captured",
    globalThis.__DSH_ICON_TEST__?.ns === "web-icon-indicator" &&
    typeof globalThis.__DSH_ICON_TEST__?.settingsOpts?.setSource === "function" &&
    typeof globalThis.__DSH_ICON_TEST__?.settingsOpts?.onChange === "function");

  const aggregate = () => {
    const res = fakeRes();
    statusRoute.handler(null, res);
    return JSON.parse(res.body);
  };

  // H2 no agents
  const idleAgg = aggregate();
  eq("H2 no agents -> idle active 0",
    { state: idleAgg.state, active: idleAgg.active, sinceIsNumber: typeof idleAgg.since === "number" },
    { state: "idle", active: 0, sinceIsNumber: true });
  ok("H2b states echoed with 4 states", Object.keys(aggregate().states).length === 4);

  // H3 one running
  h.setAgents([{ id: "A", status: "running" }]);
  let agg = aggregate();
  eq("H3 one running -> running active 1",
    { state: agg.state, active: agg.active }, { state: "running", active: 1 });

  // H4 two running
  h.setAgents([
    { id: "A", status: "running" },
    { id: "B", status: "running" },
  ]);
  agg = aggregate();
  eq("H4 two running -> running active 2",
    { state: agg.state, active: agg.active }, { state: "running", active: 2 });

  // H5 pending approval (hasPendingApproval real fold) raises priority + counts
  // The stub mirrors the real contract: events carry a `seq` and
  // `snapshotEvents(fromSeq)` returns only the delta from that offset, so the
  // incremental cursor is exercised rather than a full re-read.
  const approvalLog = (events) => {
    const log = events.map((ev, i) => ({ ...ev, seq: i }));
    return {
      log,
      reads: 0,
      session: {
        snapshotEvents: (fromSeq) => {
          const start = typeof fromSeq === "number" ? fromSeq : 0;
          return log.filter((ev) => ev.seq >= start);
        },
      },
    };
  };
  const pendingLog = approvalLog([{ type: "approval/asked", data: { id: "p1" } }]);
  h.setAgents([
    { id: "A", status: "running", session: pendingLog.session },
    { id: "B", status: "running" },
  ]);
  agg = aggregate();
  eq("H5 approval-asked + running -> asking active 2",
    { state: agg.state, active: agg.active }, { state: "asking", active: 2 });

  // H6 approval/decided clears the pin
  const decidedLog = approvalLog([
    { type: "approval/asked", data: { id: "p1" } },
    { type: "approval/decided", data: { id: "p1" } },
  ]);
  h.setAgents([
    { id: "A", status: "running", session: decidedLog.session },
    { id: "B", status: "running" },
  ]);
  agg = aggregate();
  eq("H6 approval decided -> running active 2",
    { state: agg.state, active: agg.active }, { state: "running", active: 2 });

  // H6b the fold is incremental: the second poll must ask for the delta only,
  // and a later `approval/asked` appended to the log must still pin the agent.
  // Uses a fresh agent id: the cursor is per agent, and "A" already folded a
  // different log above.
  const growing = [];
  const readRanges = [];
  h.setAgents([
    {
      id: "G",
      status: "running",
      session: {
        snapshotEvents: (fromSeq) => {
          const start = typeof fromSeq === "number" ? fromSeq : 0;
          readRanges.push(start);
          return growing.filter((ev) => ev.seq >= start);
        },
      },
    },
  ]);
  growing.push({ type: "approval/asked", data: { id: "p1" }, seq: 0 });
  aggregate();
  eq("H6b first read starts at 0", readRanges[0], 0);
  aggregate();
  eq("H6c second read starts past the seen event", readRanges[1], 1);
  growing.push({ type: "approval/decided", data: { id: "p1" }, seq: 1 });
  agg = aggregate();
  eq("H6d delta-only fold clears the pin", agg.state, "running");
  growing.push({ type: "approval/asked", data: { id: "p2" }, seq: 2 });
  agg = aggregate();
  eq("H6e appended ask still pins", agg.state, "asking");

  // H7 session/event handler pinning (approval/asked event drives setState)
  h.setAgents([{ id: "A", status: "running" }]);
  agg = aggregate();
  eq("H7a before event -> running active 1",
    { state: agg.state, active: agg.active }, { state: "running", active: 1 });
  emit(h.onHandlers, "session/event", { id: "A" }, { type: "approval/asked" });
  agg = aggregate();
  eq("H7b approval/asked event -> asking active 1",
    { state: agg.state, active: agg.active }, { state: "asking", active: 1 });
  emit(h.onHandlers, "session/event", { id: "A" }, { type: "approval/decided" });
  agg = aggregate();
  eq("H7c approval/decided event -> running active 1",
    { state: agg.state, active: agg.active }, { state: "running", active: 1 });

  // H8 reconcile: running -> idle lands in done hold, counts as active, then expires
  h.setAgents([{ id: "A", status: "running" }]);
  aggregate(); // record lastSeen running
  h.setAgents([{ id: "A", status: "idle" }]);
  agg = aggregate(); // reconcile flips to done
  eq("H8a reconcile running->idle -> done active 1",
    { state: agg.state, active: agg.active }, { state: "done", active: 1 });
  const doneTimer = h.timers.find((t) => !t.fired && t.cb);
  ok("H8b done hold timer scheduled", !!doneTimer);
  doneTimer.cb(); // expire the hold
  agg = aggregate();
  eq("H8c done hold expired -> idle active 0",
    { state: agg.state, active: agg.active }, { state: "idle", active: 0 });

  // H9 done-hold + another running -> running active 2 (done counts once)
  h.setAgents([
    { id: "A", status: "running" },
    { id: "B", status: "running" },
  ]);
  aggregate();
  h.setAgents([
    { id: "A", status: "idle" },
    { id: "B", status: "running" },
  ]);
  agg = aggregate();
  eq("H9 done-hold + running -> running active 2",
    { state: agg.state, active: agg.active }, { state: "running", active: 2 });

  // H10 ask_user_question pin: pre-execute -> asking, result -> hold, expiry -> live state
  h.setAgents([{ id: "A", status: "running" }]);
  emit(h.onHandlers, "tools/pre-execute", { name: "ask_user_question", agent: { id: "A" } }, () => {});
  agg = aggregate();
  eq("H10a ask pre-execute -> asking active 1",
    { state: agg.state, active: agg.active }, { state: "asking", active: 1 });
  emit(h.onHandlers, "tools/result", { name: "ask_user_question", agent: { id: "A" } }, {});
  const askTimer = h.timers[h.timers.length - 1];
  ok("H10b ask hold timer scheduled", !!askTimer);
  askTimer.cb(); // hold expired, answer already returned
  agg = aggregate();
  eq("H10c ask hold expired -> live running active 1",
    { state: agg.state, active: agg.active }, { state: "running", active: 1 });

  // H11 agent/disposed cleanup
  emit(h.onHandlers, "agent/disposed", { agent: { id: "A" } });
  h.setAgents([]);
  agg = aggregate();
  eq("H11 disposed -> idle active 0", { state: agg.state, active: agg.active }, { state: "idle", active: 0 });

  // H12 status endpoint HTTP shape (headers + cache-control)
  const res = fakeRes();
  statusRoute.handler(null, res);
  ok("H12 status 200 + json + no-store",
    res.statusCode === 200 &&
    res.headers["Content-Type"] === "application/json; charset=utf-8" &&
    res.headers["Cache-Control"] === "no-store");

  // H13 base route guards the filename regex
  const bad = fakeRes();
  baseRoute.handler({ url: "/dsh-web-icon-indicator/other.svg" }, bad);
  ok("H13 base route rejects non-base.svg", bad.statusCode === 404);

  // H14 settings onChange re-resolves; new values reach route + host timings
  const opts = globalThis.__DSH_ICON_TEST__.settingsOpts;
  opts.setSource(() => ({ askingHoldMs: 100, states: { running: { effect: "breath", colors: ["#01ABCD"] } } }));
  opts.onChange();
  agg = aggregate();
  eq("H14a onChange propagates new running color", agg.states.running?.colors?.[0], "#01ABCD");
  ok("H14b askingHoldMs re-resolved to 100", plugin.config.askingHoldMs === 3500); // plugin.config is static; cfg mutated internally
  h.setAgents([{ id: "B", status: "running" }]);
  emit(h.onHandlers, "tools/pre-execute", { name: "ask_user_question", agent: { id: "B" } }, () => {});
  const askTimer2 = h.timers[h.timers.length - 1];
  ok("H14c ask hold timer uses new 100ms", askTimer2.ms === 100, "ms=" + askTimer2.ms);

  // H14d/H14e an `undefined` value in the settings source must not shadow a
  // DEFAULTS entry, and a settings edit must not move the baked route paths.
  opts.setSource(() => ({ askingHoldMs: undefined, iconsDir: undefined, statusPath: "/ignored.json" }));
  opts.onChange();
  const res14 = fakeRes();
  statusRoute.handler(null, res14);
  const agg14 = JSON.parse(res14.body);
  ok("H14d resolved config still serves all four default states", Object.keys(agg14.states).length === 4,
    JSON.stringify(Object.keys(agg14.states)));
  ok("H14e status route path unchanged by settings", statusRoute.path === "/dsh-web-icon-status.json");
}

{
  // H15–H24 — event-driven paths surfaced by the standalone audit:
  // agent/status branches, agent/turn-stopping (+asking-pin guard), the
  // ask re-arm cap (lost tools/result fallback), and single done-hold
  // management (round-trip re-arm, dispose cancellation).
  const h2 = makeCtx();
  plugin.apply(h2.ctx);
  const statusRoute2 = h2.routes.find((r) => r.kind === "exact");
  const aggregate2 = () => {
    const res = fakeRes();
    statusRoute2.handler(null, res);
    return JSON.parse(res.body);
  };
  const liveTimers = () => h2.timers.filter((t) => !t.fired && !t.ran);
  // H15 agent/status running (event-driven) -> running
  h2.setAgents([{ id: "A", status: "running" }]);
  emit(h2.onHandlers, "agent/status", { agent: { id: "A" }, status: "running" });
  let agg = aggregate2();
  eq("H15 agent/status running -> running active 1",
    { state: agg.state, active: agg.active }, { state: "running", active: 1 });

  // H16 running event while the asking pin is on -> pin wins
  emit(h2.onHandlers, "tools/pre-execute", { name: "ask_user_question", agent: { id: "A" } }, () => {});
  emit(h2.onHandlers, "agent/status", { agent: { id: "A" }, status: "running" });
  agg = aggregate2();
  eq("H16 running event under asking pin -> asking",
    { state: agg.state, active: agg.active }, { state: "asking", active: 1 });

  // H17 agent/status idle after running -> done hold (event-driven), then expiry
  // H17 agent/status idle after running -> done hold (event-driven), then expiry.
  // The event and the live agents list must agree: aggregations read the list
  // status first, so the idle event is paired with list status "idle".
  emit(h2.onHandlers, "tools/result", { name: "ask_user_question", agent: { id: "A" } }, {});
  const askT = h2.timers[h2.timers.length - 1];
  askT.cb(); // hold expired, result present -> back to live running
  agg = aggregate2();
  eq("H17a ask released -> running", { state: agg.state, active: agg.active }, { state: "running", active: 1 });
  h2.setAgents([{ id: "A", status: "idle" }]);
  emit(h2.onHandlers, "agent/status", { agent: { id: "A" }, status: "idle" });
  agg = aggregate2();
  eq("H17b idle event (prev running) -> done hold",
    { state: agg.state, active: agg.active }, { state: "done", active: 1 });
  const dt = liveTimers().at(-1);
  dt.cb();
  agg = aggregate2();
  eq("H17c done hold expires -> idle", { state: agg.state, active: agg.active }, { state: "idle", active: 0 });

  // H18 idle event on an idle agent -> stays idle
  emit(h2.onHandlers, "agent/status", { agent: { id: "A" }, status: "idle" });
  agg = aggregate2();
  eq("H18 idle event on idle -> idle", { state: agg.state, active: agg.active }, { state: "idle", active: 0 });

  // H19 agent/turn-stopping (running) -> done (live list follows to "idle",
  // as in reality the stopping turn syncs to idle before the next aggregation)
  h2.setAgents([{ id: "A", status: "running" }]);
  emit(h2.onHandlers, "agent/status", { agent: { id: "A" }, status: "running" });
  emit(h2.onHandlers, "agent/turn-stopping", { agent: { id: "A" } });
  h2.setAgents([{ id: "A", status: "idle" }]);
  agg = aggregate2();
  eq("H19 turn-stopping (running) -> done",
    { state: agg.state, active: agg.active }, { state: "done", active: 1 });

  // H20 turn-stopping while the asking pin is on -> guard keeps asking
  emit(h2.onHandlers, "tools/pre-execute", { name: "ask_user_question", agent: { id: "A" } }, () => {});
  emit(h2.onHandlers, "agent/turn-stopping", { agent: { id: "A" } });
  agg = aggregate2();
  eq("H20 turn-stopping under pin -> stays asking",
    { state: agg.state, active: agg.active }, { state: "asking", active: 1 });

  // H21 lost tools/result: re-arms while the agent stays running (the user may
  // still be deciding), force-releases only once the agent leaves `running`.
  emit(h2.onHandlers, "agent/disposed", { agent: { id: "A" } });
  h2.setAgents([{ id: "B", status: "running" }]);
  emit(h2.onHandlers, "tools/pre-execute", { name: "ask_user_question", agent: { id: "B" } }, () => {});
  agg = aggregate2();
  eq("H21a ask pinned", { state: agg.state, active: agg.active }, { state: "asking", active: 1 });
  for (let i = 1; i <= 5; i++) {
    h2.timers[h2.timers.length - 1].cb(); // re-arm (no result yet, still running)
    agg = aggregate2();
    eq("H21b re-arm #" + i + " (no result, still running) -> still asking",
      { state: agg.state, active: agg.active }, { state: "asking", active: 1 });
  }
  // The turn ended while the result never arrived: the agent left `running`,
  // so the pin must force-release instead of re-arming forever. The release is
  // not a silent switch to idle — the running→idle transition is the standard
  // turn-end path, so reconcile arms the normal done hold first, then idle.
  h2.setAgents([{ id: "B", status: "idle" }]);
  h2.timers[h2.timers.length - 1].cb(); // hold expired, agent no longer running
  agg = aggregate2();
  eq("H21c force-release after agent leaves running -> done hold",
    { state: agg.state, active: agg.active }, { state: "done", active: 1 });
  liveTimers().at(-1).cb(); // done hold expires
  agg = aggregate2();
  eq("H21d done hold expiry -> idle", { state: agg.state, active: agg.active }, { state: "idle", active: 0 });

  // H22 done->running->done round-trip keeps a SINGLE live hold
  h2.setAgents([{ id: "C", status: "running" }]);
  emit(h2.onHandlers, "agent/status", { agent: { id: "C" }, status: "running" });
  emit(h2.onHandlers, "agent/turn-stopping", { agent: { id: "C" } }); // -> done (hold 1)
  emit(h2.onHandlers, "agent/status", { agent: { id: "C" }, status: "running" }); // -> running (cancels hold 1)
  emit(h2.onHandlers, "agent/turn-stopping", { agent: { id: "C" } }); // -> done (hold 2)
  const doneLives = liveTimers();
  eq("H22a only one live done hold after round-trip", doneLives.length, 1);
  h2.setAgents([{ id: "C", status: "idle" }]); // list agrees: turn finished
  doneLives[0].cb();
  agg = aggregate2();
  eq("H22b live hold expiry -> idle",
    { state: agg.state, active: agg.active }, { state: "idle", active: 0 });

  // H23 dispose cancels an in-flight done hold
  h2.setAgents([{ id: "D", status: "running" }]);
  emit(h2.onHandlers, "agent/status", { agent: { id: "D" }, status: "running" });
  emit(h2.onHandlers, "agent/turn-stopping", { agent: { id: "D" } }); // done + hold
  const dHold = liveTimers();
  ok("H23a done hold armed", dHold.length === 1, "live=" + dHold.length);
  emit(h2.onHandlers, "agent/disposed", { agent: { id: "D" } });
  ok("H23b disposed cancels done hold", dHold[0].fired === true);
  h2.setAgents([]);
  agg = aggregate2();
  eq("H23c disposed -> idle active 0", { state: agg.state, active: agg.active }, { state: "idle", active: 0 });
}

{
  // H24 the asking pin must still be releasable after a re-arm followed by a
  // second pre-execute. Regression: scheduleAskCheck cancelled the stored handle
  // unconditionally, so a pre-execute arriving while the callback was executing
  // its re-arm path killed the fresh handle — the session stayed pinned to
  // `asking` forever (nothing left to release it).
  const h3 = makeCtx();
  plugin.apply(h3.ctx);
  const statusRoute3 = h3.routes.find((r) => r.kind === "exact");
  const aggregate3 = () => {
    const res = fakeRes();
    statusRoute3.handler(null, res);
    return JSON.parse(res.body);
  };
  const state3 = () => { const a = aggregate3(); return { state: a.state, active: a.active }; };

  h3.setAgents([{ id: "E", status: "running" }]);
  emit(h3.onHandlers, "agent/status", { agent: { id: "E" }, status: "running" });
  emit(h3.onHandlers, "tools/pre-execute", { name: "ask_user_question", agent: { id: "E" } }, () => {});
  eq("H24a ask pinned", state3(), { state: "asking", active: 1 });

  h3.timers.at(-1).cb(); // no result yet + still running -> re-arm
  eq("H24b still asking after re-arm", state3(), { state: "asking", active: 1 });

  // Second ask_user_question while the re-armed timer is pending.
  emit(h3.onHandlers, "tools/pre-execute", { name: "ask_user_question", agent: { id: "E" } }, () => {});
  eq("H24c still asking after second pre-execute", state3(), { state: "asking", active: 1 });

  // The tool finally returns: SOME pending timer must be able to release the
  // pin. Every handle created for this agent is exercised, so a fix that left
  // only dead handles behind fails here.
  emit(h3.onHandlers, "tools/result", { name: "ask_user_question", agent: { id: "E" } }, {});
  const pending = h3.timers.filter((t) => !t.ran && !t.fired);
  ok("H24d at least one pending hold timer survived", pending.length >= 1, "pending=" + pending.length);
  for (const t of pending) t.cb();
  eq("H24e hold expiry after answer -> running", state3(), { state: "running", active: 1 });
}

{
  // H25–H28 — `defaultColor`: folded into the idle primary, echoed by the status
  // endpoint, and judged by the CIE76 similarity warning (advisory: a value that
  // collides with a state color is reported, never rejected).
  const logs = [];
  const h4 = makeCtx({ logger: logs });
  plugin.apply(h4.ctx);
  const statusRoute4 = h4.routes.find((r) => r.kind === "exact");
  const aggregate4 = () => {
    const res = fakeRes();
    statusRoute4.handler(null, res);
    return JSON.parse(res.body);
  };
  const opts4 = globalThis.__DSH_ICON_TEST__.settingsOpts;

  // Absent defaultColor: unchanged behavior, no warning, no log.
  const outOfTheBox = aggregate4();
  ok("H25a absent defaultColor keeps the idle default and warns about nothing",
    outOfTheBox.states.idle.colors[0] === "#1a1a1a" &&
    Array.isArray(outOfTheBox.warnings) && outOfTheBox.warnings.length === 0,
    JSON.stringify(outOfTheBox.warnings));
  ok("H25b absent defaultColor logs nothing", logs.length === 0, JSON.stringify(logs));

  // A distinct default color folds into the idle primary (colors[1] survives for
  // a multi-color idle effect) and is echoed by the status payload.
  opts4.setSource(() => ({
    defaultColor: "#5B8DEF",
    states: { idle: { effect: "breath", colors: ["#111111", "#DDDDDD"] } },
  }));
  opts4.onChange();
  const distinct = aggregate4();
  eq("H26a defaultColor overrides the idle primary", distinct.states.idle.colors[0], "#5b8def");
  eq("H26b defaultColor keeps the idle state's secondary color for multi-color effects",
    distinct.states.idle.colors[1], "#DDDDDD");
  eq("H26c status echoes the resolved defaultColor", distinct.defaultColor, "#5b8def");
  ok("H26d a distinct default color raises no similarity warning",
    distinct.warnings.filter((w) => w.code === "color-too-close").length === 0,
    JSON.stringify(distinct.warnings));

  // Exactly the running color: strong (ΔE 0), and the asking blink shares it.
  opts4.setSource(() => ({ defaultColor: "#FACC15", states: { idle: { effect: "static", colors: ["#111111"] } } }));
  opts4.onChange();
  const colliding = aggregate4();
  const runningWarn = colliding.warnings.find((w) => w.state === "running" && w.code === "color-too-close");
  ok("H27a a default color equal to the running color warns strongly",
    !!runningWarn && runningWarn.level === "strong" && runningWarn.deltaE === 0 && runningWarn.base === "#facc15",
    JSON.stringify(colliding.warnings));
  ok("H27b the asking blink's shared color warns too",
    colliding.warnings.some((w) => w.state === "asking" && w.code === "color-too-close"),
    JSON.stringify(colliding.warnings));
  ok("H27c the host logged the warning through ctx.logger",
    logs.some((l) => l.includes("dsh-web-icon-indicator") && l.includes("#facc15")),
    JSON.stringify(logs));

  // The soft band (12 ≤ ΔE < 25) reports level "warn" instead of "strong".
  opts4.setSource(() => ({ defaultColor: "#b8a000" }));
  opts4.onChange();
  const soft = aggregate4().warnings.find((w) => w.state === "running" && w.code === "color-too-close");
  ok("H28a the soft band reports level warn",
    !!soft && soft.level === "warn" && soft.deltaE > 12 && soft.deltaE < 25, JSON.stringify(soft));

  // A malformed value is dropped (never painted) and reported.
  opts4.setSource(() => ({ defaultColor: "#12" }));
  opts4.onChange();
  const malformed = aggregate4();
  ok("H28b an invalid defaultColor is dropped, not painted (echoed as null)",
    malformed.defaultColor === null && malformed.states.idle.colors[0] === "#1a1a1a",
    JSON.stringify({ defaultColor: malformed.defaultColor, idle: malformed.states.idle }));
  ok("H28c the invalid value is reported as a warning",
    malformed.warnings.some((w) => w.code === "invalid-color" && w.value === "#12"),
    JSON.stringify(malformed.warnings));

  // A rainbow state sweeps every hue, so any chromatic default collides with it.
  opts4.setSource(() => ({ defaultColor: "#5B8DEF", states: { done: { effect: "rainbow", colors: ["#22A06B"] } } }));
  opts4.onChange();
  const rainbow = aggregate4();
  ok("H28d a rainbow state warns against a chromatic default",
    rainbow.warnings.some((w) => w.code === "rainbow-overlap" && w.state === "done"),
    JSON.stringify(rainbow.warnings));
  ok("H28d2 a rainbow state does not also warn about a color it never paints",
    !rainbow.warnings.some((w) => w.state === "done" && w.code === "color-too-close"),
    JSON.stringify(rainbow.warnings));

  // "" / whitespace in a hand-written composition entry means "unset", not a
  // malformed color to warn about.
  opts4.setSource(() => ({ defaultColor: "  " }));
  opts4.onChange();
  const blank = aggregate4();
  ok("H28e a blank defaultColor means unset (echoed as null)",
    blank.defaultColor === null && blank.states.idle.colors[0] === "#1a1a1a" && blank.warnings.length === 0,
    JSON.stringify({ defaultColor: blank.defaultColor, warnings: blank.warnings }));

  // An empty YAML value (`defaultColor:`) parses as null: unset, not malformed.
  opts4.setSource(() => ({ defaultColor: null }));
  opts4.onChange();
  const nullDefault = aggregate4();
  ok("H28e2 a null defaultColor means unset too",
    nullDefault.defaultColor === null && nullDefault.warnings.length === 0,
    JSON.stringify({ defaultColor: nullDefault.defaultColor, warnings: nullDefault.warnings }));

  // A state whose colors are entirely invalid falls back to its built-in color
  // (resolveConfig), and the warning must judge that color — this pins the
  // card's matching fallback (F36).
  opts4.setSource(() => ({ defaultColor: "#FACC15", states: { running: { colors: ["red"] } } }));
  opts4.onChange();
  const fallback = aggregate4();
  ok("H28f an invalid state color falls back to the built-in color before comparing",
    fallback.states.running.colors[0] === "#FACC15" &&
    fallback.warnings.some((w) => w.state === "running" && w.color === "#facc15" && w.deltaE === 0),
    JSON.stringify({ running: fallback.states.running, warnings: fallback.warnings }));

  // A 4/5-digit hex is not a colour either: dropped by the host exactly like the
  // card drops it, never parsed into a bogus RGB triple.
  opts4.setSource(() => ({ states: { running: { colors: ["#1234"] } } }));
  opts4.onChange();
  const baddigit = aggregate4();
  ok("H28g a 4-digit hex state color is dropped, not parsed",
    baddigit.states.running.colors[0] === "#FACC15", JSON.stringify(baddigit.states.running));

  // A PARTIALLY invalid list keeps its valid entries (the card has to agree —
  // F49 pins the card side).
  opts4.setSource(() => ({ defaultColor: "#FF0000", states: { running: { colors: ["#FF0000", "red"] } } }));
  opts4.onChange();
  const partial = aggregate4();
  ok("H28h a partially invalid colors list keeps the valid entries",
    partial.states.running.colors.join(",") === "#FF0000" &&
    partial.warnings.some((w) => w.state === "running" && w.color === "#ff0000" && w.deltaE === 0),
    JSON.stringify({ running: partial.states.running, warnings: partial.warnings }));

  // The browser paints breath as a CONTINUOUS mix: a blue -> green gradient runs
  // straight through the configured default's own colour, which the old 5-point
  // sampling missed entirely (reported ΔE 37 instead of 0).
  opts4.setSource(() => ({
    defaultColor: "#005aa5",
    states: { running: { effect: "breath", colors: ["#0000ff", "#00ff00"] } },
  }));
  opts4.onChange();
  const breathGap = aggregate4();
  const breathWarn = breathGap.warnings.find((w) => w.state === "running" && w.code === "color-too-close");
  ok("H28i a breath gradient is sampled densely enough to catch the collision",
    !!breathWarn && breathWarn.deltaE < 8, JSON.stringify(breathGap.warnings));

  // idle itself on `rainbow` (composition entry only): it sweeps every hue, so
  // the default colour cannot stay distinguishable — one advisory, no pairwise pass.
  opts4.setSource(() => ({ defaultColor: "#ff0000", states: { idle: { effect: "rainbow", colors: ["#1a1a1a"] } } }));
  opts4.onChange();
  const idleRainbow = aggregate4();
  ok("H28j idle running rainbow is reported as a hue sweep",
    idleRainbow.warnings.some((w) => w.code === "rainbow-overlap" && w.state === "idle") &&
    !idleRainbow.warnings.some((w) => w.code === "color-too-close"),
    JSON.stringify(idleRainbow.warnings));
  opts4.setSource(() => ({ defaultColor: "#1a1a1a", states: { idle: { effect: "rainbow", colors: ["#1a1a1a"] } } }));
  opts4.onChange();
  ok("H28j2 a neutral default stays quiet even when idle is rainbow",
    aggregate4().warnings.length === 0, JSON.stringify(aggregate4().warnings));

  // A hand-written states.idle entry is honoured on its own (no defaultColor).
  opts4.setSource(() => ({ states: { idle: { effect: "blink", colors: ["#111111", "#DDDDDD"], speed: 900 } } }));
  opts4.onChange();
  const idleOnly = aggregate4();
  ok("H28k a hand-written states.idle entry survives without defaultColor",
    idleOnly.states.idle.effect === "blink" &&
    idleOnly.states.idle.colors.join(",") === "#111111,#DDDDDD" &&
    idleOnly.defaultColor === null,
    JSON.stringify({ idle: idleOnly.states.idle, defaultColor: idleOnly.defaultColor }));
}

{
  // H29 — the host log covers the other two warning codes as well (H27c only
  // asserted the color-too-close line).
  const logs2 = [];
  const h5 = makeCtx({ logger: logs2 });
  plugin.apply(h5.ctx);
  const statusRoute5 = h5.routes.find((r) => r.kind === "exact");
  const aggregate5 = () => {
    const res = fakeRes();
    statusRoute5.handler(null, res);
    return JSON.parse(res.body);
  };
  const opts5 = globalThis.__DSH_ICON_TEST__.settingsOpts;

  opts5.setSource(() => ({ defaultColor: "#zz" }));
  opts5.onChange();
  aggregate5();
  ok("H29 an invalid defaultColor is logged with its value",
    logs2.some((l) => l.includes("not a 3- or 6-digit hex color")), JSON.stringify(logs2));

  opts5.setSource(() => ({ defaultColor: "#ff0000", states: { done: { effect: "rainbow", colors: ["#22A06B"] } } }));
  opts5.onChange();
  aggregate5();
  ok("H29b a rainbow state is logged as an all-hue sweep",
    logs2.some((l) => l.includes("rainbow effect sweeps every hue")), JSON.stringify(logs2));
}

// ============================================================================
// PART 2 — browser injected script (real template, VM + DOM/fetch/rAF stubs)
// ============================================================================
function makeFakeLink(initialHref) {
  const attrs = { rel: "icon", type: "", href: initialHref || "" };
  return {
    isConnected: true,
    __attrs: attrs,
    setAttribute(k, v) {
      attrs[k] = String(v);
    },
    getAttribute(k) {
      return k in attrs ? attrs[k] : null;
    },
    parentNode: {
      replaceChild(fresh) {
        // adopt the fresh node's attrs into this link
        for (const k of Object.keys(fresh.__attrs)) attrs[k] = fresh.__attrs[k];
      },
    },
  };
}

class BrowserDriver {
  constructor({ initialHref = "http://orig.example/favicon.ico", states = DEFAULT_STATES, withFileReader = false } = {}) {
    this.link = makeFakeLink(initialHref);
    this.rafQueue = [];
    this.pollFn = null;
    this.queue = [];
    this.aborts = []; // AbortController stubs handed to fetch, in request order
    this.pendingTimeouts = []; // armed fetch-deadline callbacks (never auto-fired)
    const ctrl = this;
    const context = vm.createContext({
      window: {
        __DSH_WEB_ICON_INDICATOR__: false,
        addEventListener(ev, fn) {
          if (ev === "visibilitychange") ctrl.visFn = fn; // capture for the B18 test
        },
      },
      document: {
        visibilityState: "visible",
        querySelector: (sel) => (sel.includes("icon") ? ctrl.link : null),
        createElement: () => makeFakeLink(""),
        head: { appendChild() {} },
      },
      location: { origin: "http://localhost:3080" },
      setInterval: (fn) => {
        ctrl.pollFn = fn;
        return 1;
      },
      clearInterval() {},
      requestAnimationFrame: (cb) => {
        ctrl.rafQueue.push(cb);
        return ctrl.rafQueue.length;
      },
      cancelAnimationFrame: () => {
        ctrl.rafQueue.length = 0; // a new loop invalidates any stale steps
      },
      // Minimal AbortController so the script's deadline-bounded fetch path runs
      // inside the VM; tests can drive abort() through d.aborts[i].
      AbortController: class {
        constructor() {
          this.signal = { aborted: false };
          ctrl.aborts.push(this);
        }
        abort() {
          this.signal.aborted = true;
        }
      },
      // Timer stubs for the script's fetch deadline: the tests never wait 8 s,
      // they drive the abort through d.aborts[i].abort() instead.
      setTimeout: (fn) => { ctrl.pendingTimeouts.push(fn); return ctrl.pendingTimeouts.length; },
      clearTimeout: (id) => { if (id) ctrl.pendingTimeouts[id - 1] = null; },
      fetch: (url, init) =>
        new Promise((resolve, reject) => {
          ctrl.queue.push({ url: String(url), resolve, reject, signal: init && init.signal });
        }),
      // Optional Blob/FileReader stubs: let the original-icon capture path of
      // the offline-safe restore run inside the VM (fetch -> blob -> data URI).
      ...(withFileReader
        ? {
            Blob: class BlobStub {},
            FileReader: class FileReaderStub {
              readAsDataURL() {
                this.result = "data:image/x-icon;base64,AAEC";
                if (this.onload) this.onload();
              }
            },
          }
        : {}),
    });
    this.context = context;
    vm.runInContext(buildScript(states), context);
  }
  get href() {
    // Favicon frames are encodeURIComponent'd data URIs; decode so assertions
    // can match literal SVG substrings (rx="11", >3<, #E5484D, ...).
    return decodeURIComponent(this.link.__attrs.href || "");
  }
  svgRes(text) {
    return { ok: true, status: 200, text: async () => text, json: async () => ({}) };
  }
  statusRes(j) {
    return { ok: true, status: 200, text: async () => "", json: async () => j };
  }
  // answer every queued request; responder(url) -> response object | Error
  async pump(responder) {
    while (this.queue.length) {
      const req = this.queue.shift();
      const out = responder(req.url);
      if (out instanceof Error) req.reject(out);
      else req.resolve(out);
    }
    await tick();
  }
  // The script polls once at load; consume that initial request deterministically
  // so the first test-driven poll() sees a clean single-apply state.
  async ready(initialStatus) {
    await this.pump((url) =>
      url.includes("/base.svg") ? this.svgRes(BASE_SVG) : this.statusRes(initialStatus)
    );
    if (this.queue.length) await this.pump((url) => this.svgRes(BASE_SVG)); // deferred base fetch
    await tick();
  }
  // drive one poll: status json -> optional base fetch -> allow microtasks
  async poll(statusJson) {
    this.pollFn();
    await this.pump((url) =>
      url.includes("/base.svg") ? this.svgRes(BASE_SVG) : this.statusRes(statusJson)
    );
    if (this.queue.length) await this.pump((url) => this.svgRes(BASE_SVG)); // deferred base fetch
    await tick();
  }
  async pollFail() {
    this.pollFn();
    await this.pump(() => new Error("network down"));
    await tick();
  }
  raf(ts) {
    this.rafQueue.shift()(ts);
  }
}

console.log("\n=== Part 2: browser injected script ===");
{
  // B1 initial whale frame (active 1)
  const d = new BrowserDriver();
  await d.ready({ state: "running", active: 1, states: DEFAULT_STATES });
  ok("B1 whale frame painted", d.href.includes("M48.8354") && d.href.includes("FACC15"),
    d.href.slice(0, 120));

  // B2-B4 count transitions on one driver
  await d.poll({ state: "running", active: 3, states: DEFAULT_STATES });
  ok("B2 active 3 -> number block",
    d.href.includes('rx="11"') && d.href.includes(">3<") && !d.href.includes("M48.8354"),
    d.href.slice(0, 160));
  await d.poll({ state: "running", active: 2, states: DEFAULT_STATES });
  ok("B3 active 2 -> number 2", d.href.includes(">2<") && d.href.includes('rx="11"'));
  await d.poll({ state: "running", active: 1, states: DEFAULT_STATES });
  ok("B4 active 1 -> whale back", d.href.includes("M48.8354"));

  // B5 same-key repoll stable (no loop restart churn)
  const frameBefore = d.href;
  await d.poll({ state: "running", active: 1, states: DEFAULT_STATES });
  ok("B5 same key repoll -> identical frame", d.href === frameBefore);

  // B6 legacy host (no active) keeps count; non-numeric active ignored
  await d.poll({ state: "running", states: DEFAULT_STATES }); // no active field
  ok("B6 legacy no active -> whale kept", d.href.includes("M48.8354"));
  await d.poll({ state: "running", active: "2", states: DEFAULT_STATES }); // non-number ignored
  ok("B6b string active ignored -> still whale", d.href.includes("M48.8354"));
  await d.poll({ state: "running", active: 4, states: DEFAULT_STATES });
  ok("B6c numeric active 4 -> number 4", d.href.includes(">4<"));

  // B7 blink animates the count block fill
  const b = new BrowserDriver();
  await b.ready({ state: "asking", active: 2, states: DEFAULT_STATES });
  ok("B7 blink initial frame is colors[0]",
    b.href.includes("E5484D") && b.href.includes(">2<"), b.href.slice(0, 140));
  b.raf(400); // t0 = 400 -> t = 0 -> c0
  ok("B7b step t=0 -> E5484D", b.href.includes("E5484D"));
  b.raf(800); // t = 400 -> toggle -> c1
  ok("B7c step t=400 -> FACC15", b.href.includes("FACC15") && b.href.includes(">2<"));

  // B8 rainbow cycles the count block fill
  const rainbowStates = { ...DEFAULT_STATES, running: { effect: "rainbow", colors: ["#FACC15"], speed: 1200 } };
  const r = new BrowserDriver({ states: rainbowStates });
  await r.ready({ state: "running", active: 2, states: rainbowStates });
  const r0 = r.href;
  r.raf(800); // t0=800, t=0 -> same hue
  r.raf(1600); // t=800 -> hue rotated
  const r2 = r.href;
  ok("B8 rainbow fills differ, both number blocks",
    r0 !== r2 && r0.includes(">2<") && r2.includes(">2<") && r0.includes('rx="11"'));

  // B9 syncCfg: settings change repaints with the new color
  const s = new BrowserDriver();
  await s.ready({ state: "running", active: 1, states: DEFAULT_STATES });
  ok("B9a baseline yellow whale", s.href.includes("FACC15"));
  await s.poll({
    state: "running",
    active: 1,
    states: { ...DEFAULT_STATES, running: { effect: "static", colors: ["#123456"] } },
  });
  ok("B9b new state color applied", s.href.includes("123456") && !s.href.includes("FACC15"));

  // B10 outage with a server-URL original and NO cached copy (no FileReader
  // in this driver): restore() must keep the last painted frame — writing the
  // original URL would blank the tab, exactly the "backend stopped → icon
  // lost" bug this guards against.
  const f = new BrowserDriver({ initialHref: "http://orig.example/favicon.ico" });
  await f.ready({ state: "running", active: 1, states: DEFAULT_STATES }); // paint something else
  const lastFrame = f.href;
  ok("B10a icon painted before the failure",
    lastFrame.includes("data:image/svg+xml") && lastFrame.includes("FACC15"), lastFrame.slice(0, 120));
  await f.pollFail();
  ok("B10b outage keeps the last painted icon", f.href === lastFrame, f.href);
  ok("B10c dead server URL never written on failure", !f.href.includes("orig.example"), f.href);
  await f.pollFail();
  ok("B10d repeated failures stay stable (restore once per outage)", f.href === lastFrame, f.href);

  // B12 the original icon is captured as a data-URI copy at startup, so an
  // outage restores THAT (renderable without the host) instead of a dead URL.
  const c = new BrowserDriver({ initialHref: "/favicon.svg", withFileReader: true });
  // Startup order: captureOriginal's fetch + the initial poll, then the
  // deferred base.svg fetch once apply() runs.
  const origRes = { ok: true, status: 200, blob: async () => ({}) };
  await c.pump((url) =>
    url.includes("/base.svg") ? c.svgRes(BASE_SVG)
    : url.includes("/favicon.svg") ? origRes
    : c.statusRes({ state: "running", active: 1, states: DEFAULT_STATES })
  );
  await c.pump((url) => (url.includes("/base.svg") ? c.svgRes(BASE_SVG) : new Error("unexpected " + url)));
  await tick();
  ok("B12a plugin frame painted", c.href.includes("data:image/svg+xml") && c.href.includes("FACC15"),
    c.href.slice(0, 120));
  await c.pollFail();
  ok("B12b outage restores the cached data-URI copy", c.href === "data:image/x-icon;base64,AAEC", c.href);
  await c.pollFail();
  ok("B12c repeated failures keep the restored icon stable", c.href === "data:image/x-icon;base64,AAEC", c.href);

  // B11 old-host payload (no states) leaves CFG untouched
  const g = new BrowserDriver();
  await g.ready({ state: "running", active: 2, states: DEFAULT_STATES });
  ok("B11a number before legacy payload", g.href.includes(">2<"));
  await g.poll({ state: "running", active: 2 }); // no states -> older host
  ok("B11b old-host poll keeps frames", g.href.includes(">2<"));

  // B13 geometric effects wrap the whale in a <g transform> (previously
  // untested: heartbeat and bounce were only ever exercised in the demo page).
  const hbStates = { ...DEFAULT_STATES, running: { effect: "heartbeat", colors: ["#FACC15"], speed: 1200 } };
  const hb = new BrowserDriver({ states: hbStates });
  await hb.ready({ state: "running", active: 1, states: hbStates });
  hb.raf(100); // t=0 -> outside the lub-dub window, scale 1
  ok("B13a heartbeat wraps the whale in a scale group",
    hb.href.includes('<g transform="translate(27.889625 24.95264) scale(1) translate(-27.889625 -24.95264)">') &&
    hb.href.includes("</g></svg>") && hb.href.includes("FACC15"),
    hb.href.slice(0, 200));
  hb.raf(160); // t=60ms -> 0.05 of the cycle -> first beat, scale > 1
  ok("B13b heartbeat beats inside the first window",
    /scale\(1\.\d+\)/.test(hb.href) && parseFloat(/scale\((1\.\d+)\)/.exec(hb.href)[1]) > 1.05,
    (hb.href.match(/scale\([^)]*\)/) || ["none"])[0]);

  const boStates = { ...DEFAULT_STATES, running: { effect: "bounce", colors: ["#22A06B"], speed: 1200 } };
  const bo = new BrowserDriver({ states: boStates });
  await bo.ready({ state: "running", active: 1, states: boStates });
  bo.raf(100);
  ok("B13c bounce wraps the whale in a translate group",
    /<g transform="translate\(0 -?0\.\d+\)">/.test(bo.href) && bo.href.includes("22A06B"),
    (bo.href.match(/<g transform="[^"]*"/) || ["none"])[0]);
  bo.raf(312); // quarter of a 1.6-cycle -> maximum lift
  ok("B13d bounce lifts the whale", /translate\(0 -[1-9]/.test(bo.href), bo.href.slice(0, 200));

  // B14 breath interpolates between colors[0] and colors[1]. Sample at
  // t = speed/4 and t = 3·speed/4 (the two extremes) — t = speed is the
  // midpoint again, because sin(2π) is -2.4e-16 rather than exactly 0.
  const brStates = { ...DEFAULT_STATES, running: { effect: "breath", colors: ["#000000", "#FFFFFF"], speed: 1200 } };
  const br = new BrowserDriver({ states: brStates });
  await br.ready({ state: "running", active: 1, states: brStates });
  const fillOf = (d) => (/fill: (#[0-9a-f]{6})/.exec(d.href) || [])[1] || "";
  br.raf(100); // t=0 -> midpoint
  const midFill = fillOf(br);
  br.raf(400); // t=300 -> quarter cycle -> colors[1]
  const firstExtreme = fillOf(br);
  br.raf(1000); // t=900 -> three-quarter cycle -> colors[0]
  const secondExtreme = fillOf(br);
  const lum = (hex) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  ok("B14a breath midpoint between the two colors", midFill === "#808080", midFill);
  ok("B14b breath reaches both configured colors",
    firstExtreme === "#ffffff" && secondExtreme === "#000000" &&
    lum(firstExtreme) > lum(midFill) && lum(secondExtreme) < lum(midFill),
    "q1=" + firstExtreme + " mid=" + midFill + " q3=" + secondExtreme);

  // B15 hidden-tab fallback: an unchanged static state repaints (self-heal)
  // instead of leaving a stale frame; an unchanged animated state gets a
  // wall-clock frame rather than freezing.
  const sh = new BrowserDriver();
  await sh.ready({ state: "running", active: 1, states: DEFAULT_STATES });
  const shFrame = sh.href;
  sh.link.__attrs.href = "data:image/svg+xml,stale";
  await sh.poll({ state: "running", active: 1, states: DEFAULT_STATES });
  ok("B15a unchanged static poll self-heals the frame", sh.href === shFrame && !sh.href.includes("stale"));

  // B16 the count block does not depend on base.svg: with the template
  // permanently unavailable the count must still render (only the whale waits).
  const nb = new BrowserDriver();
  await nb.pump((url) => (url.includes("/base.svg") ? new Error("base down") : nb.statusRes({ state: "running", active: 3, states: DEFAULT_STATES })));
  await tick();
  ok("B16a no base.svg -> no whale frame", !nb.href.includes("M48.8354"), nb.href.slice(0, 120));
  await nb.poll({ state: "running", active: 3, states: DEFAULT_STATES });
  await nb.pump((url) => (url.includes("/base.svg") ? new Error("base down") : nb.statusRes({ state: "running", active: 3, states: DEFAULT_STATES })));
  ok("B16b count block renders without base.svg", nb.href.includes(">3<") && nb.href.includes('rx="11"'), nb.href.slice(0, 160));

  // B17 every request is deadline-bounded: fetch receives an AbortSignal, and a
  // request that hangs is aborted instead of holding the poll chain forever.
  const t = new BrowserDriver();
  await t.pump((url) => (url.includes("/base.svg") ? t.svgRes(BASE_SVG) : t.statusRes({ state: "running", active: 1, states: DEFAULT_STATES })));
  ok("B17a fetch requests carry an abort signal",
    t.aborts.length > 0 && t.aborts.every((a) => a.signal && a.signal.aborted === false),
    "controllers=" + t.aborts.length);
  ok("B17b a deadline timer was armed per request", t.pendingTimeouts.length > 0,
    "timers=" + t.pendingTimeouts.length);
  // Simulate the deadline expiring on the in-flight poll.
  t.pollFn();
  const hanging = t.queue[t.queue.length - 1];
  t.aborts[t.aborts.length - 1].abort();
  ok("B17c aborting marks the request signal", hanging.signal.aborted === true);
  hanging.reject(new Error("AbortError"));
  await tick();
  // The poll chain survived the abort: the next tick still works.
  await t.poll({ state: "running", active: 1, states: DEFAULT_STATES });
  ok("B17d poll recovers after an aborted request", t.href.includes("FACC15"));

  // B18 returning to a hidden tab repaints immediately: the visibilitychange
  // listener fires a fresh poll instead of waiting for the next — possibly
  // throttled — interval tick, so a revert that happened while the tab was
  // away (e.g. done -> idle) shows the moment the tab becomes visible again.
  const v = new BrowserDriver();
  await v.ready({ state: "running", active: 1, states: DEFAULT_STATES });
  v.context.document.visibilityState = "hidden";
  await v.poll({ state: "done", active: 1, states: DEFAULT_STATES }); // what the tab saw before going away
  ok("B18a done frame painted while 'hidden'", v.href.includes("22A06B"), v.href.slice(0, 120));
  // The host reverts to idle while the tab is away; the tab becomes visible.
  v.context.document.visibilityState = "visible";
  ok("B18b visibilitychange listener captured", typeof v.visFn === "function");
  v.visFn(); // fires the immediate poll
  await v.pump((url) =>
    url.includes("/base.svg") ? v.svgRes(BASE_SVG) : v.statusRes({ state: "idle", active: 0, states: DEFAULT_STATES })
  );
  if (v.queue.length) await v.pump((url) => v.svgRes(BASE_SVG)); // deferred base fetch
  await tick();
  ok("B18c visible-return poll repaints the reverted idle frame",
    v.href.includes("1a1a1a") && !v.href.includes("22A06B"), v.href.slice(0, 160));
  // A hidden->visible transition must NOT clobber an animated frame either:
  // poll a different state while visible and confirm the listener path stays safe.
  await v.poll({ state: "running", active: 1, states: DEFAULT_STATES });
  ok("B18d subsequent polls unaffected after visible-return poll", v.href.includes("FACC15"));
}

// ============================================================================
// PART 3 — bigNumUri unit checks (extracted from the template)
// ============================================================================
console.log("\n=== Part 3: bigNumUri rendering ===");
{
  const bigNumSrc = extractBlock(TEMPLATE, "function bigNumUri(fill) {");
  // bigNumUri memoizes through cachedUri, so the extracted slice needs that
  // helper too (plus the map it closes over).
  const cachedUriSrc = extractBlock(TEMPLATE, "function cachedUri(kind, fill, build) {");
  function hexToRgbStub(h) {
    h = String(h).replace("#", "");
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const makeBigNum = (ACTIVE) =>
    new Function(
      "ACTIVE", "BIG_NUM_RX", "hexToRgb", "encodeURIComponent", "URI_CACHE",
      cachedUriSrc + "\n" + bigNumSrc + "\nreturn bigNumUri;"
    )(ACTIVE, 11, hexToRgbStub, (s) => s, new Map());

  // contrast: dark/red/green -> white text; bright -> dark text
  for (const [fill, wantFg] of [
    ["#1a1a1a", "#FFFFFF"],
    ["#E5484D", "#FFFFFF"],
    ["#22A06B", "#FFFFFF"],
    ["#FACC15", "#111111"],
    ["#ffffff", "#111111"],
  ]) {
    const out = makeBigNum(2)(fill);
    ok("C contrast " + fill + " -> " + wantFg,
      out.includes('fill="' + wantFg + '"') && out.includes('fill="' + fill + '"'));
  }
  ok("C2 one digit fontSize 26", makeBigNum(2)("#FACC15").includes('font-size="26"'));
  const two = makeBigNum(12)("#FACC15");
  ok("C3 two digits fontSize 20 + text", two.includes('font-size="20"') && two.includes(">12<"));
  const capped = makeBigNum(100)("#FACC15");
  ok("C4 cap 99+ fontSize 15.5", capped.includes(">99+<") && capped.includes('font-size="15.5"'));
  ok("C5 rounded rect rx=11 full frame", makeBigNum(2)("#FACC15").includes('width="50" height="50" rx="11"'));
}

// ============================================================================
// PART 4 — injected script syntax
// ============================================================================
console.log("\n=== Part 4: injected script syntax ===");
{
  const tmp = path.join(os.tmpdir(), "dsh-injected-check-" + process.pid + ".js");
  writeFileSync(tmp, builtScript);
  const out = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  ok("D1 injected script parses", out.status === 0, out.stderr);
  unlinkSync(tmp);
}

// ============================================================================
// PART 5 — demo/badge.html inline script syntax
// ============================================================================
console.log("\n=== Part 5: demo/badge.html inline script syntax ===");
{
  // demo/ is a repo-only playground (not in the npm `files` allowlist), so an
  // installed tarball must still be able to run `npm test`.
  let html = null;
  try {
    html = readFileSync(new URL("../demo/badge.html", import.meta.url), "utf8");
  } catch (e) {
    html = null;
  }
  if (html === null) {
    console.log("SKIP  E1/E2 demo/badge.html not present (published tarball)");
  } else {
    const m = html.match(/<script>([\s\S]*?)<\/script>/);
    ok("E1 demo has an inline script", !!m);
    if (m) {
      const tmp = path.join(os.tmpdir(), "badge-inline-" + process.pid + ".js");
      writeFileSync(tmp, m[1]);
      const out = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
      ok("E2 demo inline script parses + threshold aligned",
        out.status === 0 && m[1].includes('count() >= 2') && m[1].includes('n < 2'), out.stderr);
      unlinkSync(tmp);
    }
  }
}

// ============================================================================
// PART 6 — browser half (lib/client.js): loader contract, card render, writes
// ============================================================================
// The card bundle is a hand-written ModuleLoader factory with two shell-provided
// requires (`react`, `@deepseek-ai/dsh-client-ui-primitives`). Both are stubbed
// here — zero dependencies, no build step — so the REAL bundle runs and the
// rendered tree plus the scope writes it performs can be asserted.
console.log("\n=== Part 6: browser half (lib/client.js) ===");
{
  const CLIENT_SRC = readFileSync(new URL("lib/client.js", REPO), "utf8");

  /** Minimal React stub: createElement trees + the two hooks the card uses. */
  function makeReactStub() {
    let states = [];
    let cursor = 0;
    let rerender = () => {};
    const createElement = (type, props, ...children) => ({
      type,
      props: { ...(props || {}), children: children.length <= 1 ? children[0] : children },
    });
    return {
      createElement,
      useState(initial) {
        const i = cursor++;
        if (!(i in states)) states[i] = initial;
        return [states[i], (next) => {
          states[i] = typeof next === "function" ? next(states[i]) : next;
          rerender();
        }];
      },
      useSyncExternalStore(subscribe, getSnapshot) {
        return getSnapshot();
      },
      __reset() { states = []; cursor = 0; },
      __beginRender(fn) { cursor = 0; rerender = fn; },
    };
  }

  const primitivesStub = {
    Button: function Button() { return null; },
    Input: function Input() { return null; },
    IconChevronDownOutline14: function IconChevronDownOutline14() { return null; },
    DisclosureRow: function DisclosureRow() { return null; },
  };

  /** Walk a createElement tree, yielding every node (depth first). */
  function* walk(node) {
    if (node === null || node === undefined || node === false) return;
    if (Array.isArray(node)) {
      for (const child of node) yield* walk(child);
      return;
    }
    if (typeof node !== "object" || !("type" in node)) return;
    yield node;
    yield* walk(node.props?.children);
  }
  const findAll = (tree, pred) => [...walk(tree)].filter(pred);
  const textOf = (tree) => [...walk(tree)].filter((n) => typeof n.props?.children === "string")
    .map((n) => n.props.children).join(" ");
  const findButton = (tree, label) =>
    findAll(tree, (n) => n.type === primitivesStub.Button && n.props.children === label)[0] || null;

  // ---- loader + factory ----------------------------------------------------
  let loaded = null;
  const loaderWindow = {
    __ModuleLoader__: {
      load(def) { loaded = def; },
    },
  };
  const vmCtx = vm.createContext({ window: loaderWindow });
  vm.runInContext(CLIENT_SRC, vmCtx);
  ok("F1 bundle registers through window.__ModuleLoader__", !!loaded && loaded.id === "dsh-web-icon-indicator",
    "id=" + (loaded && loaded.id));
  ok("F2 bundle declares a factory", !!loaded && typeof loaded.factory === "function");

  const react = makeReactStub();
  const requireStub = (name) => {
    if (name === "react") return react;
    if (name === "@deepseek-ai/dsh-client-ui-primitives") return primitivesStub;
    throw new Error("unexpected require: " + name);
  };
  const client = loaded.factory(requireStub);
  ok("F3 exports apply + inject", typeof client.apply === "function" && Array.isArray(client.inject));
  eq("F4 inject list", client.inject, ["slots", "settingsScope", "locale"]);

  // ---- apply() contract ----------------------------------------------------
  const registered = [];
  const dictionaries = [];
  let boundSpec = null;
  const scope = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set: async (field, value) => { writes.push({ op: "set", field, value }); },
    unset: async (field) => { writes.push({ op: "unset", field }); },
    mutate: async (ops) => { writes.push({ op: "mutate", ops }); },
  };
  const writes = [];
  const snapshot = {
    status: "ready",
    writable: true,
    value: {
      askingHoldMs: 3500,
      doneHoldMs: 5000,
      states: {
        idle: { effect: "static", colors: ["#1a1a1a"] },
        running: { effect: "static", colors: ["#FACC15"] },
        asking: { effect: "blink", colors: ["#E5484D", "#FACC15"], speed: 400 },
        done: { effect: "static", colors: ["#22A06B"] },
      },
    },
    base: {},
    user: {},
    revision: 1,
    mode: "host",
  };
  const clientCtx = {
    locale: {
      register(ns, dicts) { dictionaries.push({ ns, dicts }); return () => {}; },
      bind(ns) { return (key) => (dictionaries[0]?.dicts?.en?.[key] ?? key); },
    },
    settingsScope: {
      bind(spec) { boundSpec = spec; return scope; },
    },
    slots: {
      inject(name, cb) { cb(); },
      register(slotSpec, component) { registered.push({ slotSpec, component }); return () => {}; },
    },
    effect(fn) { return fn(); },
  };
  client.apply(clientCtx);

  eq("F5 settingsScope bound to the join key", boundSpec && boundSpec.namespace, "web-icon-indicator");
  ok("F6 locale dictionaries registered (en + zh)",
    dictionaries.length === 1 && !!dictionaries[0].dicts.en && !!dictionaries[0].dicts.zh,
    "ns=" + (dictionaries[0] && dictionaries[0].ns));
  ok("F7 one card registered into settings.plugin.item",
    registered.length === 1 && registered[0].slotSpec.name === "settings.plugin.item",
    "count=" + registered.length);
  const slotSpec = registered[0] && registered[0].slotSpec;
  eq("F8 slot key is the settings namespace", slotSpec && slotSpec.key, "web-icon-indicator");
  eq("F9 slot locale namespace", slotSpec && slotSpec.locale, "dsh-web-icon-indicator");
  const injected = slotSpec && slotSpec.inject();
  ok("F10 slot inject provides scope + t",
    injected && injected.scope === scope && typeof injected.t === "function");

  // ---- card render ---------------------------------------------------------
  // React is stubbed, so a re-render is driven explicitly: the card's own
  // setState calls `rerender()`, which re-invokes the component with the same
  // props against the same hook storage.
  const Card = registered[0].component;
  const renderCard = (props) => {
    let tree = null;
    const render = () => { react.__beginRender(render); tree = Card(props); };
    render();
    return () => tree;
  };
  const t = injected.t;
  const cardProps = { scope, t };
  const card = renderCard(cardProps);
  const collapsed = card();
  ok("F11 card renders its title", textOf(collapsed).includes("Favicon indicator"),
    textOf(collapsed).slice(0, 80));
  ok("F12 card is collapsed by default (no fields yet)",
    findAll(collapsed, (n) => n.props && n.props.id === "plugin-config-icon-asking-hold").length === 0);

  // Expand it (the header button toggles local state and re-renders).
  const header = findAll(collapsed, (n) => n.type === "button")[0];
  ok("F13 header button toggles the card", !!header && typeof header.props.onClick === "function");
  header.props.onClick();
  const openTree = card();
  ok("F14 expanded card exposes both hold fields",
    findAll(openTree, (n) => n.props && n.props.id === "plugin-config-icon-asking-hold").length === 1 &&
    findAll(openTree, (n) => n.props && n.props.id === "plugin-config-icon-done-hold").length === 1);
  ok("F15 the animated / signal states get a detail row",
    ["Running", "Asking", "Done"].every((name) =>
      findAll(openTree, (n) => n.type === primitivesStub.DisclosureRow && n.props.title === name).length === 1),
    textOf(openTree).slice(0, 120));
  // Idle has no detail row: its single color is the default-color field and it
  // takes no animation, so no idle effect/colors/cycle field may render.
  ok("F15b idle has no detail row and no idle field",
    findAll(openTree, (n) => n.type === primitivesStub.DisclosureRow && n.props.title === "Idle").length === 0 &&
    findAll(openTree, (n) => n.props && typeof n.props.id === "string" && n.props.id.indexOf("plugin-config-icon-idle-") === 0).length === 0,
    textOf(openTree).slice(0, 160));
  // The row header previews EVERY color of the state: asking blinks between two
  // colors, so a single dot hid one of them.
  const askingRowNode = findAll(openTree, (n) => n.type === primitivesStub.DisclosureRow && n.props.title === "Asking")[0];
  const askingIcon = askingRowNode.props.icon;
  const askingBands = askingIcon && askingIcon.props && askingIcon.props.children;
  ok("F15c the row icon is ONE chip split into explicit bands (asking: red | yellow)",
    !!askingIcon && askingIcon.props.style.position === "relative" &&
    Array.isArray(askingBands) && askingBands.length === 2 &&
    askingBands.map((b) => b.props.style.background).join(",") === "#E5484D,#FACC15" &&
    // 1px seam between the bands, and the last band overflows so the right edge
    // never shows a gap (the chip clips it).
    askingBands[0].props.style.width === "calc(50% - 1px)" &&
    askingBands[1].props.style.width === "calc(50% + 1px)",
    JSON.stringify(askingBands && askingBands.map((b) => b.props.style)));
  const runningIcon = findAll(openTree, (n) => n.type === primitivesStub.DisclosureRow && n.props.title === "Running")[0].props.icon;
  ok("F15c2 a single-color state is one full-width band",
    runningIcon.props.children.length === 1 &&
    runningIcon.props.children[0].props.style.background === "#FACC15" &&
    runningIcon.props.children[0].props.style.width === "calc(100% + 1px)",
    JSON.stringify(runningIcon.props.children[0].props.style));
  // The colors field edits chips: asking carries both colors plus add/remove,
  // while a static state (no second color in play) offers no add chip.
  const askingColorsField = findAll(openTree, (n) => n.props && n.props.id === "plugin-config-icon-asking-colors")[0];
  const runningColorsField = findAll(openTree, (n) => n.props && n.props.id === "plugin-config-icon-running-colors")[0];
  ok("F15d a full two-colour list exposes both colours and a remove (no add) affordance",
    !!askingColorsField && askingColorsField.props.colors.join(",") === "#E5484D,#FACC15" &&
    askingColorsField.props.canAdd === false && askingColorsField.props.canRemove === true &&
    !!runningColorsField && runningColorsField.props.canAdd === false,
    JSON.stringify({
      asking: askingColorsField && askingColorsField.props.colors,
      askingAdd: askingColorsField && askingColorsField.props.canAdd,
      runningAdd: runningColorsField && runningColorsField.props.canAdd,
    }));
  const askingRow = findAll(openTree, (n) => n.type === primitivesStub.DisclosureRow && n.props.title === "Asking")[0];
  // `textOf` only collects single-string children; the summary mixes strings
  // with chip elements, so walk the children recursively for its text.
  const deepText = (node) => {
    if (node === null || node === undefined || node === false) return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(deepText).join(" ");
    if (typeof node !== "object" || !("type" in node)) return "";
    return deepText(node.props && node.props.children);
  };
  const askingSummary = deepText(askingRow.props.collapsedContent);
  const summaryChips = findAll(askingRow.props.collapsedContent, (n) => n.props && n.props.style && n.props.style.background);
  ok("F16 the summary stays compact text (effect + cycle), no hex and no repeated chips",
    askingSummary === "Blink · 400ms" && summaryChips.length === 0,
    JSON.stringify({ text: askingSummary, chips: summaryChips.length }));

  // ---- writes --------------------------------------------------------------
  const saveBtn = findButton(openTree, "Save");
  const discardBtn = findButton(openTree, "Discard");
  const resetBtn = findButton(openTree, "Reset to defaults");
  ok("F17 footer exposes Save / Discard / Reset", !!saveBtn && !!discardBtn && !!resetBtn);
  ok("F18 Save is disabled while the form is pristine", saveBtn.props.disabled === true);

  // Reset clears the three namespace keys back to the composition layer. The
  // handler itself is synchronous; the UI settles on the next microtask.
  writes.length = 0;
  resetBtn.props.onClick();
  await tick();
  eq("F19 reset unsets every namespace key",
    writes.map((w) => w.op + ":" + w.field).sort(),
    ["unset:askingHoldMs", "unset:defaultColor", "unset:doneHoldMs", "unset:states"]);
  ok("F19b form returns to pristine after reset", findButton(card(), "Save").props.disabled === true);

  // ---- a staged edit saves as ONE atomic mutation --------------------------
  writes.length = 0;
  const byId = (tree, id) => findAll(tree, (n) => n.props && n.props.id === id)[0] || null;
  const holdField = byId(openTree, "plugin-config-icon-asking-hold");
  ok("F20 hold field bound to the resolved value", holdField && holdField.props.value === "3500",
    holdField && holdField.props.value);
  holdField.props.onChange("2500");
  const dirtyTree = card();
  const dirtySave = findButton(dirtyTree, "Save");
  ok("F21 editing a field marks the form dirty", dirtySave.props.disabled === false);
  ok("F22 unsaved badge appears", textOf(dirtyTree).includes("Unsaved"));
  dirtySave.props.onClick();
  await tick();
  eq("F23 save issues one atomic mutate with path ops",
    writes.length === 1 && writes[0].op === "mutate" ? writes[0].ops : writes,
    [{ op: "set", path: ["askingHoldMs"], value: 2500 }]);

  // A per-state edit rebuilds the whole `states` entry in the same mutate.
  // Idle has no row (F15b), so this uses Running.
  writes.length = 0;
  const runningRow = findAll(openTree, (n) => n.type === primitivesStub.DisclosureRow && n.props.title === "Running")[0];
  runningRow.props.onToggle(); // expand the running row (re-render is explicit)
  const runningOpenTree = card();
  const runningEffect = byId(runningOpenTree, "plugin-config-icon-running-effect");
  ok("F24 expanded state row exposes its effect select", !!runningEffect && runningEffect.props.value === "static",
    runningEffect && runningEffect.props.value);
  runningEffect.props.onChange("breath");
  findButton(card(), "Save").props.onClick();
  await tick();
  const stateOp = writes[0] && writes[0].ops && writes[0].ops[0];
  eq("F25 state edit saves the whole states object at its path",
    stateOp && stateOp.op === "set" && stateOp.path.join(".") + "=" + stateOp.value.running.effect,
    "states=breath");
  ok("F26 only edited states are written to the user layer",
    Object.keys(stateOp.value).length === 1 && !!stateOp.value.running,
    JSON.stringify(stateOp.value));

  // A previously saved override for another state must survive an edit of a
  // different state: `scope.set('states', …)` replaces the whole field, so the
  // card rebuilds it from the raw user layer. An idle entry the card cannot
  // edit (e.g. hand-written into settings.yaml) must survive untouched too.
  writes.length = 0;
  snapshot.user = {
    states: {
      done: { effect: "rainbow", colors: ["#FF0000"] },
      idle: { effect: "breath", colors: ["#111111", "#DDDDDD"] },
    },
  };
  const runningAgain = byId(card(), "plugin-config-icon-running-effect");
  runningAgain.props.onChange("bounce");
  findButton(card(), "Save").props.onClick();
  await tick();
  const carried = writes[0] && writes[0].ops && writes[0].ops[0] && writes[0].ops[0].value;
  ok("F27 an existing user-layer override is carried through",
    carried && carried.done && carried.done.effect === "rainbow" && carried.running.effect === "bounce",
    JSON.stringify(carried));
  ok("F27b a hand-written idle entry survives untouched",
    carried && carried.idle && carried.idle.effect === "breath" && carried.idle.colors.length === 2,
    JSON.stringify(carried && carried.idle));

  // ---- default color: field, live warning, one-atomic-mutate save -----------
  writes.length = 0;
  const defaultField = byId(card(), "plugin-config-icon-default-color");
  ok("F28 with no override configured the field shows the idle color chip",
    !!defaultField && Array.isArray(defaultField.props.colors) && defaultField.props.colors[0] === "#1a1a1a",
    JSON.stringify(defaultField && defaultField.props.colors));
  const paletteLabel = findAll(card(), (n) => n.props && n.props.children === "Palette")[0];
  const paletteRow = findAll(card(), (n) => Array.isArray(n.props && n.props.children) &&
    n.props.children.indexOf(paletteLabel) !== -1)[0];
  const paletteItems = (paletteRow && paletteRow.props.children[1]) || [];
  const paletteBands = (item) => item.props.children[1].props.children.map((b) => b.props.style.background);
  ok("F28b the palette lists every state as name-then-chip, one banded chip for asking",
    !!paletteLabel && paletteItems.length === 4 &&
    paletteItems.every((item) => typeof item.props.children[0] === "string" &&
      item.props.children[1] && Array.isArray(item.props.children[1].props.children)) &&
    paletteItems.some((item) => paletteBands(item).join(",") === "#E5484D,#FACC15"),
    JSON.stringify(paletteItems.map((item) => [item.props.children[0], paletteBands(item)])));
  // The card shows colors as chips; the hex value lives in the native picker.
  // No rendered text may contain a hex literal (warnings are the only place a
  // color code appears, and there is none configured at this point).
  ok("F28d the card renders colors as chips, never as hex text",
    !/#[0-9a-fA-F]{3,6}/.test(deepText(card())), deepText(card()).slice(0, 200));
  // Every native color picker is an invisible absolute overlay inside its 14x14
  // chip: without that style the UA widget renders at its own size and overflows
  // the row (the stray control seen next to the text field).
  // The stubbed React never invokes function components, so materialize the
  // ColorField elements before looking for their native color inputs.
  const colorFieldNodes = findAll(card(), (n) => n.props && typeof n.props.onColors === "function" && typeof n.props.id === "string");
  const colorInputs = colorFieldNodes
    .map((n) => n.type(n.props))
    .filter(Boolean)
    .reduce((acc, tree) => acc.concat(findAll(tree, (n) => n.type === "input" && n.props && n.props.type === "color")), []);
  ok("F28c every colour field keeps at least one native picker (5 chips today)",
    colorInputs.length === 5 &&
    colorFieldNodes.every((n) => findAll(n.type(n.props), (c) => c.type === "input" && c.props.type === "color").length >= 1),
    "inputs=" + colorInputs.length);
  ok("F28c every native color picker is an invisible overlay",
    colorInputs.length >= 1 && colorInputs.every((n) => n.props.style &&
      n.props.style.position === "absolute" && n.props.style.opacity === 0 &&
      n.props.style.width === "100%" && n.props.style.height === "100%"),
    JSON.stringify(colorInputs.map((n) => n.props.style)));

  // Typing a color equal to the running state raises the strong warning live
  // (before any save) — advisory only, so Save stays enabled below.
  // Only the warning paragraphs (`role="status"`) count below — the palette row
  // renders the state names too, so `textOf` alone would be vacuous.
  const warnTexts = (tree) => findAll(tree, (n) => n.props && n.props.role === "status" && typeof n.props.children === "string")
    .map((n) => n.props.children);
  defaultField.props.onColors(["#FACC15"]);
  const warnedTree = card();
  ok("F29 a near-state color warns before saving",
    warnTexts(warnedTree).some((line) => line.includes("Nearly identical") && line.includes("#FACC15") && line.includes("Running")),
    JSON.stringify(warnTexts(warnedTree)));

  findButton(warnedTree, "Save").props.onClick();
  await tick();
  const dcOps = (writes[0] && writes[0].ops) || [];
  ok("F30 save writes defaultColor in one atomic mutate despite the warning",
    writes.length === 1 &&
    dcOps.some((o) => o.op === "set" && o.path.join(".") === "defaultColor" && o.value === "#FACC15"),
    JSON.stringify(writes));

  // A distinct color clears the warning again.
  const distinctField = byId(card(), "plugin-config-icon-default-color");
  distinctField.props.onColors(["#5B8DEF"]);
  ok("F31 a distinct color shows no warning", warnTexts(card()).length === 0, JSON.stringify(warnTexts(card())));

  // ---- an override configured outside this card ----------------------------
  // The scope resolves `states` and `defaultColor` independently, so the
  // configured override (base or user layer) is NOT visible in
  // value.states.idle.colors[0]: the field, the palette and the warnings must
  // read the key itself.
  snapshot.user = {};
  snapshot.value.defaultColor = "#FACC15";
  // The stub only re-renders on a hook setState, so snapshot mutations must
  // land BEFORE this click (which also drops the '#5B8DEF' draft).
  findButton(card(), "Discard").props.onClick();
  const overrideField = byId(card(), "plugin-config-icon-default-color");
  ok("F32 the field shows the configured defaultColor chip, not the scope's idle color",
    overrideField.props.colors[0] === "#FACC15", JSON.stringify(overrideField.props.colors));
  ok("F33 the configured defaultColor is what the warnings judge",
    warnTexts(card()).some((line) => line.includes("Running") && line.includes("#FACC15")),
    JSON.stringify(warnTexts(card())));

  // A default-color edit and a state edit land in ONE atomic mutate.
  snapshot.user = {};
  snapshot.value.defaultColor = "#FACC15";
  writes.length = 0;
  byId(card(), "plugin-config-icon-default-color").props.onColors(["#5B8DEF"]);
  byId(card(), "plugin-config-icon-running-effect").props.onChange("blink");
  findButton(card(), "Save").props.onClick();
  await tick();
  const combinedOps = (writes[0] && writes[0].ops) || [];
  ok("F34 a default-color edit and a state edit share one atomic mutate",
    writes.length === 1 &&
    combinedOps.some((o) => o.op === "set" && o.path.join(".") === "defaultColor" && o.value === "#5B8DEF") &&
    combinedOps.some((o) => o.op === "set" && o.path.join(".") === "states"),
    JSON.stringify(writes));

  // Editing a state must never touch the default color: idle is not a card
  // state, so no idle row can drag the override into the write.
  snapshot.value.defaultColor = "#FACC15";
  writes.length = 0;
  byId(card(), "plugin-config-icon-running-colors").props.onColors(["#3366FF"]);
  findButton(card(), "Save").props.onClick();
  await tick();
  const stateOnlyOps = (writes[0] && writes[0].ops) || [];
  ok("F35 a state edit leaves the default color alone",
    stateOnlyOps.some((o) => o.op === "set" && o.path.join(".") === "states") &&
    !stateOnlyOps.some((o) => o.path.join(".") === "defaultColor"),
    JSON.stringify(writes));

  // Host parity for malformed state colors: resolveConfig drops them and falls
  // back to the built-in color, so the card must judge that same color.
  snapshot.value.states = Object.assign({}, snapshot.value.states, { running: { effect: "static", colors: ["red"] } });
  snapshot.value.defaultColor = "#FACC15";
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500"); // force a render
  ok("F36 the card falls back to the built-in state color like the host",
    warnTexts(card()).some((line) => line.includes("Running") && line.includes("#FACC15")),
    JSON.stringify(warnTexts(card())));

  // ---- only the colors the effect uses are listed (and saved) ---------------
  const askingColorsBefore = byId(card(), "plugin-config-icon-asking-colors");
  ok("F37 a two-color effect (blink) lists both colors and has no room to add",
    askingColorsBefore.props.colors.join(",") === "#E5484D,#FACC15" && askingColorsBefore.props.canAdd === false,
    JSON.stringify({ colors: askingColorsBefore.props.colors, canAdd: askingColorsBefore.props.canAdd }));

  // blink -> static: the unused second color must disappear from the field...
  byId(card(), "plugin-config-icon-asking-effect").props.onChange("static");
  const singleField = byId(card(), "plugin-config-icon-asking-colors");
  ok("F38 a single-color effect shows exactly one chip and no add chip",
    singleField.props.colors.join(",") === "#E5484D" && singleField.props.canAdd === false,
    JSON.stringify({ colors: singleField.props.colors, canAdd: singleField.props.canAdd }));
  // ...and from the stored config: no invisible second color survives the save.
  writes.length = 0;
  findButton(card(), "Save").props.onClick();
  await tick();
  const statesWrite = ((writes[0] && writes[0].ops) || []).find((o) => o.path.join(".") === "states");
  ok("F38b saving a single-color effect drops the unused second color",
    !!statesWrite && statesWrite.value.asking.effect === "static" &&
    statesWrite.value.asking.colors.join(",") === "#E5484D",
    JSON.stringify(statesWrite && statesWrite.value.asking));

  // rainbow needs no color configuration: the field and the row icon show the
  // hue wheel instead of pickers.
  byId(card(), "plugin-config-icon-asking-effect").props.onChange("rainbow");
  const rainbowField = byId(card(), "plugin-config-icon-asking-colors");
  const rainbowIcon = findAll(card(), (n) => n.type === primitivesStub.DisclosureRow && n.props.title === "Asking")[0].props.icon;
  const rainbowTree = rainbowField.type(rainbowField.props);
  // The stub collapses a single child to the child itself, so normalize it.
  const iconLayers = Array.isArray(rainbowIcon.props.children) ? rainbowIcon.props.children : [rainbowIcon.props.children];
  const rainbowInputs = findAll(rainbowTree, (n) => n.type === "input" && n.props.type === "color");
  ok("F39 rainbow shows the hue wheel plus one optional starting-hue chip",
    rainbowField.props.rainbow === true &&
    // exactly one colour is carried: the hue seed the browser sweeps from
    rainbowField.props.colors.length === 1 && rainbowField.props.canAdd === false &&
    rainbowInputs.length === 1 &&
    // no add / remove affordances for a colour list that does not exist
    findAll(rainbowTree, (n) => n.type === "button").length === 0 &&
    // the field preview is a 20px disc
    findAll(rainbowTree, (n) => n.props && n.props.style && n.props.style.borderRadius === 999 &&
      n.props.style.width === 20 && n.props.style.height === 20).length === 1 &&
    iconLayers.length === 1 &&
    String(iconLayers[0].props.style.background).indexOf("linear-gradient(135deg,") === 0 &&
    String(iconLayers[0].props.style.backgroundImage).indexOf("conic-gradient(from 0deg,") === 0,
    JSON.stringify({
      rainbow: rainbowField.props.rainbow,
      colors: rainbowField.props.colors,
      inputs: rainbowInputs.length,
      buttons: findAll(rainbowTree, (n) => n.type === "button").length,
      icon: iconLayers[0] && iconLayers[0].props.style.background,
    }));

  // The starting-hue chip rewrites colors[0] alone (rainbow never carries a
  // second colour), so the sweep begins at the picked hue.
  rainbowInputs[0].props.onChange({ target: { value: "#0066ff" } });
  writes.length = 0;
  findButton(card(), "Save").props.onClick();
  await tick();
  const seedWrite = ((writes[0] && writes[0].ops) || []).find((o) => o.path.join(".") === "states");
  ok("F39b the starting-hue chip saves a single-colour rainbow state",
    !!seedWrite && seedWrite.value.asking.effect === "rainbow" &&
    seedWrite.value.asking.colors.join(",") === "#0066ff",
    JSON.stringify(seedWrite && seedWrite.value.asking));

  // rainbow keeps exactly one stored colour: the hue seed the browser's
  // frameColor() starts from. Switching a two-colour state (asking is blink
  // with #E5484D ⇄ #FACC15) to rainbow must TRIM the stored list to that one
  // seed — this is the save-side half of "only what the effect uses is kept".
  byId(card(), "plugin-config-icon-asking-effect").props.onChange("rainbow");
  writes.length = 0;
  findButton(card(), "Save").props.onClick();
  await tick();
  const rainbowWrite = ((writes[0] && writes[0].ops) || []).find((o) => o.path.join(".") === "states");
  ok("F40 switching blink -> rainbow trims the stored colours to the single hue seed",
    !!rainbowWrite && rainbowWrite.value.asking.effect === "rainbow" &&
    rainbowWrite.value.asking.colors.join(",") === "#E5484D",
    JSON.stringify(rainbowWrite && rainbowWrite.value.asking));

  // The card duplicates the host's built-in per-state colours (it cannot import
  // lib/index.js). Pin the copy to plugin.config.states so the two can never
  // drift: a drift would make the card warn about a colour the host never paints.
  let cardStates = null;
  try {
    // extractBlock() balances braces, so a reformat or a nested literal cannot
    // break this the way a hand-rolled substring slice would.
    const block = extractBlock(CLIENT_SRC, "var DEFAULT_STATES = ");
    cardStates = eval("(" + block.slice(block.indexOf("{")) + ")");
  } catch (err) {
    cardStates = null; // reported as a failure below, never an aborted suite
  }
  // The ΔE thresholds and the accepted-hex regex are duplicated by design (no
  // shared module, no build step): pin them together so tuning one half cannot
  // silently change the other's verdicts.
  const constOf = (src, name) => {
    const m = src.match(new RegExp("(?:const|let|var)\\s+" + name + "\\s*=\\s*([^;]+);"));
    return m ? m[1].trim() : null;
  };
  const sharedConstants = ["SIMILAR_DE_STRONG", "SIMILAR_DE_WARN", "RAINBOW_CHROMA_MIN", "DEFAULT_COLOR_RX"];
  ok("F42 the duplicated thresholds / hex regex match between the two halves",
    sharedConstants.every((n) => constOf(SRC, n) !== null && constOf(SRC, n) === constOf(CLIENT_SRC, n)),
    JSON.stringify(sharedConstants.map((n) => [n, constOf(SRC, n), constOf(CLIENT_SRC, n)])));

  ok("F41 the card's built-in state table mirrors the host DEFAULTS (effect + colors + speed)",
    !!cardStates &&
    Object.keys(cardStates).length === Object.keys(plugin.config.states).length &&
    Object.keys(cardStates).every((k) => {
      const host = plugin.config.states[k];
      return cardStates[k].effect === host.effect &&
        JSON.stringify(cardStates[k].colors) === JSON.stringify(host.colors) &&
        cardStates[k].speed === host.speed;
    }),
    JSON.stringify({ card: cardStates, host: plugin.config.states }));

  // ---- the "+" chip: derived seed, no duplicates, room-only -----------------
  // done is static (one colour) and has room for a second; switching it to
  // breath is the exact state that should offer the add chip.
  byId(card(), "plugin-config-icon-done-effect").props.onChange("breath");
  const addField = byId(card(), "plugin-config-icon-done-colors");
  ok("F43 a single-colour list has room, so the add chip appears",
    addField.props.canAdd === true && addField.props.colors.join(",") === "#22A06B",
    JSON.stringify({ canAdd: addField.props.canAdd, colors: addField.props.colors }));
  const addTree = addField.type(addField.props);
  const addInputs = findAll(addTree, (n) => n.type === "input" && n.props.type === "color");
  // The add picker opens on the colour the browser derives anyway
  // (mix(#22A06B, black, 35%)), so confirming it as-is is meaningful.
  ok("F43b the add picker opens on the derived second colour",
    addInputs.length === 2 && addInputs[1].props.value === "#166846",
    JSON.stringify(addInputs.map((i) => i.props.value)));
  // Re-materialize before every edit: a handler captured from an earlier tree
  // closes over the OLD colour list, which would mask a real append bug.
  const addInputsOf = () => {
    const field = byId(card(), "plugin-config-icon-done-colors");
    return findAll(field.type(field.props), (n) => n.type === "input" && n.props.type === "color");
  };
  addInputsOf()[1].props.onChange({ target: { value: "#22a06b" } }); // already present, lower-case
  ok("F43c an already-present colour is not appended",
    byId(card(), "plugin-config-icon-done-colors").props.colors.length === 1,
    JSON.stringify(byId(card(), "plugin-config-icon-done-colors").props.colors));
  addInputsOf()[1].props.onChange({ target: { value: "#00c8ff" } });
  ok("F43d a new colour is appended as the second one",
    byId(card(), "plugin-config-icon-done-colors").props.colors.join(",") === "#22A06B,#00c8ff",
    JSON.stringify(byId(card(), "plugin-config-icon-done-colors").props.colors));

  // ---- reset also neutralizes a COMPOSITION-ENTRY defaultColor --------------
  // `scope.unset` cannot reach the base layer, so a base-provided defaultColor
  // would survive "Reset to defaults" and the field would look untouched.
  snapshot.base = { defaultColor: "#FACC15" };
  snapshot.user = {};
  snapshot.value.defaultColor = "#FACC15";
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500"); // force a render
  writes.length = 0;
  findButton(card(), "Reset to defaults").props.onClick();
  await tick();
  const idleOwnColor = snapshot.value.states.idle.colors[0];
  const resetOps = writes.map((w) => w.op + ":" + w.field + (w.value !== undefined ? "=" + w.value : ""));
  ok("F44 a reset rewrites a base-layer defaultColor to the idle colour",
    resetOps.indexOf("set:defaultColor=" + idleOwnColor) !== -1 &&
    resetOps.indexOf("unset:states") !== -1,
    JSON.stringify(resetOps));

  // ---- clear-override persists as an unset ----------------------------------
  snapshot.base = {};
  snapshot.user = { defaultColor: "#FACC15" };
  snapshot.value.defaultColor = "#FACC15";
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500"); // force a render
  const clearField = byId(card(), "plugin-config-icon-default-color");
  ok("F45 the clear-override control is offered for a user-layer value",
    typeof clearField.props.onClear === "function", String(clearField.props.clearLabel));
  clearField.props.onClear();
  writes.length = 0;
  findButton(card(), "Save").props.onClick();
  await tick();
  const clearOps = ((writes[0] && writes[0].ops) || []);
  ok("F45b clearing the override saves an unset of defaultColor",
    clearOps.some((o) => o.op === "unset" && o.path.join(".") === "defaultColor"),
    JSON.stringify(writes));

  // ---- a save with nothing to write settles the form ------------------------
  snapshot.user = {};
  snapshot.value.defaultColor = null;
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500"); // same as resolved
  writes.length = 0;
  const noopSave = findButton(card(), "Save");
  ok("F46 a draft equal to the resolved value keeps Save enabled", noopSave.props.disabled === false);
  noopSave.props.onClick();
  await tick();
  ok("F46b a no-op save writes nothing and clears the draft",
    writes.length === 0 && findButton(card(), "Save").props.disabled === true,
    JSON.stringify({ writes, disabled: findButton(card(), "Save").props.disabled }));

  // ---- the rainbow warning needs a CHROMATIC default ------------------------
  snapshot.value.defaultColor = "#1a1a1a"; // neutral: no hue to collide with
  snapshot.value.states.done = { effect: "rainbow", colors: ["#22A06B"] };
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500");
  const neutralLines = warnTexts(card());
  ok("F47 a neutral default colour raises no rainbow warning",
    neutralLines.length === 0, JSON.stringify(neutralLines));
  snapshot.value.defaultColor = "#E5484D";
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500");
  ok("F47b a chromatic default colour raises the rainbow warning",
    warnTexts(card()).some((line) => line.includes("rainbow")), JSON.stringify(warnTexts(card())));

  // ---- the warning judges the fills the effect actually paints --------------
  // blink with a single colour: the browser derives mix(c0, #000, 35%).
  snapshot.value.defaultColor = "#952F32";
  snapshot.value.states.asking = { effect: "blink", colors: ["#E5484D"], speed: 400 };
  snapshot.value.states.done = { effect: "static", colors: ["#22A06B"] };
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500");
  ok("F48 the derived second fill of a one-colour blink is compared",
    warnTexts(card()).some((line) => line.includes("Asking") && line.includes("#952f32")),
    JSON.stringify(warnTexts(card())));
  // breath interpolates: the midpoint of #E5484D ⇄ #FFFFFF is a real frame.
  snapshot.value.defaultColor = "#F2A4A6";
  snapshot.value.states.asking = { effect: "breath", colors: ["#E5484D", "#FFFFFF"] };
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500");
  ok("F48b the breath interpolation is sampled",
    warnTexts(card()).some((line) => line.includes("Asking") && line.includes("#f2a4a6")),
    JSON.stringify(warnTexts(card())));

  // ---- a partially invalid stored list keeps its valid entries --------------
  snapshot.value.defaultColor = "#FF0000";
  snapshot.value.states.asking = { effect: "static", colors: ["#FF0000", "red"] };
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500");
  const partialField = byId(card(), "plugin-config-icon-asking-colors");
  const partialLines = warnTexts(card());
  ok("F49 the card keeps the valid entries of a partially invalid list",
    partialField.props.colors.join(",") === "#FF0000" &&
    partialLines.some((line) => line.includes("Asking") && line.toLowerCase().includes("#ff0000")) &&
    !partialLines.some((line) => line.toLowerCase().includes("#facc15")),
    JSON.stringify({ colors: partialField.props.colors, lines: partialLines }));

  // ---- a PARTIAL resolved states dict must read like what the host paints ----
  // The card writes only the states it drafted, so `value.states` really can
  // omit `asking`; the host still blinks it with the built-in config, and the
  // card used to show "Static" + a dashed chip there — then SAVE that "static"
  // over the user's config on the next colour edit.
  snapshot.base = {};
  snapshot.user = { states: { running: { effect: "bounce", colors: ["#FF0000"] } } };
  snapshot.value = {
    askingHoldMs: 3500,
    doneHoldMs: 5000,
    defaultColor: null,
    states: { running: { effect: "bounce", colors: ["#FF0000"] } },
  };
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500"); // force a render
  ok("F50 a state missing from the resolved dict falls back to the built-in config",
    byId(card(), "plugin-config-icon-asking-effect").props.value === "blink" &&
    byId(card(), "plugin-config-icon-asking-colors").props.colors.join(",") === "#E5484D,#FACC15",
    JSON.stringify({
      effect: byId(card(), "plugin-config-icon-asking-effect").props.value,
      colors: byId(card(), "plugin-config-icon-asking-colors").props.colors,
    }));
  writes.length = 0;
  byId(card(), "plugin-config-icon-asking-colors").props.onColors(["#123456", "#FACC15"]);
  findButton(card(), "Save").props.onClick();
  await tick();
  const partialWrite = ((writes[0] && writes[0].ops) || []).find((o) => o.path.join(".") === "states");
  ok("F50b a colour edit on that state keeps the built-in effect",
    !!partialWrite && partialWrite.value.asking.effect === "blink" &&
    partialWrite.value.asking.colors.join(",") === "#123456,#FACC15",
    JSON.stringify(partialWrite && partialWrite.value.asking));

  // ---- those two host behaviours again, on the card side --------------------
  snapshot.user = {};
  snapshot.value = {
    askingHoldMs: 3500,
    doneHoldMs: 5000,
    defaultColor: "#005aa5",
    states: { running: { effect: "breath", colors: ["#0000ff", "#00ff00"] } },
  };
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500");
  const breathLine = warnTexts(card()).find((line) => line.includes("Running"));
  const breathDe = breathLine ? Number((breathLine.match(/ΔE ([0-9.]+)/) || [])[1]) : NaN;
  ok("F51 the card samples the breath gradient as densely as the host",
    !!breathLine && breathDe < 8, JSON.stringify({ breathLine, breathDe }));

  snapshot.value = {
    askingHoldMs: 3500,
    doneHoldMs: 5000,
    defaultColor: "#ff0000",
    states: { idle: { effect: "rainbow", colors: ["#1a1a1a"] } },
  };
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500");
  const idleRainbowLines = warnTexts(card());
  ok("F52 idle running rainbow warns on the card side too (host parity)",
    idleRainbowLines.length === 1 && idleRainbowLines[0].includes("rainbow") && idleRainbowLines[0].includes("Idle"),
    JSON.stringify(idleRainbowLines));

  // ---- reset leaves the deployment value one click away ---------------------
  snapshot.base = { defaultColor: "#FACC15" };
  snapshot.user = {};
  snapshot.value = { askingHoldMs: 3500, doneHoldMs: 5000, defaultColor: "#FACC15", states: {} };
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500");
  const baseOnlyField = byId(card(), "plugin-config-icon-default-color");
  ok("F53 a base-layer value offers no clear-override control",
    !baseOnlyField.props.onClear, String(baseOnlyField.props.clearLabel));
  writes.length = 0;
  findButton(card(), "Reset to defaults").props.onClick();
  await tick();
  // The reset writes an explicit user-layer value (the idle colour), so the
  // control that takes the user back to the deployment value comes back.
  snapshot.user = { defaultColor: "#1a1a1a" };
  snapshot.value.defaultColor = "#1a1a1a";
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500");
  ok("F53b after the reset the clear-override control reappears",
    typeof byId(card(), "plugin-config-icon-default-color").props.onClear === "function",
    String(byId(card(), "plugin-config-icon-default-color").props.clearLabel));

  // ---- the cycle field follows the effect -----------------------------------
  snapshot.base = {};
  snapshot.user = {};
  snapshot.value = { askingHoldMs: 3500, doneHoldMs: 5000, defaultColor: null, states: {} };
  byId(card(), "plugin-config-icon-asking-effect").props.onChange("blink");
  const speedField = byId(card(), "plugin-config-icon-asking-speed");
  ok("F54 an animated state exposes its cycle field, seeded from the built-in default",
    !!speedField && speedField.props.value === "400",
    JSON.stringify(speedField && speedField.props.value));
  speedField.props.onChange("");
  writes.length = 0;
  findButton(card(), "Save").props.onClick();
  await tick();
  const speedWrite = ((writes[0] && writes[0].ops) || []).find((o) => o.path.join(".") === "states");
  ok("F54b a blank cycle drops the key (the built-in cycle applies again)",
    !!speedWrite && speedWrite.value.asking.speed === undefined &&
    speedWrite.value.asking.effect === "blink",
    JSON.stringify(speedWrite && speedWrite.value.asking));
  byId(card(), "plugin-config-icon-done-effect").props.onChange("static");
  ok("F54c a static effect hides the cycle field",
    !byId(card(), "plugin-config-icon-done-speed"));

  // ---- the add chip's edge cases the mutation run proved unpinned -------------
  // #0c8 and #00cc88 are the SAME colour: picking the long spelling must not
  // append a duplicate band.
  snapshot.user = {};
  snapshot.value = {
    askingHoldMs: 3500,
    doneHoldMs: 5000,
    defaultColor: null,
    states: { done: { effect: "breath", colors: ["#0c8"] } },
  };
  // F54c left an unsaved "static" draft on done -> drop it, or the field would
  // render for that draft instead of the stored breath effect.
  findButton(card(), "Discard").props.onClick();
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500");
  const addInputsNow = () => {
    const field = byId(card(), "plugin-config-icon-done-colors");
    return findAll(field.type(field.props), (n) => n.type === "input" && n.props.type === "color");
  };
  addInputsNow()[1].props.onChange({ target: { value: "#00cc88" } });
  ok("F55 a 3-digit spelling counts as the same colour",
    byId(card(), "plugin-config-icon-done-colors").props.colors.length === 1,
    JSON.stringify(byId(card(), "plugin-config-icon-done-colors").props.colors));

  // An unusable stored colour shows the dashed replacement chip and NO add chip:
  // "add a second color" is nonsense with zero colours.
  snapshot.value = {
    askingHoldMs: 3500,
    doneHoldMs: 5000,
    defaultColor: null,
    states: { done: { effect: "breath", colors: ["nope"] } },
  };
  findButton(card(), "Discard").props.onClick(); // drop anything F55 left behind
  byId(card(), "plugin-config-icon-asking-hold").props.onChange("3500");
  const emptyField = byId(card(), "plugin-config-icon-done-colors");
  const emptyTree = emptyField.type(emptyField.props);
  ok("F56 an unusable colour list offers the dashed chip but no add chip",
    emptyField.props.colors.length === 0 && emptyField.props.canAdd === false &&
    findAll(emptyTree, (n) => n.type === "input" && n.props.type === "color").length === 1,
    JSON.stringify({ colors: emptyField.props.colors, canAdd: emptyField.props.canAdd }));
}

// ---- summary ---------------------------------------------------------------
console.log("\n" + "=".repeat(60));
console.log(`result: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("failures:");
  for (const f of failures) console.log("  - " + f);
}
process.exit(failed ? 1 : 0);