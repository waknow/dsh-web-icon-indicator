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
*     askingHoldMs: 3500
*     doneHoldMs: 5000
*     states:
*       idle:    { effect: static, colors: ['#1a1a1a'] }
*       running: { effect: static, colors: ['#FACC15'] }
*       asking:  { effect: blink,  colors: ['#E5484D', '#FACC15'], speed: 400 }
*       done:    { effect: heartbeat, colors: ['#22A06B'] }
* ```
*
* The same surface is registered with the DSH settings service under the
* `web-icon-indicator` namespace (schemastery schema in `lib/index.js`): it is
* validated, persisted into the profile's `settings.yaml`, and editable from
* 设置 → 插件 → 插件配置 through the browser half (`./client`). While no
* settings service is composed, the plugin reads the composition entry only.
*/

/** Per-state animation effect. */
export type DshWebIconEffect =
  | "static"
  | "blink"
  | "breath"
  | "rainbow"
  | "heartbeat"
  | "bounce";

/** Visual config for a single state. */
export interface DshWebIconStateConfig {
  /** Animation effect for this state. */
  effect?: DshWebIconEffect;
  /**
   * Fill colors for this state, as an ARRAY (so multi-color effects like
   * `blink` / `breath` / `rainbow` can use more than one color):
   * - `colors[0]` is the primary color (used by every effect).
   * - `blink` toggles `colors[0]` ⇄ `colors[1]` (a darker second color is
   *   derived when `colors[1]` is omitted).
   * - `breath` breathes between `colors[0]` and `colors[1]` (derived if absent).
   * - `rainbow` uses only `colors[0]` as the starting hue, then cycles the wheel.
   * - `static` / `heartbeat` / `bounce` use `colors[0]`.
   */
  colors?: string[];
  /** Per-state cycle length in ms (also the `blink` toggle interval). Default 1200. */
  speed?: number;
}

export type DshWebIconStateName = "idle" | "running" | "asking" | "done";

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
  /** Time the done state stays before falling back to idle, in milliseconds. Default 5000. */
  doneHoldMs?: number;
  /** Per-state visual config. Each entry is shallow-merged over its default. */
  states?: Partial<Record<DshWebIconStateName, DshWebIconStateConfig>>;
}

export interface DshWebIconIndicatorAggregate {
  /** Highest-priority state across all live sessions. */
  state: DshWebIconStateName;
  /** Epoch millis when that aggregate state was first entered. */
  since: number;
  /**
   * Current per-state visual config, echoed by the status endpoint so the
   * injected browser script can apply a settings save within ~1 s (no tab
   * reload). Added in 0.2.x; older browser bundles ignore it.
   */
  states: Partial<Record<DshWebIconStateName, DshWebIconStateConfig>>;
}

/**
 * Cordis plugin entry: `{ name, inject, config, apply, SETTINGS_NAMESPACE,
 * CONFIG_SCHEMA }`. Mount once per profile through the bundle patch
 * (`cordis.patch.yml`), never as a session-scoped agent preset.
 */
declare const plugin: {
  name: "dsh-web-icon-indicator";
  inject: readonly ["webServer", "timer", "agents", "fs", "sandboxPolicy"];
  config: DshWebIconIndicatorConfig;
  apply(ctx: unknown): void;
  /** Settings namespace carrying the config (`web-icon-indicator`). */
  SETTINGS_NAMESPACE: string;
  /** Schemastery schema validating the config surface. */
  CONFIG_SCHEMA: unknown;
};

export default plugin;
export {};
