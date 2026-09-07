/* dsh-web-icon-indicator — GitHub Pages site script.
   Zero dependencies, zero build. The whale renderer below is a faithful port
   of the plugin's injected browser script (lib/index.js → INJECTED_SCRIPT):
   same color math, same effect timing, same count-block geometry — so every
   preview on this page renders exactly like the real favicon does. */
(function () {
  "use strict";

  // ---- whale template (icons/base.svg, the __COLOR__ placeholder replaced per frame)
  var PATH = "M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z";
  var CX = 27.889625, CY = 24.95264;   // whale bounding-box center (transform pivot)
  var DEF_SPEED = 1200;                // per-state cycle fallback (matches the plugin)
  var DEF_COLOR = "#1a1a1a";

  // ---- plugin DEFAULTS (lib/index.js)
  var STATES = {
    idle: { effect: "static", colors: ["#1a1a1a"] },
    running: { effect: "static", colors: ["#FACC15"] },
    asking: { effect: "blink", colors: ["#E5484D", "#FACC15"], speed: 400 },
    done: { effect: "static", colors: ["#22A06B"] }
  };

  // ---- color helpers (ported)
  function hexToRgb(h) {
    h = String(h).replace("#", "");
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(function (v) {
      v = Math.round(v); if (v < 0) v = 0; if (v > 255) v = 255;
      return ("0" + v.toString(16)).slice(-2);
    }).join("");
  }
  function mix(a, b, t) {
    var ca = hexToRgb(a), cb = hexToRgb(b);
    return rgbToHex(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }
  function hueOf(hex) {
    var c = hexToRgb(hex).map(function (v) { return v / 255; });
    var max = Math.max.apply(null, c), min = Math.min.apply(null, c), d = max - min, h = 0;
    if (d) {
      if (max === c[0]) h = ((c[1] - c[2]) / d) % 6;
      else if (max === c[1]) h = (c[2] - c[0]) / d + 2;
      else h = (c[0] - c[1]) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return h;
  }

  // ---- frame builders (ported: whale + full-frame count block)
  // The whale's fill goes on the path's own `fill` ATTRIBUTE — never in a
  // `<style>` tag. Inside a data: URI (real favicon) a style tag is isolated,
  // but when the same markup is inlined into this page, `<style>` rules leak
  // document-wide and every same-id path inherits the last-written rule (all
  // previews would show one shared state). Presentation attributes are
  // collision-free in both contexts; base.svg itself carries the fill both
  // ways for exactly this reason.
  function whaleSvg(fill, gattr) {
    var inner = '<path fill="' + fill + '" d="' + PATH + '"/>';
    if (gattr) inner = '<g ' + gattr + '>' + inner + '</g>';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50" fill="none">' + inner + '</svg>';
  }
  function countBlockSvg(fill, n) {
    var text = n > 99 ? "99+" : String(n);
    var fs = text.length === 1 ? 26 : text.length === 2 ? 20 : 15.5;
    var rgb = hexToRgb(fill);
    var lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    var fg = lum > 0.6 ? "#111111" : "#FFFFFF"; // auto-contrast on the state color
    return '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50" fill="none">' +
      '<rect x="0" y="0" width="50" height="50" rx="11" fill="' + fill + '"/>' +
      '<text x="25" y="' + (25 + fs * 0.34).toFixed(1) + '" text-anchor="middle" font-family="system-ui, sans-serif" font-size="' + fs + '" font-weight="800" fill="' + fg + '">' + text + '</text>' +
      '</svg>';
  }
  function frameFill(cfg, t) {
    var c0 = cfg.colors[0] || DEF_COLOR;
    var c1 = cfg.colors[1] || mix(c0, "#000000", 0.35);
    switch (cfg.effect) {
      case "blink":
        return ((t / cfg.speed) >> 0) % 2 === 0 ? c0 : c1;
      case "breath": {
        var k = 0.5 + 0.5 * Math.sin((t / cfg.speed) * 2 * Math.PI);
        return mix(c0, c1, k);
      }
      case "rainbow":
        return hslToHex(hueOf(c0) + (t / cfg.speed) * 360, 70, 58);
      default:
        return c0;
    }
  }
  function frameSvg(cfg, t, count) {
    if (count != null && count >= 2) return countBlockSvg(frameFill(cfg, t), count);
    var fill = frameFill(cfg, t);
    var gattr = "";
    if (cfg.effect === "heartbeat") {
      var tt = (t % cfg.speed) / cfg.speed, s = 1;
      if (tt < 0.12) s = 1 + 0.16 * Math.sin(tt / 0.12 * Math.PI);
      else if (tt < 0.25) s = 1 + 0.10 * Math.sin((tt - 0.12) / 0.13 * Math.PI);
      gattr = 'transform="translate(' + CX + " " + CY + ') scale(' + s + ') translate(' + -CX + " " + -CY + ')"';
    } else if (cfg.effect === "bounce") {
      var dy = -Math.abs(Math.sin((t / cfg.speed) * 2 * Math.PI * 1.6)) * 6;
      gattr = 'transform="translate(0 ' + dy.toFixed(2) + ')"';
    }
    return whaleSvg(fill, gattr);
  }
  function toUri(markup) { return "data:image/svg+xml," + encodeURIComponent(markup); }
  function normCfg(s) {
    var c = STATES[s] || STATES.idle;
    return { effect: c.effect, colors: c.colors.slice(), speed: c.speed || DEF_SPEED };
  }

  // ---- render slots + one shared rAF loop (~30 fps is plenty for previews)
  var slots = [];
  function addSlot(el, get, asImg) {
    var last = null;
    function slot(now) {
      var m = get(now);
      if (m == null || m === last) return;
      last = m;
      if (asImg) el.setAttribute("src", toUri(m));
      else el.innerHTML = m;
    }
    slots.push(slot);
    slot(0);
    return slot;
  }

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduced) {
    var lastTick = 0;
    (function loop(now) {
      if (now - lastTick >= 33) {
        lastTick = now;
        for (var i = 0; i < slots.length; i++) slots[i](now);
      }
      requestAnimationFrame(loop);
    })(0);
  }

  // Expose the whale once as a <symbol> so every <use href="#whale"> in the
  // page (nav brand, settings mock, footer) shares the exact PATH above —
  // no second transcription of the template.
  document.body.insertAdjacentHTML("afterbegin",
    '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">' +
    '<symbol id="whale" viewBox="0 0 50 50"><path fill="currentColor" d="' + PATH + '"/></symbol>' +
    '</svg>');

  // ---- i18n ---------------------------------------------------------------
  var I18N = {
    zh: {
      "title": "dsh-web-icon-indicator — 会话状态，一眼可见",
      "nav.states": "状态", "nav.count": "多 Agent", "nav.effects": "特效",
      "nav.config": "配置", "nav.how": "原理", "nav.install": "安装", "nav.github": "GitHub",
      "hero.eyebrow": "DeepSeek Harness · 浏览器标签页插件",
      "hero.h1a": "会话状态，", "hero.h1b": "一眼可见。",
      "hero.sub": "dsh-web-icon-indicator 把 DSH 会话状态实时映射到浏览器标签页图标：待机、运行中、等待输入、完成——即使标签页沉在后台、甚至被钉住，也一眼看清哪些会话需要你处理。",
      "hero.cta.github": "查看 GitHub", "hero.cta.npm": "npm",
      "hero.hint": "无需构建、零依赖 · 一个 base.svg 模板，浏览器端逐帧上色",
      "hero.tab.title": "DeepSeek Harness — Web",
      "hero.pinned.title": "3 个会话",
      "hero.url": "localhost:3080",
      "hero.state.label": "当前状态",
      "hero.mock.cap": "模拟标签页 · 由本页 JavaScript 实时渲染，与插件渲染管线一致",
      "state.idle": "待机", "state.running": "运行中", "state.asking": "等待输入", "state.done": "完成",
      "states.eyebrow": "核心能力", "states.h2": "四种状态，实时流转",
      "states.sub": "多个会话并行时按优先级聚合 —— asking > running > done > idle，一次只显示最重要的那个状态。",
      "card.idle.desc": "会话空闲，深色鲸鱼安静地待在标签页上，不打扰。",
      "card.running.desc": "Agent 正在工作，明黄色一路跟随，任务进行中一目了然。",
      "card.asking.desc": "ask_user_question 或权限审批阻塞时红黄交替闪烁——切回来之前也不会错过。",
      "card.done.desc": "回合结束闪现绿色，驻留片刻后自动回到待机。",
      "tag.static": "static", "tag.blink": "blink · 400ms",
      "states.foot": "asking 与 done 的最短驻留时间可配置（askingHoldMs / doneHoldMs）：即使用户秒答、回合瞬间结束，状态也不会一闪而过。",
      "count.eyebrow": "多会话并行", "count.h2": "标签页即计数器",
      "count.sub": "不止一个 Agent 在工作时，鲸鱼让位于满幅数字块：实时显示活动会话数，沿用状态配色与特效渲染，钉住的小标签页里也清晰可读。",
      "count.ctl": "活动 Agent 数",
      "count.ask": "其中一个正在等待输入",
      "count.l1": "活动会话 ≤ 1 —— 显示状态鲸鱼",
      "count.l2": "活动会话 2–99 —— 显示满幅数字块，字号随位数自适应（16px 钉住标签页依然可读）",
      "count.l3": "活动会话 100+ —— 显示 99+；asking 优先时数字块同样红黄闪烁",
      "count.fig": "图示 · 活动 Agent 数与标签页图标",
      "effects.eyebrow": "视觉语言", "effects.h2": "六种内置特效",
      "effects.sub": "浏览器从不播放 favicon 里的 SVG 动画——所以本页的每个特效都和插件一样，由 JavaScript 逐帧重建。点击任意卡片在下方试玩。",
      "fx.static.desc": "单帧纯色，使用 colors[0]",
      "fx.blink.desc": "colors[0] ⇄ colors[1] 按 speed 交替",
      "fx.breath.desc": "在 colors[0] 与 colors[1] 之间平滑脉动",
      "fx.rainbow.desc": "从 colors[0] 的色相出发循环色轮",
      "fx.heartbeat.desc": "lub-dub 双搏动缩放，colors[0]",
      "fx.bounce.desc": "鲸鱼按 speed 上下弹跳，colors[0]",
      "pg.state": "状态", "pg.effect": "特效", "pg.speed": "周期（动画特效）",
      "pg.colors": "颜色", "pg.color0": "主色 colors[0]", "pg.color1": "副色 colors[1]",
      "pg.color.hint": "副色仅被 blink / breath 使用；未提供时自动派生更深一档的同色。",
      "pg.sync": "同步到本页标签页图标",
      "pg.sync.hint": "开启后，浏览器标签页上真实的 favicon 会跟随这里的配置实时变化——正是插件在 DSH 页面里做的事。看看你的标签页 →",
      "config.eyebrow": "零 YAML", "config.h2": "设置页里的完整配置界面",
      "config.p1": "DSH ≥ 0.1.2 时，Web GUI 的「设置 → 插件 → 插件配置」里会出现一张 Favicon indicator 卡片：每个状态一行，特效、颜色、周期全部可视化编辑，还带实时色板预览。",
      "config.p2": "改动保存进 profile 的 settings.yaml，并在约 1 秒内同步到正在运行的标签页——无需重启宿主，也无需刷新页面。",
      "config.step1": "打开 DSH Web GUI，进入「设置」",
      "config.step2": "切换到「插件」标签页，打开「插件配置」",
      "config.step3": "展开「Favicon indicator / 标签页图标指示器」卡片，逐状态编辑",
      "config.mock.title": "Favicon indicator", "config.mock.sub": "插件配置",
      "config.mock.askhold": "提问驻留", "config.mock.donehold": "完成驻留",
      "config.mock.foot.ok": "已保存", "config.mock.foot.path": "写入 ~/.dsh/settings.yaml · 保存后 ~1s 生效，无需重启",
      "how.eyebrow": "工作原理", "how.h2": "轻量、健壮、零依赖",
      "how.1.cap": "ONE SVG, REBUILT PER FRAME", "how.1.title": "一个模板，逐帧重绘",
      "how.1.body": "插件只附带一个 base.svg 模板；浏览器每帧把 __COLOR__ 占位符替换为状态色，再编码成 data:image/svg+xml URI。没有按颜色预制的图片文件，也没有多余的请求。",
      "how.2.cap": "JS-DRIVEN FRAMES", "how.2.title": "全部动画由 JS 驱动",
      "how.2.body": "标签页里的 favicon 不播放 SVG 自带的 CSS 动画。插件用 requestAnimationFrame 每帧重建图标并替换 href；标签页转入后台时退回墙钟帧，动画不冻结，回到前台恢复全速。",
      "how.3.cap": "OFFLINE-SAFE BY DESIGN", "how.3.title": "断线自愈，图标永不离场",
      "how.3.body": "状态端点每秒轮询一次，宿主重启后自动重连。宿主停止时标签页不会丢图标——启动时缓存的离线安全 data: URI 副本会接管，首次成功轮询即恢复实时图标。",
      "how.browser": "Chrome / Edge / Firefox 获得完整的实时颜色与特效；Safari 能渲染 SVG favicon，但动态更新受限（尽力而为）。",
      "install.eyebrow": "开始使用", "install.h2": "一条命令，装进 web profile",
      "install.card1.title": "从 npm 安装（推荐）",
      "install.card1.desc": "标准 DSH bundle 插件，安装后 GUI / TUI profile 通过 cordis patch 层自动生效。",
      "install.card2.title": "从 GitHub 源码安装",
      "install.card2.desc": "直接跟踪仓库最新提交，适合开发与预览。",
      "install.note": "需要 DSH ≥ 0.1.2（设置界面所需）。安装后打开 Web GUI → 设置 → 插件 → 插件配置，找到 Favicon indicator 卡片。",
      "copy": "复制", "copied": "已复制 ✓",
      "foot.cta.title": "加入 DSH 插件生态",
      "foot.cta.sub": "dsh-web-icon-indicator 是一个标准的 DSH bundle 插件——欢迎在 GitHub 提 Issue、发 PR，或者现在就把它装进你的 harness 里试试。",
      "foot.license": "以 MIT 许可发布",
      "foot.baseline": "为 DeepSeek Harness 构建 · 一切皆插件",
      "lang.toggle": "EN"
    },
    en: {
      "title": "dsh-web-icon-indicator — Your session state, at a glance",
      "nav.states": "States", "nav.count": "Multi-agent", "nav.effects": "Effects",
      "nav.config": "Configure", "nav.how": "How it works", "nav.install": "Install", "nav.github": "GitHub",
      "hero.eyebrow": "DeepSeek Harness · browser-tab plugin",
      "hero.h1a": "Your session state, ", "hero.h1b": "at a glance.",
      "hero.sub": "dsh-web-icon-indicator mirrors the DSH session state onto the browser tab favicon — idle, running, waiting for input, done — so background and pinned tabs always tell you which sessions need you.",
      "hero.cta.github": "View GitHub", "hero.cta.npm": "npm",
      "hero.hint": "No build, zero dependencies · one base.svg template, recolored per frame in the browser",
      "hero.tab.title": "DeepSeek Harness — Web",
      "hero.pinned.title": "3 sessions",
      "hero.url": "localhost:3080",
      "hero.state.label": "Current state",
      "hero.mock.cap": "Mocked tab · rendered live by this page's JavaScript, same pipeline as the plugin",
      "state.idle": "Idle", "state.running": "Running", "state.asking": "Asking", "state.done": "Done",
      "states.eyebrow": "Core", "states.h2": "Four states, live",
      "states.sub": "With several sessions in flight, states aggregate by priority — asking > running > done > idle — and only the most important one is shown.",
      "card.idle.desc": "Session idle: a dark whale rests quietly on the tab, out of the way.",
      "card.running.desc": "An agent is working: bright yellow follows the task from start to finish.",
      "card.asking.desc": "When ask_user_question or an approval blocks, red ⇄ yellow blinks — you won't miss it even in another window.",
      "card.done.desc": "A finished turn flashes green, holds briefly, then falls back to idle.",
      "tag.static": "static", "tag.blink": "blink · 400ms",
      "states.foot": "The minimum visibility of asking and done is configurable (askingHoldMs / doneHoldMs) — instant answers and instant turns never flash by unseen.",
      "count.eyebrow": "Multi-agent", "count.h2": "The tab becomes the counter",
      "count.sub": "While more than one agent is active, the whale gives way to a full-frame count block: the live number of busy sessions, drawn with the state's own color and effect — readable even in a pinned 16px tab.",
      "count.ctl": "Active agents",
      "count.ask": "One of them is waiting for input",
      "count.l1": "0–1 active sessions — the state whale",
      "count.l2": "2–99 — a full-frame count block, digit size adapts (readable in pinned tabs)",
      "count.l3": "100+ — shows 99+; when asking wins, the block blinks red/yellow too",
      "count.fig": "Diagram · active agents vs. favicon",
      "effects.eyebrow": "Visual language", "effects.h2": "Six built-in effects",
      "effects.sub": "Browsers never play SVG animations inside a favicon — so every effect on this page is rebuilt frame by frame in JavaScript, exactly like the plugin does. Click a card to try it below.",
      "fx.static.desc": "Single colored frame, colors[0]",
      "fx.blink.desc": "colors[0] ⇄ colors[1] alternating over speed",
      "fx.breath.desc": "Smooth pulse between colors[0] and colors[1]",
      "fx.rainbow.desc": "Cycles the color wheel from colors[0]'s hue",
      "fx.heartbeat.desc": "Lub-dub scale pulses, colors[0]",
      "fx.bounce.desc": "The whale hops up and down over speed, colors[0]",
      "pg.state": "State", "pg.effect": "Effect", "pg.speed": "Cycle (animated effects)",
      "pg.colors": "Colors", "pg.color0": "Primary colors[0]", "pg.color1": "Secondary colors[1]",
      "pg.color.hint": "The secondary color is only used by blink / breath; a darker shade is derived when omitted.",
      "pg.sync": "Sync to this page's tab favicon",
      "pg.sync.hint": "When on, the real favicon of this browser tab follows the controls live — exactly what the plugin does on a DSH page. Check your tab →",
      "config.eyebrow": "Zero YAML", "config.h2": "A full settings UI, built in",
      "config.p1": "On DSH ≥ 0.1.2, a Favicon indicator card appears under Settings → Plugins → Plugin config: one row per state with visual editing for effect, colors and cycle, plus live swatch previews.",
      "config.p2": "Changes persist to the profile's settings.yaml and reach the running tab within ~1 s — no restart, no reload.",
      "config.step1": "Open the DSH Web GUI, go to Settings",
      "config.step2": "Open the Plugins tab, then Plugin config",
      "config.step3": "Expand the Favicon indicator card and edit states one by one",
      "config.mock.title": "Favicon indicator", "config.mock.sub": "Plugin config",
      "config.mock.askhold": "Asking hold", "config.mock.donehold": "Done hold",
      "config.mock.foot.ok": "Saved", "config.mock.foot.path": "Written to ~/.dsh/settings.yaml · live in ~1 s, no restart",
      "how.eyebrow": "How it works", "how.h2": "Light, robust, zero-dependency",
      "how.1.cap": "ONE SVG, REBUILT PER FRAME", "how.1.title": "One template, repainted per frame",
      "how.1.body": "The plugin ships a single base.svg template; each frame the browser swaps the __COLOR__ placeholder for the state color and encodes a data:image/svg+xml URI. No per-color icon files, no extra requests.",
      "how.2.cap": "JS-DRIVEN FRAMES", "how.2.title": "All animation is JavaScript",
      "how.2.body": "Favicons never play the SVG's own CSS animation. The plugin rebuilds the icon every requestAnimationFrame tick and swaps the href; hidden tabs fall back to wall-clock frames so nothing freezes.",
      "how.3.cap": "OFFLINE-SAFE BY DESIGN", "how.3.title": "Self-healing, icon never leaves",
      "how.3.body": "The status endpoint is polled every second and reconnects across host restarts. When the host stops, the tab keeps its icon — an offline-safe data: URI copy cached at startup takes over, and the live icon returns on the first successful poll.",
      "how.browser": "Chrome / Edge / Firefox get the full live colors and effects; Safari renders SVG favicons but updates dynamically on a best-effort basis.",
      "install.eyebrow": "Get started", "install.h2": "One command into the web profile",
      "install.card1.title": "Install from npm (recommended)",
      "install.card1.desc": "A standard DSH bundle plugin; GUI / TUI profiles pick it up through the cordis patch layer automatically.",
      "install.card2.title": "Install from GitHub source",
      "install.card2.desc": "Track the repository's latest commit — handy for development and previews.",
      "install.note": "Requires DSH ≥ 0.1.2 (for the settings UI). After installing, open the Web GUI → Settings → Plugins → Plugin config to find the Favicon indicator card.",
      "copy": "Copy", "copied": "Copied ✓",
      "foot.cta.title": "Join the DSH plugin ecosystem",
      "foot.cta.sub": "dsh-web-icon-indicator is a standard DSH bundle plugin — file issues, send PRs, or install it into your harness right now.",
      "foot.license": "Released under the MIT license",
      "foot.baseline": "Built for DeepSeek Harness · everything is a plugin",
      "lang.toggle": "中文"
    }
  };
  var lang = "zh";
  try {
    lang = localStorage.getItem("dshwii-lang") ||
      ((navigator.language || "").toLowerCase().indexOf("zh") === 0 ? "zh" : "en");
  } catch (e) {}
  function t(key) {
    var d = I18N[lang] || I18N.zh;
    return key in d ? d[key] : (I18N.zh[key] || key);
  }
  var heroPill = null, heroDot = null;
  function applyLang(l) {
    lang = l;
    try { localStorage.setItem("dshwii-lang", l); } catch (e) {}
    document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
    document.title = t("title");
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", t("hero.sub"));
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    var btn = document.getElementById("lang-toggle");
    if (btn) btn.textContent = t("lang.toggle");
    if (heroPill) heroPill.textContent = t(heroPill.getAttribute("data-i18n"));
  }

  // ---- hero: auto-cycling mock browser tab --------------------------------
  var ORDER = ["idle", "running", "asking", "done"];
  var heroState = "running";
  heroPill = document.getElementById("hero-state-name");
  heroDot = document.getElementById("hero-state-dot");
  var heroTabImg = document.getElementById("hero-tab-favicon");
  var heroBody = document.getElementById("hero-body-icon");
  var pinnedImg = document.getElementById("hero-pinned-favicon");
  if (heroTabImg) addSlot(heroTabImg, function (now) { return frameSvg(normCfg(heroState), now); }, true);
  if (heroBody) addSlot(heroBody, function (now) { return frameSvg(normCfg(heroState), now); });
  if (pinnedImg) addSlot(pinnedImg, function () { return frameSvg(normCfg("running"), 0, 3); }, true);
  function setHeroState(s) {
    heroState = s;
    if (heroPill) {
      heroPill.setAttribute("data-i18n", "state." + s);
      heroPill.textContent = t("state." + s);
    }
    if (heroDot) heroDot.style.background = normCfg(s).colors[0];
  }
  setHeroState("running");
  if (!reduced) {
    setInterval(function () {
      setHeroState(ORDER[(ORDER.indexOf(heroState) + 1) % ORDER.length]);
    }, 2600);
  }

  // ---- four state cards ----------------------------------------------------
  ORDER.forEach(function (s) {
    var el = document.getElementById("sc-" + s);
    if (el) addSlot(el, function (now) { return frameSvg(normCfg(s), now); });
  });

  // ---- multi-agent count demo ----------------------------------------------
  var cnt = 3, askChecked = false;
  var numEl = document.getElementById("count-num");
  var askEl = document.getElementById("count-ask");
  var countPreview = document.getElementById("count-preview");
  function aggState() { return askChecked && cnt >= 1 ? "asking" : "running"; }
  if (countPreview) addSlot(countPreview, function (now) { return frameSvg(normCfg(aggState()), now, cnt); });
  function syncNum() { if (numEl) numEl.textContent = cnt; }
  var minus = document.getElementById("count-minus");
  var plus = document.getElementById("count-plus");
  if (minus) minus.addEventListener("click", function () { cnt = Math.max(0, cnt - 1); syncNum(); });
  if (plus) plus.addEventListener("click", function () { cnt = Math.min(6, cnt + 1); syncNum(); });
  if (askEl) askEl.addEventListener("change", function () { askChecked = askEl.checked; });
  syncNum();

  // ---- effects grid + playground -------------------------------------------
  var FX = [
    { id: "static", demo: { effect: "static", colors: ["#1a1a1a"], speed: 1200 } },
    { id: "blink", demo: { effect: "blink", colors: ["#E5484D", "#FACC15"], speed: 400 } },
    { id: "breath", demo: { effect: "breath", colors: ["#4D6BFE", "#B9C7FF"], speed: 1200 } },
    { id: "rainbow", demo: { effect: "rainbow", colors: ["#4D6BFE"], speed: 1200 } },
    { id: "heartbeat", demo: { effect: "heartbeat", colors: ["#E5484D"], speed: 1200 } },
    { id: "bounce", demo: { effect: "bounce", colors: ["#22A06B"], speed: 1200 } }
  ];
  var pg = { state: "idle", cfg: normCfg("idle") };
  FX.forEach(function (fx) {
    var ic = document.getElementById("fx-ic-" + fx.id);
    if (ic) addSlot(ic, function (now) { return frameSvg(fx.demo, now); });
    var card = document.getElementById("fx-card-" + fx.id);
    if (card) card.addEventListener("click", function () { selectEffect(fx.id); });
  });

  var pgPreview = document.getElementById("pg-preview");
  if (pgPreview) addSlot(pgPreview, function (now) { return frameSvg(pg.cfg, now); });

  var segState = document.getElementById("pg-state-seg");
  var segEffect = document.getElementById("pg-effect-seg");
  var speedRow = document.getElementById("pg-speed-row");
  var speedRange = document.getElementById("pg-speed");
  var speedVal = document.getElementById("pg-speed-val");
  var c0 = document.getElementById("pg-c0"), c0t = document.getElementById("pg-c0t");
  var c1 = document.getElementById("pg-c1"), c1t = document.getElementById("pg-c1t");
  var c1Item = document.getElementById("pg-c1-item");
  var syncEl = document.getElementById("pg-sync-toggle");

  function selectState(s) {
    pg.state = s;
    pg.cfg = normCfg(s);
    syncControls();
  }
  function selectEffect(id) {
    pg.cfg.effect = id;
    syncControls();
  }
  function setSeg(seg, attr, val) {
    if (!seg) return;
    seg.querySelectorAll("button[data-" + attr + "]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-" + attr) === val);
    });
  }
  function syncControls() {
    setSeg(segState, "state", pg.state);
    setSeg(segEffect, "effect", pg.cfg.effect);
    if (speedRange) speedRange.value = pg.cfg.speed;
    if (speedVal) speedVal.textContent = pg.cfg.speed + " ms";
    if (speedRow) speedRow.classList.toggle("off", pg.cfg.effect === "static");
    var c0v = pg.cfg.colors[0] || DEF_COLOR;
    var c1v = pg.cfg.colors[1] || mix(c0v, "#000000", 0.35);
    if (c0) c0.value = c0v;
    if (c0t) c0t.value = c0v;
    if (c1) c1.value = c1v;
    if (c1t) c1t.value = c1v;
    if (c1Item) c1Item.style.opacity = (pg.cfg.effect === "blink" || pg.cfg.effect === "breath") ? "1" : "0.45";
  }
  if (segState) segState.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-state]");
    if (b) selectState(b.getAttribute("data-state"));
  });
  if (segEffect) segEffect.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-effect]");
    if (b) selectEffect(b.getAttribute("data-effect"));
  });
  if (speedRange) speedRange.addEventListener("input", function () {
    pg.cfg.speed = +speedRange.value || DEF_SPEED;
    if (speedVal) speedVal.textContent = pg.cfg.speed + " ms";
  });
  function bindColor(picker, text, idx) {
    function apply(v) {
      v = String(v).trim();
      if (!/^#[0-9a-fA-F]{3}$/.test(v) && !/^#[0-9a-fA-F]{6}$/.test(v)) return;
      if (v.length === 4) v = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
      pg.cfg.colors[idx] = v;
      if (picker) picker.value = v;
      if (text) text.value = v;
    }
    if (picker) picker.addEventListener("input", function () { apply(picker.value); });
    if (text) text.addEventListener("input", function () { apply(text.value); });
  }
  bindColor(c0, c0t, 0);
  bindColor(c1, c1t, 1);
  syncControls();

  // ---- favicon follows the playground (the real plugin behavior) -----------
  var faviconLink = document.querySelector("link[rel='icon']");
  if (faviconLink) {
    var favLast = null;
    var IDLE_MARK = whaleSvg("#1a1a1a");
    var favSlot = function (now) {
      var m = syncEl && syncEl.checked ? frameSvg(pg.cfg, now) : IDLE_MARK;
      if (m === favLast) return;
      favLast = m;
      try { faviconLink.setAttribute("href", toUri(m)); } catch (e) {}
    };
    slots.push(favSlot);
    favSlot(0);
    if (syncEl) syncEl.addEventListener("change", favSlot);
  }

  // ---- copy buttons ---------------------------------------------------------
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      var done = function () {
        btn.textContent = t("copied");
        clearTimeout(btn._t);
        btn._t = setTimeout(function () { btn.textContent = t("copy"); }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else {
        try {
          var ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        } catch (e) {}
        done();
      }
    });
  });

  // ---- reveal on scroll ------------------------------------------------------
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.1 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  // ---- language toggle -------------------------------------------------------
  var langBtn = document.getElementById("lang-toggle");
  if (langBtn) langBtn.addEventListener("click", function () {
    applyLang(lang === "zh" ? "en" : "zh");
  });
  applyLang(lang);
})();
