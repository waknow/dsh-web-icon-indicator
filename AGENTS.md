# AGENTS.md

Agent operating instructions for `dsh-web-icon-indicator` — a DSH (DeepSeek Harness) bundle plugin that mirrors the current session state onto the browser tab favicon (`idle` / `running` / `asking` / `done`).

## Common commands

**There is no build step and no linter.** Do not invent or run them. Automated checks: `npm test` (= `node test/verify.js`, see *Testing*).

```bash
# Manual verification loop (the only way to validate changes):
dsh plugin --profile web add <this-repo-path>            # install into web profile
curl http://localhost:3080/dsh-web-icon-status.json      # aggregated state JSON: {"state","since","active","states"}
```

## Upstream DSH source

The DSH platform this plugin runs on lives at **https://github.com/deepseek-ai/deepseek-harness** — consult it when the *installed* packages lack context: what ships in `node_modules` is built/minified (browser bundles, compiled `.js`), while the repo carries the readable `src/*` TypeScript sources (e.g. `packages/client/…`, `packages/settings/…`). Note the installed `@deepseek-ai/*` versions may lag or lead the repo's `main`; when behavior differs, match the installed version tag first.

## Project structure

| Path | Role | Notes |
| --- | --- | --- |
| `lib/index.js` | **The entire host implementation**: Cordis plugin + per-agent state machine + HTTP routes + injected browser script + schemastery `CONFIG_SCHEMA` / `SETTINGS_NAMESPACE` registered into the host `settings` service | The file you will normally edit for host behavior |
| `lib/client.js` | **Browser half** (hand-written `window.__ModuleLoader__.load` bundle, no build step): registers the settings card into `settings.plugin.item` keyed by `web-icon-indicator` | Edit when changing the settings-page card (fields, labels, save/reset) |
| `lib/types/index.d.ts` | Public config & aggregate types | Keep in sync with the config surface + `CONFIG_SCHEMA` in `lib/index.js` |
| `lib/types/client/index.d.ts` | Browser-half types (`inject` / `apply`) | Keep in sync with `lib/client.js` |
| `icons/base.svg` | The single whale template with a `__COLOR__` placeholder; recolored/animated in the browser | The filename is locked by a route regex — treat as immutable |
| `cordis.patch.yml` | Install patch that inserts the plugin row into the profile composition | Referenced by `package.json` → `dsh.bundle.patch` |
| `README.md` / `README.zh.md` | User docs (EN / zh) | Update both on any behavior/config/icon change |
| `package.json` | Metadata, `exports` (incl. `./client`), `dsh.client` declaration, `peerDependencies` (`@deepseek-ai/schemastery`), `files` allowlist, `scripts` (`release*` → `commit-and-tag-version`), `devDependencies` (`commit-and-tag-version`) | Release scripts — see *Release* |
| `.github/workflows/publish.yml` | CI: publishes to npm on `v*` tags via **OIDC trusted publishing** (no token secret; `npm ci` + optional test/build, then `npm publish`) | Keeps the release flow hands-off — see *Release* |

## Code style & conventions

- ESM only (`"type": "module"`); the only runtime dependency is `@deepseek-ai/schemastery` (config schema), declared as a `peerDependency` per the awesome-dsh-plugin contributing guide — keep it that way. The host provides the `settings` service (and `@deepseek-ai/dsh-settings` is NOT imported by either half anymore — the plugin attaches its section through `ctx.inject(["settings"], …)`).
- Plugin contract: default export `{ name, inject, config, apply(ctx, config), SETTINGS_NAMESPACE, CONFIG_SCHEMA }`; `inject` = `webServer, timer, agents, fs, sandboxPolicy`. Cordis passes the resolved composition config as the second argument to `apply`.
- All session state lives in module-scope Maps/Sets keyed by agent id: `states`, `asking`, `askDone`, `askTimers`, `lastSeen` (see `lib/index.js`).
- The browser script is the `INJECTED_SCRIPT` template string, injected via `webServer.tapIndex`; config flows in through placeholder tokens (`__STATUS_PATH__`, `__BASE_PATH__`, `__CFG__`), each paired with a `.replace()` call in `apply()` (rebuilt by the settings `onChange` hook — the injected script is a `let`, so the next page load picks up settings edits). `__CFG__` carries the `{ states }` object as JSON, where each state is `{ effect, colors[], speed? }`.
- The config surface is registered with the DSH settings service (`web-icon-indicator` namespace). `CONFIG_SCHEMA` defaults must mirror `DEFAULTS`; `ctx.inject(["settings"], (settingsCtx) => settingsCtx.settings.installSection(ctx, SETTINGS_NAMESPACE, CONFIG_SCHEMA, entry, { setSource, onChange }))` in `apply()` wires the composition entry as `base` and `source()` as the live config (the callback never fires when no settings provider is composed, so the plugin keeps working on its composition entry + DEFAULTS).
- `lib/client.js` is a hand-written ModuleLoader factory bundle (no bundler): it `require("react")` and `require("@deepseek-ai/dsh-client-ui-primitives")` (both shell-provided statics, so they always resolve) and exposes `{ apply, inject }` with `inject = ["slots", "settingsScope", "locale"]`. Keep it that way — never add imports that aren't guaranteed registered factories or seed words.
- UI display parts in `lib/client.js` should prefer components from `@deepseek-ai/dsh-client-ui-primitives` (Button, Input, Icon* icons, …) over hand-rolled equivalents — that is the official standard (the shell's own plugin cards use them). Hand-roll only where primitives has no counterpart: a passive status badge (`Pill` is an interactive chip), a `<select>` (no primitives Select), or layout wrappers. Inline styles may use the shell's `--dsw-alias-*` design tokens.
- Keep changes small and localized to `lib/index.js` / `lib/client.js`; prefer editing over restructuring.
- Commit style: `init:` / `feat:` / `fix:` / `docs:` (see git log).

## Settings card contract (cookbook)

Canonical reference: the DSH cookbook "adding a settings card"
(<https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-settings-card>).
The rules below pin its requirements to this repo; follow them on any settings-card change.

- **Namespace is the join key.** `web-icon-indicator` appears identically in
  `lib/index.js` (`SETTINGS_NAMESPACE`), `lib/client.js` (`NS`), and the slot
  registration's `key` — change all three together.
- **Host half registers the namespace** into the host `settings` service via
  `ctx.inject(["settings"], (settingsCtx) =>
  settingsCtx.settings.installSection(ctx, SETTINGS_NAMESPACE, CONFIG_SCHEMA,
  entry, { setSource, onChange }))` in `apply()` (layers the composition entry as
  `base` under the user document; the callback never fires when no settings
  provider is mounted, so the plugin keeps working on its composition entry).
  Keep the schema in `CONFIG_SCHEMA`; if a future field needs it,
  `role("secret")` keeps a value off every response and `applies: "restart"`
  marks a change as next-start-only.
- **The card owns everything inside it** — chrome, controls, copy. The
  bundle-purity gate rejects value imports across plugins, so `PluginCard`,
  `CardForm`, `ValueField`, … from `@deepseek-ai/dsh-client-ui-settings-plugins`
  are off limits: `lib/client.js` keeps its own staging (the `drafts` map) and
  its own revision-fenced writes.
- **Read/write through `ctx.settingsScope`.** The snapshot carries resolved
  `value`, composition `base`, and raw `user`; a field counts as overridden by
  key **presence** in `user`, never by a value comparison. `scope.set(field, value)`
  stores one field; `scope.unset(field)` clears it back to the composition layer.
- **Slot registration shape** (in `apply()`): `ctx.slots.register({ name:
  "settings.plugin.item", key: NS, locale: LOCALE, inject: () => ({ scope, t }) },
  IconConfigCard)`. The tab dispatches one slot key per served namespace, so a
  card renders only while the Host serves its namespace.
- **Loader dependency**: `package.json` → `dsh.client.inject` must include
  `@deepseek-ai/dsh-client-ui-settings-plugins` (the package dispatching the
  `settings.plugin.item` slot) — already present; keep it.
- **Bundle format**: `lib/client.js` stays the loader's lazy-CJS factory
  artifact (hand-written `window.__ModuleLoader__.load({ id, factory })`, no
  build step) with `dsh.client` and the `./client` export declared.

## Workflows

### Change the icon, a color, an effect, or a timing
1. Icon geometry: edit `icons/base.svg` (keep the `__COLOR__` placeholder in `#p { fill: … }`). Colors/effects/timings: edit `DEFAULTS` in `lib/index.js` — `states.<state>` entries (`effect` / `colors[]` / `speed`), plus `askingHoldMs` / `doneHoldMs` — and keep the corresponding `CONFIG_SCHEMA` defaults in sync (settings validation + the settings-page card read from it).
2. No server restart needed for the icon: `base.svg` is re-read per request and the browser re-fetches it with cache-busting (`?t=Date.now()`). Color/effect/timing changes **saved through the settings card** reach the running tab via the status poll within ~1 s (no reload); changing the code-level `DEFAULTS` in `lib/index.js` still requires re-injecting the script (reload the tab) or a DSH web rebuild.
3. If defaults/keys changed: update the config tables in **both** READMEs, `lib/types/index.d.ts`, and — when the card exposes the key — the field in `lib/client.js`.

### Change the settings card (fields, labels, save/reset)
0. Stay inside the [Settings card contract](#settings-card-contract-cookbook): the `web-icon-indicator` join key, the `settings.plugin.item` registration shape, the purity gate (no value imports of chrome/form model), and write-through-`ctx.settingsScope` staging.
1. Edit `lib/client.js`: the `IconConfigCard` component + the `en`/`zh` dictionaries. The card reads the scope snapshot (`status/writable/value/base/user`) and writes via `scope.set(field, value)` / `scope.unset(field)`.
2. No build step: the file is served as-is at `/plugins/dsh-web-icon-indicator/client.js`. A NEW `dsh.client` declaration (or a first-time `lib/client.js`) is only scanned at profile start; content changes to an existing bundle are re-hashed by HMR.
3. Verify with the SSR smoke test pattern (mock `window.__ModuleLoader__`, run the factory with stubbed `require("react")` and `require("@deepseek-ai/dsh-client-ui-primitives")`, render the card via `react-dom/server`).

### Add a new state (e.g. `error`)
1. Add a `states.<newstate>` default (`effect` / `colors[]` / `speed`) in `DEFAULTS` in `lib/index.js`. No new SVG is needed — every state renders from `base.svg`.
2. Add branches in the state machine, the aggregate `order` array, and the browser `apply()`/`frameAt()` functions.
3. Extend the `DshWebIconIndicatorAggregate.state` union in `lib/types/index.d.ts`.
4. Update the state tables in **both** READMEs (and the card's `STATE_NAMES` in `lib/client.js` if the card should edit it).

### Release
1. `npm run release:patch` (or `release:minor` / `release:major`) — runs
   `commit-and-tag-version` (`.versionrc.json`): bumps `version` in
   `package.json` **and** `package-lock.json`, prepends the generated section
   to `CHANGELOG.md` (from conventional commit messages; `feat`→Added,
   `fix`→Fixed, docs/refactor/ci/perf→Changed, `revert`→Removed, `chore`
   hidden), commits, and tags `v<version>`. Review the diff — the tool is not
   deterministic-proof (e.g. it glosses over `#`-prefixed sections), so eyeball
   the new CHANGELOG heading and the spacing around it before pushing.
2. `git push && git push --tags`.
3. GitHub Actions (`.github/workflows/publish.yml`) publishes to npm on the `v*`
   tag (Node 24: `npm ci`, `npm test` / `npm run build` if present, then
   `npm publish`). Auth is **npm trusted publishing via OIDC**: the workflow's
   `id-token: write` lets npm exchange the GitHub Actions OIDC token for a
   short-lived publish credential, so **no `NPM_TOKEN` secret exists in this
   repo**. One-time npmjs-side setup: link this GitHub repo as a trusted
   publisher on the npm account owning the package (see
   <https://docs.npmjs.com/trusted-publishers>; requires 2FA and a public
   package). The workflow verifies the tag matches `package.json` and fails
   fast otherwise.
4. The same workflow also creates the GitHub Release page automatically after a
   successful publish (`softprops/action-gh-release` with
   `generate_release_notes: true`, gated on `contents: write`). No manual
   `gh release create` is needed; `CHANGELOG.md` ships inside the npm tarball
   via `files`.

## Testing

Automated verification lives in `test/verify.js` — a zero-dependency, zero-build
plain-Node script (`npm test` or `node test/verify.js`). It runs the REAL code:
loader hooks (`test/loader-hooks.mjs` + `test/stubs/`) stub the two
`@deepseek-ai/*` peer imports so the host plugin's `apply()` can be driven with a
fake Cordis ctx (state machine, `active` aggregation, approval/asking/done-hold,
route shapes), and the injected browser script is extracted and executed in a
`node:vm` with DOM/fetch/rAF stubs (whale vs full-frame count block, render-key
transitions, effect fills, settings sync, poll-failure restore, legacy-host
compat). Keep it passing when touching `lib/index.js` — it extracts the source,
so it tests exactly what ships.

Additionally verify manually:

1. Open the DSH Web GUI tab and watch the favicon.
2. Trigger an `ask_user_question` tool call → favicon must blink yellow/red for at least `askingHoldMs`.
3. End a turn → `done` icon for `doneHoldMs`, then back to `idle`.
4. `curl` the status endpoint to confirm the aggregate `{ state, since, active, states }` JSON.
5. With ≥2 agents active at once, the favicon must show the full-frame count block; back to the whale at ≤1.

## Constraints (do not break)

- Keep the aggregate priority `asking > running > done > idle` — the aggregation logic depends on this order.
- Keep `asking` as a pin that overlays the agent's real status; only the `scheduleAskCheck` timer may unpin it.
- Keep `reconcile()` (runs on every status request against `agents.list()`) — `agent/status` idle delivery is not guaranteed at turn end.
- Keep all animation in the browser script: favicons do not play SVG CSS animations, so every effect (`blink`, `breath`, `rainbow`, `heartbeat`, `bounce`, …) must be produced by JS rebuilding the data-URI each `requestAnimationFrame` tick and swapping the favicon `href`. Never add in-image SVG animation to `base.svg`. Browsers pause `requestAnimationFrame` in hidden tabs, so `apply()` paints the first frame synchronously (state changes show even while hidden) and the 1 s `poll()` repaints on unchanged states: animated states get a wall-clock frame (`ANIM_START` + `Date.now()` phase — coarse ≈ poll-rate background animation, full-speed rAF when visible), static states repaint (self-heal). Keep those fallback paths working when touching the animation loop.
- Keep injection idempotent — guard on `window.__DSH_WEB_ICON_INDICATOR__` in both `webServer.tapIndex` and the injected script.
- Keep the status poll alive across transient failures: the `poll()` catch restores the original icon and retries on the next tick — it must NEVER `clearInterval` on a fetch failure. The SPA reconnects in place across host restarts, so a dead poll would leave the tab without an icon until a manual refresh.
- Keep the live config sync lossless: the status response echoes `states` (the resolved per-state visual config) and `syncCfg` swaps it in with a `PREV_STATE = null` repaint when the serialized value changes. It must stay inside the poll's `.then()` — never in the `.catch()` path — and a payload without `states` (older host) must leave the baked `__CFG__` untouched. `statusPath` / `iconPathPrefix` route paths are baked at registration, so changing those keys still requires a restart.
- Keep the plugin host-plane only: mount via profile composition, never as a session-scoped agent preset.
- Use the existing `sandboxPolicy` injection (currently unused) or remove it — do not leave it dangling without a note.
- Don't break the settings-card contract (see *Settings card contract (cookbook)*): the `web-icon-indicator` join key, the `settings.plugin.item` registration shape, the bundle-purity gate (never value-import `PluginCard` / `CardForm` / `fields` from `@deepseek-ai/dsh-client-ui-settings-plugins`), and staging writes through `ctx.settingsScope`.

## Do NOT

- Add a build system, test framework, linter, or NEW dependencies without an explicit request. This repo is deliberately zero-build (the only automated check is the zero-dependency `test/verify.js`, added on request); the only runtime dep is `@deepseek-ai/schemastery` (config schema, added on request), declared as a `peerDependency` (the host harness provides it). The host provides the `settings` service; `@deepseek-ai/dsh-settings` is not imported by either half. The single `devDependency` is `commit-and-tag-version` (release tooling only — added on request; never promote it to a runtime dep).
- Rename `base.svg` or change the icon route regex `^base\.svg$` without updating the state machine, browser script, types, and both READMEs together.
- Break the plugin contract `{ name, inject, config, apply(ctx, config) }` (+ `SETTINGS_NAMESPACE` / `CONFIG_SCHEMA`) or the `dsh.bundle.patch` → `cordis.patch.yml` wiring.
- Let `agent/turn-stopping` override the `asking` pin while it is active.
