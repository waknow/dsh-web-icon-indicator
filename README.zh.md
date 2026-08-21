# dsh-web-icon-indicator

> 📖 [English](README.md) · [中文文档](README.zh.md)

浏览器标签页 favicon 实时反映 DSH 会话状态——`待机` / `运行中` / `提问` / `完成`——让你在标签页置于后台时也能一眼看出是否有会话需要处理。

## ✨ 功能特性

- **标签页 favicon 实时反映会话状态** —— 浏览器标签页图标同步 `idle` / `running` / `asking` / `done`（聚合优先级：`asking` > `running` > `done` > `idle`），后台标签页也能一眼看清 agent 们在做什么——包括 `ask_user_question` 提问，以及审批 / 沙箱提权等待（这两种情况会把图标钉在 `asking` 态）。
- **单个 SVG，浏览器内上色与动画** —— 只内置一个鲸鱼模板（[`icons/base.svg`](./icons/base.svg)）；每个状态、颜色、每一帧都在客户端渲染为 `data:image/svg+xml` URI，不再有按颜色拆分的图标文件。
- **六种内置特效** —— `static`（静止）、`blink`（闪烁）、`breath`（呼吸）、`rainbow`（彩虹）、`heartbeat`（心跳）、`bounce`（跳动），全部由 JavaScript 驱动（favicon 不会播放 SVG CSS 动画）。
- **完全可配置、即时生效** —— 每个状态的颜色、特效、周期都可在 DSH 设置页编辑（`web-icon-indicator` 命名空间）；改动约 1 秒内同步到已打开的标签页——无需刷新、无需重启。
- **后台标签页与重启抗性** —— 隐藏标签页中 `requestAnimationFrame` 被暂停时，动画态会按墙钟时间补帧；状态轮询还能扛住 host 重启，图标自动恢复。

## 🎬 默认配置，可视化

四个默认状态在浏览器标签页中的实际效果（`asking` 那条鲸鱼真的在闪烁）：

<p align="center">
  <img src="assets/states-default.svg" width="420" alt="默认状态：idle 深色鲸鱼、running 黄色、asking 红/黄闪烁、done 绿色">
</p>

| 状态 | 颜色（默认） | 特效（默认） |
| --- | --- | --- |
| `idle` 待机 | `#1a1a1a`——深色鲸鱼 | `static` |
| `running` 运行中 | `#FACC15`——黄色 | `static` |
| `asking` 提问 | `#E5484D` ⇄ `#FACC15`——红/黄 | `blink`（400ms） |
| `done` 完成 | `#22A06B`——绿色 | `static`，保持 `doneHoldMs` 后回到 `idle` |

## ✨ 全部特效，动画演示

下面每个预览都是真实的鲸鱼路径，按插件实际渲染方式做动画（预览是自包含的动画 SVG，在浏览器里直接播放）：

| 特效 | 效果 | 预览 |
| --- | --- | --- |
| `static` | 纯色单帧，无动画——使用 `colors[0]` | <img src="assets/effects/static.svg" width="56" alt="static 特效预览"> |
| `blink` | 在 `colors[0]` ⇄ `colors[1]` 之间按 `speed` 切换（缺省时自动推导更深的第二色） | <img src="assets/effects/blink.svg" width="56" alt="blink 特效预览"> |
| `breath` | 在 `colors[0]` 与 `colors[1]` 之间平滑呼吸过渡（缺省时推导） | <img src="assets/effects/breath.svg" width="56" alt="breath 特效预览"> |
| `rainbow` | 以 `colors[0]` 为起始色相，在 `speed` 内绕色轮循环 | <img src="assets/effects/rainbow.svg" width="56" alt="rainbow 特效预览"> |
| `heartbeat` | 在 `speed` 内做「lub-dub」式的尖锐缩放脉冲——颜色为 `colors[0]` | <img src="assets/effects/heartbeat.svg" width="56" alt="heartbeat 特效预览"> |
| `bounce` | 鲸鱼在 `speed` 内上下跳动——颜色为 `colors[0]` | <img src="assets/effects/bounce.svg" width="56" alt="bounce 特效预览"> |

想改颜色并实时观察标签页 favicon 变化？打开自包含 demo（[`demo/dynamic-color.html`](./demo/dynamic-color.html)）——选择状态 + 特效并实时改色，favicon 即时更新（无构建、无依赖）。

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

- favicon 的 SVG CSS 动画在浏览器标签页 UI 中不会运行——所有特效都由 JavaScript 每帧重建 data-URI 实现，这是零依赖设计的刻意取舍。（本文档中的动画预览只是演示素材——真实 favicon 的动画始终由 JS 驱动。）
- `base.svg` 模板必须保留 `#p { fill: … }` 规则中的 `__COLOR__` 占位符；浏览器会替换该标记为每帧上色。
- 插件运行在 **host** 平面，必须挂载进 profile 的组合配置，不能作为会话级 agent preset。
- 文件读取走 `fs` 服务，以配置的 `iconsDir` 为 `cwd`。请确保该路径在部署环境的沙箱策略下可读。

## 许可

MIT
