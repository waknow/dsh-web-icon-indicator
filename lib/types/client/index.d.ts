/**
 * Browser half of dsh-web-icon-indicator (dsh.client bundle).
 *
 * Registers one configuration page and serves both host generations from one
 * bundle. Modern (DSH ≥ 0.1.7): `plugins.bundle.config` keyed by the bundle
 * package name `dsh-web-icon-indicator`, so the bundle page a Plugins-list card
 * opens renders the form directly; a host that declares only
 * `plugins.row.config` (no released host does) gets that slot instead, keyed
 * `dsh-web-icon-indicator#dsh-web-icon-indicator` — never both. Either binds
 * through `configForms` on ≥ 0.1.7 or `settingsScope` on 0.1.6-alpha.2 (which
 * already renders the bundle slot). Legacy (DSH ≤ 0.1.6-alpha.1):
 * `settings.plugin.item`, keyed by the legacy `web-icon-indicator` namespace,
 * bound through `settingsScope`.
 *
 * Neither settings provider appears in `inject`: both are read weakly at render
 * time, so the fiber activates on either line.
 */

/**
 * Cordis services this browser plugin injects. Only the two services every
 * host generation provides; the settings providers are optional weak reads.
 */
export declare const inject: readonly ["slots", "locale"];

/** Mount the settings page on whichever host generation is running. */
export declare function apply(ctx: unknown): void;
