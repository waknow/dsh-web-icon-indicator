# AGENTS.md

Agent operating instructions for `dsh-web-icon-indicator` — a DSH (DeepSeek Harness) bundle plugin that mirrors the current session state onto the browser tab favicon (`idle` / `running` / `asking` / `done`).

## Common commands

**There is no build step and no linter.** Do not invent or run them. Automated checks: `npm test` (= `node test/verify.js`, see *Testing*).

```bash
# Manual verification loop (the only way to validate changes):
dsh plugin --profile web add <this-repo-path>            # install into web profile
curl http://localhost:3080/dsh-web-icon-status.json      # aggregated state JSON: {"state","since","active","states","defaultColor","warnings"} (defaultColor is null when unset)
```

## Upstream DSH source

The DSH platform this plugin runs on lives at **https://github.com/deepseek-ai/deepseek-harness** — consult it when the *installed* packages lack context: what ships in `node_modules` is built/minified (browser bundles, compiled `.js`), while the repo carries the readable `src/*` TypeScript sources (e.g. `packages/client/…`, `packages/settings/…`). Note the installed `@deepseek-ai/*` versions may lag or lead the repo's `main`; when behavior differs, match the installed version tag first.

## Project structure

| Path | Role | Notes |
| --- | --- | --- |
| `lib/index.js` | **The entire host implementation**: Cordis plugin + per-agent state machine + HTTP routes + injected browser script + the schemastery `Config` schema (modern lines project it into a live form) and the feature-detected legacy `installSection` registration | The file you will normally edit for host behavior |
| `lib/client.js` | **Browser half** (hand-written `window.__ModuleLoader__.load` bundle, no build step): registers the configuration page on the slot a host declares — `plugins.bundle.config` on every host with a Plugins page (≥ 0.1.6-alpha.2), else `plugins.row.config`, plus `settings.plugin.item` on the legacy line — and binds whichever settings provider the host exposes (`configForms` / `settingsScope`) | Edit when changing the settings-page card (fields, labels, save/reset) |
| `lib/types/index.d.ts` | Public config & aggregate types | Keep in sync with the config surface + `CONFIG_SCHEMA` in `lib/index.js` |
| `lib/types/client/index.d.ts` | Browser-half types (`inject` / `apply`) | Keep in sync with `lib/client.js` |
| `icons/base.svg` | The single whale template with a `__COLOR__` placeholder; recolored/animated in the browser | The filename is locked by a route regex — treat as immutable |
| `icons/plugin.svg` | The **static** whale declared as `package.json` → `icon`: the official Plugins page's card/row artwork (DSH ≥ 0.1.7) | Byte-identical to `docs/assets/favicon.svg`; both are `base.svg` with `__COLOR__` → `#1a1a1a`. Never point `icon` at `base.svg` (its placeholder is not a colour) — see *Declare the Plugins-page artwork* |
| `cordis.patch.yml` | Install patch that inserts the plugin row into the profile composition | Referenced by `package.json` → `dsh.bundle.patch` |
| `README.md` / `README.zh.md` | User docs (EN / zh) | Update both on any behavior/config/icon change |
| `screenshots.json` | Marketplace storefront screenshots (1–8 image paths, relative to the file, in-repo only) | Read by the awesome-dsh-plugin nightly build & dsh-market detail view; see *Declare or change marketplace screenshots* |
| `package.json` | Metadata, `exports` (incl. `./client`), `dsh.client` declaration, `engines.dsh` (declared DSH host floor — see *Declare/change the DSH host requirement*), `peerDependencies` (`@deepseek-ai/schemastery`), `files` allowlist (`lib`, `icons`, `assets`, `test`, `screenshots.json`, docs, LICENSE — `docs/` and `demo/` are repo-only), `scripts` (`release*` → `commit-and-tag-version`), `devDependencies` (`commit-and-tag-version`) | Release scripts — see *Release*; `test/` ships so `npm test` works from the tarball |
| `.github/workflows/publish.yml` | CI: publishes to npm on `v*` tags via **OIDC trusted publishing** (no token secret; `npm ci` + optional test/build, then `npm publish`) | Keeps the release flow hands-off — see *Release* |
| `.github/workflows/pages.yml` | CI: deploys the `docs/` showcase site to GitHub Pages on pushes touching `docs/**` / `assets/**` (static, no build; re-copies `assets/multi-agent-count.svg` into `docs/assets/` before upload) | One-time setup: repo Settings → Pages → Source: **GitHub Actions** — see *Publish the GitHub Pages site* |
| `docs/` | GitHub Pages showcase site: `index.html` + `style.css` + `main.js` (bilingual zh/en, zero-build) plus `safari-favicon-research.md`; `docs/assets/` holds `favicon.svg` (generated from `icons/base.svg`) and a deploy-refreshed copy of `assets/multi-agent-count.svg` | The site's whale renderer is a hand-port of the injected script — keep them in sync, see *Publish the GitHub Pages site* |

## Code style & conventions

- ESM only (`"type": "module"`); the only runtime dependency is `@deepseek-ai/schemastery` (config schema), declared as a `peerDependency` per the awesome-dsh-plugin contributing guide — keep it that way (floor `^3.18.2` — the legacy host line's version; `LIVE()` only calls `.volatile()` when the resolved schemastery provides it, i.e. ≥ 3.18.3). The host provides the `settings` service (and `@deepseek-ai/dsh-settings` is NOT imported by either half).
- Plugin contract: default export `{ name, inject, Config, apply(ctx, config), SETTINGS_NAMESPACE, LEGACY_SETTINGS_NAMESPACE, CONFIG_SCHEMA }`; `inject` = `webServer, timer, agents, fs`. `Config` is the schemastery schema (also exported as `CONFIG_SCHEMA`); Cordis passes the schema-resolved config as the second argument to `apply`, with every `.volatile()` field a live reference (`config.states.get()`) the loader mutates in place on a settings write, and the legacy settings service registered only when the running host actually exposes `installSection`.
- All session state lives in module-scope Maps/Sets keyed by agent id: `states`, `asking`, `askDone`, `askTimers`, `lastSeen` (see `lib/index.js`).
- The browser script is the `INJECTED_SCRIPT` template string, injected via `webServer.tapIndex`; config flows in through placeholder tokens (`__STATUS_PATH__`, `__BASE_PATH__`, `__CFG__`), each paired with a `.replace()` call in `apply()` (rebuilt from `ctx.on("loader/volatile-update", …)` — the injected script is a `let`, so the next page load picks up settings edits). `__CFG__` carries the `{ states }` object as JSON, where each state is `{ effect, colors[], speed? }`.
- The config surface is the exported `Config` schema; on ≥ 0.1.7 the DSH settings service projects its `.volatile()` fields into a live form keyed by the profile entry id (`dsh-web-icon-indicator`), and a volatile-only write is committed into the running fiber's references + announced with `loader/volatile-update` (no restart). On ≤ 0.1.6-alpha.1 the same schema is registered under `LEGACY_SETTINGS_NAMESPACE` through `installSection` and driven by `setSource`/`onChange`. `CONFIG_SCHEMA` defaults must mirror `DEFAULTS` — see the cookbook below.
- `lib/client.js` is a hand-written ModuleLoader factory bundle (no bundler): it `require("react")` and `require("@deepseek-ai/dsh-client-ui-primitives")` (both shell-provided statics, so they always resolve) and exposes `{ apply, inject }` with `inject = ["slots", "locale"]`. Those two are the only services every host generation provides; the settings providers are weak `ctx.get` reads. Keep it that way — never add imports that aren't guaranteed registered factories or seed words.
- UI display parts in `lib/client.js` should prefer components from `@deepseek-ai/dsh-client-ui-primitives` (Button, Input, Icon* icons, …) over hand-rolled equivalents — that is the official standard (the shell's own plugin cards use them). Hand-roll only where primitives has no counterpart: a passive status badge (`Pill` is an interactive chip), a `<select>` (no primitives Select), or layout wrappers. Inline styles may use the shell's `--dsw-alias-*` design tokens.
- Color values in the settings card are **chips, never hex text**: `colorChip()` for previews (one chip per state — a multi-color state like `asking` shows explicit 1px-separated bands inside that chip; never a gradient, whose fill paints under the chip's translucent `--dsw-alias-border-l2` and blends into a stray colour at the edge; the row-header icon slot is a fixed-size box and would clip a second chip) and `ColorField` for editing (click a chip → native `<input type="color">`, where the hex value is visible and typed). The similarity warning is the ONE place the card prints a colour code — it names the offending hex so the message is actionable. Keep the native input as the invisible absolute overlay (`styles.colorInput`) or the UA widget overflows the row. Keep the collapsed row summary plain text (effect · cycle) — chips there overflowed the ellipsized summary and hid the cycle. The colors a row shows and saves are limited to what its effect uses (`EFFECT_COLOR_COUNT`: 1 for every single-color effect, 2 for `blink`/`breath`, 1 hue seed for `rainbow`) — `rainbow` renders a hue-wheel chip (`rainbowChip()` — a disc, conic gradient with a linear ramp as the no-conic fallback; 14px in the row header, 20px in the expanded field) plus one optional **starting-hue** chip (the stored `colors[0]`), never a colour list. The `+` chip appears only while `colorCountOf(effect) > colors.length` (past that, anything added would be invisible and trimmed on save), opens on `mix(colors[0], black, .35)` — the shade `frameColor` derives anyway — and ignores a colour the state already has. "Reset to defaults" unsets the user layer, but a `defaultColor` supplied by the composition entry cannot be unset: the card writes the idle state's own colour instead, which also makes the clear-override control reappear. The palette row (`paletteColors()`) previews every state beside its name, capped to what its effect paints. The card also keeps a `DEFAULT_STATES` copy of `DEFAULTS.states` (effect + colours + speed): the settings scope's `states` dict can be PARTIAL (the card writes only the states it drafted), so every per-state read and `save()`'s `current` merge that table under the resolved entry — without it the card showed "static + dashed chip" for a state the host still blinks, and a colour-only edit then saved that wrong effect over it. `F41` pins the table against the `DEFAULTS.states` table in `lib/index.js`.
- Keep changes small and localized to `lib/index.js` / `lib/client.js`; prefer editing over restructuring.
- Commit style: `init:` / `feat:` / `fix:` / `docs:` (see git log).

## Settings page contract (cookbook)

**One bundle serves three host generations.** The settings API changed twice on
the published line, so any settings-page change must keep all three working
(verified: `0.1.5-rc.3` = legacy, `0.1.6-alpha.2` = transitional, `0.1.7-alpha.1`
= modern):

| Host | Host half | Client form provider | Page slot | Namespace |
| --- | --- | --- | --- | --- |
| ≤ 0.1.6-alpha.1 | `settings.installSection` | `settingsScope` | `settings.plugin.item` | `web-icon-indicator` |
| 0.1.6-alpha.2 | `settings.installSection` | `settingsScope` | `plugins.bundle.config` | `web-icon-indicator` |
| ≥ 0.1.7 | exported `Config` + `loader/volatile-update` | `configForms` | `plugins.bundle.config` (row slot only as fallback) | `dsh-web-icon-indicator` |

**Why the bundle slot, not the row slot, on the modern lines.** The Plugins page declares
BOTH: `plugins.bundle.config`, which its bundle page renders under the
description, and `plugins.row.config`, whose configure control sits on a row
*inside* that page — one click deeper. The bundle page is exactly what a card in
the Plugins list opens, so `plugins.bundle.config` is what puts the settings one
click from that list; it is also the shape the official plugins use (the official
voice-input bundle registers `plugins.bundle.config` keyed by its own package
name). `start()` therefore registers the bundle entry wherever the host declares
it and drops the row one — cancelling the row wait, or disposing a row
registration that landed first — so one page never draws the same form twice.

**Checked against the published hosts** (npm registry, 2026-09): the page package
`@deepseek-ai/dsh-client-ui-plugin-manager` exists only from **0.1.6-alpha.2**,
and every version of it (0.1.6-alpha.2, 0.1.7-alpha.1/2, 0.1.7-rc.1) declares
BOTH slots *and* renders `plugins.bundle.config` on the bundle page
(`configured: ledger.bundles.has(pkg.name)`), so any host with a Plugins page
takes the bundle branch. `settings.plugin.item` ships in
`dsh-client-ui-settings-plugins` through **0.1.6-alpha.1** and is gone from
0.1.6-alpha.2 on; `configForms` + `whileServed` appear only in
`dsh-client-ui-settings` from **0.1.7-alpha.1**, so 0.1.6-alpha.2 still binds
through `settingsScope` while rendering the bundle slot; `slots.inject` exists
back to **0.1.2-rc.1**. The row branch is therefore a guard no released host
reaches — keep it that way rather than assuming it has been exercised.

Canonical reference: the official settings/Plugins-page slot contract shipped
inside the host (`@deepseek-ai/dsh-cordis-client-runner` embeds the slot
catalog) plus the shell's own companion pages
(`@deepseek-ai/dsh-client-ui-settings-shell` is the closest model — mirror its
shape). The rules below pin that contract to this repo; follow them on any
settings-page change.

- **The namespace is the profile entry id on ≥ 0.1.7, and the plugin-chosen
  string on the legacy line.** `lib/index.js` holds both
  (`SETTINGS_NAMESPACE = "dsh-web-icon-indicator"`,
  `LEGACY_SETTINGS_NAMESPACE = "web-icon-indicator"`); `lib/client.js` mirrors
  them as `NS` / `LEGACY_NS`, and the modern one must also match the row id
  declared in `cordis.patch.yml`. The legacy value is frozen at the pre-0.1.7
  spelling so an existing `web-icon-indicator:` section in `settings.yaml` keeps
  resolving.
- **The host declares the config; the legacy line registers it.** On ≥ 0.1.7 the
  plugin only exports its schemastery schema as `Config`: the loader validates
  the composition row against it and `SettingsForms.describe()` projects its
  `.volatile()` fields into the live form (`volatileForm()` keeps volatile
  fields only, so a non-volatile key is invisible by construction), while a
  volatile write is committed into the running fiber's references and announced
  with `ctx.on("loader/volatile-update", …)`. On ≤ 0.1.6-alpha.1 the same code
  additionally registers through `ctx.inject(["settings"], …) →
  settings.installSection(ctx, LEGACY_SETTINGS_NAMESPACE, CONFIG_SCHEMA, base,
  { setSource, onChange })`, feature-detected on `typeof
  settings.installSection === "function"`. `base` must be a **resolved plain
  copy** (`resolveConfig(source())`), never the raw `apply` config: the legacy
  loader deep-freezes the config it resolved against `Config`, and the legacy
  service resolves the schema over the base in place (`mergeLayers` returns the
  base unchanged when no user section exists) — a frozen base throws
  *Cannot assign to read only property*.
- **`.volatile()` is version-gated.** It exists only from schemastery 3.18.3
  (the legacy host ships 3.18.2), so every live field goes through the
  `LIVE()` helper, which calls `.volatile()` only when the resolved schemastery
  provides it.
- **`Config` and `DEFAULTS` must stay in sync**, and `statusPath` /
  `iconPathPrefix` must stay **non-LIVE** (see *Constraints*).
- **The card owns everything inside it** — chrome, controls, copy. The
  bundle-purity gate rejects value imports across plugins, so `PluginCard`,
  `CardForm`, `ValueField`, … from `@deepseek-ai/dsh-client-ui-settings-plugins`
  are off limits: `lib/client.js` keeps its own staging (the `drafts` map) and
  its own revision-fenced writes.
- **Read/write through the resolved scope.** On ≥ 0.1.7 that is
  `ctx.configForms.get(NS)`; on the legacy lines it is
  `ctx.get("settingsScope").bind({ namespace: LEGACY_NS })` — the two expose the
  same snapshot/write face, which is why the card body is
  generation-agnostic. Neither service may appear in the bundle's `inject`
  (that would leave the fiber un-activated on the other line); both are read
  weakly through `resolveScope(ctx)` inside the slot's inject face. The
  controller's snapshot carries resolved `value`, composition `base`, and raw `user`; a field
  counts as overridden by key **presence** in `user`, never by a value
  comparison. `scope.set(field, value)` stores one field; `scope.unset(field)`
  clears it back to the composition layer. A card save is ONE edit, so it goes
  through `scope.mutate(ops)` with `{ op: "set"|"unset", path: [field], value? }`
  — every op then shares one revision fence, one validation pass, one
  persistence decision and one recovery read (the contract's atomic namespace
  mutation). Only the explicit reset uses `scope.unset` per key — except a
  `defaultColor` that only the composition layer provides, which the reset
  rewrites to the idle colour because an `unset` cannot reach the `base` layer.
- **Slot registration shape** (in `apply()`): every branch goes through
  `ctx.slots.inject` (a no-op for a slot the host never declares), and exactly
  one of the two modern branches may fire. Modern: `ctx.effect(() =>
  ctx.configForms.whileServed([NS], start))`, where `start()` registers
  `{ name: "plugins.bundle.config", key: BUNDLE_KEY }` with
  `BUNDLE_KEY = "<bundle package name>"` and, **only while that slot stays
  undeclared**, `{ name: "plugins.row.config", key: ROW_KEY }` with
  `ROW_KEY = "<bundle package name>#<row id>"`. The bundle branch sets a
  `bundleLive` flag and calls `dropRow()`; the row callback returns a no-op
  when `bundleLive` is already set. Both slots arrive with the Plugins page's own
  registration, so their declarations can land in either order after `apply()`
  (covered by F66–F68). Legacy: `start()` also registers
  `{ name: "settings.plugin.item", key: LEGACY_NS }`, dispatched by the legacy
  settings tab per served namespace (no extra gate needed). `start` must return
  a disposer that calls `disposeBundle()`, `dropRow()` and `disposeItem()` —
  `whileServed` stores it and would otherwise re-register.
- **The page asks for two views**: `view: "summary"` (the row's one-liner) and
  `view: "page"` (the body, already headed by the plugin's title/description —
  the card skips its own collapsible header there). A standalone render passes
  no `view` and keeps the header.
- **Loader dependency**: `package.json` → `dsh.client.inject` lists the union
  across generations — `@deepseek-ai/dsh-client-locale`,
  `-ui-renderer` (owns the `slots` service), `-ui-settings` (the
  `configForms`/`settingsScope` provider), `-ui-settings-plugins` (the legacy
  tab) and `-ui-plugin-manager` (`plugins.bundle.config` /
  `plugins.row.config`). Both loaders skip a
  declared package that is absent from the running host
  (`graphRows.get(name) !== undefined`), so the union is safe on every line —
  keep it that way rather than trimming to one generation.
- **Bundle format**: `lib/client.js` stays the loader's lazy-CJS factory
  artifact (hand-written `window.__ModuleLoader__.load({ id, factory })`, no
  build step) with `dsh.client` and the `./client` export declared.

## Workflows

### Change the icon, a color, an effect, or a timing
1. Icon geometry: edit `icons/base.svg` (keep the `__COLOR__` placeholder in `#p { fill: … }`). Colors/effects/timings: edit `DEFAULTS` in `lib/index.js` — `states.<state>` entries (`effect` / `colors[]` / `speed`), plus `askingHoldMs` / `doneHoldMs` — and keep the corresponding `CONFIG_SCHEMA` defaults in sync (settings validation + the settings-page card read from it). `defaultColor` is a live key too, but it is *not* a fifth rendering path: `resolveConfig` folds it into `states.idle.colors[0]` (the card surfaces it as *Default icon color*), and the CIE76 similarity warning lives in the host's `colorWarnings()` plus a deliberately duplicated copy in `lib/client.js` — keep the two in sync. `statusPath` / `iconPathPrefix` are in `DEFAULTS` and in `Config`, but deliberately NOT `.volatile()` — they stay out of the live settings form (see *Constraints*).
2. No server restart needed for the icon: `base.svg` is re-read per request and the browser re-fetches it with cache-busting (`?t=Date.now()`). Color/effect/timing changes **saved through the settings card** reach the running tab via the status poll within ~1 s (no reload); changing the code-level `DEFAULTS` in `lib/index.js` still requires re-injecting the script (reload the tab) or a DSH web rebuild.
3. If defaults/keys changed: update the config tables in **both** READMEs, `lib/types/index.d.ts`, and — when the card exposes the key — the field in `lib/client.js`.

### Change the settings card (fields, labels, save/reset)
0. Stay inside the [Settings page contract](#settings-page-contract-cookbook): both namespace join keys (`dsh-web-icon-indicator` / `web-icon-indicator`), the slot registration (`plugins.bundle.config` → `plugins.row.config` → `settings.plugin.item`, exactly one per host generation), the purity gate (no value imports of chrome/form model), and write-through-the-resolved-scope staging.
1. Edit `lib/client.js`: the `IconConfigCard` component + the `en`/`zh` dictionaries. The card reads the scope snapshot (`status/writable/value/base/user`) and writes via `scope.mutate(ops)` (one atomic namespace mutation per save) / `scope.unset(field)` (reset).
2. No build step: the file is served as an on-demand, content-addressed combo chunk under `/plugins/??dsh-web-icon-indicator/client.js&rev=…` (the URL the boot manifest advertises; the bare `/plugins/<id>/client.js` path no longer exists). A NEW `dsh.client` declaration (or a first-time `lib/client.js`) is only scanned at profile start; content changes to an existing bundle are re-hashed by HMR.
3. Covered by Part 6 of `test/verify.js`: the bundle is loaded through a fake `window.__ModuleLoader__` and its factory run with hand-rolled `react` + primitives stubs, asserting every generation (modern `configForms` + `whileServed` + `plugins.bundle.config`; the row-only fallback host; either declaration order of the two modern slots, F66–F68; legacy `settingsScope` + `settings.plugin.item` keyed by the legacy namespace), both page views, the rendered card and the exact scope writes (no `react-dom` dependency, so no `react-dom/server`).

### Add a new state (e.g. `error`)
1. Add a `states.<newstate>` default (`effect` / `colors[]` / `speed`) in `DEFAULTS` in `lib/index.js`. No new SVG is needed — every state renders from `base.svg`.
2. Add branches in the state machine, the aggregate `order` array, and the browser `apply()`/`frameAt()` functions.
3. Extend the `DshWebIconIndicatorAggregate.state` union in `lib/types/index.d.ts`.
4. Update the state tables in **both** READMEs (and the card's `STATE_NAMES` / `EDITABLE_STATES` in `lib/client.js` if the card should edit it). `EDITABLE_STATES` excludes `idle`: the card gives idle no detail row (its single color is the top-level `defaultColor` field, with no animation), while the host still honors a `states.idle` entry that arrives through the composition entry for backward compatibility.

### Declare or change the DSH host requirement (`engines.dsh`)
`package.json` → `engines.dsh` is the plugin's declared DSH host floor. The
dsh-market card reads the **published npm `latest` manifest** (via its
`/dsh-market/discovery-compatibility` endpoint) and shows this as the plugin's
host requirement (e.g. "DSH >=0.1.2-rc.1"); with no `engines.dsh` and no
lockstep `@deepseek-ai/dsh*` peer, the card shows "未声明宿主要求".

- **What counts as a host declaration** (in `deriveHostCompatibility`): an
  `engines.dsh` range, **or** a `peerDependencies` entry for a package in the
  DSH host-core set (`corePackageNames()` — names like `@deepseek-ai/dsh`,
  `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-*`). `@deepseek-ai/schemastery`
  and `@deepseek-ai/dsh-settings` do **not** count: schemastery isn't on the
  DSH `@deepseek-ai/dsh*` host line, and `dsh-settings` is not in
  `corePackageNames` (the host provides the `settings` service).
- **Pick the range as the minimum DSH you actually tested against.** Prefer a
  floor (`>=0.1.2-rc.1`, the pre-settings-change line this bundle still serves) so newer hosts stay compatible; use `^0.1.x` / `~0.1.x`
  only if you truly want an upper bound. `deriveHostCompatibility` evaluates
  with `includePrerelease: true`, so prerelease host tags satisfy ordinary
  ranges.
- **Local edits do not change the card**: the market reads the published
  manifest, so the declaration only takes effect after a new npm publish (see
  *Release*). Don't bump `engines.dsh` and expect the marketplace card to
  update without a release.
- This field is metadata-only — it does not change plugin behavior. It only
  declares compatibility so the marketplace can label and filter it.

### Declare or change marketplace screenshots (`screenshots.json`)
`./screenshots.json` (next to `package.json`) lists 1–8 image paths used by
the dsh-market detail view and the awesome-dsh-plugin storefront build.

- **Paths are relative to the file and must stay inside the plugin directory**
  (no leading `/`, no `..`). They must point at images already in the repo —
  this repo's `assets/*.svg` (the state/multi-agent diagrams and the effect
  previews). All paths are validated against the filesystem.
- **In-repo, not catalog-side.** Declaring them in your own repo means you
  update them by pushing here (the nightly build picks them up), with no PR
  and no 404 rot. An absolute URL is accepted, but only on GitHub hosting
  (`raw.githubusercontent.com`, `user-images.githubusercontent.com`, …).
- **You don't need a `screenshots.json` to appear in the storefront** — with
  none declared, the market lazily extracts images from your README. Declaring
  them just controls order and selection (the curated list wins over README
  extraction).
- **Publishing also carries it**: it's in the npm `files` allowlist, so it
  ships in the tarball too. Keep the referenced images under an allowlisted
  directory (`assets/`), or add the path to `files`.

### Declare the Plugins-page artwork (`package.json` → `icon`)

DSH ≥ 0.1.7's official **Plugins page** draws a per-package icon — 48 px on a
bundle card, 40 px on a row — from the package manifest. This is the *only*
supported way to give the plugin artwork there; the page's slots
(`plugins.item` / `plugins.bundle.config` / `plugins.row.config` /
`plugins.detail.{actions,badge,section}`) carry configuration and copy, not
artwork, so **do not** try to inject an icon through the browser half.

- **The field is top-level `package.json.icon`** — a sibling of
  `name`/`version`, *not* under `dsh`. Declared here as `icons/plugin.svg`.
- **Read by the host, never by the plugin**: `readPluginMeta` → `iconOf` in
  `@deepseek-ai/dsh-app-boot` resolves `<specifier>/package.json` (so the
  `exports` map must keep `"./package.json": "./package.json"`), reads the icon
  file itself, and ships it to the browser as a base64 `data:` URL on
  `PluginLocalizedMeta.icon`. Nothing in `lib/` participates.
- **Contract**: relative path, contained in the manifest directory after
  `realpath` (no `..`), SVG / PNG / JPEG / WebP only, ≤ 256 KiB. Absolute
  paths, Windows drive letters and URLs are rejected.
- **A violation is a *problem tag*, not a fallback.** `iconOf` throwing makes
  `readPluginMeta` return `{ ...text, error }` without an icon, which the card
  renders as a metadata error on the plugin. So a broken icon is strictly worse
  than no icon — hence the assertions below.
- **Never point `icon` at `icons/base.svg`**: its `#p { fill: __COLOR__ }`
  placeholder is not a colour, so the file is not a valid standalone image.
  `icons/plugin.svg` is the pre-filled twin (`base.svg` with `__COLOR__` →
  `#1a1a1a`), byte-identical to `docs/assets/favicon.svg`; regenerate both the
  same way when the whale path changes (F65 pins the pair).
- **The package must ship it**: it lives under `icons/`, already in `files`.
- **Effective only on install**: the icon is read from the *installed* package,
  so a local edit shows up after `dsh plugin --profile web add <path>` (or a
  publish) — not from editing this repo alone.
- **Covered by F62–F65** in Part 6 of `test/verify.js`: the manifest path shape,
  the file's size, its standalone-SVG shape (no placeholder), and the
  `icons/plugin.svg` ↔ `docs/assets/favicon.svg` identity (the last one skips
  from a published tarball, where `docs/` is absent).

### Publish the GitHub Pages site (`docs/`)
The showcase site lives in `docs/` and is plain static HTML/CSS/JS — **no build
step**. `.github/workflows/pages.yml` uploads `docs/` via
`actions/upload-pages-artifact` and deploys it; enable it once under repo
Settings → Pages → Source: **GitHub Actions** (or trigger it manually via
`workflow_dispatch`). Local preview: open `docs/index.html` directly or serve
the repo root and browse to `/docs/` — every reference is relative.

- `docs/main.js` re-implements the injected script's renderer (color math,
  effect timing, count-block geometry) and carries its own copy of the whale
  `PATH` from `icons/base.svg`. When you change the whale path, effect timing,
  or count-block geometry in `lib/index.js`, port the same change here —
  `test/verify.js` does NOT cover `docs/`.
- `docs/assets/favicon.svg` is `icons/base.svg` with `__COLOR__` replaced by
  `#1a1a1a`; regenerate it the same way if the template changes.
- `docs/assets/multi-agent-count.svg` is a committed copy of
  `assets/multi-agent-count.svg` (needed for local file:// preview); the Pages
  workflow re-copies it from `assets/` on every deploy so it cannot go stale in
  production. Refresh the committed copy manually when the source changes.
- Copy is bilingual: `data-i18n` keys in `index.html`, zh/en dictionaries in
  `main.js`. Default `zh`, resolved per `navigator.language`, persisted in
  `localStorage` (`dshwii-lang`).

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

- **Host half** — loader hooks (`test/loader-hooks.mjs` + `test/stubs/`) stub the
  `@deepseek-ai/schemastery` peer import so the host plugin's `apply()` can be
  driven with a fake Cordis ctx (state machine, `active` aggregation,
  approval/asking/done-hold, incremental `snapshotEvents` fold, route shapes).
  The live-config path is driven the way the 0.1.7 loader does it: `apply()`
  receives schema-resolved config whose volatile fields are live references, and
  `liveApply()` mutates those references then emits `loader/volatile-update`.
  Part 1b drives the LEGACY line instead: a fake `settings.installSection`
  captures the base/hooks, then `setSource`/`onChange` are pushed through and
  the status route must re-resolve.
- **Injected browser script** — extracted from the template and executed in a
  `node:vm` with DOM/fetch/rAF/AbortController stubs (whale vs full-frame count
  block, render-key transitions, every effect including `heartbeat` / `bounce` /
  `breath`, hidden-tab repaint, settings sync, offline-safe poll-failure restore,
  abort/deadline recovery, legacy-host compat, and **B19a–B19f** for the
  0.1.7+ theme-scoped favicon pair). The stub DOM implements `querySelectorAll`
  and a real node swap — see the favicon-link constraint for why that fidelity
  matters.
- **Browser half** — `lib/client.js` is loaded through a fake
  `window.__ModuleLoader__` and its factory is run with hand-rolled `react` +
  `@deepseek-ai/dsh-client-ui-primitives` stubs (no dependencies, no build step):
  loader contract, every generation's bindings (`configForms` + `whileServed` +
  `plugins.bundle.config`; the row-only page; either declaration order of the
  two modern slots; `settingsScope` + `settings.plugin.item`), both page
  views (`summary` / `page`), card render, staged edits and the single atomic
  `scope.mutate` write, reset.
- **`defaultColor` coverage** — H25–H28k (fold/precedence, blank/null/invalid
  values, the status shape, similarity warnings incl. dense breath sampling,
  idle running `rainbow`, the three host log lines) and F15b–F56 (chips, the
  effect-aware colour list, the add-chip affordances, the rainbow wheel plus
  starting hue, reset semantics, a PARTIAL `states` dict, the cycle field). Two
  assertions pin the deliberate duplication: F41 (`DEFAULT_STATES` ===
  `DEFAULTS.states`) and F42 (ΔE thresholds + hex regex in both halves).
- **Plugins-page artwork** — F62–F65 pin `package.json` → `icon` (a relative,
  in-package SVG/PNG/JPEG/WebP ≤ 256 KiB), the shipped file's standalone-SVG
  shape (no leftover `__COLOR__` placeholder), and its identity with
  `docs/assets/favicon.svg`; see *Declare the Plugins-page artwork*.

Keep it passing when touching `lib/index.js` or `lib/client.js` — it extracts the
source, so it tests exactly what ships. `demo/badge.html` is repo-only, so its
two syntax checks skip gracefully when the script runs from a published tarball.

Additionally verify manually:

1. Open the DSH Web GUI tab and watch the favicon.
2. Trigger an `ask_user_question` tool call → favicon must blink yellow/red for at least `askingHoldMs`.
3. End a turn → `done` icon for `doneHoldMs`, then back to `idle`.
4. `curl` the status endpoint to confirm the aggregate `{ state, since, active, states, defaultColor, warnings }` JSON.
5. With ≥2 agents active at once, the favicon must show the full-frame count block; back to the whale at ≤1.
6. Stop the DSH host → the tab must NOT lose its icon (it shows the cached data-URI copy of the original favicon, or the last plugin frame); restart the host → the live icon returns within ~1 s without a tab reload.

## Constraints (do not break)

- Keep the aggregate priority `asking > running > done > idle` — the aggregation logic depends on this order.
- Keep `asking` as a pin that overlays the agent's real status; only the `scheduleAskCheck` timer may unpin it.
- Keep `reconcile()` (runs on every status request against `agents.list()`) — `agent/status` idle delivery is not guaranteed at turn end.
- Keep all animation in the browser script: favicons do not play SVG CSS animations, so every effect (`blink`, `breath`, `rainbow`, `heartbeat`, `bounce`, …) must be produced by JS rebuilding the data-URI each `requestAnimationFrame` tick and swapping the favicon `href`. Never add in-image SVG animation to `base.svg`. Browsers pause `requestAnimationFrame` in hidden tabs, so `apply()` paints the first frame synchronously (state changes show even while hidden) and the 1 s `poll()` repaints on unchanged states: animated states get a wall-clock frame (`ANIM_START` + `Date.now()` phase — coarse ≈ poll-rate background animation, full-speed rAF when visible), static states repaint (self-heal). Keep those fallback paths working when touching the animation loop.
- Keep injection idempotent — guard on `window.__DSH_WEB_ICON_INDICATOR__` in both `webServer.tapIndex` and the injected script.
- **Never let a second `rel=icon` link exist while painting, and never query the favicon link without normalizing first.** From **0.1.7-alpha.1** the shell's `index.html` ships a *theme-scoped pair*:
  `<link rel=icon href=favicon-dark.svg media="(prefers-color-scheme: dark)">` +
  `<link rel=icon href=favicon.svg media="(prefers-color-scheme: light)">`
  (up to `0.1.6-alpha.2` there was exactly one). A browser resolves the favicon to the **LAST connected link whose `media` matches**, so painting only the first one left the tab on the shell's icon forever while the status endpoint changed underneath — the reported *"the icon never changes"* bug. `normalizeIconLinks()` (run once at startup, before the first paint) collapses the set to ONE link with **no `media` attribute**, preferring the variant the current scheme selects; every `linkEl()` read then sees that single link. `setHrefFresh`'s node swap must NOT carry the old `media` over. Regression cover: **B19a–B19f** (and the DOM stub models `querySelectorAll` + real node swaps, so a stub that copies the old attributes back onto the fresh node will hide the bug — it did once).
- Keep the status poll alive across transient failures: the `poll()` catch performs an OFFLINE-SAFE restore once per outage and retries on every tick — it must NEVER `clearInterval` on a fetch failure. Offline-safe means: restore only `data:` URIs (the startup-cached copy of the original favicon, or the original href when it is itself a `data:` URI); when no copy exists, keep the last painted plugin frame. Never write the original server URL back — while the host is stopped that URL is unreachable and would blank the tab (the "icon lost after backend stops" bug). The SPA reconnects in place across host restarts, so the live icon returns on the first successful poll.
- Keep the live config sync lossless: the status response echoes `states` (the resolved per-state visual config) and `syncCfg` swaps it in with a `PREV_STATE = null` repaint when the serialized value changes. It must stay inside the poll's `.then()` — never in the `.catch()` path — and a payload without `states` (older host) must leave the baked `__CFG__` untouched. `statusPath` / `iconPathPrefix` route paths are baked at registration, so changing those keys still requires a restart.
- Keep the plugin host-plane only: mount via profile composition, never as a session-scoped agent preset.
- Keep `statusPath` / `iconPathPrefix` **out of the live settings form** (plain, not wrapped in `LIVE()`): they are baked into the route table and the injected script at registration time, so a settings-document change to them could never be honored without re-applying the plugin (the browser would poll a path the server does not serve). They are composition-entry only; the live surface covers `askingHoldMs`, `doneHoldMs`, `iconsDir`, `defaultColor`, `states`.
- Don't break the settings-page contract (see *Settings page contract (cookbook)*): both namespace join keys, the slot registration (`plugins.bundle.config` first, `plugins.row.config` only where that slot is absent, `settings.plugin.item` on the legacy line — never two of them on one page), the version-gated `LIVE()` wrapper, the bundle-purity gate (never value-import `PluginCard` / `CardForm` / `fields` from `@deepseek-ai/dsh-client-ui-settings-plugins`), and staging writes through the resolved scope (`configForms` / `settingsScope`).

## Do NOT

- Add a build system, test framework, linter, or NEW dependencies without an explicit request. This repo is deliberately zero-build (the only automated check is the zero-dependency `test/verify.js`, added on request); the only runtime dep is `@deepseek-ai/schemastery` (config schema, added on request), declared as a `peerDependency` (the host harness provides it). The host provides the `settings` service; `@deepseek-ai/dsh-settings` is not imported by either half. The single `devDependency` is `commit-and-tag-version` (release tooling only — added on request; never promote it to a runtime dep).
- Rename `base.svg` or change the icon route regex `^base\.svg$` without updating the state machine, browser script, types, and both READMEs together.
- Break the plugin contract `{ name, inject, Config, apply(ctx, config) }` (+ `SETTINGS_NAMESPACE` / `LEGACY_SETTINGS_NAMESPACE` / `CONFIG_SCHEMA`), the feature-detected legacy registration, or the `dsh.bundle.patch` → `cordis.patch.yml` wiring.
- Let `agent/turn-stopping` override the `asking` pin while it is active.
