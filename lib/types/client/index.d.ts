/**
 * Browser half of dsh-web-icon-indicator (dsh.client bundle).
 *
 * Registers one card into the shared plugin-configuration surface
 * (`settings.plugin.item` slot, keyed by the `web-icon-indicator` settings
 * namespace). The card is inert unless the host serves the namespace, which
 * the dispatching tab (`dsh-client-ui-settings-plugins`) checks for us.
 */

/** Cordis services this browser plugin injects. */
export declare const inject: readonly ["slots", "settingsScope", "locale"];

/** Mount the settings card for the `web-icon-indicator` namespace. */
export declare function apply(ctx: unknown): void;
