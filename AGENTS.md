# media-location 工作约定

## 项目默认要求

- 默认使用简体中文沟通；代码标识符使用英文。
- 前端业务状态按功能聚合到具名 `xxxModel`，避免零散响应式状态。
- 样式使用 SCSS；工具型界面优先信息密度、稳定布局和清晰反馈。
- 真实 bug 先确认根因，再补测试和实现；完成前必须跑对应测试/构建验证。

## 稳定版经验

### 大目录媒体加载

- 触发信号：文件夹内有几万张照片或很多视频，切换目录后页面卡死。
- 根因 / 约束：服务端全量构建媒体项会解析大量 GPS/XMP，前端全量渲染卡片和 video 控件会占满主线程。
- 正确做法：服务端使用 `scanMediaDirectoryPage` 先按文件名过滤和分页，再构建当前页媒体项；前端只渲染已加载页；工作台内视频只显示轻量缩略图/占位，不创建 `<video>`，播放统一用新标签页打开原视频。
- 验证方式：运行 `npm test -- media.test.ts`，并在大目录中确认首屏可交互、加载更多按页追加。
- 适用范围：所有媒体浏览、过滤、地图标记渲染相关改动。

### XMP 侧车匹配

- 触发信号：媒体文件名带设备生成的点号后缀，例如 `VID_...pano.motion.mp4`，但已有 XMP 是 `VID_...mp4.xmp`。
- 根因 / 约束：严格 `完整媒体文件名 + .xmp` 会漏读设备生成的兼容 XMP；但过宽的模糊搜索又可能误匹配同目录相似文件，尤其是 `A.foo.bar.mp4` 抢占真实存在的 `A.foo.mp4` 的 `A.foo.mp4.xmp`。
- 正确做法：精确 sidecar 永远优先；精确不存在时，按点号从右往左逐级剥离最终扩展名前的后缀，依次尝试 `A.foo.bar.mp4.xmp`、`A.foo.mp4.xmp`、`A.mp4.xmp`；采用任一剥离候选前，先检查对应媒体文件如 `A.foo.mp4` 是否真实存在，存在则跳过该候选；写入时优先更新已存在且未被真实媒体占用的候选，没有候选才创建精确 sidecar。
- 验证方式：运行 `npm test -- media.test.ts routes.test.ts`，覆盖扫描读取、`/media/set-gps` 写入既有 fallback XMP，以及真实媒体存在时不抢占其 sidecar。
- 适用范围：所有 XMP 读取、写入和媒体扫描逻辑。

### 工作台浮层布局

- 触发信号：目录面板太矮、媒体瀑布流出现横向滚动条，或收起某个面板后剩余面板没有占满空间。
- 根因 / 约束：目录和媒体面板共享同一个固定浮层，展开/收起状态必须由外层 grid 统一分配高度；媒体瀑布流必须限制子元素宽度，避免 Element Plus scrollbar 生成横向滚动。
- 正确做法：两个面板都展开时 `stack-column` 使用 50/50；媒体收起时目录使用剩余高度；目录收起时媒体使用剩余高度；都收起时只保留自然 header 高度。媒体滚动区显式 `overflow-x: hidden`，卡片、封面和视频都要有 `max-width: 100%`。
- 验证方式：运行 `npm run build` 和 `npx vue-tsc --noEmit --skipLibCheck --noImplicitAny false`，并手动检查展开/收起组合与媒体瀑布流。
- 适用范围：`App.vue` 浮层布局、`MediaTable.vue` 和 `styles.scss` 中媒体/目录面板样式。

### 视频播放隔离

- 触发信号：列表或地图内嵌播放视频导致页面卡死、黑闪、崩溃，尤其是视频很多或单视频很大时。
- 根因 / 约束：工作台主页面承担地图、媒体瀑布流、拖拽和写坐标，内嵌 `<video>` 会触发浏览器解码/元数据读取，占用主线程和内存；过去能看到视频画面是浏览器 `<video>` 自己解码的结果，移除内嵌播放后必须由后端生成真实视频画面缩略图；黑底 `VIDEO` 只能是最终兜底，不是用户期望的缩略图。
- 正确做法：设置页不暴露视频内容加载开关；`MediaTable.vue` 和 `MapPanel.vue` 不创建 `<video>`；图片和视频缩略图统一由 `/api/media/thumbnail` 生成 JPEG：优先读取内嵌 thumbnail，读取不到时通过随包的 `@ffmpeg-installer/ffmpeg` 按原比例生成最大 640px 的 JPEG 并缓存；不再引入 sharp，不能同时维护两套图片运行时，也不能依赖用户电脑预装 ffmpeg；pkg assets 必须包含 `node_modules/@ffmpeg-installer/ffmpeg/**/*` 和对应平台二进制目录；服务端缩略图代码禁止 `await import('@ffmpeg-installer/ffmpeg')`，pkg 的 CJS snapshot 会报 `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`，应使用静态 import 让构建产物生成 `require("@ffmpeg-installer/ffmpeg")`；列表视频封面区域本身不能是播放链接，只允许右下角“新标签播放”按钮打开 `/api/media/file`；地图视频标记展开后显示“播放”入口，所有视频播放统一通过 `/api/media/file` 在新标签页打开。
- 验证方式：运行 `npm test -- thumbnails.test.ts video-loading-policy.test.ts package-config.test.ts map-marker-media.test.ts`、`npx vue-tsc --noEmit --skipLibCheck --noImplicitAny false` 和 `npm run build`，并手动检查列表/地图源码和页面都不内嵌播放视频，`package.json` 不包含 sharp。
- 适用范围：`server/src/thumbnails.ts`、`MapPanel.vue`、`MediaTable.vue`、`SettingsPanel.vue`、`package.json`、视频播放设置和地图/媒体性能相关改动。

### 媒体卡片交互边界

- 触发信号：点击媒体卡片名称需要复制文件名，或拖拽媒体时整张卡片都出现抓取态、容易误触发拖拽。
- 根因 / 约束：媒体卡片同时承担选择、拖拽、复制、固定和手动定位等操作；如果把 `draggable` 挂在整张卡片上，会和卡片点击、文件名复制、按钮点击互相抢事件。
- 正确做法：`el-card.media-card` 只负责点击选择；缩略图容器 `.preview-frame` 才设置 `draggable="true"` 并触发 `dragStart`；文件名用按钮语义，点击复制 `item.name`（带后缀），并阻止冒泡。
- 验证方式：运行 `npm test -- media-card-interaction.test.ts`，确认整卡不包含 `draggable` / `@dragstart`，缩略图区包含拖拽事件，文件名控件包含复制成功提示。
- 适用范围：`MediaTable.vue`、媒体卡片样式和媒体列表交互相关改动。

### Tailscale / 外网剪贴板

- 触发信号：通过 Tailscale 或非 localhost 的 HTTP 地址访问时，点击地图复制坐标提示失败。
- 根因 / 约束：`navigator.clipboard.writeText` 需要安全上下文，非 HTTPS/非 localhost 往往会被浏览器拒绝。
- 正确做法：先判断 `window.isSecureContext`，失败或不可用时走隐藏 textarea + `document.execCommand('copy')` 兜底，并通过 `/api/client-log` 记录浏览器环境和错误详情。
- 验证方式：运行 `npm test -- routes.test.ts`，并在浏览器控制台或 `/console` 日志中查看 `copy:clipboard` / `copy:clipboard-fallback`。
- 适用范围：所有浏览器剪贴板写入操作。

### 后台日志

- 触发信号：用户反馈读取、修改、写入失败但控制台没有有效错误。
- 根因 / 约束：打包为 GUI 子系统后不再显示 cmd，运行错误必须落盘；但正常打开 `/api/media/file` 这种媒体访问流水价值低，会淹没真正故障。
- 正确做法：使用 `server/src/operationLog.ts` 写 JSONL；默认写到当前工作目录 `logs/`，测试或特殊部署可设置 `MEDIA_LOCATION_LOG_DIR`；启动时和写日志时清理三天前日志；不要记录正常媒体文件读取流水；缩略图失败必须记录 `thumbnail:ffmpeg`，包含 `phase`、`packaged`、`ffmpegPath` / `sourcePath` / `targetPath`、参数和底层错误，避免只返回 “No embedded thumbnail found.”。
- 验证方式：运行 `npm test -- operation-log.test.ts routes.test.ts`，并访问 `/console` 检查日志读取和复制。
- 适用范围：所有后端 API 的读取、修改、写入、客户端诊断和启动异常。

### Windows GUI 打包

- 触发信号：双击 exe 出现 cmd 命令行窗口，不符合桌面后台体验。
- 根因 / 约束：pkg 生成的是 Console 子系统 PE 文件。
- 正确做法：`npm run package:win` 后执行 `scripts/windows-subsystem.cjs`，把 PE Optional Header 的 Subsystem 从 Console 改成 Windows GUI；打包运行时默认打开 `/console`，网页工作台 `/` 保持不变；控制台页打开工作台必须用新标签，并提供关闭后台程序入口；确认关闭成功后尝试 `window.close()` 关闭控制台页，若浏览器拦截则提示用户手动关闭。
- 验证方式：运行 `npm test -- windows-subsystem.test.ts console-page.test.ts routes.test.ts`，打包后双击 exe 检查是否打开本地后台页、工作台是否新标签打开、关闭按钮是否结束后台。
- 适用范围：Windows 发布包和启动体验相关改动。

### Windows 打包体积控制

- 触发信号：用户说“打包”“发布”“exe 太大”“再打个包”，或 `dist/media-location.exe` 明显超过 100MB。
- 根因 / 约束：`pkg --config package.json` 会读取根 `dependencies`，如果 `vue`、`element-plus`、`@element-plus/icons-vue`、`lucide-vue-next` 等前端构建期依赖留在 `dependencies`，会被误当运行时依赖塞进 exe；前端运行时实际只需要 `dist/client` 静态资源。FFmpeg 是视频/无内嵌图缩略图能力的运行时二进制，不要为了瘦身直接删除，除非用户明确接受视频缩略图降级。
- 正确做法：打包前先分析 `package.json`，服务端运行依赖保留在 `dependencies`，前端构建依赖放到 `devDependencies`；`pkg.assets` 只带 `dist/client/index.html`、`dist/client/assets/**/*`、`node_modules/@ffmpeg-installer/ffmpeg/**/*` 和当前平台二进制目录；`package:win` 可使用 `--compress Brotli` 无损压缩 pkg 内资源，再执行 `scripts/windows-subsystem.cjs`。不要把临时 `pkg-analysis-*.exe` 当发布包。
- 验证方式：先运行 `npm run build` 和相关测试，再运行 `npm run package:win`；打包后记录 `dist/media-location.exe` 体积，并复制到临时空目录或使用独立配置端口做烟测：`/api/health` 返回 200、`/` 返回 HTML、`/api/shutdown` 返回 200；若涉及视频缩略图，还要检查 `/api/media/thumbnail` 能触发 FFmpeg 缩略图。
- 适用范围：`package.json`、`package-lock.json`、`server/src/thumbnails.ts`、`scripts/windows-subsystem.cjs`、Windows 发布包和打包体积相关改动。
- 可直接使用的提示词：

```text
风宝，帮我重新打 Windows 发布包并控制体积。请先读 AGENTS.md，检查 package.json 的依赖分类：Vue、Element Plus、lucide 等前端构建依赖不要留在 dependencies 里，避免 pkg 误打进 exe；服务端运行依赖和 FFmpeg 缩略图能力要保留。打包时优先使用 pkg 的 Brotli 压缩，并继续执行 windows-subsystem.cjs 改成 GUI 子系统。完成后运行测试/构建/打包，记录 exe 体积，再用独立端口做烟测：/api/health、/、/api/shutdown 都要通过；如果改到缩略图，额外验证 FFmpeg 缩略图路径。只提交本次打包相关改动，提交信息用中文 conventional commit。
```
