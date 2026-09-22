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
*     defaultColor: '#5B8DEF'   # per-instance default icon color
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
  /**
   * Status JSON endpoint the browser polls. Default `/dsh-web-icon-status.json`.
   *
   * **Registration-time:** set it in the composition entry only. The route
   * table and the injected script are built when the plugin mounts, so this key
   * is intentionally absent from the settings schema (`settings.yaml`) — a
   * settings-document change could never be honored and would point the browser
   * at a path the server does not serve.
   */
  statusPath?: string;
  /**
   * URL prefix where `base.svg` is served. Default `/dsh-web-icon-indicator`.
   *
   * **Registration-time:** set it in the composition entry only — see
   * {@link statusPath}.
   */
  iconPathPrefix?: string;
  /** Minimum visibility of the asking state in milliseconds. Default 3500. */
  askingHoldMs?: number;
  /** Time the done state stays before falling back to idle, in milliseconds. Default 5000. */
  doneHoldMs?: number;
  /**
   * Default icon color — the idle whale's primary color, as `#rgb` / `#rrggbb`.
   * Absent keeps the idle state's own `colors[0]` (the behavior before this key
   * existed). Give each DSH instance a different value to tell their browser
   * tabs apart: it is per instance (profile / `settings.yaml`), not per tab.
   *
   * Folded into `states.idle.colors[0]` at resolve time, so an idle entry that
   * only needs its default is untouched. This is the **only** idle knob the
   * settings card offers: idle paints one color and takes no animation, so it
   * gets no per-state row (no effect / colors / cycle). A value perceptually too
   * close to another state's color raises an advisory warning (settings card,
   * host log, and {@link DshWebIconIndicatorAggregate.warnings}) but is still
   * applied; a malformed value is ignored and reported.
   */
  defaultColor?: string;
  /**
   * Per-state visual config. Each entry is shallow-merged over its default.
   *
   * `idle` is not editable from the settings card (its color is
   * {@link defaultColor}); a `states.idle` entry arriving from the composition
   * entry or a hand-written `settings.yaml` is still honored for backward
   * compatibility — including an idle `effect` and a second color.
   */
  states?: Partial<Record<DshWebIconStateName, DshWebIconStateConfig>>;
}

export interface DshWebIconIndicatorAggregate {
  /** Highest-priority state across all live sessions. */
  state: DshWebIconStateName;
  /** Epoch millis when that aggregate state was first entered. */
  since: number;
  /**
   * Number of non-idle agents (asking / running / done). While it is > 1 the
   * favicon shows this count as a full-frame number block (in the aggregate
   * state's color/effect) instead of the whale; with 0–1 active agents the
   * whale is drawn. Echoed by the status endpoint. Added in 0.3.x; older
   * browser bundles ignore it.
   */
  active: number;
  /**
   * Current per-state visual config, echoed by the status endpoint so the
   * injected browser script can apply a settings save within ~1 s (no tab
   * reload). Added in 0.2.x; older browser bundles ignore it.
   */
  states: Partial<Record<DshWebIconStateName, DshWebIconStateConfig>>;
  /**
   * Effective default icon color (normalized to lowercase 6-digit hex), or
   * `null` when none is configured — the status payload always carries the key.
   * Added with the `defaultColor` key; older browser bundles ignore the extra
   * field.
   */
  defaultColor: string | null;
  /**
   * Advisory default-color warnings, echoed so any surface can show them.
   * Added with the `defaultColor` key; older browser bundles ignore the key.
   */
  warnings: DshWebIconColorWarning[];
}

/**
 * A perceptual-distance warning about the effective default icon color.
 * Advisory only — the configured value is still applied.
 */
export interface DshWebIconColorWarning {
  /** `color-too-close` | `rainbow-overlap` | `invalid-color`. */
  code: "color-too-close" | "rainbow-overlap" | "invalid-color";
  /** The other state involved (absent for `invalid-color`). */
  state?: DshWebIconStateName;
  /** The effective default color the warning is about. */
  base?: string;
  /** The colliding state color (absent for `rainbow-overlap` / `invalid-color`). */
  color?: string;
  /** CIE76 ΔE between `base` and `color`. */
  deltaE?: number;
  /** `strong` below ΔE 12; `warn` below ΔE 25. */
  level?: "strong" | "warn";
  /** The rejected raw value (only for `invalid-color`). */
  value?: string;
}

/**
 * Cordis plugin entry: `{ name, inject, Config, apply, SETTINGS_NAMESPACE,
 * LEGACY_SETTINGS_NAMESPACE, CONFIG_SCHEMA }`. Mount once per profile through
 * the bundle patch (`cordis.patch.yml`), never as a session-scoped agent
 * preset.
 *
 * `Config` is the schemastery schema the loader validates the profile row
 * against and the host settings service projects into its live form
 * (`.volatile()` fields only); this entry has no `config` object. The same
 * bundle serves the legacy host line through a feature-detected
 * `settings.installSection` registration.
 */
declare const plugin: {
  name: "dsh-web-icon-indicator";
  inject: readonly ["webServer", "timer", "agents", "fs"];
  Config: unknown;
  apply(ctx: unknown, config?: unknown): void;
  /** Settings namespace on DSH ≥ 0.1.7 (= the profile entry id). */
  SETTINGS_NAMESPACE: string;
  /** Settings namespace on the legacy settings service (DSH ≤ 0.1.6-alpha.1). */
  LEGACY_SETTINGS_NAMESPACE: string;
  /** Schemastery schema validating the config surface. */
  CONFIG_SCHEMA: unknown;
};

export default plugin;
export {};
