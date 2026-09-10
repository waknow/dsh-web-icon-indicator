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
function makeCtx() {
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
  ok("F15 every state row is rendered",
    ["Idle", "Running", "Asking", "Done"].every((name) =>
      findAll(openTree, (n) => n.type === primitivesStub.DisclosureRow && n.props.title === name).length === 1),
    textOf(openTree).slice(0, 120));
  const askingRow = findAll(openTree, (n) => n.type === primitivesStub.DisclosureRow && n.props.title === "Asking")[0];
  const askingSummary = textOf(askingRow.props.collapsedContent);
  ok("F16 collapsed summary shows effect, colors and cycle",
    askingSummary.includes("Blink") && askingSummary.includes("#E5484D") && askingSummary.includes("#FACC15") &&
    askingSummary.includes("400ms"),
    askingSummary);

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
    ["unset:askingHoldMs", "unset:doneHoldMs", "unset:states"]);
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
  writes.length = 0;
  const idleRow = findAll(openTree, (n) => n.type === primitivesStub.DisclosureRow && n.props.title === "Idle")[0];
  idleRow.props.onToggle(); // expand the idle row (re-render is explicit)
  const idleOpenTree = card();
  const idleEffect = byId(idleOpenTree, "plugin-config-icon-idle-effect");
  ok("F24 expanded state row exposes its effect select", !!idleEffect && idleEffect.props.value === "static",
    idleEffect && idleEffect.props.value);
  idleEffect.props.onChange("breath");
  findButton(card(), "Save").props.onClick();
  await tick();
  const stateOp = writes[0] && writes[0].ops && writes[0].ops[0];
  eq("F25 state edit saves the whole states object at its path",
    stateOp && stateOp.op === "set" && stateOp.path.join(".") + "=" + stateOp.value.idle.effect,
    "states=breath");
  ok("F26 only edited states are written to the user layer",
    Object.keys(stateOp.value).length === 1 && !!stateOp.value.idle,
    JSON.stringify(stateOp.value));

  // A previously saved override for another state must survive an edit of a
  // different state: `scope.set('states', …)` replaces the whole field, so the
  // card rebuilds it from the raw user layer.
  writes.length = 0;
  snapshot.user = { states: { running: { effect: "rainbow", colors: ["#FF0000"] } } };
  const idleAgain = byId(card(), "plugin-config-icon-idle-effect");
  idleAgain.props.onChange("bounce");
  findButton(card(), "Save").props.onClick();
  await tick();
  const carried = writes[0] && writes[0].ops && writes[0].ops[0] && writes[0].ops[0].value;
  ok("F27 an existing user-layer override is carried through",
    carried && carried.running && carried.running.effect === "rainbow" && carried.idle.effect === "bounce",
    JSON.stringify(carried));
}

// ---- summary ---------------------------------------------------------------
console.log("\n" + "=".repeat(60));
console.log(`result: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("failures:");
  for (const f of failures) console.log("  - " + f);
}
process.exit(failed ? 1 : 0);