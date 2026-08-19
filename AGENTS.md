# AGENTS.md

Agent operating instructions for `dsh-web-icon-indicator` — a DSH (DeepSeek Harness) bundle plugin that mirrors the current session state onto the browser tab favicon (`idle` / `running` / `asking` / `done`).

## Common commands

**There is no build step, no test suite, and no linter.** Do not invent or run them.

```bash
# Manual verification loop (the only way to validate changes):
dsh plugin --profile web add <this-repo-path>            # install into web profile
curl http://localhost:3080/dsh-web-icon-status.json      # aggregated state JSON: {"state","since"}
```

## Project structure

| Path | Role | Notes |
| --- | --- | --- |
| `lib/index.js` | **The entire implementation**: Cordis plugin + per-agent state machine + HTTP routes + injected browser script | The only file you will normally edit |
| `lib/types/index.d.ts` | Public config & aggregate types | Keep in sync with the config surface in `lib/index.js` |
| `icons/{idle,running,asking,done}.svg` | Four static favicon icons | Filenames are locked by a route regex — treat as immutable |
| `cordis.patch.yml` | Install patch that inserts the plugin row into the profile composition | Referenced by `package.json` → `dsh.bundle.patch` |
| `README.md` / `README.zh.md` | User docs (EN / zh) | Update both on any behavior/config/icon change |
| `package.json` | Metadata, `exports`, `files` allowlist | No `scripts` field; publishing is manual `npm publish` |

## Code style & conventions

- ESM only (`"type": "module"`), zero dependencies — keep it that way.
- Plugin contract: default export `{ name, inject, config, apply(ctx) }`; `inject` = `webServer, timer, agents, fs, sandboxPolicy`.
- All session state lives in module-scope Maps/Sets keyed by agent id: `states`, `asking`, `askDone`, `askTimers`, `lastSeen` (see `lib/index.js`).
- The browser script is the `INJECTED_SCRIPT` template string, injected via `webServer.tapIndex`; config flows in through placeholder tokens (`__STATUS_PATH__`, `__ICON_PREFIX__`, `__ASKING_BLINK_MS__`), each paired with a `.replace()` call in `apply()`.
- Keep changes small and localized to `lib/index.js`; prefer editing over restructuring.
- Commit style: `init:` / `feat:` / `fix:` / `docs:` (see git log).

## Workflows

### Change an icon or timing
1. Edit `icons/*.svg` for visuals, or `DEFAULTS` in `lib/index.js` for timings (`askingHoldMs` / `askingBlinkMs` / `doneHoldMs` / paths).
2. No restart needed: icons are re-read per request and the browser script polls with cache-busting (`?t=Date.now()`).
3. If defaults/keys changed: update the config tables in **both** READMEs and `lib/types/index.d.ts`.

### Add a new state (e.g. `error`)
1. Add `icons/error.svg`.
2. Extend the icon route regex to accept the new name.
3. Add branches in the state machine, the aggregate `order` array, and the browser `apply()` function.
4. Extend the `DshWebIconIndicatorAggregate.state` union in `lib/types/index.d.ts`.
5. Update the state tables in **both** READMEs.

### Release
1. Bump `version` in `package.json`.
2. `npm publish` (manual, no CI). Confirm new assets are listed in `files`.

## Testing

No automated tests. Verify manually:

1. Open the DSH Web GUI tab and watch the favicon.
2. Trigger an `ask_user_question` tool call → favicon must blink yellow/red for at least `askingHoldMs`.
3. End a turn → `done` icon for `doneHoldMs`, then back to `idle`.
4. `curl` the status endpoint to confirm the aggregate `{ state, since }` JSON.

## Constraints (do not break)

- Keep the aggregate priority `asking > running > done > idle` — the aggregation logic depends on this order.
- Keep `asking` as a pin that overlays the agent's real status; only the `scheduleAskCheck` timer may unpin it.
- Keep `reconcile()` (runs on every status request against `agents.list()`) — `agent/status` idle delivery is not guaranteed at turn end.
- Keep icons static: favicons do not play SVG CSS animations; the `asking` blink is JS frame-swapping in the browser script.
- Keep injection idempotent — guard on `window.__DSH_WEB_ICON_INDICATOR__` in both `webServer.tapIndex` and the injected script.
- Keep the plugin host-plane only: mount via profile composition, never as a session-scoped agent preset.
- Use the existing `sandboxPolicy` injection (currently unused) or remove it — do not leave it dangling without a note.

## Do NOT

- Add a build system, test framework, linter, or dependencies without an explicit request. This repo is deliberately zero-build, zero-dep, zero-test.
- Rename `idle.svg` / `running.svg` / `asking.svg` / `done.svg` or change the icon route regex `^(idle|running|asking|done)\.svg$` without updating the state machine, browser script, types, and both READMEs together.
- Break the plugin contract `{ name, inject, config, apply(ctx) }` or the `dsh.bundle.patch` → `cordis.patch.yml` wiring.
- Let `agent/turn-stopping` override the `asking` pin while it is active.
