/**
 * Browser half of dsh-web-icon-indicator (dsh.client bundle, ModuleLoader
 * factory format — hand-written, no build step).
 *
 * Registers one configuration page and serves BOTH host generations from one
 * bundle:
 *
 * - DSH ≥ 0.1.7 (modern): page slot `plugins.row.config` keyed
 *   `<package name>#<row id>`, bound to the profile-entry settings namespace
 *   through `configForms` (`ctx.configForms.get(entryId)`).
 * - DSH ≤ 0.1.6-alpha.1 (legacy): page slot `settings.plugin.item` keyed by the
 *   legacy `web-icon-indicator` namespace, bound through `settingsScope`.
 *
 * Neither settings provider is declared in `inject` — both are read weakly at
 * render time (`resolveScope`) and the slot registration is attempted for both
 * names (`slots.inject` is a no-op for a slot the host never declares). The
 * card body is generation-agnostic: the modern controller and the legacy scope
 * expose the same snapshot + `mutate` / `unset` face. The card stages edits
 * locally and writes them through that scope (validated, revision-fenced, and
 * persisted host-side).
 *
 * The page is inert on deployments that do not compose the host plugin: on the
 * modern line registration is gated on `configForms.whileServed`, and the
 * legacy tab only dispatches namespaces the host actually serves.
 */
window.__ModuleLoader__.load({
  id: "dsh-web-icon-indicator",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");
    var useState = React.useState;
    var useSyncExternalStore = React.useSyncExternalStore;
    var createElement = React.createElement;
    // Official UI primitives (same source the shell's own plugin cards use,
    // e.g. dsh-client-ui-settings-plugins): the standard collapse chevron.
    var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    // The primitives icon set moved from size-suffixed names (`…Outline14`) to
    // stroke-weight names (`…OutlineRegular` / `…OutlineMedium`); fall back so
    // one bundle keeps working on both host lines.
    var ChevronDownIcon = primitives.IconChevronDownOutlineRegular || primitives.IconChevronDownOutline14;

    /**
     * Settings namespace owned by the host plugin on the MODERN host line
     * (DSH ≥ 0.1.7): the settings service keys every form by the profile entry
     * id, and the bundle patch in `cordis.patch.yml` inserts exactly one row
     * with this id. Keep it in sync with `SETTINGS_NAMESPACE` in lib/index.js
     * and the row id in the patch.
     */
    var NS = "dsh-web-icon-indicator";
    /**
     * Settings namespace the LEGACY host line (DSH ≤ 0.1.6-alpha.1) serves: the
     * plugin registers it through `settings.installSection`, and this half binds
     * the legacy `settingsScope` to the same string. Also the key the legacy
     * settings tab dispatches in `settings.plugin.item`.
     */
    var LEGACY_NS = "web-icon-indicator";
    /** `plugins.row.config` key: `<bundle package name>#<row id as the patch declares it>`. */
    var ROW_KEY = "dsh-web-icon-indicator#dsh-web-icon-indicator";
    var LOCALE = "dsh-web-icon-indicator";
    var STATE_NAMES = ["idle", "running", "asking", "done"];
    var EFFECT_NAMES = ["static", "blink", "breath", "rainbow", "heartbeat", "bounce"];
    var TOP_NUMBERS = ["askingHoldMs", "doneHoldMs"];
    // The states that get a detail row in the card. Idle is deliberately NOT
    // one of them: its single color is the top-level "default color" field and
    // it takes no animation, so it has no effect / colors / cycle UI at all.
    // The similarity warning compares the default color against exactly these
    // states (a new state added here joins the check automatically).
    var EDITABLE_STATES = STATE_NAMES.filter(function (name) { return name !== "idle"; });
    // Colors an effect actually uses: `blink` / `breath` read a second color,
    // `rainbow` only seeds its starting hue from colors[0] and is otherwise not
    // configurable, everything else paints colors[0] alone. The card shows — and
    // saves — only this many colors, so a state can never appear to have a
    // second color its effect ignores.
    var EFFECT_COLOR_COUNT = { static: 1, blink: 2, breath: 2, rainbow: 1, heartbeat: 1, bounce: 1 };
    // Rainbow chip artwork. The wheel is a conic gradient: at 14px a hue ring
    // reads as "every colour", where side-by-side stripes read as a barcode. The
    // diagonal ramp sits in `background` first so an engine without
    // conic-gradient support keeps a (dropped) gradient instead of an empty chip.
    var RAINBOW_RAMP = "linear-gradient(135deg, #ff5d5d, #ffb257, #ffe066, #6fe08a, #59b7ff, #9b7bff, #ff7ad9)";
    var RAINBOW_WHEEL = "conic-gradient(from 0deg, #ff0000, #ffb800, #ffff00, #4ade80, #22d3ee, #3b82f6, #a855f7, #ff00cc, #ff0000)";
    // Built-in per-state config, mirrored from DEFAULTS.states in lib/index.js.
    // The host ALWAYS merges these per state (resolveConfig), while the settings
    // scope's `states` dict can be PARTIAL — the card itself writes only the
    // states it drafted, and the schema default only applies while the whole key
    // is absent. Without this table the card would show "static / no colours" for
    // a state whose icon is actually blinking, and a colour-only edit would then
    // save that wrong effect over the user's config.
    var DEFAULT_STATES = {
      idle: { effect: "static", colors: ["#1a1a1a"] },
      running: { effect: "static", colors: ["#FACC15"] },
      asking: { effect: "blink", colors: ["#E5484D", "#FACC15"], speed: 400 },
      done: { effect: "static", colors: ["#22A06B"] },
    };
    /** Built-in colours of a state (mirrors DEFAULTS.states[name].colors). */
    function defaultColorsOf(name) {
      return (DEFAULT_STATES[name] && DEFAULT_STATES[name].colors) || ["#1a1a1a"];
    }
    /** Built-in speed of a state, when it ships one (only `asking` does). */
    function defaultSpeedOf(name) {
      return DEFAULT_STATES[name] && typeof DEFAULT_STATES[name].speed === "number" ? DEFAULT_STATES[name].speed : null;
    }
    // Localized label key per effect identifier (value stays the identifier).
    var EFFECT_LABEL_KEYS = {
      static: "effectStatic",
      blink: "effectBlink",
      breath: "effectBreath",
      rainbow: "effectRainbow",
      heartbeat: "effectHeartbeat",
      bounce: "effectBounce",
    };

    /**
     * Cordis fiber services this browser plugin injects.
     *
     * Deliberately only the two services every host line provides: the settings
     * provider itself is read weakly at render time (`resolveScope`), so one
     * bundle serves both the modern `configForms` line (DSH ≥ 0.1.7) and the
     * legacy `settingsScope` line (≤ 0.1.6-alpha.1). A hard `inject` on either
     * name would leave the fiber un-activated on the other line, which is what
     * broke the 0.5.x bundle on 0.1.7.
     */
    var inject = ["slots", "locale"];

    // ---------------------------------------------------------------------------
    // Locale copy
    // ---------------------------------------------------------------------------
    var en = {
      title: "Favicon indicator",
      description: "How the browser tab favicon reflects session state.",
      expand: "Show settings",
      collapse: "Hide settings",
      askingHoldMs: "Asking hold (ms)",
      askingHoldMsHint: "Minimum visibility of the asking icon before it settles.",
      doneHoldMs: "Done hold (ms)",
      doneHoldMsHint: "How long the done icon stays before returning to idle.",
      defaultColor: "Default icon color",
      defaultColorHint: "Color of the idle whale — idle paints one color and never animates, so this is its only setting. Give each DSH instance a different value to tell their browser tabs apart; blank falls back to the idle state's own color.",
      statesHint: "Detailed configuration for the states that animate or carry a signal. Idle is not listed: it uses the default icon color above.",
      palette: "Palette",
      defaultColorWarn: "Too close to the {state} color {color} (ΔE {de}) — the two are easy to confuse at tab size.",
      defaultColorWarnStrong: "Nearly identical to the {state} color {color} (ΔE {de}).",
      defaultColorWarnRainbow: "The {state} state uses the rainbow effect, which sweeps every hue — any colored default will collide with it at some phase.",
      stateIdle: "Idle",
      stateRunning: "Running",
      stateAsking: "Asking",
      stateDone: "Done",
      effect: "Effect",
      effectHint: "Animation for this state.",
      colors: "Colors",
      colorsHint: "Click a chip to pick that color — the hex value lives in the picker. Only the colors this effect uses are listed.",
      rainbowHint: "The rainbow effect sweeps every hue; the chip beside the wheel only sets its starting hue.",
      speed: "Cycle (ms)",
      speedHint: "Per-state cycle length; blank falls back to the built-in default for that effect. Static states have no cycle.",
      effectStatic: "Static",
      effectBlink: "Blink",
      effectBreath: "Breath",
      effectRainbow: "Rainbow",
      effectHeartbeat: "Heartbeat",
      effectBounce: "Bounce",
      editColor: "Pick color",
      addColor: "Add a second color",
      removeColor: "Remove this color",
      clearOverride: "Clear override",
      unsaved: "Unsaved",
      readOnly: "This deployment stores settings read-only.",
      save: "Save",
      saving: "Saving…",
      discard: "Discard",
      resetAll: "Reset to defaults",
      saveFailed: "The deployment did not accept these values; they were left for you to correct.",
      invalidNumber: "Enter a number, or leave blank to use the default.",
      invalidColors: "Enter hex colors like #FACC15, separated by commas.",
    };
    var zh = {
      title: "标签页图标指示器",
      description: "浏览器标签页图标如何反映会话状态。",
      expand: "展开设置",
      collapse: "收起设置",
      askingHoldMs: "提问驻留（毫秒）",
      askingHoldMsHint: "提问图标的最短可见时长。",
      doneHoldMs: "完成驻留（毫秒）",
      doneHoldMsHint: "完成图标停留多久后回到待机。",
      defaultColor: "默认图标颜色",
      defaultColorHint: "待机鲸鱼的颜色——待机只画一种颜色、不做动画，所以这就是它唯一的设置项。每个 DSH 实例设成不同颜色即可区分各自的浏览器标签页；留空则沿用待机状态自己的颜色。",
      statesHint: "需要动画或承载状态信号的状态的详细配置。待机不在此列：它使用上方的默认图标颜色。",
      palette: "配色一览",
      defaultColorWarn: "与「{state}」的颜色 {color} 过于接近（ΔE {de}），在标签页尺寸下容易混淆。",
      defaultColorWarnStrong: "与「{state}」的颜色 {color} 几乎相同（ΔE {de}）。",
      defaultColorWarnRainbow: "「{state}」状态使用彩虹特效，会扫过所有色相，任何有色默认色都会在某些相位与其撞色。",
      stateIdle: "待机",
      stateRunning: "运行中",
      stateAsking: "提问",
      stateDone: "完成",
      effect: "特效",
      effectHint: "该状态的动画效果。",
      colors: "颜色",
      colorsHint: "点击色块即可选色（十六进制值在取色弹窗里）；这里只列出当前特效实际会用到的颜色。",
      rainbowHint: "彩虹特效会扫过所有色相；色环旁的色块只决定起始色相。",
      speed: "周期（毫秒）",
      speedHint: "该状态的动画周期；留空则回退到该特效的内置默认值。静态状态无周期。",
      effectStatic: "静态",
      effectBlink: "闪烁",
      effectBreath: "呼吸",
      effectRainbow: "彩虹",
      effectHeartbeat: "心跳",
      effectBounce: "弹跳",
      editColor: "选择颜色",
      addColor: "添加第二色",
      removeColor: "删除该颜色",
      clearOverride: "清除覆盖",
      unsaved: "未保存",
      readOnly: "本部署的设置为只读。",
      save: "保存",
      saving: "保存中…",
      discard: "放弃修改",
      resetAll: "恢复默认",
      saveFailed: "本部署没有接受这些值，已保留供你修改。",
      invalidNumber: "请填数字；留空表示使用默认值。",
      invalidColors: "请输入 #FACC15 形式的十六进制颜色，用逗号分隔。",
    };

    // ---------------------------------------------------------------------------
    // Small field primitives (inline styles on the shell's design tokens)
    // ---------------------------------------------------------------------------
    var styles = {
      card: { border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-3)", borderRadius: 12, padding: "14px 16px", margin: 0 },
      header: { appearance: "none", width: "100%", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer", background: "0 0", border: "0", borderRadius: 12, display: "flex", alignItems: "center", gap: 12, padding: 0 },
      body: { borderTop: "1px solid var(--dsw-alias-border-l2)", marginTop: 12, paddingTop: 4 },
      headText: { display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 },
      name: { display: "block", color: "var(--dsw-alias-label-primary)", fontSize: 15, fontWeight: 600, lineHeight: "1.4", margin: 0 },
      description: { display: "block", color: "var(--dsw-alias-label-tertiary)", fontSize: 13, lineHeight: "1.5", margin: 0 },
      chevron: { color: "var(--dsw-alias-label-tertiary)", flex: "none", fontSize: 14, lineHeight: 1, transition: "transform .16s" },
      chevronOpen: { transform: "rotate(180deg)" },
      field: { display: "flex", flexDirection: "column", gap: 6, padding: "12px 0" },
      fieldBorder: { borderTop: "1px solid var(--dsw-alias-border-l2)" },
      label: { color: "var(--dsw-alias-label-primary)", fontSize: 13, fontWeight: 500, lineHeight: "1.5" },
      hint: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, lineHeight: "1.5", margin: 0 },
      invalidText: { color: "var(--dsw-alias-label-error)", fontSize: 12, lineHeight: "1.5", margin: 0 },
      select: { border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-3)", height: 34, borderRadius: 8, padding: "0 8px", fontSize: 13, fontFamily: "inherit", color: "var(--dsw-alias-label-primary)" },
      statesBlock: { borderTop: "1px solid var(--dsw-alias-border-l2)", marginTop: 4, paddingTop: 4 },
      statesHint: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, lineHeight: "1.5", margin: 0, padding: "12px 0 4px" },
      chipGroup: { display: "inline-flex", alignItems: "center", gap: 2, flex: "none" },
      chipRemove: { appearance: "none", border: 0, background: "0 0", color: "var(--dsw-alias-label-tertiary)", cursor: "pointer", fontSize: 13, lineHeight: "14px", padding: "0 2px" },
      chipClear: { appearance: "none", border: 0, background: "0 0", color: "var(--dsw-alias-label-secondary)", cursor: "pointer", fontSize: 12, lineHeight: "14px", padding: "0 0 0 6px", textDecoration: "underline" },
      chipBox: { position: "relative", display: "inline-block", boxSizing: "border-box", width: 14, height: 14, borderRadius: 4, border: "1px solid var(--dsw-alias-border-l2)", overflow: "hidden", verticalAlign: "middle", flex: "none", lineHeight: 0 },
      swatchAdd: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: 4, border: "1px dashed var(--dsw-alias-border-l2)", color: "var(--dsw-alias-label-tertiary)", fontSize: 11, lineHeight: 1 },
      swatchEmpty: { background: "transparent", borderStyle: "dashed" },
      summary: { flex: 1, minWidth: 0, marginLeft: 8, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", color: "var(--dsw-alias-label-tertiary)", fontSize: 12, lineHeight: "24px" },
      statePanel: { padding: "2px 0 12px 22px" },
      swatches: { display: "inline-flex", alignItems: "center", gap: 4, flex: "none" },
      swatch: { display: "inline-block", width: 14, height: 14, borderRadius: 4, border: "1px solid var(--dsw-alias-border-l2)" },
      swatchLabel: { display: "inline-flex", position: "relative", flex: "none", width: 14, height: 14, borderRadius: 4, overflow: "hidden", lineHeight: 0, cursor: "pointer" },
      // The native color input is only the hit target: it must be an invisible
      // ABSOLUTE overlay filling its 14x14 label. Without this style the browser
      // renders its UA color widget at its own size, which overflows the input
      // row (the swatch next to a text field then shows up as a stray control).
      colorInput: { position: "absolute", top: 0, left: 0, display: "block", width: "100%", height: "100%", margin: 0, padding: 0, border: 0, opacity: 0, appearance: "none", WebkitAppearance: "none", cursor: "pointer" },
      badge: { whiteSpace: "nowrap", background: "var(--dsw-alias-bg-module-platform)", color: "var(--dsw-alias-label-secondary)", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 500, lineHeight: "17px" },
      footer: { borderTop: "1px solid var(--dsw-alias-border-l2)", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, padding: "12px 0 4px" },
      failed: { minWidth: 0, color: "var(--dsw-alias-label-error)", flex: 1, margin: 0, fontSize: 12, lineHeight: "1.5" },
      warnText: { color: "var(--dsw-alias-state-warn-label)", fontSize: 12, lineHeight: "1.5", margin: 0 },
      warnStrongText: { color: "var(--dsw-alias-label-error)", fontSize: 12, lineHeight: "1.5", margin: 0 },
      warnBlock: { display: "flex", flexDirection: "column", gap: 2, paddingTop: 6 },
      paletteRow: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, paddingTop: 2, paddingBottom: 4 },
      paletteItem: { display: "inline-flex", alignItems: "center", gap: 6, color: "var(--dsw-alias-label-tertiary)", fontSize: 12, lineHeight: "16px", whiteSpace: "nowrap" },
    };

    // Layout shim for primitives.Input inside the card: make the wrapper fill
    // the field row and the inner <input> flex. Primitives components carry no
    // CSS-module hooks for us (the bundle has no build step), so one guarded
    // style tag mirrors what the official cards' stylesheets do.
    var FORM_CSS_TAG = "dsh-web-icon-indicator/form.v2.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(FORM_CSS_TAG) + "]") === null) {
      var cssTag = document.createElement("style");
      cssTag.dataset.plugin = "dsh-web-icon-indicator";
      cssTag.dataset.pluginCss = FORM_CSS_TAG;
      cssTag.textContent = ".dsh-wii-input{display:flex;align-items:center;width:100%}.dsh-wii-input>input{flex:1;min-width:0}.dsh-wii-state+.dsh-wii-state{border-top:1px solid var(--dsw-alias-border-l2)}";
      document.head.appendChild(cssTag);
    }

    function fieldStyle(separated) {
      return separated ? Object.assign({}, styles.field, styles.fieldBorder) : styles.field;
    }

    /** Style handed to primitives.Input (spread onto the inner <input>): full width + invalid border. */
    function inputStyle(invalid) {
      return Object.assign({ width: "100%" }, invalid ? { borderColor: "var(--dsw-alias-label-error)" } : {});
    }

    function LabeledField(props) {
      // props: { label, hint, invalidLabel, htmlFor, children }
      return createElement(
        "div",
        { style: fieldStyle(props.separated) },
        createElement("label", { style: styles.label, htmlFor: props.htmlFor }, props.label),
        props.children,
        createElement("p", { style: props.invalid ? styles.invalidText : styles.hint }, props.invalid ? props.invalidLabel : props.hint)
      );
    }

    function ValueInput(props) {
      // props: { id, label, hint, invalidLabel, invalid, separated, disabled, value,
      //          placeholder, numeric, onChange }
      var input = createElement(primitives.Input, {
        id: props.id,
        type: "text",
        inputMode: props.numeric ? "numeric" : void 0,
        className: "dsh-wii-input",
        style: inputStyle(props.invalid),
        disabled: props.disabled,
        value: props.value,
        placeholder: props.placeholder || "",
        onChange: function (event) { props.onChange(event.target.value); },
      });
      return createElement(
        LabeledField,
        { label: props.label, hint: props.hint, invalid: props.invalid, invalidLabel: props.invalidLabel, separated: props.separated, htmlFor: props.id },
        input
      );
    }

    function SelectInput(props) {
      // props: { id, value, options, onChange, disabled }
      // options: array of { value, label } — value stays the identifier, label is localized.
      return createElement(
        "select",
        {
          id: props.id,
          style: styles.select,
          disabled: props.disabled,
          value: props.value,
          onChange: function (event) { props.onChange(event.target.value); },
        },
        props.options.map(function (option) {
          return createElement("option", { key: option.value, value: option.value }, option.label);
        })
      );
    }

    /** Expand a 3-digit hex (#abc) to 6-digit (#aabbcc) for <input type="color">. */
    function to6(hex) {
      var h = String(hex).replace("#", "");
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      return "#" + h;
    }

    /**
     * Chip previewing the rainbow effect: it sweeps every hue, so the chip shows
     * the hue wheel itself. Drawn as a layer inside the padding box (same reason
     * as the color bands: the chip's border is translucent).
     */
    function rainbowChip(key, size) {
      // Always a disc: a hue wheel reads as "every colour" in a circle, and it
      // stays recognisable at 14px in the row header (the colour chips stay
      // rounded squares).
      var box = Object.assign({}, styles.chipBox, { borderRadius: 999 }, size ? { width: size, height: size } : {});
      return createElement(
        "span",
        { key: key, "aria-hidden": "true", style: box },
        createElement("span", {
          style: {
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: "calc(100% + 1px)",
            background: RAINBOW_RAMP,
            backgroundImage: RAINBOW_WHEEL,
          },
        })
      );
    }

    /**
     * One chip previewing a state's colors: the row-header icon slot is a
     * fixed-size box, so a multi-color state (asking is red ⇄ yellow) splits the
     * chip into side-by-side bands separated by a 1px seam.
     *
     * The bands are absolutely positioned layers INSIDE the padding box, not a
     * background gradient: a gradient paints under the chip's translucent border
     * (--dsw-alias-border-l2 is #0000001a) and a hard stop there blends into a
     * stray colour at the edge. Layers never reach the border, so it stays
     * neutral, and the seam keeps the two colors unmistakable.
     */
    function colorChip(colors, key) {
      var list = (colors || []).filter(Boolean);
      if (list.length === 0) list = ["transparent"];
      var bands = list.map(function (color, index) {
        var share = 100 / list.length;
        var last = index === list.length - 1;
        return createElement("span", {
          key: "band" + index,
          style: {
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "calc(" + (index * share) + "% + 0px)",
            // Every band but the last stops 1px short; the last one overflows by
            // 1px so no gap opens at the right edge (the chip clips it).
            width: "calc(" + share + "% " + (last ? "+" : "-") + " 1px)",
            background: color,
          },
        });
      });
      return createElement("span", { key: key, "aria-hidden": "true", style: styles.chipBox }, bands);
    }

    /**
     * Color editing field. Colors are shown as chips ONLY — the card never
     * renders a hex string: clicking a chip opens the native color picker (which
     * is where the hex value is displayed and can be typed) and picking replaces
     * that entry. `canAdd` offers a "+" chip for the effects that read a second
     * color; every entry after the first gets a remove button.
     *
     * props: { id, label, hint, invalidLabel, invalid, separated, disabled,
     *          colors (array; empty = unusable stored value), canAdd, canRemove,
     *          pickLabel, addLabel, removeLabel, clearLabel, onColors(next[]),
     *          onClear }
     */
    function ColorField(props) {
      var list = Array.isArray(props.colors) ? props.colors : [];
      // `rainbow` takes no colour list — just the hue wheel plus the optional
      // starting-hue chip (the browser seeds its sweep from colors[0]).
      if (props.rainbow) {
        var seed = list.length ? list[0] : null;
        return createElement(
          "div",
          { style: fieldStyle(props.separated) },
          createElement("label", { style: styles.label }, props.label),
          createElement(
            "span",
            { style: styles.swatches },
            rainbowChip("rainbow", 20),
            seed === null ? null : createElement(
              "label",
              { key: "seed", style: styles.swatchLabel, title: props.pickLabel, "aria-label": props.pickLabel },
              createElement("input", {
                type: "color",
                style: styles.colorInput,
                value: to6(seed),
                disabled: props.disabled,
                onChange: function (event) { props.onColors([event.target.value]); },
              }),
              createElement("span", { style: Object.assign({}, styles.swatch, { background: seed }) })
            )
          ),
          createElement("p", { style: props.invalid ? styles.invalidText : styles.hint }, props.invalid ? props.invalidLabel : props.hint)
        );
      }
      var chips = [];
      list.forEach(function (color, index) {
        var chip = createElement(
          "label",
          { key: "c" + index, style: styles.swatchLabel, title: props.pickLabel, "aria-label": props.pickLabel },
          createElement("input", {
            type: "color",
            style: styles.colorInput,
            value: to6(color),
            disabled: props.disabled,
            onChange: function (event) {
              var next = list.slice();
              next[index] = event.target.value;
              props.onColors(next);
            },
          }),
          createElement("span", { style: Object.assign({}, styles.swatch, { background: color }) })
        );
        if (!props.canRemove || index === 0) {
          chips.push(chip);
          return;
        }
        chips.push(createElement(
          "span",
          { key: "c" + index, style: styles.chipGroup },
          chip,
          createElement(
            "button",
            {
              type: "button",
              style: styles.chipRemove,
              disabled: props.disabled,
              title: props.removeLabel,
              "aria-label": props.removeLabel,
              onClick: function () {
                var next = list.slice();
                next.splice(index, 1);
                props.onColors(next);
              },
            },
            "×"
          )
        ));
      });
      // A stored value that cannot be parsed (hand-written settings.yaml) gets a
      // single dashed picker chip: picking a color replaces it outright.
      if (chips.length === 0) {
        chips.push(createElement(
          "label",
          { key: "empty", style: styles.swatchLabel, title: props.pickLabel, "aria-label": props.pickLabel },
          createElement("input", {
            type: "color",
            style: styles.colorInput,
            value: to6("#888888"),
            disabled: props.disabled,
            onChange: function (event) { props.onColors([event.target.value]); },
          }),
          createElement("span", { style: Object.assign({}, styles.swatch, styles.swatchEmpty) })
        ));
      }
      if (props.canAdd) {
        // The picker opens on the colour the browser would derive anyway
        // (`frameColor` uses mix(colors[0], black, 0.35) when colors[1] is
        // absent), and an already-present colour is a no-op — confirming the
        // dialog without touching anything must not append a duplicate band.
        var seedColor = list.length ? mixHex(list[0], "#000000", 0.35) : "#888888";
        chips.push(createElement(
          "label",
          { key: "add", style: styles.swatchLabel, title: props.addLabel, "aria-label": props.addLabel },
          createElement("input", {
            type: "color",
            style: styles.colorInput,
            value: to6(seedColor),
            disabled: props.disabled,
            onChange: function (event) {
              var picked = to6(event.target.value).toLowerCase();
              // `#F00` and `#ff0000` are the same colour: a hand-written 3-digit
              // value must not let the picker append an identical second band.
              var known = list.some(function (color) { return to6(color).toLowerCase() === picked; });
              if (known) return;
              props.onColors(list.concat([event.target.value]));
            },
          }),
          createElement("span", { style: styles.swatchAdd }, "+")
        ));
      }
      if (typeof props.onClear === "function") {
        chips.push(createElement(
          "button",
          {
            type: "button",
            style: styles.chipClear,
            disabled: props.disabled,
            title: props.clearLabel,
            "aria-label": props.clearLabel,
            onClick: props.onClear,
          },
          props.clearLabel
        ));
      }
      return createElement(
        "div",
        { style: fieldStyle(props.separated) },
        createElement("label", { style: styles.label }, props.label),
        createElement("span", { style: styles.swatches, role: "group", "aria-label": props.label }, chips),
        createElement("p", { style: props.invalid ? styles.invalidText : styles.hint }, props.invalid ? props.invalidLabel : props.hint)
      );
    }

    // ---------------------------------------------------------------------------
    // Form model
    // ---------------------------------------------------------------------------
    function formatNumber(value) {
      return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
    }

    function formatColors(colors) {
      return Array.isArray(colors) && colors.length > 0 ? colors.join(", ") : "";
    }

    /**
     * Parse a comma/space separated list of #hex colors; null when malformed.
     * All-or-nothing, so it is only used to validate a staged DRAFT (the chips
     * can only produce valid entries). For a stored colours field use
     * parseColorList(), which drops bad entries one by one exactly like the
     * host's resolveConfig does — a single typo must not hide the colours the
     * host still paints.
     */
    function parseColors(text) {
      var parts = String(text).split(/[\s,]+/).filter(function (part) { return part.length > 0; });
      if (parts.length === 0) return null;
      var colors = [];
      for (var i = 0; i < parts.length; i += 1) {
        var candidate = parts[i].trim();
        if (!/^#[0-9a-fA-F]{3,6}$/.test(candidate)) return null;
        colors.push(candidate);
      }
      return colors;
    }

    /**
     * Per-entry parse of a colours field: every valid `#rgb` / `#rrggbb` token
     * survives, malformed entries are dropped. The host's resolveConfig filters
     * the same way, so `["#FF0000","red"]` means "paint #FF0000" on BOTH sides —
     * parseColors() would reject the whole list and make the card reason about a
     * colour the icon never paints.
     */
    function parseColorList(text) {
      return String(text)
        .split(/[\s,]+/)
        .map(function (part) { return part.trim(); })
        .filter(function (part) { return part.length > 0 && isHexColor(part); });
    }

    // ---- perceptual color distance ------------------------------------------
    // CIE76 ΔE in CIELAB plus the fill-candidate logic the host uses for its
    // own similarity check. DELIBERATELY DUPLICATED from lib/index.js: the two
    // halves run in different processes, there is no shared module and no build
    // step (docs/main.js carries a third copy of the color math for the same
    // reason). Keep the thresholds in sync.
    var DEFAULT_COLOR_RX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    /** ΔE below which two colors are practically the same. */
    var SIMILAR_DE_STRONG = 12;
    /** ΔE below which two colors are easily confused at favicon size. */
    var SIMILAR_DE_WARN = 25;
    /** Lab chroma above which a default color collides with a rainbow sweep. */
    var RAINBOW_CHROMA_MIN = 15;

    /** The default-color field accepts only #rgb / #rrggbb. */
    function isHexColor(text) {
      return DEFAULT_COLOR_RX.test(String(text).trim());
    }

    function hexToRgb(hex) {
      var body = String(hex).replace("#", "");
      if (body.length === 3) body = body.charAt(0) + body.charAt(0) + body.charAt(1) + body.charAt(1) + body.charAt(2) + body.charAt(2);
      var n = parseInt(body, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function rgbToHex(r, g, b) {
      return "#" + [r, g, b].map(function (v) {
        var c = Math.max(0, Math.min(255, Math.round(v)));
        return ("0" + c.toString(16)).slice(-2);
      }).join("");
    }

    function mixHex(a, b, t) {
      var ca = hexToRgb(a);
      var cb = hexToRgb(b);
      return rgbToHex(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
    }

    function labOf(hex) {
      var rgb = hexToRgb(hex);
      var lin = function (v) {
        var c = v / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      var r = lin(rgb[0]);
      var g = lin(rgb[1]);
      var b = lin(rgb[2]);
      var x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
      var y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
      var z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
      var f = function (v) { return v > 216 / 24389 ? Math.cbrt(v) : (841 / 108) * v + 4 / 29; };
      var fx = f(x);
      var fy = f(y);
      var fz = f(z);
      return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
    }

    function deltaE(a, b) {
      var la = labOf(a);
      var lb = labOf(b);
      return Math.sqrt(Math.pow(la[0] - lb[0], 2) + Math.pow(la[1] - lb[1], 2) + Math.pow(la[2] - lb[2], 2));
    }

    function labChroma(hex) {
      var l = labOf(hex);
      return Math.sqrt(l[1] * l[1] + l[2] * l[2]);
    }

    function isValidNumber(text, min) {
      var trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      var parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < min) return null;
      return { kind: "set", value: parsed };
    }

    /**
     * Subscribe a React component to the scope's snapshot store. `scope` may be
     * null while the host serves no settings provider for our namespace (or
     * before one appears); the hook count stays identical either way, and a
     * null scope yields a null snapshot that renders nothing.
     */
    function useScopeSnapshot(scope) {
      return useSyncExternalStore(
        function (listener) { return scope ? scope.subscribe(listener) : function () {}; },
        function () { return scope ? scope.getSnapshot() : null; },
        function () { return scope ? scope.getSnapshot() : null; }
      );
    }

    // ---------------------------------------------------------------------------
    // The card
    // ---------------------------------------------------------------------------
    function IconConfigCard(props) {
      var scope = props.scope;
      var t = props.t;
      var snapshot = useScopeSnapshot(scope);
      var ready = snapshot !== null && snapshot.status === "ready" && snapshot.value !== void 0;
      var value = ready ? snapshot.value : null;
      var writable = ready && snapshot.writable !== false;
      var userLayer = ready ? snapshot.user : void 0;
      var userHas = function (key) { return userLayer !== void 0 && Object.prototype.hasOwnProperty.call(userLayer, key); };

      var draftState = useState({});
      var drafts = draftState[0];
      var setDrafts = draftState[1];
      var failedState = useState(null);
      var failed = failedState[0];
      var setFailed = failedState[1];
      var savingState = useState(false);
      var saving = savingState[0];
      var setSaving = savingState[1];
      var openState = useState(false);
      var open = openState[0];
      var setOpen = openState[1];
      // Accordion: which per-state row is expanded (null = all collapsed).
      var openNameState = useState(null);
      var openName = openNameState[0];
      var setOpenName = openNameState[1];

      if (!ready || value === null) return null;

      var edit = function (key, text) {
        var next = Object.assign({}, drafts);
        next[key] = text;
        setDrafts(next);
        setFailed(null);
      };
      var discard = function () {
        if (Object.keys(drafts).length === 0 && failed === null) return;
        setDrafts({});
        setFailed(null);
      };

      var stateOf = function (name) {
        return (value.states || {})[name] || {};
      };
      var fieldValue = function (key) {
        return Object.prototype.hasOwnProperty.call(drafts, key) ? drafts[key] : formatNumber(value[key]);
      };
      /**
       * A state's effective value for a field: the draft, else the resolved
       * entry, else the built-in one. The fallback matters because `value.states`
       * can omit states entirely (the host still paints their defaults).
       */
      var stateFieldValue = function (name, kind) {
        var key = "states." + name + "." + kind;
        if (Object.prototype.hasOwnProperty.call(drafts, key)) return drafts[key];
        var state = stateOf(name);
        var builtIn = DEFAULT_STATES[name] || {};
        if (kind === "effect") return state.effect || builtIn.effect || "static";
        if (kind === "colors") {
          var stored = formatColors(state.colors);
          return stored !== "" ? stored : formatColors(builtIn.colors);
        }
        var speed = formatNumber(state.speed);
        return speed !== "" ? speed : formatNumber(builtIn.speed);
      };

      var stateTitleKey = function (name) {
        return "state" + name.charAt(0).toUpperCase() + name.slice(1);
      };
      /**
       * Draft-aware colors of a state: per-entry validation ([] when nothing
       * usable survives) so a partially invalid stored list behaves like the
       * host's, which keeps the valid entries.
       */
      var stateColorList = function (name) {
        return parseColorList(stateFieldValue(name, "colors"));
      };
      /** Colors the current effect uses (1 for every single-color effect). */
      var colorCountOf = function (effect) {
        return EFFECT_COLOR_COUNT[effect] || 1;
      };
      /** Does this state currently run the hue-sweeping rainbow effect? */
      var isRainbowEffect = function (name) {
        return stateFieldValue(name, "effect") === "rainbow";
      };
      /**
       * One-line collapsed summary: "Blink · 400ms" (draft-aware). Colors are NOT
       * repeated here — the row header already shows them as a chip, and chips in
       * the ellipsized summary overflowed the row and pushed the cycle out.
       */
      var stateSummary = function (name) {
        var effect = stateFieldValue(name, "effect");
        var speedText = stateFieldValue(name, "speed").trim();
        var parts = [t(EFFECT_LABEL_KEYS[effect] || effect)];
        if (speedText !== "" && effect !== "static") parts.push(speedText + "ms");
        return parts.join(" · ");
      };
      /** Draft-aware: is this state currently static (thus has no cycle)? */
      var isEffectStatic = function (name) {
        return stateFieldValue(name, "effect") === "static";
      };
      /** Localized option list for the effect select (value stays the identifier). */
      var effectOptions = EFFECT_NAMES.map(function (name) {
        return { value: name, label: t(EFFECT_LABEL_KEYS[name]) };
      });

      var dirty = Object.keys(drafts).length > 0;

      // ---- default color + similarity warning --------------------------------
      /**
       * Current text of the default-color field: the draft when present,
       * otherwise the effective color (the idle primary — the host folds
       * `defaultColor` into `states.idle.colors[0]`, so the field always shows
       * what the icon actually paints). Blank means "inherit the idle color".
       */
      var defaultColorText = function () {
        if (Object.prototype.hasOwnProperty.call(drafts, "defaultColor")) return drafts["defaultColor"];
        // The settings scope resolves `states` and `defaultColor` independently
        // (the fold only exists inside the host's resolveConfig), so the scope's
        // idle color is NOT the configured default — read the key itself first,
        // otherwise the field, the palette and every warning would judge the
        // wrong color right after a save.
        if (typeof value.defaultColor === "string" && value.defaultColor.trim() !== "") return value.defaultColor;
        var idle = parseColorList(stateFieldValue("idle", "colors"));
        return idle.length ? idle[0] : "";
      };
      /** The color the warning check judges; null only when nothing is paintable. */
      var effectiveDefaultColor = function () {
        var text = defaultColorText().trim();
        if (text !== "" && isHexColor(text)) return text;
        // Cleared, never set, or a value the host would reject: the icon falls
        // back to the idle state's own primary (what the scope reports in
        // states.idle.colors), so the warning must judge THAT colour — otherwise
        // a hand-written typo would silently disable the check.
        // …and if even that is unusable, the built-in idle colour the host
        // falls back to — never silence the check.
        var idle = stateColorList("idle");
        if (idle.length) return idle[0];
        return defaultColorsOf("idle")[0];
      };
      /**
       * Chips for the default-color field. It always previews a paintable colour:
       * an explicit "clear override" draft (or a stored value the host would
       * reject) falls back to the inherited idle colour, which is exactly what
       * the icon will show.
       */
      var defaultColorColors = function () {
        var text = defaultColorText().trim();
        if (text !== "" && isHexColor(text)) return [text];
        var fallback = effectiveDefaultColor();
        return fallback === null ? [] : [fallback];
      };
      /** Chip for a state: the hue wheel for rainbow, its color bands otherwise. */
      var stateChip = function (name, key) {
        if (isRainbowEffect(name)) return rainbowChip(key);
        return colorChip(paletteColors(name), key);
      };
      /**
       * Palette chips for a state: idle shows the effective default color, every
       * other state ALL of its own colors (so asking shows its red and yellow).
       */
      var paletteColors = function (name) {
        if (name === "idle") {
          var base = effectiveDefaultColor();
          if (base !== null) return [base];
        }
        var colors = stateColorList(name);
        if (colors.length === 0) colors = defaultColorsOf(name).slice();
        // Cap at what the effect paints: a stored extra colour must not show up
        // in the chip while the editor and the save both cap it (EFFECT_COLOR_COUNT).
        return colors.slice(0, colorCountOf(stateFieldValue(name, "effect")));
      };
      /** Draft-aware fills a state paints; mirrors the host's `stateFills()`. */
      var stateFillsOf = function (name) {
        var effect = stateFieldValue(name, "effect");
        // Per-entry validation, then the same built-in fallback the host uses —
        // otherwise the card would warn about a colour the host never paints, or
        // miss one it does.
        var colors = parseColorList(stateFieldValue(name, "colors"));
        if (colors.length === 0) colors = defaultColorsOf(name).slice();
        // A rainbow state paints no literal colors[0] (only its starting hue),
        // so it carries no comparable fills — the chroma rule covers it.
        if (effect === "rainbow") return { fills: [], rainbow: true };
        var c0 = colors[0];
        var c1 = colors[1] || mixHex(c0, "#000000", 0.35);
        if (effect === "blink") return { fills: [c0, c1], rainbow: false };
        if (effect === "breath") {
          // Same density as the host (lib/index.js stateFills): the browser paints
          // the continuous mix, so 5 samples could miss a collision outright.
          var samples = [];
          for (var i = 0; i <= 32; i += 1) samples.push(mixHex(c0, c1, i / 32));
          return { fills: samples, rainbow: false };
        }
        return { fills: [c0], rainbow: false };
      };
      /**
       * The same check the host runs in `colorWarnings()` (lib/index.js) — it is
       * re-implemented here because the card cannot reach the status endpoint
       * (statusPath is registration-time only). Only the default is compared
       * with the other states: the shipped defaults deliberately share #FACC15
       * between `running` and the `asking` blink.
       */
      var colorWarnings = function () {
        var list = [];
        var base = effectiveDefaultColor();
        if (base === null) return list;
        // Idle itself on `rainbow` (composition entry only — the card never lets
        // you set it): the idle icon sweeps every hue, so the default colour can
        // never stay distinguishable from it. One advisory instead of the
        // pairwise pass, which would judge a colour idle never paints literally.
        if (isRainbowEffect("idle")) {
          if (labChroma(base) >= RAINBOW_CHROMA_MIN) {
            list.push({ code: "rainbow-overlap", state: "idle", level: "warn" });
          }
          return list;
        }
        for (var i = 0; i < EDITABLE_STATES.length; i += 1) {
          var name = EDITABLE_STATES[i];
          var info = stateFillsOf(name);
          if (info.rainbow && labChroma(base) >= RAINBOW_CHROMA_MIN) {
            list.push({ code: "rainbow-overlap", state: name, level: "warn" });
          }
          var closest = null;
          for (var j = 0; j < info.fills.length; j += 1) {
            var de = deltaE(base, info.fills[j]);
            if (closest === null || de < closest.deltaE) closest = { color: info.fills[j], deltaE: de };
          }
          if (closest !== null && closest.deltaE < SIMILAR_DE_WARN) {
            list.push({
              code: "color-too-close",
              state: name,
              color: closest.color,
              deltaE: Math.round(closest.deltaE * 10) / 10,
              level: closest.deltaE < SIMILAR_DE_STRONG ? "strong" : "warn",
            });
          }
        }
        return list;
      };
      /** Localized one-liner for a warning entry. */
      var warningText = function (warning) {
        var stateLabel = t(stateTitleKey(warning.state));
        if (warning.code === "rainbow-overlap") {
          return t("defaultColorWarnRainbow").replace("{state}", stateLabel);
        }
        var key = warning.level === "strong" ? "defaultColorWarnStrong" : "defaultColorWarn";
        return t(key)
          .replace("{state}", stateLabel)
          .replace("{color}", warning.color)
          .replace("{de}", String(warning.deltaE));
      };
      // Warnings are advisory: they never disable Save (the user may want the
      // palette on purpose), they just say what the tab will look like.
      var warnings = colorWarnings();

      var save = function () {
        if (!writable || saving || !dirty) return;
        var ops = [];
        var i;
        var key;
        // Top-level numbers: draft absent → untouched; blank → clear (unset).
        for (i = 0; i < TOP_NUMBERS.length; i += 1) {
          key = TOP_NUMBERS[i];
          if (!Object.prototype.hasOwnProperty.call(drafts, key)) continue;
          var parsed = isValidNumber(drafts[key], 0);
          if (parsed === null) { setFailed("invalidNumber"); return; }
          if (parsed.kind === "clear") { if (userHas(key)) ops.push({ op: "unset", field: key }); }
          else if (parsed.value !== value[key]) ops.push({ op: "set", field: key, value: parsed.value });
        }
        // Default icon color: a top-level string field. Blank clears the
        // override (back to the idle state's own color); a malformed value is
        // rejected exactly like a malformed colors entry.
        if (Object.prototype.hasOwnProperty.call(drafts, "defaultColor")) {
          var defaultDraft = drafts["defaultColor"].trim();
          var resolvedDefault = typeof value.defaultColor === "string" ? value.defaultColor : "";
          if (defaultDraft === "") {
            if (userHas("defaultColor")) ops.push({ op: "unset", field: "defaultColor" });
          } else if (!isHexColor(defaultDraft)) {
            setFailed("invalidColors");
            return;
          } else if (defaultDraft.toLowerCase() !== resolvedDefault.toLowerCase()) {
            ops.push({ op: "set", field: "defaultColor", value: defaultDraft });
          }
        }
        // Per-state visuals: rebuild `states` as the user layer's current
        // entries with the drafts applied. `scope.set` REPLACES the whole
        // field (no deep merge), so untouched entries — overrides saved
        // earlier for other states, plus any key not in STATE_NAMES — are
        // carried through instead of being dropped.
        var statesDirty = false;
        var nextStates = {};
        if (userLayer !== void 0 && userLayer !== null && typeof userLayer.states === "object" && userLayer.states !== null) {
          nextStates = Object.assign({}, userLayer.states);
        }
        for (i = 0; i < EDITABLE_STATES.length; i += 1) {
          var name = EDITABLE_STATES[i];
          var effKey = "states." + name + ".effect";
          var colKey = "states." + name + ".colors";
          var spdKey = "states." + name + ".speed";
          var hasEff = Object.prototype.hasOwnProperty.call(drafts, effKey);
          var hasCol = Object.prototype.hasOwnProperty.call(drafts, colKey);
          var hasSpd = Object.prototype.hasOwnProperty.call(drafts, spdKey);
          if (!hasEff && !hasCol && !hasSpd) continue;
          statesDirty = true;
          // The effective entry: the resolved/partial entry over the built-in
          // config. Without the merge a state missing from `value.states` would
          // be saved as "static" (and lose the built-in colours) merely because
          // the user touched its colour chip.
          var current = Object.assign({}, DEFAULT_STATES[name] || {}, stateOf(name));
          var effect = hasEff ? drafts[effKey] : current.effect || "static";
          var colors = current.colors;
          if (hasCol) {
            var parsedColors = parseColors(drafts[colKey]);
            if (parsedColors === null) { setFailed("invalidColors"); return; }
            colors = parsedColors;
          }
          var speed = current.speed;
          if (hasSpd) {
            var speedParse = isValidNumber(drafts[spdKey], 1);
            if (speedParse === null) { setFailed("invalidNumber"); return; }
            speed = speedParse.kind === "clear" ? void 0 : speedParse.value;
          }
          // Keep only the colors this effect uses, so the stored config always
          // matches the chips the card showed: switching blink -> static drops
          // the now-unused second color, and rainbow keeps colors[0] as its
          // starting hue.
          var keep = colorCountOf(effect);
          if (Array.isArray(colors) && colors.length > keep) colors = colors.slice(0, keep);
          var next = { effect: effect, colors: colors };
          if (speed !== void 0) next.speed = speed;
          nextStates[name] = next;
        }
        if (statesDirty) ops.push({ op: "set", field: "states", value: nextStates });

        if (ops.length === 0) {
          // Nothing to write — the draft already matches the resolved value, or
          // "blank" already means "inherit": settle the form instead of leaving
          // the Unsaved badge stuck on a save that wrote nothing.
          setDrafts({});
          setFailed(null);
          return;
        }
        setSaving(true);
        setFailed(null);
        // One atomic namespace mutation, not N field writes: the settings
        // contract makes every op in a `mutate` share ONE revision fence,
        // validation pass, persistence decision and recovery read. Saving the
        // card is a single edit, so a concurrent change on another surface must
        // be accepted or refused as a whole instead of landing half applied.
        scope.mutate(ops.map(function (op) {
          return op.op === "unset"
            ? { op: "unset", path: [op.field] }
            : { op: "set", path: [op.field], value: op.value };
        })).then(function () {
          setSaving(false);
          setDrafts({});
          setFailed(null);
        }, function () {
          setSaving(false);
          setFailed("saveFailed");
        });
      };

      var resetAll = function () {
        if (!writable || saving) return;
        setSaving(true);
        // A reset is a removal, not an edit: one `unset` per key re-inherits the
        // composition layer (the mutate path above cannot express "clear").
        // `defaultColor` needs care: when the composition entry (base layer) is
        // what sets it, there is nothing in the user layer to remove and the
        // field would look untouched after a reset. Write the idle state's own
        // colour instead — that IS "no custom default colour" — which also puts
        // an explicit user-layer value in place, so the clear-override control
        // reappears and the deployment value stays one click away.
        var baseOverride = !userHas("defaultColor") &&
          typeof value.defaultColor === "string" && value.defaultColor.trim() !== "";
        var idleOwnColor = stateColorList("idle")[0] || null;
        var defaultReset = baseOverride && idleOwnColor !== null
          ? scope.set("defaultColor", idleOwnColor)
          : scope.unset("defaultColor");
        Promise.all([
          scope.unset("askingHoldMs"),
          scope.unset("doneHoldMs"),
          defaultReset,
          scope.unset("states"),
        ]).then(function () {
          setSaving(false);
          setDrafts({});
          setFailed(null);
        }, function () {
          setSaving(false);
          setFailed("saveFailed");
        });
      };

      var disabled = !writable || saving;
      // The Plugins page asks a configuration entry twice: `view: 'summary'`
      // for the row's one-liner and `view: 'page'` for the body of its own
      // page (the page already heads it with the plugin's title and
      // description). A host that renders this card standalone passes no
      // `view` and keeps the collapsible header.
      if (props.view === "summary") return t("description");
      var pageView = props.view === "page";

      return createElement(
        "div",
        { style: styles.card },
        pageView ? null : createElement(
          "button",
          {
            type: "button",
            style: styles.header,
            "aria-expanded": open,
            "aria-label": t(open ? "collapse" : "expand") + ": " + t("title"),
            onClick: function () { setOpen(!open); },
          },
          createElement(
            "span",
            { style: styles.headText },
            createElement("span", { style: styles.name }, t("title")),
            createElement("span", { style: styles.description }, t("description"))
          ),
          dirty ? createElement("span", { style: styles.badge }, t("unsaved")) : null,
          createElement(
            "span",
            { style: Object.assign({}, styles.chevron, open ? styles.chevronOpen : {}) },
            createElement(ChevronDownIcon, {})
          )
        ),
        (open || pageView) ? createElement(
          "div",
          { style: styles.body },
          !writable ? createElement("p", { style: styles.hint }, t("readOnly")) : null,
          createElement(ValueInput, {
            id: "plugin-config-icon-asking-hold",
            label: t("askingHoldMs"),
            hint: t("askingHoldMsHint"),
            invalidLabel: t("invalidNumber"),
            invalid: failed === "invalidNumber",
            disabled: disabled,
            numeric: true,
            separated: false,
            value: fieldValue("askingHoldMs"),
            onChange: function (text) { edit("askingHoldMs", text); },
          }),
          createElement(ValueInput, {
            id: "plugin-config-icon-done-hold",
            label: t("doneHoldMs"),
            hint: t("doneHoldMsHint"),
            invalidLabel: t("invalidNumber"),
            invalid: failed === "invalidNumber",
            disabled: disabled,
            numeric: true,
            separated: true,
            value: fieldValue("doneHoldMs"),
            onChange: function (text) { edit("doneHoldMs", text); },
          }),
          createElement(ColorField, {
            id: "plugin-config-icon-default-color",
            label: t("defaultColor"),
            hint: t("defaultColorHint"),
            invalidLabel: t("invalidColors"),
            invalid: failed === "invalidColors",
            disabled: disabled,
            separated: true,
            colors: defaultColorColors(),
            pickLabel: t("editColor"),
            onColors: function (next) { if (next.length) edit("defaultColor", next[0]); },
            // Only a user-layer override can be cleared back to the composition
            // layer, so the affordance appears exactly when it can be honored.
            clearLabel: userHas("defaultColor") ? t("clearOverride") : null,
            onClear: userHas("defaultColor") ? function () { edit("defaultColor", ""); } : null,
          }),
          // The whole palette side by side: that is what "distinguishable at tab
          // size" actually looks like for this configuration.
          createElement(
            "div",
            { style: styles.paletteRow },
            createElement("span", { style: styles.paletteItem }, t("palette")),
            ["idle"].concat(EDITABLE_STATES).map(function (name) {
              return createElement(
                "span",
                { key: name, style: styles.paletteItem },
                t(stateTitleKey(name)),
                stateChip(name, "palette-" + name)
              );
            })
          ),
          warnings.length > 0
            ? createElement(
                "div",
                { style: styles.warnBlock },
                warnings.map(function (warning, index) {
                  return createElement(
                    "p",
                    {
                      key: index,
                      role: "status",
                      style: warning.level === "strong" ? styles.warnStrongText : styles.warnText,
                    },
                    warningText(warning)
                  );
                })
              )
            : null,
          createElement(
            "div",
            { style: styles.statesBlock },
            // Idle has no row here on purpose: its single color is the default
            // color field above, and it takes no animation.
            createElement("p", { style: styles.statesHint }, t("statesHint")),
            EDITABLE_STATES.map(function (name) {
              var isOpen = openName === name;
              var effect = stateFieldValue(name, "effect");
              var rainbow = effect === "rainbow";
              // Only the colors the effect consumes are shown (and saved): a
              // single-color effect must not look like it has a second color.
              // `rainbow` always offers its starting hue, so an unusable stored
              // value falls back to the built-in color instead of an empty chip.
              var storedColors = stateColorList(name);
              var rowColors = rainbow && storedColors.length === 0
                ? defaultColorsOf(name).slice()
                : storedColors;
              rowColors = rowColors.slice(0, colorCountOf(effect));
              // Room for another colour? A full list (blink with two colours)
              // gets no "+" chip: anything it appended would be invisible and
              // trimmed away on save. An EMPTY list (unusable stored value) gets
              // no "+" either — the dashed chip is there to be replaced, and
              // "add a second color" would be nonsense with zero colours.
              var canAdd = colorCountOf(effect) > rowColors.length && rowColors.length > 0;
              return createElement(
                primitives.DisclosureRow,
                {
                  key: name,
                  className: "dsh-wii-state",
                  // The icon slot is a fixed-size box: use ONE chip — split into
                  // the state's colors (asking = red|yellow), or the hue wheel
                  // for the rainbow effect.
                  icon: stateChip(name, "row-" + name),
                  title: t(stateTitleKey(name)),
                  open: isOpen,
                  expandable: true,
                  expandOnRowClick: true,
                  onToggle: function () { setOpenName(isOpen ? null : name); },
                  collapsedContent: createElement("span", { style: styles.summary }, stateSummary(name)),
                },
                createElement(
                  "div",
                  { style: styles.statePanel },
                  createElement(
                    LabeledField,
                    { label: t("effect"), hint: t("effectHint"), invalid: false, invalidLabel: "", separated: false, htmlFor: "plugin-config-icon-" + name + "-effect" },
                    createElement(SelectInput, {
                      id: "plugin-config-icon-" + name + "-effect",
                      options: effectOptions,
                      disabled: disabled,
                      value: stateFieldValue(name, "effect"),
                      onChange: function (text) { edit("states." + name + ".effect", text); },
                    })
                  ),
                  createElement(ColorField, {
                    id: "plugin-config-icon-" + name + "-colors",
                    label: t("colors"),
                    hint: rainbow ? t("rainbowHint") : t("colorsHint"),
                    invalidLabel: t("invalidColors"),
                    invalid: failed === "invalidColors",
                    disabled: disabled,
                    separated: true,
                    // rainbow has nothing to configure: the field renders the hue
                    // wheel instead of pickers.
                    rainbow: rainbow,
                    colors: rowColors,
                    // Only blink / breath read a second color, so only they offer
                    // the "+" chip; every extra entry stays removable.
                    canAdd: canAdd,
                    canRemove: true,
                    pickLabel: t("editColor"),
                    addLabel: t("addColor"),
                    removeLabel: t("removeColor"),
                    onColors: function (next) { edit("states." + name + ".colors", next.join(", ")); },
                  }),
                  // `speed` is meaningless for a static effect (the browser paints
                  // one frame and never loops), so hide it — switching to an
                  // animated effect brings the field back.
                  isEffectStatic(name) ? null : createElement(ValueInput, {
                    id: "plugin-config-icon-" + name + "-speed",
                    label: t("speed"),
                    hint: t("speedHint"),
                    invalidLabel: t("invalidNumber"),
                    invalid: failed === "invalidNumber",
                    disabled: disabled,
                    numeric: true,
                    separated: true,
                    value: stateFieldValue(name, "speed"),
                    onChange: function (text) { edit("states." + name + ".speed", text); },
                  })
                )
              );
            })
          ),
          createElement(
            "div",
            { style: styles.footer },
            failed !== null ? createElement("p", { style: styles.failed, role: "status" }, t(failed)) : null,
            createElement(
              primitives.Button,
              { variant: "outline", disabled: !writable || saving, onClick: resetAll },
              t("resetAll")
            ),
            createElement(
              primitives.Button,
              { variant: "outline", disabled: !dirty || saving, onClick: discard },
              t("discard")
            ),
            createElement(
              primitives.Button,
              { variant: "primary", disabled: !dirty || saving || !writable, onClick: save },
              t(saving ? "saving" : "save")
            )
          )
        ) : null
      );
    }

    // ---------------------------------------------------------------------------
    // Plugin entry
    // ---------------------------------------------------------------------------

    /**
     * The settings form this card binds, on whichever host line is running.
     *
     * - DSH ≥ 0.1.7 exposes `configForms`, one controller per profile entry id
     *   (snapshot + revision-fenced `mutate` / `unset`); the provider owns the
     *   remote write, so this plugin never declares `remote` itself.
     * - DSH ≤ 0.1.6-alpha.1 exposes `settingsScope`; binding it to the legacy
     *   namespace yields the same snapshot/write face the card already uses.
     *
     * Read weakly on purpose: the two services are mutually exclusive, and the
     * caller's `inject` list must stay valid on both lines.
     */
    function resolveScope(ctx) {
      var forms = ctx.get("configForms");
      if (forms && typeof forms.get === "function") return forms.get(NS);
      var legacy = ctx.get("settingsScope");
      if (legacy && typeof legacy.bind === "function") return legacy.bind({ namespace: LEGACY_NS });
      return null;
    }

    function apply(ctx) {
      var t = ctx.locale.bind(LOCALE);
      ctx.effect(function () {
        return ctx.locale.register(LOCALE, { zh: zh, en: en });
      }, "dsh-web-icon-indicator: settings page dictionaries");
      // The scope is resolved per render (see the inject face below), so the
      // card follows whichever provider is mounted and renders nothing while
      // neither is.
      var pageFace = function () { return { scope: resolveScope(ctx), t: t }; };
      // Register on BOTH page slots. `ctx.slots.inject(key, …)` is a no-op for a
      // slot this host never declares, so each line runs exactly the branch it
      // understands:
      //   - `plugins.row.config` (≥0.1.6-alpha.2): keyed `<package>#<row id>`,
      //     the row's configure control comes from this registration;
      //   - `settings.plugin.item` (≤0.1.6-alpha.1): keyed by the legacy
      //     settings namespace, dispatched by the settings tab per served
      //     namespace.
      var start = function () {
        var disposeRow = ctx.slots.inject("plugins.row.config", function () {
          return ctx.slots.register(
            {
              name: "plugins.row.config",
              key: ROW_KEY,
              locale: LOCALE,
              inject: pageFace,
            },
            IconConfigCard
          );
        });
        var disposeItem = ctx.slots.inject("settings.plugin.item", function () {
          return ctx.slots.register(
            {
              name: "settings.plugin.item",
              key: LEGACY_NS,
              locale: LOCALE,
              inject: pageFace,
            },
            IconConfigCard
          );
        });
        return function () { disposeRow(); disposeItem(); };
      };
      // On the modern line, gate registration on the served namespace so an
      // uncomposed plugin shows no page; `whileServed` owns the returned
      // disposer, so `start` must hand one back. The legacy line needs no gate:
      // its tab only dispatches namespaces the host serves.
      var forms = ctx.get("configForms");
      if (forms && typeof forms.whileServed === "function") {
        ctx.effect(function () {
          return forms.whileServed([NS], start);
        }, "dsh-web-icon-indicator: settings page");
      } else {
        ctx.effect(start, "dsh-web-icon-indicator: settings page");
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
