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
| `static` | 纯色单帧，无动画——使用 `colors[0]` |
| `blink` | 在 `colors[0]` ⇄ `colors[1]` 之间按 `speed` 切换（缺省时自动推导更深的第二色） |
| `breath` | 在 `colors[0]` 与 `colors[1]` 之间平滑呼吸过渡（缺省时推导） |
| `rainbow` | 以 `colors[0]` 为起始色相，在 `speed` 内绕色轮循环 |
| `heartbeat` | 在 `speed` 内做「lub-dub」式的尖锐缩放脉冲——颜色为 `colors[0]` |
| `bounce` | 鲸鱼在 `speed` 内上下跳动——颜色为 `colors[0]` |

完整自包含 demo（无构建、无依赖）在 [`demo/dynamic-color.html`](./demo/dynamic-color.html)：选择状态 + 特效并实时改色，即可看到标签页 favicon 即时变化。

## 安装

这是一个标准 DSH bundle 插件。安装到 `web` profile（GUI/TUI profile 会自动通过 cordis patch 层加载）：

从 npm 安装（**推荐**——已发布为 `dsh-web-icon-indicator@0.2.1`）：

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
| `doneHoldMs` | `5000` | 完成状态保持时长，随后回到 idle |
| `states` | 见下 | 每个状态的视觉配置 |

`states` 中每个状态是一个对象：`{ effect, colors[], speed? }`：

```yaml
config:
  states:
    idle:    { effect: static,    colors: ['#1a1a1a'] }
    running: { effect: static,    colors: ['#FACC15'] }
    asking:  { effect: blink,     colors: ['#E5484D', '#FACC15'], speed: 400 }
    done:    { effect: static,    colors: ['#22A06B'] }
```

- **`effect`** — 取 `static | blink | breath | rainbow | heartbeat | bounce` 之一。
- **`colors`** — **数组**，多个 hex 颜色。`colors[0]` 为主色。多色特效读取更多项：`blink` 用 `colors[0]`⇄`colors[1]`，`breath` 在 `colors[0]`⇄`colors[1]` 间过渡（缺省时自动推导更深的第二色），`rainbow` 仅用 `colors[0]` 作起始色相。
- **`speed`** — 可选，该状态的周期（ms），也是 `blink` 的切换间隔。默认 `1200`。

每个状态条目会在默认值之上做浅合并，因此只需覆盖少量状态。示例：

```yaml
- id: dsh-web-icon-indicator
  name: 'dsh-web-icon-indicator'
  config:
    states:
      running: { effect: breath,    colors: ['#FF9900', '#FFD9A0'], speed: 900 }
      asking:  { effect: rainbow,   colors: ['#FF0000'] }
      done:    { effect: heartbeat, colors: ['#2ECC71'] }
```

### 设置页与 `settings.yaml`（DSH ≥ rc7）

插件把上面整套配置注册进 DSH settings 服务，命名空间为 `web-icon-indicator`
（schema 为 `lib/index.js` 中的 schemastery schema）：

- **Web GUI：** 打开 **设置 → 插件 → 插件配置**，会出现 *标签页图标指示器*
  卡片，可编辑同样的键（提问/完成驻留，以及每个状态的特效 / 颜色 / 周期），
  通过 settings 传输层暂存并保存。每个状态是一行可折叠条目，带主色圆点和一行
  摘要（如 `blink · #E5484D ⇄ #FACC15 · 400ms`）；展开该行才显示它的三个字段，
  颜色输入框旁会实时预览解析出的色块。
- **持久化：** 值写入 profile 的 `settings.yaml`（默认 `~/.dsh/settings.yaml`）
  的 `web-icon-indicator:` 段。合成条目仍是 `base` 层；解析顺序为 schema 默认值
  → 合成条目 → 设置文档用户层。
- **无需重启服务器、无需刷新标签页**即可让设置卡片的修改生效：`askingHoldMs` /
  `doneHoldMs` 在主机侧即时生效；各状态的视觉配置（特效 / 颜色 / 周期）会随状态
  轮询同步进正在运行的标签页，约 1 秒内生效。只有改 `lib/index.js` 里的代码级
  默认值才需要重载标签页（或重新构建 DSH Web）。
- 浏览器半区是手写的 `lib/client.js`（ModuleLoader factory 格式——无构建步骤、
  无额外运行期依赖，仅用 shell 自带的 `react`）。DSH 客户端扫描器会在下次启动
  profile 时识别新的 `dsh.client` 声明。
- 未组合 settings 服务的部署不受影响：插件回退到直接读取合成条目，行为与之前完全一致。

## 实现原理

- Host 插件 + 一个小型浏览器半区：在现有 `webServer` 上注册路由——状态 JSON 端点、静态 `/dsh-web-icon-indicator/base.svg`（鲸鱼模板），以及一个 `tapIndex` 向每个 `index.html` 注入小段浏览器脚本。整套配置已注册进 DSH settings 服务（`web-icon-indicator` 命名空间）用于校验、持久化与设置页卡片（见上）。
- 状态按 `agents.list()` 聚合，优先级 `asking > running > done > idle`。每次请求都会执行一次 `reconcile()` 检测 running → idle 的转换，因为 `agent/status` 的 idle 事件在回合结束时并不保证送达。
- `ask_user_question` 工具调用（通过 `tools/pre-execute` / `tools/result`）把会话置为 `asking`，带可配置的最小保持时长，即使你立刻回答，图标也会保持可见。
- 权限 / **沙箱拦截**等待同样会显示为 `asking`：当 agent 命中沙箱拒绝并请求提权（`sandbox_permissions` + `justification`），或其他工具需要征得同意时，审批服务会先写入一条 `approval/asked` 会话事件并阻塞 agent，直到你做出决定。插件监听 `session/event`（并以实时会话日志的权威折叠作为兜底）在整个等待期间将会话置为 `asking` 状态，收到 `approval/decided` 后清除。
- 浏览器脚本每秒轮询 `/dsh-web-icon-status.json`，首次获取 `base.svg`，然后每个 `requestAnimationFrame` 周期把 favicon 重建为 `data:image/svg+xml,…` URI——把 `__COLOR__` 占位符替换为状态配置的颜色，并应用该状态配置的特效。状态响应还会携带当前的每状态视觉配置，因此设置保存后约 1 秒内（下一个轮询 tick）即同步到已打开的标签页，无需刷新。浏览器不会播放 SVG favicon 的 CSS 动画，所以一切动画都由 JS 驱动。由于浏览器在**隐藏（后台）标签页会暂停 `requestAnimationFrame`**，轮询还会为动画态补绘一帧按墙钟时间计算的画面——后台标签页保持粗粒度动画（约每 1 秒）而不会冻结，切回前台后恢复满速动画。轮询还能**扛住 host 重启**：瞬时请求失败时先还原原始图标，并在下一个 tick 重试（SPA 原地重连，无需手动刷新图标即可恢复）。

## 已知限制

- favicon 的 SVG CSS 动画在浏览器标签页 UI 中不会运行——所有特效都由 JavaScript 每帧重建 data-URI 实现，这是零依赖设计的刻意取舍。
- `base.svg` 模板必须保留 `#p { fill: … }` 规则中的 `__COLOR__` 占位符；浏览器会替换该标记为每帧上色。
- 插件运行在 **host** 平面，必须挂载进 profile 的组合配置，不能作为会话级 agent preset。
- 文件读取走 `fs` 服务，以配置的 `iconsDir` 为 `cwd`。请确保该路径在部署环境的沙箱策略下可读。

## 许可

MIT