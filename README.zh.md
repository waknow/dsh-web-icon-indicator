# dsh-web-icon-indicator

> 📖 [English](README.md) · [中文文档](README.zh.md)

浏览器标签页 favicon 实时反映 DSH 会话状态——待机 / 运行中 / 提问 / 完成——让你在标签页置于后台时也能一眼看出是否有会话需要处理。

## 状态

| 状态 | 颜色（默认） | 特效（默认） |
| --- | --- | --- |
| `idle` 待机 | `#1a1a1a`（深色鲸鱼） | `static` |
| `running` 运行中 | `#FACC15`（黄色） | `static` |
| `asking` 提问 | `#E5484D` + `#FACC15` | `blink`（400ms） |
| `done` 完成 | `#22A06B`（绿色） | `doneHoldMs` 内 `static`，随后回到 `idle` |

插件只内置**一个**基础鲸鱼 SVG（[`icons/base.svg`](./icons/base.svg)），在浏览器中动态上色/加动画——不再有按颜色拆分的图标文件。每个状态的颜色和特效都可通过 [配置](#配置) 自由设置。

### 动态颜色与动画

所有状态共用同一条鲸鱼路径，只有填充色（以及可选的动画）不同。由于 favicon 是普通图片，SVG 内部的 CSS 动画不会在标签页执行——注入的浏览器脚本把每一帧构建成 `data:image/svg+xml,…` URI：在每个 `requestAnimationFrame` 周期替换 `__COLOR__` 占位符为配置颜色，动画类特效则在 `<g transform>` 中注入缩放/位移。可选特效：

| 特效 | 效果 |
| --- | --- |
| `static` | 纯色单帧，无动画 |
| `blink` | 在状态色与 `blinkColor` 之间按 `askingBlinkMs` 切换 |
| `breath` | 颜色在 `effectSpeedMs` 内向更深的变体平滑呼吸过渡 |
| `rainbow` | 色相在 `effectSpeedMs` 内绕色轮循环 |
| `heartbeat` | 在 `effectSpeedMs` 内做「lub-dub」式的尖锐缩放脉冲 |
| `bounce` | 鲸鱼在 `effectSpeedMs` 内上下跳动 |

完整自包含 demo（无构建、无依赖）在 [`demo/dynamic-color.html`](./demo/dynamic-color.html)：选择状态 + 特效并实时改色，即可看到标签页 favicon 即时变化。

## 安装

这是一个标准 DSH bundle 插件。安装到 `web` profile（GUI/TUI profile 会自动通过 cordis patch 层加载）：

从 npm 安装（**推荐**——已发布为 `dsh-web-icon-indicator@0.1.0`）：

```bash
dsh plugin --profile web add dsh-web-icon-indicator
```

从 Git 源码安装：

```bash
dsh plugin --profile web add github:waknow/dsh-web-icon-indicator
```

或从本地目录 / tarball 安装：

```bash
dsh plugin --profile web add <路径或tarball>
```

或将目录放进 `~/.dsh/profiles/web/node_modules/<name>/`，并附带与包内一致的 `cordis.patch.yml`。

## 配置

所有键均可选，默认值如下：

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `iconsDir` | `<package>/icons/` | 单个 `base.svg` 所在目录 |
| `statusPath` | `/dsh-web-icon-status.json` | JSON 状态端点 |
| `iconPathPrefix` | `/dsh-web-icon-indicator` | `base.svg` 的 URL 前缀 |
| `askingHoldMs` | `3500` | 提问状态的最小保持时长 |
| `askingBlinkMs` | `400` | `blink` 特效的帧间隔 |
| `doneHoldMs` | `5000` | 完成状态保持时长 |
| `effectSpeedMs` | `1200` | 连续型特效（breath/rainbow/heartbeat/bounce）的周期 |
| `colors` | `{ idle:#1a1a1a, running:#FACC15, asking:#E5484D, done:#22A06B }` | 每个状态的填充色 |
| `effects` | `{ idle:static, running:static, asking:blink, done:static }` | 每个状态的动画特效 |
| `blinkColor` | `#FACC15` | `blink` 特效的第二个颜色 |

`colors` 与 `effects` 会在默认值之上做浅合并，因此只需覆盖少量状态即可。在组合行中覆盖：

```yaml
- id: dsh-web-icon-indicator
  name: 'dsh-web-icon-indicator'
  config:
    effectSpeedMs: 900
    colors:
      running: '#FF9900'
      done: '#2ECC71'
    effects:
      running: breath     # 改为呼吸渐变而非静态
      done: heartbeat      # 完成时心跳
      asking: rainbow      # 提问时色相循环
    blinkColor: '#FF9900'
```

## 实现原理

- Host-only 插件：在现有 `webServer` 上注册路由——状态 JSON 端点、静态 `/dsh-web-icon-indicator/base.svg`（鲸鱼模板），以及一个 `tapIndex` 向每个 `index.html` 注入小段浏览器脚本。
- 状态按 `agents.list()` 聚合，优先级 `asking > running > done > idle`。每次请求都会执行一次 `reconcile()` 检测 running → idle 的转换，因为 `agent/status` 的 idle 事件在回合结束时并不保证送达。
- `ask_user_question` 工具调用（通过 `tools/pre-execute` / `tools/result`）把会话置为 `asking`，带可配置的最小保持时长，即使你立刻回答，图标也会保持可见。
- 权限 / **沙箱拦截**等待同样会显示为 `asking`：当 agent 命中沙箱拒绝并请求提权（`sandbox_permissions` + `justification`），或其他工具需要征得同意时，审批服务会先写入一条 `approval/asked` 会话事件并阻塞 agent，直到你做出决定。插件监听 `session/event`（并以实时会话日志的权威折叠作为兜底）在整个等待期间将会话置为 `asking` 状态，收到 `approval/decided` 后清除。
- 浏览器脚本每秒轮询 `/dsh-web-icon-status.json`，首次获取 `base.svg`，然后每个 `requestAnimationFrame` 周期把 favicon 重建为 `data:image/svg+xml,…` URI——把 `__COLOR__` 占位符替换为状态配置的颜色，并应用该状态配置的特效。浏览器不会播放 SVG favicon 的 CSS 动画，所以一切动画都由 JS 驱动。

## 已知限制

- favicon 的 SVG CSS 动画在浏览器标签页 UI 中不会运行——所有特效都由 JavaScript 每帧重建 data-URI 实现，这是零依赖设计的刻意取舍。
- `base.svg` 模板必须保留 `#p { fill: … }` 规则中的 `__COLOR__` 占位符；浏览器会替换该标记为每帧上色。
- 插件运行在 **host** 平面，必须挂载进 profile 的组合配置，不能作为会话级 agent preset。
- 文件读取走 `fs` 服务，以配置的 `iconsDir` 为 `cwd`。请确保该路径在部署环境的沙箱策略下可读。

## 许可

MIT