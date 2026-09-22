/**
 * Browser half of dsh-web-icon-indicator (dsh.client bundle).
 *
 * Registers one configuration page and serves both host generations from one
 * bundle: `plugins.row.config` (keyed `dsh-web-icon-indicator#dsh-web-icon-indicator`)
 * bound through the modern `configForms` service on DSH ≥ 0.1.7, and
 * `settings.plugin.item` (keyed by the legacy `web-icon-indicator` namespace)
 * bound through the legacy `settingsScope` service on DSH ≤ 0.1.6-alpha.1.
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
