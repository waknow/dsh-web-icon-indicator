# Changelog

All notable changes to **dsh-web-icon-indicator** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

* asking pin can no longer lose its release timer when a second
  `ask_user_question` pre-execute lands during a re-arm (the stored handle was
  cancelled unconditionally, including the one being re-armed)
* `statusPath` / `iconPathPrefix` are no longer part of the settings schema: they
  are baked into the route table and the injected script at registration time, so
  a settings-document edit could never be honored and would leave the tab polling
  a path the server does not serve
* browser requests are deadline-bounded (`AbortController`, 8 s) so a hung fetch
  can no longer freeze the poll chain or the `base.svg` load
* the full-frame count block renders even when `base.svg` is unavailable — only
  the whale path waits for the template
* `npm test` now works from the published tarball (`test/` ships; the repo-only
  `demo/badge.html` checks skip gracefully)

### Changed

* the pending-approval fold reads the session log incrementally (per-agent
  `snapshotEvents(fromSeq)` cursor) instead of cloning and deep-freezing the
  whole log on every 1 s status poll
* the settings card saves through one atomic `scope.mutate` (single revision
  fence, validation, persistence and recovery read) instead of N field writes
* frame data URIs are memoized per fill for `static` / `blink` / `breath` and the
  geometric effects, so the 3.6 kB base template is no longer re-encoded on every
  animation frame (`rainbow` stays uncached — its fill changes every frame)
* `resolveConfig` ignores `undefined` values instead of letting them shadow a
  `DEFAULTS` entry
* dropped the unused `sandboxPolicy` injection; documented the fixed 1 s poll
  interval; GitHub Pages workflow actions bumped to match `publish.yml`
* test suite grew from 87 to 137 checks: browser-half smoke test for
  `lib/client.js` (loader contract, slot registration, card render, atomic save,
  reset) plus coverage for `heartbeat` / `bounce` / `breath`, hidden-tab
  self-heal, count-block-without-template and abort recovery

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