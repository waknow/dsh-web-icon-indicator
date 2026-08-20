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

    /** Settings namespace owned by the host plugin (must match lib/index.js). */
    var NS = "web-icon-indicator";
    var LOCALE = "dsh-web-icon-indicator";
    var STATE_NAMES = ["idle", "running", "asking", "done"];
    var EFFECT_NAMES = ["static", "blink", "breath", "rainbow", "heartbeat", "bounce"];
    var TOP_NUMBERS = ["askingHoldMs", "doneHoldMs"];

    /** Cordis fiber services this browser plugin injects. */
    var inject = ["slots", "settingsScope", "locale"];

    // ---------------------------------------------------------------------------
    // Locale copy
    // ---------------------------------------------------------------------------
    var en = {
      title: "Favicon indicator",
      description: "How the browser tab favicon reflects session state.",
      askingHoldMs: "Asking hold (ms)",
      askingHoldMsHint: "Minimum visibility of the asking icon before it settles.",
      doneHoldMs: "Done hold (ms)",
      doneHoldMsHint: "How long the done icon stays before returning to idle.",
      stateLabel: "State",
      effect: "Effect",
      effectHint: "Animation for this state.",
      colors: "Colors",
      colorsHint: "Comma-separated hex colors; the first is the primary color.",
      speed: "Cycle (ms)",
      speedHint: "Per-state cycle length; blank keeps the current value.",
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
      askingHoldMs: "提问驻留（毫秒）",
      askingHoldMsHint: "提问图标的最短可见时长。",
      doneHoldMs: "完成驻留（毫秒）",
      doneHoldMsHint: "完成图标停留多久后回到待机。",
      stateLabel: "状态",
      effect: "特效",
      effectHint: "该状态的动画效果。",
      colors: "颜色",
      colorsHint: "逗号分隔的十六进制颜色；第一个为主色。",
      speed: "周期（毫秒）",
      speedHint: "该状态的动画周期；留空保持当前值。",
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
      headText: { display: "flex", flexDirection: "column", gap: 4 },
      name: { color: "var(--dsw-alias-label-primary)", fontSize: 15, fontWeight: 600, lineHeight: "1.4", margin: 0 },
      description: { color: "var(--dsw-alias-label-tertiary)", fontSize: 13, lineHeight: "1.5", margin: 0 },
      field: { display: "flex", flexDirection: "column", gap: 6, padding: "12px 0" },
      fieldBorder: { borderTop: "1px solid var(--dsw-alias-border-l2)" },
      label: { color: "var(--dsw-alias-label-primary)", fontSize: 13, fontWeight: 500, lineHeight: "1.5" },
      hint: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, lineHeight: "1.5", margin: 0 },
      invalidText: { color: "var(--dsw-alias-label-error)", fontSize: 12, lineHeight: "1.5", margin: 0 },
      input: { border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-3)", height: 34, borderRadius: 8, padding: "0 12px", fontSize: 13, fontFamily: "inherit", color: "var(--dsw-alias-label-primary)" },
      inputInvalid: { borderColor: "var(--dsw-alias-label-error)" },
      select: { border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-3)", height: 34, borderRadius: 8, padding: "0 8px", fontSize: 13, fontFamily: "inherit", color: "var(--dsw-alias-label-primary)" },
      group: { borderTop: "1px solid var(--dsw-alias-border-l2)", marginTop: 4, paddingTop: 4 },
      groupTitle: { color: "var(--dsw-alias-label-secondary)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", margin: "10px 0 0" },
      badges: { display: "inline-flex", alignItems: "center", gap: 8 },
      badge: { whiteSpace: "nowrap", background: "var(--dsw-alias-bg-module-platform)", color: "var(--dsw-alias-label-secondary)", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 500, lineHeight: "17px" },
      footer: { borderTop: "1px solid var(--dsw-alias-border-l2)", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, padding: "12px 0 4px" },
      failed: { minWidth: 0, color: "var(--dsw-alias-label-error)", flex: 1, margin: 0, fontSize: 12, lineHeight: "1.5" },
      button: { appearance: "none", font: "inherit", cursor: "pointer", border: "1px solid var(--dsw-alias-border-l2)", background: "transparent", color: "var(--dsw-alias-label-secondary)", borderRadius: 8, padding: "5px 14px", fontSize: 13, lineHeight: "1.5" },
      buttonPrimary: { borderColor: "transparent", background: "var(--dsw-alias-brand-primary)", color: "#fff" },
      buttonDisabled: { opacity: 0.5, cursor: "default" },
    };

    function fieldStyle(separated) {
      return separated ? Object.assign({}, styles.field, styles.fieldBorder) : styles.field;
    }

    function inputStyle(invalid) {
      return invalid ? Object.assign({}, styles.input, styles.inputInvalid) : styles.input;
    }

    function LabeledField(props) {
      // props: { label, hint, invalidLabel, children }
      return createElement(
        "div",
        { style: fieldStyle(props.separated) },
        createElement("label", { style: styles.label }, props.label),
        props.children,
        createElement("p", { style: props.invalid ? styles.invalidText : styles.hint }, props.invalid ? props.invalidLabel : props.hint)
      );
    }

    function NumberInput(props) {
      // props: { id, value, onChange, invalid, disabled, invalidLabel, hint, label }
      return createElement(
        LabeledField,
        { label: props.label, hint: props.hint, invalid: props.invalid, invalidLabel: props.invalidLabel, separated: props.separated },
        createElement("input", {
          id: props.id,
          type: "text",
          inputMode: "numeric",
          style: inputStyle(props.invalid),
          disabled: props.disabled,
          value: props.value,
          onChange: function (event) { props.onChange(event.target.value); },
        })
      );
    }

    function TextInput(props) {
      return createElement(
        LabeledField,
        { label: props.label, hint: props.hint, invalid: props.invalid, invalidLabel: props.invalidLabel, separated: props.separated },
        createElement("input", {
          id: props.id,
          type: "text",
          style: inputStyle(props.invalid),
          disabled: props.disabled,
          value: props.value,
          placeholder: props.placeholder || "",
          onChange: function (event) { props.onChange(event.target.value); },
        })
      );
    }

    function SelectInput(props) {
      // props: { id, value, options, onChange, disabled }
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
          return createElement("option", { key: option, value: option }, option);
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
        // Per-state visuals: rebuild the whole `states` object from the resolved
        // values with the drafts applied (deep-merged over the user layer).
        var statesDirty = false;
        var nextStates = {};
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
          "div",
          { style: styles.headText },
          createElement("p", { style: styles.name }, t("title")),
          createElement("p", { style: styles.description }, t("description")),
          dirty ? createElement("span", { style: styles.badge }, t("unsaved")) : null,
          !writable ? createElement("p", { style: styles.hint }, t("readOnly")) : null
        ),
        createElement(NumberInput, {
          id: "plugin-config-icon-asking-hold",
          label: t("askingHoldMs"),
          hint: t("askingHoldMsHint"),
          invalidLabel: t("invalidNumber"),
          invalid: failed === "invalidNumber",
          disabled: disabled,
          separated: true,
          value: fieldValue("askingHoldMs"),
          onChange: function (text) { edit("askingHoldMs", text); },
        }),
        createElement(NumberInput, {
          id: "plugin-config-icon-done-hold",
          label: t("doneHoldMs"),
          hint: t("doneHoldMsHint"),
          invalidLabel: t("invalidNumber"),
          invalid: failed === "invalidNumber",
          disabled: disabled,
          separated: true,
          value: fieldValue("doneHoldMs"),
          onChange: function (text) { edit("doneHoldMs", text); },
        }),
        STATE_NAMES.map(function (name, index) {
          return createElement(
            "div",
            { key: name, style: styles.group },
            createElement("p", { style: styles.groupTitle }, t("stateLabel") + ": " + name),
            createElement(
              LabeledField,
              { label: t("effect"), hint: t("effectHint"), invalid: false, invalidLabel: "", separated: true },
              createElement(SelectInput, {
                id: "plugin-config-icon-" + name + "-effect",
                options: EFFECT_NAMES,
                disabled: disabled,
                value: stateFieldValue(name, "effect"),
                onChange: function (text) { edit("states." + name + ".effect", text); },
              })
            ),
            createElement(TextInput, {
              id: "plugin-config-icon-" + name + "-colors",
              label: t("colors"),
              hint: t("colorsHint"),
              invalidLabel: t("invalidColors"),
              invalid: failed === "invalidColors",
              disabled: disabled,
              value: stateFieldValue(name, "colors"),
              onChange: function (text) { edit("states." + name + ".colors", text); },
            }),
            createElement(NumberInput, {
              id: "plugin-config-icon-" + name + "-speed",
              label: t("speed"),
              hint: t("speedHint"),
              invalidLabel: t("invalidNumber"),
              invalid: failed === "invalidNumber",
              disabled: disabled,
              separated: true,
              value: stateFieldValue(name, "speed"),
              onChange: function (text) { edit("states." + name + ".speed", text); },
            })
          );
        }),
        createElement(
          "div",
          { style: styles.footer },
          failed !== null ? createElement("p", { style: styles.failed, role: "status" }, t(failed)) : null,
          createElement(
            "button",
            { type: "button", style: styles.button, disabled: !writable || saving, onClick: resetAll },
            t("resetAll")
          ),
          createElement(
            "button",
            { type: "button", style: styles.button, disabled: !dirty || saving, onClick: discard },
            t("discard")
          ),
          createElement(
            "button",
            {
              type: "button",
              style: Object.assign({}, styles.button, styles.buttonPrimary, (!dirty || saving || !writable) ? styles.buttonDisabled : {}),
              disabled: !dirty || saving || !writable,
              onClick: save,
            },
            t(saving ? "saving" : "save")
          )
        )
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
