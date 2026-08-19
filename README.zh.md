# dsh-web-icon-indicator

> 📖 [English](README.md) · [中文文档](README.zh.md)

浏览器标签页 favicon 实时反映 DSH 会话状态——待机 / 运行中 / 提问 / 完成——让你在标签页置于后台时也能一眼看出是否有会话需要处理。

## 状态

| 状态 | 预览 | 图标 | 动画 |
| --- | --- | --- | --- |
| `idle` 待机 | ![idle](icons/idle.svg) | 原始 DeepSeek 鲸鱼（默认 favicon） | — |
| `running` 运行中 | ![running](icons/running.svg) | 黄色鲸鱼 | 静态 |
| `asking` 提问 | ![asking](icons/asking.svg) | 黄色 ⇄ 红色 | 400ms 闪烁 |
| `done` 完成 | ![done](icons/done.svg) | 绿色鲸鱼 | 保持 5 秒后回到待机 |

四个状态图标位于包内 `icons/` 目录。你可以随时替换它们——插件每次请求都会重新读取，浏览器下次轮询就生效。

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
| `iconsDir` | `<package>/icons/` | 四个 `*.svg` 文件所在目录 |
| `statusPath` | `/dsh-web-icon-status.json` | JSON 状态端点 |
| `iconPathPrefix` | `/dsh-web-icon-indicator` | 四个 SVG 的 URL 前缀 |
| `askingHoldMs` | `3500` | 提问图标的最小保持时长 |
| `askingBlinkMs` | `400` | 黄红闪烁间隔 |
| `doneHoldMs` | `5000` | 完成图标保持时长 |

在组合行中覆盖：

```yaml
- id: dsh-web-icon-indicator
  name: 'dsh-web-icon-indicator'
  config:
    askingBlinkMs: 320
    doneHoldMs: 4000
```

## 实现原理

- Host-only 插件：在现有 `webServer` 上注册三个路由（状态 JSON、`/dsh-web-icon-indicator/*.svg`，以及一个 `tapIndex` 向每个 `index.html` 注入小段浏览器脚本）。
- 状态按 `agents.list()` 聚合，优先级 `asking > running > done > idle`。每次请求都会执行一次 `reconcile()` 检测 running → idle 的转换，因为 `agent/status` 的 idle 事件在回合结束时并不保证送达。
- `ask_user_question` 工具调用（通过 `tools/pre-execute` / `tools/result`）把会话置为 `asking`，带可配置的最小保持时长，即使你立刻回答，图标也会保持可见。
- 浏览器脚本每秒轮询 `/dsh-web-icon-status.json`，把 `<link rel="icon">` 的 `href` 设为 `data:image/svg+xml,…` URI。浏览器不会播放 SVG favicon 的 CSS 动画，所以四个图标是静态 SVG，`asking` 的闪烁由脚本每 `askingBlinkMs` 交换黄红两帧实现。

## 已知限制

- favicon 的 SVG CSS 动画在浏览器标签页 UI 中不会运行——四个内置图标因此是静态的。直接用浏览器打开 SVG 文件可以看到完整设计。
- 插件运行在 **host** 平面，必须挂载进 profile 的组合配置，不能作为会话级 agent preset。
- 文件读取走 `fs` 服务，以配置的 `iconsDir` 为 `cwd`。请确保该路径在部署环境的沙箱策略下可读。

## 许可

MIT