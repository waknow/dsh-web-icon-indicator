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
 *     settings sync, poll-failure restore, and legacy-host compatibility.
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
  const ctx = {
    get: (k) => (k === "config" ? {} : undefined),
    webServer: {
      register: (r) => routes.push(r),
      tapIndex: (fn) => taps.push(fn),
    },
    timer: {
      timeout: (cb, ms) => {
        const t = { cb, ms, fired: false, ran: false };
        t.cb = () => {
          t.ran = true; // executed (vs cancelled via the disposer -> fired)
          return cb();
        };
        timers.push(t);
        return () => {
          t.fired = true;
        };
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
  eq("H1b inject list", plugin.inject, ["webServer", "timer", "agents", "fs", "sandboxPolicy"]);
  ok("H1c config defaults present",
    plugin.config.askingHoldMs === 3500 && plugin.config.doneHoldMs === 5000 &&
    plugin.config.states?.running?.colors?.[0] === "#FACC15",
    JSON.stringify(plugin.config));
  ok("H1d SETTINGS_NAMESPACE", plugin.SETTINGS_NAMESPACE === "web-icon-indicator");
  ok("H1e CONFIG_SCHEMA defined", !!plugin.CONFIG_SCHEMA);

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
  h.setAgents([
    {
      id: "A",
      status: "running",
      session: { events: [{ type: "approval/asked", data: { id: "p1" } }] },
    },
    { id: "B", status: "running" },
  ]);
  agg = aggregate();
  eq("H5 approval-asked + running -> asking active 2",
    { state: agg.state, active: agg.active }, { state: "asking", active: 2 });

  // H6 approval/decided clears the pin
  h.setAgents([
    {
      id: "A",
      status: "running",
      session: {
        events: [
          { type: "approval/asked", data: { id: "p1" } },
          { type: "approval/decided", data: { id: "p1" } },
        ],
      },
    },
    { id: "B", status: "running" },
  ]);
  agg = aggregate();
  eq("H6 approval decided -> running active 2",
    { state: agg.state, active: agg.active }, { state: "running", active: 2 });

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
  constructor({ initialHref = "http://orig.example/favicon.ico", states = DEFAULT_STATES } = {}) {
    this.link = makeFakeLink(initialHref);
    this.rafQueue = [];
    this.pollFn = null;
    this.queue = [];
    const ctrl = this;
    const context = vm.createContext({
      window: { __DSH_WEB_ICON_INDICATOR__: false, addEventListener() {} },
      document: {
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
      fetch: (url) =>
        new Promise((resolve, reject) => {
          ctrl.queue.push({ url: String(url), resolve, reject });
        }),
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

  // B10 poll failure restores the original icon
  const f = new BrowserDriver({ initialHref: "http://orig.example/favicon.ico" });
  await f.ready({ state: "running", active: 1, states: DEFAULT_STATES }); // paint something else
  ok("B10a icon changed before failure", f.href.includes("data:image/svg+xml"));
  await f.pollFail();
  ok("B10b original icon restored after failure", f.href === "http://orig.example/favicon.ico", f.href);

  // B11 old-host payload (no states) leaves CFG untouched
  const g = new BrowserDriver();
  await g.ready({ state: "running", active: 2, states: DEFAULT_STATES });
  ok("B11a number before legacy payload", g.href.includes(">2<"));
  await g.poll({ state: "running", active: 2 }); // no states -> older host
  ok("B11b old-host poll keeps frames", g.href.includes(">2<"));
}

// ============================================================================
// PART 3 — bigNumUri unit checks (extracted from the template)
// ============================================================================
console.log("\n=== Part 3: bigNumUri rendering ===");
{
  const bigNumSrc = extractBlock(TEMPLATE, "function bigNumUri(fill) {");
  function hexToRgbStub(h) {
    h = String(h).replace("#", "");
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const makeBigNum = (ACTIVE) =>
    new Function(
      "ACTIVE", "BIG_NUM_RX", "hexToRgb", "encodeURIComponent",
      bigNumSrc + "\nreturn bigNumUri;"
    )(ACTIVE, 11, hexToRgbStub, (s) => s);

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
  const html = readFileSync(new URL("../demo/badge.html", import.meta.url), "utf8");
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

// ---- summary ---------------------------------------------------------------
console.log("\n" + "=".repeat(60));
console.log(`result: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("failures:");
  for (const f of failures) console.log("  - " + f);
}
process.exit(failed ? 1 : 0);