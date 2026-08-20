# dsh-web-icon-indicator

> 📖 [中文文档](README.zh.md) · [English](README.md)

Browser tab favicon reflects the current DSH session state — `idle` / `running` / `asking` / `done` — so you can see at a glance whether a session needs your attention, even when the tab is in the background.

## States

| State | Color (default) | Effect (default) |
| --- | --- | --- |
| `idle` | `#1a1a1a` (deep whale) | `static` |
| `running` | `#FACC15` (yellow) | `static` |
| `asking` | `#E5484D` + `#FACC15` | `blink` (400 ms) |
| `done` | `#22A06B` (green) | `static` for `doneHoldMs`, then `idle` |

The plugin ships **one** base whale SVG ([`icons/base.svg`](./icons/base.svg)) and recolors / animates it in the browser — there are no per-color icon files anymore. Color and effect are fully configurable per state (see [Configure](#configure)).

### Dynamic color & animation

All states share the same whale path; only the fill color (and optionally an animation) differ. Because a favicon is a plain image, SVG CSS animations never run inside the tab — the injected browser script builds each frame as a `data:image/svg+xml,…` URI, replacing the `__COLOR__` placeholder with the configured color and, for animated effects, injecting a `<g transform>` for scale/translate on every `requestAnimationFrame` tick. The available effects are:

| Effect | Behavior |
| --- | --- |
| `static` | A single colored frame, no motion — uses `colors[0]` |
| `blink` | Toggles `colors[0]` ⇄ `colors[1]` (a darker second color is derived if missing) over `speed` |
| `breath` | Pulsates between `colors[0]` and `colors[1]` (derived if missing) over `speed` |
| `rainbow` | Uses `colors[0]` as the starting hue, then cycles the wheel over `speed` |
| `heartbeat` | Scale pulses with a sharp lub-dub beat over `speed` — color is `colors[0]` |
| `bounce` | The whale hops up and down over `speed` — color is `colors[0]` |

A self-contained demo (no build, no deps) with these effects lives in [`demo/dynamic-color.html`](./demo/dynamic-color.html) — pick a state + effect and edit colors live, watching the browser-tab favicon update in real time.

## Install

This is a standard DSH bundle plugin. Install it into the `web` profile (the GUI/TUI profiles pick it up automatically through the cordis patch layer).

From npm (**recommended** — published as `dsh-web-icon-indicator@0.1.0`):

```bash
dsh plugin --profile web add dsh-web-icon-indicator
```

From the Git source:

```bash
dsh plugin --profile web add github:waknow/dsh-web-icon-indicator
```

Or from a local directory / tarball:

```bash
dsh plugin --profile web add <path-or-tarball>
```

Or drop the directory into `~/.dsh/profiles/web/node_modules/<name>/` and ship a `cordis.patch.yml` that matches the one shipped here.

## Configure

All keys are optional; defaults shown.

| Key | Default | Meaning |
| --- | --- | --- |
| `iconsDir` | `<package>/icons/` | Directory holding the single `base.svg` |
| `statusPath` | `/dsh-web-icon-status.json` | JSON status endpoint |
| `iconPathPrefix` | `/dsh-web-icon-indicator` | URL prefix `base.svg` is served under |
| `askingHoldMs` | `3500` | Minimum visibility of the asking state |
| `doneHoldMs` | `5000` | Time the done state stays before falling back to idle |
| `states` | see below | Per-state visual config |

Each entry in `states` is one object per state: `{ effect, colors[], speed? }`:

```yaml
config:
  states:
    idle:    { effect: static,    colors: ['#1a1a1a'] }
    running: { effect: static,    colors: ['#FACC15'] }
    asking:  { effect: blink,     colors: ['#E5484D', '#FACC15'], speed: 400 }
    done:    { effect: static,    colors: ['#22A06B'] }
```

- **`effect`** — one of `static | blink | breath | rainbow | heartbeat | bounce`.
- **`colors`** — an **array** of hex colors. `colors[0]` is the primary. Multi-color effects read more entries: `blink` uses `colors[0]`⇄`colors[1]`, `breath` breathes `colors[0]`⇄`colors[1]` (each derives a darker second color if omitted), `rainbow` uses only `colors[0]` as the starting hue.
- **`speed`** — optional per-state cycle length in ms (also the `blink` toggle interval). Default `1200`.

Entries are shallow-merged over the defaults, so you can override only a few states. Example:

```yaml
- id: dsh-web-icon-indicator
  name: 'dsh-web-icon-indicator'
  config:
    states:
      running: { effect: breath,    colors: ['#FF9900', '#FFD9A0'], speed: 900 }
      asking:  { effect: rainbow,   colors: ['#FF0000'] }
      done:    { effect: heartbeat, colors: ['#2ECC71'] }
```

## How it works

- Host-only plugin: registers routes on the existing `webServer` — the status JSON endpoint, a static `/dsh-web-icon-indicator/base.svg` (the whale template), and one `tapIndex` that injects a small browser script into every served `index.html`.
- Status is aggregated across live `agents.list()` with priority `asking > running > done > idle`. The aggregation runs a `reconcile()` step on every request to detect running → idle transitions, because `agent/status`'s idle delivery is not guaranteed at turn end.
- `ask_user_question` tool calls (via `tools/pre-execute` / `tools/result`) flip the session into `asking` with a configurable minimum-hold so the icon stays visible even when the user answers immediately.
- Permission / **sandbox-interception** waits are also surfaced as `asking`: when the agent hits a sandbox denial and escalates (`sandbox_permissions` + `justification`), or any other tool asks for approval, the approval service appends an `approval/asked` session event and blocks the agent until you decide. The plugin watches `session/event` (with an authoritative fold over the live session log as a fallback) and pins the session into the `asking` state for that whole wait, clearing it on `approval/decided`.
- The browser script polls `/dsh-web-icon-status.json` once a second, fetches `base.svg` once, and then on every `requestAnimationFrame` tick rebuilds the favicon as a `data:image/svg+xml,…` URI — replacing the `__COLOR__` placeholder with the state's configured color and applying the state's configured effect. Browsers don't play favicon SVG CSS animations, so all motion is JS-driven.

## Caveats

- Favicon SVG CSS animations do not run inside the browser's tab UI — all effects are produced in JavaScript by rebuilding the data-URI each frame. This is a deliberate, zero-dependency design.
- The base template must keep its `__COLOR__` placeholder in the `#p { fill: … }` rule; the browser replaces that token to color each frame.
- The plugin runs in the **host** plane; it must be mounted into a profile's composition, not a session-scoped agent preset.
- File reads go through the `fs` service with the configured `iconsDir` as `cwd`. Make sure that path is readable under your deployment's sandbox policy.

## License

MIT