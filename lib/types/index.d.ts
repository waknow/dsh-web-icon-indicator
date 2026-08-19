/**
* Public configuration surface for the dsh-web-icon-indicator host plugin.
*
* All keys are optional; the plugin falls back to sane defaults baked into
* `lib/index.js`. Pass this object from your `cordis.yml` row:
*
* ```yaml
* - id: dsh-web-icon-indicator
*   name: 'dsh-web-icon-indicator'
*   config:
*     askingBlinkMs: 320
*     doneHoldMs: 4000
*     iconsDir: /opt/dsh/icon-indicator-icons
* ```
*/
export interface DshWebIconIndicatorConfig {
  /**
   * Absolute path to the directory holding `idle.svg`, `running.svg`,
   * `asking.svg`, and `done.svg`. Defaults to `<package>/icons/`.
   */
  iconsDir?: string;
  /** Status JSON endpoint the browser polls. Default `/dsh-web-icon-status.json`. */
  statusPath?: string;
  /** URL prefix where the four SVGs are served. Default `/dsh-web-icon-indicator`. */
  iconPathPrefix?: string;
  /** Minimum visibility of the asking icon in milliseconds. Default 3500. */
  askingHoldMs?: number;
  /** Yellow/red switch interval for the asking blink in milliseconds. Default 400. */
  askingBlinkMs?: number;
  /** Time the done icon stays before falling back to idle, in milliseconds. Default 5000. */
  doneHoldMs?: number;
}

export interface DshWebIconIndicatorAggregate {
  /** Highest-priority state across all live sessions. */
  state: "idle" | "running" | "asking" | "done";
  /** Epoch millis when that aggregate state was first entered. */
  since: number;
}

export default function apply(ctx: unknown): void;
export {};