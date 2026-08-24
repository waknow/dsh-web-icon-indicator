# Changelog

All notable changes to **dsh-web-icon-indicator** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] - 2026-08-24

### Changed

- Added the [awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg) listing badge to `README.md` and `README.zh.md` now that the plugin is featured in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) ([9042fb3](https://github.com/waknow/dsh-web-icon-indicator/commit/9042fb3)).
- npm publishing is now fully automated on `v*` tags via GitHub Actions (OIDC trusted publishing, no token secrets) — verified end-to-end with the `0.2.2` release.

## [0.2.1] - 2026-08-21

### Added

- Settings card UX polish and favicon render robustness ([e584912](https://github.com/waknow/dsh-web-icon-indicator/commit/e584912)).
- Documentation: visualize the default config and all effects in the READMEs; settings card shows a cycle field only for animated states and swatches as native color pickers; Safari favicon dynamic-color feasibility research with browser support tables ([23da09e](https://github.com/waknow/dsh-web-icon-indicator/commit/23da09e), [d99546d](https://github.com/waknow/dsh-web-icon-indicator/commit/d99546d), [04a8e58](https://github.com/waknow/dsh-web-icon-indicator/commit/04a8e58)).
- CI: publish to npm from GitHub Actions on version tags; verify the tag matches `package.json` before publishing; switch `@deepseek-ai` deps to `peerDependencies` ([b96e90e](https://github.com/waknow/dsh-web-icon-indicator/commit/b96e90e), [61fc3bc](https://github.com/waknow/dsh-web-icon-indicator/commit/61fc3bc), [23da09e](https://github.com/waknow/dsh-web-icon-indicator/commit/23da09e)).

### Fixed

- Keep the heartbeat/bounce whale centered when the CSS animation runs ([4a379aa](https://github.com/waknow/dsh-web-icon-indicator/commit/4a379aa)).

## [0.2.0] - 2026-08-20

### Added

- Full per-state visual configuration: `effect` / `colors[]` / `speed` per state, plus `askingHoldMs` / `doneHoldMs` timings ([dca6de3](https://github.com/waknow/dsh-web-icon-indicator/commit/dca6de3)).
- DSH settings service integration (`web-icon-indicator` namespace) with a settings-page card — validate, persist to `settings.yaml`, and apply live to the running tab ([7cf6962](https://github.com/waknow/dsh-web-icon-indicator/commit/7cf6962)).
- Sandbox-interception and approval waits surfaced as the `asking` state ([1f8ebba](https://github.com/waknow/dsh-web-icon-indicator/commit/1f8ebba)).
- Background-tab animation fallback: wall-clock frames for animated states while `requestAnimationFrame` is paused in hidden tabs ([4abc9b2](https://github.com/waknow/dsh-web-icon-indicator/commit/4abc9b2)).
- Polling resilience: a transient fetch failure restores the original icon and retries on the next tick instead of killing the poll ([d7b4188](https://github.com/waknow/dsh-web-icon-indicator/commit/d7b4188)).

### Changed

- Replaced the individual per-state SVG icons with a single [base.svg](icons/base.svg) whale template, recolored and animated entirely in the browser as `data:image/svg+xml` URIs ([0a76d0b](https://github.com/waknow/dsh-web-icon-indicator/commit/0a76d0b)).
- Browser half rewritten to use shell UI primitives for the settings card ([971f3b6](https://github.com/waknow/dsh-web-icon-indicator/commit/971f3b6)).
- Added live SVG previews of every state and effect to the READMEs ([a1f67ce](https://github.com/waknow/dsh-web-icon-indicator/commit/a1f67ce)).

## [0.1.0] - 2026-08-19

### Added

- Initial release: browser tab favicon mirrors the DSH session state (`idle` / `running` / `asking` / `done`) with a single-color whale icon ([c8b66cb](https://github.com/waknow/dsh-web-icon-indicator/commit/c8b66cb)).
- Repository metadata and install-from-source instructions ([69f550c](https://github.com/waknow/dsh-web-icon-indicator/commit/69f550c)).

[Unreleased]: https://github.com/waknow/dsh-web-icon-indicator/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/waknow/dsh-web-icon-indicator/compare/0.2.1...v0.2.2
[0.2.1]: https://github.com/waknow/dsh-web-icon-indicator/compare/0.2.0...0.2.1
[0.2.0]: https://github.com/waknow/dsh-web-icon-indicator/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/waknow/dsh-web-icon-indicator/releases/tag/0.1.0