/**
 * Browser half of dsh-web-icon-indicator (dsh.client bundle, ModuleLoader
 * factory format — hand-written, no build step).
 *
 * Registers one card into the shared "plugin configuration" surface
 * (`settings.plugin.item`, keyed by the `web-icon-indicator` settings
 * namespace). The card binds the namespace's settings scope, stages edits
 * locally, and writes them through `scope.set` / `scope.unset` (validated and
 * persisted host-side into the profile's settings.yaml).
 *
 * The tab that dispatches this slot (`dsh-client-ui-settings-plugins`) only
 * renders the card while the host serves the namespace, so this bundle is
 * inert on deployments that do not compose the host plugin.
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

    /** Settings namespace owned by the host plugin (must match lib/index.js). */
    var NS = "web-icon-indicator";
    var LOCALE = "dsh-web-icon-indicator";
    var STATE_NAMES = ["idle", "running", "asking", "done"];
    var EFFECT_NAMES = ["static", "blink", "breath", "rainbow", "heartbeat", "bounce"];
    var TOP_NUMBERS = ["askingHoldMs", "doneHoldMs"];
    // Localized label key per effect identifier (value stays the identifier).
    var EFFECT_LABEL_KEYS = {
      static: "effectStatic",
      blink: "effectBlink",
      breath: "effectBreath",
      rainbow: "effectRainbow",
      heartbeat: "effectHeartbeat",
      bounce: "effectBounce",
    };

    /** Cordis fiber services this browser plugin injects. */
    var inject = ["slots", "settingsScope", "locale"];

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
      stateIdle: "Idle",
      stateRunning: "Running",
      stateAsking: "Asking",
      stateDone: "Done",
      effect: "Effect",
      effectHint: "Animation for this state.",
      colors: "Colors",
      colorsHint: "Comma-separated hex colors; the first is the primary color.",
      speed: "Cycle (ms)",
      speedHint: "Per-state cycle length; blank keeps the current value. Static states have no cycle.",
      effectStatic: "Static",
      effectBlink: "Blink",
      effectBreath: "Breath",
      effectRainbow: "Rainbow",
      effectHeartbeat: "Heartbeat",
      effectBounce: "Bounce",
      editColor: "Edit color",
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
      stateIdle: "待机",
      stateRunning: "运行中",
      stateAsking: "提问",
      stateDone: "完成",
      effect: "特效",
      effectHint: "该状态的动画效果。",
      colors: "颜色",
      colorsHint: "逗号分隔的十六进制颜色；第一个为主色。",
      speed: "周期（毫秒）",
      speedHint: "该状态的动画周期；留空保持当前值。静态状态无周期。",
      effectStatic: "静态",
      effectBlink: "闪烁",
      effectBreath: "呼吸",
      effectRainbow: "彩虹",
      effectHeartbeat: "心跳",
      effectBounce: "弹跳",
      editColor: "编辑颜色",
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
      dot: { display: "inline-block", width: 10, height: 10, borderRadius: 999, border: "1px solid var(--dsw-alias-border-l2)" },
      summary: { flex: 1, minWidth: 0, marginLeft: 8, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", color: "var(--dsw-alias-label-tertiary)", fontSize: 12, lineHeight: "24px" },
      statePanel: { padding: "2px 0 12px 22px" },
      inputRow: { display: "flex", alignItems: "center", gap: 8 },
      swatches: { display: "inline-flex", alignItems: "center", gap: 4, flex: "none" },
      swatch: { display: "inline-block", width: 14, height: 14, borderRadius: 4, border: "1px solid var(--dsw-alias-border-l2)" },
      swatchLabel: { display: "inline-flex", position: "relative", width: 14, height: 14, cursor: "pointer" },
      colorInput: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: 0, padding: 0, margin: 0 },
      badges: { display: "inline-flex", alignItems: "center", gap: 8 },
      badge: { whiteSpace: "nowrap", background: "var(--dsw-alias-bg-module-platform)", color: "var(--dsw-alias-label-secondary)", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 500, lineHeight: "17px" },
      footer: { borderTop: "1px solid var(--dsw-alias-border-l2)", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, padding: "12px 0 4px" },
      failed: { minWidth: 0, color: "var(--dsw-alias-label-error)", flex: 1, margin: 0, fontSize: 12, lineHeight: "1.5" },
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
      //          placeholder, numeric, trailing, onChange }
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
        props.trailing ? createElement("div", { style: styles.inputRow }, input, props.trailing) : input
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

    /** Filled dot previewing one state's primary color (colors[0]). */
    function ColorDot(props) {
      return createElement("span", { style: Object.assign({}, styles.dot, { background: props.color }) });
    }

    /** Expand a 3-digit hex (#abc) to 6-digit (#aabbcc) for <input type="color">. */
    function to6(hex) {
      var h = String(hex).replace("#", "");
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      return "#" + h;
    }

    /**
     * One swatch per parsed color. With an `onChange` it becomes a native
     * color picker: each swatch is a label with a visually hidden
     * <input type="color"> overlay; picking a color replaces that entry in the
     * text. Without an onChange it renders a static preview (aria-hidden).
     */
    function ColorSwatches(props) {
      var colors = parseColors(props.text);
      if (colors === null) return null;
      if (typeof props.onChange !== "function") {
        return createElement(
          "span",
          { style: styles.swatches, "aria-hidden": "true" },
          colors.map(function (color) {
            return createElement("span", { key: color, style: Object.assign({}, styles.swatch, { background: color }) });
          })
        );
      }
      return createElement(
        "span",
        { style: styles.swatches },
        colors.map(function (color, index) {
          return createElement(
            "label",
            {
              key: index,
              style: styles.swatchLabel,
              title: props.label || "",
              "aria-label": props.label || "",
            },
            createElement("input", {
              type: "color",
              value: to6(color),
              onChange: function (event) {
                var next = colors.slice();
                next[index] = event.target.value;
                props.onChange(next.join(", "));
              },
            }),
            createElement("span", { style: Object.assign({}, styles.swatch, { background: color }) })
          );
        })
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

    /** Parse a comma/space separated list of #hex colors; null when malformed. */
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

    function isValidNumber(text, min) {
      var trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      var parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < min) return null;
      return { kind: "set", value: parsed };
    }

    /** Subscribe a React component to the scope's snapshot store. */
    function useScopeSnapshot(scope) {
      return useSyncExternalStore(
        function (listener) { return scope.subscribe(listener); },
        function () { return scope.getSnapshot(); },
        function () { return scope.getSnapshot(); }
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
      var stateFieldValue = function (name, kind) {
        var key = "states." + name + "." + kind;
        if (Object.prototype.hasOwnProperty.call(drafts, key)) return drafts[key];
        var state = stateOf(name);
        if (kind === "effect") return state.effect || "static";
        if (kind === "colors") return formatColors(state.colors);
        return formatNumber(state.speed);
      };

      var stateTitleKey = function (name) {
        return "state" + name.charAt(0).toUpperCase() + name.slice(1);
      };
      /** One-line collapsed summary: "Blink · #E5484D ⇄ #FACC15 · 400ms" (draft-aware). */
      var stateSummary = function (name) {
        var effect = stateFieldValue(name, "effect");
        var parts = [t(EFFECT_LABEL_KEYS[effect] || effect)];
        var colorsText = stateFieldValue(name, "colors").trim();
        if (colorsText !== "") {
          var parsed = parseColors(colorsText);
          parts.push(parsed === null ? colorsText : parsed.join(" ⇄ "));
        }
        var speedText = stateFieldValue(name, "speed").trim();
        if (speedText !== "" && effect !== "static") parts.push(speedText + "ms");
        return parts.join(" · ");
      };
      /** Primary color for the row's dot; transparent while the draft is unparseable. */
      var statePrimaryColor = function (name) {
        var parsed = parseColors(stateFieldValue(name, "colors"));
        return parsed === null ? "transparent" : parsed[0];
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
        for (i = 0; i < STATE_NAMES.length; i += 1) {
          var name = STATE_NAMES[i];
          var effKey = "states." + name + ".effect";
          var colKey = "states." + name + ".colors";
          var spdKey = "states." + name + ".speed";
          var hasEff = Object.prototype.hasOwnProperty.call(drafts, effKey);
          var hasCol = Object.prototype.hasOwnProperty.call(drafts, colKey);
          var hasSpd = Object.prototype.hasOwnProperty.call(drafts, spdKey);
          if (!hasEff && !hasCol && !hasSpd) continue;
          statesDirty = true;
          var current = stateOf(name);
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
          var next = { effect: effect, colors: colors };
          if (speed !== void 0) next.speed = speed;
          nextStates[name] = next;
        }
        if (statesDirty) ops.push({ op: "set", field: "states", value: nextStates });

        if (ops.length === 0) return;
        setSaving(true);
        setFailed(null);
        var run = Promise.resolve();
        var ok = true;
        for (i = 0; i < ops.length; i += 1) {
          (function (op) {
            run = run.then(function () {
              if (!ok) return;
              if (op.op === "set") return scope.set(op.field, op.value);
              return scope.unset(op.field);
            }).then(void 0, function () { ok = false; });
          })(ops[i]);
        }
        run.then(function () {
          setSaving(false);
          if (ok) { setDrafts({}); setFailed(null); }
          else setFailed("saveFailed");
        });
      };

      var resetAll = function () {
        if (!writable || saving) return;
        setSaving(true);
        Promise.all([
          scope.unset("askingHoldMs"),
          scope.unset("doneHoldMs"),
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

      return createElement(
        "div",
        { style: styles.card },
        createElement(
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
            createElement(primitives.IconChevronDownOutline14, {})
          )
        ),
        open ? createElement(
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
          createElement(
            "div",
            { style: styles.statesBlock },
            STATE_NAMES.map(function (name) {
              var isOpen = openName === name;
              return createElement(
                primitives.DisclosureRow,
                {
                  key: name,
                  className: "dsh-wii-state",
                  icon: createElement(ColorDot, { color: statePrimaryColor(name) }),
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
                  createElement(ValueInput, {
                    id: "plugin-config-icon-" + name + "-colors",
                    label: t("colors"),
                    hint: t("colorsHint"),
                    invalidLabel: t("invalidColors"),
                    invalid: failed === "invalidColors",
                    disabled: disabled,
                    separated: true,
                    value: stateFieldValue(name, "colors"),
                    trailing: createElement(ColorSwatches, {
                      text: stateFieldValue(name, "colors"),
                      label: t("editColor"),
                      onChange: function (text) { edit("states." + name + ".colors", text); },
                    }),
                    onChange: function (text) { edit("states." + name + ".colors", text); },
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
    function apply(ctx) {
      var t = ctx.locale.bind(LOCALE);
      ctx.effect(function () {
        return ctx.locale.register(LOCALE, { zh: zh, en: en });
      }, "dsh-web-icon-indicator: settings card dictionaries");
      var scope = ctx.settingsScope.bind({ namespace: NS });
      ctx.slots.inject("settings.plugin.item", function () {
        return ctx.slots.register(
          {
            name: "settings.plugin.item",
            key: NS,
            locale: LOCALE,
            inject: function () { return { scope: scope, t: t }; },
          },
          IconConfigCard
        );
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
