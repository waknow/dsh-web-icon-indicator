# Changelog

All notable changes to **dsh-web-icon-indicator** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0](https://github.com/waknow/dsh-web-icon-indicator/compare/v0.5.2...v0.6.0) (2026-09-24)

### Added

* show the settings form on the plugin's own page ([a85a8b0](https://github.com/waknow/dsh-web-icon-indicator/commit/a85a8b0ce3821743c45bd8cca6ea0d969e8a419f))

## [0.5.2](https://github.com/waknow/dsh-web-icon-indicator/compare/v0.5.1...v0.5.2) (2026-09-24)

### Added

* give the official Plugins page its own artwork ([332896b](https://github.com/waknow/dsh-web-icon-indicator/commit/332896b4b05af94877e63a33ad9c4895b94ad7dd))

### Fixed

* repaint the favicon on DSH 0.1.7's theme-scoped link pair ([a57f78f](https://github.com/waknow/dsh-web-icon-indicator/commit/a57f78ff98acd4d9ae41c03c3b0519113e357bb2))

## [0.5.1](https://github.com/waknow/dsh-web-icon-indicator/compare/v0.5.0...v0.5.1) (2026-09-22)

### Fixed

* load on DSH 0.1.7 and keep the legacy settings contract ([6e8dbb5](https://github.com/waknow/dsh-web-icon-indicator/commit/6e8dbb5402b9847eecc33029d68316407f767288))

## [0.5.0](https://github.com/waknow/dsh-web-icon-indicator/compare/v0.4.2...v0.5.0) (2026-09-17)

### Added

* add GitHub Pages showcase site with live bilingual demos ([92ecd70](https://github.com/waknow/dsh-web-icon-indicator/commit/92ecd705217bf3e3a2f52edb86a05665c4ed5b08))
* add skills-lock.json to manage skill dependencies ([935ad4c](https://github.com/waknow/dsh-web-icon-indicator/commit/935ad4c90a1ba5e6c969ad21dc52c5fbff516c1e))
* per-instance default icon colour with a similarity warning ([a673c10](https://github.com/waknow/dsh-web-icon-indicator/commit/a673c109b622a074b4d4018caa104cbfb819f149))

### Fixed

* harden host/browser behavior and stop advertising unbakeable settings ([5dddbb8](https://github.com/waknow/dsh-web-icon-indicator/commit/5dddbb87c387c8e85785c1d298453919213492d9))
* repaint favicon instantly when the tab becomes visible ([cd5dfaf](https://github.com/waknow/dsh-web-icon-indicator/commit/cd5dfafdd79f330f775ea35a0a9163ad7ed838cb))

### Changed

* pin the registration-time route keys and sync the workflow docs ([de370c5](https://github.com/waknow/dsh-web-icon-indicator/commit/de370c54d3b0777d028bd6ba871756202496c76d))

## [0.4.2](https://github.com/waknow/dsh-web-icon-indicator/compare/v0.4.1...v0.4.2) (2026-09-07)

### Fixed

* offline-safe restore keeps the tab icon alive when the DSH host stops ([217f741](https://github.com/waknow/dsh-web-icon-indicator/commit/217f7412bc7f1e2214bd50877b542e5d49257fd4))

## [0.4.1](https://github.com/waknow/dsh-web-icon-indicator/compare/v0.4.0...v0.4.1) (2026-09-04)

### Added

* add marketplace screenshots.json and ship it in the npm tarball ([8efb5e7](https://github.com/waknow/dsh-web-icon-indicator/commit/8efb5e752c2759681bfbf78b9ccd8650d1f6973a))
* declare DSH host requirement via engines.dsh ([ec1be5c](https://github.com/waknow/dsh-web-icon-indicator/commit/ec1be5c6723a1237c68acc317bd26580fd06d9d0))

### Changed

* document declaring/updating the DSH host requirement (engines.dsh) ([fb568b7](https://github.com/waknow/dsh-web-icon-indicator/commit/fb568b71362b4931712240087213845cfb3b76ee))

## [0.4.0](https://github.com/waknow/dsh-web-icon-indicator/compare/v0.3.1...v0.4.0) (2026-09-04)

### Added

* support DSH 0.1.2 settings service and configuration card ([de3019e](https://github.com/waknow/dsh-web-icon-indicator/commit/de3019e347fdbd3a512604a8377adc7523305730))

### Changed

* auto-create GitHub Release after successful npm publish ([02d98e3](https://github.com/waknow/dsh-web-icon-indicator/commit/02d98e3db9f83013a3e7667c6a0848efecb8ef37))
* note DSH 0.1.2 support and add a version-support banner ([cd42d2c](https://github.com/waknow/dsh-web-icon-indicator/commit/cd42d2c5b5650800e3620c5806b1b4ac2b25c84f))

## [0.3.1](https://github.com/waknow/dsh-web-icon-indicator/compare/v0.3.0...v0.3.1) (2026-09-02)

### Fixed

* keep asking icon alive while agent is still running ([f9f4a08](https://github.com/waknow/dsh-web-icon-indicator/commit/f9f4a08c452549f43d379c4f7ddf8525f8674a56))

### Changed

* add multi-agent count visualization to READMEs ([4326456](https://github.com/waknow/dsh-web-icon-indicator/commit/4326456d60f4f90bab16a3424f91b9550e25da8a))

## [0.3.0](https://github.com/waknow/dsh-web-icon-indicator/compare/v0.2.3...v0.3.0) (2026-08-31)

### Added

* show full-frame active count while multiple agents run ([d287620](https://github.com/waknow/dsh-web-icon-indicator/commit/d287620a6d66a6aa0b4ce8580adad77908ecdaab))

### Changed

* add npm version/downloads/license badges to both READMEs ([e3dd298](https://github.com/waknow/dsh-web-icon-indicator/commit/e3dd29806413ea5f33dd36077caa340c24e8c70c))
* document automated release flow with commit-and-tag-version ([1754216](https://github.com/waknow/dsh-web-icon-indicator/commit/1754216c32003a722f619935ebf0ab1a402887f1))

## [0.2.3](https://github.com/waknow/dsh-web-icon-indicator/compare/v0.2.2...v0.2.3) (2026-08-24)

### Changed

* add CHANGELOG.md with release history; link it from READMEs ([262730c](https://github.com/waknow/dsh-web-icon-indicator/commit/262730c83449b36fa60442204b3362d8a8b43e8f))

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