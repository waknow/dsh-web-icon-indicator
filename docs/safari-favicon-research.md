# Safari favicon 机制研究：动态更换与 SVG 动态变色可行性

> **目的**：判断能否在 Safari 里为浏览器标签页 favicon 做「动态更换」，以及能否实现「SVG 动态变色」；
> 结论用于指导 [`dsh-web-icon-indicator`](../README.md) 的下一步实现。
>
> **资料截至** Safari 26.3（2026）。文末列出来源。文中涉及本插件的句子，均以 `lib/index.js` 当前实现为准。

## 1. 结论速览

| 问题 | 结论 |
| --- | --- |
| Safari 能否渲染 SVG favicon？ | ✅ 能，但**只当作静态图片**，完全忽略 SVG 内部的 CSS |
| 能否「动态更换」favicon（JS 改 link）？ | ⚠️ 能，但**只算尽力而为**——实时性、确定性都不保证 |
| 能否实现「SVG 动态变色」？ | 不能靠 CSS（currentColor / 变量 / media query）；只能**每个状态生成一份新 SVG 再切换** |
| 本插件当前用的 `data:` URI 在 Safari？ | ❌ 不可靠（WebKit bug 236616 未关闭） |
| Safari 原生的「动态颜色」机制 | `<link rel="mask-icon">`——仅 macOS 固定标签页、单色剪影、有独立缓存 |

一句话结论：**Chrome / Firefox / Edge 能顺滑做到逐帧换色；Safari 只能「外部 SVG + cache-busting + 重建 `<link>` 节点 + no-store」尽力做到，且常常要刷新一次才生效。** 这是浏览器层面的硬限制，插件无法完全绕开。

## 2. Safari 的 favicon 机制（关键点）

### 2.1 favicon 有独立于 HTTP 缓存的「专属缓存」，Safari 是系统级图标缓存

- **Chrome**：独立的 favicon 数据库（清缓存、强刷、重启都可能清不掉）。
- **Firefox**：`favicons.sqlite`，绑在历史记录条目上。
- **Safari**：**系统级图标缓存（system-level icon cache）**。

这意味着「改了 favicon 但老标签页不更新」是常态，绝非巧合。更糟的是 WebKit 会**缓存「这个网站没有 favicon」这一事实本身**，以避免每次加载都去探测——见 [WebKit bug 7069](https://www2.webkit.org/show_bug.cgi?id=7069)。

所以正确的刷新手段不是清缓存，而是**改变 favicon 的 URL**（cache-busting），比如加上 `?v=<签名>`。

### 2.2 Safari 能渲染 SVG favicon，但忽略其内部所有 CSS

现代 Safari 支持一个真实的 `.svg` favicon 文件（`type="image/svg+xml"`），但把它当**普通图片光栅化**：

- 不支持里面的 `@media`、`prefers-color-scheme`、CSS 动画。
- 已确证：[WebKit bug 309949《SVG favicons don't respect media query overrides, notably for dark mode》](https://www2.webkit.org/show_bug.cgi?id=309949)，**状态 NEW，作者注明「Safari 26.3 复现」**——Safari 只渲染基础（浅色）版本。
- [pawelgrzybek.com](https://pawelgrzybek.com/svg-favicons-that-respect-theme-preference/)（2026-03）实测：Chrome 会处理 favicon 里的 media query（但要刷新才生效），Firefox 表现最好，**Safari 完全忽略**。

> ⚠️ 结论：**永远不要指望用 SVG 里的 `currentColor` / CSS 变量 / media query / 内嵌动画来给 favicon 变色。** favicon 本质是图片，Safari 连它内部的 CSS 都不跑。这也印证了本插件注释里那句「favicons 不播 SVG CSS 动画，一切 motion 必须由 JS 生成」是对的。

### 2.3 `data:` 形式的 SVG favicon 在 Safari 不可靠（很可能完全不显示）

[WebKit bug 236616《Data URI favicon doesn't seem to work》](https://www2.webkit.org/show_bug.cgi?id=236616) 至今 **NEW**，评论区明确说 **macOS 14.6.1 / Safari 17.6 仍不工作**，且用的就是 `data:` URI 的 SVG；还有「可能是 Safari 15.3 回归」的怀疑。

> ⚠️ **这直接命中本插件的软肋**：`lib/index.js` 的 `frameUri()` 每一帧都生成 `data:image/svg+xml,…`。在 Chrome/Firefox 没问题，但在 **Safari 里整个图标可能都不显示**。这是「要改」的首要问题。

### 2.4 动态更换（JS 改 `<link rel=icon>`）的真实表现

跨浏览器通用手法：
1. **给 URL 加 cache-busting 参数**（`?v=<epoch>`）——改变 URL 即绕过专属 favicon 缓存，Safari 也会重新拉取。
2. **用 JS 替换 / 重建 `<link>` 节点**（有些浏览器只在页面加载时读一次）——本插件已有 `setHrefFresh()` 做 `replaceChild`，方向正确。
3. 给 favicon 资源加 `Cache-Control: no-store`。

**但 Safari 是最不配合的**：[SO 79637210](https://stackoverflow.com/questions/79637210) 明确说「动态 JS 更新在 Safari 里是 hit-or-miss，尤其在 reload 或已缓存的情况下」，「Safari 会锁定最初那个版本，强刷都不一定换」，并给出结论：**「目前没有一个完全可靠、符合规范的方式来动态改 Safari 的 favicon。」** iOS Safari 更糟（常常要重新导航）。

### 2.5 Safari 原生的「动态颜色」机制：`mask-icon`（固定标签页）

`<link rel="mask-icon" href="…svg" color="#…">` 用于 macOS 的 **Pinned Tab（固定标签页）**，是 Safari 唯一允许你「不改 SVG、只改颜色」的机制——用 `color` 属性直接指定单色。但它限制很多：

- 仅 **macOS**，不支持 iOS。
- 仅 **固定 / 置顶标签页**；普通标签页不适用。
- **纯单色剪影**：浏览器把 SVG 当黑色 mask 用，不支持全彩。
- **有自己独立的缓存**（[dev.to](https://dev.to/jamiepark-design/how-browsers-actually-load-favicons-and-why-yours-wont-update-172c)）：它跟普通 favicon 分开缓存，改掉 URL 也要加 `?v=` 才会刷新。
- `color` 在**页面加载时**读取；JS 运行时改属性**不一定重绘**。

所以它适合「每个页面加载设一次单色」，**不适合按帧 / 按状态实时驱动**。可作补充，不可作主方案。

### 2.6 图标选择与 ICO 偏好

[WebKit bug 315573《Handle favicon, apple-touch-icon and web manifest icons correctly for pixel-perfect rendering》](https://www2.webkit.org/show_bug.cgi?id=315573)（**NEW，2026-05 更新**）说明：

- **Safari 的 UI 进程**才真正决定为某个用途（标签页 favicon / web clip / Web 应用）下载哪一个图标条目。
- 排序完全按**静态元数据**（`LinkIconType`、声明的 `sizes`、是否 precomposed），**不看** `devicePixelRatio` 或渲染目标。
- 存在「Favicon: prefers ICO, picks largest entry」的怪癖：一个多尺寸的 `.ico` 可能被当成 16px 的小图标，让同尺寸的 32×32 PNG 反而胜出。

## 3. 可行性矩阵（各浏览器）

| 浏览器 | SVG favicon | 逐帧换色 / 换特效 | 动态更新可靠性 | 关键约束 |
| --- | --- | --- | --- | --- |
| Chrome / Edge | ✅ | ✅ 顺滑 | ✅ 高 | 每次改 href 都实时重绘；`data:` URI 可用 |
| Firefox | ✅ | ✅ 顺滑 | ✅ 高 | 对 SVG favicon 的 `prefers-color-scheme` 处理最好（本插件未用） |
| Safari（macOS） | ✅ 静态 | ⚠️ 尽力而为 | ⚠️ 中低 | 忽略内嵌 CSS；`data:` URI 不可靠；顽固缓存 |
| Safari（iOS） | ✅ 静态 | ❌ 基本不可靠 | ❌ 低 | 通常需重新访问 / 重新添加到主屏 |

## 4. 对本插件的落地建议

1. **首选改动：把每帧的 `data:image/svg+xml` 换成 Safari 更认的载体**，按可靠性排序：
   - **Blob URL**：`URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))` —— 每状态一个「外部」URL，既避开 `data:` 限制，又不用每帧打网络请求，比 `data:` 更容易被 Safari 当 favicon 处理。（公开资料**未查到 Safari 对 `blob:` favicon 的 100% 确认**，需真机验证。）
   - **真 `.svg` URL + `?color=…&v=…`**：让服务端按 color 返回 SVG（需要新增路由），href 指向真实 URL 并 cache-busting。缺点：动画每帧要发请求；或退而求其次，生成**有限个预置颜色变体**（不像 60fps 那么贵）。
2. **保留现有抗性措施**：`setHrefFresh()`（替换 `<link>` 节点）、`Cache-Control: no-store`、状态请求与 base.svg 请求都带 freshness 查询参数（`?t=`）——这些都已在 `lib/index.js` 里。
3. **可选补充 `mask-icon`** 覆盖 macOS 固定标签页：`<link rel="mask-icon" href="/…/whale.svg?v=…" color="#FACC15">`。但接受它「macOS 限定、单色剪影、固定标签、加载时读一次颜色、独立缓存」的局限。
4. **设好预期**：Chrome/Firefox/Edge 实时顺滑；**Safari 上「能变色、但可能要刷新一次」**。文档要把这层限制讲清楚，避免用户误以为 Safari 也能像 Chrome 一样逐帧实时。

## 5. 浏览器支持与局限汇总（写入 README 的部分）

- **favicon 有专属缓存**：Chrome favicon 数据库、Firefox `favicons.sqlite`、**Safari 系统级图标缓存**，清普通缓存清不掉；WebKit 连「无图标」状态都缓存。插件已用「`no-store` + 每帧新鲜 query + 重建 `<link>`」缓解。
- **Safari 渲染 SVG 但不跑其 CSS**：无 `@media` / `prefers-color-scheme` / CSS 动画，所有上色必须在每帧标记里烘焙。
- **`data:` URI 的 SVG favicon 在 Safari 不可靠**（WebKit bug 236616）：插件目前每帧都用 `data:` URI，Safari 上可能不显示——最大已知缺口。
- **Safari 动态 JS 更新为 hit-or-miss**，可能需要刷新；没有保证可靠的规范级手段。
- **`mask-icon`（固定标签）独立缓存**、单色剪影、macOS 限定、加载时读一次颜色、非实时。

## 6. 参考来源

| 来源 | 要点 | 日期/状态 |
| --- | --- | --- |
| [WebKit bug 236616 — Data URI favicon doesn't seem to work](https://www2.webkit.org/show_bug.cgi?id=236616) | `data:` URI favicon（含 SVG）不可用；Safari 17.6 仍复现 | **NEW** |
| [WebKit bug 309949 — SVG favicons don't respect media query overrides](https://www2.webkit.org/show_bug.cgi?id=309949) | Safari 渲染 SVG favicon 但忽略其内嵌 CSS / media query | **NEW**，Safari 26.3 复现 |
| [WebKit bug 315573 — favicon / apple-touch-icon / manifest 选择](https://www2.webkit.org/show_bug.cgi?id=315573) | Safari UI 进程决定取哪个图标；按静态元数据排序；ICO 偏好怪癖 | **NEW**，2026-05 |
| [WebKit bug 7069 — favicon 缓存与「无图标」状态缓存](https://www2.webkit.org/show_bug.cgi?id=7069) | WebKit 缓存旧图标，甚至缓存「无图标」事实以省去探测开销 | RESOLVED/DUPLICATE |
| [dev.to — How Browsers Actually Load Favicons](https://dev.to/jamiepark-design/how-browsers-actually-load-favicons-and-why-yours-wont-update-172c) | 各浏览器专属 favicon 缓存；version-busting `?v=` 技巧；mask-icon 有独立缓存 | 2026-06-23 |
| [pawelgrzybek.com — SVG favicons that respect theme preference](https://pawelgrzybek.com/svg-favicons-that-respect-theme-preference/) | Chrome/Firefox/Safari 三款对 SVG favicon + media query 的对比 | 2026-03-14 |
| [SO 79637210 — Safari 动态切换 dark/light favicon](https://stackoverflow.com/questions/79637210) | Safari 不支持 link 上的 media query；动态 JS 更新 hit-or-miss；「锁定」首个图标 | 近期 |
| [nesin.io — Fix Safari showing old favicon](https://nesin.io/blog/fix-safari-showing-old-favicon-issue) | Safari 激进缓存 favicon；cache-busting `?v=x.x` 或改文件名 | 2023-05 |
