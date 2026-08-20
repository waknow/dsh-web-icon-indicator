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
*     effectSpeedMs: 900
*     colors:
*       idle: '#1a1a1a'
*       running: '#FACC15'
*       asking: '#E5484D'
*       done: '#22A06B'
*     effects:
*       idle: static
*       running: static
*       asking: blink
*       done: static
*     blinkColor: '#FACC15'
* ```
*/

/** Per-state animation effect. `blink` swaps between the state color and
 * `blinkColor` each `askingBlinkMs`; the continuous effects (`breath`,
 * `rainbow`, `heartbeat`, `bounce`) cycle once per `effectSpeedMs`. */
export type DshWebIconEffect =
  | "static"
  | "blink"
  | "breath"
  | "rainbow"
  | "heartbeat"
  | "bounce";

export interface DshWebIconIndicatorConfig {
  /**
   * Absolute path to the directory holding the single `base.svg` template.
   * Defaults to `<package>/icons/`.
   */
  iconsDir?: string;
  /** Status JSON endpoint the browser polls. Default `/dsh-web-icon-status.json`. */
  statusPath?: string;
  /** URL prefix where `base.svg` is served. Default `/dsh-web-icon-indicator`. */
  iconPathPrefix?: string;
  /** Minimum visibility of the asking state in milliseconds. Default 3500. */
  askingHoldMs?: number;
  /** Frame interval for the `blink` effect in milliseconds. Default 400. */
  askingBlinkMs?: number;
  /** Time the done state stays before falling back to idle, in milliseconds. Default 5000. */
  doneHoldMs?: number;
  /** Cycle length for the continuous effects (breath/rainbow/heartbeat/bounce), ms. Default 1200. */
  effectSpeedMs?: number;
  /** Per-state fill color (hex). Partial maps merge over the defaults. */
  colors?: Partial<Record<"idle" | "running" | "asking" | "done", string>>;
  /** Per-state animation effect. Partial maps merge over the defaults. */
  effects?: Partial<Record<"idle" | "running" | "asking" | "done", DshWebIconEffect>>;
  /** Second color of a `blink` effect (hex). Default the `running` color. */
  blinkColor?: string;
}

export interface DshWebIconIndicatorAggregate {
  /** Highest-priority state across all live sessions. */
  state: "idle" | "running" | "asking" | "done";
  /** Epoch millis when that aggregate state was first entered. */
  since: number;
}

export default function apply(ctx: unknown): void;
export {};
