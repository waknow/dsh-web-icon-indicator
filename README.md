# dsh-web-icon-indicator

> 📖 [中文文档](README.zh.md) · [English](README.md)

Browser tab favicon reflects the current DSH session state — `idle` / `running` / `asking` / `done` — so you can see at a glance whether a session needs your attention, even when the tab is in the background.

## States

| State | Visual · Icon | Animation |
| --- | --- | --- |
| `idle` | Original DeepSeek whale (default favicon) | — |
| `running` | Yellow whale | Static |
| `asking` | Yellow ⇄ red | 400 ms blink |
| `done` | Green whale | Static for 5 s, then back to idle |

The four SVG icons live in [`icons/`](./icons/) beside the package. Edit them to match your brand; the plugin re-reads them on every request, so any change is live as soon as the browser tab polls again.

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
| `iconsDir` | `<package>/icons/` | Directory of the four `*.svg` files |
| `statusPath` | `/dsh-web-icon-status.json` | JSON status endpoint |
| `iconPathPrefix` | `/dsh-web-icon-indicator` | URL prefix the four SVGs are served under |
| `askingHoldMs` | `3500` | Minimum visibility of the asking icon |
| `askingBlinkMs` | `400` | Yellow/red blink interval |
| `doneHoldMs` | `5000` | Time the done icon stays |

Override from your composition row:

```yaml
- id: dsh-web-icon-indicator
  name: 'dsh-web-icon-indicator'
  config:
    askingBlinkMs: 320
    doneHoldMs: 4000
```

## How it works

- Host-only plugin: registers three routes on the existing `webServer` (status JSON, `/dsh-web-icon-indicator/*.svg`, and one `tapIndex` to inject a small browser script into every served `index.html`).
- Status is aggregated across live `agents.list()` with priority `asking > running > done > idle`. The aggregation runs a `reconcile()` step on every request to detect running → idle transitions, because `agent/status`'s idle delivery is not guaranteed at turn end.
- `ask_user_question` tool calls (via `tools/pre-execute` / `tools/result`) flip the session into `asking` with a configurable minimum-hold so the icon stays visible even when the user answers immediately.
- The browser script polls `/dsh-web-icon-status.json` once a second and sets `<link rel="icon">`'s `href` to a `data:image/svg+xml,…` URI. Browsers don't play SVG favicon CSS animations, so the four icons are static SVGs and the `asking` blink is driven by the script swapping between yellow and red frames every `askingBlinkMs`.

## Caveats

- Favicon SVG CSS animations do not run inside the browser's tab UI — the four shipped icons are static for that reason. Open the SVG files directly in a viewer to see the full design.
- The plugin runs in the **host** plane; it must be mounted into a profile's composition, not a session-scoped agent preset.
- File reads go through the `fs` service with the configured `iconsDir` as `cwd`. Make sure that path is readable under your deployment's sandbox policy.

## License

MIT